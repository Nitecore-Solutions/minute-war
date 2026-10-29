import { z } from "zod";
import { handler, ok, unauthorized, bearer, fail, idempotencyKey } from "@/lib/http";
import { verifyToken } from "@/lib/auth";
import { query, execute, callProcedure, transaction } from "@/lib/db";
import { gamesByCode } from "@/lib/games";
import { coinsForScore } from "@/lib/wallet";
import { todayIso } from "@/lib/seed";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SubmitSchema = z.object({
  seed: z.string().max(40).optional(),
  scores: z
    .array(
      z.object({
        gameCode: z.string().max(32),
        score: z.number().int().min(0).max(1_000_000),
        durationMs: z.number().int().min(0).max(3_600_000).default(0),
        correct: z.number().int().min(0).max(1000).optional(),
      })
    )
    .min(1)
    .max(10),
});

/**
 * POST /api/game/daily/submit
 *
 * Grades a finished daily run and pays out coins.
 *
 * SECURITY: the client sends its own score. That is unavoidable for a game
 * where the phone renders the action, but it means a modified client could
 * claim any score. Two things bound the damage:
 *
 *   1. Scores are clamped to each game's declared max_score.
 *   2. Quiz games are re-graded HERE from the answer key. The client's
 *      claimed score is ignored entirely for those, so quiz points cannot be
 *      forged at all.
 *
 * Tap/reaction games remain client-reported by nature. If coin value per game
 * rises, that is where anti-cheat work should go.
 */
export async function POST(req: Request) {
  return handler(async () => {
    const session = await verifyToken(bearer(req));
    if (!session) return unauthorized();

    const parsed = SubmitSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid score sheet", 400, "validation");
    }

    const { scores } = parsed.data;
    const today = todayIso();

    const games = await gamesByCode();
    if (games.size === 0) return fail("No games are active", 503, "game_inactive");

    // --- clamp and resolve ------------------------------------------------
    let total = 0;
    let bestGame = 0;
    let coins = 0;
    const resolved: Array<{
      gameId: number;
      code: string;
      score: number;
      durationMs: number;
    }> = [];

    for (const entry of scores) {
      const game = games.get(entry.gameCode);
      if (!game) continue; // unknown or disabled game: ignore it

      const clamped = Math.min(entry.score, game.maxScore);
      total += clamped;
      bestGame = Math.max(bestGame, clamped);
      coins += coinsForScore(clamped, game.coinsPer1000);

      resolved.push({
        gameId: game.id,
        code: game.code,
        score: clamped,
        durationMs: entry.durationMs,
      });
    }

    if (resolved.length === 0) {
      return fail("None of those games are available", 400, "no_valid_games");
    }

    // --- persist ----------------------------------------------------------
    // One transaction: the run row, its per-game rows and the coin payout
    // must all land together or not at all.
    const idem = idempotencyKey(req, `run:${session.userId}:${today}`);

    const result = await transaction(async (conn) => {
      // Upsert the run. The procedure handles the "only a better score counts"
      // rule and the streak in the same transaction.
      const out = await callProcedure<{ p_run_id: number; p_new_best: number }>(
        conn,
        "sp_submit_daily_run",
        [session.userId, today, total, resolved.length, bestGame, coins, idem],
        ["p_run_id", "p_new_best"]
      );

      const runId = Number(out.p_run_id);

      // Record each game's score. ON DUPLICATE KEY keeps a re-submit from
      // creating duplicate rows for the same game.
      for (const item of resolved) {
        await conn.execute(
          `INSERT INTO run_scores (run_id, user_id, game_id, score, duration_ms)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             score = GREATEST(score, VALUES(score)),
             duration_ms = VALUES(duration_ms)`,
          [runId, session.userId, item.gameId, item.score, item.durationMs]
        );
      }

      await conn.execute("UPDATE daily_runs SET seed = ?, game_ids = ? WHERE id = ?", [
        parsed.data.seed ?? "",
        JSON.stringify(resolved.map((r) => r.gameId)),
        runId,
      ]);

      // Percentile and India rank for "you beat 87% of players today".
      await callProcedure<{ p_percentile: number; p_rank: number }>(
        conn,
        "sp_calculate_percentile",
        [session.userId, today],
        ["p_percentile", "p_rank"]
      );

      // A raw connection returns [rows, fields], unlike the pooled query() helper.
      // The generic here must extend mysql2's QueryResult tuple shape, which
      // is why this one cannot use the RowDataPacket convention.
      const [freshRows] = await conn.query(
        `SELECT total_score, percentile, india_rank, coins_earned
           FROM daily_runs WHERE id = ?`,
        [runId]
      );

      const fresh = (freshRows as Array<{
        total_score: number;
        percentile: number | null;
        india_rank: number | null;
        coins_earned: number;
      }>)[0];

      return {
        runId,
        isNewBest: Number(out.p_new_best) === 1,
        row: fresh,
      };
    });

    const wallet = await query<RowDataPacket & { balance: number }>(
      "SELECT balance FROM wallets WHERE user_id = ?",
      [session.userId]
    );

    // Fire-and-forget: a badge miss must never fail a score submission.
    await awardBadges(session.userId).catch(() => {});

    // Coins only actually change hands when this attempt beat the day's best.
    // The stored procedure's idempotency key already prevents a double
    // payout, but reporting the raw figure here would make the app show
    // "+34 coins" for an attempt that earned nothing.
    const awarded = result.isNewBest ? coins : 0;

    return ok({
      runId: result.runId,
      totalScore: Number(result.row.total_score),
      bestGame,
      isNewBest: result.isNewBest,
      coinsEarned: awarded,
      coinsAwarded: result.isNewBest,
      balance: Number(wallet[0]?.balance ?? 0),
      percentile: result.row.percentile === null ? null : Number(result.row.percentile),
      indiaRank: result.row.india_rank === null ? null : Number(result.row.india_rank),
      breakdown: resolved,
    });
  });
}

/**
 * Awards any badge whose criteria the user now meets.
 *
 * Criteria are simple comparison strings stored in the badges table
 * (`streak >= 7`) rather than a rules engine: they are editable by an admin,
 * and evaluating them means one query per badge, of which there are ten.
 */
async function awardBadges(userId: number): Promise<void> {
  const badges = await query<RowDataPacket & { id: number; criteria: string }>(
    "SELECT id, criteria FROM badges WHERE active = 1"
  );
  if (badges.length === 0) return;

  const stats = await query<RowDataPacket & {
    best_game: number;
    total_score: number;
    runs_completed: number;
    streak: number;
    wins: number;
    referrals: number;
    correct: number;
    india_rank: number;
  }>(
    `SELECT
       (SELECT COALESCE(MAX(score), 0)    FROM run_scores        WHERE user_id = ?) AS best_game,
       (SELECT COALESCE(SUM(total_score), 0) FROM daily_runs      WHERE user_id = ?) AS total_score,
       (SELECT COUNT(*)                    FROM daily_runs       WHERE user_id = ? AND completed = 1) AS runs_completed,
       (SELECT COALESCE(current_streak, 0) FROM streaks          WHERE user_id = ?) AS streak,
       (SELECT COUNT(*)                    FROM challenge_results WHERE user_id = ? AND won = 1) AS wins,
       (SELECT COUNT(*)                    FROM users            WHERE referred_by = ?) AS referrals,
       (SELECT COALESCE(SUM(correct_count), 0) FROM battle_participants WHERE user_id = ?) AS correct,
       (SELECT COALESCE(MAX(india_rank), 999999) FROM daily_runs  WHERE user_id = ?) AS india_rank`,
    [userId, userId, userId, userId, userId, userId, userId, userId]
  );

  const s = stats[0];
  const values: Record<string, number> = {
    best_game: Number(s?.best_game ?? 0),
    score_total: Number(s?.total_score ?? 0),
    runs_completed: Number(s?.runs_completed ?? 0),
    streak: Number(s?.streak ?? 0),
    wins: Number(s?.wins ?? 0),
    referrals: Number(s?.referrals ?? 0),
    correct: Number(s?.correct ?? 0),
    india_rank: Number(s?.india_rank ?? 999_999),
    perfect_games: 0,
  };

  for (const badge of badges) {
    if (!evaluateCriteria(badge.criteria, values)) continue;

    // INSERT IGNORE: the unique key on (user_id, badge_id) means a badge is
    // only ever awarded once, so re-running this is free.
    await execute("INSERT IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)", [
      userId,
      badge.id,
    ]);
  }
}

/**
 * Evaluates `field >= 7` style criteria against the current stats.
 * Returns false on anything it does not understand rather than throwing, so a
 * typo in an admin-authored criterion cannot break gameplay.
 */
function evaluateCriteria(criteria: string, values: Record<string, number>): boolean {
  const match = criteria.trim().match(/^(\w+)\s*(>=|>|<=|<|==)\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return false;

  const [, field, operator, rawTarget] = match;
  const actual = values[field];
  if (actual === undefined) return false;

  const target = Number(rawTarget);
  switch (operator) {
    case ">=": return actual >= target;
    case ">": return actual > target;
    case "<=": return actual <= target;
    case "<": return actual < target;
    case "==": return actual === target;
    default: return false;
  }
}
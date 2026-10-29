import { handler, ok, unauthorized, bearer } from "@/lib/http";
import { verifyToken } from "@/lib/auth";
import { query } from "@/lib/db";
import { listGames, pickDailyGames, dailySeed } from "@/lib/games";
import { getIntSetting } from "@/lib/settings";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/game/daily
 *
 * Returns today's three-game challenge: the games, their timing/scoring
 * config, and a seed both sides use to agree on the question order without
 * the server having to remember every run in progress.
 *
 * The run row is created lazily on first call so the leaderboard only ever
 * counts players who actually started, not everyone who merely opened the app.
 */
export async function GET(req: Request) {
  return handler(async () => {
    const session = await verifyToken(bearer(req));
    if (!session) return unauthorized();

    const games = await listGames();
    if (games.length === 0) {
      return ok({ games: [], seed: null, today: null }, { status: 200 });
    }

    const count = await getIntSetting("daily_game_count", 3);
    const today = new Date().toISOString().slice(0, 10);
    const seed = dailySeed(new Date());
    const picked = pickDailyGames(games, count, seed);

    // Lock the choice to the user for today. The row is only a record here;
    // the score is written when the run is submitted.
    const existing = await query<RowDataPacket & { id: number; total_score: number }>(
      `SELECT id, total_score FROM daily_runs
        WHERE user_id = ? AND run_date = ? LIMIT 1`,
      [session.userId, today]
    );

    if (existing.length === 0) {
      await query(
        `INSERT INTO daily_runs (user_id, run_date, seed, game_ids, completed)
         VALUES (?, ?, ?, ?, 0)`,
        [session.userId, today, String(seed), JSON.stringify(picked.map((g) => g.id))]
      ).catch(() => {
        // A concurrent request may have inserted the same run first. The
        // UNIQUE (user_id, run_date) key makes that harmless.
      });
    }

    const runsToday = await query<RowDataPacket & { total: number }>(
      "SELECT COUNT(*) AS total FROM daily_runs WHERE run_date = ? AND completed = 1",
      [today]
    );

    return ok({
      today,
      // String, not number: this is stored in daily_runs.seed and echoed back
      // on submit, and JS numbers lose precision above 2^53 on some clients.
      seed: String(seed),
      games: picked.map((g) => ({
        code: g.code,
        name: g.name,
        emoji: g.emoji,
        tagline: g.tagline,
        category: g.category,
        durationSeconds: g.durationSeconds,
        maxScore: g.maxScore,
        coinsPer1000: g.coinsPer1000,
        config: g.config,
        colorFrom: g.colorFrom,
        colorTo: g.colorTo,
        isPremium: g.isPremium,
      })),
      alreadyPlayed: existing.length > 0 && Number(existing[0].total_score) > 0,
      yourBest: existing.length > 0 ? Number(existing[0].total_score) : 0,
      playersToday: Number(runsToday[0]?.total ?? 0),
    });
  });
}
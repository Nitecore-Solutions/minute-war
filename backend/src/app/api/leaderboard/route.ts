import { handler, ok, bearer } from "@/lib/http";
import { verifyToken } from "@/lib/auth";
import { query } from "@/lib/db";
import { todayIso } from "@/lib/seed";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/leaderboard?scope=daily|weekly|alltime&limit=50
 *
 * Public on purpose: a leaderboard you must sign in to see is a leaderboard
 * nobody shares. If the caller happens to be signed in, their own row is
 * included and marked so the app can highlight it.
 *
 * The `weekly` scope is a rolling 7 days and `alltime` sums every run, so
 * both are computed on read. At this stage's volume that is fine; if the
 * table grows past a few million rows, move `alltime` to the
 * leaderboard_snapshots table that already exists for the purpose.
 */
export async function GET(req: Request) {
  return handler(async () => {
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") ?? "daily";
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 200);

    const today = todayIso();
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

    let dateFilter: string;
    let dateParam: string;

    switch (scope) {
      case "weekly":
        dateFilter = "run_date >= ?";
        dateParam = weekAgo;
        break;
      case "alltime":
        dateFilter = "1 = 1";
        dateParam = "";
        break;
      case "daily":
      default:
        dateFilter = "run_date = ?";
        dateParam = today;
    }

    // Best score per user per scope. For the daily scope this is already one
    // row per user (UNIQUE on user_id + run_date), but for weekly and
    // alltime a player has many rows and only their best should rank.
    const entries = await query<
      RowDataPacket & {
        user_id: number;
        player_id: number;
        name: string;
        score: number;
        city: string | null;
        runs: number;
      }
    >(
      `SELECT d.user_id, u.player_id, u.name, u.city,
              SUM(d.total_score) AS score,
              COUNT(*)          AS runs
         FROM daily_runs d
         JOIN users u ON u.id = d.user_id
        WHERE d.completed = 1 AND u.active = 1 AND ${dateFilter}
        GROUP BY d.user_id, u.player_id, u.name, u.city
        ORDER BY score DESC, d.user_id ASC
        LIMIT ?`,
      dateParam ? [...dateFilter ? [dateParam] : [], limit] : [limit]
    );

    // Where the caller stands, even if they are nowhere near the top.
    let you: { rank: number; score: number } | null = null;
    const session = await verifyToken(bearer(req));

    if (session) {
      const mine = await query<RowDataPacket & { score: number }>(
        `SELECT COALESCE(SUM(total_score), 0) AS score
           FROM daily_runs
          WHERE user_id = ? AND completed = 1 AND ${dateFilter}`,
        dateParam ? [session.userId, dateParam] : [session.userId]
      );

      const myScore = Number(mine[0]?.score ?? 0);

      if (myScore > 0) {
        // COUNT of distinct users who beat me. Done per-scope rather than
        // relying on the visible page, so rank is accurate even off-screen.
        const above = await query<RowDataPacket & { ahead: number }>(
          `SELECT COUNT(DISTINCT user_id) AS ahead FROM (
             SELECT user_id, SUM(total_score) AS s
               FROM daily_runs
              WHERE completed = 1 AND ${dateFilter}
              GROUP BY user_id
           ) t WHERE s > ?`,
          dateParam ? [dateParam, myScore] : [myScore]
        );

        you = { rank: Number(above[0]?.ahead ?? 0) + 1, score: myScore };
      }
    }

    return ok({
      scope,
      date: today,
      entries: entries.map((e, index) => ({
        rank: index + 1,
        userId: Number(e.user_id),
        playerId: Number(e.player_id),
        name: e.name,
        city: e.city,
        score: Number(e.score),
        runs: Number(e.runs),
        isYou: session ? Number(e.user_id) === session.userId : false,
      })),
      you,
    });
  });
}
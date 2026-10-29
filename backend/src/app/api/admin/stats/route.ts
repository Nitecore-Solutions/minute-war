import { handler, ok, forbidden, bearer } from "@/lib/http";
import { verifyToken } from "@/lib/auth";
import { query } from "@/lib/db";
import { todayIso } from "@/lib/seed";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/stats
 *
 * Headline numbers for the admin overview. Read-only and aggregate-only, so
 * a player who finds this endpoint learns nothing about any individual.
 */
export async function GET(req: Request) {
  return handler(async () => {
    const session = await verifyToken(bearer(req));
    if (!session) return forbidden("Not allowed");
    if (session.role !== "admin") return forbidden("Not allowed");

    const today = todayIso();

    const [players] = await query<
      RowDataPacket & { total: number; active_today: number; new_today: number; premium: number }
    >(
      `SELECT
         COUNT(*)                                                      AS total,
         COALESCE(SUM(last_seen_at >= CURDATE()), 0)                  AS active_today,
         COALESCE(SUM(created_at >= CURDATE()), 0)                    AS new_today,
         COALESCE(SUM(is_premium = 1), 0)                             AS premium
       FROM users WHERE role = 'player'`
    );

    const [runs] = await query<RowDataPacket & { runs_today: number; players_today: number; avg_score: number }>(
      `SELECT COUNT(*) AS runs_today,
              COUNT(DISTINCT user_id) AS players_today,
              COALESCE(AVG(total_score), 0) AS avg_score
         FROM daily_runs WHERE run_date = ? AND completed = 1`,
      [today]
    );

    const [walletTotals] = await query<RowDataPacket & { circulating: number; earned_today: number }>(
      `SELECT
         (SELECT COALESCE(SUM(balance), 0) FROM wallets WHERE frozen = 0) AS circulating,
         (SELECT COALESCE(SUM(delta), 0) FROM wallet_ledger
           WHERE delta > 0 AND created_at >= CURDATE())                 AS earned_today`
    );

    const [challenges] = await query<RowDataPacket & { total: number; answered: number; pending: number }>(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(status IN ('won','lost')), 0) AS answered,
              COALESCE(SUM(status = 'pending'), 0)      AS pending
         FROM challenges`
    );

    const [battles] = await query<RowDataPacket & { finished: number; live: number }>(
      `SELECT
         COALESCE(SUM(status = 'finished'), 0) AS finished,
         COALESCE(SUM(status IN ('waiting','countdown','active')), 0) AS live
         FROM battle_rooms`
    );

    return ok({
      players: {
        total: Number(players[0]?.total ?? 0),
        activeToday: Number(players[0]?.active_today ?? 0),
        newToday: Number(players[0]?.new_today ?? 0),
        premium: Number(players[0]?.premium ?? 0),
      },
      runs: {
        today: Number(runs[0]?.runs_today ?? 0),
        playersToday: Number(runs[0]?.players_today ?? 0),
        averageScore: Math.round(Number(runs[0]?.avg_score ?? 0)),
      },
      economy: {
        circulating: Number(walletTotals[0]?.circulating ?? 0),
        earnedToday: Number(walletTotals[0]?.earned_today ?? 0),
      },
      social: {
        challenges: Number(challenges[0]?.total ?? 0),
        answered: Number(challenges[0]?.answered ?? 0),
        pending: Number(challenges[0]?.pending ?? 0),
        battlesFinished: Number(battles[0]?.finished ?? 0),
        battlesLive: Number(battles[0]?.live ?? 0),
      },
      date: today,
    });
  });
}
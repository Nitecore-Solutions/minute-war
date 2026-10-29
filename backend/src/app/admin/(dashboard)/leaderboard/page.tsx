import { query } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";
import { fmtDate, fmtNumber } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Leaderboard moderation and inspection.
 *
 * The daily, weekly and all-time boards are all computed from daily_runs on
 * read, so this shows the same numbers players see rather than a separate
 * cached ranking.
 */
export default async function AdminLeaderboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const scope = sp.scope === "weekly" || sp.scope === "alltime" ? sp.scope : "daily";

  const dateFilter =
    scope === "weekly"
      ? "d.run_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)"
      : scope === "alltime"
        ? "1 = 1"
        : "d.run_date = CURDATE()";

  const leaders = await query<
    RowDataPacket & {
      user_id: number;
      player_id: number;
      name: string;
      city: string | null;
      score: number;
      runs: number;
      best_day: number;
      active: number;
    }
  >(
    `SELECT d.user_id, u.player_id, u.name, u.city, u.active,
            SUM(d.total_score)            AS score,
            COUNT(*)                      AS runs,
            MAX(d.total_score)            AS best_day
       FROM daily_runs d
       JOIN users u ON u.id = d.user_id
      WHERE d.completed = 1 AND ${dateFilter}
      GROUP BY d.user_id, u.player_id, u.name, u.city, u.active
      ORDER BY score DESC
      LIMIT 50`
  );

  const totals = await query<RowDataPacket & { players: number; runs: number; avg: number }>(
    `SELECT COUNT(DISTINCT d.user_id) players,
            COUNT(*) runs,
            COALESCE(AVG(d.total_score), 0) avg
       FROM daily_runs d
      WHERE d.completed = 1 AND ${dateFilter}`
  );

  const stats = totals[0];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Leaderboard</h1>
          <p className="page-sub">
            {fmtNumber(Number(stats?.players ?? 0))} players ·{" "}
            {fmtNumber(Number(stats?.runs ?? 0))} completed runs · average{" "}
            {fmtNumber(Math.round(Number(stats?.avg ?? 0)))}
          </p>
        </div>
      </div>

      <div className="toolbar">
        {(["daily", "weekly", "alltime"] as const).map((option) => (
          <a
            key={option}
            className={scope === option ? "btn btn-primary btn-sm" : "btn btn-sm"}
            href={`/admin/leaderboard?scope=${option}`}
          >
            {option === "alltime" ? "All time" : option[0].toUpperCase() + option.slice(1)}
          </a>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="num">Rank</th>
              <th>Player</th>
              <th className="num">Player ID</th>
              <th>City</th>
              <th className="num">Score</th>
              <th className="num">Runs</th>
              <th className="num">Best day</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {leaders.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty">Nobody has played in this window yet.</div>
                </td>
              </tr>
            ) : (
              leaders.map((row, index) => (
                <tr key={row.user_id} className={row.active ? "" : "inactive"}>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`}
                  </td>
                  <td style={{ fontWeight: 600 }}>{row.name}</td>
                  <td className="num mono">{row.player_id}</td>
                  <td style={{ color: "#64748b" }}>{row.city ?? "—"}</td>
                  <td className="num mono" style={{ fontWeight: 700 }}>
                    {fmtNumber(row.score)}
                  </td>
                  <td className="num">{row.runs}</td>
                  <td className="num mono">{fmtNumber(row.best_day)}</td>
                  <td>
                    {row.active ? (
                      <span className="badge badge-green">Active</span>
                    ) : (
                      <span className="badge badge-red">Disabled</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="hint">
        Disabled players are excluded from the ranking players see, but are listed
        here so a banned account&apos;s scores cannot be quietly forgotten.
        {fmtDate(new Date())}
      </p>
    </>
  );
}
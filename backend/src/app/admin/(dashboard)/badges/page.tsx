import { query } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";
import { fmtNumber } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Badge catalogue.
 *
 * The stats table below each badge shows exactly how many players currently
 * satisfy it, which is the quickest way to spot a criterion set so easy
 * (or impossible) that the badge has stopped meaning anything.
 */
export default async function AdminBadges({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  const badges = await query<
    RowDataPacket & {
      id: number;
      code: string;
      name: string;
      icon: string;
      description: string;
      criteria: string;
      tier: string;
      active: number;
      holders: number;
    }
  >(
    `SELECT b.*,
            (SELECT COUNT(*) FROM user_badges ub WHERE ub.badge_id = b.id) AS holders
       FROM badges b
      ORDER BY FIELD(b.tier, 'gold', 'silver', 'bronze'), b.id`
  );

  // How many players meet each criterion today. Evaluated in JS rather than
  // SQL because the criteria format is `field op number` and string-matching
  // it per badge in SQL is far harder to read than splitting it here.
  const stats = await query<
    RowDataPacket & {
      best_game: number;
      score_total: number;
      runs_completed: number;
      streak: number;
      wins: number;
      referrals: number;
      correct: number;
      india_rank: number;
      total_players: number;
    }
  >(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE role='player' AND active=1) AS total_players,
       (SELECT COALESCE(MAX(score), 0) FROM run_scores WHERE user_id IN (SELECT id FROM users WHERE role='player')) AS best_game,
       (SELECT COALESCE(SUM(total_score), 0) FROM daily_runs WHERE user_id IN (SELECT id FROM users WHERE role='player')) AS score_total,
       (SELECT COUNT(*) FROM users u JOIN streaks s ON s.user_id = u.id
         WHERE u.role='player' AND u.active=1 AND s.current_streak >= 3) AS runs_completed,
       (SELECT COALESCE(MAX(current_streak), 0) FROM streaks) AS streak,
       (SELECT COUNT(*) FROM challenge_results WHERE won = 1) AS wins,
       (SELECT COUNT(*) FROM users WHERE referred_by IS NOT NULL) AS referrals,
       (SELECT COALESCE(SUM(correct_count), 0) FROM battle_participants) AS correct,
       (SELECT COALESCE(MIN(india_rank), 999999) FROM daily_runs WHERE completed = 1) AS india_rank`
  );

  const values: Record<string, number> = {
    best_game: Number(stats[0]?.best_game ?? 0),
    score_total: Number(stats[0]?.score_total ?? 0),
    runs_completed: Number(stats[0]?.runs_completed ?? 0),
    streak: Number(stats[0]?.streak ?? 0),
    wins: Number(stats[0]?.wins ?? 0),
    referrals: Number(stats[0]?.referrals ?? 0),
    correct: Number(stats[0]?.correct ?? 0),
    india_rank: Number(stats[0]?.india_rank ?? 999_999),
  };

  const players = Number(stats[0]?.total_players ?? 0);

  const tierTone = (tier: string) =>
    tier === "gold" ? "badge badge-amber" : tier === "silver" ? "badge badge-blue" : "badge badge-gray";

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Badges</h1>
          <p className="page-sub">
            {badges.length} badges · awarded after each daily run ·{" "}
            {fmtNumber(players)} active players to award against
          </p>
        </div>
      </div>

      {ok ? (
        <div className="card" style={{ marginBottom: 16, borderColor: "#86efac", background: "#f0fdf4" }}>
          {ok}
        </div>
      ) : null}
      {error ? <div className="error-text">{error}</div> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Badge</th>
              <th>Tier</th>
              <th>Criteria</th>
              <th className="num">Earned by</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {badges.map((badge) => {
              const match = badge.criteria.match(/^(\w+)\s*(>=|>|<=|<|==)\s*(-?\d+(?:\.\d+)?)$/);
              const field = match?.[1];
              const operator = match?.[2];
              const target = Number(match?.[3]);

              // "How many players already satisfy this" is only meaningful for
              // an aggregate criterion; for a streak it shows the current max.
              const reach =
                field && operator && Number.isFinite(target)
                  ? field === "streak" || field === "best_game" || field === "india_rank"
                    ? `${fmtNumber(values[field] ?? 0)} (best today)`
                    : `${fmtNumber(values[field] ?? 0)} players qualify`
                  : "cannot be evaluated";

              return (
                <tr key={badge.id} className={badge.active ? "" : "inactive"}>
                  <td>
                    <div style={{ fontWeight: 700 }}>
                      {badge.icon} {badge.name}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{badge.description}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }} className="mono">
                      {badge.code}
                    </div>
                  </td>
                  <td>
                    <span className={tierTone(badge.tier)}>{badge.tier}</span>
                  </td>
                  <td>
                    <form
                      method="post"
                      action="/api/admin/badges"
                      style={{ display: "flex", gap: 6, alignItems: "center" }}
                    >
                      <input type="hidden" name="intent" value="save" />
                      <input type="hidden" name="id" value={badge.id} />
                      <input
                        className="input mono"
                        style={{ width: 190, fontSize: 12 }}
                        name="criteria"
                        defaultValue={badge.criteria}
                      />
                      <select className="select" style={{ width: 96 }} name="tier" defaultValue={badge.tier}>
                        <option value="bronze">bronze</option>
                        <option value="silver">silver</option>
                        <option value="gold">gold</option>
                      </select>
                      <button className="btn btn-sm" type="submit">Save</button>
                    </form>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{reach}</div>
                  </td>
                  <td className="num">
                    {fmtNumber(badge.holders)}
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      {players > 0 ? Math.round((badge.holders / players) * 100) : 0}%
                    </div>
                  </td>
                  <td>
                    {badge.active ? (
                      <span className="badge badge-green">Awarding</span>
                    ) : (
                      <span className="badge badge-gray">Paused</span>
                    )}
                  </td>
                  <td>
                    <form method="post" action="/api/admin/badges">
                      <input type="hidden" name="intent" value="toggle" />
                      <input type="hidden" name="id" value={badge.id} />
                      <button className="btn btn-sm" type="submit">
                        {badge.active ? "Pause" : "Resume"}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="hint">
        Criteria use one of: best_game, score_total, runs_completed, streak, wins,
        referrals, correct, india_rank. Pausing a badge stops new awards but never
        removes one already earned.
      </p>
    </>
  );
}
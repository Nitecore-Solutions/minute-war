import { query } from "@/lib/db";
import { todayIso } from "@/lib/seed";
import { getBoolSetting } from "@/lib/settings";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const today = todayIso();

  // NOTE: query() returns the rows array directly. Do NOT destructure it as
// `const [rows] = await query(...)` - that yields the first ROW, not the
// array, and `.map` on it throws.
const totals = await query<RowDataPacket & {
    total: number;
    active_today: number;
    new_today: number;
    premium: number;
  }>(
    `SELECT COUNT(*) total,
            COALESCE(SUM(last_seen_at >= CURDATE()), 0) active_today,
            COALESCE(SUM(created_at >= CURDATE()), 0)   new_today,
            COALESCE(SUM(is_premium = 1), 0)            premium
       FROM users WHERE role = 'player'`
  );

  const runs = await query<RowDataPacket & { runs: number; players: number; avg: number; max: number }>(
    `SELECT COUNT(*) runs, COUNT(DISTINCT user_id) players,
            COALESCE(AVG(total_score), 0) avg, COALESCE(MAX(total_score), 0) max
       FROM daily_runs WHERE run_date = ? AND completed = 1`,
    [today]
  );

  const economy = await query<RowDataPacket & { circulating: number; earned_today: number; players_with_coins: number }>(
    `SELECT
       (SELECT COALESCE(SUM(balance), 0) FROM wallets WHERE frozen = 0) AS circulating,
       (SELECT COALESCE(SUM(delta), 0) FROM wallet_ledger WHERE delta > 0 AND created_at >= CURDATE()) AS earned_today,
       (SELECT COUNT(*) FROM wallets WHERE balance > 0) AS players_with_coins`
  );

  const social = await query<RowDataPacket & { total: number; answered: number; pending: number }>(
    `SELECT COUNT(*) total,
            COALESCE(SUM(status IN ('won','lost')), 0) answered,
            COALESCE(SUM(status = 'pending'), 0)      pending
       FROM challenges`
  );

  // What fraction of challenge links actually get played. This is the single
  // number that says whether the viral loop is working.
  const answerRate =
    Number(social[0]?.total ?? 0) > 0
      ? Math.round((Number(social[0].answered) / Number(social[0].total)) * 100)
      : 0;

  const battles = await query<RowDataPacket & { finished: number; live: number }>(
    `SELECT COALESCE(SUM(status = 'finished'), 0) finished,
            COALESCE(SUM(status IN ('waiting','countdown','active')), 0) live
       FROM battle_rooms`
  );

  const topToday = await query<RowDataPacket & { name: string; score: number; city: string | null }>(
    `SELECT u.name, u.city, d.total_score score
       FROM daily_runs d JOIN users u ON u.id = d.user_id
      WHERE d.run_date = ? AND d.completed = 1 AND u.active = 1
      ORDER BY d.total_score DESC LIMIT 8`,
    [today]
  );

  const recentSignups = await query<RowDataPacket & { name: string; email: string; created_at: string; player_id: number }>(
    `SELECT name, email, created_at, player_id FROM users
      WHERE role = 'player' ORDER BY created_at DESC LIMIT 8`
  );

  const maintenance = await getBoolSetting("maintenance", false);
  const registrationsOpen = await getBoolSetting("registrations_open", true);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">
            {today} · live figures read straight from MySQL
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <StatusPill on={!maintenance} label={maintenance ? "Maintenance" : "Live"} />
          <StatusPill on={registrationsOpen} label={registrationsOpen ? "Sign-ups open" : "Sign-ups closed"} />
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <Stat
          icon="👥"
          value={Number(totals[0]?.total ?? 0)}
          label={`Players · ${Number(totals[0]?.new_today ?? 0)} new today`}
          tone="blue"
        />
        <Stat
          icon="🔥"
          value={Number(totals[0]?.active_today ?? 0)}
          label="Active today"
          tone="green"
        />
        <Stat
          icon="🎯"
          value={Number(runs[0]?.players ?? 0)}
          label={`Played today · avg ${Math.round(Number(runs[0]?.avg ?? 0))}`}
          tone="amber"
        />
        <Stat
          icon="🪙"
          value={Number(economy[0]?.circulating ?? 0)}
          label="Coins in circulation"
          tone="purple"
        />
      </div>

      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <Stat
          icon="🤝"
          value={Number(social[0]?.total ?? 0)}
          label={`Challenges sent · ${Number(social[0]?.pending ?? 0)} unanswered`}
          tone="purple"
        />
        <Stat
          icon="📈"
          value={`${answerRate}%`}
          label="Challenge answer rate"
          tone={answerRate >= 30 ? "green" : "amber"}
        />
        <Stat
          icon="⚔️"
          value={Number(battles[0]?.finished ?? 0)}
          label={`1v1 battles · ${Number(battles[0]?.live ?? 0)} live`}
          tone="blue"
        />
        <Stat
          icon="💎"
          value={Number(totals[0]?.premium ?? 0)}
          label="Premium subscribers"
          tone="amber"
        />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        <section className="card">
          <h2 style={{ margin: "0 0 12px", fontSize: 15 }}>Top of the leaderboard today</h2>
          {topToday.length === 0 ? (
            <div className="empty">Nobody has played yet today.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>City</th>
                  <th className="num">Score</th>
                </tr>
              </thead>
              <tbody>
                {topToday.map((row: { name: string; score: number; city: string | null }, i: number) => (
                  <tr key={`${row.name}-${i}`}>
                    <td style={{ width: 34, fontWeight: 700 }}>{i + 1}</td>
                    <td>{row.name}</td>
                    <td style={{ color: "#64748b" }}>{row.city ?? "—"}</td>
                    <td className="num mono">{Number(row.score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h2 style={{ margin: "0 0 12px", fontSize: 15 }}>Newest players</h2>
          {recentSignups.length === 0 ? (
            <div className="empty">No sign-ups yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Email</th>
                  <th className="num">ID</th>
                </tr>
              </thead>
              <tbody>
                {recentSignups.map((row: { name: string; email: string; player_id: number }, i: number) => (
                  <tr key={`${row.email}-${i}`}>
                    <td>{row.name}</td>
                    <td style={{ color: "#64748b" }}>{row.email}</td>
                    <td className="num mono">{row.player_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}

function Stat({
  icon,
  value,
  label,
  tone,
}: {
  icon: string;
  value: number | string;
  label: string;
  tone: "blue" | "green" | "amber" | "purple";
}) {
  const bg = {
    blue: "#dbeafe",
    green: "#dcfce7",
    amber: "#fef3c7",
    purple: "#ede9fe",
  }[tone];

  return (
    <div className="card">
      <div className="stat">
        <div className="stat-icon" style={{ background: bg }}>
          {icon}
        </div>
        <div>
          <div className="stat-value">{typeof value === "number" ? value.toLocaleString("en-IN") : value}</div>
          <div className="stat-label">{label}</div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={on ? "badge badge-green" : "badge badge-red"}>{label}</span>
  );
}
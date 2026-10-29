import { query } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";
import { fmtDate, fmtNumber } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UserRow extends RowDataPacket {
  id: number;
  player_id: number;
  name: string;
  email: string;
  role: string;
  city: string | null;
  active: number;
  is_premium: number;
  premium_until: string | null;
  referral_code: string;
  referred_by_name: string | null;
  balance: number;
  frozen: number;
  streak: number;
  runs: number;
  best_score: number;
  created_at: string;
  last_login_at: string | null;
}

const PER_PAGE = 40;

/**
 * User management: search, moderate, adjust coins.
 *
 * Ban revokes live sessions rather than waiting for the token to expire, and
 * "close account" scrubs personal data while deliberately keeping the coin
 * ledger, because that is the financial audit trail.
 */
export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const filter = typeof sp.filter === "string" ? sp.filter : "all";

  const rawPage = Number(sp.page ?? 1);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const offset = (page - 1) * PER_PAGE;

  const where: string[] = ["u.role = 'player'"];
  const params: (string | number)[] = [];

  if (q) {
    // Matches name, email or the public 6-digit player id.
    where.push("(u.name LIKE ? OR u.email LIKE ? OR u.player_id = ?)");
    params.push(`%${q}%`, `%${q}%`, Number(q) || -1);
  }

  if (filter === "active") where.push("u.active = 1");
  else if (filter === "banned") where.push("u.active = 0");
  else if (filter === "premium") where.push("u.is_premium = 1");
  else if (filter === "frozen") where.push("w.frozen = 1");

  const whereSql = where.join(" AND ");

  const users = await query<UserRow>(
    `SELECT u.id, u.player_id, u.name, u.email, u.role, u.city, u.active,
            u.is_premium, u.premium_until, u.referral_code,
            COALESCE(w.balance, 0)  AS balance,
            COALESCE(w.frozen, 0)   AS frozen,
            COALESCE(s.current_streak, 0) AS streak,
            (SELECT COUNT(*) FROM daily_runs d WHERE d.user_id = u.id AND d.completed = 1) AS runs,
            (SELECT COALESCE(MAX(d.total_score), 0) FROM daily_runs d WHERE d.user_id = u.id) AS best_score,
            u.created_at, u.last_login_at,
            (SELECT r.name FROM users r WHERE r.id = u.referred_by) AS referred_by_name
       FROM users u
       LEFT JOIN wallets w  ON w.user_id = u.id
       LEFT JOIN streaks s  ON s.user_id = u.id
      WHERE ${whereSql}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, PER_PAGE, offset]
  );

  const totals = await query<RowDataPacket & { total: number; active: number; banned: number; premium: number }>(
    `SELECT COUNT(*) total,
            COALESCE(SUM(u.active = 1), 0)   active,
            COALESCE(SUM(u.active = 0), 0)   banned,
            COALESCE(SUM(u.is_premium = 1), 0) premium
       FROM users u WHERE u.role = 'player'`
  );

  const total = Number(totals[0]?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-sub">
            {fmtNumber(total)} players · {fmtNumber(Number(totals[0]?.active ?? 0))} active ·{" "}
            {fmtNumber(Number(totals[0]?.banned ?? 0))} disabled ·{" "}
            {fmtNumber(Number(totals[0]?.premium ?? 0))} premium
          </p>
        </div>
      </div>

      {ok ? (
        <div className="card" style={{ marginBottom: 16, borderColor: "#86efac", background: "#f0fdf4" }}>
          {ok}
        </div>
      ) : null}
      {error ? <div className="error-text">{error}</div> : null}

      <form className="toolbar" method="get">
        <input
          className="input"
          style={{ maxWidth: 320 }}
          name="q"
          defaultValue={q}
          placeholder="Search name, email or player ID"
        />
        <select className="select" style={{ maxWidth: 160 }} name="filter" defaultValue={filter}>
          <option value="all">All players</option>
          <option value="active">Active only</option>
          <option value="banned">Disabled only</option>
          <option value="premium">Premium only</option>
          <option value="frozen">Frozen wallet</option>
        </select>
        <button className="btn btn-primary" type="submit">Filter</button>
        {q || filter !== "all" ? (
          <a className="btn" href="/admin/users">Reset</a>
        ) : null}
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th className="num">ID</th>
              <th className="num">Coins</th>
              <th className="num">Streak</th>
              <th className="num">Runs</th>
              <th className="num">Best</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className="empty">No players match that search.</div>
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className={user.active ? "" : "inactive"}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{user.name}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      {user.email}
                      {user.city ? ` · ${user.city}` : ""}
                    </div>
                    {user.referred_by_name ? (
                      <div style={{ fontSize: 11, color: "#64748b" }}>
                        invited by {user.referred_by_name}
                      </div>
                    ) : null}
                  </td>
                  <td className="num mono">{user.player_id}</td>
                  <td className="num mono">{fmtNumber(user.balance)}</td>
                  <td className="num">{user.streak}</td>
                  <td className="num">{user.runs}</td>
                  <td className="num mono">{fmtNumber(user.best_score)}</td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {!user.active ? <span className="badge badge-red">Disabled</span> : null}
                      {user.frozen ? <span className="badge badge-amber">Wallet frozen</span> : null}
                      {user.is_premium ? <span className="badge badge-purple">Premium</span> : null}
                      {!user.active && !user.frozen && !user.is_premium ? (
                        <span className="badge badge-gray">—</span>
                      ) : null}
                    </div>
                  </td>
                  <td style={{ fontSize: 11, color: "#64748b" }}>
                    {fmtDate(user.created_at)}
                    <br />
                    <span style={{ color: "#94a3b8" }}>
                      {user.last_login_at ? `seen ${fmtDate(user.last_login_at)}` : "never signed in"}
                    </span>
                  </td>
                  <td>
                    <UserActions user={user} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <div className="toolbar" style={{ marginTop: 14, justifyContent: "center" }}>
          {page > 1 ? (
            <a className="btn btn-sm" href={`/admin/users?q=${encodeURIComponent(q)}&filter=${filter}&page=${page - 1}`}>
              Previous
            </a>
          ) : null}
          <span style={{ fontSize: 13, color: "#64748b" }}>
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <a className="btn btn-sm" href={`/admin/users?q=${encodeURIComponent(q)}&filter=${filter}&page=${page + 1}`}>
              Next
            </a>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** The per-row action forms. A component so the table stays readable. */
function UserActions({ user }: { user: UserRow }) {
  return (
    <div className="row-actions" style={{ minWidth: 190 }}>
      <form method="post" action="/api/admin/users" style={{ display: "flex", gap: 4 }}>
        <input type="hidden" name="intent" value="toggle-active" />
        <input type="hidden" name="id" value={user.id} />
        <button className={`btn btn-sm ${user.active ? "btn-danger" : ""}`} type="submit">
          {user.active ? "Disable" : "Enable"}
        </button>
      </form>

      <form method="post" action="/api/admin/users" style={{ display: "flex", gap: 4 }}>
        <input type="hidden" name="intent" value="premium" />
        <input type="hidden" name="id" value={user.id} />
        <input type="hidden" name="premium" value={user.is_premium ? "0" : "1"} />
        <button className="btn btn-sm" type="submit">
          {user.is_premium ? "Remove premium" : "Premium"}
        </button>
      </form>

      <details>
        <summary className="btn btn-sm" style={{ cursor: "pointer", listStyle: "none" }}>
          Coins
        </summary>
        <form
          method="post"
          action="/api/admin/users"
          style={{ display: "flex", gap: 4, marginTop: 6, alignItems: "center" }}
        >
          <input type="hidden" name="intent" value="coins" />
          <input type="hidden" name="id" value={user.id} />
          <input
            className="input"
            style={{ width: 110 }}
            name="amount"
            type="number"
            placeholder="±coins"
            required
          />
          <button className="btn btn-sm btn-primary" type="submit">Apply</button>
        </form>
        <p className="hint" style={{ fontSize: 11 }}>
          Negative deducts. Goes through the ledger.
        </p>
      </details>

      <details>
        <summary className="btn btn-sm" style={{ cursor: "pointer", listStyle: "none" }}>
          More
        </summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
          <form method="post" action="/api/admin/users">
            <input type="hidden" name="intent" value="toggle-frozen" />
            <input type="hidden" name="id" value={user.id} />
            <button className="btn btn-sm" type="submit" style={{ width: "100%" }}>
              {user.frozen ? "Unfreeze wallet" : "Freeze wallet"}
            </button>
          </form>
          <form method="post" action="/api/admin/users">
            <input type="hidden" name="intent" value="revoke" />
            <input type="hidden" name="id" value={user.id} />
            <button className="btn btn-sm" type="submit" style={{ width: "100%" }}>
              Revoke sessions
            </button>
          </form>
          <form method="post" action="/api/admin/users">
            <input type="hidden" name="intent" value="close" />
            <input type="hidden" name="id" value={user.id} />
            <button className="btn btn-sm btn-danger" type="submit" style={{ width: "100%" }}>
              Close account
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}
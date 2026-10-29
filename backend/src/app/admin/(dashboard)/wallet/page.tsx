import { query } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";
import { fmtDate, fmtNumber } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Coin economy and the wallet ledger.
 *
 * Every movement anywhere in the app lands here, so this doubles as the audit
 * trail for the economy. The "by kind" breakdown is the fastest way to see
 * whether the coin faucet is running away from the coin sink.
 */
export default async function AdminWallet({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const kind = typeof sp.kind === "string" ? sp.kind : "";

  const totals = await query<
    RowDataPacket & { circulating: number; lifetime: number; issued_today: number; accounts: number; richest: number }
  >(
    `SELECT
       (SELECT COALESCE(SUM(balance), 0) FROM wallets WHERE frozen = 0) AS circulating,
       (SELECT COALESCE(SUM(lifetime_earned), 0) FROM wallets)             AS lifetime,
       (SELECT COALESCE(SUM(delta), 0) FROM wallet_ledger
         WHERE delta > 0 AND created_at >= CURDATE())                       AS issued_today,
       (SELECT COUNT(*) FROM wallets WHERE balance > 0)                    AS accounts,
       (SELECT COALESCE(MAX(balance), 0) FROM wallets)                      AS richest`
  );

  const byKind = await query<RowDataPacket & { kind: string; n: number; total: number }>(
    `SELECT kind, COUNT(*) n, COALESCE(SUM(delta), 0) total
       FROM wallet_ledger
      GROUP BY kind
      ORDER BY ABS(SUM(delta)) DESC`
  );

  const recent = await query<
    RowDataPacket & {
      id: number;
      name: string;
      email: string;
      delta: number;
      balance_after: number;
      kind: string;
      note: string | null;
      created_at: string;
    }
  >(
    `SELECT l.id, l.delta, l.balance_after, l.kind, l.note, l.created_at,
            u.name, u.email
       FROM wallet_ledger l
       JOIN users u ON u.id = l.user_id
      ${kind ? "WHERE l.kind = ?" : ""}
      ORDER BY l.id DESC
      LIMIT 60`,
    kind ? [kind] : []
  );

  const topWallets = await query<
    RowDataPacket & { name: string; email: string; balance: number; player_id: number }
  >(
    `SELECT u.name, u.email, u.player_id, w.balance
       FROM wallets w JOIN users u ON u.id = w.user_id
      WHERE w.balance > 0
      ORDER BY w.balance DESC
      LIMIT 10`
  );

  const t = totals[0];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Coins &amp; ledger</h1>
          <p className="page-sub">
            {fmtNumber(Number(t?.circulating ?? 0))} in circulation ·{" "}
            {fmtNumber(Number(t?.lifetime ?? 0))} earned all-time ·{" "}
            {fmtNumber(Number(t?.issued_today ?? 0))} issued today
          </p>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="stat">
            <div className="stat-icon" style={{ background: "#dbeafe" }}>🪙</div>
            <div>
              <div className="stat-value">{fmtNumber(Number(t?.circulating ?? 0))}</div>
              <div className="stat-label">Circulating</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="stat">
            <div className="stat-icon" style={{ background: "#dcfce7" }}>📈</div>
            <div>
              <div className="stat-value">{fmtNumber(Number(t?.lifetime ?? 0))}</div>
              <div className="stat-label">Lifetime earned</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="stat">
            <div className="stat-icon" style={{ background: "#fef3c7" }}>👛</div>
            <div>
              <div className="stat-value">{fmtNumber(Number(t?.accounts ?? 0))}</div>
              <div className="stat-label">Accounts holding coins</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="stat">
            <div className="stat-icon" style={{ background: "#ede9fe" }}>👑</div>
            <div>
              <div className="stat-value">{fmtNumber(Number(t?.richest ?? 0))}</div>
              <div className="stat-label">Richest wallet</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", marginBottom: 18 }}>
        <section className="card">
          <h2 style={{ margin: "0 0 12px", fontSize: 15 }}>Movement by kind</h2>
          <table>
            <thead>
              <tr>
                <th>Kind</th>
                <th className="num">Entries</th>
                <th className="num">Net</th>
              </tr>
            </thead>
            <tbody>
              {byKind.map((row) => (
                <tr key={row.kind}>
                  <td>
                    <a href={`/admin/wallet?kind=${row.kind}`} style={{ textDecoration: "underline" }}>
                      {row.kind}
                    </a>
                  </td>
                  <td className="num">{fmtNumber(row.n)}</td>
                  <td
                    className="num mono"
                    style={{ color: Number(row.total) >= 0 ? "#15803d" : "#b91c1c" }}
                  >
                    {Number(row.total) >= 0 ? "+" : ""}
                    {fmtNumber(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2 style={{ margin: "0 0 12px", fontSize: 15 }}>Richest wallets</h2>
          {topWallets.length === 0 ? (
            <div className="empty">No wallets hold coins.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th className="num">ID</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {topWallets.map((row) => (
                  <tr key={row.email}>
                    <td>{row.name}</td>
                    <td className="num mono">{row.player_id}</td>
                    <td className="num mono">{fmtNumber(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <div className="toolbar">
        <strong style={{ fontSize: 14 }}>
          {kind ? `Ledger · ${kind}` : "Recent ledger entries"}
        </strong>
        {kind ? (
          <a className="btn btn-sm" href="/admin/wallet">
            Clear filter
          </a>
        ) : null}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th className="num">Change</th>
              <th className="num">Balance after</th>
              <th>Kind</th>
              <th>Note</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty">No ledger entries match.</div>
                </td>
              </tr>
            ) : (
              recent.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.name}
                    <div style={{ fontSize: 11, color: "#64748b" }}>{row.email}</div>
                  </td>
                  <td
                    className="num mono"
                    style={{ color: Number(row.delta) >= 0 ? "#15803d" : "#b91c1c", fontWeight: 700 }}
                  >
                    {Number(row.delta) >= 0 ? "+" : ""}
                    {fmtNumber(row.delta)}
                  </td>
                  <td className="num mono">{fmtNumber(row.balance_after)}</td>
                  <td>
                    <span className="badge badge-gray">{row.kind}</span>
                  </td>
                  <td style={{ color: "#64748b", fontSize: 12 }}>{row.note ?? "—"}</td>
                  <td style={{ fontSize: 11, color: "#64748b" }}>{fmtDate(row.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="hint">
        Ledger rows are never updated or deleted. Closing an account scrubs the
        personal data but keeps these rows, because they are the financial audit trail.
      </p>
    </>
  );
}
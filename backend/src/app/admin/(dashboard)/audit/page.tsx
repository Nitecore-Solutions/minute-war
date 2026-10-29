import { query } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";
import { fmtDate } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin audit log.
 *
 * Records every privileged change: coin grants, account closures, game edits,
 * setting flips. It is append-only and read-only here on purpose — an admin
 * should be able to trust that this log cannot be tidied up after the fact.
 */
export default async function AdminAudit({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const rawPage = Number(sp.page ?? 1);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const perPage = 60;
  const offset = (page - 1) * perPage;

  const entries = await query<
    RowDataPacket & {
      id: number;
      admin_name: string | null;
      admin_email: string | null;
      action: string;
      target_type: string | null;
      target_id: string | null;
      meta: unknown;
      created_at: string;
    }
  >(
    `SELECT a.*, u.name AS admin_name, u.email AS admin_email
       FROM admin_audit_log a
       LEFT JOIN users u ON u.id = a.admin_id
      ORDER BY a.id DESC
      LIMIT ? OFFSET ?`,
    [perPage, offset]
  );

  const totals = await query<RowDataPacket & { total: number; today: number }>(
    `SELECT COUNT(*) total,
            COALESCE(SUM(created_at >= CURDATE()), 0) today
       FROM admin_audit_log`
  );

  const total = Number(totals[0]?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / perPage));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Audit log</h1>
          <p className="page-sub">
            {total} recorded changes · {Number(totals[0]?.today ?? 0)} today · append-only
          </p>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Admin</th>
              <th>Action</th>
              <th>Target</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty">No changes recorded yet.</div>
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ fontSize: 11, color: "#64748b" }}>{fmtDate(entry.created_at)}</td>
                  <td>
                    {entry.admin_name ?? <span style={{ color: "#94a3b8" }}>system</span>}
                    {entry.admin_email ? (
                      <div style={{ fontSize: 11, color: "#64748b" }}>{entry.admin_email}</div>
                    ) : null}
                  </td>
                  <td>
                    <span className="badge badge-gray mono">{entry.action}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {entry.target_type ? (
                      <>
                        {entry.target_type}
                        {entry.target_id ? (
                          <span className="mono" style={{ color: "#64748b" }}>
                            {" "}
                            #{entry.target_id}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="mono" style={{ fontSize: 11, color: "#64748b", maxWidth: 320 }}>
                    {entry.meta ? JSON.stringify(entry.meta) : "—"}
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
            <a className="btn btn-sm" href={`/admin/audit?page=${page - 1}`}>Previous</a>
          ) : null}
          <span style={{ fontSize: 13, color: "#64748b" }}>
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <a className="btn btn-sm" href={`/admin/audit?page=${page + 1}`}>Next</a>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
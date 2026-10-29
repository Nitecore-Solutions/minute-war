import { query } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";
import { fmtDate, fmtNumber } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Friend challenges, and the health of the viral loop.
 *
 * The answer rate is the number that matters: a challenge that nobody picks
 * up is a wasted share, and a low rate means the loop is not actually driving
 * installs.
 */
export default async function AdminChallenges() {
  const rows = await query<
    RowDataPacket & {
      id: number;
      code: string;
      challenger_name: string;
      challenger_score: number;
      challenee_name: string | null;
      challenee_score: number | null;
      status: string;
      created_at: string;
      responded_at: string | null;
      expired: number;
    }
  >(
    `SELECT c.id, c.code, c.challenger_name, c.challenger_score,
            c.challenee_score, c.status, c.created_at, c.responded_at,
            (c.expires_at < NOW()) AS expired,
            e.name AS challenee_name
       FROM challenges c
       LEFT JOIN users e ON e.id = c.challenee_id
      ORDER BY c.created_at DESC
      LIMIT 80`
  );

  const stats = await query<RowDataPacket & { total: number; answered: number; pending: number; expired: number; win_rate: number }>(
    `SELECT COUNT(*) total,
            COALESCE(SUM(status IN ('won','lost')), 0) answered,
            COALESCE(SUM(status = 'pending'), 0)      pending,
            COALESCE(SUM(expires_at < NOW() AND status = 'pending'), 0) expired,
            COALESCE(ROUND(100 * SUM(status = 'won') / NULLIF(SUM(status IN ('won','lost')), 0)), 0) win_rate
       FROM challenges`
  );

  const total = Number(stats[0]?.total ?? 0);
  const answered = Number(stats[0]?.answered ?? 0);
  const rate = total > 0 ? Math.round((answered / total) * 100) : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Challenges</h1>
          <p className="page-sub">
            {fmtNumber(total)} created · {fmtNumber(answered)} answered ·{" "}
            {rate}% answer rate · {fmtNumber(Number(stats[0]?.win_rate ?? 0))}% answered by beating
            the original score
          </p>
        </div>
      </div>

      {total > 0 && answered === 0 ? (
        <div className="card" style={{ marginBottom: 14, borderColor: "#fcd34d", background: "#fffbeb" }}>
          <strong>No challenge has been answered yet.</strong> The share flow may not be
          reachable from the result screen. Check that the app posts to /api/challenges
          and surfaces the returned shareUrl.
        </div>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Challenger</th>
              <th className="num">Their score</th>
              <th>Responder</th>
              <th className="num">Their score</th>
              <th className="num">Margin</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty">No challenges yet.</div>
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const margin =
                  row.challenee_score === null
                    ? null
                    : Number(row.challenee_score) - Number(row.challenger_score);

                return (
                  <tr key={row.id} className={row.expired ? "inactive" : ""}>
                    <td className="mono">{row.code}</td>
                    <td>{row.challenger_name}</td>
                    <td className="num mono">{fmtNumber(row.challenger_score)}</td>
                    <td>
                      {row.challenee_name ?? (
                        <span style={{ color: "#94a3b8" }}>nobody yet</span>
                      )}
                    </td>
                    <td className="num mono">
                      {row.challenee_score === null ? "—" : fmtNumber(row.challenee_score)}
                    </td>
                    <td className="num mono">
                      {margin === null ? (
                        "—"
                      ) : (
                        <span style={{ color: margin > 0 ? "#15803d" : margin < 0 ? "#b91c1c" : "#64748b" }}>
                          {margin > 0 ? `+${fmtNumber(margin)}` : fmtNumber(margin)}
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          row.status === "won"
                            ? "badge badge-green"
                            : row.status === "lost"
                              ? "badge badge-red"
                              : row.status === "expired"
                                ? "badge badge-gray"
                                : "badge badge-amber"
                        }
                      >
                        {row.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: "#64748b" }}>{fmtDate(row.created_at)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="hint">
        Every challenge carries a 7-day expiry. Expired links return 410 rather than
        silently failing, so the app can show a clear &quot;this challenge has
        expired&quot; and offer a rematch.
      </p>
    </>
  );
}
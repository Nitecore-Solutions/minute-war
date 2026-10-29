import { query } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";
import { fmtDate, fmtNumber } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Live battles.
 *
 * The WebSocket server writes a row on create and updates it as the battle
 * progresses, so this is a read-only window onto realtime activity. It is also
 * the first place a stuck battle (status left as `active` far too long) would
 * be visible.
 */
export default async function AdminBattles() {
  const rooms = await query<
    RowDataPacket & {
      id: number;
      code: string;
      status: string;
      host_name: string | null;
      guest_name: string | null;
      host_score: number;
      guest_score: number;
      winner_name: string | null;
      duration_seconds: number;
      started_at: string | null;
      finished_at: string | null;
      created_at: string;
    }
  >(
    `SELECT b.id, b.code, b.status, b.host_score, b.guest_score,
            b.duration_seconds, b.started_at, b.finished_at, b.created_at,
            h.name AS host_name,
            g.name AS guest_name,
            w.name AS winner_name
       FROM battle_rooms b
       LEFT JOIN users h ON h.id = b.host_id
       LEFT JOIN users g ON g.id = b.guest_id
       LEFT JOIN users w ON w.id = b.winner_id
      ORDER BY b.created_at DESC
      LIMIT 60`
  );

  const stats = await query<RowDataPacket & { total: number; finished: number; live: number; abandoned: number }>(
    `SELECT COUNT(*) total,
            COALESCE(SUM(status = 'finished'), 0) finished,
            COALESCE(SUM(status IN ('waiting','countdown','active')), 0) live,
            COALESCE(SUM(guest_id IS NULL), 0) abandoned
       FROM battle_rooms`
  );

  const tone = (status: string) =>
    status === "finished"
      ? "badge badge-gray"
      : status === "active"
        ? "badge badge-green"
        : status === "waiting"
          ? "badge badge-amber"
          : "badge badge-blue";

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">1v1 battles</h1>
          <p className="page-sub">
            {fmtNumber(Number(stats[0]?.total ?? 0))} rooms ·{" "}
            {fmtNumber(Number(stats[0]?.finished ?? 0))} finished ·{" "}
            {fmtNumber(Number(stats[0]?.live ?? 0))} in progress ·{" "}
            {fmtNumber(Number(stats[0]?.abandoned ?? 0))} never filled
          </p>
        </div>
      </div>

      <p className="hint" style={{ marginBottom: 14 }}>
        Answers are graded on the WebSocket server against a key the client never
        receives. Tap-based game scores remain client-reported.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Room</th>
              <th>Host</th>
              <th>Guest</th>
              <th className="num">Score</th>
              <th>Winner</th>
              <th>Status</th>
              <th>Started</th>
              <th>Ended</th>
            </tr>
          </thead>
          <tbody>
            {rooms.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty">No battles yet. They appear here as soon as two players connect.</div>
                </td>
              </tr>
            ) : (
              rooms.map((room) => (
                <tr key={room.id} className={room.status === "finished" ? "" : ""}>
                  <td className="mono">{room.code}</td>
                  <td>{room.host_name ?? "—"}</td>
                  <td>{room.guest_name ?? <span style={{ color: "#94a3b8" }}>waiting</span>}</td>
                  <td className="num mono">
                    {Number(room.host_score)} – {Number(room.guest_score)}
                  </td>
                  <td>{room.winner_name ?? "—"}</td>
                  <td>
                    <span className={tone(room.status)}>{room.status}</span>
                  </td>
                  <td style={{ fontSize: 11, color: "#64748b" }}>{fmtDate(room.started_at)}</td>
                  <td style={{ fontSize: 11, color: "#64748b" }}>{fmtDate(room.finished_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
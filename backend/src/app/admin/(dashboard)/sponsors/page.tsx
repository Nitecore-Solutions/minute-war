import { query } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";
import { fmtDate, fmtNumber } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sponsor campaigns and ad placements: the two non-IAP revenue paths. */
export default async function AdminSponsors({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  const sponsors = await query<
    RowDataPacket & {
      id: number;
      name: string;
      slug: string;
      tagline: string | null;
      logo_url: string | null;
      game_name: string | null;
      game_emoji: string | null;
      starts_at: string;
      ends_at: string | null;
      reward_coins: number;
      active: number;
      live: number;
    }
  >(
    `SELECT s.*,
            g.name AS game_name, g.emoji AS game_emoji,
            (s.active = 1 AND s.starts_at <= NOW() AND (s.ends_at IS NULL OR s.ends_at >= NOW())) AS live
       FROM sponsors s
       LEFT JOIN mini_games g ON g.id = s.game_id
      ORDER BY s.active DESC, s.starts_at DESC`
  );

  const ads = await query<
    RowDataPacket & {
      id: number;
      placement: string;
      provider: string;
      unit_id: string | null;
      enabled: number;
      updated_at: string;
    }
  >("SELECT * FROM ad_config ORDER BY id");

  const games = await query<RowDataPacket & { id: number; name: string; emoji: string }>(
    "SELECT id, name, emoji FROM mini_games WHERE active = 1 ORDER BY sort_order"
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Sponsors &amp; ads</h1>
          <p className="page-sub">
            {sponsors.length} campaigns ·{" "}
            {sponsors.filter((s) => s.active).length} active ·{" "}
            {ads.filter((a) => a.enabled).length} ad placements live
          </p>
        </div>
      </div>

      {ok ? (
        <div className="card" style={{ marginBottom: 16, borderColor: "#86efac", background: "#f0fdf4" }}>
          {ok}
        </div>
      ) : null}
      {error ? <div className="error-text">{error}</div> : null}

      <section className="card" style={{ marginBottom: 18 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>New campaign</h2>
        <p className="page-sub" style={{ marginBottom: 14 }}>
          A sponsored game shows the sponsor&apos;s branding and can pay a coin reward
          for being played.
        </p>

        <form method="post" action="/api/admin/sponsors">
          <input type="hidden" name="intent" value="create" />

          <div className="inline-form">
            <label className="field">
              <span className="field-label">Sponsor name</span>
              <input className="input" name="name" placeholder="XYZ Telecom" required />
            </label>
            <label className="field" style={{ minWidth: 220 }}>
              <span className="field-label">Tagline</span>
              <input className="input" name="tagline" placeholder="Cricket Challenge powered by XYZ" />
            </label>
            <label className="field" style={{ minWidth: 220 }}>
              <span className="field-label">Logo URL</span>
              <input className="input" name="logoUrl" placeholder="https://..." />
            </label>
          </div>

          <div className="inline-form">
            <label className="field">
              <span className="field-label">Attach to game</span>
              <select className="select" name="gameId" defaultValue="">
                <option value="">None — app-wide</option>
                {games.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.emoji} {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Starts</span>
              <input className="input" name="startsAt" type="date" required />
            </label>
            <label className="field">
              <span className="field-label">Ends (optional)</span>
              <input className="input" name="endsAt" type="date" />
            </label>
            <label className="field">
              <span className="field-label">Reward coins</span>
              <input className="input" name="rewardCoins" type="number" min={0} max={10000} defaultValue={100} />
            </label>
          </div>

          <button className="btn btn-primary" type="submit">Create campaign</button>
        </form>
      </section>

      <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Campaigns</h2>
      <div className="table-wrap" style={{ marginBottom: 22 }}>
        <table>
          <thead>
            <tr>
              <th>Sponsor</th>
              <th>Game</th>
              <th className="num">Reward</th>
              <th>Window</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sponsors.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty">No campaigns yet.</div>
                </td>
              </tr>
            ) : (
              sponsors.map((row) => (
                <tr key={row.id} className={row.active ? "" : "inactive"}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{row.name}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{row.tagline ?? row.slug}</div>
                  </td>
                  <td>{row.game_name ? `${row.game_emoji} ${row.game_name}` : "App-wide"}</td>
                  <td className="num mono">{fmtNumber(row.reward_coins)}</td>
                  <td style={{ fontSize: 11, color: "#64748b" }}>
                    {fmtDate(row.starts_at)}
                    <br />
                    {row.ends_at ? `to ${fmtDate(row.ends_at)}` : "no end date"}
                  </td>
                  <td>
                    {row.live ? (
                      <span className="badge badge-green">Live</span>
                    ) : row.active ? (
                      <span className="badge badge-amber">Scheduled</span>
                    ) : (
                      <span className="badge badge-gray">Paused</span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <form method="post" action="/api/admin/sponsors">
                        <input type="hidden" name="intent" value="toggle" />
                        <input type="hidden" name="id" value={row.id} />
                        <button className="btn btn-sm" type="submit">
                          {row.active ? "Pause" : "Activate"}
                        </button>
                      </form>
                      <form method="post" action="/api/admin/sponsors">
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={row.id} />
                        <button className="btn btn-sm btn-danger" type="submit">Remove</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Ad placements</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Placement</th>
              <th>Provider</th>
              <th>Ad unit id</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {ads.map((row) => (
              <tr key={row.id}>
                <td className="mono">{row.placement}</td>
                <td>{row.provider}</td>
                <td>
                  <form method="post" action="/api/admin/ads" style={{ display: "flex", gap: 6 }}>
                    <input type="hidden" name="intent" value="unit" />
                    <input type="hidden" name="id" value={row.id} />
                    <input
                      className="input mono"
                      style={{ width: 260, fontSize: 12 }}
                      name="unitId"
                      defaultValue={row.unit_id ?? ""}
                      placeholder="ca-app-pub-.../..."
                    />
                    <button className="btn btn-sm" type="submit">Save</button>
                  </form>
                </td>
                <td>
                  {row.enabled ? (
                    <span className="badge badge-green">Live</span>
                  ) : (
                    <span className="badge badge-gray">Off</span>
                  )}
                </td>
                <td style={{ fontSize: 11, color: "#64748b" }}>{fmtDate(row.updated_at)}</td>
                <td>
                  <form method="post" action="/api/admin/ads">
                    <input type="hidden" name="intent" value="toggle" />
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="enabled" value={row.enabled ? "0" : "1"} />
                    <button className="btn btn-sm" type="submit">
                      {row.enabled ? "Disable" : "Enable"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="hint">
        AdMob requires a native build, so the app ships a placeholder banner until a
        real AdMob account is wired in. Placements can be switched off here at any
        time, which is the fast lever if ad load starts hurting retention.
      </p>
    </>
  );
}
import { query } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";
import { listGames } from "@/lib/games";
import { getIntSetting } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GameRow extends RowDataPacket {
  id: number;
  code: string;
  name: string;
  emoji: string;
  tagline: string | null;
  category: string;
  duration_seconds: number;
  max_score: number;
  coins_per_1000: number;
  config: unknown;
  color_from: string;
  color_to: string;
  active: number;
  is_premium: number;
  sort_order: number;
  question_count: number;
  times_played: number;
  best_score: number;
}

/**
 * Mini-game catalogue editor.
 *
 * Everything here is tunable without an app release: timing, scoring, coin
 * value, colours and the JSON config the client renders from. Turning a game
 * off removes it from the daily rotation immediately.
 */
export default async function AdminGames({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const editingId = sp.edit ? Number(sp.edit) : null;

  const games = await query<GameRow>(
    `SELECT g.*,
            (SELECT COUNT(*) FROM questions q WHERE q.game_id = g.id AND q.active = 1) AS question_count,
            (SELECT COUNT(*) FROM run_scores rs WHERE rs.game_id = g.id)                   AS times_played,
            (SELECT COALESCE(MAX(rs.score), 0) FROM run_scores rs WHERE rs.game_id = g.id)  AS best_score
       FROM mini_games g
      ORDER BY g.sort_order ASC, g.id ASC`
  );

  const dailyCount = await getIntSetting("daily_game_count", 3);
  const activeCount = games.filter((g) => g.active).length;

  const editing = editingId ? games.find((g) => g.id === editingId) ?? null : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Mini games</h1>
          <p className="page-sub">
            {activeCount} active · the daily challenge picks {dailyCount} · a random
            pick can leave a game out for days, so coverage is guaranteed per category
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
              <th>Game</th>
              <th className="num">Duration</th>
              <th className="num">Max score</th>
              <th className="num">Coins / 1000</th>
              <th className="num">Questions</th>
              <th className="num">Plays</th>
              <th className="num">Best</th>
              <th>Access</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {games.map((game) => (
              <tr key={game.id} className={game.active ? "" : "inactive"}>
                <td>
                  <div style={{ fontWeight: 700 }}>
                    {game.emoji} {game.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    {game.code} · {game.tagline ?? "—"}
                  </div>
                </td>
                <td className="num">{game.duration_seconds}s</td>
                <td className="num mono">{game.max_score}</td>
                <td className="num mono">{game.coins_per_1000}</td>
                <td className="num">{game.question_count}</td>
                <td className="num">{game.times_played}</td>
                <td className="num mono">{game.best_score}</td>
                <td>
                  {game.is_premium ? (
                    <span className="badge badge-purple">Premium</span>
                  ) : (
                    <span className="badge badge-green">Free</span>
                  )}
                </td>
                <td>
                  <div className="row-actions">
                    <a className="btn btn-sm" href={`/admin/games?edit=${game.id}`}>
                      Edit
                    </a>
                    <form method="post" action="/api/admin/games">
                      <input type="hidden" name="intent" value="toggle" />
                      <input type="hidden" name="id" value={game.id} />
                      <input type="hidden" name="active" value={game.active ? "0" : "1"} />
                      <button className="btn btn-sm" type="submit">
                        {game.active ? "Disable" : "Enable"}
                      </button>
                    </form>
                    <form method="post" action="/api/admin/games">
                      <input type="hidden" name="intent" value="premium" />
                      <input type="hidden" name="id" value={game.id} />
                      <input type="hidden" name="isPremium" value={game.is_premium ? "0" : "1"} />
                      <button className="btn btn-sm" type="submit">
                        {game.is_premium ? "Make free" : "Make premium"}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing ? (
        <section className="card" style={{ marginTop: 18 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>
            Edit {editing.emoji} {editing.name}
          </h2>
          <p className="page-sub" style={{ marginBottom: 16 }}>
            Changes take effect on the next app launch. Games already in a player&apos;s
            daily run keep the timing they started with.
          </p>

          <form method="post" action="/api/admin/games">
            <input type="hidden" name="intent" value="save" />
            <input type="hidden" name="id" value={editing.id} />

            <div className="inline-form">
              <label className="field">
                <span className="field-label">Name</span>
                <input className="input" name="name" defaultValue={editing.name} required />
              </label>
              <label className="field" style={{ maxWidth: 90 }}>
                <span className="field-label">Emoji</span>
                <input className="input" name="emoji" defaultValue={editing.emoji} required />
              </label>
              <label className="field" style={{ flex: 1, minWidth: 240 }}>
                <span className="field-label">Tagline</span>
                <input className="input" name="tagline" defaultValue={editing.tagline ?? ""} />
              </label>
            </div>

            <div className="inline-form">
              <label className="field">
                <span className="field-label">Duration (s)</span>
                <input className="input" name="durationSeconds" type="number" min={5} max={600} defaultValue={editing.duration_seconds} />
              </label>
              <label className="field">
                <span className="field-label">Max score</span>
                <input className="input" name="maxScore" type="number" min={1} defaultValue={editing.max_score} />
              </label>
              <label className="field">
                <span className="field-label">Coins per 1000</span>
                <input className="input" name="coinsPer1000" type="number" min={0} defaultValue={editing.coins_per_1000} />
              </label>
              <label className="field">
                <span className="field-label">Sort order</span>
                <input className="input" name="sortOrder" type="number" min={0} defaultValue={editing.sort_order} />
              </label>
            </div>

            <div className="inline-form">
              <label className="field" style={{ maxWidth: 140 }}>
                <span className="field-label">Colour from</span>
                <input className="input" name="colorFrom" defaultValue={editing.color_from} />
              </label>
              <label className="field" style={{ maxWidth: 140 }}>
                <span className="field-label">Colour to</span>
                <input className="input" name="colorTo" defaultValue={editing.color_to} />
              </label>
            </div>

            <label className="field">
              <span className="field-label">Config (JSON, read by the app)</span>
              <textarea
                className="textarea mono"
                name="config"
                defaultValue={
                  editing.config
                    ? typeof editing.config === "string"
                      ? editing.config
                      : JSON.stringify(editing.config, null, 2)
                    : ""
                }
              />
            </label>

            <div className="row-actions">
              <button className="btn btn-primary" type="submit">Save changes</button>
              <a className="btn" href="/admin/games">Cancel</a>
            </div>

            <p className="hint">
              The config blob drives the game screen. Leaving it blank keeps the
              current one.
            </p>
          </form>
        </section>
      ) : null}
    </>
  );
}
import { query } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";
import { fmtNumber } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface QuestionRow extends RowDataPacket {
  id: number;
  game_id: number;
  game_name: string;
  game_emoji: string;
  game_code: string;
  prompt: string;
  options: unknown;
  correct_index: number;
  explanation: string | null;
  difficulty: string;
  points: number;
  active: number;
  usage_count: number;
}

const PER_PAGE = 25;

function toOptions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Question bank editor.
 *
 * The correct answer is stored server-side and never leaves the API for
 * players, so this is the only place it is visible. That makes it the most
 * sensitive content surface in the app: an admin can publish a question
 * straight to production, which is why edits are audited.
 */
export default async function AdminQuestions({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const gameFilter = typeof sp.game === "string" ? sp.game : "";
  const editId = sp.edit ? Number(sp.edit) : null;
  const showNew = sp.new === "1";

  const rawPage = Number(sp.page ?? 1);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const offset = (page - 1) * PER_PAGE;

  const where: string[] = ["1 = 1"];
  const params: (string | number)[] = [];

  if (q) {
    where.push("q.prompt LIKE ?");
    params.push(`%${q}%`);
  }
  if (gameFilter) {
    where.push("g.code = ?");
    params.push(gameFilter);
  }
  const whereSql = where.join(" AND ");

  const questions = await query<QuestionRow>(
    `SELECT q.*, g.name game_name, g.emoji game_emoji, g.code game_code
       FROM questions q JOIN mini_games g ON g.id = q.game_id
      WHERE ${whereSql}
      ORDER BY q.usage_count ASC, q.id DESC
      LIMIT ? OFFSET ?`,
    [...params, PER_PAGE, offset]
  );

  const games = await query<RowDataPacket & { id: number; code: string; name: string; emoji: string; n: number }>(
    `SELECT g.id, g.code, g.name, g.emoji,
            (SELECT COUNT(*) FROM questions q WHERE q.game_id = g.id) n
       FROM mini_games g ORDER BY g.sort_order`
  );

  const totals = await query<RowDataPacket & { total: number; active: number }>(
    "SELECT COUNT(*) total, COALESCE(SUM(active = 1), 0) active FROM questions"
  );

  const editing = editId
    ? questions.find((item) => item.id === editId) ??
      (await query<QuestionRow>(
        `SELECT q.*, g.name game_name, g.emoji game_emoji, g.code game_code
           FROM questions q JOIN mini_games g ON g.id = q.game_id WHERE q.id = ?`,
        [editId]
      ))[0]
    : null;

  const total = Number(totals[0]?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Question bank</h1>
          <p className="page-sub">
            {fmtNumber(total)} questions · {fmtNumber(Number(totals[0]?.active ?? 0))} active ·
            served least-used first so the bank rotates
          </p>
        </div>
        <a className="btn btn-primary" href="/admin/questions?new=1">
          Add question
        </a>
      </div>

      {ok ? (
        <div className="card" style={{ marginBottom: 16, borderColor: "#86efac", background: "#f0fdf4" }}>
          {ok}
        </div>
      ) : null}
      {error ? <div className="error-text">{error}</div> : null}

      <form className="toolbar" method="get">
        <input className="input" style={{ maxWidth: 320 }} name="q" defaultValue={q} placeholder="Search questions" />
        <select className="select" style={{ maxWidth: 200 }} name="game" defaultValue={gameFilter}>
          <option value="">All games</option>
          {games.map((g) => (
            <option key={g.id} value={g.code}>
              {g.emoji} {g.name} ({g.n})
            </option>
          ))}
        </select>
        <button className="btn btn-primary" type="submit">Filter</button>
        {q || gameFilter ? <a className="btn" href="/admin/questions">Reset</a> : null}
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Question</th>
              <th>Game</th>
              <th className="num">Points</th>
              <th>Level</th>
              <th className="num">Served</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {questions.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty">No questions match that search.</div>
                </td>
              </tr>
            ) : (
              questions.map((item) => {
                const options = toOptions(item.options);
                return (
                  <tr key={item.id} className={item.active ? "" : "inactive"}>
                    <td style={{ maxWidth: 460 }}>
                      <div style={{ fontWeight: 600 }}>{item.prompt}</div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                        {options.map((opt, i) => (
                          <span
                            key={i}
                            style={{
                              color: i === item.correct_index ? "#15803d" : undefined,
                              fontWeight: i === item.correct_index ? 700 : 400,
                            }}
                          >
                            {i === item.correct_index ? "✓ " : "· "}
                            {opt}
                            {i < options.length - 1 ? "   " : ""}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {item.game_emoji} {item.game_name}
                    </td>
                    <td className="num mono">{item.points}</td>
                    <td>
                      <span
                        className={
                          item.difficulty === "hard"
                            ? "badge badge-red"
                            : item.difficulty === "medium"
                              ? "badge badge-amber"
                              : "badge badge-green"
                        }
                      >
                        {item.difficulty}
                      </span>
                    </td>
                    <td className="num">{item.usage_count}</td>
                    <td>
                      {item.active ? (
                        <span className="badge badge-green">Active</span>
                      ) : (
                        <span className="badge badge-gray">Retired</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <a className="btn btn-sm" href={`/admin/questions?edit=${item.id}`}>
                          Edit
                        </a>
                        <form method="post" action="/api/admin/questions">
                          <input type="hidden" name="intent" value="toggle" />
                          <input type="hidden" name="id" value={item.id} />
                          <button className="btn btn-sm" type="submit">
                            {item.active ? "Retire" : "Restore"}
                          </button>
                        </form>
                        <form method="post" action="/api/admin/questions">
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="id" value={item.id} />
                          <button className="btn btn-sm btn-danger" type="submit">
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <div className="toolbar" style={{ marginTop: 14, justifyContent: "center" }}>
          {page > 1 ? (
            <a className="btn btn-sm" href={`/admin/questions?q=${encodeURIComponent(q)}&game=${gameFilter}&page=${page - 1}`}>
              Previous
            </a>
          ) : null}
          <span style={{ fontSize: 13, color: "#64748b" }}>
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <a className="btn btn-sm" href={`/admin/questions?q=${encodeURIComponent(q)}&game=${gameFilter}&page=${page + 1}`}>
              Next
            </a>
          ) : null}
        </div>
      ) : null}

      {showNew || editing ? (
        <section className="card" style={{ marginTop: 18 }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 16 }}>
            {editing ? `Edit question #${editing.id}` : "New question"}
          </h2>

          <QuestionForm
            action="/api/admin/questions"
            intent={editing ? "update" : "create"}
            id={editing?.id}
            games={games}
            defaults={
              editing
                ? {
                    gameId: editing.game_id,
                    prompt: editing.prompt,
                    options: toOptions(editing.options),
                    correct: editing.correct_index,
                    explanation: editing.explanation ?? "",
                    difficulty: editing.difficulty,
                    points: editing.points,
                  }
                : undefined
            }
            cancelHref="/admin/questions"
          />
        </section>
      ) : null}
    </>
  );
}

/** Shared create/edit form. */
function QuestionForm({
  action,
  intent,
  id,
  games,
  defaults,
  cancelHref,
}: {
  action: string;
  intent: "create" | "update";
  id?: number;
  games: Array<{ id: number; code: string; name: string; emoji: string; n: number }>;
  defaults?: {
    gameId: number;
    prompt: string;
    options: string[];
    correct: number;
    explanation: string;
    difficulty: string;
    points: number;
  };
  cancelHref: string;
}) {
  const letters = ["A", "B", "C", "D"];

  return (
    <form method="post" action={action}>
      <input type="hidden" name="intent" value={intent} />
      {id ? <input type="hidden" name="id" value={id} /> : null}

      <div className="inline-form">
        <label className="field">
          <span className="field-label">Game</span>
          <select className="select" name="gameId" defaultValue={defaults?.gameId ?? games[0]?.id}>
            {games.map((g) => (
              <option key={g.id} value={g.id} disabled={intent === "update"}>
                {g.emoji} {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Difficulty</span>
          <select className="select" name="difficulty" defaultValue={defaults?.difficulty ?? "easy"}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Points</span>
          <input className="input" name="points" type="number" min={10} max={1000} defaultValue={defaults?.points ?? 100} />
        </label>
      </div>

      <label className="field">
        <span className="field-label">Question</span>
        <textarea className="textarea" name="prompt" defaultValue={defaults?.prompt} required />
      </label>

      {letters.map((letter, i) => (
        <label className="field" key={letter}>
          <span className="field-label">Option {letter}</span>
          <input className="input" name={`option${letter}`} defaultValue={defaults?.options?.[i] ?? ""} required />
        </label>
      ))}

      <div className="inline-form">
        <label className="field">
          <span className="field-label">Correct answer</span>
          <select className="select" name="correct" defaultValue={defaults?.correct ?? 0}>
            {letters.map((letter, i) => (
              <option key={letter} value={i}>
                {letter}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: 1, minWidth: 260 }}>
          <span className="field-label">Explanation (shown after answering)</span>
          <input className="input" name="explanation" defaultValue={defaults?.explanation ?? ""} />
        </label>
      </div>

      <div className="row-actions">
        <button className="btn btn-primary" type="submit">
          {intent === "create" ? "Add question" : "Save changes"}
        </button>
        <a className="btn" href={cancelHref}>Cancel</a>
      </div>

      <p className="hint">
        The correct answer is stored server-side and is never sent to the app, so
        players cannot read it off the network.
      </p>
    </form>
  );
}
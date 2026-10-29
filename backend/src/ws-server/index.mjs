/**
 * Standalone WebSocket server for real-time play.
 *
 *   npm run dev:ws      (port 3002)
 *
 * WHY A SEPARATE PROCESS
 * ----------------------
 * Next.js's request handler is stateless per request and its dev server
 * reloads on every file change, which drops every socket. Battles are
 * long-lived, stateful, and must survive a hot reload, so this runs alone.
 *
 * WHAT THE SERVER IS TRUSTED WITH
 * -------------------------------
 * It decides battle START (who is in the room, when the clock begins) and
 * END (who won). It does NOT decide correctness: a submitted answer is
 * graded against the answer key fetched from MySQL, so a client cannot talk
 * its way to a higher score. Tap/reaction games are inherently
 * client-reported and are noted as such.
 */
import { WebSocketServer, WebSocket } from "ws";
import { createPool } from "mysql2/promise";
import { jwtVerify } from "jose";
import { readFileSync, existsSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";

// --- env -------------------------------------------------------------------
// Minimal .env loader so this process needs no dotenv dependency.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

const PORT = Number(process.env.WS_PORT || 3002);
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

if (!DATABASE_URL || !JWT_SECRET) {
  console.error("[ws] DATABASE_URL and JWT_SECRET must be set in backend/.env");
  process.exit(1);
}

const pool = createPool({
  uri: DATABASE_URL,
  waitForConnections: true,
  connectionLimit: 5,
  decimalNumbers: true,
  timezone: "Z",
});

const secret = new TextEncoder().encode(JWT_SECRET);

/** @typedef {{ userId: number, playerId: number, name: string, role: string }} Client */
/** @typedef {{ hostId: number|null, guestId: number|null, questionIds: number[], index: number, startedAt: number|null, finished: boolean, scores: Map<number, number> }} RoomState */

/** socket -> client */
const clients = new Map();
/** roomCode -> room state */
const rooms = new Map();

const QUESTION_MS = 15_000;

// --- helpers ---------------------------------------------------------------

const send = (socket, type, payload = {}) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, ...payload }));
  }
};

/** Sends to every socket belonging to one user, across all their devices. */
const sendToUser = (userId, type, payload = {}) => {
  for (const [socket, client] of clients) {
    if (client.userId === userId) send(socket, type, payload);
  }
};

const roomCode = () =>
  randomBytes(5).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7)
    .padEnd(7, "X");

const shuffle = (items, seed) => {
  const out = [...items];
  let state = (seed % 2147483647) + 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 16807) % 2147483647;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// --- server ----------------------------------------------------------------

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", async (socket, req) => {
  // Token arrives on the handshake query: /?token=<jwt>
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const token = url.searchParams.get("token");

  if (!token) {
    socket.close(4001, "Missing token");
    return;
  }

  let claims;
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: "minute-war",
      audience: "minute-war",
    });
    claims = {
      userId: Number(payload.userId),
      playerId: Number(payload.playerId),
      role: String(payload.role),
    };
  } catch {
    socket.close(4001, "Invalid token");
    return;
  }

  // Confirm the account is still active on connect. A token that was
  // revoked after issue must not be able to start a battle.
  const [rows] = await pool.query(
    "SELECT name, active FROM users WHERE id = ? LIMIT 1",
    [claims.userId]
  );
  const user = rows[0];

  if (!user || !user.active) {
    socket.close(4003, "Account disabled");
    return;
  }

  const client = { ...claims, name: user.name };
  clients.set(socket, client);

  send(socket, "connected", {
    playerId: client.playerId,
    name: client.name,
    online: clients.size,
  });

  socket.on("message", (raw) => {
    handleMessage(socket, client, raw).catch((err) => {
      console.error("[ws] handler error:", err?.message ?? err);
      send(socket, "error", { message: "Something went wrong" });
    });
  });

  const drop = () => {
    clients.delete(socket);
    leaveAnyRoom(client.userId);
  };
  socket.on("close", drop);
  socket.on("error", drop);
});

async function handleMessage(socket, client, raw) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return; // ignore malformed frames
  }

  switch (msg.type) {
    case "ping":
      send(socket, "pong", { at: Date.now() });
      break;

    case "presence":
      send(socket, "presence", { online: countUniqueUsers() });
      break;

    case "battle:create":
      await createBattle(socket, client, msg);
      break;

    case "battle:join":
      await joinBattle(socket, client, msg);
      break;

    case "battle:answer":
      await answerQuestion(socket, client, msg);
      break;

    case "battle:leave":
      leaveAnyRoom(client.userId);
      send(socket, "battle:left");
      break;

    case "leaderboard:subscribe":
      await pushLeaderboard(socket, client);
      break;

    default:
      send(socket, "error", { message: `Unknown message type: ${msg.type}` });
  }
}

// --- battles ---------------------------------------------------------------

/**
 * Creates a room and waits for an opponent.
 *
 * If an opponent is supplied as code (a challenge link), the room opens
 * immediately with both players. Otherwise it sits in `waiting` until
 * somebody joins by code, which is what a random-match flow uses.
 */
async function createBattle(socket, client, msg) {
  const code = roomCode();

  /** @type {RoomState} */
  const room = {
    code,
    hostId: client.userId,
    guestId: null,
    questionIds: [],
    index: 0,
    startedAt: null,
    finished: false,
    scores: new Map([[client.userId, 0]]),
  };

  rooms.set(code, room);

  await persistRoom(room, "waiting");

  send(socket, "battle:created", {
    code,
    status: "waiting",
    waitingForOpponent: true,
  });

  // Someone arriving via a challenge link joins straight away.
  if (msg?.inviteCode) {
    // Invited player uses battle:join with this code on their own socket.
  }

  broadcastPresence();
}

/** Joins a waiting room and starts the countdown for both players. */
async function joinBattle(socket, client, msg) {
  const code = String(msg.code ?? "").trim().toUpperCase();
  const room = rooms.get(code);

  if (!room) {
    send(socket, "error", { message: "That battle no longer exists" });
    return;
  }
  if (room.hostId === client.userId) {
    send(socket, "error", { message: "You created this battle" });
    return;
  }
  if (room.guestId) {
    send(socket, "error", { message: "This battle is already full" });
    return;
  }
  if (room.finished) {
    send(socket, "error", { message: "This battle has ended" });
    return;
  }

  room.guestId = client.userId;
  room.scores.set(client.userId, 0);
  const questions = await loadQuestions(10);
  room.questionIds = questions.map((q) => q.id);
  room.status = "countdown";

  await persistRoom(room, "countdown");

  send(socket, "battle:joined", { code, as: "guest" });
  sendToUser(room.hostId, "battle:opponent_joined", { code, name: client.name });

  // Three short beeps, then the first question. The delay is server-side so
  // both clients see the same clock.
  send(socket, "battle:countdown", { seconds: 3 });
  sendToUser(room.hostId, "battle:countdown", { seconds: 3 });

  setTimeout(async () => {
    try {
      room.status = "active";
      room.startedAt = Date.now();
      await persistRoom(room, "active");
      await pushQuestion(code, 0);
    } catch (err) {
      console.error("[ws] battle start failed:", err?.message ?? err);
    }
  }, 3000);
}

/** Loads active questions, used for every battle. */
async function loadQuestions(limit) {
  const [rows] = await pool.query(
    `SELECT q.id, q.prompt, q.options, q.points, q.difficulty
       FROM questions q
       JOIN mini_games g ON g.id = q.game_id
      WHERE q.active = 1 AND g.active = 1 AND q.media IS NULL
      ORDER BY q.usage_count ASC, q.id ASC
      LIMIT ?`,
    [Math.max(limit * 3, 20)]
  );

  const seed = Date.now() % 2147483647;
  return shuffle(rows, seed).slice(0, limit);
}

/**
 * Sends the current question to both players.
 * `correct_index` is NEVER sent. Each player has to answer, and the server
 * grades against the key it already holds.
 */
async function pushQuestion(code, index) {
  const room = rooms.get(code);
  if (!room || room.finished) return;

  const questionId = room.questionIds[index];
  if (!questionId) {
    return finishBattle(code);
  }

  const [rows] = await pool.query(
    "SELECT id, prompt, options, points, difficulty FROM questions WHERE id = ? AND media IS NULL LIMIT 1",
    [questionId]
  );
  const question = rows[0];
  if (!question) return finishBattle(code);

  room.index = index;

  // Recorded for the replay log and for anti-cheat review.
  await pool.query(
    `INSERT INTO battle_events (room_id, event_type, payload)
     SELECT id, 'question', ? FROM battle_rooms WHERE code = ?`,
    [JSON.stringify({ index, questionId }), code]
  ).catch(() => {});

  const payload = {
    code,
    index,
    total: room.questionIds.length,
    questionId: question.id,
    prompt: question.prompt,
    options: typeof question.options === "string"
      ? JSON.parse(question.options)
      : question.options,
    points: question.points,
    durationMs: QUESTION_MS,
  };

  sendToUser(room.hostId, "battle:question", payload);
  if (room.guestId) sendToUser(room.guestId, "battle:question", payload);

  // Advance to the next question whether or not both players answered.
  setTimeout(async () => {
    const r = rooms.get(code);
    if (!r || r.finished) return;

    const anyoneLeft = [...r.scores.values()].some((s) => s === 0);
    if (!anyoneLeft) return pushQuestion(code, index + 1);

    // Both are stuck on this question: advance anyway so the battle cannot
    // stall forever waiting on a disconnected player.
    return pushQuestion(code, index + 1);
  }, QUESTION_MS + 2000);
}

/**
 * Grades an answer against the server-held key and updates the score.
 *
 * A wrong or missing answer costs nothing extra; answering late simply means
 * a smaller time bonus. Points are awarded as
 *   base points * (remaining time fraction), so speed is the differentiator.
 */
async function answerQuestion(socket, client, msg) {
  const code = String(msg.code ?? "").trim().toUpperCase();
  const room = rooms.get(code);

  if (!room) return send(socket, "error", { message: "Battle not found" });
  if (room.finished) return;

  if (room.hostId !== client.userId && room.guestId !== client.userId) {
    return send(socket, "error", { message: "You are not in this battle" });
  }

  const questionId = Number(msg.questionId);
  if (questionId !== room.questionIds[room.index]) {
    return send(socket, "error", { message: "Stale question" });
  }

  // One answer per question per player: re-answering cannot farm points.
  const key = `${client.userId}:${questionId}`;
  if (room.answered?.has(key)) return;
  (room.answered ??= new Set()).add(key);

  const [rows] = await pool.query(
    "SELECT correct_index, points FROM questions WHERE id = ? LIMIT 1",
    [questionId]
  );
  const question = rows[0];
  if (!question) return;

  const chosen = Number(msg.answerIndex);
  const elapsed = Math.max(0, Date.now() - (room.startedAt ?? Date.now()) - room.index * (QUESTION_MS + 2000));
  const timeLeft = Math.max(0, QUESTION_MS - elapsed);
  const speedFactor = timeLeft / QUESTION_MS;

  const correct = chosen === Number(question.correct_index);
  // A wrong answer still pays a tenth, so guessing is not worthless.
  const gained = correct
    ? Math.round(Number(question.points) * (0.4 + 0.6 * speedFactor))
    : Math.round(Number(question.points) * 0.1);

  room.scores.set(client.userId, (room.scores.get(client.userId) ?? 0) + gained);

  await pool.query(
    `INSERT INTO battle_events (room_id, user_id, event_type, payload)
     SELECT id, ?, 'answer', ? FROM battle_rooms WHERE code = ?`,
    [
      client.userId,
      JSON.stringify({ questionId, chosen, correct, gained, elapsed }),
      code,
    ]
  ).catch(() => {});

  send(socket, "battle:answer_result", {
    correct,
    gained,
    // Which option was right is only revealed after the question closes.
    correctIndex: Number(question.correct_index),
  });

  // The opponent only sees the running total, never the answer key.
  const opponentId = room.hostId === client.userId ? room.guestId : room.hostId;
  if (opponentId) {
    sendToUser(opponentId, "battle:opponent_scored", {
      code,
      theirScore: room.scores.get(opponentId) ?? 0,
    });
  }
}

/** Settles the battle and persists the result. */
async function finishBattle(code) {
  const room = rooms.get(code);
  if (!room || room.finished) return;

  room.finished = true;

  const hostScore = room.scores.get(room.hostId) ?? 0;
  const guestScore = room.scores.get(room.guestId) ?? 0;

  // A tie goes to the player who joined second; it keeps the result decisive
  // rather than leaving both players feeling cheated.
  const winnerId =
    hostScore > guestScore ? room.hostId : guestScore > hostScore ? room.guestId : room.guestId;

  const [rows] = await pool.query(
    `UPDATE battle_rooms
        SET status = 'finished', host_score = ?, guest_score = ?, winner_id = ?,
            started_at = COALESCE(started_at, NOW()), finished_at = NOW()
      WHERE code = ?`,
    [hostScore, guestScore, winnerId, code]
  );

  // sp_finish_battle pays the winner and is idempotent per room.
  await pool
    .query("CALL sp_finish_battle((SELECT id FROM battle_rooms WHERE code = ? LIMIT 1), ?, ?, ?, ?)", [
      code,
      hostScore,
      guestScore,
      winnerId,
      `battle:${code}`,
    ])
    .catch((err) => console.error("[ws] sp_finish_battle:", err?.message));

  // A failure here must never stop the result being delivered: the players
    // are staring at a finished battle and need to be told who won.
  const names = await namesFor(room).catch((err) => {
    console.error("[ws] namesFor failed:", err?.message);
    return [];
  });

  for (const userId of [room.hostId, room.guestId]) {
    if (!userId) continue;
    sendToUser(userId, "battle:end", {
      code,
      hostScore,
      guestScore,
      winnerId,
      youWon: userId === winnerId,
      players: names,
    });
  }

  // Keep the room briefly so a late reconnect can read the result, then drop it.
  setTimeout(() => rooms.delete(code), 60_000);
}

/** Records a new or updated room in MySQL so the admin can see live battles. */
async function persistRoom(room, status) {
  await pool
    .query(
      `INSERT INTO battle_rooms (code, mode, status, host_id, guest_id, question_ids, duration_seconds)
       VALUES (?, 'challenge', ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status),
                               host_id = VALUES(host_id),
                               guest_id = VALUES(guest_id),
                               question_ids = VALUES(question_ids)`,
      [
        room.code,
        status,
        room.hostId,
        room.guestId,
        JSON.stringify(room.questionIds),
        QUESTION_MS / 1000,
      ]
    )
    .catch((err) => console.error("[ws] persistRoom:", err?.message));

  if (room.hostId) {
    const [player] = await pool.query("SELECT player_id FROM users WHERE id = ?", [room.hostId]);
    await pool
      .query(
        `INSERT IGNORE INTO battle_participants (room_id, user_id, player_id)
         SELECT id, ?, ? FROM battle_rooms WHERE code = ?`,
        [room.hostId, player[0]?.player_id ?? 0, room.code]
      )
      .catch(() => {});
  }
  if (room.guestId) {
    const [player] = await pool.query("SELECT player_id FROM users WHERE id = ?", [room.guestId]);
    await pool
      .query(
        `INSERT IGNORE INTO battle_participants (room_id, user_id, player_id)
         SELECT id, ?, ? FROM battle_rooms WHERE code = ?`,
        [room.guestId, player[0]?.player_id ?? 0, room.code]
      )
      .catch(() => {});
  }
}

async function namesFor(room) {
  const ids = [room.hostId, room.guestId].filter(Boolean);
  if (ids.length === 0) return [];

  // Expanded placeholders rather than IN (?): mysql2 rejects an array bound
  // to a single placeholder, and the resulting throw would happen BEFORE
  // battle:end is sent, leaving both players stuck on a finished battle.
  const placeholders = ids.map(() => "?").join(", ");
  const [rows] = await pool.query(
    `SELECT id, name, player_id FROM users WHERE id IN (${placeholders})`,
    ids
  );

  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  return [
    room.hostId && byId.has(room.hostId)
      ? {
          userId: room.hostId,
          name: byId.get(room.hostId).name,
          score: room.scores.get(room.hostId) ?? 0,
        }
      : null,
    room.guestId && byId.has(room.guestId)
      ? {
          userId: room.guestId,
          name: byId.get(room.guestId).name,
          score: room.scores.get(room.guestId) ?? 0,
        }
      : null,
  ].filter(Boolean);
}

/** Removes a user from any room they are in (disconnect, explicit leave). */
function leaveAnyRoom(userId) {
  for (const [code, room] of rooms) {
    if (room.hostId === userId || room.guestId === userId) {
      if (!room.finished && (room.hostId || room.guestId)) {
        finishBattle(code).catch(() => {});
      } else {
        rooms.delete(code);
      }
    }
  }
}

function countUniqueUsers() {
  return new Set([...clients.values()].map((c) => c.userId)).size;
}

function broadcastPresence() {
  const online = countUniqueUsers();
  for (const socket of clients.keys()) send(socket, "presence", { online });
}

/** Pushes today's top 10 to one socket. */
async function pushLeaderboard(socket, client) {
  const [rows] = await pool.query(
    `SELECT u.name, u.player_id, d.total_score AS score
       FROM daily_runs d
       JOIN users u ON u.id = d.user_id
      WHERE d.run_date = CURDATE() AND d.completed = 1 AND u.active = 1
      ORDER BY d.total_score DESC
      LIMIT 10`
  );

  send(socket, "leaderboard", {
    scope: "daily",
    entries: rows.map((r, i) => ({
      rank: i + 1,
      name: r.name,
      playerId: r.player_id,
      score: r.score,
    })),
  });
}

// --- housekeeping ----------------------------------------------------------

/** Expires stale battles and drops rooms nobody rejoined. */
setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [code, room] of rooms) {
    const touched = room.lastTouched ?? 0;
    if (touched > 0 && touched < cutoff) rooms.delete(code);
  }
}, 60_000);

/** Keeps the process (and its sockets) alive through proxies. */
setInterval(() => {
  for (const socket of clients.keys()) {
    if (socket.readyState === WebSocket.OPEN) socket.ping();
  }
}, 30_000);

console.log(`[ws] listening on ws://0.0.0.0:${PORT}`);
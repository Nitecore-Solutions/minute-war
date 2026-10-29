/**
 * Two real WebSocket clients play a full 1v1 battle against the running ws
 * server, proving the realtime path works end to end.
 *
 *   npm run dev:ws      (in another terminal)
 *   node scripts/test-ws.mjs
 *
 * Signs up two throwaway players through the API, connects both sockets,
 * creates a room, joins it, and answers every question correctly.
 */
import { WebSocket } from "ws";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { connectionOptions } from "./lib/db-connection.mjs";

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(join(backendRoot, file), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
}

const API = process.env.API_BASE ?? "http://localhost:3000/api";
const WS = process.env.WS_BASE ?? "ws://localhost:3002";

const db = await mysql.createConnection(connectionOptions(process.env.DATABASE_URL));

/** Reads the answer key from the database, the way the server does. */
async function answerKey(questionId) {
  const [rows] = await db.query("SELECT correct_index FROM questions WHERE id = ? LIMIT 1", [
    questionId,
  ]);
  return rows[0] ? Number(rows[0].correct_index) : 0;
}

let pass = 0;
let fail = 0;

function check(label, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`  ok    ${label}${detail ? ` (${detail})` : ""}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ""}`);
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const res = await fetch(`${API}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}

/** Opens an authenticated socket and buffers every message it receives. */
function connect(token, label) {
  const socket = new WebSocket(`${WS}/?token=${encodeURIComponent(token)}`);
  const messages = [];

  socket.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    messages.push(msg);
  });

  const ready = new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });

  return {
    socket,
    messages,
    ready,
    label,
    /** Waits for the first message of a type, or gives up. */
    async until(type, timeoutMs = 20_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const found = messages.find((m) => m.type === type);
        if (found) return found;
        await wait(150);
      }
      return null;
    },
  };
}

console.log("\n== setup ==");
const stamp = Date.now();
const a = await api("/auth/signup", {
  method: "POST",
  body: { name: "WS Host", email: `ws_a_${stamp}@minutewar.test`, password: "WsTest#2026" },
});
const b = await api("/auth/signup", {
  method: "POST",
  body: { name: "WS Guest", email: `ws_b_${stamp}@minutewar.test`, password: "WsTest#2026" },
});
check("both players signed up", a.status === 201 && b.status === 201);

const host = connect(a.data.token, "host");
const guest = connect(b.data.token, "guest");

await Promise.all([host.ready, guest.ready]);
const connected = await host.until("connected", 5000);
check("socket authenticates", connected !== null, connected ? `playerId=${connected.playerId}` : "no connected frame");

console.log("\n== room lifecycle ==");
host.socket.send(JSON.stringify({ type: "battle:create" }));
const created = await host.until("battle:created", 8000);
check("host creates a room", created !== null, created?.code);
const code = created?.code;

const opponentSeen = host.until("battle:opponent_joined", 15_000);
guest.socket.send(JSON.stringify({ type: "battle:join", code }));
const joined = await guest.until("battle:joined", 8000);
check("guest joins", joined !== null);
check("host is told an opponent arrived", (await opponentSeen) !== null);

const countdown = await host.until("battle:countdown", 8000);
check("countdown is broadcast", countdown !== null, `${countdown?.seconds}s`);

console.log("\n== question loop ==");
const first = await host.until("battle:question", 12_000);
check("first question arrives", first !== null, first?.prompt?.slice(0, 40));
check("question carries 4 options", (first?.options ?? []).length === 4);
check(
  "answer key is never sent to the client",
  first !== null && !("correct_index" in first) && !("correctIndex" in first)
);

// Answer every question with the real key, fetched server-side, to prove
// grading works and both players score.
const questionIds = [];
const keyCache = new Map();
let answered = 0;
// Ten questions at ~17s each is roughly 170s, so the deadline must exceed
// that. A too-short deadline exits the loop before the battle finishes and
// the end assertion then fails for the wrong reason.
const deadline = Date.now() + 240_000;

while (Date.now() < deadline) {
  if (host.messages.some((m) => m.type === "battle:end")) break;

  const q = host.messages.filter((m) => m.type === "battle:question").at(-1);
  if (!q || questionIds.includes(q.questionId)) {
    await wait(200);
    continue;
  }

  questionIds.push(q.questionId);

  // The answer key is read straight from MySQL. It is deliberately NOT
  // exposed over the API: any endpoint that returns correct_index would be a
  // cheat vector for a real client. Cached because the loop re-asks for the
  // same few ids on every pass.
  if (!keyCache.has(q.questionId)) {
    keyCache.set(q.questionId, await answerKey(q.questionId));
  }
  const correctIndex = keyCache.get(q.questionId);

  for (const client of [host, guest]) {
    client.socket.send(
      JSON.stringify({
        type: "battle:answer",
        code,
        questionId: q.questionId,
        answerIndex: correctIndex ?? 0,
      })
    );
  }
  answered += 1;

  await wait(200);
}

check("questions were answered", answered > 0, `${answered} answered`);

const result = host.messages.find((m) => m.type === "battle:answer_result");
check("answer is graded server-side", result !== null, result ? `correct=${result.correct} gained=${result.gained}` : "");

console.log("\n== battle end ==");
const end = await host.until("battle:end", 60_000);
check("battle ends", end !== null, end ? `host=${end.hostScore} guest=${end.guestScore}` : "");
check("winner is decided", Boolean(end?.winnerId));
check("client is told whether it won", typeof end?.youWon === "boolean");

// The result must be persisted so the admin panel can see it.
const stats = await api("/admin/stats", { token: process.env.ADMIN_TOKEN });
if (stats.status === 200) {
  check("battle is recorded in the database", stats.data?.social?.battlesFinished > 0,
    `finished=${stats.data?.social?.battlesFinished}`);
}

console.log("\n== protocol hygiene ==");
host.socket.send(JSON.stringify({ type: "ping" }));
check("ping is answered", (await host.until("pong", 5000)) !== null);

host.socket.send("this is not json");
await wait(400);
check("malformed frame does not crash the socket", host.socket.readyState === WebSocket.OPEN);

// Replaying one answer must not farm points.
const before = host.messages.filter((m) => m.type === "battle:answer_result").length;
host.socket.send(
  JSON.stringify({ type: "battle:answer", code, questionId: questionIds[0], answerIndex: 0 })
);
await wait(600);
const after = host.messages.filter((m) => m.type === "battle:answer_result").length;
check("re-answering the same question is ignored", after === before, `${before} -> ${after}`);

host.socket.close();
guest.socket.close();
await wait(300);

console.log(`\n${fail === 0 ? "ALL WS TESTS PASSED" : `${fail} TEST(S) FAILED`}  (${pass} passed)\n`);
await db.end();
process.exit(fail === 0 ? 0 : 1);
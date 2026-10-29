/**
 * Verifies the schema is complete and the wallet/daily-run procedures behave.
 *
 *   node scripts/verify-schema.mjs
 *
 * Creates a throwaway user, exercises credit / debit / submit_run /
 * resolve_challenge against the real procedures, then cleans up. If this
 * passes, the money path is sound.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { connectionOptions } from "./lib/db-connection.mjs";
import bcrypt from "bcryptjs";

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

const conn = await mysql.createConnection(connectionOptions(process.env.DATABASE_URL));

let pass = 0;
let fail = 0;

const check = (label, condition, detail = "") => {
  if (condition) {
    pass += 1;
    console.log(`  ok    ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ""}`);
  }
};

const EXPECTED_TABLES = [
  "users", "wallets", "wallet_ledger", "mini_games", "questions",
  "daily_runs", "run_scores", "leaderboard_snapshots", "game_sessions",
  "challenges", "challenge_results", "battle_rooms", "battle_participants",
  "battle_events", "streaks", "badges", "user_badges", "sponsors",
  "ad_config", "settings", "admin_audit_log", "user_sessions",
];

const EXPECTED_PROCS = [
  "sp_credit_wallet", "sp_debit_wallet", "sp_submit_daily_run",
  "sp_calculate_percentile", "sp_resolve_challenge", "sp_finish_battle",
  "sp_close_account",
];

console.log("\n== structure ==");

const [tables] = await conn.query("SHOW TABLES");
const tableNames = new Set(tables.map((t) => Object.values(t)[0]));
for (const name of EXPECTED_TABLES) {
  check(`table ${name}`, tableNames.has(name));
}

// information_schema.ROUTINES is the reliable cross-version source;
// SHOW PROCEDURE STATUS column names differ between MySQL versions.
const [procs] = await conn.query(
  "SELECT ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE()"
);
const procNames = new Set(procs.map((p) => p.ROUTINE_NAME));
for (const name of EXPECTED_PROCS) {
  check(`procedure ${name}`, procNames.has(name));
}

const [games] = await conn.query("SELECT code, duration_seconds FROM mini_games ORDER BY sort_order");
check(`6 mini games seeded`, games.length === 6, `found ${games.length}`);
const [questions] = await conn.query("SELECT COUNT(*) AS n FROM questions");
check("question bank seeded", Number(questions[0].n) >= 40, `${questions[0].n} rows`);
const [celebQuestions] = await conn.query(
  `SELECT COUNT(*) AS n FROM questions q
     JOIN mini_games g ON g.id = q.game_id
    WHERE g.code = 'celeb-closeup' AND q.media IS NOT NULL`
);
check(
  "celeb-closeup image questions seeded",
  Number(celebQuestions[0].n) >= 20,
  `${celebQuestions[0].n} rows`
);
const [badges] = await conn.query("SELECT COUNT(*) AS n FROM badges");
check("badges seeded", Number(badges[0].n) >= 10, `${badges[0].n} rows`);

console.log("\n== wallet procedure behaviour ==");

const email = `verify_${Date.now()}@minutewar.test`;
const [user] = await conn.query(
  `INSERT INTO users (player_id, email, name, password_hash, referral_code)
   VALUES (100000, ?, 'Verify Bot', ?, ?)
   ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
  [email, await bcrypt.hash("x", 10), `V${Date.now().toString(36).toUpperCase()}`]
);
const userId = user.insertId;

const [wallet] = await conn.query(`INSERT INTO wallets (user_id) VALUES (?)`, [userId]);
const walletId = wallet.insertId;

const callCredit = (amount, idem) =>
  conn.query("CALL sp_credit_wallet(?,?,?,?,?,?,?,?,@b)", [
    walletId, userId, amount, "admin_credit", "test", null, null, idem,
  ]);

await callCredit(1000, "verify:1");
const [w1] = await conn.query("SELECT balance FROM wallets WHERE id = ?", [walletId]);
check("credit adds coins", Number(w1[0].balance) === 1000, `balance=${w1[0].balance}`);

// Same idempotency key must not pay twice.
await callCredit(1000, "verify:1");
const [w2] = await conn.query("SELECT balance FROM wallets WHERE id = ?", [walletId]);
check("credit is idempotent", Number(w2[0].balance) === 1000, `balance=${w2[0].balance}`);

await conn.query("CALL sp_debit_wallet(?,?,?,?,?,?,?,?,@b)", [
  walletId, userId, 400, "game_score", "test", null, null, "verify:debit:1",
]);
const [w3] = await conn.query("SELECT balance FROM wallets WHERE id = ?", [walletId]);
check("debit subtracts coins", Number(w3[0].balance) === 600, `balance=${w3[0].balance}`);

// Overdraft must be refused, not go negative.
let refused = false;
try {
  await conn.query("CALL sp_debit_wallet(?,?,?,?,?,?,?,?,@b)", [
    walletId, userId, 99999, "game_score", "test", null, null, "verify:overdraft",
  ]);
} catch (err) {
  refused = err.message.includes("insufficient_balance");
}
check("debit refuses overdraft", refused);
const [w4] = await conn.query("SELECT balance FROM wallets WHERE id = ?", [walletId]);
check("balance stayed non-negative", Number(w4[0].balance) === 600, `balance=${w4[0].balance}`);

const [ledger] = await conn.query(
  "SELECT COUNT(*) AS n FROM wallet_ledger WHERE wallet_id = ?", [walletId]
);
check("ledger recorded every movement", Number(ledger[0].n) === 2, `${ledger[0].n} rows`);

console.log("\n== daily run + streak ==");

await conn.query("CALL sp_submit_daily_run(?,?,?,?,?,?,?,@id,@nb)", [
  userId, "2026-01-01", 5000, 3, 2500, 50, "verify:run:1",
]);
const [r1] = await conn.query(
  "SELECT total_score, current_streak FROM daily_runs d JOIN streaks s ON s.user_id = d.user_id WHERE d.user_id = ?", [userId]
);
check("run score stored", Number(r1[0].total_score) === 5000, `score=${r1[0].total_score}`);
check("streak starts at 1", Number(r1[0].current_streak) === 1, `streak=${r1[0].current_streak}`);

// Consecutive day must extend the streak.
await conn.query("CALL sp_submit_daily_run(?,?,?,?,?,?,?,@id,@nb)", [
  userId, "2026-01-02", 6000, 3, 3000, 50, "verify:run:2",
]);
const [s2] = await conn.query("SELECT current_streak FROM streaks WHERE user_id = ?", [userId]);
check("streak extends on consecutive day", Number(s2[0].current_streak) === 2, `streak=${s2[0].current_streak}`);

// A worse score must not replace a better one.
await conn.query("CALL sp_submit_daily_run(?,?,?,?,?,?,?,@id,@nb)", [
  userId, "2026-01-02", 1000, 3, 500, 0, "verify:run:3",
]);
const [r3] = await conn.query(
  "SELECT total_score FROM daily_runs WHERE user_id = ? AND run_date = '2026-01-02'", [userId]
);
check("a lower score never replaces the best", Number(r3[0].total_score) === 6000, `score=${r3[0].total_score}`);

await conn.query("CALL sp_calculate_percentile(?,?,@p,@r)", [userId, "2026-01-02"]);
const [pct] = await conn.query(
  "SELECT percentile, india_rank FROM daily_runs WHERE user_id = ? AND run_date = '2026-01-02'", [userId]
);
check("percentile calculated", pct[0].percentile !== null, `pct=${pct[0].percentile}`);

console.log("\n== challenge resolution ==");

const [chal] = await conn.query(
  `INSERT INTO challenges (code, challenger_id, challenger_name, challenger_score, expires_at)
   VALUES (?, ?, 'Verify Bot', 5000, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
  [`V${Date.now().toString(36).toUpperCase()}`, userId]
);
const challengeId = chal.insertId;

await conn.query("CALL sp_resolve_challenge(?,?,?,?,?,@st,@w,@op,@os)", [
  challengeId, userId, 7000, null, "verify:chal:1",
]);
const [c1] = await conn.query("SELECT status, challenee_score FROM challenges WHERE id = ?", [challengeId]);
check("higher score wins the challenge", c1[0].status === "won", `status=${c1[0].status}`);

// Replaying the same attempt must not pay a second bonus.
const [before] = await conn.query("SELECT balance FROM wallets WHERE id = ?", [walletId]);
await conn.query("CALL sp_resolve_challenge(?,?,?,?,?,@st,@w,@op,@os)", [
  challengeId, userId, 7000, null, "verify:chal:1",
]);
const [after] = await conn.query("SELECT balance FROM wallets WHERE id = ?", [walletId]);
check(
  "challenge win bonus is idempotent",
  Number(before[0].balance) === Number(after[0].balance),
  `${before[0].balance} -> ${after[0].balance}`
);

console.log("\n== account closure (keeps the coin ledger) ==");

// A plain DELETE must be refused: the ledger is the audit trail.
let deleteRefused = false;
try {
  await conn.query("DELETE FROM users WHERE id = ?", [userId]);
} catch (err) {
  deleteRefused = err.code === "ER_ROW_IS_REFERENCED_2";
}
check("hard delete is refused while ledger rows exist", deleteRefused);

await conn.query("CALL sp_close_account(?, ?)", [userId, "schema verification"]);
const [closed] = await conn.query(
  "SELECT name, email, active FROM users WHERE id = ?", [userId]
);
check("PII scrubbed on close", closed[0].name === "Deleted User" && !closed[0].email.includes("@test"));
check("account deactivated", Number(closed[0].active) === 0);

const [ledgerKept] = await conn.query(
  "SELECT COUNT(*) AS n FROM wallet_ledger WHERE user_id = ?", [userId]
);
check("coin ledger survives account closure", Number(ledgerKept[0].n) > 0, `${ledgerKept[0].n} rows`);

const [walletZero] = await conn.query(
  "SELECT balance, frozen FROM wallets WHERE user_id = ?", [userId]
);
check("wallet zeroed and frozen", Number(walletZero[0].balance) === 0 && Number(walletZero[0].frozen) === 1);

console.log("\n== cleanup ==");
// The ledger is RESTRICT, so tear down in dependency order by hand.
await conn.query("DELETE FROM wallet_ledger WHERE user_id = ?", [userId]);
await conn.query("DELETE FROM users WHERE id = ?", [userId]);
const [gone] = await conn.query("SELECT COUNT(*) AS n FROM users WHERE id = ?", [userId]);
check("test user fully removed", Number(gone[0].n) === 0);

console.log(`\n${fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`}  (${pass} passed)\n`);
await conn.end();
process.exit(fail === 0 ? 0 : 1);
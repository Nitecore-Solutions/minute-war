/**
 * Creates demo players so the leaderboard, admin panel and battle lobbies are
 * not empty while building. Safe to re-run.
 *
 *   node scripts/seed.mjs            25 players
 *   node scripts/seed.mjs 100        100 players
 *   node scripts/seed.mjs 25 --reset remove every seeded demo user first
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
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

const count = Number(process.argv[2]) || 25;
const reset = process.argv.includes("--reset");

const FIRST = ["Rahul", "Deepak", "Irfan", "Amit", "Vijay", "Priya", "Ravi", "Neha", "Sana", "Imran", "Karan", "Sneha", "Arjun", "Meera", "Rohit"];
const LAST = ["Sharma", "Kumar", "Khan", "Patel", "Singh", "Verma", "Reddy", "Nair", "Iyer", "Gupta", "Joshi", "Desai"];
const CITIES = [
  ["Jaipur", "Rajasthan"], ["Delhi", "Delhi"], ["Mumbai", "Maharashtra"],
  ["Bengaluru", "Karnataka"], ["Chennai", "Tamil Nadu"], ["Kolkata", "West Bengal"],
  ["Lucknow", "Uttar Pradesh"], ["Pune", "Maharashtra"], ["Ahmedabad", "Gujarat"],
  ["Hyderabad", "Telangana"], ["Kochi", "Kerala"], ["Indore", "Madhya Pradesh"],
];

const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL });

try {
  if (reset) {
    const [demo] = await conn.query(
      "SELECT id FROM users WHERE email LIKE 'demo\\\\_%@minutewar.test'"
    );
    for (const row of demo) {
      // Ledger rows are RESTRICT, so clear them before removing the user.
      await conn.query("DELETE FROM wallet_ledger WHERE user_id = ?", [row.id]);
      await conn.query("DELETE FROM users WHERE id = ?", [row.id]);
    }
    console.log(`\n  removed ${demo.length} demo user(s)`);
  }

  const [existing] = await conn.query(
    "SELECT email FROM users WHERE email LIKE 'demo\\\\_%@minutewar.test'"
  );
  const taken = new Set(existing.map((r) => r.email));
  const created = [];

  for (let i = 0; i < count; i += 1) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}`;
    const email = `demo_${randomUUID().slice(0, 8)}@minutewar.test`;
    if (taken.has(email)) continue;

    const [city, state] = CITIES[i % CITIES.length];
    const password = "Demo12345";

    let playerId;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = 100_000 + Math.floor(Math.random() * 900_000);
      const [takenId] = await conn.query("SELECT id FROM users WHERE player_id = ? LIMIT 1", [candidate]);
      if (takenId.length === 0) {
        playerId = candidate;
        break;
      }
    }
    if (!playerId) continue;

    const [res] = await conn.query(
      `INSERT INTO users (player_id, email, name, password_hash, role, city, state,
                          referral_code, avatar_seed, active, must_change_password)
       VALUES (?, ?, ?, ?, 'player', ?, ?, ?, ?, 1, 0)`,
      [
        playerId,
        email,
        name,
        await bcrypt.hash(password, 10),
        city,
        state,
        `DEMO${randomUUID().slice(0, 6).toUpperCase()}`,
        Math.floor(Math.random() * 12),
      ]
    );

    const userId = res.insertId;
    const [w] = await conn.query("INSERT INTO wallets (user_id) VALUES (?)", [userId]);

    // A plausible score spread, so the leaderboard looks like real play.
    const total = Math.floor(1200 + Math.random() * 6000);

    await conn.query(
      `INSERT INTO daily_runs (user_id, run_date, seed, game_ids, total_score,
                               games_played, best_game_score, coins_earned, completed)
       VALUES (?, CURDATE(), 'demo', JSON_ARRAY(), ?, 3, ?, ?, 1)`,
      [userId, total, Math.floor(total / 2), Math.floor(total / 30)]
    );

    await conn.query("CALL sp_credit_wallet(?, ?, ?, ?, ?, ?, ?, ?, @b)", [
      w.insertId, userId, Math.floor(200 + Math.random() * 3000),
      "admin_credit", "seed", null, "Seeded demo balance", `seed:${userId}`,
    ]);

    await conn.query(
      `INSERT INTO streaks (user_id, current_streak, longest_streak, last_played_date, total_days)
       VALUES (?, ?, ?, CURDATE(), ?)`,
      [userId, Math.floor(Math.random() * 12), Math.floor(Math.random() * 20), Math.floor(Math.random() * 40) + 1]
    );

    created.push({ playerId, name, city, total });
  }

  console.log(`\nSeeded ${created.length} demo players\n`);
  console.log("  playerId  name                  city         score    password");
  console.log("  " + "-".repeat(62));
  for (const p of created.slice(0, 20)) {
    console.log(
      `  ${String(p.playerId).padEnd(9)} ${p.name.padEnd(20)} ${p.city.padEnd(11)} ${String(p.total).padStart(5)}    Demo12345`
    );
  }
  if (created.length > 20) console.log(`  ... and ${created.length - 20} more`);
  console.log("\n  All demo accounts share the password: Demo12345\n");
} finally {
  await conn.end();
}
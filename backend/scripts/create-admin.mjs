/**
 * Creates or updates an admin login.
 *
 *   npm run db:admin -- --email owner@minutewar.in --name Owner
 *   npm run db:admin -- --email owner@minutewar.in --password "newpass"   (reset)
 *   npm run db:admin -- --email owner@minutewar.in --password "newpass" --force  (rename/role)
 *
 * The password is generated when omitted and printed once.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
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

function arg(flag, fallback = undefined) {
  const i = process.argv.indexOf(`--${flag}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (flag) => process.argv.includes(`--${flag}`);

const email = (arg("email") ?? "owner@minutewar.in").toLowerCase().trim();
const name = arg("name");
const password = arg("password") ?? `ADM-${randomUUID().slice(0, 8).toUpperCase()}`;
const role = arg("role", "admin");
const force = has("force");

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("\n--email must be a valid address.\n");
  process.exit(1);
}
if (password.length < 8) {
  console.error("\n--password must be at least 8 characters.\n");
  process.exit(1);
}
if (role !== "admin" && role !== "player") {
  console.error('\n--role must be "admin" or "player".\n');
  process.exit(1);
}

async function main() {
  const conn = await mysql.createConnection(connectionOptions(process.env.DATABASE_URL));

  try {
    const [existing] = await conn.query(
      "SELECT id, name, role, active FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    const current = existing[0];

    // --- existing account ---------------------------------------------
    if (current) {
      // Only treat this as an edit when something is actually being changed.
      // Otherwise a re-run would silently reset the admin's own password.
      const wantsRename = force && Boolean(name) && name !== current.name;
      const wantsRole = force && role !== current.role;
      const wantsPassword = Boolean(arg("password"));

      if (!wantsPassword && !wantsRename && !wantsRole) {
        console.error(`\n${email} already exists (${current.name}, ${current.role}).`);
        console.error("\nNothing to change. To reset the password:");
        console.error(`  npm run db:admin -- --email ${email} --password "newpass"`);
        console.error("To also change the name or role, add --force.\n");
        process.exitCode = 1;
        return;
      }

      await conn.query(
        `UPDATE users
            SET password_hash = ?, role = ?, active = 1, must_change_password = 0
          WHERE id = ?`,
        [await bcrypt.hash(password, 10), role, current.id]
      );
      if (name) {
        await conn.query("UPDATE users SET name = ? WHERE id = ?", [name, current.id]);
      }

      console.log("\nAdmin updated\n");
      console.log(`  Email    : ${email}`);
      console.log(`  Name     : ${name ?? current.name}`);
      console.log(`  Role     : ${role}`);
      console.log(`  Password : ${password}`);
      console.log("\nSign in at /admin/login\n");
      return;
    }

    // --- create --------------------------------------------------------
    // player_id is allocated in application code (no DB trigger, so the app
    // user never needs SUPER). Mirror that here.
    let playerId;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = 100_000 + Math.floor(Math.random() * 900_000);
      const [taken] = await conn.query(
        "SELECT id FROM users WHERE player_id = ? LIMIT 1",
        [candidate]
      );
      if (taken.length === 0) {
        playerId = candidate;
        break;
      }
    }
    if (!playerId) {
      console.error("\nCould not allocate a player_id. Try again.\n");
      process.exitCode = 1;
      return;
    }

    const [result] = await conn.query(
      `INSERT INTO users
         (player_id, email, name, password_hash, role, referral_code,
          active, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        playerId,
        email,
        name ?? "Owner",
        await bcrypt.hash(password, 10),
        role,
        `ADM${randomUUID().slice(0, 6).toUpperCase()}`,
      ]
    );

    const userId = result.insertId;

    const [wallet] = await conn.query("INSERT INTO wallets (user_id) VALUES (?)", [userId]);
    const walletId = wallet.insertId;

    // Give the admin a starting balance through the ledger, not a raw UPDATE.
    await conn.query(
      "CALL sp_credit_wallet(?, ?, ?, ?, ?, ?, ?, ?, @balance)",
      [
        walletId,
        userId,
        10000,
        "admin_credit",
        "bootstrap",
        null,
        "Admin bootstrap balance",
        `admin:${userId}`,
      ]
    );

    console.log("\nAdmin created\n");
    console.log(`  Email    : ${email}`);
    console.log(`  Player ID: ${playerId}`);
    console.log(`  Name     : ${name ?? "Owner"}`);
    console.log(`  Role     : ${role}`);
    console.log(`  Password : ${password}`);
    console.log("\n  10000 coins credited. Sign in at /admin/login\n");
  } finally {
    await conn.end();
  }
}

await main();
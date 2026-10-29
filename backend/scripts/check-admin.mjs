/**
 * Confirms the admin password still verifies against the stored bcrypt hash.
 *
 *   node scripts/check-admin.mjs <email> <password>
 *
 * A reset database or a changed password both leave a plausible-looking admin
 * row behind, so the only honest check is to compare against the hash.
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
  } catch { /* optional */ }
}

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("usage: node scripts/check-admin.mjs <email> <password>");
  process.exit(2);
}

const conn = await mysql.createConnection(connectionOptions(process.env.DATABASE_URL));

const [rows] = await conn.query(
  "SELECT id, email, name, role, active, password_hash FROM users WHERE email = ? LIMIT 1",
  [email.toLowerCase()]
);

const user = rows[0];

if (!user) {
  console.log(`\n  no account with email ${email}\n`);
  await conn.end();
  process.exit(1);
}

if (user.role !== "admin") {
  console.log(`\n  ${email} exists but has role "${user.role}", not admin\n`);
  await conn.end();
  process.exit(1);
}

if (!user.active) {
  console.log(`\n  ${email} is DISABLED. Re-enable it from the users list.\n`);
  await conn.end();
  process.exit(1);
}

const ok = await bcrypt.compare(password, user.password_hash);

console.log(`\n  email    : ${user.email}`);
console.log(`  name     : ${user.name}`);
console.log(`  role     : ${user.role}`);
console.log(`  active   : ${user.active}`);
console.log(`  password : ${ok ? "CORRECT" : "WRONG"}\n`);

await conn.end();
process.exit(ok ? 0 : 1);
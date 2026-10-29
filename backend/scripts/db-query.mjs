/**
 * Ad-hoc query runner for debugging the schema.
 *
 *   node scripts/db-query.mjs "SELECT ROUTINE_NAME FROM information_schema.ROUTINES"
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

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

const sql = process.argv.slice(2).join(" ");
const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL });

const [rows] = await conn.query(sql);
console.log(JSON.stringify(rows, null, 2));

await conn.end();
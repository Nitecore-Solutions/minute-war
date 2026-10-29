/**
 * Applies db/migrations/*.sql in order, tracking what has run in
 * schema_migrations so a second run is a no-op.
 *
 *   npm run db:migrate              (from repo root)
 *   node scripts/migrate.mjs        (from backend/)
 *   node scripts/migrate.mjs --reset    drops everything and re-applies
 *
 * Reads DATABASE_URL from backend/.env. Uses the admin URL when present so
 * it can CREATE DATABASE on a fresh machine.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { splitStatements } from "./lib/split-sql.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(here, "..");

loadEnv(join(backendRoot, ".env"));

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const URL = process.env.DATABASE_URL;
if (!URL) {
  console.error("\nDATABASE_URL is not set. Copy .env.example to .env first.\n");
  process.exit(1);
}

const reset = process.argv.includes("--reset");
const dir = join(backendRoot, "db", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

if (!files.length) {
  console.error(`No .sql files found in ${dir}`);
  process.exit(1);
}

// Connect WITHOUT a default schema first. On a fresh machine the database may
// not exist yet, and a connection that names a missing schema fails with
// ER_BAD_DB_ERROR before we ever get a chance to create it.
const db = databaseFromUrl(URL);
const conn = await mysql.createConnection({ uri: stripDatabase(URL), multipleStatements: true });

try {
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await conn.query(`USE \`${db}\``);
  console.log(`\n  database \`${db}\``);

  // Drop PROCEDURES and TABLES, never the database itself. Procedures must go
  // first: MySQL will not drop a routine that a table depends on, and a stale
  // sp_* left behind makes the next run fail with "already exists".
  if (reset) {
    console.log(`\n  resetting database \`${db}\``);

    const [routines] = await conn.query(
      "SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?",
      [db]
    );
    for (const row of routines) {
      await conn.query(`DROP ${row.ROUTINE_TYPE} IF EXISTS \`${row.ROUTINE_NAME}\``);
    }

    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    const [tables] = await conn.query("SHOW TABLES");
    for (const row of tables) {
      const name = Object.values(row)[0];
      await conn.query(`DROP TABLE IF EXISTS \`${name}\``);
    }
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");

    console.log(`  dropped ${routines.length} procedure(s), ${tables.length} table(s)`);
  }

  await ensureMigrationsTable(conn);

  // mysql2's raw query() resolves to [rows, fields], not a bare rows object.
  const [applied] = await conn.query("SELECT filename FROM schema_migrations");
  const done = new Set(applied.map((r) => r.filename));

  let ran = 0;
  for (const file of files) {
    if (done.has(file)) {
      console.log(`  skip   ${file}`);
      continue;
    }

    const sql = readFileSync(join(dir, file), "utf8");
    process.stdout.write(`  apply  ${file} ... `);

    try {
      // One statement at a time: procedure bodies contain `;`, and DELIMITER
      // is a client-side directive the server would reject.
      const statements = splitStatements(sql);
      for (const statement of statements) {
        await conn.query(statement);
      }
      await conn.query("INSERT INTO schema_migrations (filename) VALUES (?)", [file]);
      console.log(`ok (${statements.length} statements)`);
      ran += 1;
    } catch (err) {
      console.log("FAILED");
      console.error(`\n${err.message}\n`);
      process.exit(1);
    }
  }

  console.log(
    ran ? `\nMigrated: ${ran} file(s) applied.\n` : "\nAlready up to date.\n"
  );
} finally {
  await conn.end();
}

/** Reads the schema name out of a mysql:// URL. */
function databaseFromUrl(url) {
  const afterScheme = url.slice(url.indexOf("://") + 3);
  const path = afterScheme.slice(afterScheme.indexOf("/") + 1).split("?")[0];
  return decodeURIComponent(path || "minute_war");
}

/** Same URL with the schema removed, for connecting before it exists. */
function stripDatabase(url) {
  const scheme = url.slice(0, url.indexOf("://") + 3);
  const rest = url.slice(url.indexOf("://") + 3);
  const host = rest.slice(0, rest.indexOf("/"));
  return `${scheme}${host}`;
}

async function ensureMigrationsTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
      filename  VARCHAR(190) NOT NULL,
      applied_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_migrations_filename (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
/**
 * Checks that the emoji and text stored in the database survived the round trip
 * as real UTF-8 rather than as mojibake.
 *
 *   node scripts/check-encoding.mjs
 *
 * A Windows console renders emoji as ?, which looks identical to a genuine
 * encoding bug. This compares HEX() against the expected code points so the
 * two can be told apart.
 */

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
  } catch { /* optional */ }
}

const conn = await mysql.createConnection(
  connectionOptions(process.env.DATABASE_URL, {
    // Without this, a Windows console prints ? for every non-ASCII code point.
    charset: "utf8mb4",
  })
);

let pass = 0;
let fail = 0;

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function check(label, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`  ok    ${label}${detail ? ` (${detail})` : ""}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ""}`);
  }
}

const [settings] = await conn.query(
  "SELECT `key`, value, HEX(value) AS hex FROM settings WHERE `key` IN ('share_text','app_name')"
);

for (const row of settings) {
  // A JSON column arrives already parsed unless the server was configured
  // otherwise, so only parse when it really is a string.
  const value =
    typeof row.value === "string" ? safeParse(row.value) : row.value;
  console.log(`\n${row.key}:`);
  console.log(`  raw  : ${JSON.stringify(value)}`);

  // F1 525 is FIRE; F0 9F 94 A5 is the puzzle piece. Mojibake would show
  // "Ã°" or "?" instead of the emoji.
  // The replacement character is what a botched decode produces, so its
  // presence is the real signal. A literal "?" in the text is legitimate.
  check(`${row.key} has no replacement chars`, !String(value).includes("\uFFFD"));

  // EF BF BD is the UTF-8 encoding of U+FFFD. Its absence proves the round
  // trip did not mangle anything.
  check(
    `${row.key} round-tripped cleanly`,
    !String(row.hex).includes("EFBFBD"),
    `hex ${String(row.hex).slice(0, 24)}`
  );

  // Anything above U+FFFF must be the 4-byte form F0...; a 2-byte sequence
  // there is the classic truncation bug.
  const hasAstral = [...String(value)].some((c) => (c.codePointAt(0) ?? 0) > 0xffff);
  if (hasAstral) {
    check(`${row.key} stores astral chars as 4-byte utf8`, /F0[0-9A-F]{2}/.test(String(row.hex)));
  }
}

const [games] = await conn.query("SELECT code, emoji FROM mini_games ORDER BY sort_order");
console.log("\ngame emoji:");
for (const game of games) {
  const [hexRow] = await conn.query("SELECT HEX(emoji) h FROM mini_games WHERE code = ?", [game.code]);
  const emoji = game.emoji;
  const codepoints = [...emoji].map((c) => c.codePointAt(0).toString(16).toUpperCase());
  const isAscii = codepoints.every((c) => Number.parseInt(c, 16) < 128);
  check(
    `${game.code} emoji intact`,
    !emoji.includes("\uFFFD") && emoji.trim().length > 0,
    isAscii ? "ascii" : `U+${codepoints.join(" U+")} / hex ${hexRow[0].h}`
  );
}

const [questions] = await conn.query(
  "SELECT prompt FROM questions ORDER BY id DESC LIMIT 3"
);
console.log("\nrecent questions:");
for (const q of questions) {
  check(
    "question has no mojibake",
    !q.prompt.includes("\uFFFD") && !/\u00C3|\u00E2/.test(q.prompt),
    q.prompt.slice(0, 52)
  );
}

console.log(`\n${fail === 0 ? "ENCODING OK" : `${fail} ENCODING PROBLEM(S)`}  (${pass} passed)\n`);
await conn.end();
process.exit(fail === 0 ? 0 : 1);
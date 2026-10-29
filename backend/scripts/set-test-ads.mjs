/**
 * Fills in Google's public TEST ad unit ids for every placement.
 *
 *   node scripts/set-test-ads.mjs            banner placements only
 *   node scripts/set-test-ads.mjs --off      disable everything
 *
 * WHY TEST IDS MATTER
 * -------------------
 * These are Google's own sample ids. They always work, need no AdMob account,
 * and serve harmless test creatives.
 *
 * Do NOT paste a real AdMob unit id while developing. Serving live ads from a
 * debug build is how accounts get suspended for invalid traffic, because
 * Google sees your own test devices clicking real ads.
 *
 * Swap in real ids from /admin/sponsors only when you are ready to ship.
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
  } catch { /* optional */ }
}

// Google's public sample ids. Documented at
// https://developers.google.com/admob/android/test-ads
const TEST_BANNER = "ca-app-pub-3940256099942544/6300978111";
const TEST_INTERSTITIAL = "ca-app-pub-3940256099942544/1033173712";

const INTERSTITIALS = new Set(["interstitial_result"]);

const turnOff = process.argv.includes("--off");
const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL });

try {
  if (turnOff) {
    await conn.query("UPDATE ad_config SET enabled = 0");
    console.log("\n  All ad placements disabled.\n");
  } else {
    const [rows] = await conn.query("SELECT id, placement FROM ad_config ORDER BY id");

    for (const row of rows) {
      const unitId = INTERSTITIALS.has(row.placement) ? TEST_INTERSTITIAL : TEST_BANNER;
      await conn.query("UPDATE ad_config SET unit_id = ?, enabled = 1 WHERE id = ?", [
        unitId,
        row.id,
      ]);
      console.log(`  ${row.placement.padEnd(20)} ${unitId}`);
    }

    console.log("\n  Test ads enabled. They will render in a DEVELOPMENT BUILD only.");
    console.log("  Expo Go cannot show them: the Google SDK is native code.\n");
    console.log("  Build one with:");
    console.log("    npx expo prebuild --clean");
    console.log("    npx expo run:android          (or: eas build --profile development)\n");
  }
} finally {
  await conn.end();
}
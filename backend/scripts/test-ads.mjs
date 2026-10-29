/**
 * Tests the ad config endpoint and the client-side degradation rules.
 *
 *   node scripts/test-ads.mjs
 *
 * The failure this guards against is subtle and expensive: the ads package is
 * NATIVE code, so it is absent in Expo Go. If anything imports it at module
 * scope, the whole app crashes on startup rather than merely showing no ads.
 * That is checked here against the real source.
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

const BASE = process.env.API_BASE ?? "http://localhost:3000";

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

const mobileSrc = resolve(backendRoot, "..", "mobile", "src");
const read = (...parts) => readFileSync(join(mobileSrc, ...parts), "utf8");

/** Strips comments so an explanatory doc block cannot satisfy a check. */
const codeOnly = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

console.log("\n== Expo Go safety ==");

const banner = read("components", "AdBanner.tsx");
const bannerCode = codeOnly(banner);
const adsService = read("services", "ads.ts");

// The crash vector: a module-scope import of a native package.
check(
  "AdBanner does NOT import the ads package at module scope",
  !/^import .*react-native-google-mobile-ads/m.test(bannerCode),
  "a module-scope import throws in Expo Go and takes down the whole app"
);
check(
  "AdBanner returns null when the native module is missing",
  bannerCode.includes("if (!nativeAvailable) return null"),
  "this is what keeps Expo Go usable"
);
check(
  "AdBanner probes for the native module at runtime",
  /NativeModules\.RNGMobileAds(Module)?/.test(adsService),
  "a runtime probe, not a try/catch around an import"
);
check(
  "web is treated as unavailable",
  adsService.includes('Platform.OS === "web"'),
  "the SDK has no web implementation"
);

console.log("\n== placement wiring ==");

const home = read("screens", "HomeScreen.tsx");
const result = read("screens", "ResultScreen.tsx");

for (const [name, source, placement] of [
  ["HomeScreen", home, "home_banner"],
  ["HomeScreen (second slot)", home, "between_games"],
  ["ResultScreen", result, "result_banner"],
]) {
  check(
    `${name} passes placement="${placement}"`,
    source.includes(`placement="${placement}"`),
    "an unnamed slot cannot be switched off from the admin panel"
  );
}

check(
  "ad config is owned by AdsContext",
  read("context", "AdsContext.tsx").includes("loadAdConfig"),
  "reading config once per render would always see the empty initial state"
);
check(
  "the provider is mounted in App.tsx",
  readFileSync(resolve(backendRoot, "..", "mobile", "App.tsx"), "utf8").includes("AdsProvider"),
  "without the provider useAds() throws"
);
check(
  "config is re-fetched when the app returns to the foreground",
  read("context", "AdsContext.tsx").includes("AppState"),
  "otherwise a kill switch only takes effect after a restart"
);

console.log("\n== every placement is reachable ==");

const endpoint = await (await fetch(`${BASE}/api/ads/config`)).json();
const returned = endpoint?.data?.placements ?? [];
const EXPECTED = ["home_banner", "result_banner", "between_games", "interstitial_result"];

for (const id of EXPECTED) {
  const found = returned.find((p) => p.id === id);
  check(`${id} is served by the API`, Boolean(found), found ? `active=${found.active}` : "missing");
}

check(
  "endpoint reports the global switch",
  typeof endpoint?.data?.enabled === "boolean",
  `enabled=${endpoint?.data?.enabled}`
);

console.log("\n== kill switch ==");

const conn = await mysql.createConnection(connectionOptions(process.env.DATABASE_URL));

// Capture and restore whatever the current state is.
const [before] = await conn.query(
  "SELECT `value` FROM settings WHERE `key` = 'ads_enabled'"
);
const original = before?.[0]?.value ?? true;

async function setAdsEnabled(value) {
  // Written straight to the table. This deliberately bypasses the Next
  // process's settings cache, which is exactly the condition the test is
  // checking: the ads endpoint must not be reading through that cache, or the
  // kill switch would lag by up to five seconds.
  await conn.query(
    "INSERT INTO settings (`key`, `value`) VALUES ('ads_enabled', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
    [JSON.stringify(value)]
  );
}

try {
  await setAdsEnabled(false);
  const off = await (await fetch(`${BASE}/api/ads/config`)).json();
  check("global switch turns everything off", off?.data?.enabled === false);
  check(
    "every placement reports inactive while off",
    (off?.data?.placements ?? []).every((p) => p.active === false),
    "an individual placement cannot override the global switch"
  );

  await setAdsEnabled(true);
  const on = await (await fetch(`${BASE}/api/ads/config`)).json();
  check("global switch turns everything back on", on?.data?.enabled === true);

  // A placement with no unit id must never report active, or it renders an
  // empty grey box in the layout.
  const [saved] = await conn.query(
    "SELECT unit_id, enabled FROM ad_config WHERE placement = 'home_banner'"
  );
  const savedUnit = saved?.[0]?.unit_id;
  const savedEnabled = saved?.[0]?.enabled;

  await conn.query("UPDATE ad_config SET unit_id = NULL, enabled = 1 WHERE placement = 'home_banner'");
  const noUnit = await (await fetch(`${BASE}/api/ads/config`)).json();
  const bannerRow = noUnit?.data?.placements?.find((p) => p.id === "home_banner");
  check(
    "enabled placement with no unit id reports inactive",
    bannerRow?.active === false,
    `enabled=1 but unit_id is NULL`
  );

  await conn.query("UPDATE ad_config SET unit_id = ?, enabled = ? WHERE placement = 'home_banner'", [
    savedUnit,
    savedEnabled,
  ]);
  check("test fixture restored", true);
} finally {
  await setAdsEnabled(original);
  await conn.end();
}

console.log(`\n${fail === 0 ? "ALL AD CHECKS PASSED" : `${fail} CHECK(S) FAILED`}  (${pass} passed)\n`);
process.exit(fail === 0 ? 0 : 1);
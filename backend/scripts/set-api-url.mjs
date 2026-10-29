/**
 * Writes the correct API URL into mobile/.env.
 *
 *   node scripts/set-api-url.mjs            picks the address automatically
 *   node scripts/set-api-url.mjs 10.0.0.5   uses a specific one
 *
 * WHY THIS EXISTS
 * ---------------
 * The phone has to reach this PC by its LAN address, and that address changes
 * when the DHCP lease renews or the network changes. Editing mobile/.env by
 * hand every time is the kind of chore that eventually gets skipped, and the
 * symptom is a bare "Failed to fetch" with no hint that it is a stale address.
 *
 * Rewrites only the EXPO_PUBLIC_API_URL and EXPO_PUBLIC_WS_URL lines and
 * leaves every comment in the file intact, so the file stays self-documenting.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(backendRoot, "..", "mobile", ".env");

const IGNORED = ["virtualbox", "vmware", "vethernet", "vbox", "docker", "wsl", "loopback", "bluetooth", "teredo", "npcap"];

function lanAddresses() {
  const out = [];
  for (const [name, infos] of Object.entries(networkInterfaces())) {
    if (!infos) continue;
    if (IGNORED.some((needle) => name.toLowerCase().includes(needle))) continue;

    for (const info of infos) {
      if (info.family !== "IPv4" && info.family !== 4) continue;
      if (info.internal) continue;
      out.push({ name, address: info.address });
    }
  }
  return out;
}

function preferred(addresses) {
  const scored = addresses.map((entry) => {
    let score = 0;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address)) score += 10;
    if (/wi-?fi|wlan|wireless/i.test(entry.name)) score += 5;
    // VirtualBox and VMware default ranges are the classic wrong answer.
    if (/^192\.168\.(56|57|192)\./.test(entry.address)) score -= 8;
    if (/ethernet|eth/i.test(entry.name) && !/wi-?fi/i.test(entry.name)) score -= 2;
    return { ...entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0] ?? null;
}

const explicit = process.argv[2];
const addresses = lanAddresses();

let ip;

if (explicit) {
  const valid = /^(\d{1,3}\.){3}\d{1,3}$/.test(explicit);
  if (!valid) {
    console.error(`\n  "${explicit}" is not a valid IPv4 address.\n`);
    process.exit(1);
  }
  ip = explicit;
} else {
  const best = preferred(addresses);
  if (!best) {
    console.error("\n  Could not find a usable LAN address. Connect to Wi-Fi and try again.\n");
    console.error("  You can also pass one explicitly: node scripts/set-api-url.mjs 10.0.0.5\n");
    process.exit(1);
  }
  ip = best.address;
}

const apiUrl = `http://${ip}:3000/api`;
const wsUrl = `ws://${ip}:3002`;

if (!existsSync(envPath)) {
  console.error(`\n  mobile\\.env not found at ${envPath}\n`);
  process.exit(1);
}

let content = readFileSync(envPath, "utf8");

// Replace in place if the keys already exist, otherwise append them.
// Replace every existing occurrence, then append if the key was absent.
//
// Collapsing all occurrences matters: a previous version of this script
// substituted a commented line and left a duplicate behind, and dotenv keeps
// the FIRST match, so a stale value would win.
if (/^EXPO_PUBLIC_API_URL=.*$/m.test(content)) {
  content = content.replace(/^EXPO_PUBLIC_API_URL=.*$/gm, `EXPO_PUBLIC_API_URL=${apiUrl}`);
} else {
  content = `${content.trimEnd()}\nEXPO_PUBLIC_API_URL=${apiUrl}\n`;
}

if (/^EXPO_PUBLIC_WS_URL=.*$/m.test(content)) {
  content = content.replace(/^EXPO_PUBLIC_WS_URL=.*$/gm, `EXPO_PUBLIC_WS_URL=${wsUrl}`);
} else {
  content = `${content.trimEnd()}\nEXPO_PUBLIC_WS_URL=${wsUrl}\n`;
}

// dotenv files must be LF-only and BOM-free: PowerShell 5.1 writes CRLF and
// -Encoding utf8 prepends a BOM, and Expo silently misreads the first variable.
content = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
writeFileSync(envPath, content, "utf8");

console.log("\n  mobile\\.env updated\n");
console.log(`    EXPO_PUBLIC_API_URL=${apiUrl}`);
console.log(`    EXPO_PUBLIC_WS_URL=${wsUrl}`);
console.log("\n  Restart Expo for it to take effect:");
console.log("    cd mobile; npx expo start --clear\n");
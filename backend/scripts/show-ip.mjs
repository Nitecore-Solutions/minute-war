/**
 * Prints the address a phone should use to reach this PC, and whether the
 * backend is actually answering on it.
 *
 *   node scripts/show-ip.mjs
 *
 * WHY THIS EXISTS
 * ---------------
 * A phone cannot reach "localhost": on the phone, that is the phone. It has to
 * use this PC's address on the shared Wi-Fi, and that address CHANGES when the
 * DHCP lease renews or you move to a different network. When it does, the app
 * keeps using the old one and fails with a bare "Failed to fetch" that gives
 * no hint about the cause.
 *
 * This prints the current address and proves the API answers on it, so the
 * failure is diagnosable in one command instead of by guessing.
 */

import { readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mobileEnv = resolve(backendRoot, "..", "mobile", ".env");

/** Virtual adapters that are never reachable from a phone. */
const IGNORED = new Set([
  "virtualbox",
  "vmware",
  "vethernet",
  "vbox",
  "docker",
  "wsl",
  "loopback",
  "bluetooth",
  "teredo",
  "npcap",
]);

function lanAddresses() {
  const out = [];
  for (const [name, infos] of Object.entries(networkInterfaces())) {
    if (!infos) continue;
    if ([...IGNORED].some((needle) => name.toLowerCase().includes(needle))) continue;

    for (const info of infos) {
      // IPv4 only: this is a dev convenience, and IPv6 link-local addresses
      // are not routable from a phone.
      if (info.family !== "IPv4" && info.family !== 4) continue;
      if (info.internal) continue;
      out.push({ name, address: info.address });
    }
  }
  return out;
}

/**
 * Picks the most likely phone-reachable address.
 *
 * A private 10.x or 192.168.x address on a wireless adapter is the best bet,
 * because that is the network a phone shares. Virtual adapters usually look
 * like 192.168.56.1 or 192.168.57.1 and are NOT routable from a phone.
 */
function preferred(addresses) {
  const scored = addresses.map((entry) => {
    let score = 0;

    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address)) score += 10;
    if (/wi-?fi|wlan|wireless/i.test(entry.name)) score += 5;
    // The VirtualBox/VMware default ranges are the usual trap.
    if (/^192\.168\.(56|57|192)\./.test(entry.address)) score -= 8;
    if (/ethernet|eth/i.test(entry.name) && !/wi-?fi/i.test(entry.name)) score -= 2;

    return { ...entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0] ?? null;
}

function currentConfiguredUrl() {
  try {
    const match = readFileSync(mobileEnv, "utf8").match(/EXPO_PUBLIC_API_URL=(.*)/);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

const addresses = lanAddresses();
const best = preferred(addresses);
const configured = currentConfiguredUrl();

console.log("\n  Addresses on this PC\n");
if (addresses.length === 0) {
  console.log("    (none found - is the machine on a network?)");
}

for (const entry of addresses) {
  const mark = entry.address === best?.address ? " <- most likely to work" : "";
  console.log(`    ${entry.address.padEnd(16)} ${entry.name}${mark}`);
}

if (!best) {
  console.log("\n  No usable address. Connect to Wi-Fi and try again.\n");
  process.exit(1);
}

const base = `http://${best.address}:3000`;
const apiUrl = `${base}/api`;
console.log(`\n  Set this in mobile\\.env:`);
console.log(`    EXPO_PUBLIC_API_URL=${apiUrl}\n`);

if (configured && configured !== apiUrl) {
  console.log(`  MISMATCH`);
  console.log(`    currently configured : ${configured}`);
  console.log(`    should be           : ${apiUrl}`);
  console.log(`\n  This is the usual cause of "Failed to fetch". Fix it with:`);
  console.log(`    node scripts/set-api-url.mjs ${best.address}\n`);
} else if (configured) {
  console.log("  mobile\\.env already matches. Good.\n");
}

// --- proof that the backend is actually reachable -----------------------
const port = new URL(apiUrl).port || "3000";

try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  const res = await fetch(`http://${best.address}:${port}/api/health`, {
    signal: controller.signal,
  });
  clearTimeout(timer);

  const json = await res.json();
  console.log(`  API reachable on ${best.address}:${port} (${res.status})`);
  console.log(`    database: ${json?.data?.database ?? "?"}\n`);
} catch (err) {
  console.log(`  API NOT reachable on ${best.address}:${port}`);
  console.log(`    ${err.name === "AbortError" ? "timed out after 5s" : err.message}`);
  console.log(`\n  Is the backend running?  cd backend; npm run dev\n`);
  console.log(`  If it is but this still fails, Windows Firewall is blocking it.`);
  console.log(`  Run this in an ADMIN PowerShell:\n`);
  console.log('    New-NetFirewallRule -DisplayName "MINUTE WAR dev" -Direction Inbound -LocalPort 3000,3002,8081 -Protocol TCP -Action Allow');
  console.log(``);
}
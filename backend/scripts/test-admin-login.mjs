/**
 * Regression test for the admin login navigation deadlock.
 *
 *   node scripts/test-admin-login.mjs
 *
 * Bug: router.replace() immediately followed by router.refresh() deadlocks the
 * App Router transition, leaving the dashboard permanently on "Rendering..."
 * with the button stuck on "Signing in...". Fixed by using a hard navigation.
 *
 * This checks the parts that are checkable without a browser:
 *   - the login endpoint sets a usable cookie
 *   - every admin page returns 200 with that cookie (no redirect loop)
 *   - the redirect target is never the login page itself
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

const BASE = process.env.API_BASE ?? "http://localhost:3000";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "owner@minutewar.in";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "MinWar#2026";

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

// A single cookie jar, standing in for the browser's.
const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

console.log("\n== source guard ==");

// Read the actual login source: this is the bug that cannot be caught by a
// request-level test, so it is asserted directly.
const loginSource = readFileSync(
  join(backendRoot, "src", "app", "admin", "login", "page.tsx"),
  "utf8"
);

const signOutSource = readFileSync(
  join(backendRoot, "src", "app", "admin", "(dashboard)", "SignOutButton.tsx"),
  "utf8"
);

/** Strips comments so a doc block explaining the bug cannot satisfy a check. */
function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const loginCode = codeOnly(loginSource);
const signOutCode = codeOnly(signOutSource);

check(
  "login does not call router.refresh()",
  !loginCode.includes("router.refresh()"),
  "the refresh() call is what deadlocked the transition"
);
check(
  "login uses a hard navigation",
  loginCode.includes("window.location.assign"),
  "required: the session cookie is only readable by the server on a fresh request"
);
check(
  "login does not use router.replace()",
  !loginCode.includes("router.replace"),
  "replace() + refresh() together is the deadlock pair"
);
check(
  "login guards against redirecting to itself",
  loginCode.includes("/admin/login"),
  "otherwise ?from=/admin/login loops forever"
);

check(
  "sign-out does not call router.refresh()",
  !signOutCode.includes("router.refresh()")
);
check("sign-out uses a hard navigation", signOutCode.includes("window.location.assign"));

console.log("\n== login endpoint ==");

const loginRes = await fetch(`${BASE}/api/admin/session`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
});

check("login returns 200", loginRes.status === 200, `status ${loginRes.status}`);
storeCookies(loginRes);
check("session cookie is set", jar.has("mw_admin_session"));

const setCookie = (loginRes.headers.getSetCookie?.() ?? []).join(" ");
check("cookie is httpOnly", /HttpOnly/i.test(setCookie));
check("cookie path is /", /Path=\//i.test(setCookie));

console.log("\n== admin pages render with the session ==");

const PAGES = [
  ["/admin", "Coins in circulation"],
  ["/admin/users", "Search name"],
  ["/admin/games", "Reaction Rush"],
  ["/admin/questions", "Add question"],
  ["/admin/badges", "Badges"],
  ["/admin/battles", "1v1 battles"],
  ["/admin/challenges", "Challenges"],
  ["/admin/leaderboard", "Leaderboard"],
  ["/admin/wallet", "Circulating"],
  ["/admin/sponsors", "Ad placements"],
  ["/admin/settings", "Maintenance mode"],
  ["/admin/audit", "Audit log"],
];

for (const [path, marker] of PAGES) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookieHeader() },
    redirect: "manual",
  });

  const html = await res.text();

  // A redirect back to /admin/login here is the loop this test exists for.
  const redirected = res.status === 307 || res.status === 308;
  check(
    `${path} renders`,
    res.status === 200 && html.includes(marker),
    redirected ? `redirected (${res.status}) - loop!` : `status ${res.status}`
  );
}

console.log("\n== unauthenticated access is still refused ==");

for (const path of ["/admin", "/admin/users", "/admin/settings"]) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
  const location = res.headers.get("location") ?? "";
  check(
    `${path} bounces to login when signed out`,
    (res.status === 307 || res.status === 308) && location.includes("/admin/login"),
    `${res.status} -> ${location}`
  );
}

console.log(`\n${fail === 0 ? "ALL ADMIN LOGIN CHECKS PASSED" : `${fail} CHECK(S) FAILED`}  (${pass} passed)\n`);
process.exit(fail === 0 ? 0 : 1);
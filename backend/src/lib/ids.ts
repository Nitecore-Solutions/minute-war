import "server-only";
import { randomBytes } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "./db";

/**
 * Assigns the public 6-digit player_id and the referral code.
 *
 * There is no database trigger here on purpose: creating one needs the SUPER
 * privilege when binary logging is on, which a least-privilege app user must
 * not have. Managed MySQL hosts (PlanetScale, Aiven, TiDB) reject the trigger
 * outright, so doing this in application code also keeps the cloud migration
 * to a one-line DATABASE_URL change.
 *
 * player_id is UNIQUE, so two concurrent signups can collide. Each attempt
 * retries rather than pre-allocating a block, which keeps the ids dense and
 * the code simple. The pool is small (10), so contention is rare.
 */

const PLAYER_ID_MIN = 100_000;
const PLAYER_ID_MAX = 999_999;
const MAX_ATTEMPTS = 12;

export async function allocatePlayerId(): Promise<number> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = PLAYER_ID_MIN + Math.floor(Math.random() * (PLAYER_ID_MAX - PLAYER_ID_MIN + 1));
    const taken = await query(
      "SELECT id FROM users WHERE player_id = ? LIMIT 1",
      [candidate]
    );
    if (taken.length === 0) return candidate;
  }

  // Fall back to a gap-free scan. Slower, but it only runs under real
  // contention on a nearly-full id space, which should not happen early on.
  const rows = await query<RowDataPacket & { player_id: number }>(
    `SELECT player_id FROM users WHERE player_id >= ? ORDER BY player_id ASC`,
    [PLAYER_ID_MIN]
  );

  let expected = PLAYER_ID_MIN;
  for (const row of rows) {
    if (row.player_id > expected) return expected;
    expected = row.player_id + 1;
  }
  if (expected <= PLAYER_ID_MAX) return expected;

  throw new Error("player_id space exhausted");
}

/**
 * A short, unambiguous, case-insensitive code that is safe to read aloud
 * over a phone call. No 0/O, no 1/I/L.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateReferralCode(length = 7): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

export async function allocateReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = generateReferralCode();
    const taken = await query("SELECT id FROM users WHERE referral_code = ? LIMIT 1", [
      candidate,
    ]);
    if (taken.length === 0) return candidate;
  }

  // 7 chars of a 32-char alphabet is ~34 bits. A collision here means the
  // table has been seeded with millions of rows, so a wider code is enough.
  return generateReferralCode(12);
}

/** Short opaque code for shareable challenge links. */
export function generateChallengeCode(): string {
  return randomBytes(5).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)
    .padEnd(8, "X");
}

/**
 * Resolves a referral code to a user id, refusing self-referral.
 * Returns null when the code is unknown or points at the user themselves.
 */
export async function resolveReferral(code: string, selfUserId?: number): Promise<number | null> {
  const rows = await query<RowDataPacket & { id: number }>(
    "SELECT id FROM users WHERE referral_code = ? AND active = 1 LIMIT 1",
    [code.trim().toUpperCase()]
  );
  const found = rows[0];
  if (!found) return null;
  if (selfUserId && found.id === selfUserId) return null;
  return found.id;
}

export { execute };
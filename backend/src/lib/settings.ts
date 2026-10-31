import "server-only";
import { query, execute } from "./db";
import type { RowDataPacket } from "mysql2/promise";

/**
 * Runtime settings.
 *
 * Values live in the `settings` table so the admin dashboard can change the
 * economy (coin amounts, share text, maintenance mode) without an app
 * release. Reads are cached for a few seconds because every gameplay request
 * touches them, and a short cache beats a round trip on each call.
 */

const DEFAULTS = {
  app_name: "RushArena",
  tagline: "60 Seconds. One Challenge. Can You Beat Me?",
  daily_game_count: 3,
  coin_signup_bonus: 500,
  coin_daily_login: 50,
  coin_invite: 200,
  premium_price_inr: 79,
  share_text: "🔥 I scored {score} in RushArena! Can you beat me? {link}",
  maintenance: false,
  registrations_open: true,
  ads_enabled: true,
} as const;

export type SettingKey = keyof typeof DEFAULTS;
export type Settings = { [K in SettingKey]: unknown };

let cache: { value: Settings; at: number } | null = null;
const TTL_MS = 5_000;

async function readSettings(): Promise<Settings> {
  const rows = await query<RowDataPacket & { key: string; value: unknown }>(
    "SELECT `key`, `value` FROM settings"
  );

  const merged: Record<string, unknown> = { ...DEFAULTS };
  for (const row of rows) {
    // A key present in the table overrides the built-in default.
    if (row.key in DEFAULTS) merged[row.key] = row.value;
  }

  return merged as Settings;
}

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  const value = await readSettings();
  cache = { value, at: Date.now() };
  return value;
}

/**
 * Reads settings with no caching.
 *
 * Used by the ad config endpoint, because a kill switch that takes up to five
 * seconds to respond is not much of a kill switch. If ads are earning
 * impressions badly, the admin expects them gone now, not after the next
 * cache expiry. The extra query is irrelevant next to the ad request itself.
 */
export async function getSettingsFresh(): Promise<Settings> {
  return readSettings();
}

/** A single setting, with the built-in default when the row is missing. */
export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  const all = await getSettings();
  return all[key] as Settings[K];
}

/** Reads an integer setting, falling back when the column holds something odd. */
export async function getIntSetting(key: SettingKey, fallback: number): Promise<number> {
  const raw = await getSetting(key);
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** Reads a boolean setting. MySQL JSON true/false, and "false"/0, both work. */
export async function getBoolSetting(key: SettingKey, fallback: boolean): Promise<boolean> {
  const raw = await getSetting(key);
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw === "string") return raw === "true" || raw === "1";
  return fallback;
}

/** Writes a setting and busts the cache immediately. */
export async function setSetting(
  key: string,
  value: unknown,
  updatedBy?: number | null
): Promise<void> {
  await execute(
    `INSERT INTO settings (\`key\`, \`value\`, \`updated_by\`)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`),
                             updated_by = VALUES(updated_by)`,
    [key, JSON.stringify(value), updatedBy ?? null]
  );
  cache = null;
}

export function invalidateSettingsCache(): void {
  cache = null;
}

/** Throws if the app is in maintenance mode. Call at the top of write routes. */
export async function assertNotMaintenance(): Promise<void> {
  if (await getBoolSetting("maintenance", false)) {
    const err = new Error("maintenance_mode") as Error & { code?: string };
    err.code = "maintenance_mode";
    throw err;
  }
}

export { DEFAULTS };
import "server-only";
import { query } from "./db";
import type { RowDataPacket } from "mysql2/promise";

/**
 * The mini-game catalogue.
 *
 * Games are data, not code: the rows below are what the app renders from, so
 * an admin can add, reorder, re-time or re-price a game without an app
 * release. Adding a genuinely new game still needs client work, but tuning an
 * existing one never does.
 */

export interface MiniGame {
  id: number;
  code: string;
  name: string;
  emoji: string;
  tagline: string | null;
  category: "fast" | "india" | "word" | "memory";
  durationSeconds: number;
  maxScore: number;
  coinsPer1000: number;
  config: Record<string, unknown>;
  colorFrom: string;
  colorTo: string;
  active: boolean;
  isPremium: boolean;
  sortOrder: number;
}

interface GameRow extends RowDataPacket {
  id: number;
  code: string;
  name: string;
  emoji: string;
  tagline: string | null;
  category: MiniGame["category"];
  duration_seconds: number;
  max_score: number;
  coins_per_1000: number;
  config: unknown;
  color_from: string;
  color_to: string;
  active: number;
  is_premium: number;
  sort_order: number;
}

/**
 * MySQL JSON columns come back parsed on modern servers, but a column that
 * was written as a string literal arrives as a string. Normalise both.
 */
function parseConfig(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

function toGame(row: GameRow): MiniGame {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    emoji: row.emoji,
    tagline: row.tagline,
    category: row.category,
    durationSeconds: Number(row.duration_seconds),
    maxScore: Number(row.max_score),
    coinsPer1000: Number(row.coins_per_1000),
    config: parseConfig(row.config),
    colorFrom: row.color_from,
    colorTo: row.color_to,
    active: Boolean(row.active),
    isPremium: Boolean(row.is_premium),
    sortOrder: Number(row.sort_order),
  };
}

const COLUMNS = `id, code, name, emoji, tagline, category, duration_seconds,
                 max_score, coins_per_1000, config, color_from, color_to,
                 active, is_premium, sort_order`;

/** Every enabled game, in display order. */
export async function listGames(): Promise<MiniGame[]> {
  const rows = await query<GameRow>(
    `SELECT ${COLUMNS} FROM mini_games WHERE active = 1 ORDER BY sort_order ASC, id ASC`
  );
  return rows.map(toGame);
}

export async function getGameByCode(code: string): Promise<MiniGame | null> {
  const rows = await query<GameRow>(`SELECT ${COLUMNS} FROM mini_games WHERE code = ? LIMIT 1`, [
    code,
  ]);
  return rows[0] ? toGame(rows[0]) : null;
}

/** Games keyed by code, for resolving a submitted score sheet in one pass. */
export async function gamesByCode(): Promise<Map<string, MiniGame>> {
  const rows = await query<GameRow>(`SELECT ${COLUMNS} FROM mini_games WHERE active = 1`);
  return new Map(rows.map((r) => [r.code, toGame(r)]));
}

/**
 * Picks the games for a daily run.
 *
 * The same games for everyone on a given day. A per-player pick would make
 * "your daily score vs mine" meaningless, and the whole product rests on that
 * comparison being fair.
 *
 * Category coverage is guaranteed rather than left to chance: with a purely
 * random pick of 3 from 5, the India quiz was missing roughly 40% of days,
 * which quietly starves the most distinctive part of the product. One game
 * from each category is placed first, then the rest are filled from the
 * seeded shuffle.
 */
export function pickDailyGames(all: MiniGame[], count: number, seed: number): MiniGame[] {
  if (all.length <= count) return [...all].sort((a, b) => a.sortOrder - b.sortOrder);

  const shuffled = seededShuffle(all, seed);

  // Round-robin across categories so no category is skipped while another
  // appears twice.
  const byCategory = new Map<string, MiniGame[]>();
  for (const game of shuffled) {
    const list = byCategory.get(game.category) ?? [];
    list.push(game);
    byCategory.set(game.category, list);
  }

  const categories = [...byCategory.keys()];
  const picked: MiniGame[] = [];
  let round = 0;

  while (picked.length < count) {
    let addedThisRound = 0;

    for (const category of categories) {
      if (picked.length >= count) break;
      const list = byCategory.get(category)!;
      const game = list[round];
      if (game && !picked.includes(game)) {
        picked.push(game);
        addedThisRound += 1;
      }
    }

    // Every category is exhausted; fill from whatever is left.
    if (addedThisRound === 0) {
      for (const game of shuffled) {
        if (picked.length >= count) break;
        if (!picked.includes(game)) picked.push(game);
      }
      break;
    }

    round += 1;
  }

  return picked.sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * The seed for a given date. Everyone on the same day gets the same one, so
 * the daily set and the question order are identical for all players.
 */
export function dailySeed(date: Date): number {
  const key = date.toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Deterministic 0..1 shuffle driven by a seed, for reproducible questions. */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = (seed % 2147483647) + 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 16807) % 2147483647;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export { parseConfig };
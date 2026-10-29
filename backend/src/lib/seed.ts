/**
 * Deterministic seeds for reproducible runs.
 *
 * The daily seed must be identical for every player on a given day (so
 * scores are comparable). A secondary seed is mixed in for anything that
 * should vary per user, such as personal bests or a personal shuffle.
 */

/** Days since the Unix epoch, the same integer MySQL's TO_DAYS() gives. */
export function seededSeed(date: Date = new Date()): number {
  return Math.floor(date.getTime() / 86_400_000);
}

/** Stable 32-bit hash, so a string can be used as a seed source. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Combines a base seed with extra discriminating input. */
export function mixSeed(base: number, ...parts: Array<string | number>): number {
  let value = base;
  for (const part of parts) {
    value = (value ^ hashString(String(part))) >>> 0;
  }
  return value;
}

/** Today's date as YYYY-MM-DD in UTC, matching what the daily run uses. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
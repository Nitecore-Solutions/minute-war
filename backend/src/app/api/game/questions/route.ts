import { handler, ok, unauthorized, bearer, fail } from "@/lib/http";
import { verifyToken } from "@/lib/auth";
import { query, execute } from "@/lib/db";
import { getGameByCode, seededShuffle } from "@/lib/games";
import { getIntSetting } from "@/lib/settings";
import { seededSeed } from "@/lib/seed";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface QuestionRow extends RowDataPacket {
  id: number;
  game_id: number;
  prompt: string;
  options: unknown;
  correct_index: number;
  media: unknown;
  points: number;
  usage_count: number;
}

export interface QuestionMedia {
  eyes?: string;
  nose?: string;
  lips?: string;
  hair?: string;
  reveal?: string;
}

export interface PublicQuestion {
  id: number;
  prompt: string;
  options: string[];
  points: number;
  /** Feature-crop paths for picture quizzes. Relative to the API host. */
  media?: QuestionMedia;
  /**
   * Only sent when the game config opts in with `revealAnswer: true`.
   * Those games are scored on the device, so the key is not a secret; this
   * lets the player get immediate right/wrong feedback and see the portrait.
   * Quiz games without that flag keep their key server-side.
   */
  correctIndex?: number;
}

/** MySQL JSON can arrive parsed or as a string depending on how it was written. */
function toOptions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Only the five public image keys leave the server. The row also stores the
 * celebrity's name for idempotent seeding and admin inspection; that name is
 * the answer, so it must not be spread into the API response.
 */
function toMedia(raw: unknown): QuestionMedia | undefined {
  let parsed: unknown = raw;

  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;

  const source = parsed as Record<string, unknown>;
  const media: QuestionMedia = {};
  const keys: Array<keyof QuestionMedia> = ["eyes", "nose", "lips", "hair", "reveal"];

  for (const key of keys) {
    if (typeof source[key] === "string") media[key] = source[key] as string;
  }

  return Object.keys(media).length > 0 ? media : undefined;
}

/**
 * GET /api/game/questions?code=india-quiz&count=10&seed=123
 *
 * NOTE: `correct_index` is withheld by default. Shipping the answer key would
 * let a modified client read every answer off the wire, so grading happens
 * server-side in /game/daily/submit instead. The one exception is a game whose
 * config sets `revealAnswer: true` (Celeb Close-Up), where immediate right or
 * wrong feedback is part of the mechanic and the score is client-reported.
 */
export async function GET(req: Request) {
  return handler(async () => {
    const session = await verifyToken(bearer(req));
    if (!session) return unauthorized();

    const url = new URL(req.url);
    const code = url.searchParams.get("code") ?? "india-quiz";
    const count = Math.min(Math.max(Number(url.searchParams.get("count") ?? 10) || 10, 1), 20);

    // The daily seed arrives as a string, so parseInt rather than Number:
    // Number("") is 0 and Number("abc") is NaN, both of which silently fall
    // through to a random order instead of erroring.
    const seedParam = url.searchParams.get("seed");
    const parsedSeed = seedParam ? parseInt(seedParam, 10) : NaN;
    const seed = Number.isFinite(parsedSeed) ? parsedSeed : seededSeed();

    const game = await getGameByCode(code);
    if (!game) return fail("Unknown game", 404, "game_not_found");

    // Every player gets a shuffled but deterministic order, so two people in
    // a 1v1 battle face the same questions rather than a different set.
    const rows = await query<QuestionRow>(
      `SELECT id, game_id, prompt, options, correct_index, media, points, usage_count
         FROM questions
        WHERE game_id = ? AND active = 1
        ORDER BY usage_count ASC, id ASC`,
      [game.id]
    );

    if (rows.length === 0) {
      return ok({ questions: [], total: 0 });
    }

    const shuffled = seededShuffle(rows, seed).slice(0, count);

    // Usage tracking nudges the ORDER BY next time toward less-seen questions,
    // so the bank rotates instead of repeating the same ten forever.
    if (shuffled.length > 0) {
      const ids = shuffled.map((q) => q.id);
      await execute(
        `UPDATE questions SET usage_count = usage_count + 1 WHERE id IN (${ids.map(() => "?").join(",")})`,
        ids
      ).catch(() => {
        // Cosmetic only; never fail the request over it.
      });
    }

    const revealAnswer = game.config.revealAnswer === true;

    return ok({
      game: game.code,
      seed,
      total: rows.length,
      questions: shuffled.map<PublicQuestion>((row) => {
        const media = toMedia(row.media);

        return {
          id: row.id,
          prompt: row.prompt,
          options: toOptions(row.options),
          points: Number(row.points),
          ...(media ? { media } : {}),
          ...(revealAnswer ? { correctIndex: Number(row.correct_index) } : {}),
        };
      }),
    });
  });
}
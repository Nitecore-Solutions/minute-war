import { handler, ok, notFound, fail } from "@/lib/http";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/challenges/[code]
 *
 * The landing page for a shared link. Deliberately does NOT require a token:
 * this is the first thing an un-installed friend sees, and demanding a login
 * before showing them the challenge is exactly how you lose the download.
 *
 * It returns no personal data beyond the name and score already printed on
 * the share card itself.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  return handler(async () => {
    const { code } = await params;
    const normalised = code.trim().toUpperCase();

    const rows = await query<
      RowDataPacket & {
        id: number;
        code: string;
        challenger_name: string;
        challenger_score: number;
        game_ids: unknown;
        status: string;
        expires_at: string;
        created_at: string;
        expired: number;
      }
    >(
      `SELECT id, code, challenger_name, challenger_score, game_ids,
              status, expires_at, created_at,
              (expires_at < NOW()) AS expired
         FROM challenges
        WHERE code = ?
        LIMIT 1`,
      [normalised]
    );

    const row = rows[0];
    if (!row) return notFound("That challenge link is not valid");

    const settings = await getSettings();

    const gameIds = (() => {
      if (Array.isArray(row.game_ids)) return row.game_ids as string[];
      if (typeof row.game_ids === "string") {
        try {
          const parsed = JSON.parse(row.game_ids);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    })();

    const games = gameIds.length
      ? await query<RowDataPacket & { code: string; name: string; emoji: string; duration_seconds: number }>(
          `SELECT code, name, emoji, duration_seconds
             FROM mini_games WHERE code IN (${gameIds.map(() => "?").join(",")})`,
          gameIds as string[]
        )
      : [];

    const isExpired = Boolean(row.expired) || row.status === "expired";

    if (isExpired) {
      return fail("This challenge has expired", 410, "challenge_expired");
    }

    return ok({
      code: row.code,
      challengerName: row.challenger_name,
      challengerScore: Number(row.challenger_score),
      status: row.status,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      appName: settings.app_name,
      games: games.map((g) => ({
        code: g.code,
        name: g.name,
        emoji: g.emoji,
        durationSeconds: Number(g.duration_seconds),
      })),
    });
  });
}
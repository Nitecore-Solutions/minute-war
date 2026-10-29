import { handler, ok } from "@/lib/http";
import { listGames } from "@/lib/games";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/games
 *
 * The catalogue shown on the home screen's "Quick Play" row.
 *
 * Public on purpose: a visitor browsing the Play Store listing or a shared
 * challenge link should see what is playable without an account. Nothing
 * here is sensitive, and the same rows are already exposed to signed-in
 * players through /game/daily.
 */
export async function GET() {
  return handler(async () => {
    const games = await listGames();

    return ok({
      games: games.map((g) => ({
        code: g.code,
        name: g.name,
        emoji: g.emoji,
        tagline: g.tagline,
        category: g.category,
        durationSeconds: g.durationSeconds,
        maxScore: g.maxScore,
        coinsPer1000: g.coinsPer1000,
        config: g.config,
        colorFrom: g.colorFrom,
        colorTo: g.colorTo,
        isPremium: g.isPremium,
      })),
    });
  });
}
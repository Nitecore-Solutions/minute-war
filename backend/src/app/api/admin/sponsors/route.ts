import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { execute } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin";

export const runtime = "nodejs";

/**
 * POST /api/admin/sponsors
 *
 * Sponsor campaigns attach branding to a game and optionally pay a coin
 * reward for playing it. They are the non-ad revenue path, so the reward
 * amount is a real economic lever and is validated as such.
 */
const Schema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create"),
    name: z.string().trim().min(2).max(80),
    tagline: z.string().trim().max(160).optional(),
    logoUrl: z.string().trim().max(255).optional(),
    gameId: z.coerce.number().int().positive().optional(),
    startsAt: z.string().trim().min(8),
    endsAt: z.string().trim().min(8).optional(),
    rewardCoins: z.coerce.number().int().min(0).max(10_000),
  }),
  z.object({ intent: z.literal("toggle"), id: z.coerce.number().int().positive() }),
  z.object({ intent: z.literal("delete"), id: z.coerce.number().int().positive() }),
]);

export async function POST(req: Request) {
  await requireAdminPage();
  const parsed = Schema.safeParse(Object.fromEntries(await req.formData()));

  if (!parsed.success) {
    return redirect(`/admin/sponsors?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }

  const data = parsed.data;
  const back = (msg: string, isError = false) =>
    redirect(`/admin/sponsors?${isError ? "error" : "ok"}=${encodeURIComponent(msg)}`);

  try {
    if (data.intent === "create") {
      const slug =
        data.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
          .slice(0, 40) || `sponsor-${Date.now()}`;

      await execute(
        `INSERT INTO sponsors (name, slug, logo_url, tagline, game_id, starts_at, ends_at, reward_coins)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.name,
          slug,
          data.logoUrl || null,
          data.tagline || null,
          data.gameId || null,
          data.startsAt,
          data.endsAt || null,
          data.rewardCoins,
        ]
      );
      revalidatePath("/admin/sponsors");
      return back(`"${data.name}" campaign created`);
    }

    if (data.intent === "toggle") {
      await execute("UPDATE sponsors SET active = NOT active WHERE id = ?", [data.id]);
      revalidatePath("/admin/sponsors");
      return back("Campaign updated");
    }

    if (data.intent === "delete") {
      await execute("DELETE FROM sponsors WHERE id = ?", [data.id]);
      revalidatePath("/admin/sponsors");
      return back("Campaign removed");
    }

    return back("Unknown action", true);
  } catch (err) {
    const message = (err as { sqlMessage?: string }).sqlMessage ?? (err as Error).message;
    return back(message.includes("uq_sponsor_slug") ? "That sponsor name is already taken" : message, true);
  }
}
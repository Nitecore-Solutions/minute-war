import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { execute } from "@/lib/db";
import { requireAdminPage, adminId } from "@/lib/admin";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";

/**
 * POST /api/admin/games
 *
 * One endpoint for every change a game row can take, rather than a separate
 * route per verb. The `intent` field says which operation to run, which keeps
 * the form wiring trivial and avoids a pile of near-identical files.
 */
const Schema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("save"),
    id: z.coerce.number().int().positive(),
    name: z.string().trim().min(1).max(60),
    emoji: z.string().trim().min(1).max(16),
    tagline: z.string().trim().max(120).optional(),
    durationSeconds: z.coerce.number().int().min(5).max(600),
    maxScore: z.coerce.number().int().min(1).max(10_000_000),
    coinsPer1000: z.coerce.number().int().min(0).max(10_000),
    colorFrom: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #f97316"),
    colorTo: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #ef4444"),
    sortOrder: z.coerce.number().int().min(0).max(999),
    config: z.string().max(4000).optional(),
  }),
  z.object({
    intent: z.literal("toggle"),
    id: z.coerce.number().int().positive(),
    active: z.enum(["0", "1"]),
  }),
  z.object({
    intent: z.literal("premium"),
    id: z.coerce.number().int().positive(),
    isPremium: z.enum(["0", "1"]),
  }),
]);

export async function POST(req: Request) {
  await requireAdminPage();

  const form = Object.fromEntries(await req.formData());
  const parsed = Schema.safeParse(form);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid values";
    return redirect(`/admin/games?error=${encodeURIComponent(message)}`);
  }

  const data = parsed.data;
  const by = await adminId();

  try {
    if (data.intent === "toggle") {
      await execute(
        "UPDATE mini_games SET active = ? WHERE id = ?",
        [Number(data.active), data.id]
      );
      revalidatePath("/admin/games");

      // A disabled game must not stay in the daily rotation or an in-flight
      // run. Blocking it is done at read time in pickDailyGames/listGames,
      // which already filter on `active`, so nothing else is needed here.
      return redirect(`/admin/games?ok=${encodeURIComponent(
        data.active === "1" ? "Game enabled" : "Game disabled"
      )}`);
    }

    if (data.intent === "premium") {
      await execute("UPDATE mini_games SET is_premium = ? WHERE id = ?", [
        Number(data.isPremium),
        data.id,
      ]);
      revalidatePath("/admin/games");
      return redirect(
        `/admin/games?ok=${encodeURIComponent(
          data.isPremium === "1" ? "Now Premium-only" : "Now free for everyone"
        )}`
      );
    }

    // --- save ------------------------------------------------------------
    let config: unknown = null;
    if (data.config && data.config.trim()) {
      try {
        config = JSON.parse(data.config);
      } catch {
        return redirect(`/admin/games?error=${encodeURIComponent("Config is not valid JSON")}`);
      }
    }

    await execute(
      `UPDATE mini_games
          SET name = ?, emoji = ?, tagline = ?, duration_seconds = ?, max_score = ?,
              coins_per_1000 = ?, color_from = ?, color_to = ?, sort_order = ?,
              config = COALESCE(?, config)
        WHERE id = ?`,
      [
        data.name,
        data.emoji,
        data.tagline || null,
        data.durationSeconds,
        data.maxScore,
        data.coinsPer1000,
        data.colorFrom,
        data.colorTo,
        data.sortOrder,
        config === null ? null : JSON.stringify(config),
        data.id,
      ]
    );

    await execute(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, meta)
       VALUES (?, 'game.update', 'mini_game', ?, ?)`,
      [
        by,
        String(data.id),
        JSON.stringify({
          name: data.name,
          duration: data.durationSeconds,
          coinsPer1000: data.coinsPer1000,
        }),
      ]
    ).catch(() => {});

    revalidatePath("/admin/games");
    return redirect(`/admin/games?ok=${encodeURIComponent("Game saved")}`);
  } catch (err) {
    return redirect(
      `/admin/games?error=${encodeURIComponent((err as Error).message ?? "Save failed")}`
    );
  }
}
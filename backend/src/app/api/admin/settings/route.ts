import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { execute } from "@/lib/db";
import { requireAdminPage, adminId } from "@/lib/admin";
import { setSetting, invalidateSettingsCache } from "@/lib/settings";

export const runtime = "nodejs";

/**
 * POST /api/admin/settings
 *
 * Runtime knobs that would otherwise need an app release: the coin economy,
 * the share copy, and the two kill switches.
 */
const Schema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("set"),
    key: z.enum([
      "app_name",
      "tagline",
      "daily_game_count",
      "coin_signup_bonus",
      "coin_daily_login",
      "coin_invite",
      "premium_price_inr",
      "share_text",
    ]),
    value: z.string().max(4000),
  }),
  z.object({
    intent: z.literal("flag"),
    key: z.enum(["maintenance", "registrations_open", "ads_enabled"]),
    value: z.enum(["true", "false"]),
  }),
]);

export async function POST(req: Request) {
  await requireAdminPage();
  const parsed = Schema.safeParse(Object.fromEntries(await req.formData()));

  if (!parsed.success) {
    return redirect(`/admin/settings?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }

  const data = parsed.data;
  const by = await adminId();

  try {
    if (data.intent === "flag") {
      await setSetting(data.key, data.value === "true", by);
      await execute(
        `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, meta)
         VALUES (?, 'setting.flag', 'setting', ?, ?)`,
        [by, data.key, JSON.stringify({ value: data.value })]
      ).catch(() => {});
      revalidatePath("/admin/settings");
      revalidatePath("/admin");
      return redirect(
        `/admin/settings?ok=${encodeURIComponent(`${data.key} is now ${data.value}`)}`
      );
    }

    // Numeric settings are validated here so a typo cannot silently turn the
    // coin bonus into NaN or a negative amount.
    if (data.key !== "app_name" && data.key !== "tagline" && data.key !== "share_text") {
      const n = Number(data.value);
      if (!Number.isFinite(n) || n < 0) {
        return redirect(
          `/admin/settings?error=${encodeURIComponent(`${data.key} must be a number of 0 or more`)}`
        );
      }
      await setSetting(data.key, Math.round(n), by);
    } else {
      if (!data.value.trim()) {
        return redirect(`/admin/settings?error=${encodeURIComponent(`${data.key} cannot be empty`)}`);
      }
      await setSetting(data.key, data.value.trim(), by);
    }

    invalidateSettingsCache();
    revalidatePath("/admin/settings");
    return redirect(`/admin/settings?ok=${encodeURIComponent("Saved")}`);
  } catch (err) {
    return redirect(`/admin/settings?error=${encodeURIComponent((err as Error).message)}`);
  }
}
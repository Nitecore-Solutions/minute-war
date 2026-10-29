import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { execute } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin";

export const runtime = "nodejs";

/**
 * POST /api/admin/ads
 *
 * Ad unit configuration. The AdMob unit ids are placeholders until a real AdMob
 * account exists; the important part is that placements can be switched on and
 * off from here without shipping an app build.
 */
const Schema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("toggle"),
    id: z.coerce.number().int().positive(),
    enabled: z.enum(["0", "1"]),
  }),
  z.object({
    intent: z.literal("unit"),
    id: z.coerce.number().int().positive(),
    unitId: z.string().trim().max(80),
  }),
]);

export async function POST(req: Request) {
  await requireAdminPage();
  const parsed = Schema.safeParse(Object.fromEntries(await req.formData()));

  if (!parsed.success) {
    return redirect(`/admin/sponsors?error=${encodeURIComponent("Invalid ad settings")}`);
  }

  const data = parsed.data;
  const back = (msg: string) => redirect(`/admin/sponsors?ok=${encodeURIComponent(msg)}`);

  try {
    if (data.intent === "toggle") {
      await execute("UPDATE ad_config SET enabled = ? WHERE id = ?", [Number(data.enabled), data.id]);
    } else {
      await execute("UPDATE ad_config SET unit_id = ? WHERE id = ?", [data.unitId || null, data.id]);
    }
    revalidatePath("/admin/sponsors");
    return back(data.intent === "toggle" ? "Ad placement updated" : "Ad unit saved");
  } catch (err) {
    return redirect(`/admin/sponsors?error=${encodeURIComponent((err as Error).message)}`);
  }
}
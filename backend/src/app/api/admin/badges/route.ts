import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { execute } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin";

export const runtime = "nodejs";

/**
 * POST /api/admin/badges
 *
 * Badge criteria are simple comparison strings (`streak >= 7`) evaluated in
 * SQL-free JS against the player's current stats. That is deliberately not a
 * rules engine: an admin can author one without any risk to gameplay, and a
 * criterion the evaluator does not understand is simply skipped.
 */
const Schema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("toggle"), id: z.coerce.number().int().positive() }),
  z.object({
    intent: z.literal("save"),
    id: z.coerce.number().int().positive(),
    criteria: z.string().trim().min(3).max(60),
    tier: z.enum(["bronze", "silver", "gold"]),
  }),
]);

export async function POST(req: Request) {
  await requireAdminPage();
  const parsed = Schema.safeParse(Object.fromEntries(await req.formData()));

  if (!parsed.success) {
    return redirect(`/admin/badges?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }

  const data = parsed.data;
  const back = (msg: string, isError = false) =>
    redirect(`/admin/badges?${isError ? "error" : "ok"}=${encodeURIComponent(msg)}`);

  // Reject a criterion the evaluator could never match, so a typo does not
  // silently produce a badge nobody can earn.
  if (data.intent === "save" && !/^\w+\s*(>=|>|<=|<|==)\s*-?\d+(\.\d+)?$/.test(data.criteria.trim())) {
    return back(`Cannot parse "${data.criteria}". Use a form like "streak >= 7".`, true);
  }

  try {
    if (data.intent === "toggle") {
      await execute("UPDATE badges SET active = NOT active WHERE id = ?", [data.id]);
    } else {
      await execute("UPDATE badges SET criteria = ?, tier = ? WHERE id = ?", [
        data.criteria.trim(),
        data.tier,
        data.id,
      ]);
    }
    revalidatePath("/admin/badges");
    return back(data.intent === "toggle" ? "Badge updated" : "Criteria saved");
  } catch (err) {
    return back((err as Error).message ?? "Save failed", true);
  }
}
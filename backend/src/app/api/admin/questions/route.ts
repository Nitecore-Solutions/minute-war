import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { execute, query } from "@/lib/db";
import { requireAdminPage, adminId } from "@/lib/admin";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";

/**
 * POST /api/admin/questions
 *
 * The question bank is the content pipeline for every quiz-style game, so it
 * is deliberately full CRUD rather than add-only.
 */
const Schema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create"),
    gameId: z.coerce.number().int().positive(),
    prompt: z.string().trim().min(3).max(500),
    optionA: z.string().trim().min(1).max(200),
    optionB: z.string().trim().min(1).max(200),
    optionC: z.string().trim().min(1).max(200),
    optionD: z.string().trim().min(1).max(200),
    correct: z.coerce.number().int().min(0).max(3),
    explanation: z.string().trim().max(500).optional(),
    difficulty: z.enum(["easy", "medium", "hard"]),
    points: z.coerce.number().int().min(10).max(1000),
  }),
  z.object({
    intent: z.literal("update"),
    id: z.coerce.number().int().positive(),
    prompt: z.string().trim().min(3).max(500),
    optionA: z.string().trim().min(1).max(200),
    optionB: z.string().trim().min(1).max(200),
    optionC: z.string().trim().min(1).max(200),
    optionD: z.string().trim().min(1).max(200),
    correct: z.coerce.number().int().min(0).max(3),
    explanation: z.string().trim().max(500).optional(),
    difficulty: z.enum(["easy", "medium", "hard"]),
    points: z.coerce.number().int().min(10).max(1000),
  }),
  z.object({ intent: z.literal("toggle"), id: z.coerce.number().int().positive() }),
  z.object({ intent: z.literal("delete"), id: z.coerce.number().int().positive() }),
]);

export async function POST(req: Request) {
  await requireAdminPage();
  const form = Object.fromEntries(await req.formData());
  const parsed = Schema.safeParse(form);

  if (!parsed.success) {
    return redirect(
      `/admin/questions?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid values")}`
    );
  }

  const data = parsed.data;
  const by = await adminId();
  const back = (msg: string, isError = false) =>
    redirect(`/admin/questions?${isError ? "error" : "ok"}=${encodeURIComponent(msg)}`);

  try {
    // Four distinct options are a hard requirement, so it is checked before
    // anything is written. The table's CHECK enforces a count of 4, but a
    // duplicate-option question is still a content mistake worth catching.
    const optionsOf = (d: { optionA: string; optionB: string; optionC: string; optionD: string }) => {
      const options = [d.optionA, d.optionB, d.optionC, d.optionD];
      if (new Set(options.map((o) => o.trim().toLowerCase())).size !== 4) {
        return null;
      }
      return options;
    };

    if (data.intent === "create") {
      const options = optionsOf(data);
      if (!options) return back("The four options must all be different", true);

      const result = await execute(
        `INSERT INTO questions (game_id, prompt, options, correct_index, explanation, difficulty, points, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.gameId,
          data.prompt,
          JSON.stringify(options),
          data.correct,
          data.explanation || null,
          data.difficulty,
          data.points,
          by,
        ]
      );
      revalidatePath("/admin/questions");
      return back(`Question #${result.insertId} added`);
    }

    if (data.intent === "update") {
      const options = optionsOf(data);
      if (!options) return back("The four options must all be different", true);

      await execute(
        `UPDATE questions
            SET prompt = ?, options = ?, correct_index = ?, explanation = ?,
                difficulty = ?, points = ?
          WHERE id = ?`,
        [data.prompt, JSON.stringify(options), data.correct, data.explanation || null, data.difficulty, data.points, data.id]
      );
      revalidatePath("/admin/questions");
      return back("Question saved");
    }

    if (data.intent === "toggle") {
      await execute("UPDATE questions SET active = NOT active WHERE id = ?", [data.id]);
      revalidatePath("/admin/questions");
      return back("Question updated");
    }

    if (data.intent === "delete") {
      // A question that has already been served in a battle is retired rather
      // than deleted, so a past score stays explainable. Cheap check: does
      // any recorded battle event mention this id?
      const usage = await query<RowDataPacket & { n: number }>(
        `SELECT COUNT(*) n FROM battle_events
          WHERE JSON_SEARCH(payload, 'one', ?) IS NOT NULL`,
        [String(data.id)]
      );

      if (Number(usage[0]?.n ?? 0) > 0) {
        await execute("UPDATE questions SET active = 0 WHERE id = ?", [data.id]);
        revalidatePath("/admin/questions");
        return back("Already played in a battle, so it was retired instead of deleted");
      }

      await execute("DELETE FROM questions WHERE id = ?", [data.id]);
      revalidatePath("/admin/questions");
      return back("Question deleted");
    }

    return back("Unknown action", true);
  } catch (err) {
    return back((err as Error).message ?? "Save failed", true);
  }
}
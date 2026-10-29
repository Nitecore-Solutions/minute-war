import { z } from "zod";
import { handler, ok, unauthorized, bearer, fail } from "@/lib/http";
import { verifyToken } from "@/lib/auth";
import { query } from "@/lib/db";
import { generateChallengeCode } from "@/lib/ids";
import { getSetting } from "@/lib/settings";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  score: z.number().int().min(0).max(1_000_000),
  gameCodes: z.array(z.string().max(32)).max(10).optional(),
});

/**
 * GET  /api/challenges        list challenges sent or received
 * POST /api/challenges        create one: "I scored 9820. Can you beat me?"
 */
export async function GET(req: Request) {
  return handler(async () => {
    const session = await verifyToken(bearer(req));
    if (!session) return unauthorized();

    const rows = await query<RowDataPacket & {
      id: number;
      code: string;
      challenger_id: number;
      challenger_name: string;
      challenger_score: number;
      challenee_id: number | null;
      challenee_score: number | null;
      status: string;
      created_at: string;
      expires_at: string;
    }>(
      `SELECT c.id, c.code, c.challenger_id, c.challenger_name,
              c.challenger_score, c.challenee_id, c.challenee_score,
              c.status, c.created_at, c.expires_at
         FROM challenges c
        WHERE c.challenger_id = ? OR c.challenee_id = ?
        ORDER BY c.created_at DESC
        LIMIT 50`,
      [session.userId, session.userId]
    );

    return ok({
      challenges: rows.map((r) => ({
        code: r.code,
        direction: r.challenger_id === session.userId ? "sent" : "received",
        opponentName:
          r.challenger_id === session.userId ? "A friend" : r.challenger_name,
        yourScore: r.challenger_id === session.userId ? r.challenger_score : r.challenee_score,
        theirScore: r.challenger_id === session.userId ? r.challenee_score : r.challenger_score,
        won: r.status === "won" && r.challenger_id !== session.userId,
        status: r.status,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
      })),
    });
  });
}

export async function POST(req: Request) {
  return handler(async () => {
    const session = await verifyToken(bearer(req));
    if (!session) return unauthorized();

    const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid challenge", 400, "validation");
    }

    const { score, gameCodes } = parsed.data;

    // Where the challenge lands in the app. Overridable so a staged build or
    // a Play Store link can be pointed at the right place.
    const shareBase = process.env.SHARE_BASE_URL ?? process.env.APP_ORIGIN ?? "https://minutewar.in";

    // A short code beats a long id in a shared WhatsApp message: it survives
    // being read aloud or typed by hand.
    let code = generateChallengeCode();
    for (let i = 0; i < 6; i += 1) {
      const taken = await query("SELECT id FROM challenges WHERE code = ? LIMIT 1", [code]);
      if (taken.length === 0) break;
      code = generateChallengeCode();
    }

    const me = await query<RowDataPacket & { name: string }>(
      "SELECT name FROM users WHERE id = ?",
      [session.userId]
    );
    const myName = me[0]?.name ?? "A player";

    const expiryDays = 7;
    await query(
      `INSERT INTO challenges
         (code, challenger_id, challenger_name, challenger_score, game_ids, expires_at)
       VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
      [code, session.userId, myName, score, JSON.stringify(gameCodes ?? []), expiryDays]
    );

    const shareUrl = `${shareBase.replace(/\/+$/, "")}/challenge/${code}`;
    const template = String(
      await getSetting("share_text") ??
        "🔥 I scored {score} in MINUTE WAR! Can you beat me? {link}"
    );

    // Fill the placeholders the admin can edit from /admin/settings.
    const message = template
      .replace("{score}", String(score))
      .replace("{name}", myName)
      .replace("{link}", shareUrl);

    return ok({ code, score, shareUrl, message }, { status: 201 });
  });
}
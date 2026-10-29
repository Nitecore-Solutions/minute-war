import { z } from "zod";
import {
  handler,
  ok,
  notFound,
  bearer,
  unauthorized,
  fail,
  idempotencyKey,
} from "@/lib/http";
import { verifyToken } from "@/lib/auth";
import { query, callProcedure, pool } from "@/lib/db";
import { getWallet } from "@/lib/wallet";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AcceptSchema = z.object({
  score: z.number().int().min(0).max(1_000_000),
  runId: z.number().int().positive().optional(),
});

/**
 * POST /api/challenges/[code]/accept
 *
 * Records the attempt and settles the winner in one stored procedure, so a
 * retry cannot pay the win bonus twice.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  return handler(async () => {
    const session = await verifyToken(bearer(req));
    if (!session) return unauthorized();

    const { code } = await params;
    const normalised = code.trim().toUpperCase();

    const rows = await query<
      RowDataPacket & {
        id: number;
        challenger_id: number;
        challenger_score: number;
        status: string;
        expired: number;
        challenee_id: number | null;
      }
    >(
      `SELECT id, challenger_id, challenger_score, status, challenee_id,
              (expires_at < NOW()) AS expired
         FROM challenges WHERE code = ? LIMIT 1`,
      [normalised]
    );

    const challenge = rows[0];
    if (!challenge) return notFound("That challenge link is not valid");
    if (challenge.expired) return fail("This challenge has expired", 410, "challenge_expired");

    if (challenge.challenger_id === session.userId) {
      return fail("You cannot accept your own challenge", 400, "own_challenge");
    }

    // One answer per challenge. Without this a user could replay a losing
    // score, then a winning one, collecting the bonus for each.
    if (challenge.challenee_id === session.userId && challenge.status !== "pending") {
      return fail("You already took this challenge", 409, "challenge_answered");
    }

    const parsed = AcceptSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid score", 400, "validation");
    }

    const { score, runId } = parsed.data;

    const out = await callProcedure<{
      p_status: string;
      p_won: number;
      p_opponent: string;
      p_opp_score: number;
    }>(
      // The pool is used rather than a transaction: sp_resolve_challenge
      // manages its own locking on the challenge row.
      pool,
      "sp_resolve_challenge",
      [challenge.id, session.userId, score, runId ?? null, idempotencyKey(req, `chal:${challenge.id}:${session.userId}`)],
      ["p_status", "p_won", "p_opponent", "p_opp_score"]
    );

    const wallet = await getWallet(session.userId);

    return ok({
      won: Number(out.p_won) === 1,
      status: out.p_status,
      yourScore: score,
      opponentName: out.p_opponent,
      opponentScore: Number(out.p_opp_score),
      margin: score - Number(out.p_opp_score),
      balance: wallet?.balance ?? 0,
    });
  });
}
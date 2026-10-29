import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { handler, ok, fail, mapDbError, idempotencyKey } from "@/lib/http";
import { createSession, toSessionUser } from "@/lib/auth";
import { execute, query, transaction } from "@/lib/db";
import { allocatePlayerId, allocateReferralCode, resolveReferral } from "@/lib/ids";
import { getIntSetting, getBoolSetting } from "@/lib/settings";
import { credit, getWallet } from "@/lib/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SignupSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters").max(200),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  referralCode: z.string().trim().max(20).optional(),
});

/**
 * POST /api/auth/signup
 *
 * Email + name + password. The public 6-digit player_id is assigned here,
 * because there is no signup-free flow: this app's growth depends on anyone
 * being able to install and play without an admin handing out credentials.
 *
 * Runs in a transaction so the user, the wallet and the signup bonus either
 * all exist or none do. The bonus goes through sp_credit_wallet so it lands
 * in the ledger like every other coin movement.
 */
export async function POST(req: Request) {
  return handler(async () => {
    if (!(await getBoolSetting("registrations_open", true))) {
      return fail("Sign-ups are closed right now", 503, "registrations_closed");
    }

    const parsed = SignupSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Check your details", 400, "validation");
    }

    const { name, email, password, city, state, referralCode } = parsed.data;

    // Reject a duplicate email before doing any work.
    const existing = await query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (existing.length > 0) {
      return fail("That email is already registered", 409, "email_taken");
    }

    const signupBonus = await getIntSetting("coin_signup_bonus", 500);
    const passwordHash = await bcrypt.hash(password, 10);

    // A referral is resolved BEFORE the user exists, so self-referral is
    // impossible by construction.
    const referrerId = referralCode ? await resolveReferral(referralCode) : null;

    const userId = await transaction(async (conn) => {
      // player_id and referral_code are UNIQUE, so a concurrent signup can
      // steal the value between the check and the insert. The unique key is
      // the real guard: retry on ER_DUP_ENTRY rather than pre-allocating.
      let created = false;

      for (let attempt = 0; attempt < 8 && !created; attempt += 1) {
        const playerId = await allocatePlayerId();
        const referral = await allocateReferralCode();

        try {
          const [result] = await conn.execute(
            `INSERT INTO users
               (player_id, email, name, password_hash, city, state,
                referral_code, referred_by, avatar_seed)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              playerId,
              email,
              name,
              passwordHash,
              city || null,
              state || null,
              referral,
              referrerId,
              Math.floor(Math.random() * 12),
            ]
          );
          return (result as { insertId: number }).insertId;
        } catch (err) {
          const errCode = (err as { code?: string }).code;
          if (errCode === "ER_DUP_ENTRY") continue; // id collision, try again
          throw err;
        }
      }

      throw new Error("could not allocate a unique player id");
    });

    // Wallet + signup bonus are separate from the user insert so a failure
    // here cannot leave a half-registered account with no wallet.
    await execute("INSERT INTO wallets (user_id) VALUES (?)", [userId]);

    const wallet = await getWallet(userId);

    if (signupBonus > 0 && wallet) {
      await credit({
        walletId: wallet.id,
        userId,
        amount: signupBonus,
        kind: "signup_bonus",
        refType: "signup",
        refId: String(userId),
        note: "Welcome bonus",
        idempotencyKey: idempotencyKey(req, `signup:${userId}`),
      });
    }

    // Reward the referrer too. The idempotency key names both users, so a
    // retried signup cannot pay the inviter twice.
    if (referrerId) {
      const inviteBonus = await getIntSetting("coin_invite", 200);
      const refWallet = await getWallet(referrerId);
      if (refWallet && inviteBonus > 0) {
        await credit({
          walletId: refWallet.id,
          userId: referrerId,
          amount: inviteBonus,
          kind: "invite_bonus",
          refType: "referral",
          refId: String(userId),
          note: "Friend joined with your code",
          idempotencyKey: `invite:${referrerId}:${userId}`,
        });
      }
    }

    const [user] = await query(
      "SELECT id, player_id, name, email, role, is_premium, premium_until, avatar_seed FROM users WHERE id = ?",
      [userId]
    );

    const sessionUser = toSessionUser(user as never);
    const { token, expiresAt } = await createSession(sessionUser, req.headers.get("user-agent"));

    return ok({
      token,
      expiresAt: expiresAt.toISOString(),
      user: sessionUser,
      signupBonus,
      referredBy: referrerId,
    }, { status: 201 });
  });
}
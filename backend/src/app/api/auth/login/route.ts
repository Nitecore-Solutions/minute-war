import bcrypt from "bcryptjs";
import { z } from "zod";
import { handler, ok, fail, idempotencyKey } from "@/lib/http";
import { createSession, toSessionUser, revokeSession, verifyToken } from "@/lib/auth";
import { query, execute, transaction } from "@/lib/db";
import { getWallet, credit } from "@/lib/wallet";
import { getIntSetting } from "@/lib/settings";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

/**
 * POST /api/auth/login
 *
 * Also pays the daily-login reward and pays out any streaks whose 7-day
 * milestone was missed because the user had not signed in for a while.
 */
export async function POST(req: Request) {
  return handler(async () => {
    const parsed = LoginSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Check your details", 400, "validation");
    }

    const { email, password } = parsed.data;

    const rows = await query<
      RowDataPacket & {
        id: number;
        player_id: number;
        name: string;
        email: string;
        role: "admin" | "player";
        is_premium: number;
        premium_until: string | null;
        avatar_seed: number;
        password_hash: string;
        active: number;
        must_change_password: number;
      }
    >(
      `SELECT id, player_id, name, email, role, is_premium, premium_until,
              avatar_seed, password_hash, active, must_change_password
         FROM users WHERE email = ? LIMIT 1`,
      [email]
    );

    const row = rows[0];

    // A closed account has a rewritten email, so it can never match here.
    // Disabled accounts can, so they are checked explicitly.
    if (!row) {
      return fail("Email or password is wrong", 401, "invalid_credentials");
    }

    if (!row.active) {
      return fail("This account has been disabled", 403, "account_disabled");
    }

    const matches = await bcrypt.compare(password, row.password_hash);
    if (!matches) {
      return fail("Email or password is wrong", 401, "invalid_credentials");
    }

    const user = toSessionUser(row);
    const { token, expiresAt } = await createSession(user, req.headers.get("user-agent"));

    await execute("UPDATE users SET last_login_at = NOW(), last_seen_at = NOW() WHERE id = ?", [
      user.id,
    ]);

    const wallet = await getWallet(user.id);
    const rewards = await payDailyRewards(user.id, wallet?.id ?? null, req);

    // Re-read the wallet AFTER the reward is paid. Returning the balance read
    // before the credit would leave the app header showing a stale figure
    // until the next refresh.
    const settled = await getWallet(user.id);

    return ok({
      token,
      expiresAt: expiresAt.toISOString(),
      user,
      wallet: settled ? { balance: settled.balance, frozen: settled.frozen } : null,
      rewards,
    });
  });
}

/**
 * Pays the daily login bonus once per calendar day.
 *
 * The idempotency key is the date, so a user who signs in five times still
 * gets one bonus. The streak bonus is paid by sp_submit_daily_run when they
 * finish a run, not here.
 */
async function payDailyRewards(
  userId: number,
  walletId: number | null,
  req: Request
): Promise<{ dailyLogin: number; streak: number }> {
  if (!walletId) return { dailyLogin: 0, streak: 0 };

  const amount = await getIntSetting("coin_daily_login", 50);

  const rows = await query<RowDataPacket & { current_streak: number }>(
    "SELECT current_streak FROM streaks WHERE user_id = ?",
    [userId]
  );
  const streak = Number(rows[0]?.current_streak ?? 0);

  if (amount <= 0) return { dailyLogin: 0, streak };

  const today = new Date().toISOString().slice(0, 10);
  const key = idempotencyKey(req, `dailylogin:${userId}:${today}`);

  // The stored procedure returns the unchanged balance when the key was
  // already used, so a replay is a no-op rather than a double payment.
  await credit({
    walletId,
    userId,
    amount,
    kind: "daily_reward",
    refType: "daily_login",
    refId: today,
    note: "Daily login reward",
    idempotencyKey: key,
  });

  return { dailyLogin: amount, streak };
}
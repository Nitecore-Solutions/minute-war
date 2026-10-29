import { handler, ok, unauthorized, bearer } from "@/lib/http";
import { verifyToken, loadUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getWallet } from "@/lib/wallet";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me
 *
 * The app calls this on every cold start to confirm the stored token is
 * still valid. A revoked or expired session must not leave the user looking
 * signed in, so this always re-checks rather than trusting the token alone.
 */
export async function GET(req: Request) {
  return handler(async () => {
    const session = await verifyToken(bearer(req));
    if (!session) return unauthorized();

    const user = await loadUser(session.userId);
    if (!user) return unauthorized("Your session is no longer valid");

    const wallet = await getWallet(user.id);

    const streak = await query<RowDataPacket & { current_streak: number; longest_streak: number; total_days: number }>(
      "SELECT current_streak, longest_streak, total_days FROM streaks WHERE user_id = ?",
      [user.id]
    );

    const badges = await query(
      `SELECT b.code, b.name, b.icon, b.tier, ub.earned_at
         FROM user_badges ub
         JOIN badges b ON b.id = ub.badge_id
        WHERE ub.user_id = ?
        ORDER BY ub.earned_at DESC`,
      [user.id]
    );

    return ok({
      user,
      wallet: wallet
        ? {
            balance: wallet.balance,
            frozen: wallet.frozen,
            lifetimeEarned: wallet.lifetimeEarned,
          }
        : null,
      streak: streak[0]
        ? {
            current: Number(streak[0].current_streak),
            longest: Number(streak[0].longest_streak),
            totalDays: Number(streak[0].total_days),
          }
        : { current: 0, longest: 0, totalDays: 0 },
      badges,
    });
  });
}
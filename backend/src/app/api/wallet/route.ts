import { handler, ok, unauthorized, bearer } from "@/lib/http";
import { verifyToken } from "@/lib/auth";
import { query } from "@/lib/db";
import { getWallet } from "@/lib/wallet";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/wallet?limit=30
 *
 * Balance plus the coin ledger. The balance always comes from the wallets
 * table (the source of truth); the ledger is the audit trail shown beneath
 * it, never the thing that is summed to produce it.
 */
export async function GET(req: Request) {
  return handler(async () => {
    const session = await verifyToken(bearer(req));
    if (!session) return unauthorized();

    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 30) || 30, 1), 100);

    const wallet = await getWallet(session.userId);

    if (!wallet) {
      return ok({ balance: 0, frozen: false, lifetimeEarned: 0, transactions: [] });
    }

    const rows = await query<
      RowDataPacket & {
        id: number;
        delta: number;
        balance_after: number;
        kind: string;
        note: string | null;
        created_at: string;
      }
    >(
      `SELECT id, delta, balance_after, kind, note, created_at
         FROM wallet_ledger
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
      [session.userId, limit]
    );

    // Earned vs spent, for the wallet header summary.
    const totals = await query<RowDataPacket & { earned: number; spent: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS earned,
         COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0) AS spent
       FROM wallet_ledger WHERE user_id = ?`,
      [session.userId]
    );

    return ok({
      balance: wallet.balance,
      frozen: wallet.frozen,
      lifetimeEarned: wallet.lifetimeEarned,
      totalEarned: Number(totals[0]?.earned ?? 0),
      totalSpent: Number(totals[0]?.spent ?? 0),
      transactions: rows.map((r) => ({
        id: Number(r.id),
        delta: Number(r.delta),
        balanceAfter: Number(r.balance_after),
        kind: r.kind,
        note: r.note,
        at: r.created_at,
      })),
    });
  });
}
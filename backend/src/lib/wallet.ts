import "server-only";
import { pool, query, callProcedure, transaction } from "./db";
import type { PoolConnection } from "mysql2/promise";

/**
 * The only sanctioned way to move coins.
 *
 * Everything routes through sp_credit_wallet / sp_debit_wallet so the ledger
 * stays complete and the idempotency key is always applied. Never UPDATE
 * wallets.balance directly.
 */

export type LedgerKind =
  | "signup_bonus"
  | "daily_reward"
  | "streak_bonus"
  | "game_score"
  | "friend_win"
  | "friend_loss"
  | "invite_bonus"
  | "referral_bonus"
  | "premium_purchase"
  | "tournament_prize"
  | "ad_reward"
  | "sponsor_reward"
  | "admin_credit"
  | "admin_debit"
  | "account_close";

export interface CreditInput {
  walletId: number;
  userId: number;
  amount: number;
  kind: LedgerKind;
  refType?: string | null;
  refId?: string | null;
  note?: string | null;
  /** Reuse a key to make this credit a no-op. Required in practice. */
  idempotencyKey: string;
}

export async function credit(input: CreditInput): Promise<number> {
  const out = await callProcedure<{ p_balance: number }>(
    pool,
    "sp_credit_wallet",
    [
      input.walletId,
      input.userId,
      Math.round(input.amount),
      input.kind,
      input.refType ?? null,
      input.refId ?? null,
      input.note ?? null,
      input.idempotencyKey,
    ],
    ["p_balance"]
  );
  return Number(out.p_balance ?? 0);
}

/** Debits coins, throwing insufficient_balance_or_frozen when refused. */
export async function debit(input: CreditInput): Promise<number> {
  const out = await callProcedure<{ p_balance: number }>(
    pool,
    "sp_debit_wallet",
    [
      input.walletId,
      input.userId,
      Math.round(input.amount),
      input.kind,
      input.refType ?? null,
      input.refId ?? null,
      input.note ?? null,
      input.idempotencyKey,
    ],
    ["p_balance"]
  );
  return Number(out.p_balance ?? 0);
}

/** Same as credit/debit but inside an existing transaction. */
export async function creditOn(
  conn: PoolConnection,
  input: CreditInput
): Promise<number> {
  const out = await callProcedure<{ p_balance: number }>(
    conn,
    "sp_credit_wallet",
    [
      input.walletId,
      input.userId,
      Math.round(input.amount),
      input.kind,
      input.refType ?? null,
      input.refId ?? null,
      input.note ?? null,
      input.idempotencyKey,
    ],
    ["p_balance"]
  );
  return Number(out.p_balance ?? 0);
}

export async function getWallet(userId: number): Promise<{
  id: number;
  balance: number;
  frozen: boolean;
  lifetimeEarned: number;
} | null> {
  const rows = await query(
    "SELECT id, balance, frozen, lifetime_earned FROM wallets WHERE user_id = ?",
    [userId]
  );
  const row = rows[0] as
    | { id: number; balance: number; frozen: number; lifetime_earned: number }
    | undefined;
  if (!row) return null;

  return {
    id: row.id,
    balance: Number(row.balance),
    frozen: Boolean(row.frozen),
    lifetimeEarned: Number(row.lifetime_earned),
  };
}

/**
 * Converts a game score into coins.
 *
 * Each game declares coins_per_1000, so a 10x-scoring game is worth the same
 * as a 1x one per point. Rounded up so a tiny score still pays something,
 * which matters for the "finish a game" reward feel.
 */
export function coinsForScore(score: number, coinsPer1000: number): number {
  if (score <= 0) return 0;
  return Math.max(1, Math.ceil((score / 1000) * coinsPer1000));
}

export { transaction, pool };
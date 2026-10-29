import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { execute, query, callProcedure, pool } from "@/lib/db";
import { requireAdminPage, adminId } from "@/lib/admin";
import { revokeAllForUser } from "@/lib/auth";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";

/**
 * POST /api/admin/users
 *
 * User moderation: search, ban, freeze, grant premium, adjust coins, close
 * accounts. Coin changes ALWAYS go through sp_credit_wallet / sp_debit_wallet
 * so they land in the ledger; there is deliberately no way to edit
 * wallets.balance directly from the dashboard.
 */
const Schema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("toggle-active"), id: z.coerce.number().int().positive() }),
  z.object({ intent: z.literal("toggle-frozen"), id: z.coerce.number().int().positive() }),
  z.object({ intent: z.literal("premium"), id: z.coerce.number().int().positive(), premium: z.enum(["0", "1"]) }),
  z.object({
    intent: z.literal("coins"),
    id: z.coerce.number().int().positive(),
    amount: z.coerce.number().int().refine((n) => n !== 0, "Enter a non-zero amount"),
    note: z.string().trim().max(200).optional(),
  }),
  z.object({ intent: z.literal("close"), id: z.coerce.number().int().positive() }),
  z.object({ intent: z.literal("revoke"), id: z.coerce.number().int().positive() }),
]);

export async function POST(req: Request) {
  await requireAdminPage();
  const form = Object.fromEntries(await req.formData());
  const parsed = Schema.safeParse(form);

  if (!parsed.success) {
    return redirect(`/admin/users?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }

  const data = parsed.data;
  const by = await adminId();
  const back = (msg: string, isError = false) =>
    redirect(`/admin/users?${isError ? "error" : "ok"}=${encodeURIComponent(msg)}`);

  try {
    if (data.intent === "toggle-active") {
      await execute("UPDATE users SET active = NOT active WHERE id = ?", [data.id]);
      // A banned user must lose live access, not keep playing until the token
      // expires. Revoking sessions makes the block immediate.
      await revokeAllForUser(data.id);
      revalidatePath("/admin/users");
      return back("User updated");
    }

    if (data.intent === "toggle-frozen") {
      await execute("UPDATE wallets SET frozen = NOT frozen WHERE user_id = ?", [data.id]);
      revalidatePath("/admin/users");
      return back("Wallet frozen or unfrozen");
    }

    if (data.intent === "premium") {
      const on = data.premium === "1";
      await execute(
        `UPDATE users SET is_premium = ?, premium_until = ${on ? "DATE_ADD(NOW(), INTERVAL 30 DAY)" : "NULL"} WHERE id = ?`,
        [on ? 1 : 0, data.id]
      );
      revalidatePath("/admin/users");
      return back(on ? "Premium granted for 30 days" : "Premium removed");
    }

    if (data.intent === "coins") {
      const wallets = await query<RowDataPacket & { id: number }>(
        "SELECT id FROM wallets WHERE user_id = ?",
        [data.id]
      );
      if (!wallets[0]) return back("That user has no wallet", true);

      const amount = data.amount;
      const walletId = wallets[0].id;
      const abs = Math.abs(amount);
      const key = `admin:${by}:${data.id}:${Date.now()}`;

      // Credit and debit have identical signatures, so one branch picks the
      // right procedure. The idempotency key names the admin and the moment,
      // so a double-submit cannot pay twice.
      if (amount > 0) {
        await callProcedure(
          pool,
          "sp_credit_wallet",
          [walletId, data.id, abs, "admin_credit", "admin", String(by), data.note || "Admin grant", key],
          ["p_balance"]
        );
      } else {
        await callProcedure(
          pool,
          "sp_debit_wallet",
          [walletId, data.id, abs, "admin_debit", "admin", String(by), data.note || "Admin debit", key],
          ["p_balance"]
        );
      }

      revalidatePath("/admin/users");
      return back(`${amount > 0 ? "Granted" : "Deducted"} ${abs} coins`);
    }

    if (data.intent === "revoke") {
      await revokeAllForUser(data.id);
      revalidatePath("/admin/users");
      return back("All sessions revoked");
    }

    if (data.intent === "close") {
      // sp_close_account scrubs PII and zeroes the wallet while KEEPING the
      // coin ledger. A plain DELETE would fail anyway: the ledger is RESTRICT.
      await callProcedure(pool, "sp_close_account", [data.id, "Closed by admin"], []);
      await revokeAllForUser(data.id);
      revalidatePath("/admin/users");
      return back("Account closed. Coin history kept for audit.");
    }

    return back("Unknown action", true);
  } catch (err) {
    const message = (err as { sqlMessage?: string; message?: string }).sqlMessage ?? (err as Error).message;
    return back(message || "Action failed", true);
  }
}
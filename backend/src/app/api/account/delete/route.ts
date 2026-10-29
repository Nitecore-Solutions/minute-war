import bcrypt from "bcryptjs";
import { z } from "zod";
import { handler, ok, fail, bearer } from "@/lib/http";
import { verifyToken } from "@/lib/auth";
import { callProcedure, pool, query } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  // The app sends a bearer token. The public deletion page sends email and
  // password instead, because a user who has already uninstalled the app still
  // needs a way to close their account.
  email: z.string().trim().toLowerCase().email().optional(),
  password: z.string().min(1, "Enter your password").max(200),
  confirmation: z.string().trim(),
});

type AccountRow = RowDataPacket & {
  id: number;
  email: string;
  password_hash: string;
  role: "admin" | "player";
  active: number;
};

/**
 * POST /api/account/delete
 *
 * Closes the signed-in account, or an account identified by email + password
 * when called from the public deletion page.
 *
 * This is deliberately a soft close. sp_close_account scrubs name, email,
 * city, state, referral code and password hash, zeroes and freezes the wallet,
 * and revokes every session. It keeps the coin ledger because that is the
 * financial audit trail; the ledger is keyed to the original user id and no
 * longer contains personal data. Reusing the old email is therefore possible.
 *
 * Both modes require the current password, so a stolen session alone cannot
 * destroy an account and a public email address is not enough either.
 */
export async function POST(req: Request) {
  return handler(async () => {
    const parsed = Schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Check your details", 400, "validation");
    }

    if (parsed.data.confirmation !== "DELETE") {
      return fail('Type DELETE to confirm account closure', 400, "confirmation_required");
    }

    const session = await verifyToken(bearer(req));

    if (!session && !parsed.data.email) {
      return fail("Enter your email and password", 400, "validation");
    }

    // Never accept an email from a signed-in client: the token decides whose
    // account is being closed. The web path has no token, so it must match the
    // email and password together.
    const rows = session
      ? await query<AccountRow>(
          "SELECT id, email, password_hash, role, active FROM users WHERE id = ? LIMIT 1",
          [session.userId]
        )
      : await query<AccountRow>(
          "SELECT id, email, password_hash, role, active FROM users WHERE email = ? LIMIT 1",
          [parsed.data.email!]
        );

    const account = rows[0];

    // Same response for unknown email and wrong password. This endpoint must
    // not become an account-enumeration oracle.
    const invalid = () => fail("Email or password is wrong", 401, "invalid_credentials");

    if (!account || !account.active) return invalid();

    const matches = await bcrypt.compare(parsed.data.password, account.password_hash);
    if (!matches) return invalid();

    if (account.role === "admin") {
      return fail(
        "Admin accounts must be closed from the dashboard",
        403,
        "admin_account"
      );
    }

    await callProcedure(pool, "sp_close_account", [
      account.id,
      session ? "Deleted by user from the app" : "Deleted by user from the website",
    ]);

    return ok({ deleted: true });
  });
}

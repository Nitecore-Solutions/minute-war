import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "@/lib/db";
import { createSession, SESSION_COOKIE, toSessionUser, revokeSession, verifyToken } from "@/lib/auth";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

/**
 * POST /api/admin/session
 *
 * Sets the admin session as an httpOnly cookie rather than returning a token
 * to JavaScript. The dashboard is a server-rendered site, so it never needs
 * programmatic access to the credential, and keeping it out of JS means an
 * injected script cannot read it.
 */
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your email and password" }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const rows = await query<RowDataPacket & {
    id: number;
    player_id: number;
    name: string;
    email: string;
    role: string;
    is_premium: number;
    premium_until: string | null;
    avatar_seed: number;
    password_hash: string;
    active: number;
    must_change_password: number;
  }>(
    `SELECT id, player_id, name, email, role, is_premium, premium_until,
            avatar_seed, password_hash, active, must_change_password
       FROM users WHERE email = ? LIMIT 1`,
    [email]
  );

  const user = rows[0];

  // Same message whether the email is unknown or the password is wrong, so
  // this cannot be used to enumerate admin accounts.
  const invalid = NextResponse.json(
    { error: "Email or password is wrong" },
    { status: 401 }
  );

  if (!user) return invalid;
  if (!user.active) return invalid;
  if (user.role !== "admin") return invalid;

  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) return invalid;

  const sessionUser = toSessionUser(user as never);
  const { token, expiresAt } = await createSession(sessionUser, req.headers.get("user-agent"));

  const response = NextResponse.json({
    data: { user: { name: sessionUser.name, email: sessionUser.email } },
  });

  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return response;
}

/** DELETE /api/admin/session — sign out. */
export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const session = await verifyToken(token);
    if (session) await revokeSession(session.jti);
  }

  const response = NextResponse.json({ data: { signedOut: true } });
  response.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  return response;
}
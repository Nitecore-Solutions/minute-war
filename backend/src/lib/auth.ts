import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import { query, execute } from "./db";
import { unauthorized, forbidden } from "./http";
import type { RowDataPacket } from "mysql2/promise";

/**
 * Session model
 * -------------
 * Login is email + password. The JWT carries `userId`, `jti` and `role`.
 *
 * `jti` is stored in user_sessions so a session can be revoked before its
 * token expires (admin banning a user, user signing out everywhere). The
 * token is only accepted while its jti is still unrevoked.
 *
 * Expiry is NOT baked into the JWT alone: every request checks the sessions
 * table, so "log out all devices" works without a token blacklist.
 */

export const SESSION_COOKIE = "mw_admin_session";

export type Role = "admin" | "player";

export interface SessionUser {
  id: number;
  playerId: number;
  name: string;
  email: string;
  role: Role;
  isPremium: boolean;
  premiumUntil: string | null;
  avatarSeed: number;
}

interface UserRow extends RowDataPacket {
  id: number;
  player_id: number;
  name: string;
  email: string;
  role: Role;
  is_premium: number;
  premium_until: string | null;
  avatar_seed: number;
  password_hash: string;
  active: number;
  must_change_password: number;
}

function secret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters long");
  }
  return new TextEncoder().encode(value);
}

function ttlDays(): number {
  return Number(process.env.JWT_TTL_DAYS ?? 30);
}

const USER_COLUMNS = `id, player_id, name, email, role, is_premium,
                      premium_until, avatar_seed, password_hash, active,
                      must_change_password`;

export function toSessionUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    playerId: row.player_id,
    name: row.name,
    email: row.email,
    role: row.role,
    isPremium: Boolean(row.is_premium) && (!row.premium_until || new Date(row.premium_until) > new Date()),
    premiumUntil: row.premium_until ? new Date(row.premium_until).toISOString() : null,
    avatarSeed: row.avatar_seed,
  };
}

/** Issues a token and records the session so it stays revocable. */
export async function createSession(
  user: SessionUser,
  userAgent?: string | null
): Promise<{ token: string; expiresAt: Date }> {
  const jti = randomUUID();
  const days = ttlDays();
  const expiresAt = new Date(Date.now() + days * 86_400_000);

  await execute(
    `INSERT INTO user_sessions (jti, user_id, expires_at, user_agent)
     VALUES (?, ?, ?, ?)`,
    [jti, user.id, expiresAt, userAgent?.slice(0, 255) ?? null]
  );

  const token = await new SignJWT({
    userId: String(user.id),
    playerId: user.playerId,
    role: user.role,
    jti,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .setIssuer("minute-war")
    .setAudience("minute-war")
    .sign(secret());

  return { token, expiresAt };
}

export interface VerifiedSession {
  userId: number;
  playerId: number;
  role: Role;
  jti: string;
}

/**
 * Verifies a token and confirms the session is still live.
 * Returns null for anything invalid rather than throwing, so callers can
 * simply treat null as "not signed in".
 */
export async function verifyToken(token: string | null): Promise<VerifiedSession | null> {
  if (!token) return null;

  let payload: { userId?: string; playerId?: number; role?: Role; jti?: string };
  try {
    ({ payload } = await jwtVerify(token, secret(), {
      issuer: "minute-war",
      audience: "minute-war",
    }));
  } catch {
    return null;
  }

  if (!payload.userId || !payload.jti) return null;

  const session = await query<RowDataPacket>(
    `SELECT s.jti, u.active, u.role, u.is_premium, u.premium_until
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.jti = ?
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()`,
    [payload.jti]
  );

  const row = session[0] as
    | { active: number; role: Role; is_premium: number; premium_until: string | null }
    | undefined;

  if (!row) return null;
  if (!row.active) return null;

  return {
    userId: Number(payload.userId),
    playerId: Number(payload.playerId),
    // The role is read from the database, never from the token, so a demotion
    // takes effect immediately instead of at the next token expiry.
    role: row.role,
    jti: payload.jti,
  };
}

export async function revokeSession(jti: string): Promise<void> {
  await execute("UPDATE user_sessions SET revoked_at = NOW() WHERE jti = ?", [jti]);
}

export async function revokeAllForUser(userId: number): Promise<void> {
  await execute(
    "UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL",
    [userId]
  );
}

/** Throws a 401 response unless a valid session is present. */
export async function requireUser(req: Request): Promise<VerifiedSession> {
  const header = req.headers.get("authorization");
  const token = header?.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : null;

  const session = await verifyToken(token);
  if (!session) throw new HttpError(401, "Sign in to continue", "unauthenticated");
  return session;
}

/** Throws a 403 unless the session belongs to an admin. */
export async function requireAdmin(req: Request): Promise<VerifiedSession> {
  const session = await requireUser(req);
  if (session.role !== "admin") {
    throw new HttpError(403, "Not allowed", "forbidden");
  }
  return session;
}

/**
 * Thrown by requireUser / requireAdmin. `handler()` turns it into a JSON
 * response; anything else falls through to mapDbError.
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Loads the full user for a verified session. */
export async function loadUser(userId: number): Promise<SessionUser | null> {
  const row = await query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = ? AND active = 1`,
    [userId]
  );
  return row[0] ? toSessionUser(row[0]) : null;
}

export async function findByEmail(email: string): Promise<UserRow | null> {
  const rows = await query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE email = ?`,
    [email.toLowerCase()]
  );
  return rows[0] ?? null;
}

export async function findById(id: number): Promise<UserRow | null> {
  const rows = await query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

export { unauthorized, forbidden };
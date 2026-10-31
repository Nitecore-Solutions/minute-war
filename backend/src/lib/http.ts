import "server-only";
import { NextResponse } from "next/server";

/**
 * Response envelope shared by every API route:
 *   success -> { data: T }
 *   failure -> { error: string, code?: string }
 *
 * The mobile client relies on this shape and never throws, so adding a new
 * route means going through one of these helpers rather than hand-rolling
 * NextResponse.json.
 */

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function fail(message: string, status = 400, code?: string) {
  return NextResponse.json({ error: message, code }, { status });
}

export function unauthorized(message = "Sign in to continue") {
  return fail(message, 401, "unauthenticated");
}

export function forbidden(message = "Not allowed") {
  return fail(message, 403, "forbidden");
}

export function notFound(message = "Not found") {
  return fail(message, 404, "not_found");
}

/**
 * Maps MySQL errors onto useful HTTP statuses so the app shows something
 * meaningful instead of a generic 500.
 *
 * The stored procedures raise these exact strings, so they are matched here
 * rather than parsed out at every call site.
 */
export function mapDbError(err: unknown): NextResponse {
  const e = err as {
    code?: string;
    sqlMessage?: string;
    message?: string;
  };

  const message = e?.sqlMessage ?? e?.message ?? String(err);

  // --- wallet / economy ---
  if (message.includes("insufficient_balance_or_frozen")) {
    return fail("Not enough coins for that", 409, "insufficient_balance");
  }
  if (message.includes("wallet_not_found_or_frozen")) {
    return fail("Your wallet is unavailable. Contact support.", 409, "wallet_frozen");
  }

  // --- accounts ---
  if (message.includes("email_taken")) {
    return fail("That email is already registered", 409, "email_taken");
  }
  if (message.includes("credentials_invalid")) {
    return fail("Email or password is wrong", 401, "invalid_credentials");
  }
  if (message.includes("account_disabled")) {
    return fail("This account has been disabled", 403, "account_disabled");
  }
  if (message.includes("account_closed")) {
    return fail("This account has been closed", 403, "account_closed");
  }

  // --- gameplay ---
  if (message.includes("challenge_not_found")) {
    return notFound("That challenge does not exist");
  }
  if (message.includes("challenge_expired")) {
    return fail("This challenge has expired", 409, "challenge_expired");
  }
  if (message.includes("challenge_already_answered")) {
    return fail("You already took this challenge", 409, "challenge_answered");
  }
  if (message.includes("maintenance_mode")) {
    return fail("RushArena is briefly down for maintenance", 503, "maintenance");
  }
  if (message.includes("registrations_closed")) {
    return fail("Sign-ups are closed right now", 503, "registrations_closed");
  }
  if (message.includes("game_not_active")) {
    return fail("That game is not available right now", 409, "game_inactive");
  }
  if (message.includes("premium_required")) {
    return fail("This game needs Premium", 402, "premium_required");
  }

  // --- mysql structural errors, which mean a bug on our side ---
  if (e?.code === "ER_DUP_ENTRY") {
    return fail("That already exists", 409, "duplicate");
  }
  if (e?.code === "ER_NO_REFERENCED_ROW" || e?.code === "ER_NO_REFERENCED_ROW_2") {
    return fail("Referenced record does not exist", 400, "bad_reference");
  }
  if (e?.code === "ER_ROW_IS_REFERENCED_2") {
    return fail("That record is still in use", 409, "still_referenced");
  }
  if (e?.code === "ECONNREFUSED" || e?.code === "PROTOCOL_CONNECTION_LOST") {
    console.error("[db] connection failed:", message);
    return fail("The database is unreachable", 503, "db_unavailable");
  }

  console.error("[db]", message);
  return fail("Something went wrong on our side", 500, "server_error");
}

/** Reads a bearer token from the Authorization header. */
export function bearer(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

/** Client-generated key so a retry cannot double-apply an operation. */
export function idempotencyKey(req: Request, fallback: string): string {
  return req.headers.get("idempotency-key")?.trim() || fallback;
}

/** Wraps a route handler so any thrown error becomes a clean JSON response. */
export function handler(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  return fn().catch(mapDbError);
}
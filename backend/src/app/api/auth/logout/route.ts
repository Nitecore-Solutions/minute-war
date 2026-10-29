import { handler, ok, bearer } from "@/lib/http";
import { verifyToken, revokeSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/logout
 *
 * Revokes the one session the token was issued for. Always returns success:
 * logging out of an already-invalid session is not an error worth showing.
 */
export async function POST(req: Request) {
  return handler(async () => {
    const session = await verifyToken(bearer(req));
    if (session) await revokeSession(session.jti);
    return ok({ signedOut: true });
  });
}
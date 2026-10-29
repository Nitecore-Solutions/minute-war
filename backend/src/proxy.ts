import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * Next.js 16 renamed `middleware` to `proxy`, and the exported function must
 * be named `proxy`.
 *
 * This is a fast pre-filter only. Every admin page and API route re-checks
 * the session server-side via requireAdmin(), so bypassing this redirect
 * gains nothing. It exists purely to avoid rendering the dashboard shell for
 * a user who is about to be bounced to the login form.
 */

function secret(): Uint8Array | null {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) return null;
  return new TextEncoder().encode(value);
}

export async function proxy(request: NextRequest) {
  const key = secret();
  if (!key) return NextResponse.next(); // fail open; routes will reject

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return redirectToLogin(request);

  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: "minute-war",
      audience: "minute-war",
    });
    if (payload.role !== "admin") return redirectToLogin(request);
  } catch {
    return redirectToLogin(request);
  }

  return NextResponse.next();
}

function redirectToLogin(request: NextRequest) {
  const url = new URL("/admin/login", request.url);
  url.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything under /admin EXCEPT the login page.
  //
  // The negative lookahead matters: a plain "/admin/:path*" also matches
  // /admin/login, which makes the proxy redirect the login page to itself and
  // the browser spins on "too many redirects".
  //
  // The dashboard pages live in the (dashboard) route group specifically so
  // /admin/login can sit outside the protected layout. Without that, the
  // layout's own redirect() and this proxy fight each other forever.
  matcher: ["/admin", "/admin/((?!login).*)"],
};
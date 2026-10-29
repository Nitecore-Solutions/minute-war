import { NextResponse } from "next/server";
import { ping } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Used by tools/start-all.ps1 to decide when the stack is ready, and by the
 * mobile app to show an honest "cannot reach the server" message.
 *
 * Deliberately unauthenticated and cheap. It reports whether the pool can
 * reach MySQL, because a Next server that boots with a broken DATABASE_URL
 * is worse than one that fails loudly here.
 */
export async function GET() {
  const dbOk = await ping();

  let settings: Record<string, unknown> = {};
  try {
    settings = (await getSettings()) as unknown as Record<string, unknown>;
  } catch {
    settings = {};
  }

  const body = {
    data: {
      status: dbOk ? "ok" : "degraded",
      database: dbOk ? "up" : "down",
      appName: settings.app_name ?? "MINUTE WAR",
      maintenance: settings.maintenance === true,
      time: new Date().toISOString(),
    },
  };

  // 503 when the database is unreachable, so a health check actually fails.
  return NextResponse.json(body, { status: dbOk ? 200 : 503 });
}
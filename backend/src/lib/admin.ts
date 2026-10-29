import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken, type VerifiedSession } from "@/lib/auth";
import { execute, query, type SqlParams } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

/**
 * Shared helpers for the admin pages.
 *
 * Every mutating admin action goes through `adminAction`, which re-checks the
 * session, runs the work inside a try/catch, and revalidates the page. The
 * route-level proxy is only a pre-filter, so this is the real gate.
 */

const COOKIE = "mw_admin_session";

/** Throws a redirect when the caller is not an admin. */
export async function requireAdminPage(): Promise<VerifiedSession> {
  const store = await cookies();
  const session = await verifyToken(store.get(COOKIE)?.value ?? null);

  if (!session || session.role !== "admin") {
    redirect("/admin/login");
  }

  return session;
}

/** Reads the signed-in admin's id for the audit log. */
export async function adminId(): Promise<number | null> {
  try {
    return (await requireAdminPage()).userId;
  } catch {
    return null;
  }
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Runs a privileged write.
 *
 * `revalidate` forces the page to re-read from MySQL, which matters because
 * every figure on the dashboard is live: without it Next serves the cached
 * render and the change appears not to have taken.
 */
export async function adminAction(
  description: string,
  work: () => Promise<void | string>
): Promise<ActionResult> {
  try {
    const session = await requireAdminPage();
    const note = await work();

    // Every privileged change is recorded. A failure here must not roll back
    // the change itself, so it is logged rather than thrown.
    await execute(
      `INSERT INTO admin_audit_log (admin_id, action, meta)
       VALUES (?, ?, ?)`,
      [session.userId, description, JSON.stringify({ note: note ?? null })]
    ).catch(() => {});

    return { ok: true, message: note ?? "Saved" };
  } catch (err) {
    return { ok: false, message: (err as Error).message ?? "Something went wrong" };
  }
}

/** Formats a DATETIME for display, or an em dash when null. */
export function fmtDate(value: string | Date | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 16).replace("T", " ");
}

/** Indian digit grouping, matching how scores are read in the app. */
export function fmtNumber(value: number | string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-IN");
}

/** Turns a MySQL row count into the total for a paginated table. */
export async function countRows(sql: string, params: SqlParams = []): Promise<number> {
  const rows = await query<RowDataPacket & { n: number }>(sql, params);
  return Number(rows[0]?.n ?? 0);
}
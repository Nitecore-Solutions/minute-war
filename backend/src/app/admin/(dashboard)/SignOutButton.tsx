"use client";

import { useState } from "react";

/**
 * Clears the session cookie and returns to the login screen.
 *
 * Uses a hard navigation for the same reason as the login form: the session
 * cookie is gone, so the protected layout has to re-render on a fresh document
 * request. router.replace() + router.refresh() together deadlock the
 * transition and leave the page stuck rendering.
 */
export default function SignOutButton() {
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await fetch("/api/admin/session", { method: "DELETE" });
    } catch {
      // Even if the request failed, navigate: the cookie is cleared by the
      // response header on success, and a stale page is worse than a stale
      // cookie for one request.
    } finally {
      window.location.assign("/admin/login");
    }
  };

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="btn btn-sm"
      style={{ width: "100%", justifyContent: "center" }}
    >
      {busy ? "Signing out..." : "Sign out"}
    </button>
  );
}
"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * The admin sign-in form.
 *
 * The session is set as an httpOnly cookie by /api/admin/session, so the
 * dashboard never touches a token in JavaScript and an injected script cannot
 * read it.
 */
function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json?.error ?? "Sign in failed");
        setBusy(false);
        return;
      }

      // A hard navigation, not router.replace().
      //
      // The session lives in an httpOnly cookie, so the dashboard's server
      // components can only see it on a fresh document request. The client
      // router would have to re-fetch and re-render every layout, and calling
      // router.refresh() right after router.replace() deadlocks the transition
      // outright -- the page sits on "Rendering..." forever with the button
      // stuck on "Signing in...".
      //
      // `from` is the page the proxy bounced the user away from. It must start
      // with /admin and must not be the login page itself, or this loops.
      const from = params.get("from");
      const target =
        from && from.startsWith("/admin") && !from.startsWith("/admin/login")
          ? from
          : "/admin";

      window.location.assign(target);
    } catch {
      setError("Cannot reach the server");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      {error ? <div className="error-text">{error}</div> : null}

      <label className="field">
        <span className="field-label">Email</span>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
          autoFocus
        />
      </label>

      <label className="field">
        <span className="field-label">Password</span>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>

      <button
        className="btn btn-primary"
        type="submit"
        disabled={busy}
        style={{ width: "100%", justifyContent: "center" }}
      >
        {busy ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>MINUTE WAR</h1>
        <p style={{ margin: "0 0 22px", color: "#64748b", fontSize: 13 }}>
          Operations dashboard
        </p>

        {/* useSearchParams needs a Suspense boundary or the route opts out of
            static rendering entirely. */}
        <Suspense fallback={<p className="hint">Loading...</p>}>
          <LoginForm />
        </Suspense>

        <p className="hint">
          Sessions live in an httpOnly cookie and are revoked server-side, so
          signing out takes effect immediately everywhere.
        </p>
      </div>
    </div>
  );
}
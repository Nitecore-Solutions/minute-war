"use client";

import { useState } from "react";

/**
 * Public account-deletion form.
 *
 * This is intentionally password-based rather than a "request" that waits for
 * an admin: Google Play requires a usable web deletion path, and a support
 * queue is not a deletion path. The API verifies the email/password pair and
 * runs the same sp_close_account procedure as the in-app flow.
 */
export default function DeleteAccountForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (confirmation !== "DELETE") {
      setError("Type DELETE exactly to confirm.");
      return;
    }

    setBusy(true);

    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, confirmation }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        data?: { deleted?: boolean };
      };

      if (!res.ok || !json.data?.deleted) {
        setError(json.error ?? "Could not delete the account. Please try again.");
        setBusy(false);
        return;
      }

      setPassword("");
      setConfirmation("");
      setDone(true);
    } catch {
      setError(
        "Could not reach the server. Check your connection and try again."
      );
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="public-form-card">
        <div className="public-form-success" role="status">
          Your account has been deleted. Your personal details have been removed,
          your wallet is closed, and every signed-in session has been revoked.
        </div>
        <p>
          You can create a new account with the same email address later. If you
          did not expect this, email{" "}
          <a href="mailto:support@minutewar.in">support@minutewar.in</a>{" "}
          immediately.
        </p>
      </div>
    );
  }

  return (
    <form className="public-form-card" onSubmit={submit}>
      <h2>Delete with your account password</h2>
      <p>
        Use the same email and password you use to sign in to MINUTE WAR. The
        password is checked before anything is changed.
      </p>

      {error ? (
        <div className="public-form-error" role="alert" aria-live="polite">
          {error}
        </div>
      ) : null}

      <div className="public-field">
        <label htmlFor="delete-email">Email address</label>
        <input
          id="delete-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
        />
      </div>

      <div className="public-field">
        <label htmlFor="delete-password">Password</label>
        <input
          id="delete-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Your current password"
        />
      </div>

      <div className="public-field">
        <label htmlFor="delete-confirmation">
          Type <strong>DELETE</strong> to confirm
        </label>
        <input
          id="delete-confirmation"
          type="text"
          autoComplete="off"
          spellCheck={false}
          required
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value.toUpperCase())}
          placeholder="DELETE"
        />
      </div>

      <button
        type="submit"
        className="public-btn public-btn-primary"
        disabled={busy || !email.trim() || !password || confirmation !== "DELETE"}
      >
        {busy ? "Deleting…" : "Delete my account"}
      </button>
    </form>
  );
}

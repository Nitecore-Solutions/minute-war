import type { Metadata } from "next";
import Link from "next/link";
import DeleteAccountForm from "./DeleteAccountForm";

export const metadata: Metadata = {
  title: "Delete Account",
  description:
    "Permanently close your RushArena account from the app or from this web page.",
};

export default function DeleteAccountPage() {
  return (
    <article className="public-page public-prose">
      <p className="public-kicker">Account controls</p>
      <h1>Delete your account</h1>
      <p className="public-updated">Last updated: 29 October 2026</p>

      <p>
        You can close your RushArena account permanently. This removes your
        name, email address, city, state, referral code and password, freezes your
        wallet, and signs you out everywhere. Deletion cannot be undone.
      </p>

      <div className="public-note public-danger-note">
        <strong>Before you delete:</strong> you will lose your coins, streak,
        badges, leaderboard history and access to the account. Coins have no cash
        value and cannot be refunded or transferred.
      </div>

      <h2>Delete from the app</h2>
      <p>
        Open the app, go to <strong>Profile → Delete account</strong>, type{" "}
        <strong>DELETE</strong>, and enter your password. This is the fastest
        route and works even if you are already signed in.
      </p>

      <h2>Delete from the web</h2>
      <p>
        If you no longer have the app, use the form below. It checks your email
        and password against the account before making any change.
      </p>

      <DeleteAccountForm />

      <h2>What we keep</h2>
      <p>
        We keep the coin ledger and an anonymised account ID as a financial and
        fraud-prevention record. The ledger is keyed to the original account ID,
        but your name, email, city, state, referral code and password hash are
        overwritten, so the record no longer identifies you. Server logs and
        backups rotate on a limited schedule. See the{" "}
        <Link href="/privacy">Privacy Policy</Link> for the full retention
        details.
      </p>

      <h2>Need help?</h2>
      <p>
        If you cannot sign in or the form does not work, email{" "}
        <a href="mailto:support@minutewar.in">support@minutewar.in</a> from the
        address on the account. Do not send your password by email. We may ask
        you to verify ownership another way.
      </p>
    </article>
  );
}

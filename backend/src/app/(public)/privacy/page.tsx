import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How RushArena collects, uses, stores and deletes personal data, including how to close your account.",
};

export default function PrivacyPolicy() {
  return (
    <article className="public-page public-prose">
      <p className="public-kicker">Your data, explained</p>
      <h1>Privacy Policy</h1>
      <p className="public-updated">Last updated: 29 October 2026</p>

      <p>
        RushArena is a 60-second skill game operated from India. This policy
        explains what we collect, why we collect it, who we share it with, and
        how you can get it deleted. It applies to the Android app, the public
        website and the player account behind both.
      </p>

      <div className="public-note">
        <strong>Quick version:</strong> we collect the account details you give
        us, the scores and coins you earn, and basic technical logs needed to run
        the service. We use Google AdMob to show ads. We do not sell your
        personal data. You can delete your account in the app or on the{" "}
        <Link href="/delete-account">account deletion page</Link>.
      </div>

      <h2>1. Who is responsible</h2>
      <p>
        RushArena is the data controller for the information described here.
        For privacy questions, contact{" "}
        <a href="mailto:support@minutewar.in">support@minutewar.in</a>. Our
        Grievance Officer can be reached at the same address.
      </p>

      <h2>2. What we collect</h2>

      <h3>Account information</h3>
      <ul>
        <li>Your name, email address and password (stored only as a bcrypt hash).</li>
        <li>
          An optional city or state, if you choose to provide it during signup or
          in your profile.
        </li>
        <li>
          Your public player ID, referral code, account status, premium status
          and signup date.
        </li>
      </ul>

      <h3>Gameplay information</h3>
      <ul>
        <li>
          Daily runs, mini-game scores, completion times, streaks, badges and
          leaderboard position.
        </li>
        <li>
          Wallet balance and the coin ledger: every credit, debit, reward and
          adjustment, with its reason and timestamp.
        </li>
        <li>
          Challenge metadata if challenges are enabled, such as the challenge
          code, scores, status and expiry.
        </li>
        <li>
          Session records, including when a session was created, when it expires
          and when it was revoked.
        </li>
      </ul>

      <h3>Technical information</h3>
      <ul>
        <li>
          IP address, browser or app user agent, request timestamps, error logs
          and basic security events recorded by our hosting provider.
        </li>
        <li>
          Device and advertising information described in the ads section below.
        </li>
      </ul>

      <p>
        We do not ask for your precise location, contacts, photos, microphone or
        camera. The app does not use those permissions for gameplay.
      </p>

      <h2>3. Why we use it</h2>
      <ul>
        <li>
          <strong>To create and secure your account:</strong> sign you in, keep
          your session valid, prevent account takeover and enforce our terms.
        </li>
        <li>
          <strong>To run the game:</strong> save scores, calculate ranks and
          percentiles, maintain streaks and award virtual coins.
        </li>
        <li>
          <strong>To operate the service:</strong> debug errors, measure
          performance, prevent abuse and protect the integrity of leaderboards.
        </li>
        <li>
          <strong>To show ads:</strong> request and display advertising through
          Google AdMob, and measure whether an ad was shown.
        </li>
        <li>
          <strong>To meet legal obligations:</strong> keep financial and fraud
          records where required, and respond to lawful requests.
        </li>
      </ul>

      <p>
        Where applicable law requires a legal basis, we rely on performance of
        our contract with you, your consent (for example, where consent is needed
        for personalised advertising), our legitimate interests in operating and
        securing the game, and compliance with legal obligations.
      </p>

      <h2>4. Advertising and Google AdMob</h2>
      <p>
        The app uses Google AdMob to show banner and interstitial ads. AdMob and
        its partners may collect or receive information such as your advertising
        ID, device type, operating system, approximate location derived from IP
        address, app interactions and ad interactions. This helps them serve,
        cap, measure and improve ads.
      </p>
      <p>
        You can reset or limit your advertising ID in Android Settings. Where
        required, the app or Google will ask for consent before using your data
        for personalised advertising. Google&apos;s practices are described in
        the{" "}
        <a
          href="https://policies.google.com/privacy"
          target="_blank"
          rel="noreferrer"
        >
          Google Privacy Policy
        </a>{" "}
        and{" "}
        <a
          href="https://policies.google.com/technologies/ads"
          target="_blank"
          rel="noreferrer"
        >
          Google advertising technologies
        </a>
        .
      </p>
      <p>
        The app asks our server which ad placements are enabled. The server-side
        switch does not itself identify you; it returns placement names and ad
        unit IDs to the app.
      </p>

      <h2>5. Cookies and local storage</h2>
      <p>
        The public website does not use advertising or analytics cookies. The
        operator dashboard uses one httpOnly session cookie so administrators can
        sign in; that cookie is not used for advertising and is not available to
        page JavaScript.
      </p>
      <p>
        The mobile app stores your session token and a small amount of app state
        in the device&apos;s app storage. Signing out or deleting your account
        removes the token from the device.
      </p>

      <h2>6. Who we share data with</h2>
      <p>
        We share only what is needed to run the service, and only with providers
        that process it on our instructions:
      </p>
      <ul>
        <li>
          <strong>Google AdMob</strong> for advertising and ad measurement, as
          described above.
        </li>
        <li>
          <strong>Render</strong> for application hosting and server logs, and{" "}
          <strong>Aiven</strong> for managed MySQL database hosting.
        </li>
        <li>
          <strong>Professional advisers and authorities</strong> where required
          by law, to investigate fraud or abuse, or to protect the rights and
          safety of players and the service.
        </li>
      </ul>
      <p>
        We do not sell personal data. If the game is sold or transferred, account
        data may be transferred as part of that transaction, subject to this
        policy and applicable law.
      </p>

      <h2>7. Where data is processed</h2>
      <p>
        Our hosting and advertising providers may process data in countries
        other than India. Where that happens, we rely on the providers&apos;
        contractual safeguards and applicable legal mechanisms. Data is
        transmitted to the app and website over HTTPS.
      </p>

      <h2>8. How long we keep it</h2>
      <ul>
        <li>
          <strong>Active accounts:</strong> account, gameplay and wallet data are
          kept while your account is open.
        </li>
        <li>
          <strong>Closed accounts:</strong> we remove your name, email, city,
          state, referral code and password hash, freeze the wallet and revoke
          all sessions. We keep the coin ledger and anonymised account ID because
          it is the financial audit trail. The ledger no longer contains your
          personal details.
        </li>
        <li>
          <strong>Server logs:</strong> kept for a limited period for security
          and debugging, then deleted or rotated. Backups may retain copies for a
          short period before they are overwritten.
        </li>
        <li>
          <strong>Legal records:</strong> kept longer where law, tax or fraud
          prevention requires it.
        </li>
      </ul>

      <h2>9. Deleting your account</h2>
      <p>
        You can delete your account at any time from the app: open{" "}
        <strong>Profile → Delete account</strong>, confirm the deletion, and enter
        your password. You can also use the{" "}
        <Link href="/delete-account">public deletion page</Link> if you no longer
        have the app.
      </p>
      <p>
        Deletion is permanent and cannot be undone. You will lose your coins,
        badges, streak and access to the account. You may create a new account
        later with the same email address. If you have a pending support request
        or a legal obligation that requires us to retain a record, we will explain
        that before completing the request.
      </p>

      <h2>10. Security</h2>
      <p>
        Passwords are hashed with bcrypt and are never stored in plain text.
        Sessions are revocable server-side, and the signing secret and database
        credentials stay on the server. We use HTTPS, access controls and
        least-privilege database accounts. No system is perfectly secure, so
        please use a unique password and tell us immediately if you suspect
        unauthorised access.
      </p>

      <h2>11. Children and teenagers</h2>
      <p>
        RushArena is not directed to children under 13. You must be at least 13
        to create an account. If you are under 18, use the game with the
        permission of a parent or guardian. If we learn that a child under 13 has
        given us personal data, we will delete it. Contact us if you believe that
        has happened.
      </p>

      <h2>12. Your choices and rights</h2>
      <p>
        Subject to applicable law, including the Digital Personal Data Protection
        Act, 2023 where it applies, you may:
      </p>
      <ul>
        <li>Ask for a copy of the personal data we hold about you.</li>
        <li>Ask us to correct inaccurate account information.</li>
        <li>Ask us to delete your account and personal data.</li>
        <li>
          Withdraw consent for processing that relies on consent, without
          affecting processing that already happened.
        </li>
        <li>
          Raise a grievance with our Grievance Officer at{" "}
          <a href="mailto:support@minutewar.in">support@minutewar.in</a>.
        </li>
      </ul>
      <p>
        We may need to verify that the request comes from the account holder
        before acting on it. We will respond within the time required by
        applicable law.
      </p>

      <h2>13. Changes to this policy</h2>
      <p>
        We may update this policy as the game or the law changes. The date at the
        top shows the latest version. If a change materially affects your rights,
        we will give reasonable notice in the app or by email before it takes
        effect.
      </p>

      <h2>14. Contact</h2>
      <p>
        Privacy questions, data requests and complaints:{" "}
        <a href="mailto:support@minutewar.in">support@minutewar.in</a>.
      </p>
      <p>
        For account deletion, the fastest route is the in-app{" "}
        <strong>Profile → Delete account</strong> screen or the{" "}
        <Link href="/delete-account">web deletion form</Link>.
      </p>
    </article>
  );
}

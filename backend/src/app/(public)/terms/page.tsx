import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Use",
  description:
    "The rules for using MINUTE WAR, including accounts, virtual coins, fair play and account deletion.",
};

export default function TermsOfUse() {
  return (
    <article className="public-page public-prose">
      <p className="public-kicker">The ground rules</p>
      <h1>Terms of Use</h1>
      <p className="public-updated">Last updated: 29 October 2026</p>

      <p>
        These terms are an agreement between you and MINUTE WAR. By downloading,
        installing or using the app, or by creating an account, you agree to
        them. If you do not agree, do not use the game.
      </p>

      <h2>1. Who can use MINUTE WAR</h2>
      <p>
        You must be at least 13 years old to create an account. If you are under
        18, you may use the game only with the permission of a parent or
        guardian. You must be able to enter into a binding contract under the law
        that applies to you.
      </p>
      <p>
        The game is intended for players in India, but it may be accessible
        elsewhere. You are responsible for complying with your local laws.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>
          Give accurate information and keep your password private. You are
          responsible for activity on your account.
        </li>
        <li>
          One person should use one account. Creating multiple accounts to gain
          leaderboard or coin advantages is not allowed.
        </li>
        <li>
          Tell us promptly at{" "}
          <a href="mailto:support@minutewar.in">support@minutewar.in</a> if you
          believe your account has been compromised.
        </li>
        <li>
          We may suspend or close accounts that break these terms, cheat, abuse
          other players, or create a security or legal risk.
        </li>
      </ul>

      <h2>3. The game is a skill game</h2>
      <p>
        MINUTE WAR is a timed skill and trivia game. It is not a game of chance,
        gambling, betting or a lottery. There is no entry fee to play, no wager
        against another player, and no way to withdraw money from the game.
      </p>

      <h2>4. Virtual coins</h2>
      <ul>
        <li>
          Coins, streaks, badges and similar rewards are virtual progress. They
          are not money, securities or property, and they have no cash value.
        </li>
        <li>
          Coins cannot be sold, transferred, redeemed for cash, or exchanged
          outside the game. They can only be used for features we make available
          in the game.
        </li>
        <li>
          We may change how coins are earned or spent, correct errors, or expire
          coins where required to prevent abuse or comply with law. We will not
          remove coins arbitrarily from a player in good standing.
        </li>
        <li>
          If we ever offer paid coin packs, the app store&apos;s payment and
          refund terms will also apply. We do not currently sell coins.
        </li>
      </ul>

      <h2>5. Ads and sponsors</h2>
      <p>
        The game may show advertising, sponsored content or promotional
        placements. Some rewards may be linked to watching an ad. Ads are
        provided by third parties such as Google AdMob, and their own terms and
        privacy policies apply to the ad experience. We are not responsible for
        the content of third-party ads or the products they promote.
      </p>

      <h2>6. Fair play</h2>
      <p>You must not:</p>
      <ul>
        <li>
          Use bots, automation, modified clients, emulators, macros or other
          tools to play, farm coins or manipulate scores.
        </li>
        <li>
          Exploit bugs, duplicate rewards, interfere with the server, or attempt
          to access another player&apos;s account or data.
        </li>
        <li>
          Reverse engineer, decompile or copy the app except where the law
          expressly allows it.
        </li>
        <li>
          Harass, threaten, impersonate or abuse other players, or use the game
          for unlawful activity.
        </li>
        <li>
          Use the game to distribute malware, spam or content that infringes
          someone else&apos;s rights.
        </li>
      </ul>
      <p>
        We may remove scores, adjust balances, restrict features or suspend an
        account while we investigate suspected abuse. Serious or repeated abuse
        can lead to permanent closure.
      </p>

      <h2>7. Content and intellectual property</h2>
      <p>
        The MINUTE WAR name, logo, app, code, game formats, text and original
        artwork belong to us or our licensors. You get a limited, non-exclusive,
        non-transferable, revocable licence to use the app for personal,
        non-commercial play. You may not use our branding without permission.
      </p>
      <p>
        Some trivia questions include images or names of public figures and
        third-party material. Those names, images and trademarks belong to their
        respective owners and are used for identification, commentary or trivia.
        Their appearance does not imply endorsement, sponsorship or a
        partnership. If you believe content infringes your rights, contact{" "}
        <a href="mailto:support@minutewar.in">support@minutewar.in</a> and we will
        review it promptly.
      </p>

      <h2>8. Availability and changes</h2>
      <p>
        We aim to keep the game available, but we do not promise uninterrupted
        service. We may update, change, pause or discontinue features, games,
        rewards or the service itself. Maintenance, network problems, app store
        rules and events outside our control can affect access.
      </p>

      <h2>9. Ending your use</h2>
      <p>
        You can stop using the game at any time. You can delete your account from{" "}
        <strong>Profile → Delete account</strong> in the app, or from the{" "}
        <Link href="/delete-account">public deletion page</Link>. Deletion is
        permanent and removes your personal details as described in our{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
      <p>
        We may suspend or close an account if you break these terms, if we are
        required to by law, or if continuing to provide the account creates a
        risk to other players or the service.
      </p>

      <h2>10. Disclaimers</h2>
      <p>
        The game is provided &quot;as is&quot; and &quot;as available&quot;. To
        the extent permitted by law, we disclaim implied warranties of
        merchantability, fitness for a particular purpose, accuracy and
        non-infringement. We do not warrant that scores, leaderboards or rewards
        will always be accurate or available, though we will take reasonable
        steps to correct errors.
      </p>
      <p>
        Nothing in these terms limits rights you have under mandatory consumer
        law, including rights that cannot be excluded by contract.
      </p>

      <h2>11. Limitation of liability</h2>
      <p>
        To the extent permitted by law, MINUTE WAR is not liable for indirect,
        incidental, special, consequential or punitive losses, or for lost
        profits, data, goodwill or virtual coins, arising from your use of or
        inability to use the game. Our total liability for a claim relating to
        the game will not exceed the amount you paid us in the twelve months
        before the claim, or ₹1,000 if you paid us nothing.
      </p>
      <p>
        These limits do not apply to fraud, wilful misconduct, death or personal
        injury caused by negligence, or any liability that cannot legally be
        limited.
      </p>

      <h2>12. Governing law and disputes</h2>
      <p>
        These terms are governed by the laws of India. Before starting formal
        proceedings, please contact us at{" "}
        <a href="mailto:support@minutewar.in">support@minutewar.in</a> so we can
        try to resolve the issue. Subject to applicable law, the courts of India
        will have jurisdiction over disputes.
      </p>

      <h2>13. Changes to these terms</h2>
      <p>
        We may update these terms as the game changes. The date at the top shows
        the latest version. If a change materially affects your rights, we will
        give reasonable notice in the app or by email. Continuing to use the game
        after the change takes effect means you accept the updated terms.
      </p>

      <h2>14. Contact</h2>
      <p>
        Questions about these terms:{" "}
        <a href="mailto:support@minutewar.in">support@minutewar.in</a>.
      </p>
      <p>
        For account deletion, use <strong>Profile → Delete account</strong> in the
        app or the <Link href="/delete-account">web deletion form</Link>.
      </p>
    </article>
  );
}

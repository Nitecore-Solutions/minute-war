import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Home",
  description:
    "RushArena is India's 60-second challenge game: six quick mini games, a daily run, streaks and a leaderboard.",
};

export default function PublicHome() {
  return (
    <>
      <section className="public-hero">
        <p className="public-kicker">India&apos;s 60-second challenge</p>
        <h1>
          One minute.
          <br />
          Six games. <span>One winner.</span>
        </h1>
        <p className="public-lead">
          A fresh daily run, quick-fire mini games, and a leaderboard built for
          bragging rights. Play on Android, earn virtual coins, and see how you
          rank across India.
        </p>

        <div className="public-actions">
          <Link href="/delete-account" className="public-btn public-btn-primary">
            Delete your account
          </Link>
          <Link href="/privacy" className="public-btn public-btn-ghost">
            Privacy policy
          </Link>
          <Link href="/terms" className="public-btn public-btn-ghost">
            Terms of use
          </Link>
        </div>
      </section>

      <section className="public-grid" aria-label="About the game">
        <article className="public-card">
          <h2>Six quick games</h2>
          <p>
            Speed, memory, words and India trivia. Each round is short enough to
            play on a chai break, and the daily set is the same for everyone.
          </p>
        </article>
        <article className="public-card">
          <h2>Daily run</h2>
          <p>
            Three games, one score, one leaderboard. Come back tomorrow for a
            new run and keep your streak alive.
          </p>
        </article>
        <article className="public-card">
          <h2>Skill, not gambling</h2>
          <p>
            Coins are virtual progress. They have no cash value, cannot be
            withdrawn or transferred, and are never wagered against another
            player.
          </p>
        </article>
      </section>

      <p className="public-note">
        Need help with your account, a score or a privacy request? Email{" "}
        <a href="mailto:support@minutewar.in">support@minutewar.in</a>. To close an
        account without the app, use the{" "}
        <Link href="/delete-account">account deletion page</Link>.
      </p>
    </>
  );
}

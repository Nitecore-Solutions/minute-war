import Link from "next/link";

/**
 * Public website shell.
 *
 * The route group does not appear in URLs, so these pages live at /privacy,
 * /terms and /delete-account. The admin dashboard is intentionally outside
 * this group and keeps its own light operations theme.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-root">
      <header className="public-header">
        <Link href="/" className="public-brand" aria-label="MINUTE WAR home">
          <span className="public-logo" aria-hidden="true">
            60
          </span>
          MINUTE WAR
        </Link>

        <nav className="public-nav" aria-label="Public site">
          <Link href="/">Home</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/delete-account">Delete account</Link>
          <Link href="/admin">Operator sign-in</Link>
        </nav>
      </header>

      <main className="public-main">{children}</main>

      <footer className="public-footer">
        <span>© {new Date().getFullYear()} MINUTE WAR. Made in India.</span>
        <nav aria-label="Legal">
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/terms">Terms of use</Link>
          <Link href="/delete-account">Delete account</Link>
        </nav>
      </footer>
    </div>
  );
}

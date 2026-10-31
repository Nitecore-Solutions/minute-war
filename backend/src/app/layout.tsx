import type { Metadata } from "next";
import "./globals.css";

/**
 * The backend serves three surfaces from one Render service:
 *
 *   /api/*      mobile REST API
 *   /admin/*    operator dashboard (httpOnly cookie)
 *   /privacy, /terms, /delete-account, /   public website
 *
 * Keeping them in one Next app means the public deletion form can call the
 * same account table and stored procedure as the app, with no second deploy.
 */
const siteUrl = process.env.APP_ORIGIN ?? "https://minutewar.in";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "RushArena",
    template: "%s · RushArena",
  },
  description: "India's 60-second challenge game. Six mini games, one daily run.",
  applicationName: "RushArena",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

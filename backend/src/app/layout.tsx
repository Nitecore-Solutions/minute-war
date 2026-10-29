import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MINUTE WAR Admin",
  description: "Operations dashboard for MINUTE WAR",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
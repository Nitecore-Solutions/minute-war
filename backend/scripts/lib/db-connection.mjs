/**
 * Shared mysql2 connection options for CLI scripts.
 *
 * Aiven (and most managed MySQL providers) put `ssl-mode=REQUIRED` in the
 * connection URI. mysql2 does not understand that parameter, so passing the URI
 * through unchanged silently opens a non-TLS connection. This helper converts
 * it to the explicit `ssl` option and optionally attaches a CA.
 *
 * Usage:
 *   import { connectionOptions } from "./lib/db-connection.mjs";
 *   const conn = await mysql.createConnection(connectionOptions(process.env.DATABASE_URL));
 */
export function connectionOptions(url, extra = {}) {
  if (!url) throw new Error("DATABASE_URL is not set");

  const parsed = new URL(url);
  let required = process.env.DB_SSL === "true";

  for (const key of [...parsed.searchParams.keys()]) {
    if (key.toLowerCase() !== "ssl-mode") continue;
    const mode = parsed.searchParams.get(key)?.toUpperCase();
    if (mode === "REQUIRED" || mode === "VERIFY_CA" || mode === "VERIFY_IDENTITY") {
      required = true;
    }
    parsed.searchParams.delete(key);
  }

  const options = { uri: parsed.toString(), ...extra };
  if (!required) return options;

  const base64 = process.env.DB_SSL_CA_BASE64?.trim();
  const ca =
    process.env.DB_SSL_CA?.replace(/\\n/g, "\n") ??
    (base64 ? Buffer.from(base64, "base64").toString("utf8") : undefined);

  options.ssl = {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
    ...(ca ? { ca } : {}),
  };

  return options;
}

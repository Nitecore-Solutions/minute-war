import "server-only";
import mysql, {
  type Pool,
  type PoolConnection,
  type RowDataPacket,
  type ResultSetHeader,
} from "mysql2/promise";

/**
 * Values mysql2 will bind. Deliberately narrower than `unknown`: `unknown[]`
 * forces every caller to cast, and the only things we ever bind are these.
 */
export type SqlValue = string | number | boolean | Date | Buffer | null;
/** Mutable, because mysql2's binding types are. */
export type SqlParams = SqlValue[];

/**
 * Single shared connection pool for the whole process.
 *
 * Next.js dev mode re-imports modules on every hot reload, so the pool is
 * cached on globalThis. Without this you leak connections until MySQL hits
 * max_connections and starts refusing new ones.
 */

const globalForDb = globalThis as unknown as { __minuteWarPool?: Pool };

/**
 * Managed MySQL providers (Aiven included) put `ssl-mode=REQUIRED` in the
 * service URI. mysql2 does not understand that query parameter, so it must be
 * turned into an explicit `ssl` option or the connection is sent in clear text
 * and rejected. The CA is optional: set DB_SSL_CA or DB_SSL_CA_BASE64 when the
 * provider uses a private CA that Node does not already trust.
 */
function sslOptions(url: string) {
  let required = process.env.DB_SSL === "true";

  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.toLowerCase() !== "ssl-mode") continue;
      const mode = parsed.searchParams.get(key)?.toUpperCase();
      if (mode === "REQUIRED" || mode === "VERIFY_CA" || mode === "VERIFY_IDENTITY") {
        required = true;
      }
    }
  } catch {
    // Let mysql2 produce its normal error for a malformed URL.
  }

  if (!required) return undefined;

  const base64 = process.env.DB_SSL_CA_BASE64?.trim();
  const ca =
    process.env.DB_SSL_CA?.replace(/\\n/g, "\n") ??
    (base64 ? Buffer.from(base64, "base64").toString("utf8") : undefined);

  return {
    // Encryption without verification is still vulnerable to a MITM. Keep
    // verification on unless an operator explicitly opts out for a test box.
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
    ...(ca ? { ca } : {}),
  };
}

/** Removes mysql2-unknown URI parameters before passing the URI through. */
function cleanDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.toLowerCase() === "ssl-mode") parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function createPool(): Pool {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy backend/.env.example to backend/.env."
    );
  }

  const ssl = sslOptions(url);

  return mysql.createPool({
    uri: cleanDatabaseUrl(url),
    ...(ssl ? { ssl } : {}),
    waitForConnections: true,
    // Short queue rather than a long backlog: when the DB is slow we would
    // rather return an error than pile up requests that will time out anyway.
    connectionLimit: Number(process.env.DB_POOL_SIZE ?? 10),
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    // Numbers come back as strings by default, which silently turns every
    // score into "8230" comparisons. Everything here is numeric.
    decimalNumbers: true,
    timezone: "Z",
    dateStrings: false,
  });
}

export const pool: Pool = globalForDb.__minuteWarPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__minuteWarPool = pool;
}

/** Runs a query and returns typed rows. */
export async function query<T extends RowDataPacket = RowDataPacket>(
  sql: string,
  params: SqlParams = []
): Promise<T[]> {
  const [rows] = await pool.execute<T[]>(sql, params);
  return rows;
}

/** Runs a query and returns the first row, or null. */
export async function queryOne<T extends RowDataPacket = RowDataPacket>(
  sql: string,
  params: SqlParams = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * Runs an INSERT/UPDATE/DELETE and returns the header.
 * Use `query` for reads: this throws if the statement returns rows.
 */
export async function execute(
  sql: string,
  params: SqlParams = []
): Promise<ResultSetHeader> {
  const [result] = await pool.execute<ResultSetHeader>(sql, params);
  return result;
}

/**
 * Runs `fn` inside a transaction, committing on success and rolling back on
 * any throw. The connection is always released.
 *
 * Use this whenever two writes must both happen or neither does — for example
 * writing a score and updating the wallet.
 */
export async function transaction<T>(
  fn: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* the connection is already broken; the pool will discard it */
    }
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Calls a stored procedure that has OUT parameters.
 *
 * Accepts either the pool or an open connection, so callers can run a
 * procedure standalone or inside an existing transaction without branching.
 *
 * The OUT values come back as an extra result set whose populated column is
 * the named output variable, so they are picked out by column name.
 */
export async function callProcedure<T = Record<string, unknown>>(
  executor: Pool | PoolConnection,
  procedure: string,
  args: SqlParams,
  outVars: string[] = []
): Promise<T> {
  // query(), not execute(): CALL is a compound statement and mysql2's
  // prepared-statement path rejects it.
  //
  // OUT parameters are passed as user-variable NAMES (@p_balance), not as
  // bound placeholders. They must still be listed or the server rejects the
  // call with "expected 9, got 8"; the names are interpolated as identifiers,
  // never as values, so this is not an injection point.
  const placeholders = [...args.map(() => "?"), ...outVars.map((name) => `@${name}`)];
  const [result] = await executor.query(
    `CALL ${procedure}(${placeholders.join(", ")})`,
    args as unknown[]
  );

  if (outVars.length === 0) return {} as T;

  // A procedure whose body contains no SELECT makes mysql2 return a flat
  // OkPacket and the OUT values are silently lost. Selecting the user
  // variables straight after the CALL is the reliable way to read them back,
  // and it works whether or not the body happens to end in a SELECT.
  const names = outVars.map((n) => `@${n}`).join(", ");
  const [rows] = await executor.query(`SELECT ${names}`, []);

  const row = (rows as RowDataPacket[])[0] ?? {};
  const out: Record<string, unknown> = {};

  for (const name of outVars) {
    // MySQL labels these columns with the leading `@` included.
    if (name in row) out[name] = row[name];
    else if (`@${name}` in row) out[name] = (row as Record<string, unknown>)[`@${name}`];
  }

  void result;
  return out as T;
}

/** Health probe used by /api/health and the start scripts. */
export async function ping(): Promise<boolean> {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
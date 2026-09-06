import "dotenv/config";
import { Pool, types } from "pg";

// This runs at import time, before the HTTP server binds. A bare throw here kills the
// process during startup, which a hosting platform can only surface as a 502 on every
// request while the real cause sits in a stack trace in the deploy log. State the cause
// and the fix for both environments, then exit non-zero.
if (!process.env.DATABASE_URL) {
  console.error("[DigiBok Startup] DATABASE_URL is not set - the server cannot start.");
  console.error("  Local:  copy .env.example to .env and set DATABASE_URL.");
  console.error("  Hosted: add DATABASE_URL to the service variables. On Railway, reference the");
  console.error("          Postgres service so the internal host is used.");
  process.exit(1);
}

// DATE columns (OID 1082) come back from pg as JS Date objects by default, which would
// shift/reformat the plain "YYYY-MM-DD" strings this app has always stored and expected
// (entry_date, due_date, expiry_date, payment_date, filed_date). Postgres already sends
// DATE in exactly that text format over the wire — pass it through unchanged instead.
types.setTypeParser(1082, (val) => val);

// A local server and Railway's internal network speak plain TCP; managed Postgres reached
// over the public internet (Railway's proxy host, Neon, Supabase) requires TLS and
// presents a certificate chain Node will not validate on its own.
//
// This used to be an opt-in DATABASE_SSL flag, which made pointing DATABASE_URL at a
// proxy host a silent deploy footgun: the connection is refused at boot with an error
// that names TLS nowhere, so the fix is invisible from the log. The host already tells us
// which case we are in, so derive it and keep DATABASE_SSL as an explicit override for
// the hosts this gets wrong.
function shouldUseSsl(connectionString: string): boolean {
  if (process.env.DATABASE_SSL === "true") return true;
  if (process.env.DATABASE_SSL === "false") return false;

  let host: string;
  try {
    host = new URL(connectionString).hostname;
  } catch {
    // A connection string pg can still parse (key=value form) but URL cannot. Assume the
    // no-TLS default rather than forcing TLS on what is most likely a local socket.
    return false;
  }

  const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
  // *.railway.internal is Railway's private network; *.internal covers the same shape on
  // Render and Fly, which are the other platforms this app is documented to run on.
  const isPrivateNetwork = host.endsWith(".railway.internal") || host.endsWith(".internal");
  return !isLoopback && !isPrivateNetwork;
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: shouldUseSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
});

// An idle pooled client dropped by Postgres (restart, timeout, network blip) emits an
// error on the pool itself. Without a listener Node treats that as an unhandled
// 'error' event and exits the process, so the server would die while sitting idle.
// pg discards the broken client and opens a fresh one on the next query.
pool.on("error", (err) => {
  console.error("[DigiBok Error] Idle Postgres client error —", err);
});

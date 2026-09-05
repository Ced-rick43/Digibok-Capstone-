import "dotenv/config";
import { Pool, types } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and configure it.");
}

// DATE columns (OID 1082) come back from pg as JS Date objects by default, which would
// shift/reformat the plain "YYYY-MM-DD" strings this app has always stored and expected
// (entry_date, due_date, expiry_date, payment_date, filed_date). Postgres already sends
// DATE in exactly that text format over the wire — pass it through unchanged instead.
types.setTypeParser(1082, (val) => val);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Managed Postgres reached over the public internet (Railway's proxy host, Neon,
  // Supabase) requires TLS and presents a certificate chain Node will not validate on its
  // own. A local server and Railway's internal network need no TLS at all, which is the
  // default here; set DATABASE_SSL=true on hosts that require it.
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

// An idle pooled client dropped by Postgres (restart, timeout, network blip) emits an
// error on the pool itself. Without a listener Node treats that as an unhandled
// 'error' event and exits the process, so the server would die while sitting idle.
// pg discards the broken client and opens a fresh one on the next query.
pool.on("error", (err) => {
  console.error("[DigiBok Error] Idle Postgres client error —", err);
});

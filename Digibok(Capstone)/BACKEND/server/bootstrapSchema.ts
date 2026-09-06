import fs from "fs";
import path from "path";
import { pool } from "./pgPool";

// schema.sql is plain DDL — 16 bare CREATE TABLE statements with no IF NOT EXISTS — so it
// can only ever be applied to an empty database; a second run fails on "relation already
// exists". Rather than make the file idempotent statement by statement, decide once
// whether the database has been provisioned at all and skip the whole thing if it has.
//
// Resolved against cwd, which is this package's directory in both modes: `tsx
// BACKEND/server.ts` in dev, and `node dist/server.cjs` in production (npm sets cwd to the
// package root even when the script is invoked from the repo root via --prefix). esbuild
// bundles JS/TS only, so the .sql file is read from disk at runtime rather than inlined.
const SCHEMA_PATH = path.join(process.cwd(), "BACKEND", "db", "schema.sql");

// to_regclass returns NULL for a missing relation instead of raising, which makes it the
// cheapest possible "is this database provisioned?" probe. users is the first table the
// schema creates and every other table refers back to it.
const SENTINEL_RELATION = "public.users";

// Two instances booting against a fresh database would otherwise race to run the same DDL
// and the loser would crash on a duplicate relation. The key is arbitrary; it only has to
// be the same constant in every instance.
const BOOTSTRAP_LOCK_KEY = 481516;

// Railway starts this service and its Postgres service concurrently, and a database that
// is still booting refuses connections instantly. Exiting on the first refusal burns
// through the platform's restart budget (restartPolicyMaxRetries: 10) in a couple of
// seconds and the service is marked crashed for good — while Postgres becomes ready half
// a minute later. Wait the database out instead of racing it.
const CONNECT_MAX_ATTEMPTS = 10;
const CONNECT_RETRY_MS = 3000;

async function connectWithRetry() {
  for (let attempt = 1; ; attempt++) {
    try {
      return await pool.connect();
    } catch (err) {
      if (attempt >= CONNECT_MAX_ATTEMPTS) throw err;
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(
        `[DigiBok Startup] Database unreachable (attempt ${attempt}/${CONNECT_MAX_ATTEMPTS}: ${reason}) — ` +
        `retrying in ${CONNECT_RETRY_MS}ms.`
      );
      await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_MS));
    }
  }
}

export async function ensureSchema(): Promise<void> {
  const client = await connectWithRetry();
  // Tracked so the cleanup below only tries to unlock a lock that was actually taken. If
  // the lock query itself failed there is nothing to release, and asking anyway would
  // just produce a second, more confusing error.
  let locked = false;
  try {
    await client.query("SELECT pg_advisory_lock($1)", [BOOTSTRAP_LOCK_KEY]);
    locked = true;

    const { rows } = await client.query("SELECT to_regclass($1) AS relation", [SENTINEL_RELATION]);
    if (rows[0].relation !== null) return;

    if (!fs.existsSync(SCHEMA_PATH)) {
      console.error("[DigiBok Startup] The database is empty and the schema file is missing.");
      console.error("  Looked for: " + SCHEMA_PATH);
      console.error("  Restore BACKEND/db/schema.sql, or apply it to the database by hand.");
      process.exit(1);
    }

    // Postgres applies DDL transactionally, so a statement failing partway leaves the
    // database untouched rather than half-provisioned — the next boot retries cleanly.
    console.log("[DigiBok Startup] Empty database detected — applying schema.sql.");
    const ddl = fs.readFileSync(SCHEMA_PATH, "utf8");
    try {
      await client.query("BEGIN");
      await client.query(ddl);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    console.log("[DigiBok Startup] Schema applied — 16 tables created.");
  } finally {
    // This cleanup also runs on the failure path, where the connection is frequently the
    // thing that broke. An unlock that throws here would replace the real startup error
    // with a misleading one from the cleanup itself and skip the release below, leaking
    // the client — so log it and carry on. A lock held by a dead session is released by
    // Postgres when that session ends, and the pool hands back a fresh connection next.
    if (locked) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [BOOTSTRAP_LOCK_KEY]);
      } catch (err) {
        console.error("[DigiBok Startup] Could not release the bootstrap advisory lock —", err);
      }
    }
    client.release();
  }
}

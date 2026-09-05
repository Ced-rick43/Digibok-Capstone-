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

export async function ensureSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [BOOTSTRAP_LOCK_KEY]);

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
    await client.query("SELECT pg_advisory_unlock($1)", [BOOTSTRAP_LOCK_KEY]);
    client.release();
  }
}

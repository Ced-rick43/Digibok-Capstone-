// Dumps the Postgres database to backups/, using pg_dump's custom format (-Fc) so
// individual tables/objects can be selectively restored later via pg_restore. Keeps
// only the most recent BACKUP_RETENTION_COUNT dumps so this directory doesn't grow
// unbounded if run on a schedule.
//
// Usage: npx tsx scripts/backup-db.ts
// pg_dump isn't on PATH on a stock Windows Postgres install — set PG_BIN_DIR to the
// install's bin/ folder (e.g. "C:\Program Files\PostgreSQL\17\bin") if auto-detection
// below doesn't find it.

import "dotenv/config";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const RETENTION_COUNT = Number(process.env.BACKUP_RETENTION_COUNT) || 14;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env and configure it.");
  process.exit(1);
}

function resolvePgBinary(name: string): string {
  const exeName = process.platform === "win32" ? `${name}.exe` : name;
  if (process.env.PG_BIN_DIR) {
    return path.join(process.env.PG_BIN_DIR, exeName);
  }
  if (process.platform === "win32") {
    for (const version of [17, 18, 16, 15]) {
      const candidate = `C:\\Program Files\\PostgreSQL\\${version}\\bin\\${exeName}`;
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return name; // assume it's on PATH (true on most Linux/CI hosts)
}

const backupsDir = path.join(process.cwd(), "backups");
fs.mkdirSync(backupsDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = path.join(backupsDir, `digibok-${timestamp}.dump`);
const pgDump = resolvePgBinary("pg_dump");
const redactedUrl = process.env.DATABASE_URL.replace(/:[^:@/]+@/, ":***@");

console.log(`Backing up ${redactedUrl} -> ${path.relative(process.cwd(), outFile)}`);

const result = spawnSync(pgDump, ["-d", process.env.DATABASE_URL, "-Fc", "-f", outFile], {
  stdio: "inherit",
});

if (result.error || result.status !== 0) {
  console.error(
    `pg_dump failed (looked for it at "${pgDump}"). If that path is wrong, set PG_BIN_DIR to your Postgres install's bin/ folder.`
  );
  process.exit(result.status ?? 1);
}

const sizeKb = (fs.statSync(outFile).size / 1024).toFixed(1);
console.log(`Backup complete (${sizeKb} KB).`);

const backups = fs
  .readdirSync(backupsDir)
  .filter((f) => f.startsWith("digibok-") && f.endsWith(".dump"))
  .map((f) => ({ name: f, mtime: fs.statSync(path.join(backupsDir, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);

for (const stale of backups.slice(RETENTION_COUNT)) {
  fs.unlinkSync(path.join(backupsDir, stale.name));
  console.log(`Removed old backup (retention ${RETENTION_COUNT}): ${stale.name}`);
}

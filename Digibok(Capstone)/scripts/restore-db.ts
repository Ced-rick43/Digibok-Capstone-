// Restores a pg_dump custom-format backup (see scripts/backup-db.ts) into the database
// pointed at by DATABASE_URL. --clean --if-exists drops existing objects first, so this
// OVERWRITES whatever is currently in that database — it requires --yes to actually run;
// without it, this only prints what it would do.
//
// Usage:
//   npx tsx scripts/restore-db.ts                       # picks the newest file in backups/, dry-run
//   npx tsx scripts/restore-db.ts --yes                  # picks the newest file, actually restores
//   npx tsx scripts/restore-db.ts backups/digibok-....dump --yes   # restores a specific file

import "dotenv/config";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env and configure it.");
  process.exit(1);
}

const args = process.argv.slice(2);
const CONFIRMED = args.includes("--yes");
const fileArg = args.find((a) => !a.startsWith("--"));

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
  return name;
}

function pickLatestBackup(): string {
  const backupsDir = path.join(process.cwd(), "backups");
  const files = fs.existsSync(backupsDir)
    ? fs
        .readdirSync(backupsDir)
        .filter((f) => f.startsWith("digibok-") && f.endsWith(".dump"))
        .map((f) => ({ file: path.join(backupsDir, f), mtime: fs.statSync(path.join(backupsDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)
    : [];
  if (files.length === 0) {
    console.error(`No backups found in ${backupsDir}. Run "npm run db:backup" first, or pass a file path explicitly.`);
    process.exit(1);
  }
  return files[0].file;
}

const targetFile = fileArg ? path.resolve(fileArg) : pickLatestBackup();

if (!fs.existsSync(targetFile)) {
  console.error(`Backup file not found: ${targetFile}`);
  process.exit(1);
}

const redactedUrl = process.env.DATABASE_URL.replace(/:[^:@/]+@/, ":***@");
console.log(`Restore target : ${redactedUrl}`);
console.log(`Backup file    : ${path.relative(process.cwd(), targetFile)}`);

if (!CONFIRMED) {
  console.log(
    "\nDry run — nothing changed. This would DROP and recreate every table in the target database, replacing its data with the backup's. Re-run with --yes to actually restore."
  );
  process.exit(0);
}

const pgRestore = resolvePgBinary("pg_restore");
const result = spawnSync(
  pgRestore,
  ["-d", process.env.DATABASE_URL, "--clean", "--if-exists", "--no-owner", targetFile],
  { stdio: "inherit" }
);

if (result.error || result.status !== 0) {
  console.error(
    `pg_restore failed (looked for it at "${pgRestore}"). If that path is wrong, set PG_BIN_DIR to your Postgres install's bin/ folder.`
  );
  process.exit(result.status ?? 1);
}

console.log("Restore complete.");

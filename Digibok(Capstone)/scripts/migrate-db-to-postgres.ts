// One-time migration: reads the old flat-file db.json (bypassing LibraryDB entirely,
// so this doesn't depend on — or drift with — the in-progress Postgres rewrite of
// db.ts) and inserts every record into the matching Postgres tables, preserving the
// exact existing numeric IDs, then advances each table's identity sequence past the
// imported max ID so new inserts continue seamlessly afterward.
//
// Usage: npx tsx scripts/migrate-db-to-postgres.ts [--dry-run]

import "dotenv/config";
import fs from "fs";
import path from "path";
import { Pool } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env and configure it.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DB_FILE = path.join(process.cwd(), "db.json");

interface TableSpec {
  table: string;
  idColumn: string;
  collection: string;
  columns: string[];
  // Maps a raw db.json record to the exact parameter array for the INSERT, in `columns` order.
  toRow: (r: any) => any[];
}

const TABLES: TableSpec[] = [
  {
    table: "users",
    idColumn: "user_id",
    collection: "users",
    columns: ["user_id", "name", "email", "password_hash", "role", "status", "pending_activation", "reset_token", "reset_token_expires", "created_at", "totp_enabled", "totp_secret", "totp_pending_secret", "totp_backup_codes", "totp_last_time_step"],
    toRow: (u) => [u.user_id, u.name, u.email, u.password_hash, u.role, u.status, u.pending_activation ?? false, u.reset_token ?? null, u.reset_token_expires ?? null, u.created_at, u.totp_enabled ?? false, u.totp_secret ?? null, u.totp_pending_secret ?? null, u.totp_backup_codes ?? null, u.totp_last_time_step ?? null],
  },
  {
    table: "bookkeeper_profiles",
    idColumn: "bookkeeper_id",
    collection: "bookkeeper_profiles",
    columns: ["bookkeeper_id", "user_id", "license_no", "status"],
    toRow: (p) => [p.bookkeeper_id, p.user_id, p.license_no, p.status],
  },
  {
    table: "client_profiles",
    idColumn: "client_id",
    collection: "client_profiles",
    columns: ["client_id", "user_id", "business_name", "business_type", "tin", "address", "contact_number", "type", "status", "bookkeeper_fee_type", "bookkeeper_fee_amount", "industry", "rdo_code", "email_reminders_enabled"],
    toRow: (c) => [c.client_id, c.user_id, c.business_name, c.business_type, c.tin, c.address, c.contact_number, "Non-VAT", c.status, c.bookkeeper_fee_type ?? "flat", c.bookkeeper_fee_amount ?? 0, c.industry ?? null, c.rdo_code ?? null, c.email_reminders_enabled ?? true],
  },
  {
    table: "accounts",
    idColumn: "account_id",
    collection: "accounts",
    columns: ["account_id", "client_id", "account_code", "account_name", "account_type", "balance"],
    toRow: (a) => [a.account_id, a.client_id, a.account_code ?? null, a.account_name, a.account_type, a.balance],
  },
  {
    table: "journal_entries",
    idColumn: "journal_id",
    collection: "journal_entries",
    columns: ["journal_id", "client_id", "entry_date", "reference", "description", "created_at"],
    toRow: (e) => [e.journal_id, e.client_id, e.entry_date, e.reference, e.description, e.created_at],
  },
  {
    table: "journal_lines",
    idColumn: "line_id",
    collection: "journal_lines",
    columns: ["line_id", "journal_id", "account_id", "debit", "credit"],
    toRow: (l) => [l.line_id, l.journal_id, l.account_id, l.debit, l.credit],
  },
  {
    table: "general_ledger",
    idColumn: "ledger_id",
    collection: "general_ledger",
    columns: ["ledger_id", "account_id", "journal_id", "client_id", "entry_date", "description", "debit", "credit", "balance"],
    toRow: (g) => [g.ledger_id, g.account_id, g.journal_id, g.client_id, g.entry_date, g.description, g.debit, g.credit, g.balance],
  },
  {
    table: "tax_records",
    idColumn: "tax_id",
    collection: "tax_records",
    columns: ["tax_id", "client_id", "tax_type", "due_date", "amount", "status", "filed_date"],
    toRow: (t) => [t.tax_id, t.client_id, t.tax_type, t.due_date, t.amount, t.status, t.filed_date ?? null],
  },
  {
    table: "permit_records",
    idColumn: "permit_id",
    collection: "permit_records",
    columns: ["permit_id", "client_id", "permit_type", "fee", "expiry_date", "status"],
    toRow: (p) => [p.permit_id, p.client_id, p.permit_type, p.fee, p.expiry_date, p.status],
  },
  {
    table: "reports",
    idColumn: "report_id",
    collection: "reports",
    columns: ["report_id", "client_id", "report_type", "period", "file_path", "file_size", "generated_at"],
    toRow: (r) => [r.report_id, r.client_id, r.report_type, r.period, r.file_path, r.file_size, r.generated_at],
  },
  {
    table: "notifications",
    idColumn: "notification_id",
    collection: "notifications",
    columns: ["notification_id", "user_id", "message", "type", "is_read", "sent_at", "link"],
    toRow: (n) => [n.notification_id, n.user_id, n.message, n.type, n.is_read, n.sent_at, n.link ?? null],
  },
  {
    table: "audit_logs",
    idColumn: "log_id",
    collection: "audit_logs",
    columns: ["log_id", "user_id", "action", "table_name", "record_id", "timestamp"],
    toRow: (l) => [l.log_id, l.user_id, l.action, l.table_name, l.record_id, l.timestamp],
  },
  {
    table: "payments",
    idColumn: "payment_id",
    collection: "payments",
    columns: ["payment_id", "client_id", "obligation_type", "obligation_id", "obligation_label", "amount", "payment_date", "payment_method", "reference_number", "status", "notes", "submitted_at", "reviewed_at", "journal_id", "receipt_file_name", "receipt_original_name", "receipt_mime_type"],
    toRow: (p) => [p.payment_id, p.client_id, p.obligation_type, p.obligation_id, p.obligation_label, p.amount, p.payment_date, p.payment_method ?? "other", p.reference_number, p.status, p.notes ?? null, p.submitted_at, p.reviewed_at ?? null, p.journal_id ?? null, p.receipt_file_name ?? null, p.receipt_original_name ?? null, p.receipt_mime_type ?? null],
  },
  {
    table: "documents",
    idColumn: "document_id",
    collection: "documents",
    columns: ["document_id", "client_id", "document_type", "label", "file_name", "original_name", "file_size", "mime_type", "uploaded_by", "uploaded_by_role", "uploaded_at", "notes"],
    toRow: (d) => [d.document_id, d.client_id, d.document_type, d.label, d.file_name, d.original_name, d.file_size, d.mime_type, d.uploaded_by, d.uploaded_by_role, d.uploaded_at, d.notes ?? null],
  },
  {
    table: "client_invites",
    idColumn: "invite_id",
    collection: "client_invites",
    columns: ["invite_id", "code", "created_by", "status", "label", "used_by_client_id", "created_at", "used_at", "expires_at"],
    toRow: (i) => [i.invite_id, i.code, i.created_by, i.status, i.label ?? null, i.used_by_client_id ?? null, i.created_at, i.used_at ?? null, i.expires_at],
  },
  {
    table: "messages",
    idColumn: "message_id",
    collection: "messages",
    columns: ["message_id", "client_id", "sender_id", "sender_role", "subject", "body", "is_read", "sent_at"],
    toRow: (m) => [m.message_id, m.client_id, m.sender_id, m.sender_role, m.subject ?? null, m.body, m.is_read, m.sent_at],
  },
];

async function main() {
  if (!fs.existsSync(DB_FILE)) {
    console.error(`db.json not found at ${DB_FILE}`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));

  console.log(DRY_RUN ? "=== DRY RUN — no writes will be made ===" : "=== Migrating db.json -> PostgreSQL ===");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const summary: { table: string; count: number }[] = [];

    for (const spec of TABLES) {
      const records: any[] = data[spec.collection] || [];
      if (DRY_RUN) {
        summary.push({ table: spec.table, count: records.length });
        continue;
      }

      const placeholders = spec.columns.map((_, i) => `$${i + 1}`).join(",");
      const insertSql = `INSERT INTO ${spec.table} (${spec.columns.join(",")}) OVERRIDING SYSTEM VALUE VALUES (${placeholders})`;

      for (const record of records) {
        await client.query(insertSql, spec.toRow(record));
      }
      summary.push({ table: spec.table, count: records.length });
      console.log(`  ${spec.table}: inserted ${records.length} row(s)`);
    }

    if (!DRY_RUN) {
      // Advance each table's identity sequence past the imported max ID so future
      // inserts (via GENERATED ALWAYS AS IDENTITY) don't collide with what we just loaded.
      for (const spec of TABLES) {
        await client.query(
          `SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT MAX(${spec.idColumn}) FROM ${spec.table}), 0) + 1, false)`,
          [spec.table, spec.idColumn]
        );
      }
      await client.query("COMMIT");
      console.log("=== Migration committed ===");
    } else {
      await client.query("ROLLBACK");
    }

    console.log("\nSummary:");
    for (const row of summary) {
      console.log(`  ${row.table.padEnd(22)} ${row.count}`);
    }
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Migration failed, rolled back:", e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();

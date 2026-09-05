import { PoolClient } from "pg";
import { pool } from "./pgPool";

// Define TypeScript interfaces for our Database schema — unchanged from the flat-file
// version; only the storage backend (BACKEND/db/schema.sql, PostgreSQL) changed.
export interface User {
  user_id: number;
  name: string;
  email: string;
  password_hash: string;
  role: "bookkeeper" | "client";
  status: "active" | "inactive";
  pending_activation?: boolean;
  reset_token?: string;
  reset_token_expires?: string;
  email_verified?: boolean; // undefined treated as true — only self-registered clients start false
  verification_token?: string;
  verification_expires?: string;
  created_at: string;
  // Two-factor auth (TOTP) — bookkeeper-only feature, self-service per account.
  totp_enabled?: boolean;
  totp_secret?: string; // base32, only set once totp_enabled is true
  totp_pending_secret?: string; // set during setup, before the first code is confirmed
  totp_backup_codes?: string[]; // bcrypt-hashed, single-use
  totp_last_time_step?: number; // replay protection: rejects reuse of an already-consumed code
}

export interface BookkeeperProfile {
  bookkeeper_id: number;
  user_id: number;
  license_no: string | null;
  status: string;
  phone_number: string | null;
  business_address: string | null;
  tin: string | null;
  rdo_code: string | null;
  email_reminders_enabled: boolean;
}

export interface ClientProfile {
  client_id: number;
  user_id: number;
  business_name: string;
  business_type: string;
  tin: string;
  address: string;
  contact_number: string;
  type: "Non-VAT";
  status: "active" | "inactive";
  approval_status: "pending" | "approved";
  bookkeeper_fee_type: "flat" | "percentage";
  bookkeeper_fee_amount: number;
  industry?: string;
  rdo_code?: string;
  email_reminders_enabled?: boolean; // undefined treated as true (opted in by default)
}

export interface Account {
  account_id: number;
  client_id: number;
  account_code?: string;
  account_name: string;
  account_type: "asset" | "liability" | "equity" | "revenue" | "expense";
  balance: number;
}

export interface JournalEntry {
  journal_id: number;
  client_id: number;
  entry_date: string;
  reference: string;
  description: string;
  created_at: string;
}

export interface JournalLine {
  line_id: number;
  journal_id: number;
  account_id: number;
  debit: number;
  credit: number;
  narration: string | null;
}

export interface GeneralLedgerEntry {
  ledger_id: number;
  account_id: number;
  journal_id: number;
  client_id: number;
  entry_date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface TaxRecord {
  tax_id: number;
  client_id: number;
  tax_type: string;
  due_date: string;
  amount: number;
  status: "upcoming" | "urgent" | "overdue" | "filed";
  filed_date?: string;
}

export interface PermitRecord {
  permit_id: number;
  client_id: number;
  permit_type: string;
  fee: number;
  expiry_date: string;
  status: "upcoming" | "urgent" | "overdue" | "renewed";
}

export interface Report {
  report_id: number;
  client_id: number;
  report_type: string;
  period: string;
  file_path: string;
  file_size: string;
  generated_at: string;
}

export interface Notification {
  notification_id: number;
  user_id: number;
  message: string;
  type: "reminder" | "alert" | "info";
  is_read: number; // 0 or 1
  sent_at: string;
  link?: string; // which frontend tab this notification is "about", e.g. "compliance" — clicking it navigates there
}

// A single bookkeeper-client conversation thread, keyed by client_id — single-bookkeeper
// install, so "who's the other party" is never ambiguous for a given client's thread.
export interface Message {
  message_id: number;
  client_id: number;
  sender_id: number;
  sender_role: "bookkeeper" | "client";
  subject?: string; // only ever set on the first message of a thread, as context
  body: string;
  is_read: number; // 0 or 1 — read by the recipient (the OTHER party in the thread)
  sent_at: string;
}

export interface AuditLog {
  log_id: number;
  user_id: number;
  action: string;
  table_name: string;
  record_id: number;
  timestamp: string;
}

export interface ClientDocument {
  document_id: number;
  client_id: number;
  document_type: string; // e.g. "1701Q", "2550M", "2551Q", "Certificate", "Other"
  label: string;
  file_name: string; // stored file name on disk
  original_name: string;
  file_size: string;
  mime_type: string;
  uploaded_by: number; // user_id
  uploaded_by_role: "bookkeeper" | "client";
  uploaded_at: string;
  notes?: string;
}

export interface ClientInvite {
  invite_id: number;
  code: string;
  created_by: number; // bookkeeper user_id
  status: "pending" | "used" | "revoked";
  label?: string; // optional bookkeeper note, e.g. the expected client/business name
  used_by_client_id?: number;
  created_at: string;
  used_at?: string;
  expires_at: string;
}

export type PaymentMethod = "cash" | "gcash" | "bank_transfer" | "check" | "other";

export interface Payment {
  payment_id: number;
  client_id: number;
  obligation_type: "tax" | "permit" | "service_fee";
  obligation_id: number;
  obligation_label: string;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  reference_number: string;
  status: "pending" | "paid" | "rejected";
  notes?: string;
  submitted_at: string;
  reviewed_at?: string;
  journal_id?: number;
  receipt_file_name?: string;
  receipt_original_name?: string;
  receipt_mime_type?: string;
}

// --- Row-mapping helpers -----------------------------------------------------------
// pg returns NUMERIC/BIGINT columns as strings (avoids silent precision loss) and
// TIMESTAMPTZ columns as JS Date objects — both need converting back to the plain
// number/ISO-string shapes these interfaces (and the rest of the app) expect. DATE
// columns are exempted (see pgPool.ts's type-parser override) since they already come
// back as the same "YYYY-MM-DD" text this app has always stored.
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrUndef = (v: unknown): number | undefined => (v === null || v === undefined ? undefined : Number(v));
const strOrUndef = (v: unknown): string | undefined => (v === null || v === undefined ? undefined : String(v));
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const isoOrUndef = (v: unknown): string | undefined => (v === null || v === undefined ? undefined : v instanceof Date ? v.toISOString() : String(v));

function mapUser(row: any): User {
  return {
    user_id: row.user_id,
    name: row.name,
    email: row.email,
    password_hash: row.password_hash,
    role: row.role,
    status: row.status,
    pending_activation: row.pending_activation,
    reset_token: strOrUndef(row.reset_token),
    reset_token_expires: isoOrUndef(row.reset_token_expires),
    email_verified: row.email_verified,
    verification_token: strOrUndef(row.verification_token),
    verification_expires: isoOrUndef(row.verification_expires),
    created_at: iso(row.created_at),
    totp_enabled: row.totp_enabled,
    totp_secret: strOrUndef(row.totp_secret),
    totp_pending_secret: strOrUndef(row.totp_pending_secret),
    totp_backup_codes: row.totp_backup_codes ?? undefined,
    totp_last_time_step: numOrUndef(row.totp_last_time_step),
  };
}

function mapClientProfile(row: any): ClientProfile {
  return {
    client_id: row.client_id,
    user_id: row.user_id,
    business_name: row.business_name,
    business_type: row.business_type,
    tin: row.tin,
    address: row.address,
    contact_number: row.contact_number,
    type: "Non-VAT",
    status: row.status,
    approval_status: row.approval_status ?? "approved",
    bookkeeper_fee_type: row.bookkeeper_fee_type ?? "flat",
    bookkeeper_fee_amount: num(row.bookkeeper_fee_amount),
    industry: strOrUndef(row.industry),
    rdo_code: strOrUndef(row.rdo_code),
    email_reminders_enabled: row.email_reminders_enabled,
  };
}

function mapAccount(row: any): Account {
  return {
    account_id: row.account_id,
    client_id: row.client_id,
    account_code: strOrUndef(row.account_code),
    account_name: row.account_name,
    account_type: row.account_type,
    balance: num(row.balance),
  };
}

function mapJournalEntry(row: any): JournalEntry {
  return {
    journal_id: row.journal_id,
    client_id: row.client_id,
    entry_date: row.entry_date,
    reference: row.reference,
    description: row.description,
    created_at: iso(row.created_at),
  };
}

function mapJournalLine(row: any): JournalLine {
  return {
    line_id: row.line_id,
    journal_id: row.journal_id,
    account_id: row.account_id,
    debit: num(row.debit),
    credit: num(row.credit),
    narration: row.narration ?? null,
  };
}

function mapGeneralLedgerEntry(row: any): GeneralLedgerEntry {
  return {
    ledger_id: row.ledger_id,
    account_id: row.account_id,
    journal_id: row.journal_id,
    client_id: row.client_id,
    entry_date: row.entry_date,
    description: row.description,
    debit: num(row.debit),
    credit: num(row.credit),
    balance: num(row.balance),
  };
}

function mapTaxRecord(row: any): TaxRecord {
  return {
    tax_id: row.tax_id,
    client_id: row.client_id,
    tax_type: row.tax_type,
    due_date: row.due_date,
    amount: num(row.amount),
    status: row.status,
    filed_date: strOrUndef(row.filed_date),
  };
}

function mapPermitRecord(row: any): PermitRecord {
  return {
    permit_id: row.permit_id,
    client_id: row.client_id,
    permit_type: row.permit_type,
    fee: num(row.fee),
    expiry_date: row.expiry_date,
    status: row.status,
  };
}

function mapReport(row: any): Report {
  return {
    report_id: row.report_id,
    client_id: row.client_id,
    report_type: row.report_type,
    period: row.period,
    file_path: row.file_path,
    file_size: row.file_size,
    generated_at: iso(row.generated_at),
  };
}

function mapNotification(row: any): Notification {
  return {
    notification_id: row.notification_id,
    user_id: row.user_id,
    message: row.message,
    type: row.type,
    is_read: row.is_read,
    sent_at: iso(row.sent_at),
    link: strOrUndef(row.link),
  };
}

function mapAuditLog(row: any): AuditLog {
  return {
    log_id: row.log_id,
    user_id: row.user_id,
    action: row.action,
    table_name: row.table_name,
    record_id: row.record_id,
    timestamp: iso(row.timestamp),
  };
}

function mapPayment(row: any): Payment {
  return {
    payment_id: row.payment_id,
    client_id: row.client_id,
    obligation_type: row.obligation_type,
    obligation_id: row.obligation_id,
    obligation_label: row.obligation_label,
    amount: num(row.amount),
    payment_date: row.payment_date,
    payment_method: row.payment_method,
    reference_number: row.reference_number,
    status: row.status,
    notes: strOrUndef(row.notes),
    submitted_at: iso(row.submitted_at),
    reviewed_at: isoOrUndef(row.reviewed_at),
    journal_id: numOrUndef(row.journal_id),
    receipt_file_name: strOrUndef(row.receipt_file_name),
    receipt_original_name: strOrUndef(row.receipt_original_name),
    receipt_mime_type: strOrUndef(row.receipt_mime_type),
  };
}

function mapDocument(row: any): ClientDocument {
  return {
    document_id: row.document_id,
    client_id: row.client_id,
    document_type: row.document_type,
    label: row.label,
    file_name: row.file_name,
    original_name: row.original_name,
    file_size: row.file_size,
    mime_type: row.mime_type,
    uploaded_by: row.uploaded_by,
    uploaded_by_role: row.uploaded_by_role,
    uploaded_at: iso(row.uploaded_at),
    notes: strOrUndef(row.notes),
  };
}

function mapClientInvite(row: any): ClientInvite {
  return {
    invite_id: row.invite_id,
    code: row.code,
    created_by: row.created_by,
    status: row.status,
    label: strOrUndef(row.label),
    used_by_client_id: numOrUndef(row.used_by_client_id),
    created_at: iso(row.created_at),
    used_at: isoOrUndef(row.used_at),
    expires_at: iso(row.expires_at),
  };
}

function mapMessage(row: any): Message {
  return {
    message_id: row.message_id,
    client_id: row.client_id,
    sender_id: row.sender_id,
    sender_role: row.sender_role,
    subject: strOrUndef(row.subject),
    body: row.body,
    is_read: row.is_read,
    sent_at: iso(row.sent_at),
  };
}

// --- Transaction + dynamic-update helpers -------------------------------------------

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Builds a parameterized `UPDATE <table> SET ... WHERE <idColumn> = $n RETURNING *` from
// whichever fields of `updates` are actually present — table/column names here are always
// hardcoded per call site, never user input, so string-building them is safe.
// Object.keys only ever returns keys actually present on the object — a JSON request
// body can never contain a literal `undefined` (JSON.stringify drops those keys), so the
// only way a key here has value `undefined` is a caller explicitly setting it that way to
// clear a column to NULL (e.g. `{ reset_token: undefined }`). Filtering those out (as this
// used to do) silently turned every "clear this token" call into a no-op — reset/
// verification tokens never actually got invalidated after use, staying valid forever.
function buildUpdate(table: string, idColumn: string, id: number, updates: Record<string, any>): { text: string; values: any[] } | null {
  const keys = Object.keys(updates);
  if (keys.length === 0) return null;
  const setClauses = keys.map((k, i) => `${k} = $${i + 1}`);
  // pg needs an explicit SQL NULL, not a JS `undefined`, as a bound parameter.
  const values = keys.map((k) => (updates[k] === undefined ? null : updates[k]));
  values.push(id);
  return { text: `UPDATE ${table} SET ${setClauses.join(", ")} WHERE ${idColumn} = $${values.length} RETURNING *`, values };
}

const isDebitIncreaseType = (accountType: Account["account_type"]) => accountType === "asset" || accountType === "expense";

export class LibraryDB {
  // Audit event recorder helper
  public async logAudit(userId: number, action: string, tableName: string, recordId: number): Promise<void> {
    await pool.query(`INSERT INTO audit_logs (user_id, action, table_name, record_id) VALUES ($1,$2,$3,$4)`, [userId, action, tableName, recordId]);
  }

  public async getAuditLogs(): Promise<AuditLog[]> {
    const { rows } = await pool.query(`SELECT * FROM audit_logs ORDER BY log_id`);
    return rows.map(mapAuditLog);
  }

  // Users Auth
  public async getUsers(): Promise<User[]> {
    const { rows } = await pool.query(`SELECT * FROM users ORDER BY user_id`);
    return rows.map(mapUser);
  }

  public async addUser(user: Omit<User, "user_id" | "status" | "created_at">): Promise<User> {
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status, pending_activation, reset_token, reset_token_expires, totp_enabled, totp_secret, totp_pending_secret, totp_backup_codes, totp_last_time_step)
       VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        user.name, user.email, user.password_hash, user.role,
        user.pending_activation ?? false,
        user.reset_token ?? null, user.reset_token_expires ?? null,
        user.totp_enabled ?? false, user.totp_secret ?? null, user.totp_pending_secret ?? null,
        user.totp_backup_codes ?? null, user.totp_last_time_step ?? null,
      ]
    );
    return mapUser(rows[0]);
  }

  public async updateUser(userId: number, updates: Partial<User>): Promise<User | null> {
    const built = buildUpdate("users", "user_id", userId, updates);
    if (!built) {
      const { rows } = await pool.query(`SELECT * FROM users WHERE user_id=$1`, [userId]);
      return rows[0] ? mapUser(rows[0]) : null;
    }
    const { rows } = await pool.query(built.text, built.values);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  // Public bookkeeper self-registration is only ever open for the very first bookkeeper
  // account (bootstrap) — after that, additional bookkeeper accounts must be created by
  // an existing bookkeeper, not through the public form. This is the check that backs it.
  public async getBookkeeperCount(): Promise<number> {
    const { rows } = await pool.query(`SELECT COUNT(*) FROM bookkeeper_profiles`);
    return Number(rows[0].count);
  }

  public async addBookkeeperProfile(profile: Omit<BookkeeperProfile, "bookkeeper_id">): Promise<BookkeeperProfile> {
    const { rows } = await pool.query(
      `INSERT INTO bookkeeper_profiles (user_id, license_no, status, tin) VALUES ($1,$2,$3,$4) RETURNING *`,
      [profile.user_id, profile.license_no, profile.status, profile.tin]
    );
    return rows[0];
  }

  public async getBookkeeperProfile(userId: number): Promise<BookkeeperProfile | undefined> {
    const { rows } = await pool.query(`SELECT * FROM bookkeeper_profiles WHERE user_id=$1`, [userId]);
    return rows[0];
  }

  public async updateBookkeeperProfile(bookkeeperId: number, profile: Partial<BookkeeperProfile>): Promise<BookkeeperProfile | null> {
    const built = buildUpdate("bookkeeper_profiles", "bookkeeper_id", bookkeeperId, profile);
    if (!built) {
      const { rows } = await pool.query(`SELECT * FROM bookkeeper_profiles WHERE bookkeeper_id=$1`, [bookkeeperId]);
      return rows[0] ?? null;
    }
    const { rows } = await pool.query(built.text, built.values);
    return rows[0] ?? null;
  }

  public async getClientProfiles(): Promise<ClientProfile[]> {
    const { rows } = await pool.query(`SELECT * FROM client_profiles ORDER BY client_id`);
    return rows.map(mapClientProfile);
  }

  public async getClientProfileByUserId(userId: number): Promise<ClientProfile | undefined> {
    const { rows } = await pool.query(`SELECT * FROM client_profiles WHERE user_id=$1`, [userId]);
    return rows[0] ? mapClientProfile(rows[0]) : undefined;
  }

  public async addClientProfile(profile: Omit<ClientProfile, "client_id" | "status" | "approval_status">): Promise<ClientProfile> {
    return withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO client_profiles (user_id, business_name, business_type, tin, address, contact_number, type, status, bookkeeper_fee_type, bookkeeper_fee_amount, industry, rdo_code, email_reminders_enabled)
         VALUES ($1,$2,$3,$4,$5,$6,'Non-VAT','active',$7,$8,$9,$10,$11) RETURNING *`,
        [
          profile.user_id, profile.business_name, profile.business_type, profile.tin, profile.address, profile.contact_number,
          profile.bookkeeper_fee_type, profile.bookkeeper_fee_amount,
          profile.industry ?? null, profile.rdo_code ?? null, profile.email_reminders_enabled ?? true,
        ]
      );
      const newProfile = mapClientProfile(rows[0]);

      // Bootstrap initial chart of accounts automatically for this new client
      const defaultAccounts: { code: string; name: string; type: Account["account_type"] }[] = [
        { code: "1010", name: "Cash on Hand", type: "asset" },
        { code: "1020", name: "Bank Account (LBP Sipocot)", type: "asset" },
        { code: "1030", name: "Accounts Receivable", type: "asset" },
        { code: "1040", name: "Inventory", type: "asset" },
        { code: "2010", name: "Accounts Payable", type: "liability" },
        { code: "3010", name: "Capital Investment", type: "equity" },
        { code: "4010", name: "Sales Revenues", type: "revenue" },
        { code: "5010", name: "Store Rent Expense", type: "expense" },
        { code: "5020", name: "Utilities Expense", type: "expense" },
        { code: "2020", name: "Tax Payable", type: "liability" },
      ];
      for (const acct of defaultAccounts) {
        await client.query(
          `INSERT INTO accounts (client_id, account_code, account_name, account_type, balance) VALUES ($1,$2,$3,$4,0)`,
          [newProfile.client_id, acct.code, acct.name, acct.type]
        );
      }

      return newProfile;
    });
  }

  public async updateClientProfile(clientId: number, profile: Partial<ClientProfile>): Promise<ClientProfile | null> {
    const built = buildUpdate("client_profiles", "client_id", clientId, profile);
    if (!built) {
      const { rows } = await pool.query(`SELECT * FROM client_profiles WHERE client_id=$1`, [clientId]);
      return rows[0] ? mapClientProfile(rows[0]) : null;
    }
    const { rows } = await pool.query(built.text, built.values);
    return rows[0] ? mapClientProfile(rows[0]) : null;
  }

  // Chart of accounts
  public async getAccounts(clientId?: number): Promise<Account[]> {
    if (clientId !== undefined) {
      const { rows } = await pool.query(`SELECT * FROM accounts WHERE client_id=$1 ORDER BY account_id`, [clientId]);
      return rows.map(mapAccount);
    }
    const { rows } = await pool.query(`SELECT * FROM accounts ORDER BY account_id`);
    return rows.map(mapAccount);
  }

  public async addAccount(account: Omit<Account, "account_id">): Promise<Account> {
    const { rows } = await pool.query(
      `INSERT INTO accounts (client_id, account_code, account_name, account_type, balance) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [account.client_id, account.account_code ?? null, account.account_name, account.account_type, account.balance]
    );
    return mapAccount(rows[0]);
  }

  // Renaming and re-coding are always safe. Changing an account's fundamental type
  // (asset/liability/equity/revenue/expense) or its opening balance after it has posted
  // ledger history is refused — the debit/credit convention flips per type and the
  // running balance is anchored on `balance`, so either change would silently distort
  // every past balance computed under the old values. Unused accounts (no ledger rows
  // yet) can still be retyped/rebalanced freely. The row is locked (FOR UPDATE) for the
  // duration of the check + write so two concurrent edits can't both pass the guard.
  public async updateAccount(accountId: number, updates: { account_name?: string; account_type?: Account["account_type"]; account_code?: string; balance?: number }): Promise<Account | null> {
    return withTransaction(async (client) => {
      const { rows } = await client.query(`SELECT * FROM accounts WHERE account_id=$1 FOR UPDATE`, [accountId]);
      if (rows.length === 0) return null;
      const account = mapAccount(rows[0]);

      const typeChanging = updates.account_type !== undefined && updates.account_type !== account.account_type;
      const balanceChanging = updates.balance !== undefined && updates.balance !== account.balance;
      let hasActivity = false;
      if (typeChanging || balanceChanging) {
        const activity = await client.query(`SELECT EXISTS(SELECT 1 FROM general_ledger WHERE account_id=$1) AS has_activity`, [accountId]);
        hasActivity = activity.rows[0].has_activity;
      }

      const patch: Record<string, any> = {};
      if (updates.account_name !== undefined) patch.account_name = updates.account_name;
      if (updates.account_code !== undefined) patch.account_code = updates.account_code;
      if (typeChanging) {
        if (hasActivity) throw new Error("This account already has posted transactions — its type can't be changed without corrupting past ledger balances. Rename it or create a new account instead.");
        patch.account_type = updates.account_type;
      }
      if (balanceChanging) {
        if (hasActivity) throw new Error("This account already has posted transactions — its opening balance can't be edited directly anymore. Post a journal entry to adjust it instead.");
        patch.balance = updates.balance;
      }

      const built = buildUpdate("accounts", "account_id", accountId, patch);
      if (!built) return account;
      const { rows: updatedRows } = await client.query(built.text, built.values);
      return mapAccount(updatedRows[0]);
    });
  }

  // Finds an account by name for a client, creating it on the fly if the client's
  // chart of accounts predates this account (e.g. "Tax Payable" for older client records).
  private async getOrCreateAccountCore(client: PoolClient, clientId: number, name: string, type: Account["account_type"]): Promise<Account> {
    const existing = await client.query(`SELECT * FROM accounts WHERE client_id=$1 AND account_name=$2 LIMIT 1`, [clientId, name]);
    if (existing.rows.length > 0) return mapAccount(existing.rows[0]);
    const inserted = await client.query(
      `INSERT INTO accounts (client_id, account_name, account_type, balance) VALUES ($1,$2,$3,0) RETURNING *`,
      [clientId, name, type]
    );
    return mapAccount(inserted.rows[0]);
  }

  public async getOrCreateAccount(clientId: number, name: string, type: Account["account_type"]): Promise<Account> {
    return withTransaction((client) => this.getOrCreateAccountCore(client, clientId, name, type));
  }

  // Journal and Ledger with auto-ledger posting
  public async getJournalEntries(clientId?: number): Promise<JournalEntry[]> {
    if (clientId !== undefined) {
      const { rows } = await pool.query(`SELECT * FROM journal_entries WHERE client_id=$1 ORDER BY journal_id`, [clientId]);
      return rows.map(mapJournalEntry);
    }
    const { rows } = await pool.query(`SELECT * FROM journal_entries ORDER BY journal_id`);
    return rows.map(mapJournalEntry);
  }

  public async getJournalLines(journalId: number): Promise<JournalLine[]> {
    const { rows } = await pool.query(`SELECT * FROM journal_lines WHERE journal_id=$1 ORDER BY line_id`, [journalId]);
    return rows.map(mapJournalLine);
  }

  public async getGeneralLedger(clientId?: number): Promise<GeneralLedgerEntry[]> {
    if (clientId !== undefined) {
      const { rows } = await pool.query(`SELECT * FROM general_ledger WHERE client_id=$1 ORDER BY ledger_id`, [clientId]);
      return rows.map(mapGeneralLedgerEntry);
    }
    const { rows } = await pool.query(`SELECT * FROM general_ledger ORDER BY ledger_id`);
    return rows.map(mapGeneralLedgerEntry);
  }

  // After journal_lines/general_ledger rows change for an account (a new entry, an edit,
  // or a delete), the per-row running "balance" snapshots need to be recomputed in
  // chronological order (entry_date, then journal_id — stable across edits, unlike
  // ledger_id — as the tie-break). account.balance (already kept correct incrementally,
  // including any non-ledger-backed opening balance) is used as the anchor: the implicit
  // opening balance is derived by subtracting the ledger rows' own total effect from it,
  // computed server-side via a window function in one statement.
  private async resyncAccountLedgerBalances(client: PoolClient, accountId: number, accountType: Account["account_type"]): Promise<void> {
    const sign = isDebitIncreaseType(accountType) ? "(debit - credit)" : "(credit - debit)";

    const { rows: balRows } = await client.query(`SELECT balance FROM accounts WHERE account_id=$1`, [accountId]);
    const currentBalance = num(balRows[0]?.balance);
    const { rows: totalRows } = await client.query(`SELECT COALESCE(SUM(${sign}), 0) AS total FROM general_ledger WHERE account_id=$1`, [accountId]);
    const opening = currentBalance - num(totalRows[0].total);

    await client.query(
      `UPDATE general_ledger g
       SET balance = $2::numeric + sub.running_total
       FROM (
         SELECT ledger_id, SUM(${sign}) OVER (ORDER BY entry_date, journal_id, ledger_id) AS running_total
         FROM general_ledger WHERE account_id = $1
       ) sub
       WHERE g.ledger_id = sub.ledger_id`,
      [accountId, opening]
    );
  }

  // Inserts journal_lines + general_ledger rows for a (new or edited) journal entry and
  // applies each line's effect to its account's running balance. Ledger row "balance"
  // snapshots are left at 0 here — callers must resync every touched account afterward.
  private async postJournalLines(
    client: PoolClient,
    journalId: number,
    clientId: number,
    entry_date: string,
    ledgerDescription: string,
    lines: { account_id: number; debit: number; credit: number; narration?: string | null }[],
    touched: Map<number, Account["account_type"]>
  ): Promise<void> {
    for (const line of lines) {
      await client.query(`INSERT INTO journal_lines (journal_id, account_id, debit, credit, narration) VALUES ($1,$2,$3,$4,$5)`, [
        journalId,
        line.account_id,
        line.debit,
        line.credit,
        line.narration ?? null,
      ]);

      const { rows } = await client.query(`SELECT account_type FROM accounts WHERE account_id=$1`, [line.account_id]);
      if (rows.length === 0) continue;
      const accountType: Account["account_type"] = rows[0].account_type;
      const delta = isDebitIncreaseType(accountType) ? line.debit - line.credit : line.credit - line.debit;
      await client.query(`UPDATE accounts SET balance = balance + $1 WHERE account_id=$2`, [delta, line.account_id]);

      await client.query(
        `INSERT INTO general_ledger (account_id, journal_id, client_id, entry_date, description, debit, credit, balance)
         VALUES ($1,$2,$3,$4,$5,$6,$7,0)`,
        [line.account_id, journalId, clientId, entry_date, ledgerDescription, line.debit, line.credit]
      );
      touched.set(line.account_id, accountType);
    }
  }

  // Reverses a journal entry's existing effect on account balances ahead of removing its
  // journal_lines/general_ledger rows (used by both edit and delete).
  private async unpostJournalLines(client: PoolClient, journalId: number, touched: Map<number, Account["account_type"]>): Promise<void> {
    const { rows: oldLines } = await client.query(
      `SELECT jl.debit, jl.credit, jl.account_id, a.account_type FROM journal_lines jl JOIN accounts a ON a.account_id = jl.account_id WHERE jl.journal_id=$1`,
      [journalId]
    );
    for (const line of oldLines) {
      const accountType: Account["account_type"] = line.account_type;
      const delta = isDebitIncreaseType(accountType) ? num(line.debit) - num(line.credit) : num(line.credit) - num(line.debit);
      await client.query(`UPDATE accounts SET balance = balance - $1 WHERE account_id=$2`, [delta, line.account_id]);
      touched.set(line.account_id, accountType);
    }
    await client.query(`DELETE FROM journal_lines WHERE journal_id=$1`, [journalId]);
    await client.query(`DELETE FROM general_ledger WHERE journal_id=$1`, [journalId]);
  }

  public async addJournalEntry(clientId: number, entry_date: string, description: string, lines: { account_id: number; debit: number; credit: number; narration?: string | null }[]): Promise<JournalEntry> {
    return withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO journal_entries (client_id, entry_date, reference, description) VALUES ($1,$2,'',$3) RETURNING journal_id`,
        [clientId, entry_date, description]
      );
      const journalId = inserted.rows[0].journal_id;
      const refCode = `JE-${journalId.toString().padStart(3, "0")}`;
      const updated = await client.query(`UPDATE journal_entries SET reference=$1 WHERE journal_id=$2 RETURNING *`, [refCode, journalId]);

      const touched = new Map<number, Account["account_type"]>();
      await this.postJournalLines(client, journalId, clientId, entry_date, `${description} (${refCode})`, lines, touched);
      for (const [accountId, accountType] of touched) {
        await this.resyncAccountLedgerBalances(client, accountId, accountType);
      }

      return mapJournalEntry(updated.rows[0]);
    });
  }

  // Posts several journal entries (e.g. one per date-group of an Excel import) as a
  // single all-or-nothing transaction — if any entry in the batch fails, none of them
  // land, rather than leaving the books half-imported.
  public async addJournalEntriesBatch(
    entries: { clientId: number; entry_date: string; description: string; lines: { account_id: number; debit: number; credit: number; narration?: string | null }[] }[]
  ): Promise<JournalEntry[]> {
    return withTransaction(async (client) => {
      const created: JournalEntry[] = [];
      const touched = new Map<number, Account["account_type"]>();

      for (const entry of entries) {
        const inserted = await client.query(
          `INSERT INTO journal_entries (client_id, entry_date, reference, description) VALUES ($1,$2,'',$3) RETURNING journal_id`,
          [entry.clientId, entry.entry_date, entry.description]
        );
        const journalId = inserted.rows[0].journal_id;
        const refCode = `JE-${journalId.toString().padStart(3, "0")}`;
        const updated = await client.query(`UPDATE journal_entries SET reference=$1 WHERE journal_id=$2 RETURNING *`, [refCode, journalId]);

        await this.postJournalLines(client, journalId, entry.clientId, entry.entry_date, `${entry.description} (${refCode})`, entry.lines, touched);
        created.push(mapJournalEntry(updated.rows[0]));
      }

      for (const [accountId, accountType] of touched) {
        await this.resyncAccountLedgerBalances(client, accountId, accountType);
      }

      return created;
    });
  }

  // Edits an existing posted journal entry in place: reverses its old effect on account
  // balances, replaces its lines, reapplies the new effect, then resyncs the running
  // "balance" snapshot on every ledger row for any account touched by the old or new
  // lines (an account can be affected even if it's not in the new line set, e.g. it was
  // removed from the entry entirely).
  public async updateJournalEntry(journalId: number, entry_date: string, description: string, lines: { account_id: number; debit: number; credit: number; narration?: string | null }[]): Promise<JournalEntry | null> {
    return withTransaction(async (client) => {
      const { rows } = await client.query(`SELECT * FROM journal_entries WHERE journal_id=$1 FOR UPDATE`, [journalId]);
      if (rows.length === 0) return null;
      const entry = mapJournalEntry(rows[0]);

      const touched = new Map<number, Account["account_type"]>();
      await this.unpostJournalLines(client, journalId, touched);

      await client.query(`UPDATE journal_entries SET entry_date=$1, description=$2 WHERE journal_id=$3`, [entry_date, description, journalId]);
      await this.postJournalLines(client, journalId, entry.client_id, entry_date, `${description} (${entry.reference})`, lines, touched);
      for (const [accountId, accountType] of touched) {
        await this.resyncAccountLedgerBalances(client, accountId, accountType);
      }

      const { rows: finalRows } = await client.query(`SELECT * FROM journal_entries WHERE journal_id=$1`, [journalId]);
      return mapJournalEntry(finalRows[0]);
    });
  }

  public async deleteJournalEntry(journalId: number): Promise<JournalEntry | null> {
    return withTransaction(async (client) => {
      const { rows } = await client.query(`SELECT * FROM journal_entries WHERE journal_id=$1 FOR UPDATE`, [journalId]);
      if (rows.length === 0) return null;
      const removed = mapJournalEntry(rows[0]);

      const touched = new Map<number, Account["account_type"]>();
      await this.unpostJournalLines(client, journalId, touched);
      await client.query(`DELETE FROM journal_entries WHERE journal_id=$1`, [journalId]);
      for (const [accountId, accountType] of touched) {
        await this.resyncAccountLedgerBalances(client, accountId, accountType);
      }

      return removed;
    });
  }

  // Compliance
  public async getTaxRecords(clientId?: number): Promise<TaxRecord[]> {
    if (clientId !== undefined) {
      const { rows } = await pool.query(`SELECT * FROM tax_records WHERE client_id=$1 ORDER BY tax_id`, [clientId]);
      return rows.map(mapTaxRecord);
    }
    const { rows } = await pool.query(`SELECT * FROM tax_records ORDER BY tax_id`);
    return rows.map(mapTaxRecord);
  }

  public async getPermitRecords(clientId?: number): Promise<PermitRecord[]> {
    if (clientId !== undefined) {
      const { rows } = await pool.query(`SELECT * FROM permit_records WHERE client_id=$1 ORDER BY permit_id`, [clientId]);
      return rows.map(mapPermitRecord);
    }
    const { rows } = await pool.query(`SELECT * FROM permit_records ORDER BY permit_id`);
    return rows.map(mapPermitRecord);
  }

  public async addTaxObligation(record: Omit<TaxRecord, "tax_id">): Promise<TaxRecord> {
    const { rows } = await pool.query(
      `INSERT INTO tax_records (client_id, tax_type, due_date, amount, status, filed_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [record.client_id, record.tax_type, record.due_date, record.amount, record.status, record.filed_date ?? null]
    );
    return mapTaxRecord(rows[0]);
  }

  public async updateTaxObligation(taxId: number, update: Partial<TaxRecord>): Promise<TaxRecord | null> {
    const patch: Partial<TaxRecord> = { ...update };
    if (patch.status === "filed" && !patch.filed_date) {
      patch.filed_date = new Date().toISOString().split("T")[0];
    }
    const built = buildUpdate("tax_records", "tax_id", taxId, patch);
    if (!built) {
      const { rows } = await pool.query(`SELECT * FROM tax_records WHERE tax_id=$1`, [taxId]);
      return rows[0] ? mapTaxRecord(rows[0]) : null;
    }
    const { rows } = await pool.query(built.text, built.values);
    return rows[0] ? mapTaxRecord(rows[0]) : null;
  }

  public async deleteTaxObligation(taxId: number): Promise<boolean> {
    const { rowCount } = await pool.query(`DELETE FROM tax_records WHERE tax_id=$1`, [taxId]);
    return (rowCount ?? 0) > 0;
  }

  public async addPermitObligation(record: Omit<PermitRecord, "permit_id">): Promise<PermitRecord> {
    const { rows } = await pool.query(
      `INSERT INTO permit_records (client_id, permit_type, fee, expiry_date, status) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [record.client_id, record.permit_type, record.fee, record.expiry_date, record.status]
    );
    return mapPermitRecord(rows[0]);
  }

  public async updatePermitObligation(permitId: number, update: Partial<PermitRecord>): Promise<PermitRecord | null> {
    const built = buildUpdate("permit_records", "permit_id", permitId, update);
    if (!built) {
      const { rows } = await pool.query(`SELECT * FROM permit_records WHERE permit_id=$1`, [permitId]);
      return rows[0] ? mapPermitRecord(rows[0]) : null;
    }
    const { rows } = await pool.query(built.text, built.values);
    return rows[0] ? mapPermitRecord(rows[0]) : null;
  }

  public async deletePermitObligation(permitId: number): Promise<boolean> {
    const { rowCount } = await pool.query(`DELETE FROM permit_records WHERE permit_id=$1`, [permitId]);
    return (rowCount ?? 0) > 0;
  }

  // Reports
  public async getReports(clientId?: number): Promise<Report[]> {
    if (clientId !== undefined) {
      const { rows } = await pool.query(`SELECT * FROM reports WHERE client_id=$1 ORDER BY report_id`, [clientId]);
      return rows.map(mapReport);
    }
    const { rows } = await pool.query(`SELECT * FROM reports ORDER BY report_id`);
    return rows.map(mapReport);
  }

  public async addReport(report: Omit<Report, "report_id" | "generated_at">): Promise<Report> {
    const { rows } = await pool.query(
      `INSERT INTO reports (client_id, report_type, period, file_path, file_size) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [report.client_id, report.report_type, report.period, report.file_path, report.file_size]
    );
    return mapReport(rows[0]);
  }

  public async deleteReport(reportId: number): Promise<Report | null> {
    const { rows } = await pool.query(`DELETE FROM reports WHERE report_id=$1 RETURNING *`, [reportId]);
    return rows[0] ? mapReport(rows[0]) : null;
  }

  // Notifications
  public async getNotifications(userId: number): Promise<Notification[]> {
    const { rows } = await pool.query(`SELECT * FROM notifications WHERE user_id=$1 ORDER BY notification_id`, [userId]);
    return rows.map(mapNotification);
  }

  public async addNotification(userId: number, message: string, type: "reminder" | "alert" | "info", link?: string): Promise<Notification> {
    const { rows } = await pool.query(
      `INSERT INTO notifications (user_id, message, type, link) VALUES ($1,$2,$3,$4) RETURNING *`,
      [userId, message, type, link ?? null]
    );
    return mapNotification(rows[0]);
  }

  public async markNotificationsRead(userId: number): Promise<void> {
    await pool.query(`UPDATE notifications SET is_read=1 WHERE user_id=$1`, [userId]);
  }

  // Messages — one thread per client, shared between that client and the bookkeeper
  public async addMessage(entry: Omit<Message, "message_id" | "is_read" | "sent_at">): Promise<Message> {
    const { rows } = await pool.query(
      `INSERT INTO messages (client_id, sender_id, sender_role, subject, body) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [entry.client_id, entry.sender_id, entry.sender_role, entry.subject ?? null, entry.body]
    );
    return mapMessage(rows[0]);
  }

  public async getMessagesForClient(clientId: number): Promise<Message[]> {
    const { rows } = await pool.query(`SELECT * FROM messages WHERE client_id=$1 ORDER BY sent_at ASC`, [clientId]);
    return rows.map(mapMessage);
  }

  // One row per client that has ever had a message, newest activity first — the
  // bookkeeper's conversation list. Fetch-all-and-group-in-memory rather than a
  // denormalized threads table — plenty cheap at this app's data scale.
  public async getMessageThreadsSummary(): Promise<{ client_id: number; latest: Message; unreadCount: number }[]> {
    const { rows } = await pool.query(`SELECT * FROM messages ORDER BY sent_at ASC`);
    const messages = rows.map(mapMessage);
    const byClient = new Map<number, Message[]>();
    for (const m of messages) {
      if (!byClient.has(m.client_id)) byClient.set(m.client_id, []);
      byClient.get(m.client_id)!.push(m);
    }
    return Array.from(byClient.entries())
      .map(([clientId, msgs]) => {
        const sorted = msgs.slice().sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());
        const latest = sorted[0];
        const unreadCount = msgs.filter((m) => m.sender_role === "client" && m.is_read === 0).length;
        return { client_id: clientId, latest, unreadCount };
      })
      .sort((a, b) => new Date(b.latest.sent_at).getTime() - new Date(a.latest.sent_at).getTime());
  }

  // Marks messages in a thread as read FROM the other party's perspective — e.g. a
  // bookkeeper opening a thread marks the client's messages read, and vice versa.
  public async markMessagesRead(clientId: number, readerRole: "bookkeeper" | "client"): Promise<void> {
    const senderRoleBeingRead = readerRole === "bookkeeper" ? "client" : "bookkeeper";
    await pool.query(`UPDATE messages SET is_read=1 WHERE client_id=$1 AND sender_role=$2`, [clientId, senderRoleBeingRead]);
  }

  public async getUnreadMessageCountForBookkeeper(): Promise<number> {
    const { rows } = await pool.query(`SELECT COUNT(*) AS count FROM messages WHERE sender_role='client' AND is_read=0`);
    return Number(rows[0].count);
  }

  public async getUnreadMessageCountForClient(clientId: number): Promise<number> {
    const { rows } = await pool.query(`SELECT COUNT(*) AS count FROM messages WHERE client_id=$1 AND sender_role='bookkeeper' AND is_read=0`, [clientId]);
    return Number(rows[0].count);
  }

  // Payments Module
  public async getPayments(clientId?: number): Promise<Payment[]> {
    if (clientId !== undefined) {
      const { rows } = await pool.query(`SELECT * FROM payments WHERE client_id=$1 ORDER BY payment_id`, [clientId]);
      return rows.map(mapPayment);
    }
    const { rows } = await pool.query(`SELECT * FROM payments ORDER BY payment_id`);
    return rows.map(mapPayment);
  }

  public async getPayment(paymentId: number): Promise<Payment | undefined> {
    const { rows } = await pool.query(`SELECT * FROM payments WHERE payment_id=$1`, [paymentId]);
    return rows[0] ? mapPayment(rows[0]) : undefined;
  }

  public async addPayment(payment: Omit<Payment, "payment_id" | "status" | "submitted_at">): Promise<Payment> {
    const { rows } = await pool.query(
      `INSERT INTO payments (client_id, obligation_type, obligation_id, obligation_label, amount, payment_date, payment_method, reference_number, status, notes, receipt_file_name, receipt_original_name, receipt_mime_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10,$11,$12) RETURNING *`,
      [
        payment.client_id, payment.obligation_type, payment.obligation_id, payment.obligation_label, payment.amount,
        payment.payment_date, payment.payment_method, payment.reference_number, payment.notes ?? null,
        payment.receipt_file_name ?? null, payment.receipt_original_name ?? null, payment.receipt_mime_type ?? null,
      ]
    );
    return mapPayment(rows[0]);
  }

  public async updatePayment(paymentId: number, update: Partial<Payment>): Promise<Payment | null> {
    const built = buildUpdate("payments", "payment_id", paymentId, update);
    if (!built) {
      const { rows } = await pool.query(`SELECT * FROM payments WHERE payment_id=$1`, [paymentId]);
      return rows[0] ? mapPayment(rows[0]) : null;
    }
    const { rows } = await pool.query(built.text, built.values);
    return rows[0] ? mapPayment(rows[0]) : null;
  }

  // Bookkeeper confirms a pending client payment: posts a 2-line journal entry (Dr Cash,
  // Cr the obligation's account — created on the fly if it doesn't exist yet), closes out
  // the underlying tax/permit record, and notifies the client. All in one transaction: the
  // payment row is locked (FOR UPDATE) and re-checked for "pending" status before any of
  // this runs, closing a real race that plain single-threaded JS never had to worry about
  // (two concurrent "confirm" clicks double-posting the same payment).
  public async confirmPayment(paymentId: number, reviewerUserId: number, notifyClient: boolean): Promise<Payment> {
    return withTransaction(async (client) => {
      const { rows: paymentRows } = await client.query(`SELECT * FROM payments WHERE payment_id=$1 FOR UPDATE`, [paymentId]);
      if (paymentRows.length === 0) throw new Error("Payment record not found.");
      const payment = mapPayment(paymentRows[0]);
      if (payment.status !== "pending") {
        throw new Error(`This payment has already been ${payment.status}.`);
      }

      const cashAccount = await this.getOrCreateAccountCore(client, payment.client_id, "Cash on Hand", "asset");
      const creditAccountName =
        payment.obligation_type === "tax" ? "Tax Payable"
        : payment.obligation_type === "service_fee" ? "Bookkeeping Fees Payable"
        : "Accounts Receivable";
      const creditAccountType: Account["account_type"] = payment.obligation_type === "permit" ? "asset" : "liability";
      const creditAccount = await this.getOrCreateAccountCore(client, payment.client_id, creditAccountName, creditAccountType);

      const description = `Payment collected: ${payment.obligation_label} (Ref# ${payment.reference_number})`;

      const inserted = await client.query(
        `INSERT INTO journal_entries (client_id, entry_date, reference, description) VALUES ($1,$2,'',$3) RETURNING journal_id`,
        [payment.client_id, payment.payment_date, description]
      );
      const journalId = inserted.rows[0].journal_id;
      const refCode = `JE-${journalId.toString().padStart(3, "0")}`;
      await client.query(`UPDATE journal_entries SET reference=$1 WHERE journal_id=$2`, [refCode, journalId]);

      const touched = new Map<number, Account["account_type"]>();
      await this.postJournalLines(
        client, journalId, payment.client_id, payment.payment_date, `${description} (${refCode})`,
        [
          { account_id: cashAccount.account_id, debit: payment.amount, credit: 0 },
          { account_id: creditAccount.account_id, debit: 0, credit: payment.amount },
        ],
        touched
      );
      for (const [accountId, accountType] of touched) {
        await this.resyncAccountLedgerBalances(client, accountId, accountType);
      }

      const { rows: updatedPaymentRows } = await client.query(
        `UPDATE payments SET status='paid', reviewed_at=now(), journal_id=$1 WHERE payment_id=$2 RETURNING *`,
        [journalId, paymentId]
      );
      const updated = mapPayment(updatedPaymentRows[0]);

      // Close out the underlying obligation, mirroring the existing manual "Mark as
      // Filed/Renewed" actions. A service_fee payment has no backing tax/permit record.
      if (payment.obligation_type === "tax") {
        await client.query(`UPDATE tax_records SET status='filed', filed_date=$1 WHERE tax_id=$2`, [payment.payment_date, payment.obligation_id]);
      } else if (payment.obligation_type === "permit") {
        await client.query(`UPDATE permit_records SET status='renewed' WHERE permit_id=$1`, [payment.obligation_id]);
      }

      await client.query(
        `INSERT INTO audit_logs (user_id, action, table_name, record_id) VALUES ($1,$2,'payments',$3)`,
        [reviewerUserId, `Confirmed payment for ${payment.obligation_label} and posted journal ${refCode}`, paymentId]
      );

      if (notifyClient) {
        const { rows: clientRows } = await client.query(`SELECT user_id FROM client_profiles WHERE client_id=$1`, [payment.client_id]);
        if (clientRows.length > 0) {
          await client.query(
            `INSERT INTO notifications (user_id, message, type, link) VALUES ($1,$2,'info','payments')`,
            [clientRows[0].user_id, `Your payment of ₱${payment.amount.toLocaleString()} for "${payment.obligation_label}" has been confirmed and posted to your ledger.`]
          );
        }
      }

      return updated;
    });
  }

  // Client Documents (BIR forms, certificates, etc.)
  public async getDocuments(clientId?: number): Promise<ClientDocument[]> {
    if (clientId !== undefined) {
      const { rows } = await pool.query(`SELECT * FROM documents WHERE client_id=$1 ORDER BY document_id`, [clientId]);
      return rows.map(mapDocument);
    }
    const { rows } = await pool.query(`SELECT * FROM documents ORDER BY document_id`);
    return rows.map(mapDocument);
  }

  public async getDocument(documentId: number): Promise<ClientDocument | undefined> {
    const { rows } = await pool.query(`SELECT * FROM documents WHERE document_id=$1`, [documentId]);
    return rows[0] ? mapDocument(rows[0]) : undefined;
  }

  public async addDocument(doc: Omit<ClientDocument, "document_id" | "uploaded_at">): Promise<ClientDocument> {
    const { rows } = await pool.query(
      `INSERT INTO documents (client_id, document_type, label, file_name, original_name, file_size, mime_type, uploaded_by, uploaded_by_role, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [doc.client_id, doc.document_type, doc.label, doc.file_name, doc.original_name, doc.file_size, doc.mime_type, doc.uploaded_by, doc.uploaded_by_role, doc.notes ?? null]
    );
    return mapDocument(rows[0]);
  }

  public async updateDocument(documentId: number, update: Partial<ClientDocument>): Promise<ClientDocument | null> {
    const built = buildUpdate("documents", "document_id", documentId, update);
    if (!built) {
      const { rows } = await pool.query(`SELECT * FROM documents WHERE document_id=$1`, [documentId]);
      return rows[0] ? mapDocument(rows[0]) : null;
    }
    const { rows } = await pool.query(built.text, built.values);
    return rows[0] ? mapDocument(rows[0]) : null;
  }

  public async deleteDocument(documentId: number): Promise<ClientDocument | null> {
    const { rows } = await pool.query(`DELETE FROM documents WHERE document_id=$1 RETURNING *`, [documentId]);
    return rows[0] ? mapDocument(rows[0]) : null;
  }

  // Client Self-Registration Invite Codes
  public async getClientInvites(createdBy?: number): Promise<ClientInvite[]> {
    if (createdBy !== undefined) {
      const { rows } = await pool.query(`SELECT * FROM client_invites WHERE created_by=$1 ORDER BY invite_id`, [createdBy]);
      return rows.map(mapClientInvite);
    }
    const { rows } = await pool.query(`SELECT * FROM client_invites ORDER BY invite_id`);
    return rows.map(mapClientInvite);
  }

  public async getClientInviteByCode(code: string): Promise<ClientInvite | undefined> {
    const { rows } = await pool.query(`SELECT * FROM client_invites WHERE upper(code) = upper($1) LIMIT 1`, [code]);
    return rows[0] ? mapClientInvite(rows[0]) : undefined;
  }

  // Callers should catch a unique-violation (err.code === '23505', from the
  // client_invites_code_upper_idx unique index) and retry with a new candidate code —
  // this replaces the old check-then-insert loop, which was only race-free because it
  // ran synchronously against the in-memory array.
  public async addClientInvite(createdBy: number, code: string, label?: string): Promise<ClientInvite> {
    const { rows } = await pool.query(
      `INSERT INTO client_invites (code, created_by, status, label, expires_at) VALUES ($1,$2,'pending',$3, now() + interval '7 days') RETURNING *`,
      [code, createdBy, label ?? null]
    );
    return mapClientInvite(rows[0]);
  }

  // A pending invite past its expires_at is treated as expired without a status
  // migration: status stays "pending" in storage, this check gates redemption/listing.
  public isInviteExpired(invite: ClientInvite): boolean {
    return invite.status === "pending" && new Date(invite.expires_at).getTime() < Date.now();
  }

  public async markClientInviteUsed(inviteId: number, clientId: number): Promise<ClientInvite | null> {
    const { rows } = await pool.query(
      `UPDATE client_invites SET status='used', used_by_client_id=$1, used_at=now() WHERE invite_id=$2 RETURNING *`,
      [clientId, inviteId]
    );
    return rows[0] ? mapClientInvite(rows[0]) : null;
  }

  public async revokeClientInvite(inviteId: number): Promise<ClientInvite | null> {
    const { rows } = await pool.query(
      `UPDATE client_invites SET status='revoked' WHERE invite_id=$1 AND status='pending' RETURNING *`,
      [inviteId]
    );
    return rows[0] ? mapClientInvite(rows[0]) : null;
  }
}

export const dbInstance = new LibraryDB();

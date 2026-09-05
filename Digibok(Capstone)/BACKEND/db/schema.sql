-- DigiBok PostgreSQL schema — mirrors the 16 flat-file "collections" from the old
-- db.json 1:1, now with real foreign keys, CHECK constraints, and exact NUMERIC
-- money types. See the migration plan for the reasoning behind each convention
-- (CHECK over native ENUM, INTEGER IDENTITY over BIGINT, etc).

CREATE TABLE users (
  user_id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                  TEXT NOT NULL,
  email                 TEXT NOT NULL,
  password_hash         TEXT NOT NULL,
  role                  TEXT NOT NULL CHECK (role IN ('bookkeeper', 'client')),
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  pending_activation    BOOLEAN NOT NULL DEFAULT false,
  reset_token           TEXT,
  reset_token_expires   TIMESTAMPTZ,
  email_verified        BOOLEAN NOT NULL DEFAULT true,
  verification_token    TEXT,
  verification_expires  TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  totp_enabled          BOOLEAN NOT NULL DEFAULT false,
  totp_secret           TEXT,
  totp_pending_secret   TEXT,
  totp_backup_codes     TEXT[],
  totp_last_time_step   BIGINT
);
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

CREATE TABLE bookkeeper_profiles (
  bookkeeper_id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id                   INTEGER NOT NULL UNIQUE REFERENCES users(user_id),
  license_no                TEXT,
  status                    TEXT NOT NULL DEFAULT 'active',
  phone_number              TEXT,
  business_address          TEXT,
  tin                       TEXT,
  rdo_code                  TEXT,
  email_reminders_enabled   BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE client_profiles (
  client_id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id                   INTEGER NOT NULL UNIQUE REFERENCES users(user_id),
  business_name             TEXT NOT NULL,
  business_type             TEXT NOT NULL,
  tin                       TEXT NOT NULL,
  address                   TEXT NOT NULL,
  contact_number            TEXT NOT NULL,
  type                      TEXT NOT NULL DEFAULT 'Non-VAT' CHECK (type = 'Non-VAT'),
  status                    TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  approval_status           TEXT NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved')),
  bookkeeper_fee_type       TEXT CHECK (bookkeeper_fee_type IN ('flat', 'percentage')),
  bookkeeper_fee_amount     NUMERIC(12,2),
  industry                  TEXT,
  rdo_code                  TEXT,
  email_reminders_enabled   BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE accounts (
  account_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id     INTEGER NOT NULL REFERENCES client_profiles(client_id),
  account_code  TEXT,
  account_name  TEXT NOT NULL,
  account_type  TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  balance       NUMERIC(12,2) NOT NULL DEFAULT 0
);
CREATE INDEX accounts_client_id_idx ON accounts (client_id);

CREATE TABLE journal_entries (
  journal_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id    INTEGER NOT NULL REFERENCES client_profiles(client_id),
  entry_date   DATE NOT NULL,
  reference    TEXT NOT NULL,
  description  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX journal_entries_client_id_idx ON journal_entries (client_id);

CREATE TABLE journal_lines (
  line_id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journal_id  INTEGER NOT NULL REFERENCES journal_entries(journal_id) ON DELETE CASCADE,
  account_id  INTEGER NOT NULL REFERENCES accounts(account_id),
  debit       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  narration   TEXT
);
CREATE INDEX journal_lines_journal_id_idx ON journal_lines (journal_id);

CREATE TABLE general_ledger (
  ledger_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id   INTEGER NOT NULL REFERENCES accounts(account_id),
  journal_id   INTEGER NOT NULL REFERENCES journal_entries(journal_id) ON DELETE CASCADE,
  client_id    INTEGER NOT NULL REFERENCES client_profiles(client_id),
  entry_date   DATE NOT NULL,
  description  TEXT NOT NULL,
  debit        NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit       NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance      NUMERIC(12,2) NOT NULL DEFAULT 0
);
CREATE INDEX general_ledger_client_id_idx ON general_ledger (client_id);
CREATE INDEX general_ledger_resync_idx ON general_ledger (account_id, entry_date, journal_id);

CREATE TABLE tax_records (
  tax_id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id   INTEGER NOT NULL REFERENCES client_profiles(client_id),
  tax_type    TEXT NOT NULL,
  due_date    DATE NOT NULL,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'urgent', 'overdue', 'filed')),
  filed_date  DATE
);
CREATE INDEX tax_records_client_id_idx ON tax_records (client_id);

CREATE TABLE permit_records (
  permit_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id    INTEGER NOT NULL REFERENCES client_profiles(client_id),
  permit_type  TEXT NOT NULL,
  fee          NUMERIC(12,2) NOT NULL DEFAULT 0,
  expiry_date  DATE NOT NULL,
  status       TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'urgent', 'overdue', 'renewed'))
);
CREATE INDEX permit_records_client_id_idx ON permit_records (client_id);

CREATE TABLE reports (
  report_id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id     INTEGER NOT NULL REFERENCES client_profiles(client_id),
  report_type   TEXT NOT NULL,
  period        TEXT NOT NULL,  -- free-text label (e.g. "Q2 2026"), not a real date
  file_path     TEXT NOT NULL,
  file_size     TEXT NOT NULL,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  notification_id  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(user_id),
  message          TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('reminder', 'alert', 'info')),
  is_read          SMALLINT NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  link             TEXT
);

CREATE TABLE audit_logs (
  log_id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(user_id),
  action      TEXT NOT NULL,
  table_name  TEXT NOT NULL,
  record_id   INTEGER NOT NULL,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  payment_id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id               INTEGER NOT NULL REFERENCES client_profiles(client_id),
  obligation_type         TEXT NOT NULL CHECK (obligation_type IN ('tax', 'permit', 'service_fee')),
  obligation_id           INTEGER NOT NULL,  -- polymorphic (tax_records OR permit_records), not an FK
  obligation_label        TEXT NOT NULL,
  amount                  NUMERIC(12,2) NOT NULL,
  payment_date            DATE NOT NULL,
  payment_method          TEXT NOT NULL CHECK (payment_method IN ('cash', 'gcash', 'bank_transfer', 'check', 'other')),
  reference_number        TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'rejected')),
  notes                   TEXT,
  submitted_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at              TIMESTAMPTZ,
  journal_id               INTEGER REFERENCES journal_entries(journal_id),
  receipt_file_name        TEXT,
  receipt_original_name    TEXT,
  receipt_mime_type        TEXT
);
CREATE INDEX payments_client_id_idx ON payments (client_id);

CREATE TABLE documents (
  document_id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id         INTEGER NOT NULL REFERENCES client_profiles(client_id),
  document_type     TEXT NOT NULL,
  label             TEXT NOT NULL,
  file_name         TEXT NOT NULL,
  original_name     TEXT NOT NULL,
  file_size         TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  uploaded_by       INTEGER NOT NULL REFERENCES users(user_id),
  uploaded_by_role  TEXT NOT NULL CHECK (uploaded_by_role IN ('bookkeeper', 'client')),
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes             TEXT
);
CREATE INDEX documents_client_id_idx ON documents (client_id);

CREATE TABLE client_invites (
  invite_id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code                TEXT NOT NULL,
  created_by          INTEGER NOT NULL REFERENCES users(user_id),
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'revoked')),
  label               TEXT,
  used_by_client_id   INTEGER REFERENCES client_profiles(client_id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at             TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX client_invites_code_upper_idx ON client_invites (upper(code));

CREATE TABLE messages (
  message_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id    INTEGER NOT NULL REFERENCES client_profiles(client_id),
  sender_id    INTEGER NOT NULL REFERENCES users(user_id),
  sender_role  TEXT NOT NULL CHECK (sender_role IN ('bookkeeper', 'client')),
  subject      TEXT,
  body         TEXT NOT NULL,
  is_read      SMALLINT NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_client_id_idx ON messages (client_id);

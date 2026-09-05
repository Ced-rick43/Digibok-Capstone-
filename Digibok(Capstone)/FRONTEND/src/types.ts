export interface User {
  user_id: number;
  name: string;
  email: string;
  role: "bookkeeper" | "client";
  profile?: BookkeeperProfile | ClientProfile;
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
  email_reminders_enabled?: boolean;
}

export interface Account {
  account_id: number;
  client_id: number;
  account_code?: string;
  account_name: string;
  account_type: "asset" | "liability" | "equity" | "revenue" | "expense";
  balance: number;
  has_activity?: boolean;
}

export interface JournalLine {
  line_id: number;
  journal_id: number;
  account_id: number;
  debit: number;
  credit: number;
  narration: string | null;
  account_name?: string;
  account_type?: string;
}

export interface JournalEntry {
  journal_id: number;
  client_id: number;
  entry_date: string;
  reference: string;
  description: string;
  created_at: string;
  lines: JournalLine[];
}

export interface GeneralLedgerLine {
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

export interface GeneralLedgerAccount {
  account_id: number;
  account_code?: string;
  account_name: string;
  account_type: "asset" | "liability" | "equity" | "revenue" | "expense";
  current_balance: number;
  lines: GeneralLedgerLine[];
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

export interface ComplianceSummary {
  overdue: number;
  urgent: number;
  upcoming: number;
}

export interface TrialBalanceRow {
  account_id: number;
  account_name: string;
  account_type: "asset" | "liability" | "equity" | "revenue" | "expense";
  debit: number;
  credit: number;
}

export interface TrialBalanceResult {
  asOfDate: string;
  rows: TrialBalanceRow[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
}

export interface IncomeStatementLine {
  account_id: number;
  account_name: string;
  amount: number;
}

export interface IncomeStatementResult {
  startDate: string;
  endDate: string;
  revenues: IncomeStatementLine[];
  expenses: IncomeStatementLine[];
  totalRevenues: number;
  totalExpenses: number;
  netIncome: number;
}

export interface BalanceSheetLine {
  account_id: number;
  account_name: string;
  balance: number;
}

export interface BalanceSheetResult {
  asOfDate: string;
  assets: BalanceSheetLine[];
  liabilities: BalanceSheetLine[];
  equity: BalanceSheetLine[];
  retainedEarnings: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  isBalanced: boolean;
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

export interface AppNotification {
  notification_id: number;
  user_id: number;
  message: string;
  type: "reminder" | "alert" | "info";
  is_read: number;
  sent_at: string;
  link?: string;
}

export interface Message {
  message_id: number;
  client_id: number;
  sender_id: number;
  sender_role: "bookkeeper" | "client";
  subject?: string;
  body: string;
  is_read: number;
  sent_at: string;
}

export interface MessageThread {
  client_id: number;
  business_name: string;
  latest: Message;
  unreadCount: number;
}

export interface AuditLog {
  log_id: number;
  user_id: number;
  action: string;
  table_name: string;
  record_id: number;
  timestamp: string;
  user_name?: string;
}

export interface ClientDocument {
  document_id: number;
  client_id: number;
  document_type: string;
  label: string;
  file_name: string;
  original_name: string;
  file_size: string;
  mime_type: string;
  uploaded_by: number;
  uploaded_by_role: "bookkeeper" | "client";
  uploaded_at: string;
  notes?: string;
}

export interface ClientInvite {
  invite_id: number;
  code: string;
  created_by: number;
  status: "pending" | "used" | "revoked";
  label?: string;
  used_by_client_id?: number;
  created_at: string;
  used_at?: string;
  expires_at: string;
  is_expired?: boolean;
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

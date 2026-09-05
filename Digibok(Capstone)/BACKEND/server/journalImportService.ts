import * as XLSX from "xlsx";
import { Account } from "./db";

export const IMPORT_TEMPLATE_HEADERS = ["Date", "Account Name", "Debit", "Credit", "Narration/Description"] as const;

// Builds the standardized .xlsx template a bookkeeper downloads and fills in — one sheet
// with the required headers + a worked example, plus a reference sheet listing this
// client's exact Chart of Accounts names, since "Account Name" must match one exactly.
export function buildImportTemplate(accounts: Account[]): Buffer {
  const wb = XLSX.utils.book_new();

  const exampleRows = [
    [...IMPORT_TEMPLATE_HEADERS],
    ["2026-09-01", accounts[0]?.account_name || "Cash on Hand", 5000, "", "Example: cash sale of goods"],
    ["2026-09-01", accounts.find((a) => a.account_type === "revenue")?.account_name || "Sales Revenue", "", 5000, "Example: cash sale of goods"],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(exampleRows);
  sheet["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, sheet, "Journal Import");

  const referenceRows = [["Valid Account Names (Chart of Accounts)"], ...accounts.map((a) => [`${a.account_code ? a.account_code + " — " : ""}${a.account_name}`])];
  const refSheet = XLSX.utils.aoa_to_sheet(referenceRows);
  refSheet["!cols"] = [{ wch: 40 }];
  XLSX.utils.book_append_sheet(wb, refSheet, "Chart of Accounts");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export interface ImportRowResult {
  rowNumber: number; // 1-based, matching the Excel row (including header) for easy lookup
  date: string;
  accountNameRaw: string;
  accountId: number | null;
  debit: number;
  credit: number;
  narration: string;
  errors: string[];
}

export interface ImportGroupResult {
  date: string;
  rows: ImportRowResult[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

export interface ImportValidationResult {
  rows: ImportRowResult[];
  groups: ImportGroupResult[];
  fileTotalDebit: number;
  fileTotalCredit: number;
  isFileBalanced: boolean;
  hasErrors: boolean;
  rowCount: number;
}

// Parses the uploaded workbook and validates every row against this client's real Chart
// of Accounts — shared by both the dry-run preview and the confirm step (confirm re-parses
// the same file from scratch rather than trusting a client-submitted JSON blob, so nothing
// server-side ever has to take "this was already validated" on faith).
export function parseAndValidateImport(buffer: Buffer, accounts: Account[]): ImportValidationResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const firstSheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheetName];
  const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" });

  // First row is the header — data starts at row 2 in spreadsheet terms.
  const dataRows = raw.slice(1);

  const accountsByName = new Map<string, Account>();
  for (const a of accounts) {
    accountsByName.set(a.account_name.trim().toLowerCase(), a);
  }

  const rows: ImportRowResult[] = dataRows.map((cells, idx) => {
    const rowNumber = idx + 2;
    const [dateRaw, accountNameRaw, debitRaw, creditRaw, narrationRaw] = cells;
    const errors: string[] = [];

    const date = String(dateRaw ?? "").trim();
    const accountNameStr = String(accountNameRaw ?? "").trim();
    const narration = String(narrationRaw ?? "").trim();
    const debit = Number(debitRaw) || 0;
    const credit = Number(creditRaw) || 0;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) {
      errors.push("Date must be in YYYY-MM-DD format.");
    }

    const matchedAccount = accountNameStr ? accountsByName.get(accountNameStr.toLowerCase()) : undefined;
    if (!accountNameStr) {
      errors.push("Account name is required.");
    } else if (!matchedAccount) {
      errors.push(`Account name unrecognized. Please map to a valid account (e.g. "Cash on Hand" or "Cash in Bank", not "Cash").`);
    }

    if (debit < 0 || credit < 0) {
      errors.push("Debit/Credit amounts cannot be negative.");
    } else if (debit > 0 && credit > 0) {
      errors.push("A single line cannot have both a Debit and a Credit amount.");
    } else if (debit === 0 && credit === 0) {
      errors.push("Each line needs either a Debit or a Credit amount.");
    }

    if (!narration) {
      errors.push("Narration/Description is required for every line.");
    }

    return {
      rowNumber,
      date,
      accountNameRaw: accountNameStr,
      accountId: matchedAccount ? matchedAccount.account_id : null,
      debit,
      credit,
      narration,
      errors,
    };
  });

  // Consecutive rows sharing the same date are treated as one compound journal entry —
  // each such group must independently balance (this mirrors exactly what a manually
  // posted multi-line entry requires), on top of the whole-file total the UI also shows.
  const groups: ImportGroupResult[] = [];
  for (const row of rows) {
    let group = groups.find((g) => g.date === row.date);
    if (!group) {
      group = { date: row.date, rows: [], totalDebit: 0, totalCredit: 0, isBalanced: false };
      groups.push(group);
    }
    group.rows.push(row);
    group.totalDebit += row.debit;
    group.totalCredit += row.credit;
  }
  for (const g of groups) {
    g.isBalanced = Math.abs(g.totalDebit - g.totalCredit) < 0.01;
  }

  const fileTotalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const fileTotalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const isFileBalanced = Math.abs(fileTotalDebit - fileTotalCredit) < 0.01;

  const hasRowErrors = rows.some((r) => r.errors.length > 0);
  const hasGroupImbalance = groups.some((g) => !g.isBalanced);

  return {
    rows,
    groups,
    fileTotalDebit,
    fileTotalCredit,
    isFileBalanced,
    hasErrors: rows.length === 0 || hasRowErrors || hasGroupImbalance,
    rowCount: rows.length,
  };
}

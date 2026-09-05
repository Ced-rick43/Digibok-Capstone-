import { dbInstance, Account, GeneralLedgerEntry } from "./db";

export interface TrialBalanceRow {
  account_id: number;
  account_name: string;
  account_type: Account["account_type"];
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

function isDebitIncrease(accountType: Account["account_type"]): boolean {
  return accountType === "asset" || accountType === "expense";
}

function signedDelta(accountType: Account["account_type"], line: { debit: number; credit: number }): number {
  return isDebitIncrease(accountType) ? line.debit - line.credit : line.credit - line.debit;
}

function groupLedgerByAccount(ledger: GeneralLedgerEntry[]): Map<number, GeneralLedgerEntry[]> {
  const map = new Map<number, GeneralLedgerEntry[]>();
  ledger.forEach((line) => {
    const existing = map.get(line.account_id);
    if (existing) existing.push(line);
    else map.set(line.account_id, [line]);
  });
  return map;
}

// Reconstructs an account's balance as of a given date. Since seeded/legacy accounts
// may carry a starting balance with no corresponding ledger rows, the opening balance
// is derived (current balance minus all known ledger deltas) rather than assumed zero.
export function balanceAsOf(account: Account, ledgerRowsForAccount: GeneralLedgerEntry[], asOfDate: string): number {
  const openingBalance = account.balance - ledgerRowsForAccount.reduce((sum, l) => sum + signedDelta(account.account_type, l), 0);
  const deltaThroughDate = ledgerRowsForAccount
    .filter((l) => l.entry_date <= asOfDate)
    .reduce((sum, l) => sum + signedDelta(account.account_type, l), 0);
  return openingBalance + deltaThroughDate;
}

export async function getTrialBalance(clientId: number, asOfDate: string): Promise<TrialBalanceResult> {
  const [accounts, ledger] = await Promise.all([dbInstance.getAccounts(clientId), dbInstance.getGeneralLedger(clientId)]);
  const ledgerByAccount = groupLedgerByAccount(ledger);

  let totalDebits = 0;
  let totalCredits = 0;

  const rows: TrialBalanceRow[] = accounts.map((account) => {
    const balance = balanceAsOf(account, ledgerByAccount.get(account.account_id) || [], asOfDate);
    const normalIsDebit = isDebitIncrease(account.account_type);
    const debit = normalIsDebit ? Math.max(balance, 0) : Math.max(-balance, 0);
    const credit = normalIsDebit ? Math.max(-balance, 0) : Math.max(balance, 0);

    totalDebits += debit;
    totalCredits += credit;

    return {
      account_id: account.account_id,
      account_name: account.account_name,
      account_type: account.account_type,
      debit,
      credit,
    };
  });

  return {
    asOfDate,
    rows,
    totalDebits,
    totalCredits,
    isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
  };
}

export async function getIncomeStatement(clientId: number, startDate: string, endDate: string): Promise<IncomeStatementResult> {
  const [accounts, allLedger] = await Promise.all([dbInstance.getAccounts(clientId), dbInstance.getGeneralLedger(clientId)]);
  const ledger = allLedger.filter((l) => l.entry_date >= startDate && l.entry_date <= endDate);
  const ledgerByAccount = groupLedgerByAccount(ledger);

  const buildLines = (accountType: "revenue" | "expense"): IncomeStatementLine[] =>
    accounts
      .filter((a) => a.account_type === accountType)
      .map((account) => {
        const rows = ledgerByAccount.get(account.account_id) || [];
        const amount = rows.reduce((sum, l) => sum + signedDelta(account.account_type, l), 0);
        return { account_id: account.account_id, account_name: account.account_name, amount };
      });

  const revenues = buildLines("revenue");
  const expenses = buildLines("expense");
  const totalRevenues = revenues.reduce((s, l) => s + l.amount, 0);
  const totalExpenses = expenses.reduce((s, l) => s + l.amount, 0);

  return {
    startDate,
    endDate,
    revenues,
    expenses,
    totalRevenues,
    totalExpenses,
    netIncome: totalRevenues - totalExpenses,
  };
}

export async function getBalanceSheet(clientId: number, asOfDate: string): Promise<BalanceSheetResult> {
  const [accounts, ledger] = await Promise.all([dbInstance.getAccounts(clientId), dbInstance.getGeneralLedger(clientId)]);
  const ledgerByAccount = groupLedgerByAccount(ledger);

  const buildLines = (accountType: Account["account_type"]): BalanceSheetLine[] =>
    accounts
      .filter((a) => a.account_type === accountType)
      .map((account) => ({
        account_id: account.account_id,
        account_name: account.account_name,
        balance: balanceAsOf(account, ledgerByAccount.get(account.account_id) || [], asOfDate),
      }));

  const assets = buildLines("asset");
  const liabilities = buildLines("liability");
  const equity = buildLines("equity");

  // Retained Earnings = accumulated net income since inception, as of asOfDate — not scoped
  // to any particular reporting period — so the balance sheet always balances regardless of
  // which period the user is otherwise viewing (this system never runs closing entries).
  const retainedEarnings = accounts
    .filter((a) => a.account_type === "revenue" || a.account_type === "expense")
    .reduce((sum, account) => {
      const rows = ledgerByAccount.get(account.account_id) || [];
      const asOfBalance = balanceAsOf(account, rows, asOfDate);
      return sum + (account.account_type === "revenue" ? asOfBalance : -asOfBalance);
    }, 0);

  const totalAssets = assets.reduce((s, l) => s + l.balance, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.balance, 0);
  const totalEquity = equity.reduce((s, l) => s + l.balance, 0) + retainedEarnings;

  return {
    asOfDate,
    assets,
    liabilities,
    equity,
    retainedEarnings,
    totalAssets,
    totalLiabilities,
    totalEquity,
    isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
  };
}

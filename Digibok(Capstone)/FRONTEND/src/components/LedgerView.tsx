import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  Trash2,
  Scale,
  ChevronDown,
  ChevronUp,
  Bookmark,
  CheckCircle,
  Pencil,
  Check,
  X,
  Lock,
  Settings2,
  Info,
  Printer,
  Search,
  FileSpreadsheet
} from "lucide-react";
import { User, ClientProfile, Account, JournalEntry, GeneralLedgerAccount, JournalLine } from "../types";
import { money } from "../lib/currency";
import SuccessBurst from "./SuccessBurst";
import BatchImportModal from "./BatchImportModal";

interface LedgerViewProps {
  user: User;
  token: string | null;
  refreshTrigger: number;
  onRefreshDashboard: () => void;
}

interface NewLineForm {
  account_id: string;
  debit: number;
  credit: number;
  narration: string;
}

export default function LedgerView({ user, token, refreshTrigger, onRefreshDashboard }: LedgerViewProps) {
  const [activeTab, setActiveTab] = useState<"journal" | "ledger">("journal");
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<GeneralLedgerAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // New/Edit Journal Entry Form modal (same dialog serves both — editingJournalId
  // is set when editing an existing posted entry instead of creating a new one)
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [editingJournalId, setEditingJournalId] = useState<number | null>(null);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
  const [entryDescription, setEntryDescription] = useState("");
  const [entryClientId, setEntryClientId] = useState("");
  const [availableAccounts, setAvailableAccounts] = useState<Account[]>([]);

  // Custom double entry items rows
  const [lines, setLines] = useState<NewLineForm[]>([
    { account_id: "", debit: 0, credit: 0, narration: "" },
    { account_id: "", debit: 0, credit: 0, narration: "" },
  ]);

  const [modalError, setModalError] = useState("");
  const [modalSuccess, setModalSuccess] = useState("");
  // Guards against a double-click posting the same entry twice — the submit button
  // disables the instant a submit starts, not just after the response comes back.
  const [isSubmitting, setIsSubmitting] = useState(false);
  // A balanced entry landing in the ledger is the real "end of transaction" moment —
  // separate from modalSuccess (which stays inside the still-open modal).
  const [burstMessage, setBurstMessage] = useState<string | null>(null);

  // Manage Chart of Accounts panel (add new accounts, rename/retype existing ones),
  // opened from inside the journal entry modal since that's where the account picker lives.
  const [showManageAccounts, setShowManageAccounts] = useState(false);
  const [newAcctCode, setNewAcctCode] = useState("");
  const [newAcctName, setNewAcctName] = useState("");
  const [newAcctType, setNewAcctType] = useState<Account["account_type"]>("asset");
  const [newAcctBalance, setNewAcctBalance] = useState("");
  const [addingAccount, setAddingAccount] = useState(false);
  const [manageError, setManageError] = useState("");
  const [editingAcctId, setEditingAcctId] = useState<number | null>(null);
  const [editAcctCode, setEditAcctCode] = useState("");
  const [editAcctName, setEditAcctName] = useState("");
  const [editAcctType, setEditAcctType] = useState<Account["account_type"]>("asset");
  const [editAcctBalance, setEditAcctBalance] = useState("0");
  const [savingAcctEdit, setSavingAcctEdit] = useState(false);

  const ACCOUNT_TYPES: Account["account_type"][] = ["asset", "liability", "equity", "revenue", "expense"];
  const ACCOUNT_TYPE_LABELS: Record<Account["account_type"], string> = {
    asset: "Assets",
    liability: "Liabilities",
    equity: "Equity",
    revenue: "Revenue",
    expense: "Expenses",
  };
  // One accent per account type, used consistently for that type's section header and
  // every account's balance figure within it — Assets/Liabilities/Revenue/Expenses reuse
  // the same green/orange/blue/red already used everywhere else in the app; Equity gets
  // cyan (rather than purple) now that purple is the app's general brand/chrome color —
  // reusing purple here would make Equity blend into buttons/nav instead of standing out.
  const ACCOUNT_TYPE_COLORS: Record<Account["account_type"], { text: string; bg: string; border: string }> = {
    asset: { text: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/30" },
    liability: { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
    equity: { text: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/30" },
    revenue: { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30" },
    expense: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" },
  };
  // Standard accounting-equation order (Assets = Liabilities + Equity, then the
  // income-statement types) so a bookkeeper scans the same order every time.
  const groupAccountsByType = (accounts: Account[]) =>
    ACCOUNT_TYPES.map((t) => ({ type: t, label: ACCOUNT_TYPE_LABELS[t], accounts: accounts.filter((a) => a.account_type === t) })).filter(
      (g) => g.accounts.length > 0
    );

  // Ledger tab: search/filter over the account list, plus a period filter that narrows
  // which posted lines show inside an expanded account's drill-down (the account's own
  // Standing Balance stays all-time regardless — only the transaction history view narrows).
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<"all" | Account["account_type"]>("all");
  const [ledgerPeriod, setLedgerPeriod] = useState<"all" | "today" | "month" | "quarter" | "year">("all");

  const isWithinLedgerPeriod = (dateStr: string): boolean => {
    if (ledgerPeriod === "all") return true;
    const d = new Date(dateStr);
    const now = new Date();
    if (ledgerPeriod === "today") return d.toDateString() === now.toDateString();
    if (ledgerPeriod === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    if (ledgerPeriod === "quarter") return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3);
    return d.getFullYear() === now.getFullYear(); // "year"
  };

  const isBookkeeper = user.role === "bookkeeper";

  // Accordion state to toggle account cards
  const [expandedAccounts, setExpandedAccounts] = useState<Record<number, boolean>>({});

  const toggleAccount = (id: number) => {
    setExpandedAccounts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Same idea, one level up — which account-type groups are open in the Manage
  // Chart of Accounts panel. Collapsed by default so a long chart of accounts doesn't
  // dump every account on screen at once; click a type (e.g. "Liabilities") to reveal it.
  const [expandedManageTypes, setExpandedManageTypes] = useState<Record<string, boolean>>({});
  const toggleManageType = (type: string) => {
    setExpandedManageTypes((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const fetchClients = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/clients", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.length > 0) {
        setClients(data);
        // Default select first client
        setSelectedClientId(data[0].client_id.toString());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDataForClient = async (clientId: string) => {
    if (!token || !clientId) return;
    setLoading(true);
    try {
      // 1. Fetch journal entries
      const jRes = await fetch(`/api/journal?clientId=${clientId}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const jData = await jRes.json();

      // 2. Fetch General Ledger grouped accounts
      const lRes = await fetch(`/api/ledger?clientId=${clientId}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const lData = await lRes.json();

      if (jRes.ok && lRes.ok) {
        setJournals(jData);
        setLedgerAccounts(lData);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // When adding journal, fetch candidate accounts for dropdown. Tracks the most
  // recently requested client so a slow response for a client the user has since
  // switched away from can't silently overwrite the dropdown with the wrong client's
  // accounts (which the header's clientId still correctly reflects) — otherwise
  // submitting could post a journal entry against another client's chart of accounts.
  const latestAccountsClientId = useRef<string>("");
  const fetchAvailableAccounts = async (clientId: string) => {
    if (!token || !clientId) return;
    latestAccountsClientId.current = clientId;
    try {
      const res = await fetch(`/api/accounts?clientId=${clientId}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && latestAccountsClientId.current === clientId) {
        setAvailableAccounts(data);
        // Pre-fill line dropdowns if they are blank
        setLines((prev) =>
          prev.map((l) => ({
            ...l,
            account_id: l.account_id || (data.length > 0 ? data[0].account_id.toString() : ""),
          }))
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  // forClientId lets the Ledger tab's "Add Account" shortcut open this scoped to
  // whichever client you're currently looking at, instead of whatever client the New
  // Journal Entry modal last had selected (which may be a different one, or none yet).
  const handleOpenManageAccounts = (forClientId?: string) => {
    setManageError("");
    setNewAcctCode("");
    setNewAcctName("");
    setNewAcctType("asset");
    setNewAcctBalance("");
    setEditingAcctId(null);
    if (forClientId) {
      setEntryClientId(forClientId);
      fetchAvailableAccounts(forClientId);
    }
    setShowManageAccounts(true);
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !entryClientId || !newAcctName.trim()) return;
    setAddingAccount(true);
    setManageError("");
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          client_id: Number(entryClientId),
          account_code: newAcctCode.trim() || undefined,
          account_name: newAcctName.trim(),
          account_type: newAcctType,
          balance: Number(newAcctBalance) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to add account");
      setNewAcctCode("");
      setNewAcctName("");
      setNewAcctBalance("");
      await fetchAvailableAccounts(entryClientId);
    } catch (err: any) {
      setManageError(err.message);
    } finally {
      setAddingAccount(false);
    }
  };

  const handleStartEditAccount = (acct: Account) => {
    setEditingAcctId(acct.account_id);
    setEditAcctCode(acct.account_code || "");
    setEditAcctName(acct.account_name);
    setEditAcctType(acct.account_type);
    setEditAcctBalance(acct.balance.toString());
    setManageError("");
  };

  const handleSaveEditAccount = async (accountId: number) => {
    if (!token || !editAcctName.trim()) return;
    setSavingAcctEdit(true);
    setManageError("");
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          account_name: editAcctName.trim(),
          account_type: editAcctType,
          account_code: editAcctCode.trim(),
          balance: Number(editAcctBalance) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update account");
      setEditingAcctId(null);
      await fetchAvailableAccounts(entryClientId);
    } catch (err: any) {
      setManageError(err.message);
    } finally {
      setSavingAcctEdit(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [token]);

  useEffect(() => {
    if (selectedClientId) {
      fetchDataForClient(selectedClientId);
    }
  }, [selectedClientId, token, refreshTrigger]);

  useEffect(() => {
    if (entryClientId) {
      fetchAvailableAccounts(entryClientId);
    }
  }, [entryClientId, token]);

  const handleOpenAddJournalModal = () => {
    setModalError("");
    setModalSuccess("");
    setEditingJournalId(null);
    if (clients.length > 0) {
      const defaultClientId = clients[0].client_id.toString();
      setEntryClientId(defaultClientId);
      fetchAvailableAccounts(defaultClientId);
    }
    setLines([
      { account_id: "", debit: 0, credit: 0, narration: "" },
      { account_id: "", debit: 0, credit: 0, narration: "" },
    ]);
    setEntryDescription("");
    setEntryDate(new Date().toISOString().split("T")[0]);
    setShowAddModal(true);
  };

  const handleOpenEditJournalModal = (journal: JournalEntry) => {
    setModalError("");
    setModalSuccess("");
    setEditingJournalId(journal.journal_id);
    setEntryClientId(journal.client_id.toString());
    fetchAvailableAccounts(journal.client_id.toString());
    setLines(
      journal.lines.map((l) => ({
        account_id: l.account_id.toString(),
        debit: l.debit,
        credit: l.credit,
        narration: l.narration || "",
      }))
    );
    setEntryDescription(journal.description);
    setEntryDate(journal.entry_date);
    setShowAddModal(true);
  };

  // The General Ledger tab shows individual posted lines grouped by account, but each
  // line only carries a journal_id — not the full entry. Resolve back to the entry
  // (already in `journals` from the Journal tab's own fetch) so the same edit/delete
  // actions available there also work directly from a ledger line.
  const findJournalForLedgerLine = (journalId: number) => journals.find((j) => j.journal_id === journalId) || null;

  const selectedClientName = clients.find((c) => c.client_id.toString() === selectedClientId)?.business_name || "Client";

  // Lines are stored/returned in whatever order they were entered in, which isn't
  // necessarily debit-first — a bookkeeper (or older seed data) may well have typed the
  // credit line first. Standard journal convention always reads debit line(s) first,
  // then "To ..." credit line(s), so every display of an entry's lines sorts through
  // this rather than trusting raw insertion order. Stable sort — same-side lines keep
  // their original relative order.
  const sortLinesDebitFirst = (lines: JournalLine[]) => [...lines].sort((a, b) => (a.credit > 0 ? 1 : 0) - (b.credit > 0 ? 1 : 0));

  // Free-text fields (business/account names, descriptions) get interpolated straight
  // into document.write() below — escape them so a stray "<" or "&" in someone's typed
  // description can't break the printed page's markup.
  const escapeHtml = (value: string) =>
    String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));

  const JOURNAL_PRINT_STYLES = `
    body { font-family: Georgia, 'Times New Roman', serif; padding: 40px; color: #221C13; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .meta { font-size: 12px; color: #6E6455; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    th { text-align: left; border-bottom: 2px solid #221C13; padding: 5px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #221C13; }
    th.num, td.num { text-align: right; }
    td { padding: 3px 8px; vertical-align: top; }
    td.date-cell { white-space: nowrap; padding-top: 6px; border-top: 1px solid #ccc; font-weight: bold; }
    tr.first-line td:not(.date-cell) { border-top: 1px solid #ccc; padding-top: 6px; }
    td.debit-account { font-weight: bold; }
    td.credit-account { padding-left: 28px; color: #333; }
    .num { font-family: 'Courier New', monospace; }
    td.narration { font-style: italic; color: #6E6455; font-size: 11.5px; padding-bottom: 10px; }
    .line-narration { font-style: italic; font-weight: normal; color: #6E6455; font-size: 10.5px; }
    tfoot td { border-top: 2px solid #221C13; font-weight: bold; padding-top: 5px; }
    .note { font-size: 11px; color: #6E6455; margin-top: 16px; }
  `;

  // One entry's rows in the classic "General Journal" textbook layout — Date shown once
  // per entry (merged down the entry's full height), debit accounts flush left, credit
  // accounts prefixed "To" and indented, closed with a "(Being ...)" narration line.
  // Shared by the "print whole journal" and "print this one entry" actions so a single
  // entry looks identical whichever way it's printed.
  const buildJournalEntryRows = (j: JournalEntry): string => {
    const lineRows = sortLinesDebitFirst(j.lines)
      .map(
        (l, idx) => `
          <tr class="${idx === 0 ? "first-line" : ""}">
            ${idx === 0 ? `<td class="date-cell" rowspan="${j.lines.length + 1}">${j.entry_date}</td>` : ""}
            <td class="${l.credit > 0 ? "credit-account" : "debit-account"}">${l.credit > 0 ? "To " : ""}${escapeHtml(l.account_name)} A/c${l.narration ? `<div class="line-narration">${escapeHtml(l.narration)}</div>` : ""}</td>
            <td class="num">${l.debit > 0 ? Number(l.debit).toLocaleString("en-US", { minimumFractionDigits: 2 }) : ""}</td>
            <td class="num">${l.credit > 0 ? Number(l.credit).toLocaleString("en-US", { minimumFractionDigits: 2 }) : ""}</td>
          </tr>`
      )
      .join("");
    return `${lineRows}
      <tr>
        <td class="narration" colspan="3">(Being ${escapeHtml(j.description)})</td>
      </tr>`;
  };

  // Opens a clean, standalone print view — not window.print() on the app itself, which
  // would print the dark sidebar/modal chrome — so what comes out is a plain,
  // professional black-on-white page a client could actually file, matching the same
  // pattern SecurityView uses for backup codes.
  const openJournalPrintWindow = (title: string, metaLine: string, rowsHtml: string, totalsHtml: string) => {
    const printWindow = window.open("", "_blank", "width=800,height=900");
    if (!printWindow) return;
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(title)}</title>
          <meta charset="utf-8" />
          <style>${JOURNAL_PRINT_STYLES}</style>
        </head>
        <body>
          <h1>DigiBok — General Journal</h1>
          <div class="meta">${metaLine}</div>
          <table>
            <thead><tr><th>Date</th><th>Particulars</th><th class="num">Debit (₱)</th><th class="num">Credit (₱)</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
            ${totalsHtml}
          </table>
          <div class="note">Double-entry journal — debit accounts listed flush left, credit accounts prefixed "To" and indented, per entry.</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handlePrintJournal = () => {
    const generatedAt = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
    const rowsHtml =
      journals.length === 0
        ? `<tr><td colspan="4">No posted journal entries for this client.</td></tr>`
        : journals.map(buildJournalEntryRows).join("");
    const grandTotal = journals.reduce((s, j) => s + j.lines.reduce((s2, l) => s2 + l.debit, 0), 0);
    const totalsHtml =
      journals.length === 0
        ? ""
        : `<tfoot><tr><td colspan="2">Total</td><td class="num">${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td><td class="num">${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td></tr></tfoot>`;
    openJournalPrintWindow(
      `DigiBok General Journal — ${selectedClientName}`,
      `Business: ${escapeHtml(selectedClientName)}<br />Generated: ${generatedAt} · ${journals.length} entr${journals.length === 1 ? "y" : "ies"}`,
      rowsHtml,
      totalsHtml
    );
  };

  const handlePrintSingleEntry = (journal: JournalEntry) => {
    const generatedAt = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
    openJournalPrintWindow(
      `DigiBok Journal Entry ${journal.reference} — ${selectedClientName}`,
      `Business: ${escapeHtml(selectedClientName)}<br />Generated: ${generatedAt} · Reference: ${escapeHtml(journal.reference)}`,
      buildJournalEntryRows(journal),
      ""
    );
  };

  const LEDGER_PRINT_STYLES = `
    body { font-family: Georgia, 'Times New Roman', serif; padding: 40px; color: #221C13; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .meta { font-size: 12px; color: #6E6455; margin-bottom: 24px; }
    .group { margin-bottom: 26px; }
    .group-head { display: flex; justify-content: space-between; font-weight: bold; text-transform: uppercase; letter-spacing: 0.03em; font-size: 12px; border-bottom: 2px solid #221C13; padding-bottom: 4px; margin-bottom: 10px; }
    .account { margin-bottom: 16px; page-break-inside: avoid; }
    .account-head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #999; padding-bottom: 3px; margin-bottom: 4px; }
    .account-head .acct-name { font-weight: bold; }
    .account-head .acct-balance { font-family: 'Courier New', monospace; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { text-align: left; border-bottom: 1px solid #ccc; padding: 3px 5px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.03em; color: #6E6455; }
    td { padding: 2.5px 5px; }
    .num { text-align: right; font-family: 'Courier New', monospace; }
    .empty { color: #999; font-style: italic; text-align: center; padding: 6px; }
  `;

  // One account's ledger card — shared by the "print whole ledger" and "print this one
  // account" actions.
  const buildAccountHtml = (acct: GeneralLedgerAccount): string => {
    const rowsHtml =
      acct.lines.length > 0
        ? acct.lines
            .map((l) => {
              const sourceJournal = findJournalForLedgerLine(l.journal_id);
              return `
                <tr>
                  <td>${l.entry_date}</td>
                  <td>${sourceJournal ? escapeHtml(sourceJournal.reference) : "—"}</td>
                  <td>${escapeHtml(l.description)}</td>
                  <td class="num">${l.debit > 0 ? Number(l.debit).toLocaleString("en-US", { minimumFractionDigits: 2 }) : ""}</td>
                  <td class="num">${l.credit > 0 ? Number(l.credit).toLocaleString("en-US", { minimumFractionDigits: 2 }) : ""}</td>
                  <td class="num">${Number(l.balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                </tr>`;
            })
            .join("")
        : `<tr><td colspan="6" class="empty">No transactions posted.</td></tr>`;
    return `
      <div class="account">
        <div class="account-head">
          <span class="acct-name">${acct.account_code ? escapeHtml(acct.account_code) + " — " : ""}${escapeHtml(acct.account_name)}</span>
          <span class="acct-balance">₱${Number(acct.current_balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
        </div>
        <table>
          <thead><tr><th>Date</th><th>Ref</th><th>Description</th><th class="num">Debit (₱)</th><th class="num">Credit (₱)</th><th class="num">Balance (₱)</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;
  };

  const openLedgerPrintWindow = (title: string, metaLine: string, bodyHtml: string) => {
    const printWindow = window.open("", "_blank", "width=800,height=900");
    if (!printWindow) return;
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(title)}</title>
          <meta charset="utf-8" />
          <style>${LEDGER_PRINT_STYLES}</style>
        </head>
        <body>
          <h1>DigiBok — General Ledger</h1>
          <div class="meta">${metaLine}</div>
          ${bodyHtml}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  // Grouped by account type with subtotals, matching how the on-screen tab reads.
  const handlePrintLedger = () => {
    const generatedAt = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
    const groupsHtml = ACCOUNT_TYPES.map((type) => {
      const group = ledgerAccounts.filter((a) => a.account_type === type);
      if (group.length === 0) return "";
      const groupTotal = group.reduce((s, a) => s + a.current_balance, 0);
      return `
        <div class="group">
          <div class="group-head"><span>${ACCOUNT_TYPE_LABELS[type]}</span><span>₱${groupTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></div>
          ${group.map(buildAccountHtml).join("")}
        </div>`;
    }).join("");

    openLedgerPrintWindow(
      `DigiBok General Ledger — ${selectedClientName}`,
      `Business: ${escapeHtml(selectedClientName)}<br />As of: ${generatedAt}`,
      ledgerAccounts.length === 0 ? "<p>No chart of accounts registered for this client.</p>" : groupsHtml
    );
  };

  const handlePrintAccount = (acct: GeneralLedgerAccount) => {
    const generatedAt = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
    openLedgerPrintWindow(
      `DigiBok Ledger — ${acct.account_name} — ${selectedClientName}`,
      `Business: ${escapeHtml(selectedClientName)}<br />As of: ${generatedAt}`,
      buildAccountHtml(acct)
    );
  };

  const handleAddLineRow = () => {
    const firstAcctId = availableAccounts.length > 0 ? availableAccounts[0].account_id.toString() : "";
    setLines([...lines, { account_id: firstAcctId, debit: 0, credit: 0, narration: "" }]);
  };

  const handleRemoveLineRow = (index: number) => {
    if (lines.length <= 2) {
      setModalError("Double entry accounting requires at least two lines.");
      return;
    }
    const newLines = [...lines];
    newLines.splice(index, 1);
    setLines(newLines);
  };

  const handleLineChange = (index: number, field: keyof NewLineForm, value: string | number) => {
    const newLines = [...lines];
    if (field === "account_id") {
      newLines[index].account_id = value as string;
    } else if (field === "narration") {
      newLines[index].narration = value as string;
    } else {
      // Mutual exclusion rule: typical double entry lines possess only credit OR debit values
      const numericValue = Number(value) || 0;
      if (field === "debit") {
        newLines[index].debit = numericValue;
        if (numericValue > 0) newLines[index].credit = 0;
      } else if (field === "credit") {
        newLines[index].credit = numericValue;
        if (numericValue > 0) newLines[index].debit = 0;
      }
    }
    setLines(newLines);
  };

  // Perform professional accounting double entry balancer validations
  const totalDebits = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredits = lines.reduce((s, l) => s + l.credit, 0);
  const discrepancy = Math.abs(totalDebits - totalCredits);
  const isBalanced = discrepancy <= 0.01 && totalDebits > 0;

  // Ledger tab totals footer — always computed from the full, unfiltered chart of
  // accounts (never the search/type-filtered subset currently on screen), since the
  // accounting equation is a property of the whole client's books, not of whatever
  // slice happens to be visible right now.
  const totalAssets = ledgerAccounts.filter((a) => a.account_type === "asset").reduce((s, a) => s + a.current_balance, 0);
  const totalLiabilities = ledgerAccounts.filter((a) => a.account_type === "liability").reduce((s, a) => s + a.current_balance, 0);
  const totalEquity = ledgerAccounts.filter((a) => a.account_type === "equity").reduce((s, a) => s + a.current_balance, 0);
  const isLedgerBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01;

  const handlePostJournalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError("");
    setModalSuccess("");

    if (isSubmitting) return;

    if (!entryClientId || !entryDate || !entryDescription) {
      setModalError("Please populate all required header fields.");
      return;
    }

    if (!isBalanced) {
      setModalError(`Strict balancing error: Total debits must equal credits. Out of balance by: ${money(discrepancy)}`);
      return;
    }

    // Verify all lines have account designations assigned
    const missingAcct = lines.some((l) => !l.account_id);
    if (missingAcct) {
      setModalError("Please ensure an account designation is selected for every row.");
      return;
    }

    const missingNarration = lines.some((l) => !l.narration.trim());
    if (missingNarration) {
      setModalError("Please add a narration for every line (e.g. \"payment of rent\").");
      return;
    }

    const isEditing = editingJournalId !== null;
    const confirmed = window.confirm(
      isEditing
        ? "Save these changes to the posted entry? This will recalculate account balances and the general ledger."
        : "Are you sure you want to post this journal entry?"
    );
    if (!confirmed) return;

    const payloadLines = lines.map((l) => ({
      account_id: Number(l.account_id),
      debit: l.debit,
      credit: l.credit,
      narration: l.narration.trim(),
    }));

    setIsSubmitting(true);
    try {
      const res = await fetch(isEditing ? `/api/journal/${editingJournalId}` : "/api/journal", {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          client_id: Number(entryClientId),
          entry_date: entryDate,
          description: entryDescription,
          lines: payloadLines,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `Failed ${isEditing ? "editing" : "posting"} journal entry`);

      setBurstMessage(isEditing ? `Entry ${data.reference} updated!` : `Entry ${data.reference} posted!`);
      setModalSuccess(
        isEditing
          ? `Success! Entry ${data.reference} updated. Account balances and the general ledger were recalculated.`
          : `Success! Posted entry Reference: ${data.reference}. Ledger balances auto updated.`
      );
      setTimeout(() => {
        setShowAddModal(false);
        setEditingJournalId(null);
        setIsSubmitting(false);
        onRefreshDashboard();
        fetchDataForClient(selectedClientId || entryClientId);
        setSelectedClientId(entryClientId);
      }, 2000);
    } catch (err: any) {
      setModalError(err.message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">

      <SuccessBurst show={!!burstMessage} message={burstMessage || ""} onDone={() => setBurstMessage(null)} />

      {/* Plain-language explainer — "journal" and "ledger" are accounting terms, not
          everyone reading this screen is an accountant. */}
      <div className="p-3 bg-white/10 border border-white/10 rounded-lg flex items-start gap-2 text-sm text-gray-300">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-400" />
        <span>
          Every transaction is recorded twice ("double-entry"): once as money leaving an account (debit) and once as money arriving in another (credit) — this is what keeps the books balanced. The <strong>Journal</strong> is the log of transactions as you enter them; the <strong>General Ledger</strong> groups those same entries by account so you can see each account's running balance over time.
        </span>
      </div>

      {/* Control row with tabs and client selectors */}
      <div className="p-3 bg-black/40 backdrop-blur-md rounded-lg border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">

        {/* Subtabs selectors */}
        <div className="flex bg-black/30 p-0.5 rounded-lg border border-white/10 self-start shrink-0">
          <button
            onClick={() => setActiveTab("journal")}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold focus:outline-none transition-all ${
              activeTab === "journal"
                ? "bg-purple-600 text-white font-extrabold"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Journal Entries Log
          </button>
          <button
            onClick={() => setActiveTab("ledger")}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold focus:outline-none transition-all ${
              activeTab === "ledger"
                ? "bg-purple-600 text-white font-extrabold"
                : "text-gray-400 hover:text-white"
            }`}
          >
            General Ledger Profiles
          </button>
        </div>

        {/* Client Selector dropdown */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 w-full sm:w-auto justify-end">
          <label className="text-xs font-bold font-tabular uppercase text-gray-400">Business Client:</label>
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="px-2.5 py-1.5 text-sm bg-black/30 border border-white/10 hover:border-white/30 focus:bg-black/20 rounded-md focus:outline-none text-white font-medium"
          >
            {clients.map((c) => (
              <option key={c.client_id} value={c.client_id}>{c.business_name}</option>
            ))}
          </select>

          <button
            onClick={activeTab === "journal" ? handlePrintJournal : handlePrintLedger}
            title={activeTab === "journal" ? "Print this client's General Journal" : "Print this client's General Ledger"}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-gray-300 bg-black/30 border border-white/10 hover:border-white/30 hover:text-white rounded-lg focus:outline-none transition-all w-full sm:w-auto justify-center"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>

          {isBookkeeper && (
            <button
              onClick={() => setShowBatchImport(true)}
              title="Import many transactions at once from an Excel file"
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-gray-300 bg-black/30 border border-white/10 hover:border-white/30 hover:text-white rounded-lg focus:outline-none transition-all w-full sm:w-auto justify-center"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Batch Upload</span>
            </button>
          )}

          {isBookkeeper && (
            <button
              onClick={handleOpenAddJournalModal}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg focus:outline-none transition-all w-full sm:w-auto justify-center"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Journal Entry</span>
            </button>
          )}
        </div>
      </div>

      {/* Primary tab loaders */}
      {loading ? (
        <div className="p-12 text-center text-sm font-semibold text-gray-400 font-tabular">
          Compiling double-entry general ledger logs...
        </div>
      ) : (
        <div className="space-y-4">

          {/* JOURNAL TAB ENTRIES LIST */}
          {activeTab === "journal" && (
            <div className="space-y-3">
              {journals.length === 0 ? (
                <div className="p-12 text-center text-sm text-gray-400 bg-black/40 backdrop-blur-md border border-white/10 rounded-lg">
                  No posted accounting journals found. Click "New Journal Entry" above to register an initial transaction.
                </div>
              ) : (
                <div className="space-y-3">
                  {journals.map((journal) => {
                    const entryTotal = journal.lines.reduce((s, l) => s + l.debit, 0);
                    return (
                      <div key={journal.journal_id} className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 transition-all hover:border-white/30">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 border-b border-white/10 gap-2">
                          <div className="flex items-center gap-2">
                            <span className="bg-purple-600 text-white font-tabular font-bold text-xs px-2 py-0.5 rounded">
                              {journal.reference}
                            </span>
                            <h4 className="font-bold text-sm text-white">{journal.description}</h4>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400 font-tabular font-medium">
                              Date Posted: <strong className="text-white">{journal.entry_date}</strong>
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handlePrintSingleEntry(journal)}
                                title={`Print entry ${journal.reference}`}
                                className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              {isBookkeeper && (
                                <button
                                  onClick={() => handleOpenEditJournalModal(journal)}
                                  title="Edit entry — mistakes are corrected, never deleted, and every change is tracked in the audit log"
                                  className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Journal row table lines — classic "General Journal" textbook format:
                            debit accounts flush left, credit accounts prefixed "To" and indented,
                            with a "(Being ...)" narration closing the entry. */}
                        <div className="overflow-x-auto pt-2.5">
                          <table className="w-full text-left text-sm border-collapse">
                            <thead>
                              <tr className="text-gray-400 font-tabular font-bold uppercase text-[14px] border-b border-white/10">
                                <th className="py-1 px-1">Particulars</th>
                                <th className="py-1 px-1 text-right font-semibold">Debit (₱)</th>
                                <th className="py-1 px-1 text-right font-semibold">Credit (₱)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10 font-tabular text-sm text-white">
                              {sortLinesDebitFirst(journal.lines).map((line, idx) => (
                                <tr key={idx} className="hover:bg-black/30">
                                  <td className={`py-1.5 px-1 ${line.credit > 0 ? "pl-6 text-gray-400" : "font-semibold text-white"}`}>
                                    {line.credit > 0 ? "To " : ""}{line.account_name} A/c
                                    {line.narration && <div className="text-xs text-gray-400 italic font-normal font-sans">{line.narration}</div>}
                                  </td>
                                  <td className="py-1.5 px-1 text-right text-white font-medium">
                                    {line.debit > 0 ? money(line.debit) : ""}
                                  </td>
                                  <td className="py-1.5 px-1 text-right text-white font-medium">
                                    {line.credit > 0 ? money(line.credit) : ""}
                                  </td>
                                </tr>
                              ))}
                              <tr>
                                <td colSpan={3} className="py-1.5 px-1 text-xs text-gray-400 italic font-sans">
                                  (Being {journal.description})
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {/* Footer audit balance status */}
                        <div className="mt-2.5 pt-2 border-t border-dashed border-white/10 flex justify-end text-xs text-gray-400 font-tabular gap-4 font-semibold uppercase">
                          <span>Total Debits / Credits:</span>
                          <strong className="text-white">{money(entryTotal)}</strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* GENERAL LEDGER TAB — grouped by account type, matching how a chart of
              accounts actually reads (Assets, then Liabilities, Equity, Revenue,
              Expenses), each section subtotaled so a bookkeeper can see e.g. total
              assets at a glance instead of scanning one flat list. */}
          {activeTab === "ledger" && (
            <div className="space-y-5">

              {/* Search / filter / period / quick actions */}
              <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    placeholder="Search accounts by name or classification..."
                    className="w-full pl-9 pr-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white placeholder:text-gray-400"
                  />
                </div>
                <select
                  value={ledgerTypeFilter}
                  onChange={(e) => setLedgerTypeFilter(e.target.value as typeof ledgerTypeFilter)}
                  className="px-2.5 py-1.5 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white shrink-0"
                >
                  <option value="all">All Types</option>
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenManageAccounts(selectedClientId)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-lg focus:outline-none transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Account
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintLedger}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-gray-300 bg-black/30 border border-white/10 hover:border-white/30 rounded-lg focus:outline-none transition-all"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Export
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("journal")}
                    className="text-sm font-bold text-purple-400 hover:text-purple-300 hover:underline focus:outline-none"
                  >
                    View Journal →
                  </button>
                </div>
              </div>

              {/* Period filter — narrows which posted lines show inside an expanded
                  account's transaction history below; each account's Standing Balance
                  above always stays the true all-time balance regardless of this. */}
              <div className="flex items-center gap-2">
                <span className="text-[14px] text-gray-400 font-tabular uppercase tracking-wide shrink-0">Show transactions:</span>
                <div className="flex bg-black/30 p-0.5 rounded-lg border border-white/10">
                  {([
                    { key: "all", label: "All Time" },
                    { key: "today", label: "Today" },
                    { key: "month", label: "This Month" },
                    { key: "quarter", label: "This Quarter" },
                    { key: "year", label: "This Year" },
                  ] as const).map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setLedgerPeriod(p.key)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold focus:outline-none transition-all ${
                        ledgerPeriod === p.key ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {ledgerAccounts.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400 bg-black/40 backdrop-blur-md border border-white/10 rounded-lg">
                  No chart accounts registered.
                </div>
              ) : (
                <>
                {ACCOUNT_TYPES.map((type) => {
                  if (ledgerTypeFilter !== "all" && ledgerTypeFilter !== type) return null;
                  const searchTerm = ledgerSearch.trim().toLowerCase();
                  const group = ledgerAccounts
                    .filter((a) => a.account_type === type)
                    .filter((a) => !searchTerm || a.account_name.toLowerCase().includes(searchTerm) || (a.account_code || "").toLowerCase().includes(searchTerm) || type.includes(searchTerm));
                  if (group.length === 0) return null;
                  const groupTotal = group.reduce((s, a) => s + a.current_balance, 0);
                  const color = ACCOUNT_TYPE_COLORS[type];
                  return (
                    <div key={type} className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className={`text-xs font-bold uppercase font-tabular tracking-wider ${color.text}`}>
                          {ACCOUNT_TYPE_LABELS[type]} <span className="text-gray-600">({group.length})</span>
                        </span>
                        <span className={`text-xs font-tabular font-bold ${color.text}`}>{money(groupTotal)}</span>
                      </div>
                      {group.map((acct) => {
                  const isExpanded = !!expandedAccounts[acct.account_id];
                  const hasLines = acct.lines && acct.lines.length > 0;
                  const visibleLines = acct.lines.filter((l) => isWithinLedgerPeriod(l.entry_date));
                  return (
                    <div key={acct.account_id} className="bg-black/40 backdrop-blur-md border border-white/10 rounded-lg overflow-hidden">

                      {/* Accordion header card — the account name/balance area toggles
                          expansion; Print is a separate sibling button (can't nest a
                          button inside a button) so it doesn't also toggle the drawer. */}
                      <div className="w-full p-3 hover:bg-black/30 transition-all flex items-center justify-between gap-4">
                        <button
                          onClick={() => toggleAccount(acct.account_id)}
                          className="flex items-center gap-2.5 min-w-0 text-left focus:outline-none"
                        >
                          <div className={`w-7 h-7 rounded ${color.bg} border ${color.border} flex items-center justify-center shrink-0`}>
                            <Bookmark className={`w-3.5 h-3.5 ${color.text}`} />
                          </div>
                          <div className="text-left leading-tight min-w-0">
                            <h5 className="font-bold text-white text-sm truncate">
                              {acct.account_code && <span className="text-gray-400 font-tabular mr-1">{acct.account_code}</span>}
                              {acct.account_name}
                            </h5>
                            <span className="text-[14px] text-gray-400 uppercase font-tabular font-bold tracking-wider">{acct.account_type} classification</span>
                          </div>
                        </button>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right leading-none">
                            <span className="block text-[14px] text-gray-400 font-tabular uppercase font-bold">Standing Balance</span>
                            <span className={`block text-sm font-tabular font-extrabold mt-0.5 ${color.text}`}>
                              {money(acct.current_balance)}
                            </span>
                          </div>
                          {isBookkeeper && (
                            <button
                              onClick={() => handleOpenManageAccounts(selectedClientId)}
                              title={`Edit ${acct.account_name}`}
                              className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white focus:outline-none"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handlePrintAccount(acct)}
                            title={`Print ${acct.account_name}'s ledger`}
                            className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white focus:outline-none"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => toggleAccount(acct.account_id)}
                            className="focus:outline-none"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                          </button>
                        </div>
                      </div>

                      {/* Accordion detail drawer */}
                      {isExpanded && (
                        <div className="p-3 bg-black/30 border-t border-white/10">
                          {visibleLines.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-sm border-collapse">
                                <thead>
                                  <tr className="text-gray-400 font-tabular font-bold uppercase text-[14px] border-b border-white/10">
                                    <th className="py-1 px-1">Effective Date</th>
                                    <th className="py-1 px-1">Reference</th>
                                    <th className="py-1 px-1">Description</th>
                                    <th className="py-1 px-1 text-right">Debit (₱)</th>
                                    <th className="py-1 px-1 text-right">Credit (₱)</th>
                                    <th className="py-1 px-1 text-right">Running Balance (₱)</th>
                                    {isBookkeeper && <th className="py-1 px-1 text-right">Actions</th>}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/10 font-tabular text-sm text-white">
                                  {visibleLines.map((line, lIdx) => {
                                    const sourceJournal = findJournalForLedgerLine(line.journal_id);
                                    return (
                                      <tr key={lIdx} className="hover:bg-white/5">
                                        <td className="py-2 px-1 whitespace-nowrap">{line.entry_date}</td>
                                        <td className="py-2 px-1 whitespace-nowrap">
                                          {sourceJournal ? (
                                            <span className="bg-purple-600 text-white font-tabular font-bold text-[14px] px-1.5 py-0.5 rounded">
                                              {sourceJournal.reference}
                                            </span>
                                          ) : "—"}
                                        </td>
                                        <td className="py-2 px-1 text-white">{line.description}</td>
                                        <td className="py-2 px-1 text-right font-medium">
                                          {line.debit > 0 ? money(line.debit) : "—"}
                                        </td>
                                        <td className="py-2 px-1 text-right font-medium">
                                          {line.credit > 0 ? money(line.credit) : "—"}
                                        </td>
                                        <td className="py-2 px-1 text-right font-bold text-white">
                                          {money(line.balance)}
                                        </td>
                                        {isBookkeeper && (
                                          <td className="py-2 px-1 text-right">
                                            {sourceJournal && (
                                              <button
                                                onClick={() => handleOpenEditJournalModal(sourceJournal)}
                                                title="Edit this posted line's entry — mistakes are corrected, never deleted, and every change is tracked in the audit log"
                                                className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white"
                                              >
                                                <Pencil className="w-3.5 h-3.5" />
                                              </button>
                                            )}
                                          </td>
                                        )}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="py-4 text-center text-sm text-gray-400 font-tabular">
                              {hasLines
                                ? `No transactions in this period — try "All Time" to see this account's full history.`
                                : "No general ledger transactions posted. This account balance is standing at default values."}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                    </div>
                  );
                })}

                {/* Ledger Totals — the accounting equation, checked for real against
                    this client's actual account balances (not a static example). */}
                <div className="p-4 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
                    <div>
                      <span className="block text-[14px] text-gray-400 font-tabular uppercase font-bold tracking-wider">Total Assets</span>
                      <span className="block text-lg font-tabular font-extrabold text-green-400 mt-0.5">{money(totalAssets)}</span>
                    </div>
                    <div>
                      <span className="block text-[14px] text-gray-400 font-tabular uppercase font-bold tracking-wider">Total Liabilities</span>
                      <span className="block text-lg font-tabular font-extrabold text-orange-400 mt-0.5">{money(totalLiabilities)}</span>
                    </div>
                    <div>
                      <span className="block text-[14px] text-gray-400 font-tabular uppercase font-bold tracking-wider">Total Equity</span>
                      <span className="block text-lg font-tabular font-extrabold text-purple-400 mt-0.5">{money(totalEquity)}</span>
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 pt-3 border-t border-dashed border-white/10 text-sm font-bold font-tabular ${isLedgerBalanced ? "text-green-400" : "text-red-400"}`}>
                    {isLedgerBalanced ? <CheckCircle className="w-4 h-4" /> : <Scale className="w-4 h-4" />}
                    Accounting Equation — Assets ({money(totalAssets)}) {isLedgerBalanced ? "=" : "≠"} Liabilities + Equity ({money(totalLiabilities + totalEquity)})
                    {!isLedgerBalanced && <span className="text-gray-400 font-normal">— off by {money(Math.abs(totalAssets - (totalLiabilities + totalEquity)))}</span>}
                  </div>
                </div>
                </>
              )}
            </div>
          )}

        </div>
      )}

      {/* DOUBLE ENTRY BALANCED JOURNAL POSTING DIALOG */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center p-4 z-50 animate-count-up backdrop-blur-xs">
          <div className="bg-black/40 backdrop-blur-md rounded-lg max-w-3xl w-full p-5 shadow-2xl border border-white/10 max-h-[90vh] overflow-y-auto w-full">

            <div className="pb-3 mb-3 border-b border-white/10 flex justify-between items-center">
              <div>
                <h4 className="font-display font-bold text-white text-sm uppercase font-tabular tracking-wider">
                  {editingJournalId !== null ? "Edit Journal Entry" : "Configure Double-Entry Posting"}
                </h4>
                <p className="text-sm text-gray-400">
                  {editingJournalId !== null
                    ? "Account balances and the general ledger recalculate automatically once saved."
                    : "Auto-posts line balances to general ledger in real time."}
                </p>
              </div>
              <button onClick={() => { setShowAddModal(false); setEditingJournalId(null); }} className="text-gray-400 hover:text-gray-300 font-extrabold text-base">✕</button>
            </div>

            {modalError && (
              <div className="p-2 mb-3 bg-red-500/10 text-red-400 border border-red-500/30 text-sm font-semibold rounded">
                {modalError}
              </div>
            )}
            {modalSuccess && (
              <div className="p-2 mb-3 bg-green-500/10 text-green-400 border border-green-500/30 text-sm font-semibold rounded">
                {modalSuccess}
              </div>
            )}

            <form onSubmit={handlePostJournalSubmit} className="space-y-4">

              {/* Part 1 Header settings */}
              <div className="p-3 bg-black/30 rounded-lg border border-white/10 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular">Assigned Client</label>
                  <select
                    value={entryClientId}
                    disabled={editingJournalId !== null}
                    onChange={(e) => setEntryClientId(e.target.value)}
                    className="w-full px-2 py-1 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium text-white disabled:bg-black/30 disabled:text-gray-400"
                  >
                    {clients.map((c) => (
                      <option key={c.client_id} value={c.client_id}>{c.business_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular">Date Posted</label>
                  <input
                    type="date"
                    required
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="w-full px-2 py-1 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-tabular text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular">Narration (Being...)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. the rent for the current month paid amounting to ₱10,000"
                    value={entryDescription}
                    onChange={(e) => setEntryDescription(e.target.value)}
                    className="w-full px-2 py-1 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                  />
                  <p className="text-xs text-gray-400 mt-1 italic">
                    (Being {entryDescription || "..."})
                  </p>
                </div>
              </div>

              {/* Part 2: Dynamic matching ledger items line grids */}
              <p className="text-xs text-gray-400">
                Every entry needs at least two lines, and total <strong>Dr.</strong> must equal total <strong>Cr.</strong> below. Which side increases an account depends on its type: <strong>Debit</strong> increases Assets and Expenses; <strong>Credit</strong> increases Liabilities, Equity, and Revenue (the opposite decreases it). E.g. paying rent in cash: Debit Rent Expense, Credit Cash on Hand.
              </p>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center bg-white/10 p-2 rounded-t-lg border border-white/10 text-xs font-bold text-gray-400 font-tabular uppercase">
                  <span>Journal Entry Lines</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenManageAccounts()}
                      className="flex items-center gap-1 px-2 py-0.5 bg-black/30 border border-white/10 hover:border-white/30 text-gray-300 font-sans text-xs rounded"
                    >
                      <Settings2 className="w-3 h-3" />
                      Manage Accounts
                    </button>
                    <button
                      type="button"
                      onClick={handleAddLineRow}
                      className="px-2 py-0.5 bg-purple-600 hover:bg-purple-700 text-white font-sans text-xs rounded"
                    >
                      + Add row
                    </button>
                  </div>
                </div>

                {/* Same Particulars / Debit / Credit shape as the posted-entry view and
                    print-out below, so what you build here is what you'll see afterward. */}
                <div className="max-h-[280px] overflow-y-auto border border-t-0 border-white/10 rounded-b-lg">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-purple-600">
                        <th className="text-left text-white text-xs font-bold font-tabular uppercase tracking-wider py-2 px-2">Particulars</th>
                        <th className="text-right text-white text-xs font-bold font-tabular uppercase tracking-wider py-2 px-2 w-[120px]">Debit (₱)</th>
                        <th className="text-right text-white text-xs font-bold font-tabular uppercase tracking-wider py-2 px-2 w-[120px]">Credit (₱)</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {lines.map((line, idx) => (
                        <tr key={idx} className="hover:bg-black/20">
                          <td className="p-1.5 align-top">
                            <select
                              required
                              value={line.account_id}
                              onChange={(e) => handleLineChange(idx, "account_id", e.target.value)}
                              className="w-full px-2 py-1 text-sm bg-black/30 border border-white/10 rounded text-white font-medium focus:ring-1 focus:ring-purple-500"
                            >
                              <option value="" disabled>Select Ledger Account...</option>
                              {groupAccountsByType(availableAccounts).map((group) => (
                                <optgroup key={group.type} label={group.label}>
                                  {group.accounts.map((a) => (
                                    <option key={a.account_id} value={a.account_id}>
                                      {a.account_code ? `${a.account_code} — ` : ""}{a.account_name}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                            <input
                              type="text"
                              required
                              placeholder="Narration, e.g. payment of rent"
                              value={line.narration}
                              onChange={(e) => handleLineChange(idx, "narration", e.target.value)}
                              className="w-full mt-1 px-2 py-1 text-xs bg-black/30 border border-white/10 rounded text-gray-300 italic focus:ring-1 focus:ring-purple-500"
                            />
                          </td>
                          <td className="p-1.5 align-top">
                            <input
                              type="number"
                              placeholder="0.00"
                              min="0"
                              disabled={line.credit > 0}
                              value={line.debit || ""}
                              onChange={(e) => handleLineChange(idx, "debit", e.target.value)}
                              className="w-full px-2 py-1 text-sm bg-black/30 border border-white/10 rounded text-white text-right font-tabular focus:ring-1 focus:ring-purple-500 disabled:opacity-30 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="p-1.5 align-top">
                            <input
                              type="number"
                              placeholder="0.00"
                              min="0"
                              disabled={line.debit > 0}
                              value={line.credit || ""}
                              onChange={(e) => handleLineChange(idx, "credit", e.target.value)}
                              className="w-full px-2 py-1 text-sm bg-black/30 border border-white/10 rounded text-white text-right font-tabular focus:ring-1 focus:ring-purple-500 disabled:opacity-30 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="p-1.5 align-top text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLineRow(idx)}
                              className="p-1 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-400 focus:outline-none"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Dynamic Footer bookkeeping balance calculator */}
              <div className="p-3 bg-black/50 text-white rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md font-tabular">
                <div className="flex items-center gap-4 text-sm font-semibold uppercase">
                  <div className="text-gray-400 text-sm">
                    Total Debit: <span className="text-white ml-1 font-extrabold font-tabular">{money(totalDebits)}</span>
                  </div>
                  <div className="text-gray-400 text-sm">
                    Total Credit: <span className="text-white ml-1 font-extrabold font-tabular">{money(totalCredits)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isBalanced ? (
                    <span className="text-sm text-green-400 font-extrabold flex items-center gap-1 uppercase">
                      <CheckCircle className="w-3.5 h-3.5 text-green-400 animate-pulse" />
                      Balanced!
                    </span>
                  ) : (
                    <span className="text-xs text-red-400 font-bold flex items-center gap-1 uppercase leading-none">
                      <Scale className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <span>Out of balance: {money(discrepancy)}</span>
                    </span>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={!isBalanced || isSubmitting}
                className="w-full py-2 bg-purple-600 disabled:bg-white/10 hover:bg-purple-700 disabled:text-gray-400 rounded text-sm font-bold text-white shadow-lg transition-all focus:outline-none uppercase tracking-wider"
              >
                {isSubmitting
                  ? "Posting…"
                  : editingJournalId !== null
                  ? "Save Changes & Recalculate Ledger"
                  : "Post Journal Entry"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MANAGE CHART OF ACCOUNTS PANEL — add new accounts / rename or retype existing ones */}
      {showManageAccounts && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[60] animate-count-up">
          <div className="bg-black/40 backdrop-blur-md rounded-lg max-w-md w-full p-5 shadow-2xl border border-white/10 max-h-[85vh] overflow-y-auto">
            <div className="pb-3 mb-3 border-b border-white/10 flex justify-between items-center">
              <div>
                <h4 className="font-display font-bold text-white text-sm uppercase font-tabular tracking-wider">Manage Chart of Accounts</h4>
                <p className="text-sm text-gray-400">{clients.find((c) => c.client_id.toString() === entryClientId)?.business_name || "Selected client"}</p>
              </div>
              <button onClick={() => setShowManageAccounts(false)} className="text-gray-400 hover:text-gray-300 font-extrabold text-base">✕</button>
            </div>

            {manageError && (
              <div className="p-2 mb-3 bg-red-500/10 text-red-400 border border-red-500/30 text-sm font-semibold rounded">
                {manageError}
              </div>
            )}

            <p className="text-xs text-gray-400 mb-2">
              The opening balance is what this account starts at (e.g. how much cash is on hand right now) — you can only set it here, before any transactions are posted to it.
            </p>
            <form onSubmit={handleAddAccount} className="space-y-1.5 mb-4">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Code (e.g. 1010)"
                  value={newAcctCode}
                  onChange={(e) => setNewAcctCode(e.target.value)}
                  className="w-[90px] shrink-0 px-2 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white font-tabular"
                />
                <input
                  type="text"
                  placeholder="New account name..."
                  value={newAcctName}
                  onChange={(e) => setNewAcctName(e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                />
                <select
                  value={newAcctType}
                  onChange={(e) => setNewAcctType(e.target.value as Account["account_type"])}
                  className="px-2 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white capitalize shrink-0"
                >
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t} value={t} className="capitalize">{t}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-1.5">
                <div className="flex-1 min-w-0">
                  <label className="block text-[14px] font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Opening Balance (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={newAcctBalance}
                    onChange={(e) => setNewAcctBalance(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white font-tabular"
                  />
                </div>
                <button
                  type="submit"
                  disabled={addingAccount || !newAcctName.trim()}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold rounded shrink-0"
                >
                  {addingAccount ? "Adding..." : "+ Add"}
                </button>
              </div>
            </form>

            <div className="space-y-2">
              {groupAccountsByType(availableAccounts).map((group) => {
                const isGroupOpen = !!expandedManageTypes[group.type];
                return (
                  <div key={group.type} className="border border-white/10 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleManageType(group.type)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-black/30 hover:bg-black/20 transition-all focus:outline-none"
                    >
                      <span className="text-xs font-bold text-gray-300 uppercase font-tabular tracking-wider">
                        {group.label} <span className="text-gray-600">({group.accounts.length})</span>
                      </span>
                      {isGroupOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                    </button>

                    {isGroupOpen && (
                      <div className="divide-y divide-white/10 border-t border-white/10">
                        {group.accounts.map((acct) => (
                          <div key={acct.account_id} className="p-2.5 hover:bg-black/30">
                  {editingAcctId === acct.account_id ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder="Code"
                          value={editAcctCode}
                          onChange={(e) => setEditAcctCode(e.target.value)}
                          className="w-[70px] shrink-0 px-2 py-1 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white font-tabular"
                        />
                        <input
                          type="text"
                          value={editAcctName}
                          onChange={(e) => setEditAcctName(e.target.value)}
                          className="flex-1 min-w-0 px-2 py-1 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                        />
                        <select
                          value={editAcctType}
                          disabled={acct.has_activity}
                          title={acct.has_activity ? "Type is locked — this account already has posted transactions" : undefined}
                          onChange={(e) => setEditAcctType(e.target.value as Account["account_type"])}
                          className="px-2 py-1 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white capitalize disabled:bg-black/30 disabled:text-gray-400 shrink-0"
                        >
                          {ACCOUNT_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end gap-1.5">
                        <div className="flex-1 min-w-0">
                          <label className="block text-[14px] font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Opening Balance (₱)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={editAcctBalance}
                            disabled={acct.has_activity}
                            title={acct.has_activity ? "Opening balance is locked — this account already has posted transactions" : "How much this account currently holds — saved as a real, balanced journal entry"}
                            onChange={(e) => setEditAcctBalance(e.target.value)}
                            className="w-full px-2 py-1 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white font-tabular disabled:bg-black/30 disabled:text-gray-400"
                          />
                        </div>
                        <button
                          onClick={() => handleSaveEditAccount(acct.account_id)}
                          disabled={savingAcctEdit || !editAcctName.trim()}
                          title="Save"
                          className="p-1.5 rounded hover:bg-purple-500/10 text-purple-400 disabled:opacity-50 shrink-0"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingAcctId(null)}
                          title="Cancel"
                          className="p-1.5 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-400 shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {acct.account_code && <span className="text-gray-400 font-tabular mr-1">{acct.account_code}</span>}
                          {acct.account_name}
                        </p>
                        <p className="text-xs text-gray-400 capitalize flex items-center gap-1">
                          {acct.account_type} · {money(acct.balance)}
                          {acct.has_activity && (
                            <span title="Type and opening balance locked — has posted transactions">
                              <Lock className="w-2.5 h-2.5" />
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => handleStartEditAccount(acct)}
                        title="Edit account"
                        className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white shrink-0"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showBatchImport && (
        <BatchImportModal
          token={token}
          clientId={selectedClientId}
          clientName={selectedClientName}
          onClose={() => setShowBatchImport(false)}
          onImported={() => {
            onRefreshDashboard();
            fetchDataForClient(selectedClientId);
          }}
        />
      )}

    </div>
  );
}
export { LedgerView };

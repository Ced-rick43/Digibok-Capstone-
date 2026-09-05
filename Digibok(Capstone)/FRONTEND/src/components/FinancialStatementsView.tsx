import React, { useState, useEffect } from "react";
import { CheckCircle, AlertCircle, FileCheck2, Scale, Info } from "lucide-react";
import {
  User,
  ClientProfile,
  TrialBalanceResult,
  IncomeStatementResult,
  BalanceSheetResult,
} from "../types";
import { money } from "../lib/currency";

interface FinancialStatementsViewProps {
  user: User;
  token: string | null;
  refreshTrigger: number;
}

type StatementTab = "trial-balance" | "income-statement" | "balance-sheet";

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function jan1Str(): string {
  return `${new Date().getFullYear()}-01-01`;
}

const STATEMENT_HELP: Record<StatementTab, string> = {
  "trial-balance": "Lists every account with its current debit or credit total — it's a checksum: if Total Debits and Total Credits don't match, something was recorded incorrectly.",
  "income-statement": "Shows what came in (revenues) and what went out (expenses) over a date range, ending in Net Income — whether the business made or lost money in that period.",
  "balance-sheet": "A snapshot on one date of what the business owns (Assets), owes (Liabilities), and the owner's stake (Equity). Assets should always equal Liabilities + Equity.",
};

const REPORT_TYPE_BY_TAB: Record<StatementTab, string> = {
  "trial-balance": "Trial Balance",
  "income-statement": "Income Statement",
  "balance-sheet": "Balance Sheet",
};

// Display-only modern terms — the values above stay as-is since they're the identifiers
// the backend routes on; only what's shown on screen adopts the newer terminology.
const STATEMENT_LABEL: Record<StatementTab, string> = {
  "trial-balance": "Trial Balance",
  "income-statement": "Financial Performance",
  "balance-sheet": "Financial Position",
};

export default function FinancialStatementsView({ user, token, refreshTrigger }: FinancialStatementsViewProps) {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [activeTab, setActiveTab] = useState<StatementTab>("trial-balance");

  const [asOfDate, setAsOfDate] = useState(todayStr());
  const [startDate, setStartDate] = useState(jan1Str());
  const [endDate, setEndDate] = useState(todayStr());

  const [trialBalance, setTrialBalance] = useState<TrialBalanceResult | null>(null);
  const [incomeStatement, setIncomeStatement] = useState<IncomeStatementResult | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  const [exportError, setExportError] = useState("");

  const isBookkeeper = user.role === "bookkeeper";

  const fetchClients = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/clients", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.length > 0) {
        setClients(data);
        setSelectedClientId(data[0].client_id.toString());
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [token]);

  useEffect(() => {
    if (!token || !selectedClientId) return;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        if (activeTab === "trial-balance") {
          const res = await fetch(`/api/financials/trial-balance?clientId=${selectedClientId}&asOfDate=${asOfDate}`, {
            headers: { "Authorization": `Bearer ${token}` },
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || "Failed loading trial balance.");
          setTrialBalance(data);
        } else if (activeTab === "income-statement") {
          const res = await fetch(
            `/api/financials/income-statement?clientId=${selectedClientId}&startDate=${startDate}&endDate=${endDate}`,
            { headers: { "Authorization": `Bearer ${token}` } }
          );
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || "Failed loading income statement.");
          setIncomeStatement(data);
        } else {
          const res = await fetch(`/api/financials/balance-sheet?clientId=${selectedClientId}&asOfDate=${asOfDate}`, {
            headers: { "Authorization": `Bearer ${token}` },
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || "Failed loading balance sheet.");
          setBalanceSheet(data);
        }
      } catch (e: any) {
        setError(e.message || "Failed loading financial statement.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, selectedClientId, activeTab, asOfDate, startDate, endDate, refreshTrigger]);

  const handleExportPDF = async () => {
    if (!selectedClientId) return;
    setExporting(true);
    setExportMsg("");
    setExportError("");

    const period =
      activeTab === "income-statement" ? `${startDate} to ${endDate}` : `As of ${asOfDate}`;

    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          client_id: Number(selectedClientId),
          report_type: REPORT_TYPE_BY_TAB[activeTab],
          period,
          start_date: activeTab === "income-statement" ? startDate : undefined,
          end_date: activeTab === "income-statement" ? endDate : undefined,
          as_of_date: activeTab !== "income-statement" ? asOfDate : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed generating PDF document.");

      setExportMsg(`Saved to Reports archive (${data.file_size}).`);
      setTimeout(() => setExportMsg(""), 4000);
    } catch (e: any) {
      setExportError(e.message || "PDF generation failed.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Plain-language explainer for whichever statement is active — these are standard
          accounting terms but not everyone reading this dashboard is an accountant. */}
      <div className="p-3 bg-white/10 border border-white/10 rounded-lg flex items-start gap-2 text-sm text-gray-300">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-400" />
        <span>{STATEMENT_HELP[activeTab]}</span>
      </div>

      {/* Control row with tabs and client selector */}
      <div className="p-3 bg-black/40 backdrop-blur-md rounded-lg border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex bg-black/30 p-0.5 rounded-lg border border-white/10 self-start shrink-0">
          <button
            onClick={() => setActiveTab("trial-balance")}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold focus:outline-none transition-all ${
              activeTab === "trial-balance" ? "bg-purple-600 text-white font-extrabold" : "text-gray-400 hover:text-white"
            }`}
          >
            Trial Balance
          </button>
          <button
            onClick={() => setActiveTab("income-statement")}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold focus:outline-none transition-all ${
              activeTab === "income-statement" ? "bg-purple-600 text-white font-extrabold" : "text-gray-400 hover:text-white"
            }`}
          >
            {STATEMENT_LABEL["income-statement"]}
          </button>
          <button
            onClick={() => setActiveTab("balance-sheet")}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold focus:outline-none transition-all ${
              activeTab === "balance-sheet" ? "bg-purple-600 text-white font-extrabold" : "text-gray-400 hover:text-white"
            }`}
          >
            {STATEMENT_LABEL["balance-sheet"]}
          </button>
        </div>

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
        </div>
      </div>

      {/* Date controls + export */}
      <div className="p-3 bg-black/40 backdrop-blur-md rounded-lg border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {activeTab === "income-statement" ? (
            <>
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold font-tabular uppercase text-gray-400">Start Date:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-2 py-1 text-sm bg-black/30 border border-white/10 rounded font-tabular text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold font-tabular uppercase text-gray-400">End Date:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-2 py-1 text-sm bg-black/30 border border-white/10 rounded font-tabular text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-bold font-tabular uppercase text-gray-400">As of Date:</label>
              <input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="px-2 py-1 text-sm bg-black/30 border border-white/10 rounded font-tabular text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
          )}
        </div>

        {isBookkeeper && (
          <div className="flex items-center gap-2.5">
            {exportError && <span className="text-xs text-red-400 font-semibold">{exportError}</span>}
            {exportMsg && <span className="text-xs text-green-400 font-semibold">{exportMsg}</span>}
            <button
              onClick={handleExportPDF}
              disabled={exporting || !selectedClientId}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:bg-white/10 disabled:text-gray-400 rounded-lg focus:outline-none transition-all"
            >
              {exporting ? (
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              ) : (
                <>
                  <FileCheck2 className="w-3.5 h-3.5" />
                  <span>Export PDF</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded text-sm leading-normal font-semibold">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-sm font-semibold text-gray-400 font-tabular">
          Compiling financial statement...
        </div>
      ) : (
        <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4">
          {activeTab === "trial-balance" && trialBalance && (
            <div className="space-y-3">
              <h4 className="font-display font-bold text-white text-sm uppercase font-tabular tracking-wider">
                Trial Balance — as of {trialBalance.asOfDate}
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="text-gray-400 font-tabular font-bold uppercase text-[14px] border-b border-white/10">
                      <th className="py-1.5 px-1">Account</th>
                      <th className="py-1.5 px-1">Type</th>
                      <th className="py-1.5 px-1 text-right">Debit (₱)</th>
                      <th className="py-1.5 px-1 text-right">Credit (₱)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 font-tabular text-sm text-white">
                    {trialBalance.rows.map((row) => (
                      <tr key={row.account_id} className="hover:bg-black/30">
                        <td className="py-1.5 px-1 font-semibold text-white">{row.account_name}</td>
                        <td className="py-1.5 px-1 text-xs text-gray-400 capitalize">{row.account_type}</td>
                        <td className="py-1.5 px-1 text-right font-medium">
                          {row.debit > 0 ? money(row.debit) : "—"}
                        </td>
                        <td className="py-1.5 px-1 text-right font-medium">
                          {row.credit > 0 ? money(row.credit) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pt-2.5 border-t border-dashed border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-xs text-gray-400 font-tabular font-semibold uppercase flex gap-4">
                  <span>Total Debits: <strong className="text-white">{money(trialBalance.totalDebits)}</strong></span>
                  <span>Total Credits: <strong className="text-white">{money(trialBalance.totalCredits)}</strong></span>
                </div>
                {trialBalance.isBalanced ? (
                  <span className="text-sm text-green-400 font-extrabold flex items-center gap-1 uppercase">
                    <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                    Balanced
                  </span>
                ) : (
                  <span className="text-sm text-red-400 font-extrabold flex items-center gap-1 uppercase">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                    Out of Balance
                  </span>
                )}
              </div>
            </div>
          )}

          {activeTab === "income-statement" && incomeStatement && (
            <div className="space-y-4">
              <h4 className="font-display font-bold text-white text-sm uppercase font-tabular tracking-wider">
                Statement of {STATEMENT_LABEL["income-statement"]} — {incomeStatement.startDate} to {incomeStatement.endDate}
              </h4>

              <div>
                <h5 className="text-xs font-bold text-gray-400 uppercase font-tabular tracking-wider mb-1.5">Revenues</h5>
                {incomeStatement.revenues.length === 0 ? (
                  <p className="text-sm text-gray-400 font-tabular">No revenue activity in this period.</p>
                ) : (
                  <div className="space-y-1">
                    {incomeStatement.revenues.map((r) => (
                      <div key={r.account_id} className="flex justify-between text-sm font-tabular text-white">
                        <span>{r.account_name}</span>
                        <span className="font-medium">{money(r.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-white pt-1.5 mt-1.5 border-t border-white/10 font-tabular">
                  <span>Total Revenues</span>
                  <span>{money(incomeStatement.totalRevenues)}</span>
                </div>
              </div>

              <div>
                <h5 className="text-xs font-bold text-gray-400 uppercase font-tabular tracking-wider mb-1.5">Expenses</h5>
                {incomeStatement.expenses.length === 0 ? (
                  <p className="text-sm text-gray-400 font-tabular">No expense activity in this period.</p>
                ) : (
                  <div className="space-y-1">
                    {incomeStatement.expenses.map((e) => (
                      <div key={e.account_id} className="flex justify-between text-sm font-tabular text-white">
                        <span>{e.account_name}</span>
                        <span className="font-medium">{money(e.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-white pt-1.5 mt-1.5 border-t border-white/10 font-tabular">
                  <span>Total Expenses</span>
                  <span>{money(incomeStatement.totalExpenses)}</span>
                </div>
              </div>

              <div className="p-3 bg-black/50 text-white rounded-lg flex items-center justify-between font-tabular">
                <span className="text-sm font-bold uppercase">Net Income / (Loss)</span>
                <span className={`text-base font-extrabold ${incomeStatement.netIncome >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {money(incomeStatement.netIncome)}
                </span>
              </div>
            </div>
          )}

          {activeTab === "balance-sheet" && balanceSheet && (
            <div className="space-y-4">
              <h4 className="font-display font-bold text-white text-sm uppercase font-tabular tracking-wider">
                Statement of {STATEMENT_LABEL["balance-sheet"]} — as of {balanceSheet.asOfDate}
              </h4>

              <div>
                <h5 className="text-xs font-bold text-gray-400 uppercase font-tabular tracking-wider mb-1.5">Assets</h5>
                <div className="space-y-1">
                  {balanceSheet.assets.map((a) => (
                    <div key={a.account_id} className="flex justify-between text-sm font-tabular text-white">
                      <span>{a.account_name}</span>
                      <span className="font-medium">{money(a.balance)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-sm font-bold text-white pt-1.5 mt-1.5 border-t border-white/10 font-tabular">
                  <span>Total Assets</span>
                  <span>{money(balanceSheet.totalAssets)}</span>
                </div>
              </div>

              <div>
                <h5 className="text-xs font-bold text-gray-400 uppercase font-tabular tracking-wider mb-1.5">Liabilities</h5>
                <div className="space-y-1">
                  {balanceSheet.liabilities.map((l) => (
                    <div key={l.account_id} className="flex justify-between text-sm font-tabular text-white">
                      <span>{l.account_name}</span>
                      <span className="font-medium">{money(l.balance)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-sm font-bold text-white pt-1.5 mt-1.5 border-t border-white/10 font-tabular">
                  <span>Total Liabilities</span>
                  <span>{money(balanceSheet.totalLiabilities)}</span>
                </div>
              </div>

              <div>
                <h5 className="text-xs font-bold text-gray-400 uppercase font-tabular tracking-wider mb-1.5">Equity</h5>
                <div className="space-y-1">
                  {balanceSheet.equity.map((eq) => (
                    <div key={eq.account_id} className="flex justify-between text-sm font-tabular text-white">
                      <span>{eq.account_name}</span>
                      <span className="font-medium">{money(eq.balance)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-tabular text-white">
                    <span>Retained Earnings (Accumulated Net Income)</span>
                    <span className="font-medium">{money(balanceSheet.retainedEarnings)}</span>
                  </div>
                </div>
                <div className="flex justify-between text-sm font-bold text-white pt-1.5 mt-1.5 border-t border-white/10 font-tabular">
                  <span>Total Equity</span>
                  <span>{money(balanceSheet.totalEquity)}</span>
                </div>
              </div>

              <div className="p-3 bg-black/50 text-white rounded-lg flex items-center justify-between font-tabular">
                <span className="text-sm font-bold uppercase">Total Liabilities &amp; Equity</span>
                <span className="text-base font-extrabold">{money(balanceSheet.totalLiabilities + balanceSheet.totalEquity)}</span>
              </div>

              <div className="flex items-center justify-end gap-2">
                {balanceSheet.isBalanced ? (
                  <span className="text-sm text-green-400 font-extrabold flex items-center gap-1 uppercase">
                    <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                    Balanced
                  </span>
                ) : (
                  <span className="text-sm text-red-400 font-extrabold flex items-center gap-1 uppercase">
                    <Scale className="w-3.5 h-3.5 text-red-400" />
                    Out of Balance
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export { FinancialStatementsView };

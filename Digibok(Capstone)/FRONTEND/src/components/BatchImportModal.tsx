import React, { useState } from "react";
import { X, Download, Upload, AlertTriangle, CheckCircle, FileSpreadsheet, Loader2 } from "lucide-react";
import { money } from "../lib/currency";

interface ImportRowResult {
  rowNumber: number;
  date: string;
  accountNameRaw: string;
  accountId: number | null;
  debit: number;
  credit: number;
  narration: string;
  errors: string[];
}

interface ImportGroupResult {
  date: string;
  rows: ImportRowResult[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

interface ImportValidationResult {
  rows: ImportRowResult[];
  groups: ImportGroupResult[];
  fileTotalDebit: number;
  fileTotalCredit: number;
  isFileBalanced: boolean;
  hasErrors: boolean;
  rowCount: number;
}

interface BatchImportModalProps {
  token: string | null;
  clientId: string;
  clientName: string;
  onClose: () => void;
  onImported: () => void;
}

export default function BatchImportModal({ token, clientId, clientName, onClose, onImported }: BatchImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportValidationResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleDownloadTemplate = async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/journal/import/template?clientId=${clientId}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to download template.");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "DigiBok_Journal_Import_Template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message || "Failed to download template.");
    }
  };

  const handleFileSelected = async (selected: File | null) => {
    setFile(selected);
    setPreview(null);
    setError("");
    setSuccessMsg("");
    if (!selected || !token) return;

    setPreviewing(true);
    try {
      const formData = new FormData();
      formData.append("file", selected);
      formData.append("clientId", clientId);
      const res = await fetch("/api/journal/import/preview", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to parse the spreadsheet.");
      setPreview(data);
    } catch (e: any) {
      setError(e.message || "Failed to parse the spreadsheet.");
    } finally {
      setPreviewing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!file || !token || !preview || preview.hasErrors || confirming) return;

    setConfirming(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("clientId", clientId);
      const res = await fetch("/api/journal/import/confirm", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Import failed.");

      setSuccessMsg(data.message);
      onImported();
      setTimeout(() => onClose(), 2000);
    } catch (e: any) {
      setError(e.message || "Import failed.");
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[70] animate-count-up">
      <div className="bg-black/40 backdrop-blur-md rounded-lg max-w-3xl w-full p-5 shadow-2xl border border-white/10 max-h-[90vh] overflow-y-auto">
        <div className="pb-3 mb-3 border-b border-white/10 flex justify-between items-center">
          <div>
            <h4 className="font-display font-bold text-white text-sm uppercase font-tabular tracking-wider">Batch Upload — Excel Import</h4>
            <p className="text-sm text-gray-400">{clientName} · Nothing gets posted until you review and confirm below.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-300 font-extrabold text-base">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 mb-3 bg-red-500/10 text-red-400 border border-red-500/30 text-sm font-semibold rounded">{error}</div>
        )}
        {successMsg && (
          <div className="p-2.5 mb-3 bg-green-500/10 text-green-400 border border-green-500/30 text-sm font-semibold rounded flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            {successMsg}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-bold text-gray-300 bg-black/30 border border-white/10 hover:border-white/30 hover:text-white rounded-lg focus:outline-none transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Download Template
          </button>

          <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg cursor-pointer transition-all">
            <Upload className="w-3.5 h-3.5" />
            {file ? file.name : "Choose Excel File (.xlsx)"}
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => handleFileSelected(e.target.files?.[0] || null)}
            />
          </label>
        </div>

        {previewing && (
          <div className="p-6 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Parsing and validating rows against your Chart of Accounts...
          </div>
        )}

        {preview && !previewing && (
          <div className="space-y-3">
            {/* Whole-file balance banner */}
            <div
              className={`p-3 rounded-lg border flex items-center gap-2.5 text-sm font-bold ${
                preview.isFileBalanced ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"
              }`}
            >
              {preview.isFileBalanced ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              {preview.isFileBalanced ? (
                <span>Balanced — Total Debits ({money(preview.fileTotalDebit)}) equal Total Credits ({money(preview.fileTotalCredit)}).</span>
              ) : (
                <span>
                  Mismatched Ledger: Total Debits ({money(preview.fileTotalDebit)}) must equal Total Credits ({money(preview.fileTotalCredit)}) to balance.
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs text-gray-400 font-tabular">
              <span className="flex items-center gap-1"><FileSpreadsheet className="w-3.5 h-3.5" />{preview.rowCount} lines parsed</span>
              <span>{preview.groups.length} entr{preview.groups.length === 1 ? "y" : "ies"} (grouped by date)</span>
              {preview.groups.some((g) => !g.isBalanced) && (
                <span className="text-red-400 font-bold">{preview.groups.filter((g) => !g.isBalanced).length} unbalanced entr{preview.groups.filter((g) => !g.isBalanced).length === 1 ? "y" : "ies"}</span>
              )}
            </div>

            {/* Dry-run preview table */}
            <div className="max-h-[320px] overflow-y-auto border border-white/10 rounded-lg">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 bg-black/60 backdrop-blur-md">
                  <tr className="text-gray-400 font-tabular font-bold uppercase text-[13px]">
                    <th className="py-2 px-2 text-left">Row</th>
                    <th className="py-2 px-2 text-left">Date</th>
                    <th className="py-2 px-2 text-left">Account</th>
                    <th className="py-2 px-2 text-right">Debit</th>
                    <th className="py-2 px-2 text-right">Credit</th>
                    <th className="py-2 px-2 text-left">Narration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {preview.rows.map((row) => (
                    <tr key={row.rowNumber} className={row.errors.length > 0 ? "bg-red-500/10" : ""}>
                      <td className="py-1.5 px-2 text-gray-400 font-tabular">{row.rowNumber}</td>
                      <td className="py-1.5 px-2 text-gray-300 font-tabular">{row.date || "—"}</td>
                      <td className={`py-1.5 px-2 ${row.accountId ? "text-white" : "text-red-400 font-semibold"}`}>{row.accountNameRaw || "—"}</td>
                      <td className="py-1.5 px-2 text-right text-white font-tabular">{row.debit > 0 ? money(row.debit) : ""}</td>
                      <td className="py-1.5 px-2 text-right text-white font-tabular">{row.credit > 0 ? money(row.credit) : ""}</td>
                      <td className="py-1.5 px-2 text-gray-300">
                        {row.narration || <span className="text-red-400 italic">missing</span>}
                        {row.errors.length > 0 && (
                          <div className="text-red-400 text-[14px] mt-0.5">{row.errors.join(" ")}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={handleConfirmImport}
              disabled={preview.hasErrors || confirming || !!successMsg}
              className="w-full py-2 bg-purple-600 disabled:bg-white/10 hover:bg-purple-700 disabled:text-gray-400 rounded text-sm font-bold text-white shadow-lg transition-all focus:outline-none uppercase tracking-wider flex items-center justify-center gap-2"
            >
              {confirming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Posting...
                </>
              ) : preview.hasErrors ? (
                "Fix Errors Above Before Posting"
              ) : (
                `Confirm & Post Import (${preview.groups.length} ${preview.groups.length === 1 ? "entry" : "entries"})`
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

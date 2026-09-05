import React, { useState, useEffect } from "react";
import {
  FileSpreadsheet,
  Download,
  Trash2,
  Plus,
  Calendar,
  Check,
  AlertCircle,
  FileCheck2,
  Bookmark,
  ChevronRight,
  FileText,
  Mail,
  Loader2
} from "lucide-react";
import { User, ClientProfile, Report } from "../types";

interface ReportsViewProps {
  user: User;
  token: string | null;
  refreshTrigger: number;
}

export default function ReportsView({ user, token, refreshTrigger }: ReportsViewProps) {
  const [reports, setReports] = useState<Report[]>([]);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [generating, setGenerating] = useState(false);

  // Form states
  const [clientIdForm, setClientIdForm] = useState("");
  const [reportType, setReportType] = useState("Quarterly Percentage Tax (2551Q)");
  const [period, setPeriod] = useState("Q2 2026");

  const [errorCode, setErrorCode] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

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
        setClientIdForm(data[0].client_id.toString());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchReports = async (cid: string) => {
    if (!token || !cid) return;
    try {
      const res = await fetch(`/api/reports?clientId=${cid}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setReports(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [token]);

  useEffect(() => {
    if (selectedClientId) {
      fetchReports(selectedClientId);
    }
  }, [selectedClientId, token, refreshTrigger]);

  const handleGenerateReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorCode("");
    setSuccessMsg("");
    setGenerating(true);

    if (!clientIdForm || !reportType || !period) {
      setErrorCode("Please complete all report configurations.");
      setGenerating(false);
      return;
    }

    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          client_id: Number(clientIdForm),
          report_type: reportType,
          period,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed generating PDF document.");
      }

      setSuccessMsg(`PDF Report document generated successfully! Size: ${data.file_size}.`);
      setSelectedClientId(clientIdForm);
      fetchReports(clientIdForm);
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      setErrorCode(err.message || "PDF generation crash");
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteReport = async (reportId: number) => {
    if (!isBookkeeper || !window.confirm("Physically remove this generated financial PDF from storage space?")) return;
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (res.ok) {
        fetchReports(selectedClientId);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownload = async (report: Report) => {
    try {
      const res = await fetch(`/api/reports/${report.report_id}/download`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to download report.");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = report.file_path;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
  };

  const [emailingReportId, setEmailingReportId] = useState<number | null>(null);
  const [emailStatusMsg, setEmailStatusMsg] = useState("");

  const handleEmailReport = async (report: Report) => {
    const remembered = localStorage.getItem("digibok_accountant_email") || "";
    const to = window.prompt("Send this report to (accountant's email):", remembered);
    if (!to) return;

    setEmailingReportId(report.report_id);
    setEmailStatusMsg("");
    try {
      const res = await fetch(`/api/reports/${report.report_id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ to }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed sending report.");

      localStorage.setItem("digibok_accountant_email", to);
      setEmailStatusMsg(data.message || `Sent to ${to}.`);
      setTimeout(() => setEmailStatusMsg(""), 4000);
    } catch (e: any) {
      setEmailStatusMsg(e.message || "Failed sending report.");
    } finally {
      setEmailingReportId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

      {/* Left side: Generate filter panel */}
      {isBookkeeper && (
        <div className="lg:col-span-4 bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 space-y-4 h-fit">
          <div>
            <h4 className="font-display font-bold text-white text-sm uppercase font-tabular tracking-wider">Generate Financial Document</h4>
            <p className="text-sm text-gray-400">Auto-constructs professional PDF books using compiled ledger records.</p>
          </div>

          {errorCode && <div className="p-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded text-sm leading-normal font-semibold">{errorCode}</div>}
          {successMsg && <div className="p-2 bg-green-500/10 border border-green-500/30 text-green-400 rounded text-sm leading-normal font-semibold">{successMsg}</div>}

          <form onSubmit={handleGenerateReportSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Target Client Business</label>
              <select
                value={clientIdForm}
                onChange={(e) => setClientIdForm(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm bg-black/30 border border-white/10 focus:bg-black/20 rounded font-medium text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                {clients.map((c) => (
                  <option key={c.client_id} value={c.client_id}>{c.business_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Report Format Type</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm bg-black/30 border border-white/10 focus:bg-black/20 rounded font-medium text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="Quarterly Percentage Tax (2551Q)">Quarterly Percentage Tax (2551Q)</option>
                <option value="Quarterly Income Tax (1702Q)">Quarterly Income Tax (1702Q)</option>
                <option value="Annual Income Tax Return (AITR)">Annual Income Tax Return (AITR)</option>
                <option value="General Journal Book">General Journal Book (Audit Ledger entries)</option>
                <option value="Payment Summary">Payment Summary (Collections & Pending Review)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Cover Period</label>
              <input
                type="text"
                required
                placeholder="e.g. Q2 2026 or Annual 2026"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm bg-black/30 border border-white/10 focus:bg-black/20 rounded text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            <button
              type="submit"
              disabled={generating}
              className="w-full py-2 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 rounded text-sm font-bold text-white shadow-md disabled:bg-white/10 disabled:text-gray-500 transition-all focus:outline-none flex items-center justify-center gap-1.5 uppercase tracking-wider"
            >
              {generating ? (
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              ) : (
                <>
                  <FileCheck2 className="w-3.5 h-3.5" />
                  <span>Compile PDF Now</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Right side: Generated files archive */}
      <div className={`${isBookkeeper ? "lg:col-span-8" : "lg:col-span-12"} bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 space-y-4`}>

        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-2.5 border-b border-white/10">
          <div>
            <h4 className="font-display font-bold text-white text-sm">Compiled Documents Archive</h4>
            <p className="text-sm text-gray-400">History of assembled PDF credentials ready for stream transmission.</p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-tabular font-bold uppercase">Business:</span>
            <select
              value={selectedClientId}
              disabled={!isBookkeeper && clients.length <= 1}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="px-2.5 py-1 text-sm bg-black/30 border border-white/10 rounded-md font-semibold text-white focus:outline-none"
            >
              {clients.map((c) => (
                <option key={c.client_id} value={c.client_id}>{c.business_name}</option>
              ))}
            </select>
          </div>
        </div>

        {emailStatusMsg && (
          <div className="p-2.5 bg-purple-500/10 text-purple-300 border border-purple-500/30 text-xs font-semibold rounded">
            {emailStatusMsg}
          </div>
        )}

        {reports.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500 font-tabular">
            No compiled paperwork found in this archive. Config a template to compile reports.
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map((report) => (
              <div
                key={report.report_id}
                className="p-3 bg-black/30 hover:bg-white/10 border border-white/10 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
              >
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded bg-red-500 text-white flex items-center justify-center font-bold font-tabular text-xs shrink-0">
                    PDF
                  </div>
                  <div className="space-y-0.5">
                    <h5 className="font-bold text-white text-sm">{report.report_type}</h5>
                    <p className="text-xs text-gray-500 font-tabular leading-none">
                      Period: <strong className="text-gray-400 font-tabular">{report.period}</strong> · Size: {report.file_size} · Generated: {new Date(report.generated_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                  <button
                    onClick={() => handleDownload(report)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-white bg-purple-600 rounded hover:bg-purple-700 transition-all focus:outline-none"
                    title="Stream transmission"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>

                  {isBookkeeper && (
                    <button
                      onClick={() => handleEmailReport(report)}
                      disabled={emailingReportId === report.report_id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-white bg-black/40 border border-white/10 rounded hover:border-white/30 transition-all focus:outline-none disabled:opacity-50"
                      title="Email this report to an accountant"
                    >
                      {emailingReportId === report.report_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                      <span>Email</span>
                    </button>
                  )}

                  {isBookkeeper && (
                    <button
                      onClick={() => handleDeleteReport(report.report_id)}
                      className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-all font-bold"
                      title="Delete document"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
export { ReportsView };

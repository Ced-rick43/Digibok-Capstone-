import React, { useState, useEffect } from "react";
import { History, Shield, Clock, HelpCircle, Terminal, Search, Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { User, AuditLog } from "../types";

interface AuditLogsViewProps {
  user: User;
  token: string | null;
}

const PAGE_SIZE = 15;

export default function AuditLogsView({ user, token }: AuditLogsViewProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchLogs = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/audit-logs", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setLogs(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [token]);

  // Any filter change invalidates whatever page we were on — always land back on page 1
  // rather than risk showing an empty page 4 of a now-3-page result set.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateFilter]);

  const filteredLogs = logs.filter((log) => {
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !term ||
      log.action.toLowerCase().includes(term) ||
      log.table_name.toLowerCase().includes(term) ||
      (log.user_name || "").toLowerCase().includes(term);
    const matchesDate =
      !dateFilter || new Date(log.timestamp).toLocaleDateString("en-CA") === dateFilter;
    return matchesSearch && matchesDate;
  });

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const pagedLogs = filteredLogs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="font-display font-bold text-white text-sm uppercase font-tabular tracking-wider">System Compliance Logs Trail</h4>
          <p className="text-sm text-gray-400">History of double-entry ledger listings, client deactivations, and PDF compilations.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              placeholder="Search action, table, or user..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 w-[210px] text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 focus:bg-black/20 text-white"
            />
          </div>

          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 pointer-events-none">
              <Calendar className="w-3.5 h-3.5" />
            </span>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 focus:bg-black/20 text-white font-tabular"
            />
          </div>

          {(searchTerm || dateFilter) && (
            <button
              onClick={() => { setSearchTerm(""); setDateFilter(""); }}
              title="Clear filters"
              className="w-7 h-7 rounded-lg bg-black/30 hover:bg-white/10 flex items-center justify-center border border-white/10 text-gray-400 focus:outline-none"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-sm font-semibold text-gray-400 font-tabular">
          Assembling audit footprints...
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-400">
          {logs.length === 0 ? "No system compliance audits logs found." : "No logs match this filter."}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {pagedLogs.map((log) => (
              <div
                key={log.log_id}
                className="p-3 bg-black/30 hover:bg-white/10 rounded-lg border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-tabular text-sm"
              >
                <div className="flex items-start gap-2.5">
                  <span className="w-7 h-7 rounded bg-white/10 text-gray-300 flex items-center justify-center shrink-0 border border-white/10">
                    <Terminal className="w-3.5 h-3.5" />
                  </span>
                  <div className="space-y-0.5 pt-0.5">
                    <p className="text-white text-sm font-semibold leading-relaxed">{log.action}</p>
                    <p className="text-xs text-gray-400 leading-none">
                      Target database: <strong className="text-gray-400">{log.table_name}</strong> · Record key: {log.record_id}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center text-xs text-gray-400">
                  <span className="bg-black/40 backdrop-blur-md px-1.5 py-0.5 rounded text-gray-400 font-bold uppercase text-[14px] border border-white/10">
                    {log.user_name || "System"}
                  </span>
                  <span className="flex items-center gap-1 font-tabular text-xs">
                    <Clock className="w-3 h-3 text-gray-400" />
                    {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-xs text-gray-400 font-tabular">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredLogs.length)} of {filteredLogs.length} logs
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-7 h-7 rounded-lg bg-black/30 hover:bg-white/10 flex items-center justify-center border border-white/10 text-gray-300 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs text-gray-400 font-tabular font-bold px-1">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="w-7 h-7 rounded-lg bg-black/30 hover:bg-white/10 flex items-center justify-center border border-white/10 text-gray-300 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
export { AuditLogsView };

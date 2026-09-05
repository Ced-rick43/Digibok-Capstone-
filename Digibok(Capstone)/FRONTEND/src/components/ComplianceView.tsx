import React, { useState, useEffect } from "react";
import {
  Building2,
  CalendarClock,
  FileCheck,
  AlertOctagon,
  Plus,
  ChevronRight,
  Trash2,
  Zap,
  Check,
  Clock,
  Briefcase,
  Info,
  Filter,
  Users,
} from "lucide-react";
import { User, ClientProfile, TaxRecord, PermitRecord, ComplianceSummary } from "../types";
import { money } from "../lib/currency";
import ClientDeadlineLookup from "./ClientDeadlineLookup";

interface ComplianceViewProps {
  user: User;
  token: string | null;
  refreshTrigger: number;
  onRefreshDashboard: () => void;
  // Set by a dashboard card drill-down click ("permits-at-risk" / "tax-q2") — read once
  // on mount to preselect the document/status filters below. Ignored once the user
  // interacts with the filters themselves.
  initialFilter?: string | null;
}

export default function ComplianceView({ user, token, refreshTrigger, onRefreshDashboard, initialFilter }: ComplianceViewProps) {
  const [taxes, setTaxes] = useState<TaxRecord[]>([]);
  const [permits, setPermits] = useState<PermitRecord[]>([]);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  // Separate from `clients` (active-only, used for the "assign to" dropdowns below) —
  // this includes deactivated clients too, so an old obligation from before a client
  // was deactivated still resolves to their real name instead of "Unknown Business".
  const [allClients, setAllClients] = useState<ClientProfile[]>([]);
  const [summary, setSummary] = useState<ComplianceSummary>({ overdue: 0, urgent: 0, upcoming: 0 });
  const [loading, setLoading] = useState(true);

  // Filters — document nature (tax vs permit), status, and (bookkeeper-only) client.
  const [documentFilter, setDocumentFilter] = useState<"all" | "tax" | "permit">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "overdue" | "urgent" | "upcoming">("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  // Narrows the tax list further to Q2 filings only, set via the "tax-q2" drill-down.
  // Dismissible with its own chip below, independent of documentFilter.
  const [q2Only, setQ2Only] = useState(false);

  // Applies the dashboard drill-down filter (if any) once on mount. "permits-at-risk"
  // jumps straight to permits due within 30 days ("urgent" — same threshold the
  // dashboard's own "Expiring within next 30 days" card copy uses); "tax-q2" narrows to
  // tax obligations and text-matches "Q2" client-side below (tax_type values look like
  // "Quarterly Percentage Tax (2551Q) - Q2").
  useEffect(() => {
    if (initialFilter === "permits-at-risk") {
      setDocumentFilter("permit");
      setStatusFilter("urgent");
    } else if (initialFilter === "tax-q2") {
      setDocumentFilter("tax");
      setQ2Only(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Add obligation modal state
  const [showTaxModal, setShowTaxModal] = useState(false);
  const [showPermitModal, setShowPermitModal] = useState(false);

  // Tax form state
  const [taxClientId, setTaxClientId] = useState("");
  const [taxType, setTaxType] = useState("Quarterly Percentage Tax (2551Q) - Q2");
  const [taxDueDate, setTaxDueDate] = useState("");
  const [taxAmount, setTaxAmount] = useState("");

  // Permit form state
  const [permitClientId, setPermitClientId] = useState("");
  const [permitType, setPermitType] = useState("Mayor's Permit Renewal");
  const [permitExpiryDate, setPermitExpiryDate] = useState("");
  const [permitFee, setPermitFee] = useState("");

  const [modalError, setModalError] = useState("");
  const [modalSuccess, setModalSuccess] = useState("");

  const isBookkeeper = user.role === "bookkeeper";

  const fetchComplianceData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      // 1. Fetch compliance items
      const cRes = await fetch("/api/compliance", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const cData = await cRes.json();

      // 2. Fetch clients list
      const clRes = await fetch("/api/clients", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const clData = await clRes.json();

      // 2b. Fetch full client list (including deactivated) for name resolution only
      const clAllRes = await fetch("/api/clients?status=all", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const clAllData = await clAllRes.json();

      // 3. Fetch count summary
      const sRes = await fetch("/api/compliance/summary", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const sData = await sRes.json();

      if (cRes.ok && clRes.ok && sRes.ok) {
        setTaxes(cData.taxes);
        setPermits(cData.permits);
        setClients(clData);
        if (clAllRes.ok) setAllClients(clAllData);
        setSummary(sData);

        // Prepopulate form dropdown IDs
        if (clData.length > 0) {
          setTaxClientId(clData[0].client_id.toString());
          setPermitClientId(clData[0].client_id.toString());
        }
      }
    } catch (e) {
      console.error("Failed loading compliance lists:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComplianceData();
  }, [token, refreshTrigger]);

  const handleCreateTax = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError("");
    setModalSuccess("");

    if (!taxClientId || !taxType || !taxDueDate || !taxAmount) {
      setModalError("Please complete all required fields.");
      return;
    }

    try {
      const res = await fetch("/api/compliance/tax", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          client_id: Number(taxClientId),
          tax_type: taxType,
          due_date: taxDueDate,
          amount: Number(taxAmount),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed creating tax item");

      setModalSuccess("Tax obligation created successfully!");
      setTimeout(() => {
        setShowTaxModal(false);
        setTaxDueDate("");
        setTaxAmount("");
        setModalSuccess("");
        fetchComplianceData();
        onRefreshDashboard();
      }, 1500);
    } catch (err: any) {
      setModalError(err.message);
    }
  };

  const handleCreatePermit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError("");
    setModalSuccess("");

    if (!permitClientId || !permitType || !permitExpiryDate || !permitFee) {
      setModalError("Please complete all required fields.");
      return;
    }

    try {
      const res = await fetch("/api/compliance/permit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          client_id: Number(permitClientId),
          permit_type: permitType,
          expiry_date: permitExpiryDate,
          fee: Number(permitFee),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed creating permit obligation");

      setModalSuccess("Permit obligation assigned successfully!");
      setTimeout(() => {
        setShowPermitModal(false);
        setPermitExpiryDate("");
        setPermitFee("");
        setModalSuccess("");
        fetchComplianceData();
        onRefreshDashboard();
      }, 1500);
    } catch (err: any) {
      setModalError(err.message);
    }
  };

  const handleDeleteTax = async (id: number) => {
    if (!isBookkeeper || !window.confirm("Delete this tax obligation item from registry?")) return;
    try {
      const res = await fetch(`/api/compliance/tax/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (res.ok) {
        fetchComplianceData();
        onRefreshDashboard();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeletePermit = async (id: number) => {
    if (!isBookkeeper || !window.confirm("Delete this permit requirement item?")) return;
    try {
      const res = await fetch(`/api/compliance/permit/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (res.ok) {
        fetchComplianceData();
        onRefreshDashboard();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getClientBusinessName = (id: number) => {
    return allClients.find((c) => c.client_id === id)?.business_name || "Unknown Business";
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm font-semibold text-gray-400 font-tabular">
        Aggregating compliance alerts...
      </div>
    );
  }

  // Client-filter applies only for a bookkeeper (a client only ever sees their own
  // obligations server-side already, so there's nothing to filter for them).
  const filteredTaxes = taxes
    .filter((t) => statusFilter === "all" || t.status === statusFilter)
    .filter((t) => !q2Only || t.tax_type.toLowerCase().includes("q2"))
    .filter((t) => !isBookkeeper || clientFilter === "all" || t.client_id.toString() === clientFilter);

  const filteredPermits = permits
    .filter((p) => statusFilter === "all" || p.status === statusFilter)
    .filter((p) => !isBookkeeper || clientFilter === "all" || p.client_id.toString() === clientFilter);

  const showTaxSection = documentFilter !== "permit";
  const showPermitSection = documentFilter !== "tax";
  const filtersActive = documentFilter !== "all" || statusFilter !== "all" || clientFilter !== "all" || q2Only;

  return (
    <div className="space-y-4">

      <div className="p-3 bg-white/10 border border-white/10 rounded-lg flex items-start gap-2 text-sm text-gray-300">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-400" />
        <span>This tracks government tax filings (BIR) and business permits by due date — mark one filed/renewed once you've submitted it, so it stops counting toward what's outstanding.</span>
      </div>

      <ClientDeadlineLookup
        clients={clients}
        isBookkeeper={isBookkeeper}
        token={token}
        onRegistered={() => {
          fetchComplianceData();
          onRefreshDashboard();
        }}
      />

      {/* Filters — document nature, status, and (bookkeeper-only) client */}
      <div className="p-3 bg-black/40 backdrop-blur-md rounded-lg border border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase font-tabular shrink-0">
            <Filter className="w-3.5 h-3.5" />
            Filter
          </span>

          <div className="flex bg-black/30 p-0.5 rounded-lg border border-white/10 shrink-0">
            {([
              { key: "all", label: "All Types" },
              { key: "tax", label: "Tax" },
              { key: "permit", label: "Permits" },
            ] as const).map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => setDocumentFilter(chip.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors focus:outline-none ${
                  documentFilter === chip.key ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="flex bg-black/30 p-0.5 rounded-lg border border-white/10 shrink-0">
            {([
              { key: "all", label: "All Statuses" },
              { key: "overdue", label: "Overdue" },
              { key: "urgent", label: "Urgent" },
              { key: "upcoming", label: "Upcoming" },
            ] as const).map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => setStatusFilter(chip.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors focus:outline-none ${
                  statusFilter === chip.key
                    ? chip.key === "overdue"
                      ? "bg-red-500/20 text-red-300"
                      : chip.key === "urgent"
                        ? "bg-orange-500/20 text-orange-300"
                        : "bg-purple-600 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {q2Only && (
            <button
              type="button"
              onClick={() => setQ2Only(false)}
              className="px-2.5 py-1 rounded-md text-xs font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 transition-colors focus:outline-none shrink-0"
              title="Clear Q2-only filter"
            >
              Q2 Filings Only ✕
            </button>
          )}

          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setDocumentFilter("all");
                setStatusFilter("all");
                setClientFilter("all");
                setQ2Only(false);
              }}
              className="text-xs font-bold text-gray-400 hover:text-white underline decoration-dotted shrink-0"
            >
              Clear filters
            </button>
          )}
        </div>

        {isBookkeeper && (
          <div className="flex items-center gap-2 shrink-0">
            <Users className="w-3.5 h-3.5 text-gray-400" />
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="px-2.5 py-1.5 text-sm bg-black/30 border border-white/10 hover:border-white/30 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-500 text-white font-medium"
            >
              <option value="all" className="bg-gray-900">All Clients</option>
              {clients.map((c) => (
                <option key={c.client_id} value={c.client_id} className="bg-gray-900">{c.business_name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Summary Row Cards (3) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-red-500 text-white flex items-center justify-center">
            <AlertOctagon className="w-4.5 h-4.5" />
          </div>
          <div>
            <span className="block text-xs font-bold text-red-400 uppercase font-tabular">Overdue Deadlines</span>
            <span className="block text-lg font-tabular font-extrabold text-red-400 mt-0.5">{summary.overdue} Tasks</span>
          </div>
        </div>

        <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-orange-500 text-white flex items-center justify-center">
            <Clock className="w-4.5 h-4.5" />
          </div>
          <div>
            <span className="block text-xs font-bold text-orange-400 uppercase font-tabular">Due within 30 days</span>
            <span className="block text-lg font-tabular font-extrabold text-orange-400 mt-0.5">{summary.urgent} Soon</span>
          </div>
        </div>

        <div className="p-3 bg-white/10 border border-white/10 rounded-lg flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-green-500 text-white flex items-center justify-center">
            <CalendarClock className="w-4.5 h-4.5" />
          </div>
          <div>
            <span className="block text-xs font-bold text-gray-300 uppercase font-tabular">Upcoming (30+ days)</span>
            <span className="block text-lg font-tabular font-extrabold text-gray-300 mt-0.5">{summary.upcoming} Items</span>
          </div>
        </div>
      </div>

      {/* TAX Compliance List Section */}
      {showTaxSection && (
      <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 space-y-4">
        <div className="flex justify-between items-center pb-2 border-b border-white/10">
          <div>
            <h4 className="font-display font-bold text-white text-sm">BIR Tax Compliance Registry</h4>
            <p className="text-sm text-gray-400">Obligation schedules to file Quarterly percentage & Annual Income Returns.</p>
          </div>
          {isBookkeeper && (
            <button
              onClick={() => setShowTaxModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg focus:outline-none transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Tax Deadline</span>
            </button>
          )}
        </div>

        {taxes.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">No BIR Tax tasks mapped.</div>
        ) : filteredTaxes.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">No tax obligations match the current filters.</div>
        ) : (
          <div className="space-y-2">
            {filteredTaxes.map((t) => {
              let accentColorClass = "border-l-4 border-l-white/10";
              if (t.status === "overdue") accentColorClass = "border-l-4 border-l-red-500";
              else if (t.status === "urgent") accentColorClass = "border-l-4 border-l-orange-500";
              else if (t.status === "filed") accentColorClass = "border-l-4 border-l-green-500";

              return (
                <div key={t.tax_id} className={`p-3 bg-black/30 rounded-lg border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${accentColorClass}`}>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-extrabold text-white">{t.tax_type}</span>
                      <span className="text-xs bg-black/40 backdrop-blur-md px-1.5 py-0.5 rounded text-gray-400 font-tabular font-bold truncate max-w-[140px] border border-white/10">
                        {getClientBusinessName(t.client_id)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 font-tabular">
                      Due Date: <strong className="text-white">{t.due_date}</strong>
                      {t.filed_date && ` · Filed on: ${t.filed_date}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-start">
                    <span className="font-tabular font-bold text-sm text-white">
                      {money(t.amount)}
                    </span>

                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-[14px] font-tabular font-bold uppercase rounded-md border ${
                        t.status === "filed"
                          ? "bg-green-500/10 text-green-400 border-green-500/30"
                          : t.status === "overdue"
                            ? "bg-red-500/10 text-red-400 border-red-500/30"
                            : "bg-orange-500/10 text-orange-400 border-orange-500/30"
                      }`}>
                        {t.status}
                      </span>
                      {isBookkeeper && (
                        <button
                          onClick={() => handleDeleteTax(t.tax_id)}
                          className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all font-bold"
                          title="Delete duty"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* PERMITS Compliance List Section */}
      {showPermitSection && (
      <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 space-y-4">
        <div className="flex justify-between items-center pb-2 border-b border-white/10">
          <div>
            <h4 className="font-display font-bold text-white text-sm">LGU Local Permit Renewals Monitor</h4>
            <p className="text-sm text-gray-400">Clearances and credentials corresponding to Sipocot municipal hall.</p>
          </div>
          {isBookkeeper && (
            <button
              onClick={() => setShowPermitModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg focus:outline-none transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Configure Permit</span>
            </button>
          )}
        </div>

        {permits.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">No active permit requirements listed.</div>
        ) : filteredPermits.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">No permit requirements match the current filters.</div>
        ) : (
          <div className="space-y-2">
            {filteredPermits.map((p) => {
              let accentColorClass = "border-l-4 border-l-white/10";
              if (p.status === "overdue") accentColorClass = "border-l-4 border-l-red-500";
              else if (p.status === "urgent") accentColorClass = "border-l-4 border-l-orange-500";
              else if (p.status === "renewed") accentColorClass = "border-l-4 border-l-green-500";

              return (
                <div key={p.permit_id} className={`p-4 bg-black/30 rounded-lg border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${accentColorClass}`}>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-extrabold text-white">{p.permit_type}</span>
                      <span className="text-xs bg-black/40 backdrop-blur-md px-1.5 py-0.5 rounded text-gray-400 font-tabular font-bold truncate max-w-[140px] border border-white/10">
                        {getClientBusinessName(p.client_id)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 font-tabular">
                      Expiry Date: <strong className="text-white">{p.expiry_date}</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-start">
                    <span className="font-tabular font-bold text-sm text-white">
                      {money(p.fee)}
                    </span>

                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-[14px] font-tabular font-bold uppercase rounded-md border ${
                        p.status === "renewed"
                          ? "bg-green-500/10 text-green-400 border-green-500/30"
                          : p.status === "overdue"
                            ? "bg-red-500/10 text-red-400 border-red-500/30"
                            : "bg-orange-500/10 text-orange-400 border-orange-500/30"
                      }`}>
                        {p.status}
                      </span>
                      {isBookkeeper && (
                        <button
                          onClick={() => handleDeletePermit(p.permit_id)}
                          className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all font-bold"
                          title="Delete permit duty"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* TAILORED ASSIGN TAX MODAL FORM */}
      {showTaxModal && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center p-4 z-50 animate-count-up backdrop-blur-xs">
          <div className="bg-black/40 backdrop-blur-md rounded-lg max-w-md w-full p-5 shadow-2xl border border-white/10">
            <div className="pb-3 mb-4 border-b border-white/10 flex justify-between items-center">
              <h4 className="font-display font-bold text-white text-sm uppercase font-tabular tracking-wider">Assign BIR Tax Duty</h4>
              <button onClick={() => setShowTaxModal(false)} className="text-gray-400 hover:text-gray-300 font-extrabold text-base">✕</button>
            </div>

            {modalError && <div className="p-2.5 mb-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold rounded">{modalError}</div>}
            {modalSuccess && <div className="p-2.5 mb-3 bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-semibold rounded">{modalSuccess}</div>}

            <form onSubmit={handleCreateTax} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Select Client Business</label>
                <select
                  value={taxClientId}
                  onChange={(e) => setTaxClientId(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                >
                  {clients.map((c) => (
                    <option key={c.client_id} value={c.client_id}>{c.business_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">BIR Filing / Form</label>
                <select
                  value={taxType}
                  onChange={(e) => setTaxType(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                >
                  <option value="Quarterly Percentage Tax (2551Q) - Q2">Quarterly Percentage Tax (2551Q) - Q2</option>
                  <option value="Quarterly Percentage Tax (2551Q) - Q3">Quarterly Percentage Tax (2551Q) - Q3</option>
                  <option value="Quarterly Income Tax (1701Q)">Quarterly Income Tax (1701Q) - Individuals</option>
                  <option value="Quarterly Income Tax (1702Q)">Quarterly Income Tax (1702Q) - Corporations</option>
                  <option value="Annual Income Tax Return (AITR)">Annual Income Tax Return (AITR)</option>
                  <option value="BIR Quarterly Compliance report">BIR Quarterly Compliance report</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">Each of these is a BIR form this Non-VAT business must file by its due date — pick whichever one you're recording.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Due Date</label>
                  <input
                    type="date"
                    required
                    value={taxDueDate}
                    onChange={(e) => setTaxDueDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-tabular text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Estimated Tax Amount (₱)</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 4500"
                    value={taxAmount}
                    onChange={(e) => setTaxAmount(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm font-bold text-white shadow-md transition-all focus:outline-none"
              >
                Register Duty
              </button>
            </form>
          </div>
        </div>
      )}

      {/* CONFIGURE PERMIT MODAL FORM */}
      {showPermitModal && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center p-4 z-50 animate-count-up backdrop-blur-xs">
          <div className="bg-black/40 backdrop-blur-md rounded-lg max-w-md w-full p-5 shadow-2xl border border-white/10">
            <div className="pb-3 mb-4 border-b border-white/10 flex justify-between items-center">
              <h4 className="font-display font-bold text-white text-sm uppercase font-tabular tracking-wider">Assign Permit Duty</h4>
              <button onClick={() => setShowPermitModal(false)} className="text-gray-400 hover:text-gray-300 font-extrabold text-base">✕</button>
            </div>

            {modalError && <div className="p-2.5 mb-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold rounded">{modalError}</div>}
            {modalSuccess && <div className="p-2.5 mb-3 bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-semibold rounded">{modalSuccess}</div>}

            <form onSubmit={handleCreatePermit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Select Client Business</label>
                <select
                  value={permitClientId}
                  onChange={(e) => setPermitClientId(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                >
                  {clients.map((c) => (
                    <option key={c.client_id} value={c.client_id}>{c.business_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Permit Type Classification</label>
                <select
                  value={permitType}
                  onChange={(e) => setPermitType(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                >
                  <option value="Mayor's Permit Renewal">Mayor's Permit Renewal</option>
                  <option value="Fire Safety Certificate">Fire Safety Certificate</option>
                  <option value="Business Permit">Business Permit</option>
                  <option value="Sanitary Clearance Permit">Sanitary Clearance Permit</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Expiry/Dues Date</label>
                  <input
                    type="date"
                    required
                    value={permitExpiryDate}
                    onChange={(e) => setPermitExpiryDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-tabular text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Government Registration fee (₱)</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 1500"
                    value={permitFee}
                    onChange={(e) => setPermitFee(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm font-bold text-white shadow-md transition-all focus:outline-none"
              >
                Configure Permit Requirement
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
export { ComplianceView };

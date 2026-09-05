import React, { useState, useEffect } from "react";
import {
  Plus,
  Search,
  ShieldCheck,
  Phone,
  MapPin,
  Layers,
  Trash2,
  CheckCircle,
  TrendingUp,
  FileCheck2,
  CalendarCheck,
  Tag,
  Eye,
  EyeOff,
  KeyRound,
  Copy,
  Check,
  XCircle,
  Pencil,
  Lock,
  Building2,
  Mail,
  UserPlus,
  Send
} from "lucide-react";
import { User, ClientProfile, TaxRecord, PermitRecord, Account, JournalEntry, ClientInvite } from "../types";
import { money } from "../lib/currency";

interface ClientsViewProps {
  user: User;
  token: string | null;
  onRefreshDashboard: () => void;
}

export default function ClientsView({ user, token, onRefreshDashboard }: ClientsViewProps) {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientProfile | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<"summary" | "taxes" | "permits" | "journals">("summary");
  const [loading, setLoading] = useState(true);

  // Client Details sub-states
  const [clientTaxes, setClientTaxes] = useState<TaxRecord[]>([]);
  const [clientPermits, setClientPermits] = useState<PermitRecord[]>([]);
  const [clientAccounts, setClientAccounts] = useState<Account[]>([]);
  const [clientJournals, setClientJournals] = useState<JournalEntry[]>([]);

  // Bookkeeper Fee Arrangement (bookkeeper-only edit — the client sees this read-only
  // from their own Payments screen)
  const [editingFee, setEditingFee] = useState(false);
  const [feeType, setFeeType] = useState<"flat" | "percentage">("flat");
  const [feeAmount, setFeeAmount] = useState("0");
  const [savingFee, setSavingFee] = useState(false);
  const [feeError, setFeeError] = useState("");

  // Add Client Modal states — two onboarding paths live in the same modal, matching
  // how onboarding actually happens: "Enter Details" is for when the bookkeeper is
  // sitting with the client and their documents right now (the common case — most
  // Sipocot clients are onboarded in person); "Invite Code" is for handing off
  // self-registration when the bookkeeper doesn't have the client's details on hand yet.
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalMode, setAddModalMode] = useState<"direct" | "invite">("direct");

  // "Enter Details" tab states — mirrors the same fields the client fills in on their
  // own self-registration screen, since a bookkeeper entering it directly is really
  // just doing that same intake on the client's behalf.
  const [newBusinessName, setNewBusinessName] = useState("");
  const [newBusinessType, setNewBusinessType] = useState("Sole Proprietorship");
  const [newTin, setNewTin] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newContactNumber, setNewContactNumber] = useState("");
  const [newOwnerName, setNewOwnerName] = useState("");
  const [newOwnerEmail, setNewOwnerEmail] = useState("");
  const [newSetPasswordNow, setNewSetPasswordNow] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [addingClientDirect, setAddingClientDirect] = useState(false);
  const [directAddError, setDirectAddError] = useState("");
  const [directAddResult, setDirectAddResult] = useState<{ email: string; pending_activation: boolean } | null>(null);

  // Invite Code tab states (lives inside the Add Client modal)
  const [invites, setInvites] = useState<ClientInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [inviteLabel, setInviteLabel] = useState("");
  // The code just generated in this modal session gets a "hero" highlight so the
  // bookkeeper's eye goes straight to the one thing they need to hand off.
  const [freshInviteId, setFreshInviteId] = useState<number | null>(null);

  const isBookkeeper = user.role === "bookkeeper";

  const fetchClients = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/clients", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setClients(data);
        // If logged-in user is a client, immediately auto-select their single own profile
        if (!isBookkeeper && data.length > 0) {
          handleSelectClient(data[0]);
        }
      }
    } catch (e) {
      console.error("Failed fetching clients profiles:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [token]);

  const fetchInvites = async () => {
    if (!token || !isBookkeeper) return;
    setInvitesLoading(true);
    try {
      const res = await fetch("/api/invites", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setInvites(data);
    } catch (e) {
      console.error("Failed fetching invite codes:", e);
    } finally {
      setInvitesLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setShowAddModal(true);
    setAddModalMode("direct");
    setInviteError("");
    setFreshInviteId(null);
    setInviteLabel("");
    fetchInvites();

    setNewBusinessName("");
    setNewBusinessType("Sole Proprietorship");
    setNewTin("");
    setNewAddress("");
    setNewContactNumber("");
    setNewOwnerName("");
    setNewOwnerEmail("");
    setNewSetPasswordNow(false);
    setNewPassword("");
    setDirectAddError("");
    setDirectAddResult(null);
  };

  const handleAddClientDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setAddingClientDirect(true);
    setDirectAddError("");
    setDirectAddResult(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          business_name: newBusinessName.trim(),
          business_type: newBusinessType,
          tin: newTin.trim(),
          address: newAddress.trim(),
          contact_number: newContactNumber.trim(),
          owner_name: newOwnerName.trim(),
          owner_email: newOwnerEmail.trim(),
          password: newSetPasswordNow ? newPassword : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to add client");
      setDirectAddResult(data.credentials);
      await fetchClients();
      onRefreshDashboard();
    } catch (err: any) {
      setDirectAddError(err.message || "Failed to add client");
    } finally {
      setAddingClientDirect(false);
    }
  };

  const handleGenerateInvite = async () => {
    if (!token) return;
    setGeneratingInvite(true);
    setInviteError("");
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ label: inviteLabel.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to generate invite code");
      }
      setInvites((prev) => [data, ...prev]);
      setFreshInviteId(data.invite_id);
      setInviteLabel("");
    } catch (err: any) {
      setInviteError(err.message || "Failed to generate invite code");
    } finally {
      setGeneratingInvite(false);
    }
  };

  const handleRevokeInvite = async (inviteId: number) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/invites/${inviteId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to revoke invite code");
      }
      setInvites((prev) => prev.map((i) => (i.invite_id === inviteId ? data : i)));
      setFreshInviteId((id) => (id === inviteId ? null : id));
    } catch (err: any) {
      setInviteError(err.message || "Failed to revoke invite code");
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1500);
    });
  };

  const handleSelectClient = async (client: ClientProfile) => {
    setSelectedClient(client);
    if (!token) return;

    try {
      // Fetch compliance taxes
      const taxRes = await fetch("/api/compliance", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const compData = await taxRes.json();

      // Fetch accounts balance
      const acctRes = await fetch(`/api/accounts?clientId=${client.client_id}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const accts = await acctRes.json();

      // Fetch journal lines
      const journalRes = await fetch(`/api/journal?clientId=${client.client_id}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const journals = await journalRes.json();

      if (taxRes.ok) {
        setClientTaxes((compData.taxes || []).filter((t: any) => t.client_id === client.client_id));
        setClientPermits((compData.permits || []).filter((p: any) => p.client_id === client.client_id));
      }
      if (acctRes.ok) {
        setClientAccounts(accts);
      }
      if (journalRes.ok) {
        setClientJournals(journals);
      }
    } catch (e) {
      console.error("Failed loading detailed client data cards:", e);
    }
  };

  const handleStartEditFee = () => {
    if (!selectedClient) return;
    setFeeType(selectedClient.bookkeeper_fee_type);
    setFeeAmount(selectedClient.bookkeeper_fee_amount.toString());
    setFeeError("");
    setEditingFee(true);
  };

  const handleSaveFee = async () => {
    if (!token || !selectedClient) return;
    const amountNum = Number(feeAmount);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      setFeeError("Fee amount must be a non-negative number.");
      return;
    }
    setSavingFee(true);
    setFeeError("");
    try {
      const res = await fetch(`/api/clients/${selectedClient.client_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ bookkeeper_fee_type: feeType, bookkeeper_fee_amount: amountNum }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save fee arrangement");
      setSelectedClient(data);
      setClients((prev) => prev.map((c) => (c.client_id === data.client_id ? data : c)));
      setEditingFee(false);
    } catch (e: any) {
      setFeeError(e.message);
    } finally {
      setSavingFee(false);
    }
  };

  const handleAuditActionAfterFiling = () => {
    if (selectedClient) {
      handleSelectClient(selectedClient);
      onRefreshDashboard();
    }
  };

  const handleMarkTaxFiled = async (taxId: number) => {
    if (!token || !isBookkeeper) return;
    try {
      const res = await fetch(`/api/compliance/tax/${taxId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "filed", filed_date: new Date().toISOString().split("T")[0] }),
      });
      if (res.ok) {
        handleAuditActionAfterFiling();
      }
    } catch (e) {
      console.error("Filing failed:", e);
    }
  };

  const handleMarkPermitRenewed = async (permitId: number) => {
    if (!token || !isBookkeeper) return;
    try {
      const res = await fetch(`/api/compliance/permit/${permitId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "renewed" }),
      });
      if (res.ok) {
        handleAuditActionAfterFiling();
      }
    } catch (e) {
      console.error("Renewal failed:", e);
    }
  };

  const handleSoftDeleteClient = async (clientId: number) => {
    if (!token || !window.confirm("Are you sure you want to soft delete and deactivate this client profile? All records will remain archived in backing store.")) return;
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (res.ok) {
        setSelectedClient(null);
        fetchClients();
        onRefreshDashboard();
      }
    } catch (e) {
      console.error("Soft deletion failed:", e);
    }
  };

  const handleApproveClient = async (clientId: number) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/approve`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (res.ok) {
        const updated = await res.json();
        setClients((prev) => prev.map((c) => (c.client_id === clientId ? updated : c)));
      }
    } catch (e) {
      console.error("Client approval failed:", e);
    }
  };

  // Splits the freshly generated code out of the list so it can be rendered as a
  // standalone hero card, with the rest kept as plain history underneath.
  const freshInvite = freshInviteId ? invites.find((i) => i.invite_id === freshInviteId) || null : null;
  const olderInvites = invites.filter((i) => i.invite_id !== freshInviteId);

  // Labels typed on past codes, offered back as autocomplete suggestions so repeat
  // entries (e.g. a bookkeeper generating a fresh code after a client lost the old one)
  // don't require retyping the same business name.
  const labelSuggestions = Array.from(new Set(invites.map((i) => i.label).filter((l): l is string => !!l)));

  // Real-time search by business name or TIN
  const filteredClients = clients.filter(
    (c) =>
      c.business_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.tin.includes(searchTerm)
  );

  // Financial aggregates computations for selected client
  const assetsSum = clientAccounts.filter((a) => a.account_type === "asset").reduce((s, a) => s + a.balance, 0);
  const liabilitiesSum = clientAccounts.filter((a) => a.account_type === "liability").reduce((s, a) => s + a.balance, 0);
  const equitySum = clientAccounts.filter((a) => a.account_type === "equity").reduce((s, a) => s + a.balance, 0);
  const revenueSum = clientAccounts.filter((a) => a.account_type === "revenue").reduce((s, a) => s + a.balance, 0);
  const expenseSum = clientAccounts.filter((a) => a.account_type === "expense").reduce((s, a) => s + a.balance, 0);

  // Derived overall compliance standing for the selected client (used for header status pill)
  const hasOverdue = clientTaxes.some((t) => t.status === "overdue") || clientPermits.some((p) => p.status === "overdue");
  const hasUrgent = clientTaxes.some((t) => t.status === "urgent") || clientPermits.some((p) => p.status === "urgent");
  const overallStatus = hasOverdue ? "Overdue" : hasUrgent ? "Due Soon" : "Compliant";
  const overallStatusClass = hasOverdue
    ? "bg-red-500/10 text-red-400 border-red-500/30"
    : hasUrgent
      ? "bg-orange-500/10 text-orange-400 border-orange-500/30"
      : "bg-green-500/10 text-green-400 border-green-500/30";

  return (
    <div className="space-y-5">

      {/* Dynamic Master-Detail Split Screen for Bookkeeper */}
      {isBookkeeper && !selectedClient && (
        <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="font-display font-bold text-white text-sm">Sipocot Client Ledger Database</h3>
              <p className="text-sm text-gray-400">Registry of Non-VAT small business clients.</p>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder="Search business name or TIN..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 w-[220px] text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 focus:bg-black/20 text-white"
                />
              </div>

              <button
                onClick={handleOpenAddModal}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-all focus:outline-none"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Client</span>
              </button>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm font-bold text-gray-400 font-tabular">
              Loading active bookkeeping directories...
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">
              No registered client accounts match search criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {filteredClients.map((client) => (
                <div
                  key={client.client_id}
                  className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 flex flex-col justify-between hover:border-white/30 hover:shadow-md transition-all group lg:min-h-[160px]"
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-gray-300 font-bold text-sm uppercase">
                        {client.business_name[0]}
                      </div>
                      {client.approval_status === "pending" && (
                        <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/30 text-[13px] font-bold uppercase tracking-wider">
                          Pending Approval
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="font-bold text-white text-sm group-hover:text-gray-300 truncate">{client.business_name}</h4>
                      <p className="text-xs text-gray-400 font-tabular mt-0.5">TIN: {client.tin}</p>
                    </div>

                    <div className="space-y-1 pt-1.5 text-xs text-gray-400 border-t border-white/10">
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{client.business_type}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{client.address}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 flex justify-between items-center bg-transparent mt-2">
                    <button
                      onClick={() => handleSelectClient(client)}
                      className="text-sm font-bold text-gray-300 hover:text-white hover:underline flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Ledger Profile
                    </button>
                    {isBookkeeper && (
                      <div className="flex items-center gap-1">
                        {client.approval_status === "pending" && (
                          <button
                            onClick={() => handleApproveClient(client.client_id)}
                            className="px-2 py-1 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded flex items-center gap-1"
                            title="Approve this client's registration"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Approve
                          </button>
                        )}
                        <button
                          onClick={() => handleSoftDeleteClient(client.client_id)}
                          className="text-gray-400 hover:text-red-400 p-1 rounded hover:bg-red-500/10"
                          title="Archive client"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CLIENT DETAILED INTEGRATED DASHBOARD PREVIEW TAB */}
      {selectedClient && (
        <div className="space-y-4">

          {/* Back context header for CPA */}
          {isBookkeeper && (
            <button
              onClick={() => setSelectedClient(null)}
              className="px-3 py-1.5 text-sm font-semibold bg-black/40 backdrop-blur-md hover:bg-black/30 text-white border border-white/10 rounded-lg transition-all focus:outline-none"
            >
              ← Back to Sipocot Client List
            </button>
          )}

          {/* Client Header profile detail card */}
          <div className="p-4 bg-black/40 backdrop-blur-md rounded-lg border border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-lg bg-white/10 text-gray-300 font-extrabold text-lg flex items-center justify-center uppercase shrink-0 border border-white/10">
                {selectedClient.business_name[0]}
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-display font-bold text-white text-base">{selectedClient.business_name}</h3>
                  <span className={`inline-flex px-1.5 py-0.5 rounded text-[14px] font-tabular font-bold uppercase border ${overallStatusClass}`}>
                    {overallStatus}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 mt-1 text-sm text-gray-400">
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-gray-400" />
                    <span>{selectedClient.business_type}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-gray-400" />
                    <span className="font-tabular">TIN: {selectedClient.tin}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-gray-400" />
                    <span className="truncate">{selectedClient.address}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                    <span>{selectedClient.contact_number}</span>
                  </div>
                </div>
              </div>
            </div>

            {isBookkeeper && (
              <button
                onClick={() => handleSoftDeleteClient(selectedClient.client_id)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 rounded-lg font-bold transition-all shrink-0 self-start md:self-center"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Archive Business</span>
              </button>
            )}
          </div>

          {/* Sub Tab Navigation bar inside single detailed view */}
          <div className="flex border-b border-white/10 bg-black/40 backdrop-blur-md px-3 rounded-t-lg">
            {[
              { id: "summary", label: "Financial Summary", icon: TrendingUp },
              { id: "taxes", label: `Tax Records (${clientTaxes.length})`, icon: FileCheck2 },
              { id: "permits", label: `Permits (${clientPermits.length})`, icon: CalendarCheck },
              { id: "journals", label: `Journal Ledger Timeline (${clientJournals.length})`, icon: Layers },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id as any)}
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold focus:outline-none transition-all ${
                    isActive
                      ? "border-b-2 border-purple-500 text-white font-bold"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Sub Contents render */}
          <div className="bg-black/40 backdrop-blur-md border border-t-0 border-white/10 p-4 rounded-b-lg min-h-[250px]">

            {activeSubTab === "summary" && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-display font-bold text-white text-sm">Account Balance Summary</h4>
                  <p className="text-sm text-gray-400">Totals per account category, added up from every account in this business's chart of accounts.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                  <div className="p-3 bg-white/10 rounded-lg border border-white/10 flex flex-col justify-between">
                    <span className="text-xs font-bold text-gray-300 uppercase font-tabular">Revenues</span>
                    <span className="text-lg font-tabular font-extrabold text-gray-300 mt-1">{money(revenueSum)}</span>
                  </div>
                  <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/30 flex flex-col justify-between">
                    <span className="text-xs font-bold text-purple-400 uppercase font-tabular">Expenses</span>
                    <span className="text-lg font-tabular font-extrabold text-purple-400 mt-1">{money(expenseSum)}</span>
                  </div>
                  <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/30 flex flex-col justify-between">
                    <span className="text-xs font-bold text-purple-400 uppercase font-tabular">Assets</span>
                    <span className="text-lg font-tabular font-extrabold text-purple-400 mt-1">{money(assetsSum)}</span>
                  </div>
                  <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/30 flex flex-col justify-between">
                    <span className="text-xs font-bold text-red-400 uppercase font-tabular">Liabilities</span>
                    <span className="text-lg font-tabular font-extrabold text-red-400 mt-1">{money(liabilitiesSum)}</span>
                  </div>
                  <div className="p-3 bg-black/30 rounded-lg border border-white/10 flex flex-col justify-between">
                    <span className="text-xs font-bold text-gray-400 uppercase font-tabular">Capital Equity</span>
                    <span className="text-lg font-tabular font-extrabold text-white mt-1">{money(equitySum)}</span>
                  </div>
                </div>

                {/* CPA Validation checklist */}
                <div className="p-3.5 bg-purple-500/10 border border-purple-500/30 rounded-lg space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-400 uppercase font-tabular">
                    <ShieldCheck className="w-4 h-4 text-purple-400" />
                    Audit Identity Check
                  </span>
                  <p className="text-sm text-white leading-normal">
                    Everything this business owns (Assets) should equal everything it owes plus the owner's stake (Liabilities + Equity):
                    <span className="font-tabular font-bold whitespace-nowrap ml-1 text-gray-900 bg-white px-1.5 py-0.5 rounded border border-purple-500/30 text-xs">
                      {money(assetsSum)} (Assets) = {money(liabilitiesSum + equitySum)} (Liabilities + Equity)
                    </span>.
                    Audit standing is {Math.abs(assetsSum - (liabilitiesSum + equitySum)) <= 0.02 ? "PERFECTLY BALANCED (No errors detected)" : "UNBALANCED - Needs double checking journals"}.
                  </p>
                </div>

                {/* Bookkeeper Fee Arrangement — only the bookkeeper edits this; the
                    client sees the same figures read-only from their Payments screen. */}
                {selectedClient && (
                  <div className="p-3.5 bg-black/40 backdrop-blur-md border border-white/10 rounded-lg space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-gray-400 uppercase font-tabular tracking-wider">Bookkeeper Fee Arrangement</span>
                      {isBookkeeper && !editingFee && (
                        <button
                          onClick={handleStartEditFee}
                          className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white shrink-0"
                          title="Edit fee arrangement"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {editingFee ? (
                      <div className="p-3 bg-black/30 rounded-lg border border-white/10 space-y-2.5">
                        {feeError && <div className="p-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold rounded">{feeError}</div>}
                        <div className="flex items-center gap-2">
                          <select
                            value={feeType}
                            onChange={(e) => setFeeType(e.target.value as "flat" | "percentage")}
                            className="px-2 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                          >
                            <option value="flat">Fixed amount per month (₱)</option>
                            <option value="percentage">Percentage of monthly revenue (%)</option>
                          </select>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={feeAmount}
                            onChange={(e) => setFeeAmount(e.target.value)}
                            className="w-28 px-2 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white font-tabular"
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={handleSaveFee}
                            disabled={savingFee}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold rounded"
                          >
                            {savingFee ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={() => setEditingFee(false)}
                            className="px-3 py-1.5 bg-black/30 border border-white/10 text-gray-300 text-sm font-bold rounded hover:bg-white/10"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-white flex items-center gap-1.5">
                        {!isBookkeeper && <Lock className="w-2.5 h-2.5 text-gray-400 shrink-0" />}
                        {selectedClient.bookkeeper_fee_type === "flat"
                          ? `Fixed ${money(selectedClient.bookkeeper_fee_amount)} per month`
                          : `${selectedClient.bookkeeper_fee_amount}% of monthly revenue`}
                        {!isBookkeeper && <span className="text-gray-400">— set by your bookkeeper</span>}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeSubTab === "taxes" && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-display font-bold text-white text-sm">Quarterly & Annual Compliance Obligations</h4>
                    <p className="text-sm text-gray-400">Government taxes and filings assigned to this business.</p>
                  </div>
                </div>

                {clientTaxes.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-400">No BIR tax deadlines tracked yet.</div>
                ) : (
                  <div className="divide-y divide-white/10 border border-white/10 rounded-lg overflow-hidden">
                    {clientTaxes.map((tax) => {
                      const isFiled = tax.status === "filed";
                      return (
                        <div key={tax.tax_id} className={`p-3.5 hover:bg-black/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isFiled ? "bg-black/20" : ""}`}>
                          <div className="flex items-start gap-3">
                            <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                              tax.status === "filed" ? "bg-green-500" : tax.status === "overdue" ? "bg-red-500" : "bg-orange-500 animate-pulse"
                            }`} />
                            <div className="space-y-0.5">
                              <p className="font-bold text-sm text-white">{tax.tax_type}</p>
                              <p className="text-xs text-gray-400 font-tabular">
                                Deadline Due: <strong className="text-white">{tax.due_date}</strong>
                                {tax.filed_date && ` · Filed on: ${tax.filed_date}`}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-start">
                            <span className="font-tabular font-bold text-sm text-white">
                              {money(tax.amount)}
                            </span>

                            <div className="flex items-center gap-2">
                              {tax.status !== "filed" && isBookkeeper && (
                                <button
                                  onClick={() => handleMarkTaxFiled(tax.tax_id)}
                                  className="px-2.5 py-1 text-xs font-bold text-white bg-purple-600 rounded hover:bg-purple-500 transition-all"
                                >
                                  Mark as Filed
                                </button>
                              )}
                              <span className={`px-2 py-0.5 text-[14px] font-tabular font-bold uppercase rounded-full border ${
                                tax.status === "filed"
                                  ? "bg-green-500/10 text-green-400 border-green-500/30"
                                  : tax.status === "overdue"
                                    ? "bg-red-500/10 text-red-400 border-red-500/30 animate-pulse"
                                    : "bg-orange-500/10 text-orange-400 border-orange-500/30"
                              }`}>
                                {tax.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeSubTab === "permits" && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-display font-bold text-white text-sm">Municipal Business Permits Monitor</h4>
                  <p className="text-sm text-gray-400">Local Sipocot LGU clearances requirements.</p>
                </div>

                {clientPermits.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-400">No Business permits assigned.</div>
                ) : (
                  <div className="divide-y divide-white/10 border border-white/10 rounded-lg overflow-hidden">
                    {clientPermits.map((permit) => {
                      const isRenewed = permit.status === "renewed";
                      return (
                        <div key={permit.permit_id} className={`p-3.5 hover:bg-black/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isRenewed ? "bg-black/20" : ""}`}>
                          <div className="space-y-0.5">
                            <h5 className="font-bold text-sm text-white">{permit.permit_type}</h5>
                            <p className="text-xs text-gray-400 font-tabular">
                              Expiry: <strong className="text-white">{permit.expiry_date}</strong>
                            </p>
                          </div>

                          <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-start">
                            <span className="font-tabular font-bold text-sm text-white">
                              Fee: {money(permit.fee)}
                            </span>
                            <div className="flex items-center gap-2">
                              {permit.status !== "renewed" && isBookkeeper && (
                                <button
                                  onClick={() => handleMarkPermitRenewed(permit.permit_id)}
                                  className="px-2.5 py-1 text-xs font-bold text-white bg-purple-600 rounded hover:bg-purple-700 transition-all"
                                >
                                  Mark as Renewed
                                </button>
                              )}
                              <span className={`px-2 py-0.5 text-[14px] font-tabular font-bold uppercase rounded-md border ${
                                permit.status === "renewed"
                                  ? "bg-green-500/10 text-green-400 border-green-500/30"
                                  : permit.status === "overdue"
                                    ? "bg-red-500/10 text-red-400 border-red-500/30"
                                    : "bg-orange-500/10 text-orange-400 border-orange-500/30"
                              }`}>
                                {permit.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeSubTab === "journals" && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-display font-bold text-white text-sm">Chronological Double-Entry Journal Audit</h4>
                  <p className="text-sm text-gray-400">History of entries ledgered by the bookkeeper for this specific business.</p>
                </div>

                {clientJournals.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-400">No journal lines registered yet. Feel free to add entries under Journal tab.</div>
                ) : (
                  <div className="space-y-3">
                    {clientJournals.map((journal) => (
                      <div key={journal.journal_id} className="p-3.5 bg-black/30 rounded-lg border border-white/10 space-y-2.5">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 pb-2 border-b border-white/10">
                          <div className="flex items-center gap-2">
                            <span className="bg-purple-600 text-white font-tabular font-bold text-xs px-2 py-0.5 rounded">
                              {journal.reference}
                            </span>
                            <h5 className="font-bold text-white text-sm">{journal.description}</h5>
                          </div>
                          <span className="text-xs text-gray-400 font-tabular font-semibold">
                            Date Posted: {journal.entry_date}
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm border-collapse">
                            <thead>
                              <tr className="text-gray-400 font-tabular text-[14px] uppercase border-b border-white/10">
                                <th className="py-1 px-1">Account</th>
                                <th className="py-1 px-1">Type</th>
                                <th className="py-1 px-1 text-right">Debit (₱)</th>
                                <th className="py-1 px-1 text-right">Credit (₱)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10 font-tabular text-sm">
                              {journal.lines.map((line, lIdx) => (
                                <tr key={lIdx}>
                                  <td className={`py-1.5 px-1 ${line.credit > 0 ? "pl-6 text-gray-400" : "font-semibold text-white"}`}>
                                    {line.account_name}
                                  </td>
                                  <td className="py-1.5 px-1 text-xs text-gray-400 capitalize">{line.account_type}</td>
                                  <td className="py-1.5 px-1 text-right font-medium text-white">{line.debit > 0 ? money(line.debit) : "—"}</td>
                                  <td className="py-1.5 px-1 text-right font-medium text-white">{line.credit > 0 ? money(line.credit) : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {/* ADD NEW CLIENT MODAL DIALOG CONTAINER */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-count-up">
          <div className="bg-black/40 backdrop-blur-md rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-white/10 max-h-[90vh] overflow-y-auto">

            <div className="pb-4 mb-4 border-b border-white/10 flex justify-between items-center">
              <div>
                <h4 className="font-display font-bold text-white text-base uppercase font-tabular tracking-wider">Add New Client</h4>
                <p className="text-sm text-gray-400 mt-0.5">
                  {addModalMode === "direct"
                    ? "Enter the client's details yourself — the usual path when you're onboarding them in person."
                    : "Send a one-time code so the client fills in their own business profile remotely."}
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-white font-extrabold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="flex bg-black/30 p-0.5 rounded-lg border border-white/10 mb-4 w-fit">
              <button
                type="button"
                onClick={() => setAddModalMode("direct")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold focus:outline-none transition-all ${
                  addModalMode === "direct" ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Enter Details
              </button>
              <button
                type="button"
                onClick={() => setAddModalMode("invite")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold focus:outline-none transition-all ${
                  addModalMode === "invite" ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                Invite Code
              </button>
            </div>

            {addModalMode === "direct" && (
              <div>
                {directAddResult ? (
                  <div className="p-5 bg-green-500/10 border border-green-500/30 rounded-xl space-y-3 text-center animate-count-up">
                    <CheckCircle className="w-8 h-8 text-green-400 mx-auto" />
                    <div>
                      <h5 className="font-bold text-white text-sm">{newBusinessName} added successfully</h5>
                      {directAddResult.pending_activation ? (
                        <p className="text-sm text-gray-300 mt-1">
                          An activation email was sent to <strong className="text-white">{directAddResult.email}</strong> — the client will set their own password there before their first sign-in.
                        </p>
                      ) : (
                        <p className="text-sm text-gray-300 mt-1">
                          Login is ready now: <strong className="text-white">{directAddResult.email}</strong> with the password you set.
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg focus:outline-none"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleAddClientDirect} className="space-y-3">
                    {directAddError && (
                      <div className="p-3 bg-red-500/10 text-red-400 rounded-lg text-sm font-medium border border-red-500/30">
                        {directAddError}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Business Name</label>
                        <div className="relative">
                          <Building2 className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            required
                            placeholder="e.g. Sipocot Bakery & Café"
                            value={newBusinessName}
                            onChange={(e) => setNewBusinessName(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white placeholder:text-gray-400"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Business Type</label>
                        <select
                          value={newBusinessType}
                          onChange={(e) => setNewBusinessType(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                        >
                          <option value="Sole Proprietorship">Sole Proprietorship</option>
                          <option value="Partnership">Partnership</option>
                          <option value="Corporation">Corporation</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase font-tabular tracking-wider">TIN (Tax Identification No.)</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 123-456-789-000"
                        value={newTin}
                        onChange={(e) => setNewTin(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white font-tabular placeholder:text-gray-400"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Business Address</label>
                        <div className="relative">
                          <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            required
                            placeholder="e.g. San Juan Ave, Sipocot"
                            value={newAddress}
                            onChange={(e) => setNewAddress(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white placeholder:text-gray-400"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Contact Number</label>
                        <div className="relative">
                          <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            required
                            placeholder="e.g. 0917-123-4567"
                            value={newContactNumber}
                            onChange={(e) => setNewContactNumber(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white placeholder:text-gray-400"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Owner's Full Name</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Juan Dela Cruz"
                          value={newOwnerName}
                          onChange={(e) => setNewOwnerName(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white placeholder:text-gray-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Login Email</label>
                        <div className="relative">
                          <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="email"
                            required
                            placeholder="e.g. juan@sipocotbakery.com"
                            value={newOwnerEmail}
                            onChange={(e) => setNewOwnerEmail(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white placeholder:text-gray-400"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-white/5 border border-white/10 rounded-lg space-y-2">
                      <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newSetPasswordNow}
                          onChange={(e) => setNewSetPasswordNow(e.target.checked)}
                          className="w-3.5 h-3.5 accent-purple-500"
                        />
                        Set the client's password myself right now
                      </label>
                      {newSetPasswordNow ? (
                        <div className="relative">
                          <input
                            type={showNewPassword ? "text" : "password"}
                            required
                            placeholder="Password for the client to sign in with"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            minLength={6}
                            className="w-full px-3 pr-10 py-2 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white placeholder:text-gray-400"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword((v) => !v)}
                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-white"
                          >
                            {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 flex items-center gap-1.5">
                          <Send className="w-3 h-3 shrink-0" />
                          Leave unchecked to email the client an activation link so they set their own password instead.
                        </p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={addingClientDirect}
                      className="w-full py-2.5 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 rounded-xl text-sm font-bold text-white shadow-lg transition-all focus:outline-none disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                      {addingClientDirect ? (
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" />
                          Add Client
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            )}

            {addModalMode === "invite" && (
            <div>
                {inviteError && (
                  <div className="p-3 mb-4 bg-red-500/10 text-red-400 rounded-lg text-sm font-medium border border-red-500/30">
                    {inviteError}
                  </div>
                )}

                <p className="text-sm text-gray-400 mb-4">
                  Generate a code and share it with the client. They'll register at the "Register as New Client" screen and fill in their own business details and password — no need to type anything for them here.
                </p>

                <div className="mb-3">
                  <label className="block text-sm font-semibold text-gray-400 mb-1">Who's this for? (optional)</label>
                  <input
                    type="text"
                    list="invite-label-suggestions"
                    placeholder="e.g. Juan's Sari-Sari Store"
                    value={inviteLabel}
                    onChange={(e) => setInviteLabel(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                  />
                  <datalist id="invite-label-suggestions">
                    {labelSuggestions.map((label) => (
                      <option key={label} value={label} />
                    ))}
                  </datalist>
                  <p className="text-xs text-gray-400 mt-1">
                    Just a note for your own tracking — the client still fills in their real business details themselves.
                  </p>
                </div>

                <button
                  onClick={handleGenerateInvite}
                  disabled={generatingInvite}
                  className="w-full mb-4 flex items-center justify-center gap-1.5 py-2.5 bg-purple-600 hover:bg-purple-700 rounded-xl text-sm font-bold text-white shadow-lg transition-all focus:outline-none disabled:opacity-60"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {generatingInvite ? "Generating..." : "Generate New Invite Code"}
                </button>

                {/* Hero card: the code just generated in this session, highlighted so it's unmissable */}
                {freshInvite && (
                  <div className="mb-5 p-4 bg-green-500/10 border border-green-500/30 rounded-xl space-y-3 animate-count-up">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-green-400 text-sm font-bold uppercase font-tabular tracking-wider">
                        <CheckCircle className="w-4 h-4" />
                        New code ready to share
                      </div>
                      {freshInvite.label && (
                        <span className="px-2 py-0.5 bg-white rounded-full text-xs font-semibold text-gray-700 border border-green-500/30 truncate max-w-[45%]">
                          For: {freshInvite.label}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3 p-3 bg-black/30 rounded-lg border border-green-500/30">
                      <span className="font-tabular font-extrabold text-lg sm:text-xl tracking-wide text-white truncate">
                        {freshInvite.code}
                      </span>
                      <button
                        onClick={() => handleCopyCode(freshInvite.code)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-all shrink-0 focus:outline-none"
                      >
                        {copiedCode === freshInvite.code ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>

                    <p className="text-sm text-white/80">
                      Single-use — this code locks itself automatically once a client redeems it.
                    </p>

                    <div className="pt-2.5 border-t border-green-500/20 space-y-1.5">
                      <span className="block text-xs font-bold text-gray-400 uppercase font-tabular tracking-wider">How it works</span>
                      <ol className="space-y-1 text-sm text-white">
                        <li className="flex gap-1.5">
                          <span className="font-bold text-green-400 shrink-0">1.</span>
                          <span>Copy & send this code to your client</span>
                        </li>
                        <li className="flex gap-1.5">
                          <span className="font-bold text-green-400 shrink-0">2.</span>
                          <span>They open "Register as New Client" on the login screen</span>
                        </li>
                        <li className="flex gap-1.5">
                          <span className="font-bold text-green-400 shrink-0">3.</span>
                          <span>Their business profile appears in your client list automatically</span>
                        </li>
                      </ol>
                    </div>
                  </div>
                )}

                {invitesLoading ? (
                  <div className="p-6 text-center text-sm font-bold text-gray-400 font-tabular">Loading invite codes...</div>
                ) : olderInvites.length > 0 ? (
                  <div>
                    <span className="block text-xs font-bold text-gray-400 uppercase font-tabular tracking-wider mb-2">
                      {freshInvite ? "Previously Generated" : "Invite Codes"}
                    </span>
                    <div className="divide-y divide-white/10 border border-white/10 rounded-lg overflow-hidden">
                      {olderInvites.map((invite) => (
                        <div
                          key={invite.invite_id}
                          className="flex items-center justify-between gap-2 p-3 hover:bg-black/30"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-tabular font-bold text-sm text-white truncate">{invite.code}</p>
                              {invite.label && (
                                <span className="text-xs font-semibold text-gray-300 bg-white/10 border border-white/10 rounded-full px-1.5 py-0.5 truncate max-w-[140px] shrink-0">
                                  {invite.label}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {new Date(invite.created_at).toLocaleDateString()}
                              {invite.status === "used" && invite.used_at && ` · used ${new Date(invite.used_at).toLocaleDateString()}`}
                              {invite.status === "pending" && ` · ${invite.is_expired ? "expired" : "expires"} ${new Date(invite.expires_at).toLocaleDateString()}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`px-2 py-0.5 text-[14px] font-tabular font-bold uppercase rounded-full border ${
                                invite.status === "pending"
                                  ? invite.is_expired
                                    ? "bg-red-500/10 text-red-400 border-red-500/30"
                                    : "bg-green-500/10 text-green-400 border-green-500/30"
                                  : invite.status === "used"
                                    ? "bg-black/30 text-gray-400 border-white/10"
                                    : "bg-red-500/10 text-red-400 border-red-500/30"
                              }`}
                            >
                              {invite.status === "pending" && invite.is_expired ? "expired" : invite.status}
                            </span>
                            {invite.status === "pending" && (
                              <>
                                <button
                                  onClick={() => handleCopyCode(invite.code)}
                                  title="Copy code"
                                  className="p-1.5 rounded hover:bg-white text-gray-400 hover:text-gray-900"
                                >
                                  {copiedCode === invite.code ? <Check className="w-3.5 h-3.5 text-purple-400" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  onClick={() => handleRevokeInvite(invite.invite_id)}
                                  title="Revoke code"
                                  className="p-1.5 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-400"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : !freshInvite ? (
                  <div className="p-8 text-center text-sm text-gray-400">No invite codes generated yet — click above to create one.</div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

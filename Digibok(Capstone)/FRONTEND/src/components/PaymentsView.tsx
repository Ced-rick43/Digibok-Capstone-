import React, { useState, useEffect } from "react";
import {
  Wallet,
  Banknote,
  CheckCircle2,
  XCircle,
  Clock,
  Receipt,
  AlertTriangle,
  Info,
  Lock,
  Paperclip,
  FileImage,
  ExternalLink
} from "lucide-react";
import { User, ClientProfile, TaxRecord, PermitRecord, Payment, PaymentMethod, IncomeStatementResult } from "../types";
import { money } from "../lib/currency";
import SuccessBurst from "./SuccessBurst";

interface PaymentsViewProps {
  user: User;
  token: string | null;
  refreshTrigger: number;
  onRefreshDashboard: () => void;
  // Set by a dashboard card drill-down click (e.g. "pending") — read once on mount to
  // preselect statusFilter below. Ignored once the user changes the filter themselves.
  initialFilter?: string | null;
}

interface Obligation {
  type: "tax" | "permit" | "service_fee";
  id: number;
  label: string;
  amount: number;
  dueDate: string;
  status: string;
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  gcash: "GCash",
  bank_transfer: "Bank Transfer",
  check: "Check",
  other: "Other",
};

export default function PaymentsView({ user, token, refreshTrigger, onRefreshDashboard, initialFilter }: PaymentsViewProps) {
  const isBookkeeper = user.role === "bookkeeper";

  const [clients, setClients] = useState<ClientProfile[]>([]);
  // Separate from `clients` (active-only, used for the "record payment on behalf of"
  // dropdown) — this includes deactivated clients too, so an old payment from before a
  // client was deactivated still resolves to their real name, not "Unknown Business".
  const [allClients, setAllClients] = useState<ClientProfile[]>([]);
  const [taxes, setTaxes] = useState<TaxRecord[]>([]);
  const [permits, setPermits] = useState<PermitRecord[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "paid" | "rejected">("all");
  // Bookkeeper-only per-client filter on the "Client Payment Submissions" table below.
  const [clientFilter, setClientFilter] = useState<string>("all");

  // Applies the dashboard drill-down filter (if any) once on mount — currently only
  // "pending" is passed in (from the Outstanding Sum card), which maps directly onto
  // the statusFilter values this view already supports.
  useEffect(() => {
    if (initialFilter === "pending" || initialFilter === "paid" || initialFilter === "rejected") {
      setStatusFilter(initialFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Confirming a payment is also the moment its underlying tax/permit obligation
  // actually closes out (confirmPayment() flips it to filed/renewed server-side), so
  // this is the one genuine "compliance completed" moment in the Payments screen.
  const [burstMessage, setBurstMessage] = useState<string | null>(null);

  // Bookkeeper fee: read-only for the client (the bookkeeper sets/edits the arrangement
  // from the Clients screen); the period's revenue is needed here to compute what a
  // percentage-based fee comes out to, sourced from the same Income Statement the
  // Financial Statements screen uses.
  const [periodIncome, setPeriodIncome] = useState<IncomeStatementResult | null>(null);

  // Receipt preview modal (both roles) — lets the bookkeeper inspect the attached proof
  // of payment inline before deciding to confirm or reject.
  const [previewPayment, setPreviewPayment] = useState<Payment | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  // Pay modal state (client role)
  const [showPayModal, setShowPayModal] = useState(false);
  const [payObligation, setPayObligation] = useState<Obligation | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("gcash");
  const [payReference, setPayReference] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [payFile, setPayFile] = useState<File | null>(null);
  const [modalError, setModalError] = useState("");
  const [modalSuccess, setModalSuccess] = useState("");

  // Record Payment modal state (bookkeeper role) — lets the bookkeeper log a payment
  // collected outside the app (e.g. cash paid in person) directly on a client's behalf.
  const [showBkPayModal, setShowBkPayModal] = useState(false);
  const [bkClientId, setBkClientId] = useState("");
  const [bkObligationType, setBkObligationType] = useState<"tax" | "permit" | "service_fee">("tax");
  const [bkObligationId, setBkObligationId] = useState("");
  const [bkAmount, setBkAmount] = useState("");
  const [bkDate, setBkDate] = useState(new Date().toISOString().split("T")[0]);
  const [bkMethod, setBkMethod] = useState<PaymentMethod>("cash");
  const [bkReference, setBkReference] = useState("");
  const [bkNotes, setBkNotes] = useState("");
  const [bkFile, setBkFile] = useState<File | null>(null);
  const [bkError, setBkError] = useState("");
  const [bkSuccess, setBkSuccess] = useState("");
  const [bkSubmitting, setBkSubmitting] = useState(false);

  const fetchAll = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [clientsRes, allClientsRes, paymentsRes] = await Promise.all([
        fetch("/api/clients", { headers: { "Authorization": `Bearer ${token}` } }),
        fetch("/api/clients?status=all", { headers: { "Authorization": `Bearer ${token}` } }),
        fetch("/api/payments", { headers: { "Authorization": `Bearer ${token}` } }),
      ]);
      const clientsData = await clientsRes.json();
      const allClientsData = await allClientsRes.json();
      const paymentsData = await paymentsRes.json();
      if (clientsRes.ok) setClients(clientsData);
      if (allClientsRes.ok) setAllClients(allClientsData);
      if (paymentsRes.ok) setPayments(paymentsData);

      // Bookkeeper sees every client's records here too — needed to pick "which
      // outstanding obligation" when recording a payment on a client's behalf.
      const complianceRes = await fetch("/api/compliance", { headers: { "Authorization": `Bearer ${token}` } });
      const complianceData = await complianceRes.json();
      if (complianceRes.ok) {
        setTaxes(complianceData.taxes || []);
        setPermits(complianceData.permits || []);
      }

      if (!isBookkeeper) {
        const own: ClientProfile | undefined = clientsRes.ok ? clientsData[0] : undefined;
        if (own) {
          const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
          const today = new Date().toISOString().split("T")[0];
          const incomeRes = await fetch(
            `/api/financials/income-statement?clientId=${own.client_id}&startDate=${monthStart}&endDate=${today}`,
            { headers: { "Authorization": `Bearer ${token}` } }
          );
          const incomeData = await incomeRes.json();
          if (incomeRes.ok) setPeriodIncome(incomeData);
        }
      }
    } catch (e) {
      console.error("Failed loading payments module:", e);
    } finally {
      setLoading(false);
    }
  };

  const ownProfile: ClientProfile | undefined = !isBookkeeper ? clients[0] : undefined;
  const bookkeeperFeeOwed = ownProfile
    ? ownProfile.bookkeeper_fee_type === "flat"
      ? ownProfile.bookkeeper_fee_amount
      : (ownProfile.bookkeeper_fee_amount / 100) * (periodIncome?.totalRevenues || 0)
    : 0;

  useEffect(() => {
    fetchAll();
  }, [token, refreshTrigger]);

  const getClientBusinessName = (id: number) => {
    return allClients.find((c) => c.client_id === id)?.business_name || "Unknown Business";
  };

  // Outstanding (not yet filed/renewed) obligations for one client. Used both for the
  // logged-in client's own "Outstanding Obligations" list and, for a bookkeeper, to pick
  // which obligation to record a payment against on an arbitrary client's behalf.
  const getOutstandingForClient = (clientId: number): Obligation[] => [
    ...taxes.filter((t) => t.client_id === clientId && t.status !== "filed").map((t) => ({
      type: "tax" as const, id: t.tax_id, label: t.tax_type, amount: t.amount, dueDate: t.due_date, status: t.status,
    })),
    ...permits.filter((p) => p.client_id === clientId && p.status !== "renewed").map((p) => ({
      type: "permit" as const, id: p.permit_id, label: p.permit_type, amount: p.fee, dueDate: p.expiry_date, status: p.status,
    })),
  ].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const outstanding: Obligation[] = ownProfile ? getOutstandingForClient(ownProfile.client_id) : [];

  const findLatestPaymentFor = (type: "tax" | "permit" | "service_fee", id: number) =>
    payments.find((p) => p.obligation_type === type && p.obligation_id === id);

  const openPayModal = (ob: Obligation) => {
    setPayObligation(ob);
    setPayAmount(ob.amount.toString());
    setPayDate(new Date().toISOString().split("T")[0]);
    setPayMethod("gcash");
    setPayReference("");
    setPayNotes("");
    setPayFile(null);
    setModalError("");
    setModalSuccess("");
    setShowPayModal(true);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError("");
    setModalSuccess("");

    if (!payObligation || !payAmount || !payDate || !payMethod || !payReference) {
      setModalError("Please complete all required payment fields.");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("obligation_type", payObligation.type);
      formData.append("obligation_id", payObligation.id.toString());
      formData.append("amount", payAmount);
      formData.append("payment_date", payDate);
      formData.append("payment_method", payMethod);
      formData.append("reference_number", payReference);
      formData.append("notes", payNotes);
      if (payFile) formData.append("file", payFile);

      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed submitting payment");

      setModalSuccess("Payment submitted! Your bookkeeper will confirm it shortly.");
      setTimeout(() => {
        setShowPayModal(false);
        fetchAll();
      }, 1500);
    } catch (err: any) {
      setModalError(err.message);
    }
  };

  const openBkPayModal = () => {
    setBkClientId(clients[0] ? clients[0].client_id.toString() : "");
    setBkObligationType("tax");
    setBkObligationId("");
    setBkAmount("");
    setBkDate(new Date().toISOString().split("T")[0]);
    setBkMethod("cash");
    setBkReference("");
    setBkNotes("");
    setBkFile(null);
    setBkError("");
    setBkSuccess("");
    setShowBkPayModal(true);
  };

  const bkClientOutstanding = bkClientId ? getOutstandingForClient(Number(bkClientId)).filter((ob) => ob.type === bkObligationType) : [];

  const handleSubmitBkPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBkError("");
    setBkSuccess("");

    const needsObligationPick = bkObligationType !== "service_fee";
    if (!bkClientId || !bkAmount || !bkDate || !bkMethod || !bkReference || (needsObligationPick && !bkObligationId)) {
      setBkError("Please complete all required fields.");
      return;
    }

    setBkSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("client_id", bkClientId);
      formData.append("obligation_type", bkObligationType);
      formData.append("obligation_id", needsObligationPick ? bkObligationId : "0");
      formData.append("amount", bkAmount);
      formData.append("payment_date", bkDate);
      formData.append("payment_method", bkMethod);
      formData.append("reference_number", bkReference);
      formData.append("notes", bkNotes);
      if (bkFile) formData.append("file", bkFile);

      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed recording payment");

      setBkSuccess("Payment recorded and posted to the client's ledger.");
      setTimeout(() => {
        setShowBkPayModal(false);
        fetchAll();
        onRefreshDashboard();
      }, 1200);
    } catch (err: any) {
      setBkError(err.message);
    } finally {
      setBkSubmitting(false);
    }
  };

  const handleConfirm = async (paymentId: number) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/payments/${paymentId}/confirm`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed confirming payment");
      if (previewPayment?.payment_id === paymentId) closeReceiptPreview();
      const confirmedFor = payments.find((p) => p.payment_id === paymentId)?.obligation_label;
      setBurstMessage(confirmedFor ? `${confirmedFor} — confirmed and posted!` : "Payment confirmed and posted!");
      fetchAll();
      onRefreshDashboard();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleReject = async (paymentId: number) => {
    if (!token) return;
    const reason = window.prompt("Reason for rejecting this payment (optional):") || "";
    try {
      const res = await fetch(`/api/payments/${paymentId}/reject`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ rejection_reason: reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed rejecting payment");
      if (previewPayment?.payment_id === paymentId) closeReceiptPreview();
      fetchAll();
      onRefreshDashboard();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Lets a bookkeeper inspect the attached proof of payment inline — right where they'd
  // then hit Confirm/Reject — instead of only having a link that opens a new tab.
  const openReceiptPreview = async (p: Payment) => {
    if (!token) return;
    setPreviewPayment(p);
    setPreviewUrl(null);
    setPreviewError("");
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/payments/${p.payment_id}/receipt`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load the attached proof of payment.");
      const blob = await res.blob();
      setPreviewUrl(window.URL.createObjectURL(blob));
    } catch (e: any) {
      setPreviewError(e.message || "Failed to load the attached proof of payment.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const closeReceiptPreview = () => {
    if (previewUrl) window.URL.revokeObjectURL(previewUrl);
    setPreviewPayment(null);
    setPreviewUrl(null);
    setPreviewError("");
  };

  const statusChipClass = (status: string) =>
    status === "paid"
      ? "bg-green-500/10 text-green-400 border-green-500/30"
      : status === "rejected"
        ? "bg-red-500/10 text-red-400 border-red-500/30"
        : "bg-orange-500/10 text-orange-400 border-orange-500/30";

  const filteredPayments = payments
    .filter((p) => statusFilter === "all" || p.status === statusFilter)
    .filter((p) => !isBookkeeper || clientFilter === "all" || p.client_id.toString() === clientFilter);

  const totalCollected = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const pendingCount = payments.filter((p) => p.status === "pending").length;
  const rejectedCount = payments.filter((p) => p.status === "rejected").length;

  if (loading) {
    return (
      <div className="p-8 text-center text-sm font-semibold text-gray-400 font-tabular">
        Loading payment records...
      </div>
    );
  }

  return (
    <div className="space-y-4">

      <SuccessBurst show={!!burstMessage} message={burstMessage || ""} onDone={() => setBurstMessage(null)} />

      {/* Plain-language explainer */}
      <div className="p-3 bg-white/10 border border-white/10 rounded-lg flex items-start gap-2 text-sm text-gray-300">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-400" />
        <span>
          {isBookkeeper
            ? "When you confirm a client's payment, it's automatically recorded to their ledger — no manual journal entry needed."
            : "Submit a payment here whenever you pay a tax, permit, or your bookkeeper — your bookkeeper reviews and confirms it, then it's automatically posted to your ledger."}
        </span>
      </div>

      {isBookkeeper && (
        <>
          <div className="flex justify-end">
            <button
              onClick={openBkPayModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg focus:outline-none transition-all"
            >
              <Banknote className="w-3.5 h-3.5" />
              <span>Record Payment for Client</span>
            </button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-green-500 text-white flex items-center justify-center">
                <Banknote className="w-4.5 h-4.5" />
              </div>
              <div>
                <span className="block text-xs font-bold text-green-400 uppercase font-tabular">Total Collected</span>
                <span className="block text-lg font-tabular font-extrabold text-green-400 mt-0.5">{money(totalCollected)}</span>
              </div>
            </div>
            <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-orange-500 text-white flex items-center justify-center">
                <Clock className="w-4.5 h-4.5" />
              </div>
              <div>
                <span className="block text-xs font-bold text-orange-400 uppercase font-tabular">Pending Review</span>
                <span className="block text-lg font-tabular font-extrabold text-orange-400 mt-0.5">{pendingCount} Payments</span>
              </div>
            </div>
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-red-500 text-white flex items-center justify-center">
                <XCircle className="w-4.5 h-4.5" />
              </div>
              <div>
                <span className="block text-xs font-bold text-red-400 uppercase font-tabular">Rejected Submissions</span>
                <span className="block text-lg font-tabular font-extrabold text-red-400 mt-0.5">{rejectedCount} Payments</span>
              </div>
            </div>
          </div>

          {/* Payments table */}
          <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/10">
              <div>
                <h4 className="font-display font-bold text-white text-sm">Client Payment Submissions</h4>
                <p className="text-sm text-gray-400">Review and confirm payments collected against tax and permit obligations.</p>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 self-start shrink-0">
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
                <div className="flex bg-black/30 p-0.5 rounded-lg border border-white/10">
                  {(["all", "pending", "paid", "rejected"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setStatusFilter(f)}
                      className={`px-3 py-1.5 rounded-md text-sm font-semibold capitalize focus:outline-none transition-all ${
                        statusFilter === f ? "bg-purple-600 text-white font-extrabold" : "text-gray-400 hover:text-white"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {filteredPayments.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">No payment records match this filter.</div>
            ) : (
              <div className="space-y-2">
                {filteredPayments.map((p) => (
                  <div key={p.payment_id} className="p-3 bg-black/30 rounded-lg border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="w-8 h-8 rounded bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center shrink-0 text-gray-300">
                        <Receipt className="w-4 h-4" />
                      </span>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-extrabold text-white">{p.obligation_label}</span>
                          <span className="text-xs bg-black/40 backdrop-blur-md px-1.5 py-0.5 rounded text-gray-400 font-tabular font-bold truncate max-w-[140px] border border-white/10">
                            {getClientBusinessName(p.client_id)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 font-tabular">
                          Paid: <strong className="text-white">{p.payment_date}</strong> via <strong className="text-white">{PAYMENT_METHOD_LABELS[p.payment_method]}</strong> · Ref# {p.reference_number}
                          {p.notes && <span className="block text-gray-400 normal-case">{p.notes}</span>}
                        </p>
                        {p.receipt_file_name && (
                          <button
                            onClick={() => openReceiptPreview(p)}
                            className="flex items-center gap-1 text-xs font-bold text-gray-300 hover:text-white hover:underline"
                          >
                            <FileImage className="w-3 h-3" />
                            View Proof of Payment
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-start">
                      <span className="font-tabular font-bold text-sm text-white">
                        {money(p.amount)}
                      </span>
                      <span className={`px-2 py-0.5 text-[14px] font-tabular font-bold uppercase rounded-full border ${statusChipClass(p.status)}`}>
                        {p.status}
                      </span>
                      {p.status === "pending" && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleConfirm(p.payment_id)}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-purple-500 rounded hover:opacity-90 transition-all"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Confirm
                          </button>
                          <button
                            onClick={() => handleReject(p.payment_id)}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/30 rounded hover:bg-red-500/20 transition-all"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {!isBookkeeper && (
        <>
          {/* Bookkeeper fee arrangement + this period's amount owed — read-only here;
              only the bookkeeper sets/changes this, from the Clients screen. */}
          {ownProfile && (
            <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 space-y-3">
              <div>
                <h4 className="font-display font-bold text-white text-sm">Bookkeeper Fee</h4>
                <p className="text-sm text-gray-400">
                  What you pay your bookkeeper for their services — either a fixed amount each month or a percentage of what your business earns. Your bookkeeper sets this arrangement.
                </p>
              </div>

              <div className="p-3 bg-black/30 rounded-lg border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-xs text-gray-400 font-tabular uppercase font-bold flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" />
                    {ownProfile.bookkeeper_fee_type === "flat" ? "Fixed monthly fee" : `${ownProfile.bookkeeper_fee_amount}% of this month's revenue`}
                  </p>
                  <p className="text-lg font-tabular font-extrabold text-white">{money(bookkeeperFeeOwed)}</p>
                </div>
                {(() => {
                  const feeOb: Obligation = { type: "service_fee", id: 0, label: "Bookkeeper Service Fee", amount: bookkeeperFeeOwed, dueDate: new Date().toISOString().split("T")[0], status: "upcoming" };
                  const latest = findLatestPaymentFor("service_fee", 0);
                  const isPending = latest?.status === "pending";
                  return isPending ? (
                    <span className="px-2 py-1 text-xs font-tabular font-bold uppercase rounded-md border bg-orange-500/10 text-orange-400 border-orange-500/30 flex items-center gap-1 self-start sm:self-auto">
                      <Clock className="w-3 h-3" />
                      Pending Review
                    </span>
                  ) : (
                    <button
                      onClick={() => openPayModal(feeOb)}
                      disabled={bookkeeperFeeOwed <= 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-white bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-all focus:outline-none self-start sm:self-auto"
                    >
                      <Banknote className="w-3.5 h-3.5" />
                      Pay
                    </button>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Outstanding obligations */}
          <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 space-y-4">
            <div>
              <h4 className="font-display font-bold text-white text-sm">Outstanding Obligations</h4>
              <p className="text-sm text-gray-400">Submit a payment for your bookkeeper to confirm and post to your ledger.</p>
            </div>

            {outstanding.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">You're all caught up — no outstanding obligations right now.</div>
            ) : (
              <div className="divide-y divide-white/10 border border-white/10 rounded-lg overflow-hidden">
                {outstanding.map((ob) => {
                  const latest = findLatestPaymentFor(ob.type, ob.id);
                  const isPending = latest?.status === "pending";
                  const wasRejected = latest?.status === "rejected";
                  return (
                    <div key={`${ob.type}-${ob.id}`} className="p-3.5 hover:bg-black/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <p className="font-bold text-sm text-white">{ob.label}</p>
                        <p className="text-xs text-gray-400 font-tabular">
                          Due: <strong className="text-white">{ob.dueDate}</strong>
                        </p>
                        {wasRejected && (
                          <p className="text-xs text-red-400 flex items-center gap-1 normal-case">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            Previous submission was rejected{latest?.notes ? `: ${latest.notes.split("Rejected: ").pop()}` : ""} — you may resubmit.
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-start">
                        <span className="font-tabular font-bold text-sm text-white">
                          {money(ob.amount)}
                        </span>
                        {isPending ? (
                          <span className="px-2 py-1 text-xs font-tabular font-bold uppercase rounded-md border bg-orange-500/10 text-orange-400 border-orange-500/30 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Pending Review
                          </span>
                        ) : (
                          <button
                            onClick={() => openPayModal(ob)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-white bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 rounded-lg transition-all focus:outline-none"
                          >
                            <Banknote className="w-3.5 h-3.5" />
                            Pay
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* My payment history */}
          <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 space-y-4">
            <div>
              <h4 className="font-display font-bold text-white text-sm">My Payment History</h4>
              <p className="text-sm text-gray-400">Track the review status of everything you've submitted.</p>
            </div>

            {payments.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">No payments submitted yet.</div>
            ) : (
              <div className="space-y-2">
                {payments.map((p) => (
                  <div key={p.payment_id} className="p-3 bg-black/30 rounded-lg border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <span className="text-sm font-extrabold text-white">{p.obligation_label}</span>
                      <p className="text-xs text-gray-400 font-tabular">
                        Paid: <strong className="text-white">{p.payment_date}</strong> via <strong className="text-white">{PAYMENT_METHOD_LABELS[p.payment_method]}</strong> · Ref# {p.reference_number}
                      </p>
                      {p.notes && <p className="text-xs text-gray-400">{p.notes}</p>}
                      {p.receipt_file_name && (
                        <button
                          onClick={() => openReceiptPreview(p)}
                          className="flex items-center gap-1 text-xs font-bold text-gray-300 hover:text-white hover:underline"
                        >
                          <FileImage className="w-3 h-3" />
                          View Proof of Payment
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-tabular font-bold text-sm text-white">
                        {money(p.amount)}
                      </span>
                      <span className={`px-2 py-0.5 text-[14px] font-tabular font-bold uppercase rounded-full border ${statusChipClass(p.status)}`}>
                        {p.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* PAY MODAL */}
      {showPayModal && payObligation && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center p-4 z-50 animate-count-up backdrop-blur-xs">
          <div className="bg-black/40 backdrop-blur-md rounded-lg max-w-md w-full p-5 shadow-2xl border border-white/10">
            <div className="pb-3 mb-4 border-b border-white/10 flex justify-between items-center">
              <div>
                <h4 className="font-display font-bold text-white text-sm uppercase font-tabular tracking-wider">Record Payment</h4>
                <p className="text-sm text-gray-400 mt-0.5">{payObligation.label}</p>
              </div>
              <button onClick={() => setShowPayModal(false)} className="text-gray-400 hover:text-gray-300 font-extrabold text-base">✕</button>
            </div>

            {modalError && <div className="p-2.5 mb-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold rounded">{modalError}</div>}
            {modalSuccess && <div className="p-2.5 mb-3 bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-semibold rounded">{modalSuccess}</div>}

            <form onSubmit={handleSubmitPayment} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Amount (₱)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-tabular text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Payment Date</label>
                  <input
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-tabular text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Payment Method</label>
                <select
                  required
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                >
                  {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                    <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Reference Number</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. GCash Ref# 1234567890"
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-tabular text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Notes (optional)</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Paid via bank transfer to Sipocot LBP branch"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Proof of Payment (optional)</label>
                <label className="flex items-center gap-2 w-full px-3 py-2 text-sm bg-black/30 border border-dashed border-white/10 rounded cursor-pointer hover:border-purple-500 hover:bg-white/5 transition-all text-gray-400">
                  <Paperclip className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{payFile ? payFile.name : "Attach a screenshot or scanned receipt (PDF, JPG, PNG)"}</span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setPayFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-gray-400 mt-1">Helps your bookkeeper confirm faster — not required, but recommended.</p>
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 rounded text-sm font-bold text-white shadow-md transition-all focus:outline-none"
              >
                Submit Payment for Confirmation
              </button>
            </form>
          </div>
        </div>
      )}

      {/* RECORD PAYMENT MODAL (bookkeeper role) — logs a payment collected outside the
          app (e.g. cash paid in person) directly onto a client's ledger, no review needed. */}
      {showBkPayModal && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center p-4 z-50 animate-count-up backdrop-blur-xs">
          <div className="bg-black/40 backdrop-blur-md rounded-lg max-w-md w-full p-5 shadow-2xl border border-white/10 max-h-[90vh] overflow-y-auto">
            <div className="pb-3 mb-4 border-b border-white/10 flex justify-between items-center">
              <div>
                <h4 className="font-display font-bold text-white text-sm uppercase font-tabular tracking-wider">Record Payment for Client</h4>
                <p className="text-sm text-gray-400 mt-0.5">Posts straight to the client's ledger — no review step, since you're entering it yourself.</p>
              </div>
              <button onClick={() => setShowBkPayModal(false)} className="text-gray-400 hover:text-gray-300 font-extrabold text-base">✕</button>
            </div>

            {bkError && <div className="p-2.5 mb-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold rounded">{bkError}</div>}
            {bkSuccess && <div className="p-2.5 mb-3 bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-semibold rounded">{bkSuccess}</div>}

            <form onSubmit={handleSubmitBkPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Client</label>
                <select
                  required
                  value={bkClientId}
                  onChange={(e) => { setBkClientId(e.target.value); setBkObligationId(""); }}
                  className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                >
                  {clients.map((c) => (
                    <option key={c.client_id} value={c.client_id}>{c.business_name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">What For</label>
                  <select
                    required
                    value={bkObligationType}
                    onChange={(e) => { setBkObligationType(e.target.value as "tax" | "permit" | "service_fee"); setBkObligationId(""); }}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                  >
                    <option value="tax">Tax Obligation</option>
                    <option value="permit">Business Permit</option>
                    <option value="service_fee">Bookkeeper Service Fee</option>
                  </select>
                </div>
                {bkObligationType !== "service_fee" ? (
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Which One</label>
                    <select
                      required
                      value={bkObligationId}
                      onChange={(e) => {
                        setBkObligationId(e.target.value);
                        const ob = bkClientOutstanding.find((o) => o.id.toString() === e.target.value);
                        if (ob) setBkAmount(ob.amount.toString());
                      }}
                      className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                    >
                      <option value="" disabled>Select...</option>
                      {bkClientOutstanding.map((ob) => (
                        <option key={ob.id} value={ob.id}>{ob.label} ({money(ob.amount)})</option>
                      ))}
                    </select>
                    {bkClientOutstanding.length === 0 && (
                      <p className="text-xs text-red-400 mt-1">No outstanding {bkObligationType === "tax" ? "tax" : "permit"} obligations for this client.</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Amount (₱)</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={bkAmount}
                      onChange={(e) => setBkAmount(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-tabular text-white"
                    />
                  </div>
                )}
              </div>

              {bkObligationType !== "service_fee" && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Amount (₱)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={bkAmount}
                    onChange={(e) => setBkAmount(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-tabular text-white"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Payment Date</label>
                  <input
                    type="date"
                    required
                    value={bkDate}
                    onChange={(e) => setBkDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-tabular text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Payment Method</label>
                  <select
                    required
                    value={bkMethod}
                    onChange={(e) => setBkMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                  >
                    {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                      <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Reference Number</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. OR# 00123 or GCash Ref#"
                  value={bkReference}
                  onChange={(e) => setBkReference(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-tabular text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Notes (optional)</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Paid in cash at the office"
                  value={bkNotes}
                  onChange={(e) => setBkNotes(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Proof of Payment (optional)</label>
                <label className="flex items-center gap-2 w-full px-3 py-2 text-sm bg-black/30 border border-dashed border-white/10 rounded cursor-pointer hover:border-purple-500 hover:bg-white/5 transition-all text-gray-400">
                  <Paperclip className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{bkFile ? bkFile.name : "Attach a scanned receipt or OR (PDF, JPG, PNG)"}</span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setBkFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={bkSubmitting}
                className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded text-sm font-bold text-white shadow-md transition-all focus:outline-none"
              >
                {bkSubmitting ? "Recording..." : "Record Payment & Post to Ledger"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* RECEIPT PREVIEW MODAL — lets the bookkeeper inspect the attached proof of
          payment inline and confirm/reject right from here, without leaving the page. */}
      {previewPayment && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[70] animate-count-up backdrop-blur-xs">
          <div className="bg-black/40 backdrop-blur-md rounded-lg max-w-2xl w-full p-5 shadow-2xl border border-white/10 max-h-[90vh] overflow-y-auto">
            <div className="pb-3 mb-4 border-b border-white/10 flex justify-between items-center">
              <div>
                <h4 className="font-display font-bold text-white text-sm uppercase font-tabular tracking-wider">Proof of Payment</h4>
                <p className="text-sm text-gray-400 mt-0.5">
                  {previewPayment.obligation_label} · {money(previewPayment.amount)} · Ref# {previewPayment.reference_number}
                  {isBookkeeper && ` · ${getClientBusinessName(previewPayment.client_id)}`}
                </p>
              </div>
              <button onClick={closeReceiptPreview} className="text-gray-400 hover:text-gray-300 font-extrabold text-base">✕</button>
            </div>

            <div className="min-h-[200px] flex items-center justify-center bg-black/30 rounded-lg border border-white/10 overflow-hidden">
              {previewLoading && (
                <span className="text-sm font-semibold text-gray-400 font-tabular py-12">Loading attachment...</span>
              )}
              {previewError && (
                <span className="text-sm font-semibold text-red-400 py-12 px-4 text-center">{previewError}</span>
              )}
              {previewUrl && !previewLoading && (
                previewPayment.receipt_mime_type?.startsWith("image/") ? (
                  <img src={previewUrl} alt="Proof of payment" className="max-w-full max-h-[60vh] object-contain" />
                ) : (
                  <iframe title="Proof of payment" src={previewUrl} className="w-full h-[60vh]" />
                )
              )}
            </div>

            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-gray-300 hover:text-white hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                Open in new tab
              </a>
            )}

            {isBookkeeper && previewPayment.status === "pending" && (
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/10">
                <button
                  onClick={() => handleConfirm(previewPayment.payment_id)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-bold text-white bg-purple-500 rounded-lg hover:opacity-90 transition-all"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Confirm Payment
                </button>
                <button
                  onClick={() => handleReject(previewPayment.payment_id)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-bold text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-all"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Reject Payment
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

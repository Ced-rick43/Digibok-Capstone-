import React, { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import {
  Users,
  DollarSign,
  Clock,
  CheckCircle,
  Building2,
  AlertTriangle,
  FileCheck,
  Banknote,
  Search,
  CalendarClock,
  FolderOpen,
  ShieldCheck,
  ArrowUpRight,
  User as UserIcon,
  MessageCircle,
  CreditCard,
  UserPlus,
  FileText,
  FileSpreadsheet,
  ArrowUpDown,
} from "lucide-react";
import { User } from "../types";
import CompliancePulse, { PulseItem } from "./CompliancePulse";

// Hand-rolled SVG ring rather than a new react-circular-progressbar dependency — this
// codebase already has one animated conic-gradient ring (CompliancePulse's mini per-item
// indicator); this is the same technique scaled up for a single KPI card, so there's no
// need for an extra library just for a stroke-dashoffset circle. Generalized to take a
// raw percentage plus custom center text so the same ring can show "1 of 2 filed" (Q2
// progress) or "86% Healthy" (business health score) without duplicating the SVG math.
function RadialProgress({
  pct,
  color,
  size = 64,
  strokeWidth = 6,
  centerValue,
  centerLabel,
}: {
  pct: number;
  color: string;
  size?: number;
  strokeWidth?: number;
  centerValue: string;
  centerLabel: string;
}) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 80);
    return () => clearTimeout(t);
  }, []);
  const clamped = Math.max(0, Math.min(100, pct));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - ((animated ? clamped : 0) / 100) * circumference;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} fill="none" className="stroke-white/15" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-tabular font-black leading-none text-white">{centerValue}</span>
        <span className="text-[12px] font-tabular font-bold uppercase mt-0.5 text-white/60">{centerLabel}</span>
      </div>
    </div>
  );
}

// Bookkeeper-only compliance pulse: a real two-column "who needs attention" view built
// straight from the same activity feed that already powers the filing-activity table
// below (no separate endpoint) — overdue clients ranked by severity on the left,
// nearest-first upcoming deadlines on the right. Client role keeps the existing
// CompliancePulse carousel unchanged; this replaces it only for the bookkeeper, since a
// bookkeeper is triaging many clients at once rather than tracking their own few dates.
function daysFromToday(dateStr: string): number {
  const due = new Date(dateStr);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / 86400000);
}

function BookkeeperCompliancePanel({
  activities,
  setActiveTab,
}: {
  activities: { clientName: string; label: string; amount: number; date: string; status: string }[];
  setActiveTab: (tab: string) => void;
}) {
  const [overdueFilter, setOverdueFilter] = useState<"all" | "critical" | "warning">("all");

  const overdue = activities
    .filter((a) => a.status === "overdue")
    .map((a) => ({ ...a, days: Math.abs(daysFromToday(a.date)) }))
    .sort((a, b) => b.days - a.days)
    .filter((a) => (overdueFilter === "all" ? true : overdueFilter === "critical" ? a.days >= 7 : a.days < 7));

  const upcoming = activities
    .filter((a) => a.status === "upcoming" || a.status === "urgent")
    .map((a) => ({ ...a, days: daysFromToday(a.date) }))
    .sort((a, b) => a.days - b.days)
    .slice(0, 8);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Overdue Clients — 60% */}
      <div className="lg:col-span-3 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <span className="inline-flex items-center gap-2 font-display font-bold text-white text-base">
            Overdue Clients
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500/20 text-red-400 text-xs font-tabular font-bold">
              {overdue.length}
            </span>
          </span>
          <div className="flex items-center gap-1.5">
            {([
              { key: "all", label: "All" },
              { key: "critical", label: "Critical (7+ days)" },
              { key: "warning", label: "Warning (1-6 days)" },
            ] as const).map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => setOverdueFilter(chip.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-bold border transition-colors focus:outline-none ${
                  overdueFilter === chip.key
                    ? "bg-red-500/20 border-red-500/40 text-red-300"
                    : "bg-white/5 border-white/10 text-gray-400 hover:text-gray-200"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {overdue.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">All clients compliant — nothing overdue.</div>
        ) : (
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {overdue.map((item, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border ${
                  item.days >= 7 ? "bg-red-500/10 border-red-500/30" : "bg-orange-500/10 border-orange-500/30"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${item.days >= 7 ? "bg-red-400" : "bg-orange-400"}`}></span>
                  <div className="min-w-0">
                    <span className="block text-sm font-semibold text-white truncate">{item.clientName}</span>
                    <span className="block text-xs text-gray-400 truncate">{item.label}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`px-2 py-0.5 rounded-md text-xs font-tabular font-bold ${item.days >= 7 ? "text-red-400 bg-red-500/15" : "text-orange-400 bg-orange-500/15"}`}>
                    {item.days}D OVERDUE
                  </span>
                  <span className="text-sm font-tabular font-bold text-white">₱{item.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  <button
                    onClick={() => setActiveTab("compliance")}
                    className="text-xs font-bold text-purple-400 hover:text-purple-300 hover:underline focus:outline-none"
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming Deadlines — 40% */}
      <div className="lg:col-span-2 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 p-4">
        <span className="block font-display font-bold text-white text-base mb-3">Upcoming Deadlines</span>
        {upcoming.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">Nothing due in the near term.</div>
        ) : (
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {upcoming.map((item, idx) => (
              <div key={idx} className="p-2.5 rounded-lg border bg-white/5 border-white/10">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white truncate">{item.clientName}</span>
                  <span className="shrink-0 px-2 py-0.5 rounded-md text-xs font-tabular font-bold text-orange-400 bg-orange-500/15">
                    {item.days}D
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="text-xs text-gray-400 truncate">{item.label}</span>
                  <span className="text-xs font-tabular font-bold text-gray-300 shrink-0">₱{item.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface DashboardViewProps {
  user: User;
  token: string | null;
  refreshTrigger: number;
  setActiveTab: (tab: string) => void;
  onDrilldown?: (tab: string, filter?: string) => void;
}

interface Metrics {
  activeClients: number;
  totalClients: number;
  totalOutstandingDues: number;
  permitsExpiringSoon: number;
  q2Completed: number;
  q2Total: number;
  paymentsCollected: number;
  paymentsPending: number;
  overdueObligations: number;
  upcomingObligations: number;
}

interface ActivityItem {
  type: string;
  clientName: string;
  label: string;
  amount: number;
  date: string;
  status: "upcoming" | "urgent" | "overdue" | "filed" | "renewed";
}

export default function DashboardView({ user, token, refreshTrigger, setActiveTab, onDrilldown }: DashboardViewProps) {
  const [metrics, setMetrics] = useState<Metrics>({
    activeClients: 0,
    totalClients: 0,
    totalOutstandingDues: 0,
    permitsExpiringSoon: 0,
    q2Completed: 0,
    q2Total: 0,
    paymentsCollected: 0,
    paymentsPending: 0,
    overdueObligations: 0,
    upcomingObligations: 0,
  });
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activitySearch, setActivitySearch] = useState("");
  const [activitySort, setActivitySort] = useState<"status" | "latest" | "oldest">("status");

  // Ticks once a minute so the header countdown badge stays live without a full data
  // refetch — the underlying deadline data only changes on refetch, but the "time
  // remaining until it" display should keep counting down in between.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      // 1. Fetch live metrics
      const mRes = await fetch("/api/dashboard/metrics", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const mData = await mRes.json();

      // 2. Fetch active feed
      const aRes = await fetch("/api/dashboard/recent-activity?limit=100", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const aData = await aRes.json();

      if (mRes.ok && aRes.ok) {
        setMetrics(mData);
        setActivities(aData);
      }
    } catch (e) {
      console.error("Failed loading dashboard:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [token, refreshTrigger]);

  // Nearest real deadline (soonest due date, or most-overdue if everything's already
  // past due) — feeds the top urgency banner, which names the specific obligation, so
  // this tracks the whole activity (not just a timestamp) to read its label back out.
  // Due dates are calendar dates with no time-of-day, so "end of the due date" is
  // treated as the actual deadline instant, which is what the countdown below is
  // genuinely counting down real time against. Placed before the `loading` early-return
  // below (with every other hook) rather than after it — hooks can't be called
  // conditionally/after an early return.
  const nearestDeadline = useMemo(() => {
    const active = activities.filter((a) => a.status !== "filed" && a.status !== "renewed");
    if (active.length === 0) return null;
    return active.reduce((soonest, a) => {
      const due = new Date(a.date).setHours(23, 59, 59, 999);
      const soonestDue = new Date(soonest.date).setHours(23, 59, 59, 999);
      return due < soonestDue ? a : soonest;
    }, active[0]);
  }, [activities]);

  const countdown = useMemo(() => {
    if (!nearestDeadline) return null;
    const due = new Date(nearestDeadline.date);
    due.setHours(23, 59, 59, 999);
    const diffMs = due.getTime() - now;
    const overdue = diffMs < 0;
    const absMs = Math.abs(diffMs);
    const days = Math.floor(absMs / 86400000);
    const hours = Math.floor((absMs % 86400000) / 3600000);
    return { overdue, days, text: `${days}d ${hours}h` };
  }, [nearestDeadline, now]);

  // Business Health Score — a real weighted formula over already-fetched metrics
  // (not a hardcoded demo number): starts at 100, docked per overdue obligation,
  // per permit expiring soon, and proportionally for incomplete Q2 filings.
  const healthScore = useMemo(() => {
    let score = 100;
    score -= metrics.overdueObligations * 15;
    score -= metrics.permitsExpiringSoon * 8;
    if (metrics.q2Total > 0) {
      score -= (1 - metrics.q2Completed / metrics.q2Total) * 20;
    }
    return Math.max(0, Math.min(100, Math.round(score)));
  }, [metrics]);
  const healthLabel = healthScore >= 80 ? "Healthy" : healthScore >= 50 ? "Fair" : "At Risk";
  const healthColor = healthScore >= 80 ? "#10B981" : healthScore >= 50 ? "#F59E0B" : "#EF4444";

  // Paid vs Pending split for the Outstanding Balance bar — real ratio of all-time
  // collected payments against what's currently outstanding, not a fabricated split.
  const paidVsPending = useMemo(() => {
    const total = metrics.paymentsCollected + metrics.totalOutstandingDues;
    if (total <= 0) return { paidPct: 100, pendingPct: 0 };
    const paidPct = Math.round((metrics.paymentsCollected / total) * 100);
    return { paidPct, pendingPct: 100 - paidPct };
  }, [metrics]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <span className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></span>
        <span className="text-base font-semibold text-gray-300 font-tabular">Compiling Sipocot ledger summaries...</span>
      </div>
    );
  }

  const isBookkeeper = user.role === "bookkeeper";

  // Drills into the tab/filter each card represents — falls back to the plain
  // setActiveTab prop if onDrilldown wasn't wired up by the caller (defensive; App.tsx
  // always passes it, but this keeps the component safe on its own).
  const goToCard = (tab: string, filter?: string) => {
    if (onDrilldown) onDrilldown(tab, filter);
    else setActiveTab(tab);
  };

  // Card items mapped neatly
  const cards = [
    {
      title: isBookkeeper ? "Active Clients" : "My Business Status",
      value: isBookkeeper ? `${metrics.activeClients} Active` : "Non-VAT Registered",
      desc: isBookkeeper ? "Local Sipocot businesses" : "Standard single tax entity",
      icon: Users,
      colorClass: "text-purple-400",
      onClick: () => (isBookkeeper ? goToCard("clients") : goToCard("compliance")),
    },
    {
      title: "Outstanding Sum",
      value: `₱${metrics.totalOutstandingDues.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      desc: "Pending permits & tax filings",
      icon: DollarSign,
      colorClass: "text-violet-400",
      onClick: () => goToCard("payments", "pending"),
    },
    {
      title: "Permits At Risk",
      value: `${metrics.permitsExpiringSoon} Expiring`,
      desc: "Expiring within next 30 days",
      icon: Clock,
      colorClass: "text-red-400",
      onClick: () => goToCard("compliance", "permits-at-risk"),
    },
    {
      title: "Q2 Tax Filing Progress",
      value: `${metrics.q2Completed} / ${metrics.q2Total}`,
      desc: metrics.q2Total > 0 ? `${Math.round((metrics.q2Completed / metrics.q2Total) * 100)}% filed successfully` : "No Q2 obligations parsed",
      icon: CheckCircle,
      colorClass: "text-purple-400",
      onClick: () => goToCard("compliance", "tax-q2"),
    }
  ];

  // Matches against date (e.g. "2026-07" or "07-27"), client name, and compliance
  // title, so a bookkeeper can find an entry by typing whichever detail they remember.
  const activitySearchTerm = activitySearch.trim().toLowerCase();
  const filteredActivities = activitySearchTerm
    ? activities.filter(
        (act) =>
          act.date.toLowerCase().includes(activitySearchTerm) ||
          act.clientName.toLowerCase().includes(activitySearchTerm) ||
          act.label.toLowerCase().includes(activitySearchTerm)
      )
    : activities;

  const statusRank: Record<string, number> = { overdue: 0, urgent: 1, upcoming: 2, filed: 3, renewed: 3 };
  const sortedActivities = [...filteredActivities].sort((a, b) => {
    if (activitySort === "status") return statusRank[a.status] - statusRank[b.status];
    const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
    return activitySort === "latest" ? -diff : diff;
  });

  const pulseItems: PulseItem[] = activities.map((act, idx) => ({
    key: `${act.type}-${idx}`,
    label: act.label,
    clientName: act.clientName,
    dueDate: act.date,
    amount: act.amount,
    status: act.status,
  }));

  return (
    <div className="space-y-5">

      {/* Urgency Zone — client-only, full-width banner naming the single nearest
          obligation. Skipped entirely when nothing is due/overdue (a real, honest empty
          state) rather than showing a stale alert. */}
      {!isBookkeeper && countdown && nearestDeadline && (
        <div
          className={`p-4 rounded-2xl border flex flex-col items-center text-center gap-1 ${
            countdown.overdue || countdown.days <= 7
              ? "bg-red-500/10 border-red-500/30"
              : "bg-orange-500/10 border-orange-500/30"
          }`}
        >
          <span
            className={`inline-flex items-center gap-2 font-display font-black text-xl sm:text-2xl tracking-tight ${
              countdown.overdue || countdown.days <= 7 ? "text-red-400 animate-pulse" : "text-orange-400"
            }`}
          >
            <AlertTriangle className="w-5 h-5 shrink-0" />
            {countdown.overdue
              ? `OVERDUE BY ${countdown.days} DAY${countdown.days === 1 ? "" : "S"}`
              : `DUE IN ${countdown.days} DAY${countdown.days === 1 ? "" : "S"}`}
          </span>
          <span className={`text-sm font-medium ${countdown.overdue || countdown.days <= 7 ? "text-red-300" : "text-orange-300"}`}>
            Please file your <strong>{nearestDeadline.label}</strong> to avoid penalties.
          </span>
        </div>
      )}

      {/* Welcome Hero Panel */}
      <div className="p-5 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-purple-400 font-tabular text-[14px] font-bold uppercase tracking-widest block mb-0.5">
            MUNICIPALITY OF SIPOCOT · AREA FINANCE WORKSPACE
          </span>
          <h2 className="text-xl font-display font-bold tracking-tight text-white">
            Magandang Araw, {user.name}!
          </h2>
          <p className="text-gray-300 text-sm mt-1 max-w-xl leading-relaxed">
            {isBookkeeper
              ? "Manage your local clients' financial obligations, file quarterly percentage taxes, track Mayor's business permits, and download official bookkeeping ledger records in our high-density unified interface."
              : "Here's a quick snapshot of your business health."}
          </p>
          {!isBookkeeper && (
            <button
              onClick={() => setActiveTab("compliance")}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white text-sm font-bold rounded-lg transition-all focus:outline-none"
            >
              <CalendarClock className="w-3.5 h-3.5" />
              View Compliance Deadlines
            </button>
          )}
          {isBookkeeper && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs font-tabular font-bold">
              <span className="text-gray-300">Total Clients: {metrics.totalClients}</span>
              <span className="text-green-400">Active Clients: {metrics.activeClients}</span>
              <span className="text-red-400">Overdue Filings: {metrics.overdueObligations}</span>
              <span className="text-orange-400">Upcoming Deadlines: {metrics.upcomingObligations}</span>
            </div>
          )}
        </div>
        {isBookkeeper ? (
          <div className="text-left sm:text-right shrink-0">
            <span className="block text-xs text-gray-400 font-bold font-tabular">IP LOCATION STATUS</span>
            <span className="text-sm font-bold text-green-400 flex items-center justify-start sm:justify-end gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
              Server Live · Sipocot, CamSur
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <span className="block text-xs text-gray-400 font-bold font-tabular uppercase">Business Health</span>
              <span className="text-sm font-bold" style={{ color: healthColor }}>{healthLabel}</span>
            </div>
            <RadialProgress
              pct={healthScore}
              color={healthColor}
              size={52}
              strokeWidth={5}
              centerValue={`${healthScore}%`}
              centerLabel="score"
            />
          </div>
        )}
      </div>

      {/* Quick Actions — client-only "Big 4" launcher grid */}
      {!isBookkeeper && (
        <motion.div
          className="grid grid-cols-2 gap-4"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.06 } } }}
        >
          {[
            { id: "profile", label: "My Profile", desc: "View and edit your account details.", icon: UserIcon, accent: false },
            { id: "compliance", label: "Check Compliance", desc: "Track BIR filings and permit deadlines.", icon: CheckCircle, accent: false },
            { id: "documents", label: "My Documents", desc: "Upload and download your BIR forms.", icon: FolderOpen, accent: false },
            { id: "messages", label: "Message Bookkeeper", desc: "Ask a question or send an update.", icon: MessageCircle, accent: true },
          ].map((action) => {
            const Icon = action.icon;
            return (
              <motion.button
                key={action.id}
                onClick={() => setActiveTab(action.id)}
                variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
                whileHover={{ scale: 1.03 }}
                className={`p-6 rounded-2xl border text-center transition-shadow focus:outline-none ${
                  action.accent
                    ? "bg-purple-500/10 border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/10"
                    : "bg-black/40 backdrop-blur-md border-white/10 hover:shadow-lg hover:border-white/30"
                }`}
              >
                <div className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-3 ${action.accent ? "bg-purple-500 text-white" : "bg-white/10 text-purple-400"}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <span className="block text-base font-display font-bold text-white">{action.label}</span>
                <span className="block text-sm text-gray-400 mt-1 leading-relaxed">{action.desc}</span>
              </motion.button>
            );
          })}
        </motion.div>
      )}

      {/* Compliance Pulse: signature deadline tracker */}
      {isBookkeeper ? (
        <BookkeeperCompliancePanel activities={activities} setActiveTab={setActiveTab} />
      ) : (
        <CompliancePulse items={pulseItems} />
      )}

      {/* Metrics Cards Grid */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-4 gap-4"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } }}
      >
        {cards.map((card, idx) => {
          const Icon = card.icon;
          const isBusinessStatusCard = idx === 0 && !isBookkeeper;
          const isOutstandingCard = idx === 1 && !isBookkeeper;
          const isPermitsCard = idx === 2;
          const isQ2Card = idx === 3;
          // Permits-at-risk was always styled red regardless of count — a real 0 vs
          // >0 distinction reads much better and was trivial to wire up correctly. The
          // standout green-card treatment (vs. just the icon-chip swap) is client-only,
          // per the "make it stand out" ask — bookkeeper's card is visually unchanged.
          const permitsSafe = metrics.permitsExpiringSoon === 0;
          const permitsStandout = isPermitsCard && !isBookkeeper && permitsSafe;
          const iconColorClass = isPermitsCard ? (permitsSafe ? "text-green-400" : "text-red-400") : card.colorClass;
          const IconForCard = isPermitsCard ? ShieldCheck : Icon;

          return (
            <motion.div
              key={idx}
              variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
              onClick={card.onClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  card.onClick();
                }
              }}
              whileHover={{ scale: 1.015 }}
              className={`p-4 rounded-2xl border relative overflow-hidden transition-all hover:-translate-y-0.5 cursor-pointer hover:shadow-lg hover:border-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                permitsStandout ? "bg-green-500/10 border-green-500/30" : "bg-black/40 backdrop-blur-md border-white/10"
              }`}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider">{card.title}</span>
                  {isBusinessStatusCard ? (
                    <span className="flex items-center gap-1.5 mt-1">
                      <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0"></span>
                      <span className="text-xl font-tabular font-black text-white tracking-tight">{card.value}</span>
                    </span>
                  ) : isQ2Card && !isBookkeeper ? null : (
                    <span className="block text-xl font-tabular font-black text-white mt-1 tracking-tight animate-count-up">
                      {card.value}
                    </span>
                  )}
                  <span className="block text-xs text-gray-400 mt-0.5 font-medium">{card.desc}</span>
                </div>

                {isQ2Card && !isBookkeeper ? (
                  <RadialProgress
                    pct={metrics.q2Total > 0 ? (metrics.q2Completed / metrics.q2Total) * 100 : 0}
                    color="#10B981"
                    centerValue={`${metrics.q2Completed} of ${metrics.q2Total}`}
                    centerLabel="filed"
                  />
                ) : (
                  <div className={`w-8 h-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center shrink-0 ${iconColorClass}`}>
                    <IconForCard className="w-4 h-4" />
                  </div>
                )}
              </div>

              {isOutstandingCard && (
                <div className="mt-3">
                  <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden flex">
                    <div className="h-full bg-green-500" style={{ width: `${paidVsPending.paidPct}%` }} />
                    <div className="h-full bg-orange-500" style={{ width: `${paidVsPending.pendingPct}%` }} />
                  </div>
                  <div className="flex justify-between mt-1 text-[14px] font-tabular font-bold">
                    <span className="text-green-400">Paid {paidVsPending.paidPct}%</span>
                    <span className="text-orange-400">Pending {paidVsPending.pendingPct}%</span>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {/* Payments Overview (Bookkeeper only) */}
      {isBookkeeper && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-2xl flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-green-500 text-white flex items-center justify-center shrink-0">
              <Banknote className="w-4.5 h-4.5" />
            </div>
            <div>
              <span className="block text-xs font-bold text-green-400 uppercase font-tabular">Payments Collected</span>
              <span className="block text-lg font-tabular font-extrabold text-green-300 mt-0.5">₱{metrics.paymentsCollected.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
          <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-2xl flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-orange-500 text-white flex items-center justify-center shrink-0">
              <Clock className="w-4.5 h-4.5" />
            </div>
            <div>
              <span className="block text-xs font-bold text-orange-400 uppercase font-tabular">Payments Pending</span>
              <span className="block text-lg font-tabular font-extrabold text-orange-300 mt-0.5">{metrics.paymentsPending} Awaiting Review</span>
            </div>
          </div>
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-red-500 text-white flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4.5 h-4.5" />
            </div>
            <div>
              <span className="block text-xs font-bold text-red-400 uppercase font-tabular">Obligations Overdue</span>
              <span className="block text-lg font-tabular font-extrabold text-red-300 mt-0.5">{metrics.overdueObligations} Items</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Column Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">

        {/* Recent compliance activity timeline */}
        <div className="xl:col-span-8 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 p-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2.5 mb-3">
            <div>
              <h3 className="font-display font-bold text-white text-sm">Recent Compliance & Filing Activities</h3>
              <p className="text-sm text-gray-400">Timeline of tax submissions and permit renewals for this period.</p>
            </div>
            <span className="text-xs bg-white/5 px-2 py-0.5 rounded text-gray-400 font-tabular font-bold border border-white/10 shrink-0 self-start sm:self-auto">
              {activitySearchTerm ? `${filteredActivities.length} of ${activities.length} shown` : `Total ${activities.length} activity parsed`}
            </span>
          </div>

          {activities.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                  placeholder="Search by date (e.g. 2026-07 or 07-27), client, or filing title..."
                  className="w-full pl-9 pr-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white placeholder:text-gray-400 font-tabular"
                />
              </div>
              <div className="relative shrink-0">
                <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={activitySort}
                  onChange={(e) => setActivitySort(e.target.value as "status" | "latest" | "oldest")}
                  className="pl-9 pr-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white font-tabular appearance-none cursor-pointer"
                >
                  <option value="status" className="bg-gray-900">By Status</option>
                  <option value="latest" className="bg-gray-900">Latest First</option>
                  <option value="oldest" className="bg-gray-900">Oldest First</option>
                </select>
              </div>
            </div>
          )}

          {activities.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              No recent compliance activities tracked. Click "Simulate Cron Scan" on top to populate deadlines.
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              No activities match "{activitySearch}". Try a different date, client, or filing title.
            </div>
          ) : (
            <div className="overflow-x-auto overflow-y-auto max-h-[420px] rounded-lg border border-white/10">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-white/10 text-gray-400 uppercase font-tabular font-bold tracking-wider text-[14px] bg-gray-900">
                    <th className="py-2 px-3">Date</th>
                    {isBookkeeper && <th className="py-2 px-3">Client</th>}
                    <th className="py-2 px-3">Compliance Title</th>
                    <th className="py-2 px-3 text-right">Amount</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-white">
                  {sortedActivities.map((act, idx) => {
                    let statusPillClass = "";
                    if (act.status === "filed" || act.status === "renewed") {
                      statusPillClass = "bg-green-500/15 text-green-400 border-green-500/30";
                    } else if (act.status === "urgent") {
                      statusPillClass = "bg-orange-500/15 text-orange-400 border-orange-500/30";
                    } else if (act.status === "overdue") {
                      statusPillClass = "bg-red-500/15 text-red-400 border-red-500/30";
                    } else {
                      statusPillClass = "bg-white/5 text-gray-400 border-white/10";
                    }

                    return (
                      <tr key={idx} className="hover:bg-white/5 transition-all">
                        <td className="py-2 px-3 text-gray-400 whitespace-nowrap font-tabular">{act.date}</td>
                        {isBookkeeper && <td className="py-2 px-3 font-semibold text-white">{act.clientName}</td>}
                        <td className="py-2 px-3 text-gray-300 text-sm">{act.label}</td>
                        <td className="py-2 px-3 font-tabular font-bold text-white text-right">₱{act.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[14px] font-bold border uppercase tracking-wider ${statusPillClass}`}>
                            {act.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          {!isBookkeeper && act.status === "overdue" ? (
                            <button
                              onClick={() => setActiveTab("payments")}
                              title={`Pay ${act.label}`}
                              className="inline-flex items-center gap-1 text-xs font-bold text-white bg-red-500 px-2 py-1 rounded-md hover:bg-red-600 transition-colors focus:outline-none"
                            >
                              <CreditCard className="w-3 h-3" />
                              Pay
                            </button>
                          ) : (
                            <button
                              onClick={() => setActiveTab("compliance")}
                              title={`View ${act.label} in Compliance`}
                              className="inline-flex items-center gap-1 text-xs font-bold text-purple-400 hover:text-purple-300 hover:underline focus:outline-none"
                            >
                              View
                              <ArrowUpRight className="w-3 h-3" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sipocot bookkeeping context (bookkeeper) / friendly help CTA (client) */}
        <div className="xl:col-span-4 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 p-4">
          {isBookkeeper ? (
            <div className="space-y-4">
              <div>
                <h3 className="font-display font-bold text-white text-sm">Quick Information Guide</h3>
                <p className="text-sm text-gray-400">Local compliance constraints for Non-VAT taxpayers in Sipocot.</p>
              </div>

              <div className="p-3 bg-white/5 rounded-md border border-white/10 space-y-1.5">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-200 uppercase font-tabular">
                  <Building2 className="w-3.5 h-3.5 text-purple-400" />
                  Sipocot LGU Tax Rates
                </span>
                <p className="text-sm text-gray-300 leading-normal">
                  BIR Non-VAT taxpayers are liable to file <strong className="text-white">3% Quarterly Percentage Tax (Form 2551Q)</strong> on gross sales, in accordance with Section 116 of the Tax Code. Business Permit renewals are processed every January at the Sipocot Municipal Hall.
                </p>
              </div>

              <div className="p-3 bg-white/5 rounded-md border border-white/10 space-y-1.5">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-200 uppercase font-tabular">
                  <FileCheck className="w-3.5 h-3.5 text-purple-400" />
                  Auto-Posting Logics
                </span>
                <p className="text-sm text-gray-300 leading-normal">
                  All journal line submissions entered under the Journal & Ledger tab are automatically posted into the client's General Ledger. The system computes running debit-credit balances in real time, preventing duplicate ledger posting efforts.
                </p>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-6">
              <div className="w-14 h-14 rounded-full bg-purple-500/15 flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h3 className="font-display font-bold text-white text-base">Need help?</h3>
                <p className="text-sm text-gray-400 mt-1 max-w-[220px]">Your bookkeeper is just a message away.</p>
              </div>
              <button
                onClick={() => setActiveTab("messages")}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-bold rounded-lg transition-all focus:outline-none"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Message Bookkeeper
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Quick Actions — bookkeeper-only shortcuts into the tabs where each task is
          actually done (this dashboard doesn't add new client/filing/report forms
          itself, it just launches you into the existing ones). */}
      {isBookkeeper && (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } } }}
        >
          {[
            { id: "clients", label: "New Client", desc: "Add a new client to your bookkeeping roster.", icon: UserPlus },
            { id: "compliance", label: "File Tax Return", desc: "Submit BIR forms for your clients.", icon: FileText },
            { id: "reports", label: "Generate Report", desc: "Create financial reports for review.", icon: FileSpreadsheet },
          ].map((action) => {
            const Icon = action.icon;
            return (
              <motion.div
                key={action.id}
                variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
                className="p-5 rounded-2xl border bg-black/40 backdrop-blur-md border-white/10 flex flex-col gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-white/10 text-purple-400 flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-base font-display font-bold text-white">{action.label}</span>
                  <span className="block text-sm text-gray-400 mt-0.5 leading-relaxed">{action.desc}</span>
                </div>
                <button
                  onClick={() => setActiveTab(action.id)}
                  className="mt-auto self-start px-3.5 py-1.5 rounded-lg border border-purple-500/50 text-purple-400 text-sm font-bold hover:bg-purple-500/10 transition-colors focus:outline-none"
                >
                  {action.id === "clients" ? "Add Client" : action.id === "compliance" ? "File Now" : "Generate"}
                </button>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {isBookkeeper && (
        <div className="text-center text-xs text-gray-600 pt-1">© 2026 DigiBok. All rights reserved.</div>
      )}

    </div>
  );
}

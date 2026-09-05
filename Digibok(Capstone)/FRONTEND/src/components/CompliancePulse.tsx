import React from "react";
import { AlertCircle, Clock as ClockIcon, CheckCircle2 } from "lucide-react";

export interface PulseItem {
  key: string;
  label: string;
  clientName?: string;
  dueDate: string;
  amount?: number;
  status: "upcoming" | "urgent" | "overdue" | "filed" | "renewed";
}

interface CompliancePulseProps {
  items: PulseItem[];
}

function daysUntil(dateStr: string): number {
  const due = new Date(dateStr);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / 86400000);
}

function toneFor(days: number) {
  if (days < 0) {
    return { ring: "#EF4444", bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30", label: `${Math.abs(days)}d overdue`, pulse: true, Icon: AlertCircle };
  }
  if (days <= 7) {
    return { ring: "#EF4444", bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30", label: days === 0 ? "Due today" : `Due in ${days}d`, pulse: true, Icon: AlertCircle };
  }
  if (days <= 30) {
    return { ring: "#F59E0B", bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/30", label: `Due in ${days}d`, pulse: false, Icon: ClockIcon };
  }
  return { ring: "#10B981", bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/30", label: `Due in ${days}d`, pulse: false, Icon: CheckCircle2 };
}

export default function CompliancePulse({ items }: CompliancePulseProps) {
  const active = items
    .filter((i) => i.status !== "filed" && i.status !== "renewed")
    .map((i) => ({ ...i, days: daysUntil(i.dueDate) }))
    .sort((a, b) => a.days - b.days)
    .slice(0, 8);

  if (active.length === 0) {
    return (
      <div className="p-5 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-green-400"></span>
        </div>
        <div>
          <span className="block text-sm font-bold text-white font-display">Compliance Pulse</span>
          <span className="block text-sm text-gray-400">All tracked filings and permits are clear. Nothing due right now.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-display font-bold text-white text-sm">Compliance Pulse</h3>
          <p className="text-sm text-gray-400">Live countdown to the nearest permit &amp; tax obligations.</p>
        </div>
        <span className="text-xs font-tabular text-gray-400 uppercase tracking-wide">{active.length} tracked</span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1">
        {active.map((item) => {
          const tone = toneFor(item.days);
          const pct = Math.round(Math.max(4, Math.min(100, 100 - (item.days / 90) * 100)));
          return (
            <div
              key={item.key}
              className={`shrink-0 w-[172px] p-3 rounded-lg border ${tone.border} ${tone.bg} flex flex-col gap-2 transition-transform hover:-translate-y-0.5`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`relative w-9 h-9 rounded-full shrink-0 ${tone.pulse ? "animate-pulse-ring" : ""}`}
                  style={{ background: `conic-gradient(${tone.ring} ${pct}%, ${tone.ring}30 0)` }}
                >
                  <div className="absolute inset-[3px] rounded-full bg-gray-900 flex items-center justify-center">
                    <span className="text-[14px] font-tabular font-bold" style={{ color: tone.ring }}>
                      {item.days < 0 ? "!" : item.days}
                    </span>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className={`flex items-center gap-1 text-[14px] font-bold uppercase tracking-wide ${tone.text}`}>
                    <tone.Icon className="w-2.5 h-2.5 shrink-0" />
                    {tone.label}
                  </p>
                  {item.clientName && <p className="text-[14px] text-gray-400 truncate">{item.clientName}</p>}
                </div>
              </div>
              <p className="text-sm font-semibold text-white leading-snug truncate" title={item.label}>{item.label}</p>
              {item.amount !== undefined && (
                <p className="text-sm font-tabular font-bold text-white">
                  ₱{item.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

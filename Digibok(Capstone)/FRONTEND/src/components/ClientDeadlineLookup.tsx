import React, { useMemo, useState } from "react";
import { Search, FileText, CalendarClock, ClipboardCheck, Plus } from "lucide-react";
import { ClientProfile } from "../types";
import { getNonVatSchedule, REGISTRATION_CHECKLIST, ScheduleItem } from "../lib/birCompliance";

interface ClientDeadlineLookupProps {
  clients: ClientProfile[];
  isBookkeeper: boolean;
  token: string | null;
  onRegistered: () => void;
}

const statusClass: Record<ScheduleItem["status"], string> = {
  overdue: "bg-red-500/10 text-red-400 border-red-500/30",
  urgent: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  upcoming: "bg-white/10 text-gray-300 border-white/10",
};

export default function ClientDeadlineLookup({ clients, isBookkeeper, token, onRegistered }: ClientDeadlineLookupProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ClientProfile | null>(null);
  const [addedForms, setAddedForms] = useState<Set<string>>(new Set());

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return clients.filter((c) => c.business_name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, clients]);

  const schedule = useMemo(() => (selected ? getNonVatSchedule() : []), [selected]);

  const handleSelect = (client: ClientProfile) => {
    setSelected(client);
    setQuery(client.business_name);
    setAddedForms(new Set());
  };

  const handleQuickAdd = async (item: ScheduleItem) => {
    if (!selected || !token) return;
    try {
      const res = await fetch("/api/compliance/tax", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          client_id: selected.client_id,
          tax_type: `${item.label} (${item.form})`,
          due_date: item.dueDate,
          amount: 0,
        }),
      });
      if (res.ok) {
        setAddedForms((prev) => new Set(prev).add(item.form + item.dueDate));
        onRegistered();
      }
    } catch (e) {
      console.error("Failed registering form into tax registry:", e);
    }
  };

  return (
    <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 space-y-4">
      <div>
        <h4 className="font-display font-bold text-white text-sm">Client BIR Form &amp; Deadline Lookup</h4>
        <p className="text-sm text-gray-400">Type a client's business name to instantly see every Non-VAT form and its next deadline.</p>
      </div>

      <div className="relative max-w-md">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
          <Search className="w-3.5 h-3.5" />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (selected && e.target.value !== selected.business_name) setSelected(null);
          }}
          placeholder="Start typing a business name..."
          className="pl-8 pr-3 py-2 w-full text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
        />

        {query.trim() && !selected && matches.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-black/40 backdrop-blur-md border border-white/10 rounded-lg shadow-lg overflow-hidden">
            {matches.map((c) => (
              <button
                key={c.client_id}
                onClick={() => handleSelect(c)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-black/30 flex items-center justify-between gap-2"
              >
                <span className="font-semibold text-white truncate">{c.business_name}</span>
              </button>
            ))}
          </div>
        )}

        {query.trim() && !selected && matches.length === 0 && (
          <div className="absolute z-10 mt-1 w-full bg-black/40 backdrop-blur-md border border-white/10 rounded-lg shadow-lg px-3 py-2 text-sm text-gray-500">
            No matching client found.
          </div>
        )}
      </div>

      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* One-time registration checklist */}
          <div className="p-3.5 bg-black/30 rounded-lg border border-white/10 space-y-2.5">
            <div className="flex items-center gap-1.5">
              <ClipboardCheck className="w-4 h-4 text-gray-300" />
              <h5 className="text-sm font-bold text-white">Registration Checklist</h5>
            </div>
            <ol className="space-y-2">
              {REGISTRATION_CHECKLIST.map((step) => (
                <li key={step.step} className="flex gap-2">
                  <span className="w-5 h-5 shrink-0 rounded-full bg-purple-600 text-white text-xs font-tabular font-bold flex items-center justify-center">
                    {step.step}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-white">
                      {step.title} <span className="text-[11px] font-tabular text-gray-500">({step.agency})</span>
                    </p>
                    <p className="text-xs text-gray-400 leading-snug">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Recurring Non-VAT filing schedule */}
          <div className="p-3.5 bg-black/30 rounded-lg border border-white/10 space-y-2.5">
            <div className="flex items-center gap-1.5">
              <CalendarClock className="w-4 h-4 text-gray-300" />
              <h5 className="text-sm font-bold text-white">Non-VAT Filing Schedule</h5>
            </div>
            <div className="space-y-1.5">
              {schedule.map((item) => {
                const key = item.form + item.dueDate;
                const isAdded = addedForms.has(key);
                return (
                  <div key={key} className="flex items-center justify-between gap-2 p-2 bg-black/40 backdrop-blur-md border border-white/10 rounded">
                    <div className="min-w-0 flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{item.form} &middot; {item.label}</p>
                        <p className="text-[11px] text-gray-400 font-tabular">Due {item.dueDate}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-1.5 py-0.5 text-[11px] font-tabular font-bold uppercase rounded border ${statusClass[item.status]}`}>
                        {item.status}
                      </span>
                      {isBookkeeper && (
                        <button
                          disabled={isAdded}
                          onClick={() => handleQuickAdd(item)}
                          className={`p-1 rounded transition-all ${
                            isAdded ? "text-green-400 cursor-default" : "text-gray-500 hover:text-white hover:bg-white/10"
                          }`}
                          title={isAdded ? "Added to registry" : "Add to Tax Registry"}
                        >
                          {isAdded ? <ClipboardCheck className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState } from "react";
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  BookMarked,
  FileSpreadsheet,
  LogOut,
  History,
  Award,
  BookOpen,
  Wallet,
  FolderOpen,
  LineChart,
  UserCircle,
  ShieldCheck,
  MessageSquare,
  Calculator,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { User } from "../types";

interface SidebarProps {
  user: User;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  unreadMessageCount?: number;
}

interface NavChild {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface NavItem extends NavChild {
  children?: NavChild[];
  // Pure grouping folders (e.g. "Accounting") have no page of their own — clicking them
  // only toggles expansion. Folders that ARE also a real page (e.g. "Clients") both
  // navigate and expand.
  isGroupOnly?: boolean;
}

export default function Sidebar({ user, activeTab, setActiveTab, onLogout, unreadMessageCount = 0 }: SidebarProps) {
  const isBookkeeper = user.role === "bookkeeper";

  // The two roles share the same dark glass shell but get a distinct accent color —
  // purple for the bookkeeper (matches their CPA license chip below), blue for the
  // client — so at a glance you can tell which "mode" you're in without reading anything.
  const accentText = isBookkeeper ? "text-purple-400" : "text-blue-400";
  const accentBorder = isBookkeeper ? "border-purple-500" : "border-blue-500";

  // Sidebar organized as folders reflecting how the features relate: everything scoped
  // to a specific client (Messages, Documents, Payments) nests under Clients; the
  // double-entry engine outputs (Journal & Ledger, Financial Statements, Reports) nest
  // under Accounting. Client role gets a simplified variant (bookkeeper's tree below is
  // completely unchanged): Messages is promoted to its own top-level item instead of
  // living inside "My Business Profile" (matches how prominently the dashboard now
  // surfaces it), and Accounting drops Journal & Ledger + Reports — the client never
  // edits those, and LedgerView/ReportsView aren't part of their workflow — keeping only
  // Financial Statements. Documents/Payments stay nested under "My Business Profile"
  // rather than being deleted outright, so both remain reachable (dropping them here
  // entirely would leave Payments completely unreachable from the client's nav).
  const navigationItems: NavItem[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    {
      id: "clients",
      label: isBookkeeper ? "Clients" : "My Business Profile",
      icon: Users,
      children: isBookkeeper
        ? [
            { id: "messages", label: "Messages", icon: MessageSquare, badge: unreadMessageCount },
            { id: "documents", label: "Documents", icon: FolderOpen },
            { id: "payments", label: "Payments", icon: Wallet },
          ]
        : [
            { id: "documents", label: "Documents", icon: FolderOpen },
            { id: "payments", label: "Payments", icon: Wallet },
          ],
    },
    { id: "compliance", label: "Compliance", icon: CalendarClock },
    ...(!isBookkeeper ? [{ id: "messages", label: "Messages", icon: MessageSquare, badge: unreadMessageCount }] : []),
    {
      id: "accounting",
      label: isBookkeeper ? "Accounting" : "Accounting (View Only)",
      icon: Calculator,
      isGroupOnly: true,
      children: isBookkeeper
        ? [
            { id: "ledger", label: "Journal & Ledger", icon: BookMarked },
            { id: "financials", label: "Financial Statements", icon: LineChart },
            { id: "reports", label: "Reports", icon: FileSpreadsheet },
          ]
        : [{ id: "financials", label: "Financial Statements", icon: LineChart }],
    },
    ...(isBookkeeper ? [{ id: "audit", label: "Audit Logs", icon: History }] : []),
    ...(isBookkeeper ? [{ id: "profile", label: "My Account", icon: UserCircle }] : []),
    ...(isBookkeeper ? [{ id: "security", label: "Security", icon: ShieldCheck }] : []),
    ...(!isBookkeeper ? [{ id: "profile", label: "My Profile", icon: UserCircle }] : []),
  ];

  // Folders start collapsed, but auto-expand below whenever the active tab is one of
  // their children — so deep-linking into e.g. Messages (via a notification click)
  // always reveals its parent folder rather than hiding the current page.
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<string>>(new Set());
  const toggleFolder = (id: string) => {
    setManuallyExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .slice(0, 2)
      .map((term) => term[0])
      .join("")
      .toUpperCase();
  };

  const renderRow = (item: NavChild, isChild: boolean, isActive: boolean, onClick: () => void) => {
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        onClick={onClick}
        className={`w-full flex items-center gap-2.5 py-2 rounded-lg text-left text-sm font-semibold transition-all ${
          isChild ? "pl-7 pr-3" : "px-3"
        } ${
          isActive
            ? `bg-white/10 text-white border-l-2 ${accentBorder} rounded-l-none ${isChild ? "pl-[26px]" : "pl-[10px]"}`
            : "text-gray-400 hover:text-white hover:bg-white/5"
        }`}
      >
        <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? accentText : "text-gray-500"}`} />
        <span className="truncate flex-1">{item.label}</span>
        {!!item.badge && (
          <span className="shrink-0 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold font-tabular">
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className="w-[220px] bg-black/40 backdrop-blur-md text-white h-full flex flex-col justify-between shrink-0 border-r border-white/10 overflow-y-auto">

      {/* Brand Section */}
      <div>
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-sm shrink-0">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <div className="leading-tight truncate">
              <div className="font-display font-bold text-base tracking-tight">
                <span className="text-white">Digi</span>
                <span className="text-purple-400">Bok</span>
              </div>
              <span className="block text-[10px] text-gray-400 font-tabular tracking-wider uppercase">Sipocot, CamSur</span>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-2 space-y-0.5">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const hasChildActive = item.children?.some((c) => c.id === activeTab) ?? false;
            const isExpanded = manuallyExpanded.has(item.id) || hasChildActive;
            // Aggregate badge (e.g. unread messages) surfaces on the folder header only
            // while collapsed, so a notification can't go unnoticed inside a closed folder.
            // Falls back to the item's own badge when it has no children (e.g. the
            // client's top-level "Messages" item, promoted out of a folder above).
            const aggregatedBadge = item.children
              ? item.children.reduce((sum, c) => sum + (c.badge || 0), 0)
              : item.badge || 0;

            return (
              <div key={item.id}>
                <button
                  onClick={() => {
                    if (!item.isGroupOnly) setActiveTab(item.id);
                    if (item.children) toggleFolder(item.id);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm font-semibold transition-all ${
                    isActive
                      ? `bg-white/10 text-white border-l-2 ${accentBorder} rounded-l-none pl-[10px]`
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? accentText : "text-gray-500"}`} />
                  <span className="truncate flex-1">{item.label}</span>
                  {!isExpanded && !!aggregatedBadge && (
                    <span className="shrink-0 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold font-tabular">
                      {aggregatedBadge}
                    </span>
                  )}
                  {!!item.children && (
                    isExpanded
                      ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-gray-500" />
                      : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-500" />
                  )}
                </button>

                {item.children && isExpanded && (
                  <div className="mt-0.5 space-y-0.5">
                    {item.children.map((child) =>
                      renderRow(child, true, activeTab === child.id, () => setActiveTab(child.id))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* User Info / Identity Profile details */}
      <div className="p-3 border-t border-white/10 space-y-2.5">

        {/* User Identity block */}
        <div className="flex items-center gap-2">
          {/* Avatar widget */}
          <div className={`w-7 h-7 rounded-lg bg-white/10 border border-white/10 font-bold text-xs ${accentText} flex items-center justify-center shrink-0 uppercase`}>
            {getInitials(user.name)}
          </div>
          <div className="leading-normal truncate overflow-hidden min-w-0">
            <span className="block text-sm font-bold text-white truncate">{user.name}</span>
            <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-400 font-semibold">
              <Award className={`w-2.5 h-2.5 ${accentText} shrink-0`} />
              <span className="capitalize">{user.role}</span>
            </span>
          </div>
        </div>

        {/* License key display */}
        {isBookkeeper && user.profile && (
          <div className="px-2 py-1 bg-white/5 border border-white/10 rounded font-tabular text-[10px] text-gray-400 truncate">
            No: {(user.profile as any).license_no || "CPA LICENSE"}
          </div>
        )}

        {/* Logout key trigger */}
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 text-sm text-gray-400 hover:text-white transition-all focus:outline-none"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Exit Account</span>
        </button>
      </div>
    </aside>
  );
}

import React, { useState, useEffect } from "react";
import { Bell, Calendar, CheckSquare, Zap, Clock, Sun, Moon, Minus, Plus } from "lucide-react";
import { AppNotification } from "../types";
import { Theme } from "../lib/theme";
import { ZoomLevel, ZOOM_LEVELS } from "../lib/zoom";

interface TopBarProps {
  title: string;
  token: string | null;
  onScanComplete: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  zoom: ZoomLevel;
  onZoomChange: (zoom: ZoomLevel) => void;
  onNavigate: (tab: string) => void;
  isBookkeeper: boolean;
}

export default function TopBar({ title, token, onScanComplete, theme, onToggleTheme, zoom, onZoomChange, onNavigate, isBookkeeper }: TopBarProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");

  const fetchNotifications = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/notifications", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (e) {
      console.error("Failed fetching notifications log:", e);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Auto refresh notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [token]);

  const handleMarkAsRead = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      }
    } catch (e) {
      console.error("Failed clear alerts:", e);
    }
  };

  // Perform interactive testing compliance deadline run instantly
  const handleTriggerComplianceScan = async () => {
    if (!token) return;
    setScanning(true);
    setScanMessage("");
    try {
      const res = await fetch("/api/compliance/scan", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setScanMessage(`Success! Updated ${data.count} compliance reminders.`);
        fetchNotifications();
        onScanComplete();
        setTimeout(() => setScanMessage(""), 4000);
      } else {
        throw new Error(data.message || "Failed scan");
      }
    } catch (err: any) {
      setScanMessage("Scan failed: " + err.message);
    } finally {
      setScanning(false);
    }
  };

  const unreadCount = notifications.filter((n) => n.is_read === 0).length;

  const handleNotificationClick = (n: AppNotification) => {
    if (!n.link) return;
    setShowDropdown(false);
    onNavigate(n.link);
  };

  return (
    <header className="h-[56px] px-6 bg-black/40 backdrop-blur-md border-b border-white/10 flex items-center justify-between shrink-0 relative z-30">

      {/* Title block */}
      <div className="flex items-center gap-3">
        <h1 className="font-display font-bold text-white text-base tracking-tight capitalize">{title}</h1>
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 bg-white/5 rounded-md text-xs font-tabular text-gray-400 border border-white/10">
          <Calendar className="w-3 h-3 text-gray-500" />
          <span>{new Date().toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}</span>
        </div>
      </div>

      {/* Operation actions */}
      <div className="flex items-center gap-3">

        {/* Compliance Scan Trigger Accelerators — bookkeeper only, since this fires a
            system-wide rescan and notification blast across every client. */}
        {isBookkeeper && scanMessage && (
          <div className="text-sm font-semibold text-green-400 bg-green-500/10 px-2.5 py-1 border border-green-500/30 rounded-md animate-count-up">
            {scanMessage}
          </div>
        )}

        {isBookkeeper && (
          <button
            onClick={handleTriggerComplianceScan}
            disabled={scanning}
            title="Fires the daily node-cron compliance obligation scanning job on-demand."
            className="flex items-center gap-1 px-2.5 py-1.5 text-sm font-bold text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-lg transition-all focus:outline-none disabled:opacity-60"
          >
            <Zap className={`w-3.5 h-3.5 text-purple-400 ${scanning ? "animate-bounce" : ""}`} />
            <span>{scanning ? "Scanning..." : "Simulate Cron Scan"}</span>
          </button>
        )}

        {/* Text-size / zoom control — scales the whole app's root font-size, not just
            this component, since every rem-based Tailwind size is relative to it. */}
        <div className="hidden md:flex items-center gap-0.5 bg-white/5 border border-white/10 rounded-lg px-1">
          <button
            onClick={() => onZoomChange(ZOOM_LEVELS[Math.max(0, ZOOM_LEVELS.indexOf(zoom) - 1)])}
            disabled={zoom === ZOOM_LEVELS[0]}
            title="Decrease text size"
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30 focus:outline-none"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="text-xs font-tabular font-bold text-gray-400 w-9 text-center select-none">{zoom}%</span>
          <button
            onClick={() => onZoomChange(ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, ZOOM_LEVELS.indexOf(zoom) + 1)])}
            disabled={zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
            title="Increase text size"
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30 focus:outline-none"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* Light / dark theme toggle */}
        <button
          onClick={onToggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center border border-white/10 text-gray-300 focus:outline-none"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Notifications alarm trigger */}
        <div className="relative">
          <button
            onClick={() => {
              setShowDropdown(!showDropdown);
              if (unreadCount > 0) {
                handleMarkAsRead();
              }
            }}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center border border-white/10 text-gray-300 relative focus:outline-none"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[11px] font-tabular text-white flex items-center justify-center font-bold animate-pulse-ring">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notifications dropdown pane */}
          {showDropdown && (
            <div className="absolute right-0 mt-2.5 w-[330px] bg-gray-900 rounded-xl shadow-2xl border border-white/10 py-1 max-h-[380px] overflow-y-auto z-40 animate-count-up">
              <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between bg-white/5">
                <span className="text-sm font-bold text-white flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5 text-gray-300" />
                  Compliance Alarms
                </span>
                {unreadCount > 0 && (
                  <span className="text-xs text-purple-400 font-bold font-tabular">
                    {unreadCount} new alerts
                  </span>
                )}
              </div>

              {notifications.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">
                  No active deadlines alerts registered. Running compliance is clean!
                </div>
              ) : (
                <div className="divide-y divide-white/10">
                  {notifications.map((n) => {
                    const isAlert = n.type === "alert";
                    const isClickable = !!n.link;
                    return (
                      <div
                        key={n.notification_id}
                        onClick={isClickable ? () => handleNotificationClick(n) : undefined}
                        role={isClickable ? "button" : undefined}
                        tabIndex={isClickable ? 0 : undefined}
                        onKeyDown={isClickable ? (e) => { if (e.key === "Enter") handleNotificationClick(n); } : undefined}
                        className={`p-3 transition-all ${n.is_read === 0 ? "bg-purple-500/10" : ""} ${
                          isClickable ? "hover:bg-white/5 cursor-pointer focus:outline-none focus:bg-white/5" : ""
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${isAlert ? "bg-red-500" : "bg-orange-500"}`}></span>
                          <div className="space-y-0.5 min-w-0 flex-1">
                            <p className="text-sm text-gray-200 leading-snug">{n.message}</p>
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 font-tabular">
                                <Clock className="w-2.5 h-2.5" />
                                {new Date(n.sent_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "numeric" })}
                              </span>
                              {isClickable && (
                                <span className="text-[11px] text-purple-400 font-bold uppercase tracking-wider shrink-0">View →</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </header>
  );
}

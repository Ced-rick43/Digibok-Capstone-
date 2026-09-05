import React, { useState, useEffect } from "react";
import AuthScreens from "./components/AuthScreens";
import MarketingSite from "./components/MarketingSite";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import DashboardView from "./components/DashboardView";
import ClientsView from "./components/ClientsView";
import ComplianceView from "./components/ComplianceView";
import PaymentsView from "./components/PaymentsView";
import DocumentsView from "./components/DocumentsView";
import LedgerView from "./components/LedgerView";
import FinancialStatementsView from "./components/FinancialStatementsView";
import ReportsView from "./components/ReportsView";
import AuditLogsView from "./components/AuditLogsView";
import ClientProfileView from "./components/ClientProfileView";
import BookkeeperProfileView from "./components/BookkeeperProfileView";
import SecurityView from "./components/SecurityView";
import MessagesView from "./components/MessagesView";
import FloatingChatWidget from "./components/FloatingChatWidget";
import { User, ClientProfile } from "./types";
import { Theme, getInitialTheme, applyTheme } from "./lib/theme";
import { ZoomLevel, getInitialZoom, applyZoom } from "./lib/zoom";
import { Clock3, Mail, LogOut } from "lucide-react";


export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("digibok_jwt"));
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [bootstrapping, setBootstrapping] = useState<boolean>(true);
  const [showAuth, setShowAuth] = useState<boolean>(false);
  const [authInitialTab, setAuthInitialTab] = useState<"login" | "register" | "register-client">("login");
  const [theme, setTheme] = useState<Theme>(getInitialTheme());
  const [zoom, setZoom] = useState<ZoomLevel>(getInitialZoom());
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  // Set by a dashboard summary card's drill-down click, read once on mount by whichever
  // view it navigates into (ComplianceView / PaymentsView) to preselect a filter. Views
  // are unmounted/remounted on tab change, so a one-time read is sufficient — no need to
  // clear it back out afterwards.
  const [drilldownFilter, setDrilldownFilter] = useState<string | null>(null);
  const [verifyBanner, setVerifyBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleDrilldown = (tab: string, filter?: string) => {
    setDrilldownFilter(filter || null);
    setActiveTab(tab);
  };

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    applyZoom(zoom);
  }, [zoom]);

  // A clicked verification-email link lands here as `?verify=<token>` — this is the only
  // "routing" the app has, so the exchange happens once on mount, then the URL is
  // cleaned up and the visitor is dropped on the login tab with a result banner.
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("verify");
    if (!token) return;

    window.history.replaceState({}, "", window.location.pathname);
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json();
        setVerifyBanner({ type: res.ok ? "success" : "error", message: data.message || "Something went wrong verifying your email." });
      })
      .catch(() => setVerifyBanner({ type: "error", message: "Something went wrong verifying your email. Please try the link again." }))
      .finally(() => {
        setAuthInitialTab("login");
        setShowAuth(true);
      });
  }, []);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const fetchUnreadMessageCount = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/messages/unread-count", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setUnreadMessageCount(data.count);
    } catch (e) {
      console.error("Failed fetching unread message count:", e);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchUnreadMessageCount();
    const interval = setInterval(fetchUnreadMessageCount, 30000);
    return () => clearInterval(interval);
  }, [token, refreshTrigger, activeTab]);

  // Read current profile me on startup if token is cached
  useEffect(() => {
    const fetchMe = async () => {
      const cachedToken = localStorage.getItem("digibok_jwt");
      if (!cachedToken) {
        setBootstrapping(false);
        return;
      }

      try {
        const res = await fetch("/api/auth/me", {
          headers: { "Authorization": `Bearer ${cachedToken}` },
        });
        const data = await res.json();
        if (res.ok) {
          setUser(data);
          setToken(cachedToken);
        } else {
          // Token expired or invalid
          localStorage.removeItem("digibok_jwt");
          setToken(null);
          setUser(null);
        }
      } catch (e) {
        console.error("Me fetch failed, entering silent fallback.", e);
      } finally {
        setBootstrapping(false);
      }
    };

    fetchMe();
  }, []);

  const handleLoginSuccess = (newToken: string, loggedInUser: User) => {
    localStorage.setItem("digibok_jwt", newToken);
    setToken(newToken);
    setUser(loggedInUser);
    setActiveTab("dashboard");
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleLogout = () => {
    localStorage.removeItem("digibok_jwt");
    setToken(null);
    setUser(null);
    setActiveTab("dashboard");
    setShowAuth(false);
  };

  const forceGlobalRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  if (bootstrapping) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-950 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <img src="/logo.png" alt="DigiBok" className="w-40 rounded-xl shadow-lg" />
          <span className="text-base font-bold text-white tracking-tight font-display uppercase">
            Loading DigiBok...
          </span>
          <span className="text-sm text-gray-400 font-medium font-tabular">Assembling compliant general ledger frameworks</span>
        </div>
      </div>
    );
  }

  // If unauthorized, render the public marketing site first, then the auth forms
  // once the visitor picks Log In / Register (or a role on the register-role page).
  if (!user || !token) {
    if (!showAuth) {
      return (
        <MarketingSite
          theme={theme}
          onToggleTheme={toggleTheme}
          onEnterAuth={(tab) => {
            setAuthInitialTab(tab);
            setShowAuth(true);
          }}
        />
      );
    }
    return (
      <AuthScreens
        onLoginSuccess={handleLoginSuccess}
        initialTab={authInitialTab}
        onBackToHome={() => setShowAuth(false)}
        verifyBanner={verifyBanner}
      />
    );
  }

  // A self-registered client can verify their email and log in, but stays gated here
  // until the bookkeeper reviews their submitted business details in Clients →
  // Approve. Checked after the auth gate above (so it always has a real user/profile)
  // and before the full authenticated shell (so nothing in the sidebar/tabs is reachable
  // while pending).
  if (user.role === "client" && (user.profile as ClientProfile | undefined)?.approval_status === "pending") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mx-auto">
            <Clock3 className="w-7 h-7 text-purple-400" />
          </div>
          <h2 className="text-xl font-display font-bold text-white">Waiting for Bookkeeper Approval</h2>
          <p className="text-sm text-gray-300">
            Thanks for verifying your email, {user.name}! Your bookkeeper still needs to review "{(user.profile as ClientProfile).business_name}" before your account is fully active. You'll be notified as soon as it's approved.
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400 pt-1">
            <Mail className="w-3.5 h-3.5" />
            <span>Questions? Contact your bookkeeper directly.</span>
          </div>
          <button
            onClick={handleLogout}
            className="mt-2 flex items-center gap-1.5 mx-auto text-sm text-gray-400 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-b from-gray-900 to-gray-950 flex flex-row overflow-hidden relative font-sans">
      
      {/* Sidebar navigation controls (180px fixed left) */}
      <Sidebar
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
        unreadMessageCount={unreadMessageCount}
      />

      {/* Floating chat widget — persists across all tabs */}
      <FloatingChatWidget
        user={user}
        token={token}
        unreadCount={unreadMessageCount}
        onMessagesRead={fetchUnreadMessageCount}
        onNavigateToMessages={() => setActiveTab("messages")}
      />

      {/* Main workplace container (flex right) */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        
        {/* Top bar controls */}
        <TopBar
          title={activeTab}
          token={token}
          onScanComplete={forceGlobalRefresh}
          theme={theme}
          onToggleTheme={toggleTheme}
          zoom={zoom}
          onZoomChange={setZoom}
          onNavigate={setActiveTab}
          isBookkeeper={user.role === "bookkeeper"}
        />

        {/* Content canvas (scrollable) */}
        <main className="flex-1 overflow-y-auto p-6 relative z-10">
          <div className="space-y-6">
            
            {activeTab === "dashboard" && (
              <DashboardView
                user={user}
                token={token}
                refreshTrigger={refreshTrigger}
                setActiveTab={setActiveTab}
                onDrilldown={handleDrilldown}
              />
            )}

            {activeTab === "messages" && (
              <MessagesView
                user={user}
                token={token}
                onMessagesRead={fetchUnreadMessageCount}
              />
            )}

            {activeTab === "clients" && (
              <ClientsView 
                user={user} 
                token={token} 
                onRefreshDashboard={forceGlobalRefresh} 
              />
            )}

            {activeTab === "compliance" && (
              <ComplianceView
                user={user}
                token={token}
                refreshTrigger={refreshTrigger}
                onRefreshDashboard={forceGlobalRefresh}
                initialFilter={drilldownFilter}
              />
            )}

            {activeTab === "payments" && (
              <PaymentsView
                user={user}
                token={token}
                refreshTrigger={refreshTrigger}
                onRefreshDashboard={forceGlobalRefresh}
                initialFilter={drilldownFilter}
              />
            )}

            {activeTab === "documents" && (
              <DocumentsView
                user={user}
                token={token}
                refreshTrigger={refreshTrigger}
              />
            )}

            {activeTab === "ledger" && (
              <LedgerView 
                user={user} 
                token={token} 
                refreshTrigger={refreshTrigger} 
                onRefreshDashboard={forceGlobalRefresh} 
              />
            )}

            {activeTab === "financials" && (
              <FinancialStatementsView
                user={user}
                token={token}
                refreshTrigger={refreshTrigger}
              />
            )}

            {activeTab === "reports" && (
              <ReportsView
                user={user}
                token={token}
                refreshTrigger={refreshTrigger}
              />
            )}

            {activeTab === "audit" && (
              <AuditLogsView
                user={user}
                token={token}
              />
            )}

            {activeTab === "profile" && (
              user.role === "bookkeeper" ? (
                <BookkeeperProfileView
                  user={user}
                  token={token}
                  onProfileUpdated={(name) => setUser((prev) => (prev ? { ...prev, name } : prev))}
                  onNavigate={setActiveTab}
                />
              ) : (
                <ClientProfileView
                  user={user}
                  token={token}
                  onProfileUpdated={(name) => setUser((prev) => (prev ? { ...prev, name } : prev))}
                  onNavigate={setActiveTab}
                />
              )
            )}

            {activeTab === "security" && (
              <SecurityView
                user={user}
                token={token}
              />
            )}

          </div>
        </main>

      </div>
    </div>
  );
}

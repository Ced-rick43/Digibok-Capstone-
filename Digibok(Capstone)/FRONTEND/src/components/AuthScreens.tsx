import React, { useState, useEffect } from "react";
import { LogIn, Key, Shield, User as UserIcon, Mail, Lock, Eye, EyeOff, UserPlus, Building2, ShieldCheck, ArrowLeft, Zap, ChevronDown, CheckCircle, BookOpen, BarChart3 } from "lucide-react";

interface AuthScreensProps {
  onLoginSuccess: (token: string, user: any) => void;
  initialTab?: "login" | "register" | "forgot" | "activate" | "register-client";
  onBackToHome?: () => void;
  // Result of clicking the emailed verification link, resolved once by the parent App
  // before this component even mounts (App owns the URL, since it renders both the
  // marketing site and this screen) — shown as a banner on the login tab.
  verifyBanner?: { type: "success" | "error"; message: string } | null;
}

export default function AuthScreens({ onLoginSuccess, initialTab, onBackToHome, verifyBanner }: AuthScreensProps) {
  const [activeTab, setActiveTab] = useState<"login" | "register" | "forgot" | "activate" | "register-client">(initialTab || "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Registration state
  const [fullName, setFullName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // CPA license number is optional and only collected later, from the Account page —
  // public registration just needs a TIN (BookkeeperProfileView.tsx already has its own
  // separate license-number field for whenever the bookkeeper wants to add it).
  const [regTin, setRegTin] = useState("");

  // Bookkeeper self-registration is bootstrap-only — open until the first bookkeeper
  // account exists, then closed for good. null while the check is still in flight, so
  // the Register button doesn't flash on/off before we know the real answer.
  const [bookkeeperRegistrationOpen, setBookkeeperRegistrationOpen] = useState<boolean | null>(null);

  // Landing on the "register" tab used to jump straight into the bookkeeper form —
  // meaning anyone arriving from the homepage's Register button with a client invite
  // code in hand hit a dead-end "Registration Is Closed" screen with no pointer to the
  // path that actually applied to them. null shows a role picker first; picking
  // "client" just forwards to the existing register-client tab, picking "bookkeeper"
  // reveals the existing form/closed-state below unchanged.
  const [registerRole, setRegisterRole] = useState<"bookkeeper" | "client" | null>(null);
  useEffect(() => {
    fetch("/api/auth/bookkeeper-registration-status")
      .then((res) => res.json())
      .then((data) => setBookkeeperRegistrationOpen(!!data.open))
      .catch(() => setBookkeeperRegistrationOpen(false));
  }, []);

  // Client account activation state
  const [activateEmail, setActivateEmail] = useState("");
  const [activatePassword, setActivatePassword] = useState("");
  const [activateConfirmPassword, setActivateConfirmPassword] = useState("");

  // Client self-registration (invite code) state
  const [crInviteCode, setCrInviteCode] = useState("");
  const [crBusinessName, setCrBusinessName] = useState("");
  const [crBusinessType, setCrBusinessType] = useState("Sole Proprietorship");
  const [crTin, setCrTin] = useState("");
  const [crAddress, setCrAddress] = useState("");
  const [crContactNo, setCrContactNo] = useState("");
  const [crOwnerName, setCrOwnerName] = useState("");
  const [crOwnerEmail, setCrOwnerEmail] = useState("");
  const [crPassword, setCrPassword] = useState("");
  const [crConfirmPassword, setCrConfirmPassword] = useState("");
  const [showCrPassword, setShowCrPassword] = useState(false);
  // True once registration succeeds — swaps the form for a "check your email" screen
  // instead of auto-logging in, since the account isn't usable until the link is clicked.
  const [crAwaitingVerification, setCrAwaitingVerification] = useState(false);
  const [showCrConfirmPassword, setShowCrConfirmPassword] = useState(false);

  // Forgot / reset password state
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetCodeSent, setResetCodeSent] = useState(false);
  // Kept local to each of the two forgot-password forms so a message from one
  // doesn't render at the top of the tab and shove the other form down.
  const [requestCodeMsg, setRequestCodeMsg] = useState("");
  const [requestCodeErr, setRequestCodeErr] = useState("");
  const [resetPasswordMsg, setResetPasswordMsg] = useState("");
  const [resetPasswordErr, setResetPasswordErr] = useState("");
  const [requestingCode, setRequestingCode] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // Two-factor login step — only ever populated for a bookkeeper account with 2FA
  // enabled; the server withholds the real session token until this is verified.
  const [totpChallengeToken, setTotpChallengeToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [verifyingTotp, setVerifyingTotp] = useState(false);

  // Show/hide toggles for password fields
  const [showPassword, setShowPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showActivatePassword, setShowActivatePassword] = useState(false);
  const [showActivateConfirmPassword, setShowActivateConfirmPassword] = useState(false);
  const [showResetNewPassword, setShowResetNewPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);

  // Collapsed by default — the quick-login credential buttons are a demo/evaluation
  // convenience, not something a real visitor should see as the first thing above the
  // actual sign-in form.
  const [showSandbox, setShowSandbox] = useState(false);

  // Quick Login Accel helper accounts
  const quickLogins = [
    {
      label: "CPA Bookkeeper User",
      pillLabel: "Bookkeeper",
      email: "sipocot.bookkeeper@gmail.com",
      password: "password123",
      role: "Bookkeeper",
    },
    {
      label: "Juan - Sipocot Bakery",
      pillLabel: "Juan (Client)",
      email: "juan@sipocotbakery.com",
      password: "clientpassword",
      role: "Client (Read-only)",
    },
    {
      label: "Teresa - Cam Sur Agri",
      pillLabel: "Teresa (Client)",
      email: "teresa@camsuragri.com",
      password: "clientpassword",
      role: "Client (Read-only)",
    },
  ];

  const handleApplyCredential = (acc: typeof quickLogins[0]) => {
    setEmail(acc.email);
    setPassword(acc.password);
    setError("");
    setSuccess(`Filled credentials for ${acc.label}!`);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please input email and password.");
      return;
    }

    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Login failed");
      }

      if (data.requiresTotp) {
        setTotpChallengeToken(data.challengeToken);
        setError("");
        setSuccess("");
        return;
      }

      onLoginSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message || "Connection error. Ensure Server.ts compile completed.");
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setTotpChallengeToken(null);
    setTotpCode("");
    setUseBackupCode(false);
    setError("");
    setSuccess("");
  };

  const handleTotpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode.trim()) {
      setError(useBackupCode ? "Please enter a backup code." : "Please enter your 6-digit code.");
      return;
    }

    setError("");
    setSuccess("");
    setVerifyingTotp(true);

    try {
      const res = await fetch("/api/auth/totp-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken: totpChallengeToken, code: totpCode.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Verification failed");
      }

      onLoginSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message || "Connection error. Ensure Server.ts compile completed.");
    } finally {
      setVerifyingTotp(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !regEmail || !regPassword || !regTin) {
      setError("Please fulfill all bookkeeper parameters.");
      return;
    }
    if (regPassword !== confirmPassword) {
      setError("Password confirmation does not match original.");
      return;
    }

    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fullName,
          email: regEmail,
          password: regPassword,
          confirmPassword,
          tin: regTin,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Registration failed");
      }

      setSuccess("Account successfully registered!");
      // Automatically log in
      onLoginSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message || "Failed registering profile");
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activateEmail || !activatePassword || !activateConfirmPassword) {
      setError("Please provide your email and a new password.");
      return;
    }
    if (activatePassword !== activateConfirmPassword) {
      setError("Password confirmation does not match.");
      return;
    }

    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: activateEmail,
          password: activatePassword,
          confirmPassword: activateConfirmPassword,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Account activation failed");
      }

      setSuccess("Account activated! Signing you in...");
      onLoginSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message || "Failed activating account");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crInviteCode || !crBusinessName || !crTin || !crAddress || !crContactNo || !crOwnerName || !crOwnerEmail || !crPassword) {
      setError("Please fill out all fields, including the invite code from your bookkeeper.");
      return;
    }
    if (crPassword !== crConfirmPassword) {
      setError("Password confirmation does not match original.");
      return;
    }

    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invite_code: crInviteCode,
          business_name: crBusinessName,
          business_type: crBusinessType,
          tin: crTin,
          address: crAddress,
          contact_number: crContactNo,
          owner_name: crOwnerName,
          owner_email: crOwnerEmail,
          password: crPassword,
          confirmPassword: crConfirmPassword,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Registration failed");
      }

      setCrAwaitingVerification(true);
    } catch (err: any) {
      setError(err.message || "Failed registering business profile");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) {
      setRequestCodeErr("Please enter your account email.");
      return;
    }

    setRequestCodeErr("");
    setRequestCodeMsg("");
    setRequestingCode(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to request reset code");
      }

      setRequestCodeMsg(data.message);
      setResetCodeSent(true);
    } catch (err: any) {
      setRequestCodeErr(err.message || "Failed to request reset code");
    } finally {
      setRequestingCode(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetCode || !resetNewPassword || !resetConfirmPassword) {
      setResetPasswordErr("Please provide the reset code and your new password.");
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setResetPasswordErr("Password confirmation does not match.");
      return;
    }

    setResetPasswordErr("");
    setResetPasswordMsg("");
    setResettingPassword(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: resetEmail,
          resetCode,
          password: resetNewPassword,
          confirmPassword: resetConfirmPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to reset password");
      }

      setResetPasswordMsg(`${data.message} Redirecting to sign in...`);
      setTimeout(() => {
        setActiveTab("login");
        setEmail(resetEmail);
        setPassword("");
        setResetEmail("");
        setResetCode("");
        setResetNewPassword("");
        setResetConfirmPassword("");
        setResetCodeSent(false);
        setRequestCodeMsg("");
        setRequestCodeErr("");
        setResetPasswordMsg("");
        setResetPasswordErr("");
      }, 2000);
    } catch (err: any) {
      setResetPasswordErr(err.message || "Failed to reset password");
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col lg:flex-row bg-gradient-to-b from-gray-900 to-gray-950 overflow-hidden">

      {/* Top nav — logo left, Back to Home center, Register right. Compact and fixed so it
          doesn't eat into the split-panel's own vertical space budget. */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 py-3">
        <span className="inline-flex items-center gap-2">
          <img src="/logo.png" alt="DigiBok" className="w-7 h-7 rounded-md" />
          <span className="hidden sm:inline font-display font-bold text-sm text-white">DigiBok</span>
        </span>
        {onBackToHome && (
          <button
            type="button"
            onClick={onBackToHome}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/70 hover:text-white transition-colors focus:outline-none"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Home
          </button>
        )}
        {activeTab !== "register" && (
          <button
            type="button"
            onClick={() => {
              setActiveTab("register");
              setRegisterRole(null);
              setError("");
              setSuccess("");
            }}
            className="px-4 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold rounded-lg transition-all focus:outline-none"
          >
            Register
          </button>
        )}
      </div>

      {/* Left column – Branding (Sipocot context), 40% on desktop, top ~40vh on tablet/mobile.
          Solid dark gradient (no video) — same visual identity as the marketing site now uses. */}
      <div className="relative lg:w-[40%] h-[36vh] lg:h-full shrink-0 text-white flex flex-col items-center justify-center p-6 md:p-10 overflow-hidden bg-black/40 backdrop-blur-sm">
        {/* Subtle design circles */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500 rounded-full opacity-10 blur-3xl transform translate-x-12 -translate-y-12"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-violet-500 rounded-full opacity-10 blur-3xl transform -translate-x-12 translate-y-12"></div>

        <div className="relative text-center max-w-md">
          <img src="/logo.png" alt="DigiBok" className="w-32 md:w-40 mx-auto mb-6 rounded-xl shadow-lg" />
          <BookOpen className="w-12 h-12 mx-auto mb-6 text-purple-400" />
          <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight text-white text-balance mb-4">
            Bookkeeping, finally in one place.
          </h1>
          <p className="text-base md:text-lg text-gray-200 leading-relaxed max-w-md mx-auto">
            Professional, centralized compliance tracking, double-entry automatic ledgers for
            <strong className="text-white"> Sipocot, Camarines Sur</strong>.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-6">
            {[
              { icon: CheckCircle, label: "BIR Non-VAT Accredited" },
              { icon: Shield, label: "Secure Double-Entry Ledger" },
              { icon: BarChart3, label: "Real-Time Financial Reports" },
            ].map((item) => (
              <span
                key={item.label}
                className="inline-flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-gray-100 text-[11px] font-medium"
              >
                <item.icon className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right column – Interactive forms, 60% on desktop, full width below */}
      <div className="relative flex-1 lg:w-[60%] lg:h-full flex items-center justify-center p-5 sm:p-6 md:p-8 bg-black/50 backdrop-blur-lg lg:border-l border-white/10 overflow-y-auto">
        <div className="w-full max-w-lg mx-auto">

          {activeTab === "login" && totpChallengeToken && (
            <div>
              <div className="mb-6">
                <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center mb-3">
                  <ShieldCheck className="w-5 h-5 text-purple-400" />
                </div>
                <h3 className="text-2xl font-display font-bold text-white">Two-Factor Verification</h3>
                <p className="text-base text-gray-300">
                  {useBackupCode
                    ? "Enter one of your saved backup codes."
                    : "Enter the 6-digit code from your authenticator app."}
                </p>
              </div>

              {error && (
                <div className="p-3 mb-4 bg-red-500/10 text-red-300 rounded-lg text-xs font-medium border border-red-500/30">
                  {error}
                </div>
              )}

              <form onSubmit={handleTotpVerify} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5 uppercase tracking-wider">
                    {useBackupCode ? "Backup Code" : "Authentication Code"}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400">
                      <Shield className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      autoFocus
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      placeholder={useBackupCode ? "XXXXX-XXXXX" : "123456"}
                      className="w-full pl-11 pr-4 py-3.5 text-lg bg-black/40 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all text-white placeholder:text-gray-500 font-tabular tracking-widest"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={verifyingTotp}
                  className="w-full py-4 bg-gradient-to-r from-purple-500 to-violet-600 hover:shadow-[0_0_50px_rgba(168,85,247,0.4)] border border-transparent rounded-xl text-lg font-bold text-white transition-all flex items-center justify-center gap-2"
                >
                  {verifyingTotp ? (
                    <span className="w-4.5 h-4.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <>
                      <ShieldCheck className="w-5 h-5" />
                      Verify &amp; Continue
                    </>
                  )}
                </button>

                <div className="text-center pt-2 space-y-1.5">
                  <div>
                    <button
                      type="button"
                      onClick={() => { setUseBackupCode((v) => !v); setTotpCode(""); setError(""); }}
                      className="text-sm text-purple-400 hover:underline font-semibold"
                    >
                      {useBackupCode ? "Use your authenticator app instead" : "Use a backup code instead"}
                    </button>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={handleBackToLogin}
                      className="inline-flex items-center gap-1 text-sm text-gray-300 hover:text-white font-medium"
                    >
                      <ArrowLeft className="w-3 h-3" />
                      Back to login
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {activeTab === "login" && !totpChallengeToken && (
            <div>
              <div className="mb-5">
                <h3 className="text-2xl md:text-3xl font-display font-bold text-white">Welcome Back</h3>
                <p className="text-base text-gray-200 mt-1">Sign in to manage your business finances.</p>
              </div>

              {verifyBanner && (
                <div
                  className={`p-3 mb-4 rounded-lg text-xs font-medium border ${
                    verifyBanner.type === "success"
                      ? "bg-green-500/10 text-green-300 border-green-500/30"
                      : "bg-red-500/10 text-red-300 border-red-500/30"
                  }`}
                >
                  {verifyBanner.message}
                </div>
              )}
              {error && (
                <div className="p-3 mb-4 bg-red-500/10 text-red-300 rounded-lg text-xs font-medium border border-red-500/30">
                  {error}
                </div>
              )}
              {success && (
                <div className="p-3 mb-4 bg-green-500/10 text-green-300 rounded-lg text-xs font-medium border border-green-500/30">
                  {success}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-3.5">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5 uppercase tracking-wider">Email Address</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400">
                      <Mail className="w-5 h-5" />
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. sipocot.bookkeeper@gmail.com"
                      className="w-full pl-12 pr-4 py-3.5 text-lg bg-black/40 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all text-white placeholder:text-gray-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-sm font-medium text-gray-300 uppercase tracking-wider">Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        if (email) setResetEmail(email);
                        setActiveTab("forgot");
                      }}
                      className="text-sm text-purple-400 hover:underline font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400">
                      <Lock className="w-5 h-5" />
                    </span>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-12 pr-12 py-3.5 text-lg bg-black/40 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all text-white placeholder:text-gray-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-white focus:outline-none"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-gradient-to-r from-purple-500 to-violet-600 border border-transparent rounded-xl text-lg font-bold text-white hover:shadow-[0_0_50px_rgba(168,85,247,0.4)] transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <>
                      Sign In to Workspace
                      <LogIn className="w-5 h-5" />
                    </>
                  )}
                </button>

                {/* Demo-evaluation shortcut, not a real auth method — framed as an alternate
                    path to the sign-in form above rather than a floating divider to nothing
                    (this app has no OAuth/social login to divide against). */}
                <div className="flex items-center gap-3 pt-1">
                  <span className="h-px flex-1 bg-white/15"></span>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">or</span>
                  <span className="h-px flex-1 bg-white/15"></span>
                </div>

                <div className="rounded-xl border border-dashed border-white/20 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowSandbox((v) => !v)}
                    className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left focus:outline-none"
                  >
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-purple-400 uppercase tracking-wider">
                      <Zap className="w-3.5 h-3.5 text-purple-400" />
                      Quick Demo Login
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${showSandbox ? "rotate-180" : ""}`} />
                  </button>
                  {showSandbox && (
                    <div className="px-4 pb-4">
                      <div className="flex flex-wrap gap-2">
                        {quickLogins.map((acc, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleApplyCredential(acc)}
                            title={acc.label}
                            className="px-6 py-3 bg-white/10 border border-white/20 rounded-full text-white text-sm font-semibold hover:bg-white/20 transition-all focus:outline-none"
                          >
                            {acc.pillLabel}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="text-center pt-1 space-y-1">
                  <div>
                    <span className="text-sm text-gray-300">First time client? </span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("activate");
                        setError("");
                        setSuccess("");
                      }}
                      className="text-base text-gray-300 hover:text-white underline font-semibold"
                    >
                      Activate Your Account
                    </button>
                  </div>
                  <div>
                    <span className="text-sm text-gray-300">Have an invite code? </span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("register-client");
                        setError("");
                        setSuccess("");
                      }}
                      className="text-base text-gray-300 hover:text-white underline font-semibold"
                    >
                      Register as New Client
                    </button>
                  </div>
                </div>
              </form>

              <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                {["Accredited BIR Non-VAT", "Secure Double-Entry", "Real-Time Ledger"].map((badge) => (
                  <span
                    key={badge}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-400 text-sm font-medium"
                  >
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    {badge}
                  </span>
                ))}
              </div>
            </div>
          )}

          {activeTab === "register" && registerRole === null && (
            <div>
              <div className="mb-6">
                <h3 className="text-2xl md:text-3xl font-display font-bold text-white">Let's Get You Registered</h3>
                <p className="text-base text-gray-200 mt-1">First, which one are you?</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setRegisterRole("bookkeeper")}
                  className="text-left p-5 bg-black/40 border border-white/15 hover:border-purple-500/60 hover:bg-black/55 rounded-xl transition-all focus:outline-none group"
                >
                  <div className="w-10 h-10 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center mb-3">
                    <ShieldCheck className="w-5 h-5 text-purple-400" />
                  </div>
                  <h4 className="text-lg font-display font-bold text-white flex items-center gap-2">
                    I'm a Bookkeeper
                    {bookkeeperRegistrationOpen === false && (
                      <span className="text-[10px] font-tabular font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/10 text-gray-400 border border-white/15">Closed</span>
                    )}
                  </h4>
                  <p className="text-sm text-gray-300 mt-1.5 leading-relaxed">
                    Set up your own DigiBok workspace to manage clients' books and BIR compliance.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("register-client")}
                  className="text-left p-5 bg-black/40 border border-white/15 hover:border-violet-500/60 hover:bg-black/55 rounded-xl transition-all focus:outline-none group"
                >
                  <div className="w-10 h-10 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center mb-3">
                    <UserPlus className="w-5 h-5 text-purple-400" />
                  </div>
                  <h4 className="text-lg font-display font-bold text-white">I'm a Client</h4>
                  <p className="text-sm text-gray-300 mt-1.5 leading-relaxed">
                    Your bookkeeper gave you a one-time invite code — use it to set up your own account.
                  </p>
                </button>
              </div>

              <div className="text-center mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("login");
                    setError("");
                    setSuccess("");
                  }}
                  className="inline-flex items-center gap-1.5 text-sm text-gray-300 hover:text-white font-semibold"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to login
                </button>
              </div>
            </div>
          )}

          {activeTab === "register" && registerRole === "bookkeeper" && bookkeeperRegistrationOpen === false && (
            <div>
              <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center mb-4">
                <ShieldCheck className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="text-2xl md:text-3xl font-display font-bold text-white">Registration Is Closed</h3>
              <p className="text-base text-gray-200 mt-1 max-w-sm">
                A bookkeeper account already exists for this workspace. Ask your existing bookkeeper to set up your account
                — or if you're actually one of their clients, go back and pick "I'm a Client" instead.
              </p>
              <button
                type="button"
                onClick={() => setRegisterRole(null)}
                className="mt-5 inline-flex items-center gap-1.5 text-sm text-purple-400 hover:underline font-semibold"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
            </div>
          )}

          {activeTab === "register" && registerRole === "bookkeeper" && bookkeeperRegistrationOpen !== false && (
            <div>
              <div className="mb-5">
                <button
                  type="button"
                  onClick={() => setRegisterRole(null)}
                  className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white font-semibold mb-3"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Back
                </button>
                <h3 className="text-2xl md:text-3xl font-display font-bold text-white">Bookkeeper Registration</h3>
                <p className="text-base text-gray-200 mt-1">Register as a licensed local bookkeeper representative.</p>
              </div>

              {error && (
                <div className="p-3 mb-4 bg-red-500/10 text-red-300 rounded-lg text-xs font-medium border border-red-500/30">
                  {error}
                </div>
              )}

              <form onSubmit={handleRegister} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5 uppercase tracking-wider">Full Name & CPA</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400">
                        <UserIcon className="w-5 h-5" />
                      </span>
                      <input
                        type="text"
                        placeholder="Maria Santos, CPA"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full pl-12 pr-4 py-3.5 text-lg bg-black/40 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all text-white placeholder:text-gray-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5 uppercase tracking-wider">TIN (Tax Identification No.)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400">
                        <ShieldCheck className="w-5 h-5" />
                      </span>
                      <input
                        type="text"
                        placeholder="123-456-789-000"
                        value={regTin}
                        onChange={(e) => setRegTin(e.target.value)}
                        className="w-full pl-12 pr-4 py-3.5 text-lg bg-black/40 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all text-white placeholder:text-gray-500 font-tabular"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5 uppercase tracking-wider">Professional Email</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400">
                      <Mail className="w-5 h-5" />
                    </span>
                    <input
                      type="email"
                      placeholder="name@email.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="w-full pl-12 pr-4 py-3.5 text-lg bg-black/40 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all text-white placeholder:text-gray-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5 uppercase tracking-wider">Password</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400">
                        <Lock className="w-5 h-5" />
                      </span>
                      <input
                        type={showRegPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="w-full pl-12 pr-12 py-3.5 text-lg bg-black/40 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all text-white placeholder:text-gray-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-white focus:outline-none"
                        aria-label={showRegPassword ? "Hide password" : "Show password"}
                      >
                        {showRegPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5 uppercase tracking-wider">Confirm Password</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400">
                        <Lock className="w-5 h-5" />
                      </span>
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full pl-12 pr-12 py-3.5 text-lg bg-black/40 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all text-white placeholder:text-gray-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-white focus:outline-none"
                        aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                      >
                        {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-gradient-to-r from-purple-500 to-violet-600 border border-transparent rounded-xl text-lg font-bold text-white hover:shadow-[0_0_50px_rgba(168,85,247,0.4)] transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    "Submit Registration & Lock"
                  )}
                </button>

                <div className="text-center pt-1">
                  <span className="text-sm text-gray-300">Already registered bookkeeper profile? </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("login");
                      setError("");
                      setSuccess("");
                    }}
                    className="text-sm text-purple-400 hover:underline font-semibold"
                  >
                    Log In Home
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === "forgot" && (
            <div>
              <div className="mb-6">
                <h3 className="text-2xl font-display font-bold text-white">Reset Your Password</h3>
                <p className="text-base text-gray-300">Works for both bookkeeper and client accounts.</p>
              </div>

              <form onSubmit={handleRequestResetCode} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase font-tabular tracking-wider">Account Email</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      type="email"
                      placeholder="e.g. sipocot.bookkeeper@gmail.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-sm bg-black/40 border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder:text-gray-500"
                    />
                  </div>
                </div>

                {requestCodeErr && (
                  <div className="p-2.5 bg-red-500/10 text-red-300 rounded-lg text-xs font-medium border border-red-500/30">
                    {requestCodeErr}
                  </div>
                )}
                {requestCodeMsg && (
                  <div className="p-2.5 bg-green-500/10 text-green-300 rounded-lg text-xs font-medium border border-green-500/30">
                    {requestCodeMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={requestingCode}
                  className="w-full py-2 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-60"
                >
                  {requestingCode ? "Sending..." : resetCodeSent ? "Resend Reset Code" : "Send Reset Code"}
                </button>
              </form>

              <div className="my-5 border-t border-dashed border-white/15"></div>

              <form onSubmit={handleResetPassword} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase font-tabular tracking-wider">Reset Code</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                      <Key className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="Code from your email"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-sm bg-black/40 border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder:text-gray-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase font-tabular tracking-wider">New Password</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      type={showResetNewPassword ? "text" : "password"}
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-10 py-2 text-sm bg-black/40 border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder:text-gray-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetNewPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-white focus:outline-none"
                      aria-label={showResetNewPassword ? "Hide password" : "Show password"}
                    >
                      {showResetNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase font-tabular tracking-wider">Confirm New Password</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      type={showResetConfirmPassword ? "text" : "password"}
                      value={resetConfirmPassword}
                      onChange={(e) => setResetConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-10 py-2 text-sm bg-black/40 border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder:text-gray-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetConfirmPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-white focus:outline-none"
                      aria-label={showResetConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showResetConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {resetPasswordErr && (
                  <div className="p-2.5 bg-red-500/10 text-red-300 rounded-lg text-xs font-medium border border-red-500/30">
                    {resetPasswordErr}
                  </div>
                )}
                {resetPasswordMsg && (
                  <div className="p-2.5 bg-green-500/10 text-green-300 rounded-lg text-xs font-medium border border-green-500/30">
                    {resetPasswordMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={resettingPassword}
                  className="w-full py-2.5 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 border border-transparent rounded-lg text-sm font-semibold text-white shadow-md transition-all focus:outline-none disabled:opacity-60"
                >
                  {resettingPassword ? "Resetting..." : "Reset Password"}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("login");
                      setRequestCodeErr("");
                      setRequestCodeMsg("");
                      setResetPasswordErr("");
                      setResetPasswordMsg("");
                    }}
                    className="text-xs text-gray-300 hover:text-purple-400 hover:underline font-medium"
                  >
                    Back to login screen
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === "activate" && (
            <div>
              <div className="mb-6">
                <h3 className="text-2xl font-display font-bold text-white">Activate Your Account</h3>
                <p className="text-base text-gray-300">Your bookkeeper has set up your business profile. Set your own password to sign in for the first time.</p>
              </div>

              {error && (
                <div className="p-3 mb-4 bg-red-500/10 text-red-300 rounded-lg text-xs font-medium border border-red-500/30">
                  {error}
                </div>
              )}
              {success && (
                <div className="p-3 mb-4 bg-green-500/10 text-green-300 rounded-lg text-xs font-medium border border-green-500/30">
                  {success}
                </div>
              )}

              <form onSubmit={handleActivate} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase font-tabular tracking-wider">Registered Email Address</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      type="email"
                      value={activateEmail}
                      onChange={(e) => setActivateEmail(e.target.value)}
                      placeholder="e.g. juan@sipocotbakery.com"
                      className="w-full pl-9 pr-4 py-2 text-sm bg-black/40 border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder:text-gray-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase font-tabular tracking-wider">New Password</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      type={showActivatePassword ? "text" : "password"}
                      value={activatePassword}
                      onChange={(e) => setActivatePassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-10 py-2 text-sm bg-black/40 border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder:text-gray-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowActivatePassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-white focus:outline-none"
                      aria-label={showActivatePassword ? "Hide password" : "Show password"}
                    >
                      {showActivatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase font-tabular tracking-wider">Confirm New Password</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      type={showActivateConfirmPassword ? "text" : "password"}
                      value={activateConfirmPassword}
                      onChange={(e) => setActivateConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-10 py-2 text-sm bg-black/40 border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder:text-gray-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowActivateConfirmPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-white focus:outline-none"
                      aria-label={showActivateConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showActivateConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 border border-transparent rounded-lg text-sm font-semibold text-white shadow-md transition-all focus:outline-none flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <span className="w-4.5 h-4.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Activate & Sign In
                    </>
                  )}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("login");
                      setError("");
                      setSuccess("");
                    }}
                    className="text-xs text-gray-300 hover:text-purple-400 hover:underline font-medium"
                  >
                    Back to login screen
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === "register-client" && crAwaitingVerification && (
            <div className="text-center py-6">
              <Mail className="w-12 h-12 text-purple-400 mx-auto mb-4" />
              <h3 className="text-2xl font-display font-bold text-white mb-2">Check Your Email</h3>
              <p className="text-base text-gray-300 max-w-sm mx-auto">
                We sent a verification link to <strong className="text-white">{crOwnerEmail}</strong>. Click it to confirm your email, then sign in — your bookkeeper will still need to review and approve your business details before you get full access.
              </p>
              <button
                type="button"
                onClick={() => {
                  setCrAwaitingVerification(false);
                  setActiveTab("login");
                  setError("");
                  setSuccess("");
                }}
                className="mt-6 text-sm text-purple-400 hover:underline font-semibold"
              >
                Back to Log In
              </button>
            </div>
          )}

          {activeTab === "register-client" && !crAwaitingVerification && (
            <div>
              <div className="mb-6">
                <h3 className="text-2xl font-display font-bold text-white">Register as New Client</h3>
                <p className="text-base text-gray-300">Enter the invite code your bookkeeper gave you, then set up your own business profile.</p>
              </div>

              {error && (
                <div className="p-3 mb-4 bg-red-500/10 text-red-300 rounded-lg text-xs font-medium border border-red-500/30">
                  {error}
                </div>
              )}
              {success && (
                <div className="p-3 mb-4 bg-green-500/10 text-green-300 rounded-lg text-xs font-medium border border-green-500/30">
                  {success}
                </div>
              )}

              <form onSubmit={handleRegisterClient} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase font-tabular tracking-wider">Invite Code</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                      <Key className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="Provided by your bookkeeper"
                      value={crInviteCode}
                      onChange={(e) => setCrInviteCode(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-sm bg-black/40 border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder:text-gray-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase font-tabular tracking-wider">Business Name</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                        <Building2 className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Sipocot Bakery & Café"
                        value={crBusinessName}
                        onChange={(e) => setCrBusinessName(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm bg-black/40 border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder:text-gray-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase font-tabular tracking-wider">Business Type</label>
                    <select
                      value={crBusinessType}
                      onChange={(e) => setCrBusinessType(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-black/40 border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder:text-gray-500"
                    >
                      <option value="Sole Proprietorship">Sole Proprietorship</option>
                      <option value="Partnership">Partnership</option>
                      <option value="Corporation">Corporation</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase font-tabular tracking-wider">TIN (Tax Identification No.)</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 123-456-789-000"
                      value={crTin}
                      onChange={(e) => setCrTin(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-black/40 border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-tabular text-white placeholder:text-gray-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase font-tabular tracking-wider">Business Address</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. San Juan Ave, Sipocot"
                      value={crAddress}
                      onChange={(e) => setCrAddress(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-black/40 border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder:text-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase font-tabular tracking-wider">Contact Number</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 0917-123-4567"
                      value={crContactNo}
                      onChange={(e) => setCrContactNo(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-black/40 border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder:text-gray-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase font-tabular tracking-wider">Your Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Juan Dela Cruz"
                      value={crOwnerName}
                      onChange={(e) => setCrOwnerName(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-black/40 border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder:text-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase font-tabular tracking-wider">Login Email</label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. juan@sipocotbakery.com"
                      value={crOwnerEmail}
                      onChange={(e) => setCrOwnerEmail(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-black/40 border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder:text-gray-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase font-tabular tracking-wider">Password</label>
                    <div className="relative">
                      <input
                        type={showCrPassword ? "text" : "password"}
                        required
                        placeholder="••••••••"
                        value={crPassword}
                        onChange={(e) => setCrPassword(e.target.value)}
                        className="w-full px-3 pr-10 py-2 text-sm bg-black/40 border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder:text-gray-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCrPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-white focus:outline-none"
                        aria-label={showCrPassword ? "Hide password" : "Show password"}
                      >
                        {showCrPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase font-tabular tracking-wider">Confirm Password</label>
                    <div className="relative">
                      <input
                        type={showCrConfirmPassword ? "text" : "password"}
                        required
                        placeholder="••••••••"
                        value={crConfirmPassword}
                        onChange={(e) => setCrConfirmPassword(e.target.value)}
                        className="w-full px-3 pr-10 py-2 text-sm bg-black/40 border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder:text-gray-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCrConfirmPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-white focus:outline-none"
                        aria-label={showCrConfirmPassword ? "Hide password" : "Show password"}
                      >
                        {showCrConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 border border-transparent rounded-lg text-sm font-semibold text-white shadow-md transition-all focus:outline-none flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <span className="w-4.5 h-4.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Register & Sign In
                    </>
                  )}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("login");
                      setError("");
                      setSuccess("");
                    }}
                    className="text-xs text-gray-300 hover:text-purple-400 hover:underline font-medium"
                  >
                    Back to login screen
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

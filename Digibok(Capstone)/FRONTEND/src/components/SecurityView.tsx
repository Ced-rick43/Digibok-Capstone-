import React, { useState, useEffect } from "react";
import { ShieldCheck, ShieldOff, KeyRound, Info, Copy, Check, Printer } from "lucide-react";
import { User } from "../types";

interface SecurityViewProps {
  user: User;
  token: string | null;
}

interface TotpStatus {
  enabled: boolean;
  backupCodesRemaining: number;
}

interface SetupData {
  secret: string;
  qrCodeDataUrl: string;
}

export default function SecurityView({ user, token }: SecurityViewProps) {
  const [status, setStatus] = useState<TotpStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [settingUp, setSettingUp] = useState(false);
  const [startingSetup, setStartingSetup] = useState(false);
  const [setupError, setSetupError] = useState("");

  const [revealedCodes, setRevealedCodes] = useState<string[] | null>(null);
  const [codesSavedConfirmed, setCodesSavedConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  const [showDisableModal, setShowDisableModal] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [disabling, setDisabling] = useState(false);
  const [disableError, setDisableError] = useState("");

  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [regenerateCode, setRegenerateCode] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState("");

  const authHeaders = { "Authorization": `Bearer ${token}` };

  const fetchStatus = async () => {
    if (!token) return;
    setLoadingStatus(true);
    try {
      const res = await fetch("/api/security/totp/status", { headers: authHeaders });
      const data = await res.json();
      if (res.ok) setStatus(data);
    } catch (e) {
      console.error("Failed loading 2FA status:", e);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [token]);

  const handleStartSetup = async () => {
    if (!token) return;
    setSetupError("");
    setStartingSetup(true);
    try {
      const res = await fetch("/api/security/totp/setup", { method: "POST", headers: authHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to start setup.");
      setSetupData({ secret: data.secret, qrCodeDataUrl: data.qrCodeDataUrl });
      setSetupCode("");
    } catch (e: any) {
      setSetupError(e.message);
    } finally {
      setStartingSetup(false);
    }
  };

  const handleCancelSetup = () => {
    setSetupData(null);
    setSetupCode("");
    setSetupError("");
  };

  const handleVerifySetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSetupError("");
    setSettingUp(true);
    try {
      const res = await fetch("/api/security/totp/verify-setup", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ code: setupCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "That code didn't match.");
      setSetupData(null);
      setSetupCode("");
      setRevealedCodes(data.backupCodes);
      setCodesSavedConfirmed(false);
      fetchStatus();
    } catch (e: any) {
      setSetupError(e.message);
    } finally {
      setSettingUp(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setDisableError("");
    setDisabling(true);
    try {
      const res = await fetch("/api/security/totp/disable", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to disable.");
      setShowDisableModal(false);
      setDisableCode("");
      fetchStatus();
    } catch (e: any) {
      setDisableError(e.message);
    } finally {
      setDisabling(false);
    }
  };

  const handleRegenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setRegenerateError("");
    setRegenerating(true);
    try {
      const res = await fetch("/api/security/totp/regenerate-backup-codes", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ code: regenerateCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "That code didn't match.");
      setShowRegenerateModal(false);
      setRegenerateCode("");
      setRevealedCodes(data.backupCodes);
      setCodesSavedConfirmed(false);
      fetchStatus();
    } catch (e: any) {
      setRegenerateError(e.message);
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopyCodes = () => {
    if (!revealedCodes) return;
    navigator.clipboard.writeText(revealedCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Opens a clean, standalone print view — not window.print() on the app itself, which
  // would print the sidebar/modal chrome — so the printout is just a plain sheet of codes
  // safe to file away, with no dependency on the app's own styling.
  const handlePrintCodes = () => {
    if (!revealedCodes) return;
    const printWindow = window.open("", "_blank", "width=480,height=640");
    if (!printWindow) return;

    const generatedAt = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
    const codesHtml = revealedCodes.map((code) => `<div class="code">${code}</div>`).join("");

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>DigiBok Backup Codes</title>
          <meta charset="utf-8" />
          <style>
            body { font-family: Georgia, 'Times New Roman', serif; padding: 40px; color: #221C13; }
            h1 { font-size: 18px; margin: 0 0 4px; }
            .meta { font-size: 12px; color: #6E6455; margin-bottom: 24px; }
            .codes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 24px; }
            .code { border: 1px solid #999; border-radius: 6px; padding: 10px; text-align: center;
                    font-family: 'Courier New', monospace; font-size: 15px; letter-spacing: 1px; }
            .note { font-size: 12px; color: #6E6455; border-top: 1px solid #ccc; padding-top: 16px; }
          </style>
        </head>
        <body>
          <h1>DigiBok — Two-Factor Backup Codes</h1>
          <div class="meta">Account: ${user.email}<br />Generated: ${generatedAt}</div>
          <div class="codes">${codesHtml}</div>
          <div class="note">
            Each code works once, if you lose access to your authenticator app. Keep this
            printout somewhere safe (e.g. a locked drawer) — anyone with these codes and your
            password can sign in to your DigiBok account.
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  if (loadingStatus) {
    return <div className="p-8 text-center text-sm font-semibold text-gray-400 font-tabular">Loading security settings...</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display font-bold text-white text-lg">Security</h3>
        <p className="text-sm text-gray-400">Two-factor authentication for your bookkeeper account.</p>
      </div>

      <div className="p-3 bg-white/10 border border-white/10 rounded-lg flex gap-2.5">
        <Info className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />
        <p className="text-sm text-gray-300">
          Two-factor authentication (2FA) adds a second step when you log in. Even if someone learns your
          password, they still can't get in without a code from your phone's authenticator app. This setting
          is only visible to bookkeeper accounts, and only you can turn it on or off for your own account.
        </p>
      </div>

      {!setupData && !status?.enabled && (
        <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              <ShieldOff className="w-4.5 h-4.5 text-gray-400" />
            </div>
            <div>
              <p className="text-base font-bold text-white">Two-Factor Authentication</p>
              <p className="text-sm text-gray-400">Not enabled</p>
            </div>
          </div>

          {setupError && (
            <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold rounded">{setupError}</div>
          )}

          <button
            onClick={handleStartSetup}
            disabled={startingSetup}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all focus:outline-none"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {startingSetup ? "Starting..." : "Enable Two-Factor Authentication"}
          </button>
        </div>
      )}

      {setupData && (
        <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-5 space-y-4">
          <div>
            <h4 className="font-display font-bold text-white text-base">Set Up Your Authenticator App</h4>
            <p className="text-sm text-gray-400 mt-0.5">
              Scan this QR code with Google Authenticator, Authy, or any TOTP app. Can't scan? Type the key in manually below.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-5 items-start">
            <img
              src={setupData.qrCodeDataUrl}
              alt="Scan with your authenticator app"
              className="w-40 h-40 rounded-lg border border-white/10 shrink-0"
            />
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Manual Entry Key</label>
                <div className="px-3 py-2 bg-black/30 border border-white/10 rounded font-tabular text-sm text-white break-all select-all">
                  {setupData.secret}
                </div>
              </div>

              <form onSubmit={handleVerifySetup} className="space-y-2">
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">
                  Enter the 6-digit code from your app
                </label>
                <input
                  type="text"
                  autoFocus
                  value={setupCode}
                  onChange={(e) => setSetupCode(e.target.value)}
                  placeholder="123456"
                  className="w-full px-3 py-1.5 text-base bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-tabular tracking-widest text-white"
                />
                {setupError && (
                  <div className="p-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold rounded">{setupError}</div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={settingUp}
                    className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all focus:outline-none"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {settingUp ? "Verifying..." : "Verify & Enable"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelSetup}
                    className="px-4 py-2 bg-black/30 border border-white/10 text-gray-300 text-sm font-bold rounded-lg hover:bg-white/10 transition-all focus:outline-none"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {!setupData && status?.enabled && (
        <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4.5 h-4.5 text-green-400" />
            </div>
            <div>
              <p className="text-base font-bold text-white">Two-Factor Authentication</p>
              <span className="inline-block px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/30 rounded-full text-xs font-bold uppercase">
                Enabled
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-400">
            <KeyRound className="w-3.5 h-3.5 shrink-0" />
            <span>{status.backupCodesRemaining} backup code{status.backupCodesRemaining === 1 ? "" : "s"} remaining</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setShowRegenerateModal(true); setRegenerateError(""); setRegenerateCode(""); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-black/30 border border-white/10 text-gray-300 text-sm font-bold rounded-lg hover:bg-white/10 transition-all focus:outline-none"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Regenerate Backup Codes
            </button>
            <button
              onClick={() => { setShowDisableModal(true); setDisableError(""); setDisableCode(""); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-bold rounded-lg hover:bg-red-500/10 transition-all focus:outline-none"
            >
              <ShieldOff className="w-3.5 h-3.5" />
              Disable Two-Factor Authentication
            </button>
          </div>
        </div>
      )}

      {/* BACKUP CODES REVEAL MODAL */}
      {revealedCodes && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <div className="bg-black/40 backdrop-blur-md rounded-lg max-w-md w-full p-5 shadow-2xl border border-white/10">
            <div className="pb-3 mb-4 border-b border-white/10">
              <h4 className="font-display font-bold text-white text-sm uppercase font-tabular tracking-wider">Your Backup Codes</h4>
              <p className="text-sm text-gray-400 mt-0.5">
                Each code works once, if you lose access to your authenticator app. Save these somewhere safe —
                they won't be shown again.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              {revealedCodes.map((code) => (
                <div key={code} className="px-2.5 py-1.5 bg-black/30 border border-white/10 rounded font-tabular text-sm text-center text-white">
                  {code}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={handleCopyCodes}
                className="flex items-center justify-center gap-1.5 py-1.5 bg-black/30 border border-white/10 text-gray-300 text-sm font-bold rounded-lg hover:bg-white/10 transition-all focus:outline-none"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy Codes"}
              </button>
              <button
                onClick={handlePrintCodes}
                className="flex items-center justify-center gap-1.5 py-1.5 bg-black/30 border border-white/10 text-gray-300 text-sm font-bold rounded-lg hover:bg-white/10 transition-all focus:outline-none"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Codes
              </button>
            </div>

            <label className="flex items-start gap-2 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={codesSavedConfirmed}
                onChange={(e) => setCodesSavedConfirmed(e.target.checked)}
                className="mt-0.5 w-3.5 h-3.5 accent-purple-500"
              />
              <span className="text-sm text-white">I've saved these codes somewhere safe.</span>
            </label>

            <button
              onClick={() => setRevealedCodes(null)}
              disabled={!codesSavedConfirmed}
              className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-all focus:outline-none"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* DISABLE MODAL */}
      {showDisableModal && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <div className="bg-black/40 backdrop-blur-md rounded-lg max-w-sm w-full p-5 shadow-2xl border border-white/10">
            <div className="pb-3 mb-4 border-b border-white/10 flex justify-between items-center">
              <h4 className="font-display font-bold text-white text-sm uppercase font-tabular tracking-wider">Disable Two-Factor Auth</h4>
              <button onClick={() => setShowDisableModal(false)} className="text-gray-400 hover:text-gray-300 font-extrabold text-base">✕</button>
            </div>
            <p className="text-sm text-gray-400 mb-3">Enter a current code to turn 2FA off.</p>

            {disableError && (
              <div className="p-2.5 mb-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold rounded">{disableError}</div>
            )}

            <form onSubmit={handleDisable} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Authentication or Backup Code</label>
                <input
                  type="text"
                  required
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  placeholder="123456 or XXXXX-XXXXX"
                  className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-tabular text-white"
                />
              </div>
              <button
                type="submit"
                disabled={disabling}
                className="w-full py-2 bg-red-500 hover:bg-red-500/90 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all focus:outline-none"
              >
                {disabling ? "Disabling..." : "Disable Two-Factor Authentication"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* REGENERATE BACKUP CODES MODAL */}
      {showRegenerateModal && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <div className="bg-black/40 backdrop-blur-md rounded-lg max-w-sm w-full p-5 shadow-2xl border border-white/10">
            <div className="pb-3 mb-4 border-b border-white/10 flex justify-between items-center">
              <h4 className="font-display font-bold text-white text-sm uppercase font-tabular tracking-wider">Regenerate Backup Codes</h4>
              <button onClick={() => setShowRegenerateModal(false)} className="text-gray-400 hover:text-gray-300 font-extrabold text-base">✕</button>
            </div>
            <p className="text-sm text-gray-400 mb-3">
              Your old backup codes will stop working. Enter a current code from your authenticator app to confirm.
            </p>

            {regenerateError && (
              <div className="p-2.5 mb-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold rounded">{regenerateError}</div>
            )}

            <form onSubmit={handleRegenerate} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Authentication Code</label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={regenerateCode}
                  onChange={(e) => setRegenerateCode(e.target.value)}
                  placeholder="123456"
                  className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-tabular tracking-widest text-white"
                />
              </div>
              <button
                type="submit"
                disabled={regenerating}
                className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all focus:outline-none"
              >
                {regenerating ? "Confirming..." : "Regenerate Codes"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

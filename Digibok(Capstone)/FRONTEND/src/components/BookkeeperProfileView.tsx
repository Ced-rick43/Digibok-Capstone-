import React, { useState, useEffect } from "react";
import {
  Award,
  Camera,
  Phone,
  Building2,
  BadgeCheck,
  Shield,
  ShieldCheck,
  Bell,
  ChevronDown,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";
import { User } from "../types";

interface BookkeeperProfileViewProps {
  user: User;
  token: string | null;
  onProfileUpdated: (name: string) => void;
  onNavigate: (tab: string) => void;
}

interface CombinedProfile {
  bookkeeper_id: number;
  user_id: number;
  license_no: string | null;
  status: string;
  phone_number: string | null;
  business_address: string | null;
  tin: string | null;
  rdo_code: string | null;
  email_reminders_enabled: boolean;
  name: string;
  email: string;
  member_since: string;
}

const getInitials = (name: string) =>
  name.split(" ").slice(0, 2).map((term) => term[0]).join("").toUpperCase();

// Standard pill-track + sliding-circle toggle — reused for both notification switches.
function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors focus:outline-none shrink-0 ${
        disabled ? "bg-white/10 cursor-not-allowed" : checked ? "bg-green-600" : "bg-white/10"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export default function BookkeeperProfileView({ user, token, onProfileUpdated, onNavigate }: BookkeeperProfileViewProps) {
  const [profile, setProfile] = useState<CombinedProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Editable form fields, seeded from `profile` once loaded
  const [fullName, setFullName] = useState("");
  const [licenseNo, setLicenseNo] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [tin, setTin] = useState("");
  const [rdoCode, setRdoCode] = useState("");
  const [emailRemindersEnabled, setEmailRemindersEnabled] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  // Real 2FA status (read-only here) — actual setup/QR/backup-codes flow lives on the
  // Security page; this just links there rather than faking a working toggle for
  // something that isn't a simple on/off switch.
  const [totpEnabled, setTotpEnabled] = useState(false);

  // Change Password — collapsed by default, its own form/state/endpoint since it's a
  // more sensitive operation than the rest of this page and shouldn't silently ride
  // along with a general "Save Changes" click.
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const fetchProfile = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [profileRes, totpRes] = await Promise.all([
        fetch("/api/bookkeeper/me/profile", { headers: { "Authorization": `Bearer ${token}` } }),
        fetch("/api/security/totp/status", { headers: { "Authorization": `Bearer ${token}` } }),
      ]);
      const data = await profileRes.json();
      if (profileRes.ok) {
        setProfile(data);
        setFullName(data.name);
        setLicenseNo(data.license_no || "");
        setPhoneNumber(data.phone_number || "");
        setBusinessAddress(data.business_address || "");
        setTin(data.tin || "");
        setRdoCode(data.rdo_code || "");
        setEmailRemindersEnabled(data.email_reminders_enabled !== false);
      }
      if (totpRes.ok) {
        const totpData = await totpRes.json();
        setTotpEnabled(!!totpData.enabled);
      }
    } catch (e) {
      console.error("Failed loading account profile:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [token]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaveError("");
    setSaveSuccess("");
    setSaving(true);
    try {
      const res = await fetch("/api/bookkeeper/me/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          name: fullName,
          license_no: licenseNo,
          phone_number: phoneNumber,
          business_address: businessAddress,
          tin,
          rdo_code: rdoCode,
          email_reminders_enabled: emailRemindersEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save changes");
      setProfile(data);
      onProfileUpdated(fullName);
      setSaveSuccess("Changes saved.");
      setTimeout(() => setSaveSuccess(""), 3000);
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setPasswordError("");
    setPasswordSuccess("");
    setChangingPassword(true);
    try {
      const res = await fetch("/api/bookkeeper/me/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword: confirmNewPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update password");
      setPasswordSuccess("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setTimeout(() => setPasswordSuccess(""), 3000);
    } catch (e: any) {
      setPasswordError(e.message);
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading || !profile) {
    return (
      <div className="p-8 text-center text-sm font-semibold text-gray-400 font-tabular">
        Loading your account...
      </div>
    );
  }

  const memberSince = new Date(profile.member_since).toLocaleDateString("en-US", { month: "short", year: "numeric" });

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h3 className="font-display font-bold text-white text-lg">My Account</h3>
        <p className="text-sm text-gray-400">Manage your personal, professional, and security details.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* LEFT COLUMN */}
        <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 text-center space-y-3">
          <div className="relative w-16 h-16 mx-auto group cursor-pointer" title="Upload a profile picture (coming soon)">
            <div className="w-16 h-16 rounded-full bg-purple-600 flex items-center justify-center overflow-hidden">
              <span className="text-xl font-bold text-purple-400 uppercase">{getInitials(profile.name)}</span>
            </div>
            <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/50 flex items-center justify-center transition-all">
              <Camera className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          <div>
            <h4 className="font-bold text-white text-base">{profile.name}</h4>
            <p className="text-sm text-gray-400">{profile.email}</p>
          </div>
          <p className="text-sm text-purple-400 font-semibold">Bookkeeper since {memberSince}</p>
          <span className="inline-block px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded-full text-xs font-bold uppercase">
            {profile.status === "active" ? "Active Account" : "Inactive Account"}
          </span>

          <div className="pt-3 border-t border-white/10 text-left space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400 flex items-center gap-1"><Award className="w-3 h-3 shrink-0" /> CPA License</span>
              <span className="font-tabular font-semibold text-white">{profile.license_no || "Not set"}</span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-2 space-y-4">
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 space-y-3">
              <h4 className="font-display font-bold text-white text-sm">Personal Information</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Email Address</label>
                  <input
                    type="email"
                    value={profile.email}
                    disabled
                    title="Login email can't be changed here"
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded text-gray-500 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 1: Contact & Identity */}
            <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 space-y-3">
              <h4 className="font-display font-bold text-white text-sm flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-gray-300" />
                Contact &amp; Identity
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="e.g. 0917-123-4567"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-tabular text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Business Address</label>
                  <input
                    type="text"
                    placeholder="e.g. San Juan Ave, Sipocot"
                    value={businessAddress}
                    onChange={(e) => setBusinessAddress(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 2: BIR & Regulatory Information */}
            <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 space-y-3">
              <h4 className="font-display font-bold text-white text-sm flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-gray-300" />
                BIR &amp; Regulatory Information
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">TIN Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 123-456-789-000"
                    value={tin}
                    onChange={(e) => setTin(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-tabular text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">BIR RDO Code</label>
                  <input
                    type="text"
                    placeholder="e.g. RDO-050"
                    value={rdoCode}
                    onChange={(e) => setRdoCode(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-tabular text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">CPA License Number</label>
                  <input
                    type="text"
                    required
                    value={licenseNo}
                    onChange={(e) => setLicenseNo(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-tabular text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Accreditation Status</label>
                  <div className="w-full px-3 py-1.5 bg-black/30 border border-white/10 rounded flex items-center">
                    {profile.status === "active" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/30 rounded-full text-xs font-bold uppercase">
                        <BadgeCheck className="w-3 h-3" />
                        Compliant
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded-full text-xs font-bold uppercase">
                        Inactive
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 4: Notification Preferences */}
            <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 space-y-3">
              <h4 className="font-display font-bold text-white text-sm flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-gray-300" />
                Notification Preferences
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center justify-between gap-3 p-2.5 bg-black/30 rounded-lg border border-white/10">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">Email Deadline Reminders</p>
                    <p className="text-xs text-gray-500">BIR filing &amp; permit deadline alerts.</p>
                  </div>
                  <ToggleSwitch checked={emailRemindersEnabled} onChange={setEmailRemindersEnabled} />
                </div>
                <div className="flex items-center justify-between gap-3 p-2.5 bg-black/30 rounded-lg border border-white/10" title="Not available yet — no SMS provider is configured.">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-500">SMS Payment Alerts</p>
                    <p className="text-xs text-gray-500">Coming soon.</p>
                  </div>
                  <ToggleSwitch checked={false} onChange={() => {}} disabled />
                </div>
              </div>
            </div>

            {saveError && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold rounded">{saveError}</div>
            )}
            {saveSuccess && (
              <div className="p-2.5 bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-semibold rounded">{saveSuccess}</div>
            )}

            {/* Sticky so it stays reachable while scrolling through the sections above. */}
            <div className="sticky bottom-0 -mx-1 px-1 py-2 bg-gray-900/95 backdrop-blur-sm flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all focus:outline-none shadow-md"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>

          {/* SECTION 3: Account Security & Preferences — a separate form/block (not
              nested inside the profile form above) so pressing Enter in a password
              field can't accidentally submit the main "Save Changes" form instead. */}
          <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 space-y-3">
            <h4 className="font-display font-bold text-white text-sm flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-gray-300" />
              Account Security
            </h4>

            <div className="flex items-center justify-between gap-3 p-2.5 bg-black/30 rounded-lg border border-white/10">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldCheck className={`w-4 h-4 shrink-0 ${totpEnabled ? "text-green-400" : "text-gray-500"}`} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Two-Factor Authentication (2FA)</p>
                  <p className="text-xs text-gray-500 truncate">
                    {totpEnabled
                      ? "Enabled — your account is protected with an authenticator app."
                      : "Enable 2FA to secure your account with an authenticator app."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate("security")}
                className="shrink-0 text-sm font-bold text-purple-400 hover:underline"
              >
                {totpEnabled ? "Manage" : "Set Up"} →
              </button>
            </div>

            <div className="border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={() => { setShowPasswordForm((v) => !v); setPasswordError(""); setPasswordSuccess(""); }}
                className="w-full flex items-center justify-between text-sm font-bold text-white focus:outline-none"
              >
                <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-gray-300" /> Change Password</span>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${showPasswordForm ? "rotate-180" : ""}`} />
              </button>

              {showPasswordForm && (
                <form onSubmit={handleChangePassword} className="mt-3 space-y-2.5">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Current Password</label>
                    <div className="relative">
                      <input
                        type={showCurrentPassword ? "text" : "password"}
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full px-3 pr-9 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-gray-500 hover:text-gray-300 focus:outline-none"
                        aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                      >
                        {showCurrentPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">New Password</label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? "text" : "password"}
                          required
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full px-3 pr-9 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword((v) => !v)}
                          className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-gray-500 hover:text-gray-300 focus:outline-none"
                          aria-label={showNewPassword ? "Hide password" : "Show password"}
                        >
                          {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Confirm New Password</label>
                      <input
                        type={showNewPassword ? "text" : "password"}
                        required
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                      />
                    </div>
                  </div>

                  {passwordError && (
                    <div className="p-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold rounded">{passwordError}</div>
                  )}
                  {passwordSuccess && (
                    <div className="p-2 bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-semibold rounded">{passwordSuccess}</div>
                  )}

                  <button
                    type="submit"
                    disabled={changingPassword}
                    className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all focus:outline-none"
                  >
                    {changingPassword ? "Updating..." : "Update Password"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

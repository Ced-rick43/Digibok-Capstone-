import React, { useState, useEffect } from "react";
import { Briefcase, User as UserIcon, Mail, Download, Info } from "lucide-react";
import { User, ClientProfile, ClientDocument } from "../types";

interface ClientProfileViewProps {
  user: User;
  token: string | null;
  onProfileUpdated: (name: string) => void;
  onNavigate: (tab: string) => void;
}

interface CombinedProfile extends ClientProfile {
  owner_name: string;
  owner_email: string;
  member_since: string;
}

interface BookkeeperContact {
  name: string;
  email: string;
  license_no: string | null;
}

const CORE_DOCUMENT_TYPE = "COR (2303)";

export default function ClientProfileView({ user, token, onProfileUpdated, onNavigate }: ClientProfileViewProps) {
  const [profile, setProfile] = useState<CombinedProfile | null>(null);
  const [bookkeeper, setBookkeeper] = useState<BookkeeperContact | null>(null);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Editable form fields, seeded from `profile` once loaded
  const [fullName, setFullName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [address, setAddress] = useState("");
  const [tin, setTin] = useState("");
  const [rdoCode, setRdoCode] = useState("");
  const [industry, setIndustry] = useState("");
  const [emailRemindersEnabled, setEmailRemindersEnabled] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const fetchAll = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [profileRes, bookkeeperRes, documentsRes] = await Promise.all([
        fetch("/api/clients/me/profile", { headers: { "Authorization": `Bearer ${token}` } }),
        fetch("/api/clients/me/bookkeeper", { headers: { "Authorization": `Bearer ${token}` } }),
        fetch("/api/documents", { headers: { "Authorization": `Bearer ${token}` } }),
      ]);
      const profileData = await profileRes.json();
      const bookkeeperData = await bookkeeperRes.json();
      const documentsData = await documentsRes.json();

      if (profileRes.ok) {
        setProfile(profileData);
        setFullName(profileData.owner_name);
        setContactNumber(profileData.contact_number);
        setAddress(profileData.address);
        setTin(profileData.tin);
        setRdoCode(profileData.rdo_code || "");
        setIndustry(profileData.industry || "");
        setEmailRemindersEnabled(profileData.email_reminders_enabled !== false);
      }
      if (bookkeeperRes.ok) setBookkeeper(bookkeeperData);
      if (documentsRes.ok) setDocuments(documentsData);
    } catch (e) {
      console.error("Failed loading profile:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [token]);

  const corDocument = documents.find((d) => d.document_type === CORE_DOCUMENT_TYPE);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaveError("");
    setSaveSuccess("");
    setSaving(true);
    try {
      const res = await fetch("/api/clients/me/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          owner_name: fullName,
          contact_number: contactNumber,
          address,
          tin,
          rdo_code: rdoCode,
          industry,
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

  const handleDownloadCOR = async () => {
    if (!token || !corDocument) return;
    try {
      const res = await fetch(`/api/documents/${corDocument.document_id}/download`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = corDocument.original_name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert("Failed to download your Certificate of Registration.");
    }
  };

  if (loading || !profile) {
    return (
      <div className="p-8 text-center text-sm font-semibold text-gray-400 font-tabular">
        Loading your profile...
      </div>
    );
  }

  const memberSince = new Date(profile.member_since).toLocaleDateString("en-US", { month: "short", year: "numeric" });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display font-bold text-white text-lg">Client Profile &amp; Business Information</h3>
        <p className="text-sm text-gray-400">Manage your account details, business information, and preferences.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* LEFT COLUMN */}
        <div className="space-y-4">
          <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-xl bg-purple-600 flex items-center justify-center">
              <Briefcase className="w-6 h-6 text-purple-300" />
            </div>
            <div>
              <h4 className="font-bold text-white text-base">{profile.business_name}</h4>
              <p className="text-sm text-gray-400">{profile.owner_email}</p>
            </div>
            <p className="text-sm text-purple-400 font-semibold">Client since {memberSince}</p>
            <span className="inline-block px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded-full text-xs font-bold uppercase">
              {profile.status === "active" ? "Active Account" : "Inactive Account"}
            </span>

            <div className="pt-3 border-t border-white/10 text-left space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">TIN</span>
                <span className="font-tabular font-semibold text-white">{profile.tin}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">RDO</span>
                <span className="font-tabular font-semibold text-white">{profile.rdo_code || "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Industry</span>
                <span className="font-semibold text-white">{profile.industry || "—"}</span>
              </div>
            </div>
          </div>

          <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 space-y-3">
            <span className="block text-xs font-bold text-gray-400 uppercase font-tabular tracking-wider">Your Bookkeeper</span>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                <UserIcon className="w-4.5 h-4.5 text-gray-300" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{bookkeeper?.name || "—"}</p>
                <p className="text-xs text-gray-400 truncate">{bookkeeper?.license_no ? `License ${bookkeeper.license_no}` : "Bookkeeper"}</p>
              </div>
            </div>
            <p className="text-sm text-gray-400 font-tabular truncate">{bookkeeper?.email}</p>
            <button
              onClick={() => onNavigate("messages")}
              className="w-full flex items-center justify-center gap-1.5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-lg transition-all focus:outline-none"
            >
              <Mail className="w-3.5 h-3.5" />
              Send Message
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-2">
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
                    value={profile.owner_email}
                    disabled
                    title="Contact your bookkeeper to change your login email"
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded text-gray-400 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Contact Number</label>
                  <input
                    type="text"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-tabular text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                  />
                </div>
              </div>
            </div>

            <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="font-display font-bold text-white text-sm">Business Details</h4>
                <button
                  type="button"
                  onClick={handleDownloadCOR}
                  disabled={!corDocument}
                  title={corDocument ? "Download your Certificate of Registration" : "Upload your COR from the Documents tab first"}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-sm font-bold text-gray-300 bg-black/30 border border-white/10 rounded-lg hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download COR
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Business TIN</label>
                  <input
                    type="text"
                    value={tin}
                    onChange={(e) => setTin(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-tabular text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">RDO Code</label>
                  <input
                    type="text"
                    placeholder="e.g. RDO No. 047 — Makati"
                    value={rdoCode}
                    onChange={(e) => setRdoCode(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-tabular text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Industry</label>
                <input
                  type="text"
                  placeholder="e.g. Retail Trading"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                />
              </div>
            </div>

            <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 space-y-3">
              <h4 className="font-display font-bold text-white text-sm">Notification Preferences</h4>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailRemindersEnabled}
                  onChange={(e) => setEmailRemindersEnabled(e.target.checked)}
                  className="mt-0.5 w-3.5 h-3.5 accent-purple-500"
                />
                <div>
                  <p className="text-sm font-semibold text-white">Email — Deadline Reminders</p>
                  <p className="text-sm text-gray-400">Receive email alerts before your BIR filing and permit deadlines.</p>
                </div>
              </label>
            </div>

            {saveError && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold rounded">{saveError}</div>
            )}
            {saveSuccess && (
              <div className="p-2.5 bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-semibold rounded">{saveSuccess}</div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all focus:outline-none"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </form>
        </div>
      </div>

    </div>
  );
}

import React, { useState, useEffect } from "react";
import {
  Upload,
  Download,
  Trash2,
  Pencil,
  Search,
  FileText,
  User as UserIcon
} from "lucide-react";
import { User, ClientProfile, ClientDocument } from "../types";

interface DocumentsViewProps {
  user: User;
  token: string | null;
  refreshTrigger: number;
}

const DOCUMENT_TYPE_PRESETS = ["1701Q", "1702Q", "2550M", "2550Q", "2551Q", "COR (2303)", "Certificate", "Business Permit Copy", "Other"];

export default function DocumentsView({ user, token, refreshTrigger }: DocumentsViewProps) {
  const isBookkeeper = user.role === "bookkeeper";

  const [clients, setClients] = useState<ClientProfile[]>([]);
  // Separate from `clients` (active-only, used for the upload/filter dropdowns) —
  // this includes deactivated clients too, so an old document uploaded before a
  // client was deactivated still resolves to their real name, not "Unknown Business".
  const [allClients, setAllClients] = useState<ClientProfile[]>([]);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");

  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadClientId, setUploadClientId] = useState("");
  const [uploadType, setUploadType] = useState("Certificate");
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [modalError, setModalError] = useState("");
  const [modalSuccess, setModalSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Edit modal (bookkeeper only)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editDoc, setEditDoc] = useState<ClientDocument | null>(null);
  const [editType, setEditType] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editError, setEditError] = useState("");

  const fetchAll = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [clientsRes, allClientsRes, docsRes] = await Promise.all([
        fetch("/api/clients", { headers: { "Authorization": `Bearer ${token}` } }),
        fetch("/api/clients?status=all", { headers: { "Authorization": `Bearer ${token}` } }),
        fetch("/api/documents", { headers: { "Authorization": `Bearer ${token}` } }),
      ]);
      const clientsData = await clientsRes.json();
      const allClientsData = await allClientsRes.json();
      const docsData = await docsRes.json();
      if (clientsRes.ok) {
        setClients(clientsData);
        if (isBookkeeper && clientsData.length > 0 && !uploadClientId) {
          setUploadClientId(clientsData[0].client_id.toString());
        }
      }
      if (allClientsRes.ok) setAllClients(allClientsData);
      if (docsRes.ok) setDocuments(docsData);
    } catch (e) {
      console.error("Failed loading documents module:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [token, refreshTrigger]);

  const getClientBusinessName = (id: number) => allClients.find((c) => c.client_id === id)?.business_name || "Unknown Business";

  const openUploadModal = () => {
    setUploadType("Certificate");
    setUploadLabel("");
    setUploadNotes("");
    setUploadFile(null);
    setModalError("");
    setModalSuccess("");
    if (isBookkeeper && clients.length > 0) setUploadClientId(clients[0].client_id.toString());
    setShowUploadModal(true);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError("");
    setModalSuccess("");

    if (!uploadType || !uploadLabel || !uploadFile) {
      setModalError("Please provide a document type, label, and select a file.");
      return;
    }
    if (isBookkeeper && !uploadClientId) {
      setModalError("Please select the client this document belongs to.");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      if (isBookkeeper) formData.append("client_id", uploadClientId);
      formData.append("document_type", uploadType);
      formData.append("label", uploadLabel);
      formData.append("notes", uploadNotes);
      formData.append("file", uploadFile);

      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed uploading document");

      setModalSuccess("Document uploaded successfully!");
      setTimeout(() => {
        setShowUploadModal(false);
        fetchAll();
      }, 1200);
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (docItem: ClientDocument) => {
    setEditDoc(docItem);
    setEditType(docItem.document_type);
    setEditLabel(docItem.label);
    setEditNotes(docItem.notes || "");
    setEditFile(null);
    setEditError("");
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError("");
    if (!editDoc) return;

    try {
      const formData = new FormData();
      formData.append("document_type", editType);
      formData.append("label", editLabel);
      formData.append("notes", editNotes);
      if (editFile) formData.append("file", editFile);

      const res = await fetch(`/api/documents/${editDoc.document_id}`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed updating document");

      setShowEditModal(false);
      fetchAll();
    } catch (err: any) {
      setEditError(err.message);
    }
  };

  const handleDelete = async (docItem: ClientDocument) => {
    if (!token || !window.confirm(`Delete "${docItem.label}"? This permanently removes the stored file.`)) return;
    try {
      const res = await fetch(`/api/documents/${docItem.document_id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (res.ok) fetchAll();
    } catch (e) {
      console.error("Failed deleting document:", e);
    }
  };

  const handleDownload = async (docItem: ClientDocument) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/documents/${docItem.document_id}/download`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = docItem.original_name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert("Failed to download this document.");
    }
  };

  const availableTypes = Array.from(new Set(documents.map((d) => d.document_type)));

  const filteredDocuments = documents.filter((d) => {
    const matchesSearch =
      d.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.original_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || d.document_type === typeFilter;
    const matchesClient = clientFilter === "all" || d.client_id.toString() === clientFilter;
    return matchesSearch && matchesType && matchesClient;
  });

  if (loading) {
    return (
      <div className="p-8 text-center text-sm font-semibold text-gray-400 font-tabular">
        Loading document archive...
      </div>
    );
  }

  return (
    <div className="space-y-4">

      <div className="bg-black/40 backdrop-blur-md rounded-lg border border-white/10 p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2 border-b border-white/10">
          <div>
            <h4 className="font-display font-bold text-white text-sm">Document & Certificate Archive</h4>
            <p className="text-sm text-gray-400">BIR forms (1701Q, 2550M...), certificates, and other files shared between client and bookkeeper.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                <Search className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                placeholder="Search label or file name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 w-[190px] text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 focus:bg-black/20 text-white"
              />
            </div>

            {/* Client keeps the plain dropdown; the bookkeeper's pill row below replaces
                this for their view (same typeFilter state drives both). */}
            {!isBookkeeper && (
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-2.5 py-1.5 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white font-medium"
              >
                <option value="all">All Types</option>
                {availableTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}

            {isBookkeeper && (
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="px-2.5 py-1.5 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white font-medium"
              >
                <option value="all">All Clients</option>
                {clients.map((c) => (
                  <option key={c.client_id} value={c.client_id}>{c.business_name}</option>
                ))}
              </select>
            )}

            <button
              onClick={openUploadModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-all focus:outline-none"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Document</span>
            </button>
          </div>
        </div>

        {/* Type filter as pills instead of a dropdown — bookkeeper only, since they're
            the one triaging documents across many clients at once. Drives the same
            typeFilter state the client's plain dropdown above also uses. */}
        {isBookkeeper && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setTypeFilter("all")}
              className={`px-3 py-1 rounded-full text-sm font-bold border transition-all focus:outline-none ${
                typeFilter === "all" ? "bg-purple-500/10 text-purple-400 border-purple-500" : "text-gray-400 border-white/10 hover:text-white hover:bg-black/30"
              }`}
            >
              All
            </button>
            {availableTypes.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1 rounded-full text-sm font-bold border transition-all focus:outline-none ${
                  typeFilter === t ? "bg-purple-500/10 text-purple-400 border-purple-500" : "text-gray-400 border-white/10 hover:text-white hover:bg-black/30"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {filteredDocuments.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">
            No documents match this filter. Click "Upload Document" to add your first file.
          </div>
        ) : isBookkeeper ? (
          /* Card grid — bookkeeper only. The client keeps the row-list layout below,
             which already reads fine for a single business's much smaller document set. */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredDocuments.map((docItem) => (
              <div key={docItem.document_id} className="p-3.5 bg-black/30 rounded-lg border border-white/10 flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="w-9 h-9 rounded-lg bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center shrink-0 text-gray-300">
                    <FileText className="w-4 h-4" />
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleDownload(docItem)}
                      className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-white/10 rounded transition-all"
                      title="Download"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => openEditModal(docItem)}
                      className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-white/10 rounded transition-all"
                      title="Edit document details"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(docItem)}
                      className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                      title="Delete document"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1 min-w-0">
                  <span className="block text-sm font-extrabold text-white truncate" title={docItem.label}>{docItem.label}</span>
                  <p className="text-xs text-gray-400 font-tabular truncate">
                    {new Date(docItem.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "2-digit" })} · {docItem.original_name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {getClientBusinessName(docItem.client_id)}
                  </p>
                </div>

                <span className="self-start text-[11px] bg-black/40 backdrop-blur-md px-1.5 py-0.5 rounded text-gray-300 font-tabular font-bold border border-white/10 uppercase">
                  {docItem.document_type}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDocuments.map((docItem) => (
              <div key={docItem.document_id} className="p-3 bg-black/30 rounded-lg border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="w-9 h-9 rounded bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center shrink-0 text-gray-300">
                    <FileText className="w-4 h-4" />
                  </span>
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-extrabold text-white truncate">{docItem.label}</span>
                      <span className="text-[11px] bg-black/40 backdrop-blur-md px-1.5 py-0.5 rounded text-gray-300 font-tabular font-bold border border-white/10 uppercase">
                        {docItem.document_type}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 font-tabular truncate">
                      {docItem.original_name} · {docItem.file_size} · {new Date(docItem.uploaded_at).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <UserIcon className="w-3 h-3 shrink-0" />
                      Uploaded by {docItem.uploaded_by_role === "bookkeeper" ? "your bookkeeper" : "client"}
                      {docItem.notes && <span className="normal-case"> · {docItem.notes}</span>}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                  <button
                    onClick={() => handleDownload(docItem)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-white bg-purple-600 rounded hover:bg-purple-700 transition-all focus:outline-none"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* UPLOAD MODAL */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center p-4 z-50 animate-count-up backdrop-blur-xs">
          <div className="bg-black/40 backdrop-blur-md rounded-lg max-w-md w-full p-5 shadow-2xl border border-white/10">
            <div className="pb-3 mb-4 border-b border-white/10 flex justify-between items-center">
              <h4 className="font-display font-bold text-white text-sm uppercase font-tabular tracking-wider">Upload Document</h4>
              <button onClick={() => setShowUploadModal(false)} className="text-gray-500 hover:text-gray-300 font-extrabold text-base">✕</button>
            </div>

            {modalError && <div className="p-2.5 mb-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold rounded">{modalError}</div>}
            {modalSuccess && <div className="p-2.5 mb-3 bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-semibold rounded">{modalSuccess}</div>}

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              {isBookkeeper && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Client Business</label>
                  <select
                    value={uploadClientId}
                    onChange={(e) => setUploadClientId(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                  >
                    {clients.map((c) => (
                      <option key={c.client_id} value={c.client_id}>{c.business_name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Document Type</label>
                  <input
                    list="document-type-presets"
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                  />
                  <datalist id="document-type-presets">
                    {DOCUMENT_TYPE_PRESETS.map((t) => <option key={t} value={t} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Label</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Q2 2026 Certificate"
                    value={uploadLabel}
                    onChange={(e) => setUploadLabel(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">File</label>
                <input
                  type="file"
                  required
                  onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full text-sm text-white file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-bold file:bg-purple-600 file:text-white hover:file:bg-purple-700"
                />
                <p className="text-[11px] text-gray-500 mt-1">PDF, image, or document file, up to 15MB.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Notes (optional)</label>
                <textarea
                  rows={2}
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 disabled:opacity-60 rounded text-sm font-bold text-white shadow-md transition-all focus:outline-none"
              >
                {submitting ? "Uploading..." : "Upload Document"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL (Bookkeeper only) */}
      {showEditModal && editDoc && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center p-4 z-50 animate-count-up backdrop-blur-xs">
          <div className="bg-black/40 backdrop-blur-md rounded-lg max-w-md w-full p-5 shadow-2xl border border-white/10">
            <div className="pb-3 mb-4 border-b border-white/10 flex justify-between items-center">
              <h4 className="font-display font-bold text-white text-sm uppercase font-tabular tracking-wider">Edit Document</h4>
              <button onClick={() => setShowEditModal(false)} className="text-gray-500 hover:text-gray-300 font-extrabold text-base">✕</button>
            </div>

            {editError && <div className="p-2.5 mb-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold rounded">{editError}</div>}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Document Type</label>
                  <input
                    list="document-type-presets"
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Label</label>
                  <input
                    type="text"
                    required
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Replace File (optional)</label>
                <input
                  type="file"
                  onChange={(e) => setEditFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full text-sm text-white file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-bold file:bg-purple-600 file:text-white hover:file:bg-purple-700"
                />
                <p className="text-[11px] text-gray-500 mt-1">Current file: {editDoc.original_name}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase font-tabular tracking-wider">Notes</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-black/30 border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm font-bold text-white shadow-md transition-all focus:outline-none"
              >
                Save Changes
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

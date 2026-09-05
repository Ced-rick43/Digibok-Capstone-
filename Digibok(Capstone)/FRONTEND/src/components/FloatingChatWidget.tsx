import React, { useState, useEffect, useRef } from "react";
import { MessageCircle, X, Send, ArrowLeft, ExternalLink, Building2, MessageSquare } from "lucide-react";
import { User, ClientProfile, Message, MessageThread } from "../types";

interface FloatingChatWidgetProps {
  user: User;
  token: string | null;
  unreadCount: number;
  onMessagesRead: () => void;
  onNavigateToMessages?: () => void;
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function FloatingChatWidget({ user, token, unreadCount, onMessagesRead, onNavigateToMessages }: FloatingChatWidgetProps) {
  const isBookkeeper = user.role === "bookkeeper";
  const myClientId = !isBookkeeper ? (user.profile as ClientProfile | undefined)?.client_id : undefined;

  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [allClients, setAllClients] = useState<ClientProfile[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const authHeaders = { "Authorization": `Bearer ${token}` };

  const fetchThreads = async () => {
    if (!token || !isBookkeeper) return;
    setLoadingThreads(true);
    try {
      const [threadsRes, clientsRes] = await Promise.all([
        fetch("/api/messages/threads", { headers: authHeaders }),
        fetch("/api/clients", { headers: authHeaders }),
      ]);
      const threadsData = await threadsRes.json();
      const clientsData = await clientsRes.json();
      if (threadsRes.ok) setThreads(threadsData);
      if (clientsRes.ok) setAllClients(clientsData);
    } catch (e) {
      console.error("Failed loading message threads:", e);
    } finally {
      setLoadingThreads(false);
    }
  };

  const fetchMessages = async (clientId: number) => {
    if (!token) return;
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/messages/${clientId}`, { headers: authHeaders });
      const data = await res.json();
      if (res.ok) {
        setMessages(data);
        setThreads((prev) => prev.map((t) => (t.client_id === clientId ? { ...t, unreadCount: 0 } : t)));
        onMessagesRead();
      }
    } catch (e) {
      console.error("Failed loading messages:", e);
    } finally {
      setLoadingMessages(false);
    }
  };

  // Lazy-load when the widget is opened, rather than duplicating App.tsx's polling.
  useEffect(() => {
    if (!open || !token) return;
    if (isBookkeeper) {
      fetchThreads();
    } else if (myClientId) {
      setSelectedClientId(myClientId);
      fetchMessages(myClientId);
    }
  }, [open, token]);

  useEffect(() => {
    if (open && isBookkeeper && selectedClientId) fetchMessages(selectedClientId);
  }, [selectedClientId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !composeBody.trim() || !selectedClientId) return;
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: selectedClientId, body: composeBody.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send message.");
      setMessages((prev) => [...prev, data]);
      setComposeBody("");
      if (isBookkeeper) fetchThreads();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const selectedThread = threads.find((t) => t.client_id === selectedClientId);
  const selectedClientName = isBookkeeper
    ? selectedThread?.business_name || allClients.find((c) => c.client_id === selectedClientId)?.business_name || ""
    : "Your Bookkeeper";

  const clientsWithoutThread = allClients.filter((c) => !threads.some((t) => t.client_id === c.client_id));

  // Bookkeeper: null selection shows the thread list. Client: always goes straight to the single conversation.
  const showThreadList = isBookkeeper && !selectedClientId;

  const closePanel = () => {
    setOpen(false);
    if (isBookkeeper) setSelectedClientId(null);
    setError("");
  };

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-40 w-80 sm:w-96 max-h-[70vh] bg-black/80 backdrop-blur-md rounded-lg border border-white/10 shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b border-white/10 flex items-center gap-2 shrink-0">
            {isBookkeeper && selectedClientId && (
              <button
                onClick={() => setSelectedClientId(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-gray-300 focus:outline-none shrink-0"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              <Building2 className="w-3.5 h-3.5 text-gray-300" />
            </div>
            <span className="text-sm font-bold text-white truncate flex-1">
              {showThreadList ? "Messages" : selectedClientName}
            </span>
            {onNavigateToMessages && (
              <button
                onClick={() => {
                  onNavigateToMessages();
                  closePanel();
                }}
                className="p-1 rounded-lg hover:bg-white/10 text-gray-300 focus:outline-none shrink-0"
                title="Open full inbox"
                aria-label="Open full inbox"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={closePanel}
              className="p-1 rounded-lg hover:bg-white/10 text-gray-300 focus:outline-none shrink-0"
              aria-label="Close chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          {showThreadList ? (
            <div className="flex-1 overflow-y-auto min-h-[240px]">
              {clientsWithoutThread.length > 0 && (
                <div className="p-2.5 border-b border-white/10">
                  <select
                    value=""
                    onChange={(e) => e.target.value && setSelectedClientId(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                  >
                    <option value="">+ Start a new conversation...</option>
                    {clientsWithoutThread.map((c) => (
                      <option key={c.client_id} value={c.client_id}>{c.business_name}</option>
                    ))}
                  </select>
                </div>
              )}
              {loadingThreads ? (
                <div className="p-6 text-center text-sm text-gray-500">Loading conversations...</div>
              ) : threads.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">No conversations yet. Start one above.</div>
              ) : (
                threads.map((t) => (
                  <button
                    key={t.client_id}
                    onClick={() => setSelectedClientId(t.client_id)}
                    className="w-full text-left p-3 border-b border-white/10 transition-all hover:bg-black/30 focus:outline-none"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold truncate text-white">{t.business_name}</span>
                      {t.unreadCount > 0 && (
                        <span className="w-4.5 h-4.5 shrink-0 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold font-tabular">
                          {t.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="text-sm truncate mt-0.5 text-gray-400">
                      {t.latest.sender_role === "bookkeeper" ? "You: " : ""}{t.latest.body}
                    </p>
                    <span className="text-[11px] font-tabular text-gray-500">{timeAgo(t.latest.sent_at)}</span>
                  </button>
                ))
              )}
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-[240px]">
                {loadingMessages ? (
                  <div className="p-6 text-center text-sm text-gray-500">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-sm text-gray-500 gap-2 py-8">
                    <MessageSquare className="w-7 h-7 text-gray-500" />
                    No messages yet — say hello below.
                  </div>
                ) : (
                  messages.map((m) => {
                    const isMine = m.sender_role === user.role;
                    return (
                      <div key={m.message_id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-lg px-2.5 py-1.5 ${isMine ? "bg-purple-600 text-white" : "bg-black/30 border border-white/10 text-white"}`}>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.body}</p>
                          <span className={`block text-[10px] font-tabular mt-1 ${isMine ? "text-gray-400" : "text-gray-500"}`}>
                            {new Date(m.sent_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "numeric" })}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={handleSend} className="p-2.5 border-t border-white/10 shrink-0">
                {error && <div className="p-1.5 mb-1.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold rounded">{error}</div>}
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={composeBody}
                    onChange={(e) => setComposeBody(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 px-2.5 py-1.5 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                  />
                  <button
                    type="submit"
                    disabled={sending || !composeBody.trim()}
                    className="flex items-center justify-center px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all focus:outline-none"
                    aria-label="Send message"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      )}

      {/* Floating action button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-purple-600 hover:bg-purple-700 text-white shadow-2xl flex items-center justify-center transition-all focus:outline-none"
        aria-label={open ? "Close chat" : "Open chat"}
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        {!open && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold font-tabular border-2 border-gray-950">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
    </>
  );
}

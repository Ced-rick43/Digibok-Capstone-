import React, { useState, useEffect, useRef } from "react";
import { Send, MessageSquare, Building2 } from "lucide-react";
import { User, ClientProfile, Message, MessageThread } from "../types";

interface MessagesViewProps {
  user: User;
  token: string | null;
  onMessagesRead?: () => void;
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

export default function MessagesView({ user, token, onMessagesRead }: MessagesViewProps) {
  const isBookkeeper = user.role === "bookkeeper";
  const myClientId = !isBookkeeper ? (user.profile as ClientProfile | undefined)?.client_id : undefined;

  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [allClients, setAllClients] = useState<ClientProfile[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
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
      if (threadsRes.ok) {
        setThreads(threadsData);
        if (!selectedClientId && threadsData.length > 0) {
          setSelectedClientId(threadsData[0].client_id);
        }
      }
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
        // Reflect the read state locally so the thread list badge clears immediately
        setThreads((prev) => prev.map((t) => (t.client_id === clientId ? { ...t, unreadCount: 0 } : t)));
        onMessagesRead?.();
      }
    } catch (e) {
      console.error("Failed loading messages:", e);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (isBookkeeper) {
      fetchThreads();
    } else if (myClientId) {
      setSelectedClientId(myClientId);
    }
  }, [token]);

  useEffect(() => {
    if (selectedClientId) fetchMessages(selectedClientId);
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
    ? selectedThread?.business_name || allClients.find((c) => c.client_id === selectedClientId)?.business_name || "Select a conversation"
    : "Your Bookkeeper";

  // Clients with no thread yet, so the bookkeeper can start a first message
  const clientsWithoutThread = allClients.filter((c) => !threads.some((t) => t.client_id === c.client_id));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display font-bold text-white text-lg">Messages</h3>
        <p className="text-sm text-gray-400">
          {isBookkeeper ? "Direct conversations with your clients." : "Message your bookkeeper directly — replies show up here."}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-220px)] min-h-[420px]">
        {/* Thread list — bookkeeper only */}
        {isBookkeeper && (
          <div className="lg:col-span-4 bg-black/40 backdrop-blur-md rounded-lg border border-white/10 flex flex-col overflow-hidden">
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
            <div className="flex-1 overflow-y-auto">
              {loadingThreads ? (
                <div className="p-6 text-center text-sm text-gray-400">Loading conversations...</div>
              ) : threads.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">No conversations yet. Start one above.</div>
              ) : (
                threads.map((t) => (
                  <button
                    key={t.client_id}
                    onClick={() => setSelectedClientId(t.client_id)}
                    className={`w-full text-left p-3 border-b border-white/10 transition-all focus:outline-none ${
                      selectedClientId === t.client_id ? "bg-purple-500/10" : "hover:bg-black/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-bold truncate ${selectedClientId === t.client_id ? "text-white" : "text-white"}`}>{t.business_name}</span>
                      {t.unreadCount > 0 && (
                        <span className="w-4.5 h-4.5 shrink-0 flex items-center justify-center rounded-full bg-red-500 text-white text-[14px] font-bold font-tabular">
                          {t.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className={`text-sm truncate mt-0.5 ${selectedClientId === t.client_id ? "text-gray-300" : "text-gray-400"}`}>
                      {t.latest.sender_role === "bookkeeper" ? "You: " : ""}{t.latest.body}
                    </p>
                    <span className={`text-[14px] font-tabular ${selectedClientId === t.client_id ? "text-gray-300" : "text-gray-400"}`}>{timeAgo(t.latest.sent_at)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Thread panel */}
        <div className={`${isBookkeeper ? "lg:col-span-8" : "lg:col-span-12"} bg-black/40 backdrop-blur-md rounded-lg border border-white/10 flex flex-col overflow-hidden`}>
          <div className="p-3 border-b border-white/10 flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-gray-300" />
            </div>
            <span className="text-base font-bold text-white truncate">{selectedClientName}</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {!selectedClientId ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-sm text-gray-400 gap-2">
                <MessageSquare className="w-8 h-8 text-gray-400" />
                Select a conversation to view messages.
              </div>
            ) : loadingMessages ? (
              <div className="p-6 text-center text-sm text-gray-400">Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-sm text-gray-400 gap-2">
                <MessageSquare className="w-8 h-8 text-gray-400" />
                No messages yet — say hello below.
              </div>
            ) : (
              messages.map((m) => {
                const isMine = m.sender_role === user.role;
                return (
                  <div key={m.message_id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-lg px-3 py-2 ${isMine ? "bg-purple-600 text-white" : "bg-black/30 border border-white/10 text-white"}`}>
                      {m.subject && <p className={`text-xs font-bold uppercase tracking-wider mb-0.5 ${isMine ? "text-purple-400" : "text-gray-400"}`}>{m.subject}</p>}
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.body}</p>
                      <span className={`block text-[14px] font-tabular mt-1 ${isMine ? "text-gray-400" : "text-gray-400"}`}>
                        {new Date(m.sent_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "numeric" })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {selectedClientId && (
            <form onSubmit={handleSend} className="p-3 border-t border-white/10 shrink-0">
              {error && <div className="p-2 mb-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold rounded">{error}</div>}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                />
                <button
                  type="submit"
                  disabled={sending || !composeBody.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all focus:outline-none"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

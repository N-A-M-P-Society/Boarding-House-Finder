import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { fetchMessages, sendMessage as sendMessageRow, markRead, fetchAccountNames, fetchChatContacts, loadProfile } from "../lib/api.js";
const avatarFor = (name) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='80' height='80' rx='40' fill='#0B5E6F'/><text x='40' y='52' font-size='34' font-family='sans-serif' font-weight='700' fill='white' text-anchor='middle'>${(name || "?").charAt(0).toUpperCase()}</text></svg>`,
  );
const fmtTime = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === today.toDateString() ? t : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${t}`;
};
const QUICK_REPLIES_STUDENT = [
  "Is this available starting August?",
  "What's the security deposit?",
  "What's your guest policy?",
  "Can I schedule a viewing?",
  "Is WiFi included?",
];
const QUICK_REPLIES_LANDLORD = [
  "Yes, the room is still available!",
  "The deposit is 1 month advance + 1 month deposit.",
  "I can schedule a viewing this weekend.",
  "Please send a valid school ID for verification.",
  "The room will be ready by August 1.",
];
const QUICK_REPLIES_ROOMMATE = [
  "Are you still looking for a roommate?",
  "Could we discuss our move-in plans?",
  "Would you like to compare roommate preferences?",
];
const QUICK_REPLIES_ADMIN = [
  "How can I help you?",
  "Please share more details so I can assist.",
  "I will review this and follow up with you.",
];
const QUICK_REPLIES_SUPPORT = [
  "I need help with my account.",
  "I have a question about a listing.",
  "Can you help me with this issue?",
];
export default function Chat({ userRole, session, chatTarget, onChatTargetHandled, onMessagesRead }) {
  const [rows, setRows] = useState([]);
  const [names, setNames] = useState({});
  const [contacts, setContacts] = useState([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [myProfilePhotoUrl, setMyProfilePhotoUrl] = useState(
    session?.student?.profile_photo_url || session?.landlord?.profile_photo_url || session?.profile_photo_url || ""
  );
  const [extraPeers, setExtraPeers] = useState({}); // peers started from "Message Landlord" before any message exists
  const [activeConvId, setActiveConvId] = useState(null);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);
  const myAccountId = session?.accountId;
  const isLandlord = userRole === "landlord";
  const isAdmin = userRole === "admin";
  const myRole = userRole;

  const load = useCallback(async () => {
    if (!myAccountId) return;
    try {
      const data = await fetchMessages(myAccountId);
      setRows(data);
      const peerIds = Array.from(new Set(data.map((m) => (m.sender_id === myAccountId ? m.receiver_id : m.sender_id))));
      setNames(await fetchAccountNames(peerIds));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [myAccountId]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    let active = true;
    loadProfile()
      .then((profile) => {
        if (active) {
          setMyProfilePhotoUrl(
            profile?.student?.profile_photo_url ||
            profile?.landlord?.profile_photo_url ||
            profile?.profile_photo_url ||
            ""
          );
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError.message);
      });
    return () => {
      active = false;
    };
  }, []);

  // Live updates (enable Realtime on public.messages — see README)
  useEffect(() => {
    if (!myAccountId) return;
    const ch = supabase
      .channel(`messages-${myAccountId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new;
        if (m.sender_id === myAccountId || m.receiver_id === myAccountId) {
          setRows((prev) => (prev.some((x) => x.message_id === m.message_id) ? prev : [...prev, m]));
          if (!names[m.sender_id]) load();
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myAccountId]);

  // Opening a chat from a property page
  useEffect(() => {
    if (chatTarget?.accountId) {
      setExtraPeers((p) => ({
        ...p,
        [chatTarget.accountId]: {
          name: chatTarget.name,
          propertyTitle: chatTarget.propertyTitle,
          profilePhotoUrl: chatTarget.profilePhotoUrl,
          role: chatTarget.role,
        }
      }));
      setActiveConvId(String(chatTarget.accountId));
      onChatTargetHandled?.();
    }
  }, [chatTarget]);

  async function toggleContactPicker() {
    const shouldOpen = !contactsOpen;
    setContactsOpen(shouldOpen);
    if (!shouldOpen || contactsLoaded || contactsLoading) return;

    setContactsLoading(true);
    setError("");
    try {
      setContacts(await fetchChatContacts());
      setContactsLoaded(true);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setContactsLoading(false);
    }
  }

  function startConversation(contact) {
    setExtraPeers((current) => ({
      ...current,
      [contact.accountId]: {
        name: contact.name,
        profilePhotoUrl: contact.profilePhotoUrl,
        role: contact.role,
        propertyTitle: "Direct message",
      },
    }));
    setActiveConvId(String(contact.accountId));
    setContactsOpen(false);
    setContactSearch("");
  }

  // Build conversations in the shape the UI expects
  const peerIds = new Set([...rows.map((m) => (m.sender_id === myAccountId ? m.receiver_id : m.sender_id)), ...Object.keys(extraPeers).map(Number)]);
  const conversations = Array.from(peerIds).map((peerId) => {
    const peerName = names[peerId]?.name || extraPeers[peerId]?.name || "User";
    const peerRole = names[peerId]?.role || extraPeers[peerId]?.role || (isLandlord ? "student" : "landlord");
    const myName = session?.name || "You";
    const myAvatar = myProfilePhotoUrl || avatarFor(myName);
    const peerAvatar = names[peerId]?.profilePhotoUrl || extraPeers[peerId]?.profilePhotoUrl || avatarFor(peerName);
    const msgs = rows
      .filter((m) => (m.sender_id === myAccountId && m.receiver_id === peerId) || (m.sender_id === peerId && m.receiver_id === myAccountId))
      .map((m) => {
        const mine = m.sender_id === myAccountId;
        return {
          id: String(m.message_id),
          senderId: m.sender_id,
          senderName: mine ? "You" : peerName,
          senderAvatar: mine ? myAvatar : peerAvatar,
          senderRole: mine ? myRole : peerRole,
          content: m.content,
          createdAt: fmtTime(m.created_at),
          read: m.is_read,
          _raw: m,
        };
      });
    const last = msgs[msgs.length - 1];
    const unread = msgs.filter((m) => !m.read && m.senderId !== myAccountId).length;
    const base = {
      id: String(peerId),
      peerName,
      peerAvatar,
      peerRole,
      propertyTitle: extraPeers[peerId]?.propertyTitle || "Direct message",
      propertyImage: peerAvatar,
      propertyAddress: "",
      messages: msgs,
      lastMessage: last?.content || "No messages yet",
      lastMessageAt: last?.createdAt || "",
      unreadCount: unread,
    };
    return base;
  });
  const activeConv = conversations.find((c) => c.id === activeConvId) || conversations[0];

  // Mark incoming messages as read when a conversation is open
  useEffect(() => {
    if (!activeConv || !activeConvId || activeConv.id !== activeConvId) return;
    const ids = activeConv.messages.filter((m) => !m.read && m.senderId !== myAccountId).map((m) => m._raw.message_id);
    if (ids.length) {
      markRead(ids)
        .then(() => {
          setRows((prev) => prev.map((row) => (ids.includes(row.message_id) ? { ...row, is_read: true } : row)));
          onMessagesRead?.();
        })
        .catch((markError) => setError(markError.message));
    }
  }, [activeConv?.id, activeConv?.messages.length, activeConvId, myAccountId, onMessagesRead]);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConv?.messages.length]);

  if (!session) {
    return <div className="flex h-full items-center justify-center text-sm text-[var(--muted-foreground)]">Sign in to view your messages.</div>;
  }
  if (session?.dbRole === "SuperAdmin" || userRole === "superadmin") {
    return <div className="flex h-full items-center justify-center text-sm text-[var(--muted-foreground)]">Messaging is not available for developer accounts.</div>;
  }
  const myId = myAccountId;
  const otherName = activeConv?.peerName || "";
  const otherAvatar = activeConv?.peerAvatar || "";
  const otherRole = activeConv?.peerRole || "";
  const quickReplies = otherRole === "admin"
    ? isAdmin ? QUICK_REPLIES_ADMIN : QUICK_REPLIES_SUPPORT
    : isLandlord
      ? QUICK_REPLIES_LANDLORD
      : otherRole === "student"
        ? QUICK_REPLIES_ROOMMATE
        : QUICK_REPLIES_STUDENT;
  async function sendMessage(content) {
    const message = content.trim();
    if (!message || !activeConv) return;
    try {
      const row = await sendMessageRow(myAccountId, Number(activeConv.id), message);
      setRows((prev) => (prev.some((x) => x.message_id === row.message_id) ? prev : [...prev, row]));
      setInput((current) => current.trim() === message ? "" : current);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  const filteredConvs = conversations.filter(
    (c) =>
      c.peerName.toLowerCase().includes(search.toLowerCase()) ||
      c.propertyTitle.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredContacts = contacts.filter((contact) =>
    `${contact.name} ${contact.role}`.toLowerCase().includes(contactSearch.trim().toLowerCase())
  );
  function rolePill(role) {
    if (role === "landlord")
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20">
          🏠 Landlord
        </span>
      );
    if (role === "admin")
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
          ⚙️ Admin
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
        🎓 Student
      </span>
    );
  }
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)]">
      {/* ── Sidebar ── */}
      <aside className="w-72 xl:w-80 flex-shrink-0 border-r border-[var(--border)] bg-[var(--card)] flex flex-col">
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="font-display font-semibold text-lg">Messages</h2>
            <div className="flex items-center gap-2">
              {rolePill(myRole)}
              <button
                type="button"
                onClick={toggleContactPicker}
                aria-expanded={contactsOpen}
                className="rounded-lg bg-[var(--primary)] px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              >
                + New
              </button>
            </div>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--muted)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all"
          />
        </div>

        {contactsOpen && (
          <div className="max-h-72 overflow-y-auto border-b border-[var(--border)] bg-[var(--background)] p-3">
            <input
              type="search"
              value={contactSearch}
              onChange={(event) => setContactSearch(event.target.value)}
              placeholder="Find a student, landlord, or admin…"
              aria-label="Search users to message"
              className="mb-2 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs"
            />
            {contactsLoading ? (
              <p role="status" className="py-3 text-center text-xs text-[var(--muted-foreground)]">Loading contacts…</p>
            ) : filteredContacts.length ? (
              <ul className="space-y-1">
                {filteredContacts.map((contact) => (
                  <li key={contact.accountId}>
                    <button
                      type="button"
                      onClick={() => startConversation(contact)}
                      className="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-[var(--muted)]"
                    >
                      <img
                        src={contact.profilePhotoUrl || avatarFor(contact.name)}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover"
                      />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{contact.name}</span>
                      {rolePill(contact.role)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-3 text-center text-xs text-[var(--muted-foreground)]">
                {error || (contacts.length ? "No users match your search." : "No other chat-enabled accounts are available.")}
              </p>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]/60">
          {filteredConvs.map((conv) => {
            const displayName = conv.peerName;
            const displayAvatar = conv.peerAvatar;
            const displayRole = conv.peerRole;
            const unread = conv.unreadCount;
            const isActive = conv.id === activeConv?.id;
            return (
              <button
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                className={`w-full flex items-start gap-3 px-4 py-3.5 hover:bg-[var(--muted)] transition-colors text-left ${isActive ? "bg-[var(--secondary)]" : ""}`}
              >
                <div className="flex-shrink-0">
                  <img src={displayAvatar} alt={displayName} className="w-10 h-10 rounded-full object-cover" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-semibold text-sm truncate">{displayName}</span>
                    <span className="text-[10px] text-[var(--muted-foreground)] flex-shrink-0 ml-1">{conv.lastMessageAt}</span>
                  </div>
                  {/* Role badge under name */}
                  <div className="mb-1">{rolePill(displayRole)}</div>
                  <p className="text-xs text-[var(--muted-foreground)] truncate">{conv.propertyTitle}</p>
                  <div className="flex items-center justify-between mt-0.5 gap-1">
                    <p className="text-xs text-[var(--muted-foreground)] truncate">{conv.lastMessage}</p>
                    {unread > 0 && (
                      <span className="w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[10px] flex items-center justify-center font-bold flex-shrink-0">
                        {unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Chat area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeConv ? (
          <>
        {/* Header */}
        <div className="border-b border-[var(--border)] bg-[var(--card)] px-5 py-3 flex items-center gap-3">
          {/* Other party info */}
          <div className="flex-shrink-0">
            <img src={otherAvatar} alt={otherName} className="w-10 h-10 rounded-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{otherName}</span>
              {rolePill(otherRole)}
            </div>
            <p className="text-xs text-[var(--muted-foreground)] truncate mt-0.5">{activeConv.propertyTitle}</p>
          </div>

        </div>

        {/* Role-context banner */}
        <div
          className={`px-5 py-2 text-xs font-medium flex items-center gap-2 border-b border-[var(--border)] ${
            isLandlord ? "bg-[var(--primary)]/5 text-[var(--primary)]" : isAdmin ? "bg-indigo-50 text-indigo-800 border-indigo-100" : "bg-amber-50 text-amber-800 border-amber-100"
          }`}
        >
          {isLandlord ? "🏠" : isAdmin ? "⚙️" : "🎓"}{" "}
          <span>
            You are a <strong>{myRole}</strong> — messaging a <strong>{otherRole}</strong>.
          </span>
        </div>

        {error && <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700">{error}</p>}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 bg-[var(--background)]">
          {activeConv.messages.length === 0 && (
            <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">No messages yet. Send a message to start this conversation.</p>
          )}
          {activeConv.messages.map((msg) => {
            const isMe = msg.senderId === myId;
            return (
              <div key={msg.id} className={`flex gap-3 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                {/* Avatar with role indicator */}
                <div className="flex-shrink-0 flex flex-col items-center gap-1">
                  <img src={msg.senderAvatar} alt={msg.senderName} className="w-8 h-8 rounded-full object-cover" />
                  <span
                    className={`text-[9px] font-bold px-1 rounded ${
                      msg.senderRole === "landlord"
                        ? "text-[var(--primary)] bg-[var(--secondary)]"
                        : msg.senderRole === "admin"
                          ? "text-indigo-700 bg-indigo-50"
                          : "text-amber-700 bg-amber-50"
                    }`}
                  >
                    {msg.senderRole === "landlord" ? "🏠" : msg.senderRole === "admin" ? "⚙️" : "🎓"}
                  </span>
                </div>

                {/* Bubble */}
                <div className={`flex flex-col gap-1 max-w-xs lg:max-w-md ${isMe ? "items-end" : "items-start"}`}>
                  {/* Name + role */}
                  <div className={`flex items-center gap-1.5 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                    <span className="text-xs font-semibold text-[var(--foreground)]">{msg.senderName}</span>
                    {rolePill(msg.senderRole)}
                  </div>

                  {/* Message bubble — color differs by role */}
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      isMe
                        ? msg.senderRole === "landlord"
                          ? "bg-[var(--primary)] text-white rounded-tr-sm"
                          : msg.senderRole === "admin"
                            ? "bg-indigo-600 text-white rounded-tr-sm"
                            : "bg-amber-500 text-white rounded-tr-sm"
                        : msg.senderRole === "landlord"
                          ? "bg-[var(--secondary)] text-[var(--foreground)] border border-[var(--primary)]/20 rounded-tl-sm"
                          : msg.senderRole === "admin"
                            ? "bg-indigo-50 text-indigo-950 border border-indigo-200 rounded-tl-sm"
                            : "bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-tl-sm"
                    }`}
                  >
                    {msg.content}
                  </div>

                  {/* Timestamp + read */}
                  <span className="text-[10px] text-[var(--muted-foreground)] mx-1">
                    {msg.createdAt}
                    {isMe && (msg.read ? " · Read ✓✓" : " · Sent ✓")}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick replies */}
        <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--card)]">
          <p className="text-[10px] text-[var(--muted-foreground)] font-medium mb-1.5 uppercase tracking-wider">
            Quick replies — {myRole}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {quickReplies.map((qr) => (
              <button
                key={qr}
                onClick={() => sendMessage(qr)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap border ${
                  isLandlord
                    ? "bg-[var(--secondary)] text-[var(--primary)] border-[var(--primary)]/20 hover:bg-[var(--primary)] hover:text-white hover:border-[var(--primary)]"
                    : isAdmin
                      ? "bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600"
                      : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-500 hover:text-white hover:border-amber-500"
                }`}
              >
                {qr}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-[var(--border)] bg-[var(--card)] px-4 py-3 flex gap-3 items-end">
          <div
            className={`flex-1 rounded-2xl px-4 py-2.5 flex items-end gap-2 border ${
              isLandlord ? "bg-[var(--secondary)] border-[var(--primary)]/20" : isAdmin ? "bg-indigo-50 border-indigo-200" : "bg-amber-50 border-amber-200"
            }`}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder={
                isAdmin || otherRole === "admin"
                  ? `Message ${otherName}…`
                  : isLandlord
                    ? "Reply to message…"
                    : otherRole === "student"
                      ? "Message your roommate…"
                      : "Ask the landlord about availability, price, terms…"
              }
              rows={1}
              className="flex-1 bg-transparent text-sm resize-none outline-none max-h-24 leading-relaxed"
            />
          </div>
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim()}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
              isLandlord ? "bg-[var(--primary)] text-white hover:opacity-90" : isAdmin ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-amber-500 text-white hover:bg-amber-600"
            }`}
          >
            ↑
          </button>
        </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div>
              <div className="mb-3 text-3xl">💬</div>
              <p className="text-sm font-medium">{error || "No conversations yet"}</p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">Choose a conversation or select New to message another user.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { fetchMessages, sendMessage as sendMessageRow, markRead, fetchAccountNames, loadProfile } from "../lib/api.js";
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
export default function Chat({ userRole, session, chatTarget, onMessagesRead }) {
  const [rows, setRows] = useState([]);
  const [names, setNames] = useState({});
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

  const load = useCallback(async () => {
    if (!myAccountId) return;
    try {
      const data = await fetchMessages(myAccountId);
      setRows(data);
      const peerIds = Array.from(new Set(data.map((m) => (m.sender_id === myAccountId ? m.receiver_id : m.sender_id))));
      setNames(await fetchAccountNames(peerIds));
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
          profilePhotoUrl: chatTarget.profilePhotoUrl
        }
      }));
      setActiveConvId(String(chatTarget.accountId));
    }
  }, [chatTarget]);

  // Build conversations in the shape the UI expects
  const peerIds = new Set([...rows.map((m) => (m.sender_id === myAccountId ? m.receiver_id : m.sender_id)), ...Object.keys(extraPeers).map(Number)]);
  const conversations = Array.from(peerIds).map((peerId) => {
    const peerName = names[peerId]?.name || extraPeers[peerId]?.name || "User";
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
          senderRole: mine ? (isLandlord ? "landlord" : "student") : isLandlord ? "student" : "landlord",
          content: m.content,
          createdAt: fmtTime(m.created_at),
          read: m.is_read,
          _raw: m,
        };
      });
    const last = msgs[msgs.length - 1];
    const unread = msgs.filter((m) => !m.read && m.senderId !== myAccountId).length;
    const base = { id: String(peerId), propertyTitle: extraPeers[peerId]?.propertyTitle || "Direct message", propertyImage: peerAvatar, propertyAddress: "", messages: msgs, lastMessage: last?.content || "No messages yet", lastMessageAt: last?.createdAt || "" };
    return isLandlord
      ? { ...base, landlordId: myAccountId, landlordName: myName, landlordAvatar: myAvatar, studentId: peerId, studentName: peerName, studentAvatar: peerAvatar, unreadByLandlord: unread, unreadByStudent: 0 }
      : { ...base, studentId: myAccountId, studentName: myName, studentAvatar: myAvatar, landlordId: peerId, landlordName: peerName, landlordAvatar: peerAvatar, unreadByStudent: unread, unreadByLandlord: 0 };
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
  if (!activeConv) {
    return (
      <div className="flex h-full items-center justify-center text-center p-8">
        <div>
          <div className="text-3xl mb-3">💬</div>
          <p className="text-sm font-medium">No conversations yet</p>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">{error || "Open a property and tap “Message Landlord” to start one."}</p>
        </div>
      </div>
    );
  }
  const myRole = isLandlord ? "landlord" : "student";
  const myId = isLandlord ? activeConv.landlordId : activeConv.studentId;
  const myName = isLandlord ? activeConv.landlordName : activeConv.studentName;
  const otherName = isLandlord ? activeConv.studentName : activeConv.landlordName;
  const otherAvatar = isLandlord ? activeConv.studentAvatar : activeConv.landlordAvatar;
  const otherRole = isLandlord ? "student" : "landlord";
  const unreadCount = isLandlord ? activeConv.unreadByLandlord : activeConv.unreadByStudent;
  const quickReplies = isLandlord ? QUICK_REPLIES_LANDLORD : QUICK_REPLIES_STUDENT;
  async function sendMessage(content) {
    if (!content.trim()) return;
    setInput("");
    try {
      const row = await sendMessageRow(myAccountId, Number(activeConv.id), content.trim());
      setRows((prev) => (prev.some((x) => x.message_id === row.message_id) ? prev : [...prev, row]));
    } catch (e) {
      setError(e.message);
    }
  }
  const filteredConvs = conversations.filter(
    (c) =>
      (isLandlord ? c.studentName : c.landlordName).toLowerCase().includes(search.toLowerCase()) ||
      c.propertyTitle.toLowerCase().includes(search.toLowerCase()),
  );
  function rolePill(role) {
    if (role === "landlord")
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20">
          🏠 Landlord
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-lg">Messages</h2>
            {/* Role badge for the logged-in user */}
            {rolePill(myRole)}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isLandlord ? "Search students…" : "Search landlords…"}
            className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--muted)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all"
          />
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]/60">
          {filteredConvs.map((conv) => {
            const displayName = isLandlord ? conv.studentName : conv.landlordName;
            const displayAvatar = isLandlord ? conv.studentAvatar : conv.landlordAvatar;
            const displayRole = isLandlord ? "student" : "landlord";
            const unread = isLandlord ? conv.unreadByLandlord : conv.unreadByStudent;
            const isActive = conv.id === activeConv.id;
            return (
              <button
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                className={`w-full flex items-start gap-3 px-4 py-3.5 hover:bg-[var(--muted)] transition-colors text-left ${isActive ? "bg-[var(--secondary)]" : ""}`}
              >
                {/* Avatar + online dot */}
                <div className="relative flex-shrink-0">
                  <img src={displayAvatar} alt={displayName} className="w-10 h-10 rounded-full object-cover" />
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[var(--card)]" />
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
        {/* Header */}
        <div className="border-b border-[var(--border)] bg-[var(--card)] px-5 py-3 flex items-center gap-3">
          {/* Other party info */}
          <div className="relative flex-shrink-0">
            <img src={otherAvatar} alt={otherName} className="w-10 h-10 rounded-full object-cover" />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[var(--card)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{otherName}</span>
              {rolePill(otherRole)}
            </div>
            <p className="text-xs text-[var(--muted-foreground)] truncate mt-0.5">Online · Re: {activeConv.propertyTitle}</p>
          </div>

          {/* Property context card */}
          <div className="hidden lg:flex items-center gap-3 px-3 py-2 bg-[var(--muted)] rounded-xl border border-[var(--border)] flex-shrink-0 max-w-xs">
            <img src={activeConv.propertyImage} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">{activeConv.propertyTitle}</p>
              <p className="text-[10px] text-[var(--muted-foreground)] truncate">{activeConv.propertyAddress}</p>
            </div>
          </div>
        </div>

        {/* Role-context banner */}
        <div
          className={`px-5 py-2 text-xs font-medium flex items-center gap-2 border-b border-[var(--border)] ${
            isLandlord ? "bg-[var(--primary)]/5 text-[var(--primary)]" : "bg-amber-50 text-amber-800 border-amber-100"
          }`}
        >
          {isLandlord ? (
            <>
              🏠{" "}
              <span>
                You are the <strong>landlord</strong> — responding to a student's inquiry about your property.
              </span>
            </>
          ) : (
            <>
              🎓{" "}
              <span>
                You are a <strong>student</strong> — inquiring about a rental listing from the landlord.
              </span>
            </>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 bg-[var(--background)]">
          {/* Date divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-xs text-[var(--muted-foreground)] font-medium px-2">Today</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          {activeConv.messages.map((msg) => {
            const isMe = msg.senderId === myId;
            return (
              <div key={msg.id} className={`flex gap-3 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                {/* Avatar with role indicator */}
                <div className="flex-shrink-0 flex flex-col items-center gap-1">
                  <img src={msg.senderAvatar} alt={msg.senderName} className="w-8 h-8 rounded-full object-cover" />
                  <span
                    className={`text-[9px] font-bold px-1 rounded ${
                      msg.senderRole === "landlord" ? "text-[var(--primary)] bg-[var(--secondary)]" : "text-amber-700 bg-amber-50"
                    }`}
                  >
                    {msg.senderRole === "landlord" ? "🏠" : "🎓"}
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
                          : "bg-amber-500 text-white rounded-tr-sm"
                        : msg.senderRole === "landlord"
                          ? "bg-[var(--secondary)] text-[var(--foreground)] border border-[var(--primary)]/20 rounded-tl-sm"
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
            Quick replies — {isLandlord ? "as landlord" : "as student"}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {quickReplies.map((qr) => (
              <button
                key={qr}
                onClick={() => sendMessage(qr)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap border ${
                  isLandlord
                    ? "bg-[var(--secondary)] text-[var(--primary)] border-[var(--primary)]/20 hover:bg-[var(--primary)] hover:text-white hover:border-[var(--primary)]"
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
              isLandlord ? "bg-[var(--secondary)] border-[var(--primary)]/20" : "bg-amber-50 border-amber-200"
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
              placeholder={isLandlord ? "Reply to student inquiry…" : "Ask the landlord about availability, price, terms…"}
              rows={1}
              className="flex-1 bg-transparent text-sm resize-none outline-none max-h-24 leading-relaxed"
            />
          </div>
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim()}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
              isLandlord ? "bg-[var(--primary)] text-white hover:opacity-90" : "bg-amber-500 text-white hover:bg-amber-600"
            }`}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}

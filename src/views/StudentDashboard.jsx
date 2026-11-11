import { useEffect, useState } from "react";
import PropertyCard from "../components/PropertyCard.jsx";
import { useData } from "../context/DataContext.jsx";
import { fetchSavedHouseIds, fetchBookings, setBookingStatus, updateStudentProfile } from "../lib/api.js";
// Quiz answer -> students.pref_* integer columns (see sql_script.txt)
const PREF_MAP = {
  sleep: { early: 1, flexible: 2, "night-owl": 3 },
  study: { quiet: 1, "background-music": 2, group: 3 },
  guests: { "no-guests": 1, occasional: 2, frequent: 3 },
};
const STUDENT_SHORTLIST = [
  { id: "camille", initial: "C", name: "Camille Reyes", program: "BS Nursing · 2nd Year", score: 91, partial: [] },
  { id: "bea", initial: "B", name: "Bea Villanueva", program: "BS Education · 4th Year", score: 86, partial: ["Study"] },
  { id: "anna", initial: "A", name: "Anna Lim", program: "BS Biology · 3rd Year", score: 78, partial: ["Clean", "Guests"] },
];
export default function StudentDashboard({ onNavigate, onSelectProperty, comparedIds, onCompare, displayName, session }) {
  const { properties: PROPERTIES } = useData();
  const studentProfile = session?.student ?? {};
  const gender = studentProfile.gender;
  const genderText = gender === "Female" || gender === "Male" ? gender : "";
  const genderBadgeClass = gender === "Female"
    ? "bg-pink-100 text-pink-700"
    : gender === "Male"
      ? "bg-blue-100 text-blue-700"
      : "bg-[var(--muted)] text-[var(--muted-foreground)]";
  const [savedIds, setSavedIds] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [myRequests, setMyRequests] = useState([]); // roommate requests: UI-only, no table in the current schema
  async function refreshMine() {
    if (!session?.studentId) return;
    try {
      setSavedIds(await fetchSavedHouseIds(session.studentId));
      setBookings(await fetchBookings());
    } catch {}
  }
  useEffect(() => {
    refreshMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.studentId]);
  const [activeTab, setActiveTab] = useState("overview");
  const [quizStep, setQuizStep] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizDone, setQuizDone] = useState(false);
  // Roommate request form state
  const [requestStep, setRequestStep] = useState("list");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [moveInDate, setMoveInDate] = useState("2026-07-01");
  const [note, setNote] = useState("");
  const [roommateChoiceMethod, setRoommateChoiceMethod] = useState("landlord");
  const [shortlistChoice, setShortlistChoice] = useState("camille");
  const [vouchOpen, setVouchOpen] = useState(false);
  const [vouchStudent, setVouchStudent] = useState("Daisy Ocampo · 2022-02211");
  const [vouchReason, setVouchReason] = useState("");
  const savedProperties = PROPERTIES.filter((p) => savedIds.includes(p.id));
  // Properties with available shared rooms
  const sharedProperties = PROPERTIES.filter(
    (p) => p.status === "approved" && p.rooms.some((r) => r.status === "available" && r.capacity > 1),
  );
  const selectedProperty = PROPERTIES.find((p) => p.id === selectedPropertyId);
  const quizQuestions = [
    {
      id: "sleep",
      question: "When do you usually sleep?",
      options: [
        { value: "early", label: "Before midnight 🌙" },
        { value: "night-owl", label: "After midnight 🦉" },
        { value: "flexible", label: "Flexible ☁️" },
      ],
    },
    {
      id: "study",
      question: "How do you prefer to study?",
      options: [
        { value: "quiet", label: "Complete silence 📚" },
        { value: "background-music", label: "Music on 🎵" },
        { value: "group", label: "With friends 👥" },
      ],
    },
    {
      id: "cleanliness",
      question: "How clean do you keep your space?",
      options: [
        { value: "5", label: "Spotless always ✨" },
        { value: "4", label: "Generally tidy 🧹" },
        { value: "3", label: "Organized chaos 😅" },
      ],
    },
    {
      id: "guests",
      question: "What's your guest policy?",
      options: [
        { value: "no-guests", label: "No guests 🚫" },
        { value: "occasional", label: "Occasional guests 👋" },
        { value: "frequent", label: "Open door 🎉" },
      ],
    },
  ];
  function handleQuizAnswer(id, value) {
    const newAnswers = { ...quizAnswers, [id]: value };
    setQuizAnswers(newAnswers);
    if (quizStep < quizQuestions.length - 1) {
      setQuizStep(quizStep + 1);
    } else {
      setQuizDone(true);
      if (session?.studentId) {
        updateStudentProfile(session.studentId, {
          pref_sleep_schedule: PREF_MAP.sleep[newAnswers.sleep],
          pref_study_habits: PREF_MAP.study[newAnswers.study],
          pref_cleanliness: Number(newAnswers.cleanliness),
          pref_guest_policy: PREF_MAP.guests[newAnswers.guests],
        }).catch(() => {});
      }
    }
  }
  function submitRequest() {
    if (!selectedPropertyId || !selectedRoomId || !moveInDate) return;
    const prop = PROPERTIES.find((p) => p.id === selectedPropertyId);
    setMyRequests((prev) => [
      ...prev,
      {
        id: `rr${Date.now()}`,
        propertyTitle: prop?.title,
        roomName: prop?.rooms.find((r) => r.id === selectedRoomId)?.name,
        moveInDate,
        note,
        status: "pending",
      },
    ]);
    setRequestStep("submitted");
  }
  function genderLabel(g) {
    if (g === "Female") return "♀ Female";
    if (g === "Male") return "♂ Male";
    return "Gender not set";
  }
  function statusColors(s) {
    if (s === "pending") return "bg-amber-50 text-amber-700 border-amber-200";
    if (s === "matched") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    return "bg-red-50 text-red-700 border-red-200";
  }
  return (
    <div className="student-dashboard max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-xl font-bold">{(displayName || "S").charAt(0).toUpperCase()}</div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold">Hi, {displayName}!</h1>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${genderBadgeClass}`}>{genderLabel(gender)}</span>
          </div>
          <p className="text-[var(--muted-foreground)] text-sm">
            {studentProfile.academic_year || "Academic year not set"} · {studentProfile.student_id_number || "Student ID not set"}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)] mb-8 overflow-x-auto">
        {[
          ["overview", "Overview"],
          ["roommates", `Roommate Requests${myRequests.length ? ` (${myRequests.length})` : ""}`],
          ["saved", "Saved (2)"],
          ["quiz", "Compatibility Quiz"],
        ].map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {activeTab === "overview" && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Saved Listings", value: String(savedProperties.length), icon: "🏠", color: "bg-[var(--secondary)] text-[var(--primary)]" },
              { label: "My Bookings", value: String(bookings.length), icon: "💬", color: "bg-amber-50 text-amber-700" },
              { label: "Roommate Requests", value: String(myRequests.length), icon: "🤝", color: "bg-emerald-50 text-emerald-700" },
              { label: "Listings Compared", value: `${comparedIds.length}/4`, icon: "📊", color: "bg-purple-50 text-purple-700" },
            ].map((stat) => (
              <div key={stat.label} className={`rounded-2xl border border-[var(--border)] p-4 ${stat.color}`}>
                <div className="text-2xl mb-1">{stat.icon}</div>
                <div className="font-display text-2xl font-bold">{stat.value}</div>
                <div className="text-xs font-medium opacity-75 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>

          {bookings.length > 0 && (
            <div>
              <h2 className="font-display text-xl font-semibold mb-4">My Bookings</h2>
              <div className="space-y-2">
                {bookings.map((b) => (
                  <div key={b.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 flex items-center justify-between gap-3 text-sm">
                    <div>
                      <div className="font-semibold">{b.propertyTitle} · {b.roomName}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">{b.startDate} → {b.endDate} · ₱{b.monthlyRate.toLocaleString()}/mo</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--secondary)] text-[var(--primary)]">{b.status}</span>
                      {(b.status === "Pending" || b.status === "Confirmed") && (
                        <button
                          onClick={async () => {
                            await setBookingStatus(b.id, "Cancelled");
                            refreshMine();
                          }}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="font-display text-xl font-semibold mb-4">Recommended for you</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {PROPERTIES.filter((p) => p.status === "approved")
                .slice(0, 2)
                .map((p) => (
                  <PropertyCard
                    key={p.id}
                    property={p}
                    onClick={() => {
                      onSelectProperty(p.id);
                      onNavigate("detail");
                    }}
                    onCompare={onCompare}
                    inComparison={comparedIds.includes(p.id)}
                  />
                ))}
            </div>
          </div>

          <div className="bg-gradient-to-r from-[var(--primary)] to-[#0d7a90] text-white rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <h3 className="font-display text-lg font-semibold mb-1">Need a roommate?</h3>
              <p className="text-sm text-white/75">
                Submit a request to a landlord — they'll find the best same-sex match for you from verified students.
              </p>
            </div>
            <button
              onClick={() => {
                setActiveTab("roommates");
                setRequestStep("form");
              }}
              className="flex-shrink-0 px-5 py-2.5 bg-white text-[var(--primary)] rounded-xl text-sm font-semibold hover:bg-white/90 transition-colors"
            >
              Request Roommate →
            </button>
          </div>
        </div>
      )}

      {/* ── Roommate Requests ── */}
      {activeTab === "roommates" && (
        <div className="space-y-6">
          {/* How it works banner */}
          <div className="bg-[var(--secondary)] border border-[var(--primary)]/15 rounded-xl p-4 flex gap-3 text-sm">
            <span className="text-xl flex-shrink-0">ℹ️</span>
            <div className="text-[var(--primary)]">
              <span className="font-semibold">How roommate requests work:</span> You send a request to a landlord for a specific room. The
              landlord reviews it and proposes the best-matching <strong>same-sex</strong> student from their tenant pool. You'll be
              notified when a match is suggested.
            </div>
          </div>

          {requestStep === "list" && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-semibold">My Requests</h2>
                <button
                  onClick={() => setRequestStep("form")}
                  className="px-4 py-2 bg-[var(--primary)] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  + New Request
                </button>
              </div>

              {myRequests.length === 0 ? (
                <div className="text-center py-12 text-[var(--muted-foreground)]">
                  <div className="text-4xl mb-3">🤝</div>
                  <p className="text-sm font-medium">No roommate requests yet.</p>
                  <p className="text-xs mt-1">Submit a request and let the landlord find you a compatible same-sex match.</p>
                  <button
                    onClick={() => setRequestStep("form")}
                    className="mt-4 px-5 py-2.5 bg-[var(--primary)] text-white rounded-xl text-sm font-semibold hover:opacity-90"
                  >
                    Submit a Request
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {myRequests.map((req) => (
                    <div key={req.id} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                          <h3 className="font-semibold text-sm">{req.propertyTitle}</h3>
                          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                            {req.roomName} · Move-in: {req.moveInDate}
                          </p>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${statusColors(req.status)} capitalize flex-shrink-0`}
                        >
                          {req.status === "pending" ? "⏳ Pending" : req.status === "matched" ? "✓ Match Found" : "✗ Declined"}
                        </span>
                      </div>
                      <div className="bg-[var(--muted)] rounded-lg p-3 text-xs text-[var(--muted-foreground)] mb-3">
                        <span className="font-medium text-[var(--foreground)]">Your note:</span> {req.note}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                        <span className={`px-2 py-0.5 rounded-full font-medium ${genderBadgeClass}`}>
                          {genderText ? `${genderLabel(gender)}-only match` : "Gender not set"}
                        </span>
                        <span>·</span>
                        <span>Submitted {req.createdAt}</span>
                      </div>
                      <button
                        onClick={() => setRequestStep("shortlist")}
                        className="mt-4 px-4 py-2 bg-[var(--primary)] text-white rounded-xl text-sm font-semibold hover:opacity-90"
                      >
                        Choose from Landlord Shortlist
                      </button>
                      {req.status === "matched" && (
                        <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">
                          🎉 The landlord found a compatible roommate match! Check your chat for their suggestion.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {requestStep === "form" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setRequestStep("list")}
                  className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  ← Back
                </button>
                <h2 className="font-display text-xl font-semibold">Request a Roommate</h2>
              </div>
              <div className="rounded-xl border border-[var(--primary)] bg-[var(--secondary)] p-4 text-sm text-[var(--primary)]">
                You can only request a roommate for a room that fits 2 or more people, and your roommate must be the same gender as you.
              </div>
              <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(15rem,1fr)] gap-4 items-start">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Select a Property</label>
                    <select
                      value={selectedPropertyId}
                      onChange={(e) => setSelectedPropertyId(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    >
                      {sharedProperties
                        .filter((property) => property.id === "p2")
                        .map((property) => (
                          <option key={property.id} value={property.id}>
                            {property.title}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Select a Room</label>
                    <div className="space-y-2">
                      {[
                        {
                          id: "r2a",
                          name: "Room 1 — Bed A",
                          detail: "Capacity 2 · 1 of 2 occupied · ₱4,200/mo",
                          badge: "ELIGIBLE",
                          eligible: true,
                        },
                        {
                          id: "boys",
                          name: "Room 2 — Boys Only",
                          detail: "Capacity 2 · 1 of 2 occupied",
                          badge: "NOT ELIGIBLE · Gender",
                          eligible: false,
                        },
                        {
                          id: "single",
                          name: "Room 4 — Single Room",
                          detail: "Capacity 1 · private",
                          badge: "NOT ELIGIBLE · Capacity",
                          eligible: false,
                        },
                      ].map((room) => (
                        <label
                          key={room.id}
                          className={`flex items-center gap-3 rounded-xl border p-3 ${room.eligible && selectedRoomId === room.id ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)]"} ${room.eligible ? "cursor-pointer" : "opacity-65"}`}
                        >
                          <input
                            type="radio"
                            name="room"
                            checked={selectedRoomId === room.id}
                            disabled={!room.eligible}
                            onChange={() => setSelectedRoomId(room.id)}
                            className="accent-[var(--primary)]"
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium">{room.name}</div>
                            <div className="text-[10px] text-[var(--muted-foreground)]">{room.detail}</div>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${room.eligible ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}
                          >
                            {room.badge}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">How would you like to find a roommate?</label>
                    <div className="space-y-2">
                      {[
                        {
                          id: "landlord",
                          title: "Let the landlord choose",
                          description: "The landlord shortlists compatible students and you pick from that list.",
                        },
                        {
                          id: "vouch",
                          title: "I have someone in mind (vouch)",
                          description: "Name a classmate. The landlord decides whether to accept.",
                        },
                      ].map((method) => (
                        <label
                          key={method.id}
                          className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer ${roommateChoiceMethod === method.id ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)]"}`}
                        >
                          <input
                            type="radio"
                            name="choice-method"
                            checked={roommateChoiceMethod === method.id}
                            onChange={() => setRoommateChoiceMethod(method.id)}
                            className="accent-[var(--primary)]"
                          />
                          <div>
                            <div className="text-sm font-medium">{method.title}</div>
                            <div className="text-[10px] text-[var(--muted-foreground)]">{method.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Preferred Move-in Date</label>
                    <input
                      type="date"
                      value={moveInDate}
                      onChange={(e) => setMoveInDate(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">
                      Message to Landlord <span className="font-normal text-[var(--muted-foreground)]">(optional)</span>
                    </label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Tell the landlord about your living habits…"
                      rows={3}
                      className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    />
                  </div>
                  <button
                    onClick={submitRequest}
                    disabled={!selectedPropertyId || !selectedRoomId || !moveInDate}
                    className="w-full rounded-xl bg-[var(--primary)] py-3 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Submit Roommate Request
                  </button>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                  <h3 className="font-semibold">Eligibility Check</h3>
                  <p className="text-xs text-[var(--muted-foreground)] mt-2">Room 1 — Bed A</p>
                  <div className="mt-3 space-y-2">
                    {["Room fits 2 or more people", "A bed is still available", `Same gender as you (${genderText || "not set"})`].map((item) => (
                      <div key={item} className="flex items-center gap-2 text-xs">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">✓</span>
                        {item}
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[10px] text-[var(--muted-foreground)]">
                    Single-occupancy rooms and rooms reserved for another gender can't be requested.
                  </p>
                </div>
              </div>
            </div>
          )}

          {requestStep === "shortlist" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setRequestStep("list")}
                  className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  ← Back
                </button>
                <h2 className="font-display text-xl font-semibold">Choose Your Roommate</h2>
              </div>
              <div className="rounded-xl border border-[var(--primary)] bg-[var(--secondary)] p-4 text-sm text-[var(--primary)]">
                Your landlord shortlisted 3 students for Room 1 — Bed A. You can only choose from this list, or vouch for someone you know.
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                {STUDENT_SHORTLIST.map((candidate) => {
                  const selected = shortlistChoice === candidate.id;
                  return (
                    <button
                      key={candidate.id}
                      onClick={() => setShortlistChoice(candidate.id)}
                      className={`rounded-2xl border bg-[var(--card)] p-4 text-left transition-colors ${selected ? "border-2 border-[var(--primary)]" : "border-[var(--border)] hover:border-[var(--primary)]/50"}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)] text-white">
                          {candidate.initial}
                        </div>
                        <div>
                          <div className="font-semibold">{candidate.name}</div>
                          <div className="text-xs text-[var(--muted-foreground)]">{candidate.program}</div>
                        </div>
                      </div>
                      <span className="mt-3 inline-flex rounded-full bg-pink-100 px-2 py-0.5 text-[10px] text-pink-700">♀ Female</span>
                      <div className="mt-3 flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-[var(--muted)]">
                          <div
                            className={`h-full rounded-full ${candidate.score >= 80 ? "bg-[var(--primary)]" : "bg-amber-600"}`}
                            style={{ width: `${candidate.score}%` }}
                          />
                        </div>
                        <span className={`text-sm font-semibold ${candidate.score >= 80 ? "text-[var(--primary)]" : "text-amber-700"}`}>
                          {candidate.score}%
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {["Sleep", "Clean", "Study", "Guests"].map((trait) => (
                          <span
                            key={trait}
                            className={`rounded-full px-2 py-0.5 text-[10px] ${candidate.partial.includes(trait) ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}
                          >
                            {trait}
                          </span>
                        ))}
                      </div>
                      <div
                        className={`mt-4 rounded-lg py-2 text-center text-xs font-semibold ${selected ? "bg-[var(--primary)] text-white" : "border border-[var(--border)]"}`}
                      >
                        {selected ? "Selected ✓" : "Select"}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="flex-1">
                  <div className="text-sm font-semibold">Know someone you'd rather room with?</div>
                  <div className="text-xs text-[var(--muted-foreground)]">
                    Vouch for a classmate. The landlord decides whether to accept.
                  </div>
                </div>
                <button
                  onClick={() => setVouchOpen(true)}
                  className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium"
                >
                  Vouch for Someone
                </button>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setRequestStep("submitted")}
                  className="rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Confirm Roommate Choice
                </button>
              </div>
            </div>
          )}

          {requestStep === "submitted" && (
            <div className="max-w-md mx-auto text-center py-12">
              <div className="text-5xl mb-4">📬</div>
              <h2 className="font-display text-2xl font-semibold mb-2">Request Sent!</h2>
              <p className="text-[var(--muted-foreground)] text-sm mb-2">
                Your roommate request has been sent to <strong>{selectedProperty?.landlordName}</strong>.
              </p>
              <p className="text-sm text-[var(--muted-foreground)] mb-6">
                They'll review your profile and find the best-matching <span className="font-medium text-pink-700">female</span> student
                from their tenant pool. You'll be notified here and via chat when a match is suggested.
              </p>
              <div className="bg-[var(--secondary)] rounded-2xl p-4 text-left text-sm mb-6 space-y-2">
                <div className="flex justify-between">
                  <span className="text-[var(--muted-foreground)]">Property</span>
                  <span className="font-medium">{selectedProperty?.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--muted-foreground)]">Room</span>
                  <span className="font-medium">{selectedProperty?.rooms.find((r) => r.id === selectedRoomId)?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--muted-foreground)]">Move-in</span>
                  <span className="font-medium">{moveInDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--muted-foreground)]">Match type</span>
                  <span className={`font-medium ${gender === "Female" ? "text-pink-700" : gender === "Male" ? "text-blue-700" : "text-[var(--muted-foreground)]"}`}>
                    {genderText ? `${genderLabel(gender)} only` : "Gender not set"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setRequestStep("list")}
                className="px-6 py-3 bg-[var(--primary)] text-white rounded-xl font-semibold hover:opacity-90"
              >
                View My Requests
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Saved ── */}
      {activeTab === "saved" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display text-xl font-semibold">Saved Listings</h2>
            <button onClick={() => onNavigate("listings")} className="text-sm text-[var(--primary)] font-medium hover:underline">
              Browse more →
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {savedProperties.length === 0 && (
              <p className="text-sm text-[var(--muted-foreground)] col-span-full">No saved listings yet. Open a property and tap “Save listing”.</p>
            )}
            {savedProperties.map((p) => (
              <PropertyCard
                key={p.id}
                property={p}
                onClick={() => {
                  onSelectProperty(p.id);
                  onNavigate("detail");
                }}
                onCompare={onCompare}
                inComparison={comparedIds.includes(p.id)}
              />
            ))}
          </div>
          {comparedIds.length > 0 && (
            <div className="mt-4 p-4 bg-[var(--secondary)] border border-[var(--primary)]/20 rounded-xl flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--primary)]">
                📊 {comparedIds.length} listing{comparedIds.length !== 1 ? "s" : ""} in comparison
              </span>
              <button
                onClick={() => onNavigate("comparison")}
                className="text-sm px-4 py-2 bg-[var(--primary)] text-white rounded-lg font-medium hover:opacity-90"
              >
                Compare Now
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Quiz ── */}
      {activeTab === "quiz" && (
        <div className="max-w-lg mx-auto">
          {quizDone ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="font-display text-2xl font-semibold mb-2">Quiz complete!</h2>
              <p className="text-[var(--muted-foreground)] mb-6">
                Your compatibility profile is saved. Landlords can use it to find your best same-sex match.
              </p>
              <div className="bg-[var(--secondary)] rounded-2xl p-6 text-left mb-6">
                <h3 className="font-semibold text-sm mb-3">Your Profile</h3>
                <div className="space-y-2 text-sm">
                  {Object.entries(quizAnswers).map(([key, val]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-[var(--muted-foreground)] capitalize">{key.replace("-", " ")}</span>
                      <span className="font-medium capitalize">{val.replace("-", " ")}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={() => {
                  setActiveTab("roommates");
                  setRequestStep("form");
                }}
                className="px-6 py-3 bg-[var(--primary)] text-white rounded-xl font-semibold hover:opacity-90"
              >
                Request a Roommate →
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-6">
                <div className="flex-1 h-2 bg-[var(--muted)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--primary)] rounded-full transition-all"
                    style={{ width: `${(quizStep / quizQuestions.length) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-[var(--muted-foreground)] font-mono whitespace-nowrap">
                  {quizStep + 1} / {quizQuestions.length}
                </span>
              </div>
              <h2 className="font-display text-2xl font-semibold mb-8 text-center">{quizQuestions[quizStep].question}</h2>
              <div className="space-y-3">
                {quizQuestions[quizStep].options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleQuizAnswer(quizQuestions[quizStep].id, opt.value)}
                    className="w-full text-left p-4 rounded-xl border border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--secondary)] transition-all font-medium text-sm"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {vouchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="presentation">
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vouch-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="vouch-title" className="font-display text-xl font-semibold">
                  Vouch for a Roommate
                </h3>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  Name a student you'd like to room with. The landlord decides whether to accept.
                </p>
              </div>
              <button
                onClick={() => setVouchOpen(false)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                aria-label="Close vouch form"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="vouch-student" className="block text-xs font-medium mb-1.5">
                  Student name or ID
                </label>
                <input
                  id="vouch-student"
                  value={vouchStudent}
                  onChange={(event) => setVouchStudent(event.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </div>
              <div>
                <label htmlFor="vouch-reason" className="block text-xs font-medium mb-1.5">
                  Why would you be a good match?
                </label>
                <textarea
                  id="vouch-reason"
                  value={vouchReason}
                  onChange={(event) => setVouchReason(event.target.value)}
                  placeholder="Share why you'd be compatible roommates…"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 space-y-2">
                {[`Same gender as you (${genderText || "not set"})`, "Not already assigned to another room"].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-xs">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">✓</span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setVouchOpen(false)}
                className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setVouchOpen(false);
                  setRequestStep("submitted");
                }}
                disabled={!vouchStudent.trim() || !vouchReason.trim()}
                className="rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                Submit Vouch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

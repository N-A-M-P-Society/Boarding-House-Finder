import { useEffect, useState } from "react";
import { useData } from "../context/DataContext";
import { fetchBookings, setBookingStatus } from "../lib/api";
import AddListingModal from "../components/AddListingModal";
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const CALENDAR_EVENTS = [
  { room: "Room 101", status: "available", start: 0, length: 6 },
  { room: "Room 101", status: "reserved", start: 6, length: 2 },
  { room: "Room 204", status: "occupied", start: 5, length: 1 },
  { room: "Room 204", status: "available", start: 6, length: 6 },
  { room: "Room 305", status: "occupied", start: 0, length: 8 },
];
const LANDLORD_ROOMMATE_REQUESTS = [
  {
    id: "sofia",
    initial: "S",
    name: "Sofia Mendez",
    gender: "Female",
    program: "BS Psychology · 3rd Year",
    room: "Room 1 — Bed A · 1 of 2 occupied",
    moveIn: "July 1, 2026",
    choice: "Landlord suggestion",
    status: "NEEDS SHORTLIST",
  },
  {
    id: "mark",
    initial: "M",
    name: "Mark Dela Cruz",
    gender: "Male",
    program: "BS Engineering · 2nd Year",
    room: "Room 5 — Bed A · 1 of 2 occupied",
    moveIn: "July 1, 2026",
    choice: "Vouched: Paolo Ramos",
    status: "VOUCH REVIEW",
  },
  {
    id: "ana",
    initial: "A",
    name: "Ana Reyes",
    gender: "Female",
    program: "BS Nursing · 4th Year",
    room: "Room 3 — Bed B · 1 of 2 occupied",
    moveIn: "August 1, 2026",
    choice: "Shortlist sent · 3 candidates",
    status: "SHORTLIST SENT",
  },
];
const SHORTLIST_CANDIDATES = [
  { id: "camille", initial: "C", name: "Camille Reyes", program: "BS Nursing · 2nd Year", score: 91, partial: [] },
  { id: "bea", initial: "B", name: "Bea Villanueva", program: "BS Education · 4th Year", score: 86, partial: ["Study"] },
  { id: "anna", initial: "A", name: "Anna Lim", program: "BS Biology · 3rd Year", score: 78, partial: ["Clean", "Guests"] },
  {
    id: "joy",
    initial: "J",
    name: "Joy Tan",
    program: "BS Accountancy · 3rd Year",
    score: 64,
    partial: ["Sleep", "Study"],
    mismatch: ["Guests"],
  },
];
function AvailabilityCalendar({ onEvent, onEmptyMonth }) {
  const statusClasses = {
    available: "bg-emerald-100 text-emerald-700",
    reserved: "bg-amber-100 text-amber-700",
    occupied: "bg-red-100 text-red-700",
  };
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[52rem]">
        <div className="grid grid-cols-[4rem_repeat(12,minmax(3.25rem,1fr))]">
          <div />
          {MONTHS.map((month) => (
            <div key={month} className="py-1 text-center text-xs font-medium text-[var(--muted-foreground)]">
              {month}
            </div>
          ))}
        </div>
        {["Room 101", "Room 204", "Room 305"].map((room) => (
          <div key={room} className="relative grid h-16 grid-cols-[4rem_repeat(12,minmax(3.25rem,1fr))]">
            <div className="z-10 flex items-center px-1 text-xs font-medium">{room}</div>
            {MONTHS.map((month, monthIndex) => (
              <button
                key={month}
                type="button"
                onClick={() => onEmptyMonth(room, monthIndex)}
                className="border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] transition-colors"
                aria-label={`Set ${room} availability for ${month} 2026`}
              />
            ))}
            {CALENDAR_EVENTS.filter((event) => event.room === room).map((event) => (
              <button
                key={`${event.room}-${event.status}-${event.start}`}
                type="button"
                onClick={() => onEvent(event.room, event.status)}
                className={`z-20 m-1 flex flex-col items-start justify-center overflow-hidden rounded-md px-1 text-left text-[10px] leading-tight transition-transform hover:-translate-y-0.5 ${statusClasses[event.status]}`}
                style={{ gridColumn: `${event.start + 2} / span ${event.length}`, gridRow: 1 }}
              >
                <span>{event.room}</span>
                <span className="font-semibold uppercase">{event.status}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
export default function LandlordDashboard({onNavigate, onStartChat, displayName, session }) {
  const { properties: PROPERTIES, reload } = useData();
  const [bookings, setBookings] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  async function refreshBookings() {
    try {
      setBookings(await fetchBookings());
    } catch {}
  }
  useEffect(() => {
    refreshBookings();
  }, [session?.landlordId]);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedRoom, setSelectedRoom] = useState("all");
  const [roommateView, setRoommateView] = useState("list");
  const [shortlistSelected, setShortlistSelected] = useState(["camille", "bea", "anna"]);
  const [roommateNotice, setRoommateNotice] = useState(null);
  const [calendarScreen, setCalendarScreen] = useState("calendar");
  const [roomDetail, setRoomDetail] = useState(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [availabilityRoom, setAvailabilityRoom] = useState("Room 204");
  const [availabilityStart, setAvailabilityStart] = useState("");
  const [availabilityEnd, setAvailabilityEnd] = useState("");
  const [availabilityStatus, setAvailabilityStatus] = useState("available");
  const [showUpdateSummary, setShowUpdateSummary] = useState(false);
  const [calendarToast, setCalendarToast] = useState(null);
  const myProperties = PROPERTIES.filter((p) => p.landlordId === String(session?.landlordId));
  const totalRooms = myProperties.flatMap((p) => p.rooms).length;
  const availableRooms = myProperties.flatMap((p) => p.rooms).filter((r) => r.status === "available").length;
  const incomingRequests = LANDLORD_ROOMMATE_REQUESTS;
  return (
    <div className="landlord-dashboard max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-xl font-bold">{(displayName || "L").charAt(0).toUpperCase()}</div>
          <div>
            <h1 className="font-display text-2xl font-semibold">{displayName}</h1>
            <p className="text-[var(--muted-foreground)] text-sm">Landlord · {myProperties.length} propert{myProperties.length === 1 ? "y" : "ies"}</p>
          </div>
        </div>
        <button onClick={() => setAddOpen(true)} className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-[var(--primary)] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
          + Add Listing
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)] mb-8 overflow-x-auto">
        {[
          ["overview", "Overview"],
          ["listings", "My Listings"],
          ["calendar", "Calendar"],
          ["roommates", `Roommate Requests${incomingRequests.length ? ` (${incomingRequests.length})` : ""}`],
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
            {tab === "roommates" && incomingRequests.some((r) => r.status === "pending") && (
              <span className="ml-1.5 w-2 h-2 rounded-full bg-[var(--accent)] inline-block" />
            )}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {activeTab === "overview" && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Properties", value: myProperties.length, icon: "🏠", color: "bg-[var(--secondary)] text-[var(--primary)]" },
              { label: "Total Rooms", value: totalRooms, icon: "🚪", color: "bg-amber-50 text-amber-700" },
              { label: "Available", value: availableRooms, icon: "✅", color: "bg-emerald-50 text-emerald-700" },
              { label: "Roommate Requests", value: incomingRequests.length, icon: "🤝", color: "bg-purple-50 text-purple-700" },
            ].map((stat) => (
              <div key={stat.label} className={`rounded-2xl border border-[var(--border)] p-4 ${stat.color}`}>
                <div className="text-2xl mb-1">{stat.icon}</div>
                <div className="font-display text-2xl font-bold">{stat.value}</div>
                <div className="text-xs font-medium opacity-75 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
              <h3 className="font-semibold mb-4">Booking Requests</h3>
              <div className="space-y-3">
                {bookings.length === 0 && <p className="text-xs text-[var(--muted-foreground)]">No booking requests yet.</p>}
                {bookings.slice(0, 6).map((b) => (
                  <div key={b.id} className="p-3 rounded-xl bg-[var(--muted)] text-left">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="font-medium text-sm">{b.studentName}</span>
                      <span className="text-xs font-semibold text-[var(--primary)]">{b.status}</span>
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)]">{b.propertyTitle} · {b.roomName} · {b.startDate} → {b.endDate}</p>
                    {b.status === "Pending" && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={async () => {
                            await setBookingStatus(b.id, "Confirmed");
                            refreshBookings();
                          }}
                          className="px-3 py-1 text-xs rounded-lg bg-emerald-600 text-white"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={async () => {
                            await setBookingStatus(b.id, "Cancelled");
                            refreshBookings();
                          }}
                          className="px-3 py-1 text-xs rounded-lg bg-red-100 text-red-700"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
              <h3 className="font-semibold mb-4">Listing Status</h3>
              <div className="space-y-3">
                {myProperties.map((p) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-[var(--muted)] flex-shrink-0">
                      <img src={p.images[0]} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{p.title}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">₱{p.monthlyRent.toLocaleString()}/mo</p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        p.status === "approved"
                          ? "bg-emerald-100 text-emerald-700"
                          : p.status === "pending"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Listings ── */}
      {activeTab === "listings" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display text-xl font-semibold">My Properties</h2>
            <button onClick={() => setAddOpen(true)} className="text-sm px-4 py-2 bg-[var(--primary)] text-white rounded-xl font-medium hover:opacity-90">
              + Add Listing
            </button>
          </div>
          {myProperties.map((p) => (
            <div key={p.id} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
              <div className="flex gap-4">
                <div className="w-24 h-20 rounded-xl overflow-hidden bg-[var(--muted)] flex-shrink-0">
                  <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-sm leading-snug">{p.title}</h3>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${
                        p.status === "approved"
                          ? "bg-emerald-100 text-emerald-700"
                          : p.status === "pending"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] mb-2">{p.address}</p>
                  <div className="flex flex-wrap gap-3 text-xs">
                    <span className="text-[var(--primary)] font-semibold">₱{p.monthlyRent.toLocaleString()}/mo</span>
                    <span className="text-[var(--muted-foreground)]">⚡ {p.safetyScore}</span>
                    <span className="text-[var(--muted-foreground)]">
                      {p.rooms.filter((r) => r.status === "available").length}/{p.rooms.length} available
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button className="px-3 py-1.5 text-xs font-medium bg-[var(--muted)] hover:bg-[var(--secondary)] rounded-lg transition-colors">
                  Edit
                </button>
                <button className="px-3 py-1.5 text-xs font-medium bg-[var(--muted)] hover:bg-[var(--secondary)] rounded-lg transition-colors">
                  Upload Badge Docs
                </button>
                <button
                  onClick={() => setActiveTab("calendar")}
                  className="px-3 py-1.5 text-xs font-medium bg-[var(--secondary)] text-[var(--primary)] rounded-lg transition-colors"
                >
                  Calendar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Calendar ── */}
      {activeTab === "calendar" && (
        <div className="space-y-6">
          {calendarScreen === "lease" ? (
            <>
              <h2 className="font-display text-xl font-semibold">Lease Confirmation</h2>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold">Lease Details</h3>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">CONFIRMED</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-5">
                  {[
                    ["Property", "Campus Housing Residence"],
                    ["Room", "Room 204"],
                    ["Tenant", "Student Name"],
                    ["Status", "CONFIRMED"],
                    ["Lease Start", "June 2026"],
                    ["Lease End", "June 2026"],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
                      <div className="text-sm font-medium mt-0.5">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-1">
                  <button
                    onClick={() => {
                      setCalendarScreen("update");
                      setCalendarToast("Room 204 availability has been updated.");
                    }}
                    className="px-4 py-2.5 bg-[var(--primary)] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
                    Confirm Lease
                  </button>
                  <p className="text-xs text-[var(--muted-foreground)]">Confirming marks June 2026 as OCCUPIED on the room calendar.</p>
                </div>
              </div>
            </>
          ) : calendarScreen === "update" ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-display text-xl font-semibold">Real-Time Update</h2>
                <button
                  onClick={() => {
                    setCalendarScreen("calendar");
                    setShowUpdateSummary(true);
                  }}
                  className="px-4 py-2 bg-[var(--primary)] text-white rounded-xl text-sm font-semibold hover:opacity-90"
                >
                  View Updated Calendar
                </button>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 flex flex-col items-center gap-2">
                {["LEASE CONFIRMED", "ROOM CALENDAR UPDATED", "DATES MARKED OCCUPIED", "DASHBOARD UPDATED", "SEARCH RESULTS UPDATED"].map(
                  (step, index, steps) => (
                    <div key={step} className="contents">
                      <div
                        className={`w-full max-w-xs rounded-xl py-2.5 text-center text-xs font-semibold ${index === 0 ? "bg-[var(--primary)] text-white" : "bg-[var(--secondary)] border border-[var(--border)]"}`}
                      >
                        {step}
                      </div>
                      {index < steps.length - 1 && <span className="text-[var(--primary)] font-semibold">↓</span>}
                    </div>
                  ),
                )}
              </div>
            </>
          ) : (
            <>
              {showUpdateSummary && (
                <div className="space-y-4">
                  <h2 className="font-display text-xl font-semibold">Automatic Calendar Update</h2>
                  <div className="grid sm:grid-cols-[1fr_auto_1fr] items-center gap-4 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
                      <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase">Before</div>
                      <div className="mt-1 flex items-center gap-3">
                        <span className="font-display font-semibold">Room 204</span>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          AVAILABLE
                        </span>
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)] mt-1">June 2026</div>
                    </div>
                    <span className="text-[var(--primary)] text-xl">→</span>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
                      <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase">After</div>
                      <div className="mt-1 flex items-center gap-3">
                        <span className="font-display font-semibold">Room 204</span>
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">OCCUPIED</span>
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)] mt-1">June 2026</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="font-display text-xl font-semibold">Room Availability Calendar</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAvailabilityOpen(true)}
                    className="px-3 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-semibold hover:opacity-90"
                  >
                    Set availability
                  </button>
                  <select
                    value={selectedRoom}
                    onChange={(e) => setSelectedRoom(e.target.value)}
                    className="text-sm border border-[var(--border)] rounded-lg px-3 py-2 bg-[var(--card)] outline-none"
                  >
                    <option value="all">All rooms</option>
                    {myProperties
                      .flatMap((p) => p.rooms)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <button className="px-3 py-2 border border-[var(--border)] rounded-lg text-sm font-medium hover:bg-[var(--muted)]">
                      Today
                    </button>
                    <button
                      className="px-3 py-2 border border-[var(--border)] rounded-lg text-sm font-medium hover:bg-[var(--muted)]"
                      aria-label="Previous year"
                    >
                      ‹
                    </button>
                    <button
                      className="px-3 py-2 border border-[var(--border)] rounded-lg text-sm font-medium hover:bg-[var(--muted)]"
                      aria-label="Next year"
                    >
                      ›
                    </button>
                    <span className="font-semibold text-lg ml-2">2026</span>
                  </div>
                  <span className="px-3 py-2 border border-[var(--border)] rounded-lg text-sm font-medium">Year</span>
                </div>
                <AvailabilityCalendar
                  onEvent={(room, status) => setRoomDetail({ room, status })}
                  onEmptyMonth={(room, month) => {
                    setAvailabilityRoom(room);
                    setAvailabilityStart(String(month));
                    setAvailabilityEnd(String(month));
                    setAvailabilityOpen(true);
                  }}
                />
                <div className="flex flex-wrap gap-4 mt-4 text-xs">
                  {[
                    ["bg-emerald-100", "Available"],
                    ["bg-amber-100", "Reserved"],
                    ["bg-red-100", "Occupied"],
                    ["bg-red-950 border border-red-800", "Blocked (confirmed lease)"],
                  ].map(([className, label]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <span className={`w-3 h-3 rounded ${className}`} />
                      <span className="text-[var(--muted-foreground)]">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Roommate Requests ── */}
      {activeTab === "roommates" && roommateView === "list" && (
        <div className="space-y-4">
          <h2 className="font-display text-xl font-semibold">Roommate Requests</h2>
          <div className="rounded-xl border border-[var(--primary)] bg-[var(--secondary)] p-4 text-sm text-[var(--primary)]">
            Requests are only open for rooms that fit 2 or more people, and roommates must be the same gender as the requesting student.
            Shortlist several compatible students — the requester can only choose from your list.
          </div>
          {incomingRequests.map((request) => (
            <div key={request.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)] text-sm font-semibold text-white">
                      {request.initial}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-lg font-semibold">{request.name}</h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${request.gender === "Female" ? "bg-pink-100 text-pink-700" : "bg-blue-100 text-blue-700"}`}
                        >
                          {request.gender === "Female" ? "♀" : "♂"} {request.gender}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--muted-foreground)]">{request.program}</p>
                    </div>
                  </div>
                  <span
                    className={`w-fit rounded-full px-3 py-1 text-[10px] font-semibold ${request.status === "SHORTLIST SENT" ? "bg-[var(--secondary)] text-[var(--primary)]" : "bg-amber-100 text-amber-700"}`}
                  >
                    {request.status}
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {[
                    ["Room Requested", request.room],
                    ["Preferred Move-in", request.moveIn],
                    ["Roommate Choice", request.choice],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
                      <div className="text-sm font-medium">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => setRoommateView(request.id === "mark" ? "vouch" : "shortlist")}
                    className={`${request.status === "SHORTLIST SENT" ? "border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]" : "bg-[var(--primary)] text-white"} rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-90`}
                  >
                    {request.id === "sofia" ? "Choose Roommates" : request.id === "mark" ? "Review Vouched Roommate" : "View Shortlist"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "roommates" && roommateView === "shortlist" && (
        <div className="space-y-5">
          <button onClick={() => setRoommateView("list")} className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            ← Back to Roommate Requests
          </button>
          <h2 className="font-display text-xl font-semibold">Choose Roommates for Sofia Mendez</h2>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)] text-white font-semibold">S</div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Sofia Mendez</span>
                <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-semibold text-pink-700">♀ Female</span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">BS Psychology · 3rd Year · Quiet · Early riser · Tidy</p>
            </div>
            <div className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <div className="text-xs text-[var(--muted-foreground)]">Room</div>
                <div className="font-medium">Room 1 — Bed A</div>
              </div>
              <div>
                <div className="text-xs text-[var(--muted-foreground)]">Move-in</div>
                <div className="font-medium">July 1, 2026</div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Eligible candidates</h3>
            <span className="text-xs text-[var(--muted-foreground)]">Female students only · sorted by compatibility</span>
          </div>
          <div className="space-y-3">
            {SHORTLIST_CANDIDATES.map((candidate) => {
              const selected = shortlistSelected.includes(candidate.id);
              return (
                <button
                  key={candidate.id}
                  onClick={() =>
                    setShortlistSelected((current) =>
                      selected ? current.filter((id) => id !== candidate.id) : current.length < 3 ? [...current, candidate.id] : current,
                    )
                  }
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${selected ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]/50"}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded text-xs ${selected ? "bg-[var(--primary)] text-white" : "border border-[var(--border)]"}`}
                    >
                      {selected ? "✓" : ""}
                    </span>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)] text-white">
                      {candidate.initial}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{candidate.name}</span>
                        <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[10px] text-pink-700">♀ Female</span>
                      </div>
                      <span className="text-xs text-[var(--muted-foreground)]">{candidate.program}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-24 rounded-full bg-[var(--muted)]">
                        <div
                          className={`h-full rounded-full ${candidate.score >= 80 ? "bg-[var(--primary)]" : "bg-amber-600"}`}
                          style={{ width: `${candidate.score}%` }}
                        />
                      </div>
                      <span className={`text-sm font-semibold ${candidate.score >= 80 ? "text-[var(--primary)]" : "text-amber-700"}`}>
                        {candidate.score}%
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {["Sleep", "Clean", "Study", "Guests"].map((trait) => (
                        <span
                          key={trait}
                          className={`rounded-full px-2 py-0.5 text-[10px] ${candidate.mismatch?.includes(trait) ? "bg-red-100 text-red-700" : candidate.partial.includes(trait) ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}
                        >
                          {trait}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            Sleep · Clean · Study · Guests — green = match, amber = partial, red = mismatch
          </p>
          <div className="sticky bottom-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl">
            <strong className="text-sm">{shortlistSelected.length} selected</strong>
            <span className="flex-1 text-xs text-[var(--muted-foreground)]">Sofia can only choose from these students.</span>
            <button
              onClick={() => setShortlistSelected([])}
              className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium"
            >
              Clear
            </button>
            <button
              onClick={() => {
                setRoommateNotice("Shortlist sent to Sofia.");
                setRoommateView("list");
              }}
              disabled={!shortlistSelected.length}
              className="rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Send Shortlist to Sofia
            </button>
          </div>
        </div>
      )}

      {activeTab === "roommates" && roommateView === "vouch" && (
        <div className="space-y-5">
          <button onClick={() => setRoommateView("list")} className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            ← Back to Roommate Requests
          </button>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Vouched Roommate Request</h2>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-semibold text-amber-700">VOUCH REVIEW</span>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { heading: "REQUESTING STUDENT", initial: "M", name: "Mark Dela Cruz", room: "Room 5 — Bed A", score: null },
              { heading: "VOUCHED ROOMMATE", initial: "P", name: "Paolo Ramos", room: null, score: 82 },
            ].map((person) => (
              <div key={person.heading} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                <div className="text-[10px] font-semibold text-[var(--muted-foreground)]">{person.heading}</div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--primary)] text-white">
                    {person.initial}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-lg font-semibold">{person.name}</span>
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700">♂ Male</span>
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)]">BS Engineering · 2nd Year</p>
                  </div>
                </div>
                {person.room && (
                  <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="block text-xs text-[var(--muted-foreground)]">Room</span>
                      <b>{person.room}</b>
                    </div>
                    <div>
                      <span className="block text-xs text-[var(--muted-foreground)]">Preferred Move-in</span>
                      <b>July 1, 2026</b>
                    </div>
                  </div>
                )}
                {person.score && (
                  <div className="mt-4 flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-[var(--muted)]">
                      <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${person.score}%` }} />
                    </div>
                    <b className="text-sm text-[var(--primary)]">{person.score}%</b>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="font-semibold mb-3">Eligibility Check</h3>
            {["Room 5 fits 2 or more people (1 bed free)", "Same gender — both male", "Paolo is not assigned to another room"].map(
              (item) => (
                <div key={item} className="flex items-center gap-3 py-1 text-sm">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs text-emerald-700">✓</span>
                  {item}
                </div>
              ),
            )}
          </div>
          <div>
            <label className="text-sm font-medium">Why Mark vouches for Paolo</label>
            <div className="mt-1 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-sm">
              We're classmates with similar study schedules and would like to share the room.
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setRoommateView("list")}
              className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium"
            >
              Decline
            </button>
            <button
              onClick={() => {
                setRoommateNotice("Paolo Ramos was accepted as Mark's roommate.");
                setRoommateView("list");
              }}
              className="rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Accept Vouched Roommate
            </button>
          </div>
        </div>
      )}

      {roommateNotice && (
        <div className="fixed right-4 top-4 z-[60] w-[min(21.25rem,calc(100vw-2rem))] rounded-xl border border-[var(--primary)] bg-[var(--card)] px-4 py-3 shadow-xl animate-[admin-toast-in_180ms_ease-out]">
          <div className="flex gap-3">
            <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[var(--primary)]" />
            <div className="flex-1">
              <div className="text-sm font-semibold">Roommate request updated</div>
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{roommateNotice}</p>
            </div>
            <button
              onClick={() => setRoommateNotice(null)}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {activeTab === "calendar" && roomDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--primary)] bg-[var(--card)] p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-detail-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <h3 id="room-detail-title" className="font-display text-xl font-semibold">
                  {roomDetail.room}
                </h3>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${
                    roomDetail.status === "occupied"
                      ? "bg-red-100 text-red-700"
                      : roomDetail.status === "reserved"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {roomDetail.status}
                </span>
              </div>
              <button
                onClick={() => setRoomDetail(null)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                aria-label="Close room details"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <div className="text-xs text-[var(--muted-foreground)]">Property</div>
                <div className="text-sm font-medium">Campus Housing Residence</div>
              </div>
              <div>
                <div className="text-xs text-[var(--muted-foreground)]">Lease Dates</div>
                <div className="text-sm font-medium">June 2026</div>
              </div>
              <div>
                <div className="text-xs text-[var(--muted-foreground)]">Status</div>
                <div className="text-sm font-medium capitalize">{roomDetail.status === "occupied" ? "Confirmed" : roomDetail.status}</div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setRoomDetail(null);
                  setCalendarScreen("lease");
                }}
                className="px-4 py-2.5 bg-[var(--primary)] text-white rounded-xl text-sm font-semibold hover:opacity-90"
              >
                View Lease
              </button>
              <button
                onClick={() => {
                  setRoomDetail(null);
                  setActiveTab("listings");
                }}
                className="px-4 py-2.5 border border-[var(--border)] rounded-xl text-sm font-medium hover:bg-[var(--muted)]"
              >
                View Property
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "calendar" && availabilityOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--primary)] bg-[var(--card)] p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="availability-title"
          >
            <h3 id="availability-title" className="font-display text-xl font-semibold mb-4">
              Set Room Availability
            </h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="availability-room" className="block text-xs text-[var(--muted-foreground)] mb-1.5">
                  Room
                </label>
                <select
                  id="availability-room"
                  value={availabilityRoom}
                  onChange={(event) => setAvailabilityRoom(event.target.value)}
                  className="w-full h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--ring)]"
                >
                  {["Room 101", "Room 204", "Room 305"].map((room) => (
                    <option key={room}>{room}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="availability-start" className="block text-xs text-[var(--muted-foreground)] mb-1.5">
                  Start Month
                </label>
                <select
                  id="availability-start"
                  value={availabilityStart}
                  onChange={(event) => setAvailabilityStart(event.target.value)}
                  className="w-full h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--ring)]"
                >
                  <option value="">Select month</option>
                  {MONTHS.map((month, index) => (
                    <option key={month} value={index}>
                      {month} 2026
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="availability-end" className="block text-xs text-[var(--muted-foreground)] mb-1.5">
                  End Month
                </label>
                <select
                  id="availability-end"
                  value={availabilityEnd}
                  onChange={(event) => setAvailabilityEnd(event.target.value)}
                  className="w-full h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--ring)]"
                >
                  <option value="">Select month</option>
                  {MONTHS.map((month, index) => (
                    <option key={month} value={index}>
                      {month} 2026
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="availability-status" className="block text-xs text-[var(--muted-foreground)] mb-1.5">
                  Status
                </label>
                <select
                  id="availability-status"
                  value={availabilityStatus}
                  onChange={(event) => setAvailabilityStatus(event.target.value)}
                  className="w-full h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-medium uppercase outline-none focus:ring-2 focus:ring-[var(--ring)]"
                >
                  <option value="available">AVAILABLE</option>
                  <option value="reserved">RESERVED</option>
                  <option value="occupied">OCCUPIED</option>
                </select>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">Months covered by a confirmed lease cannot be overwritten here.</p>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setAvailabilityOpen(false)}
                className="px-4 py-2.5 border border-[var(--border)] rounded-xl text-sm font-medium hover:bg-[var(--muted)]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setAvailabilityOpen(false);
                  setCalendarToast(`${availabilityRoom} availability has been updated.`);
                }}
                disabled={!availabilityStart || !availabilityEnd}
                className="px-4 py-2.5 bg-[var(--primary)] text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {calendarToast && (
        <div className="fixed right-4 top-4 z-[60] w-[min(21.25rem,calc(100vw-2rem))] rounded-xl border border-[var(--primary)] bg-[var(--card)] px-4 py-3 shadow-xl animate-[admin-toast-in_180ms_ease-out]">
          <div className="flex gap-3">
            <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-[var(--primary)]" />
            <div className="flex-1">
              <div className="text-sm font-semibold">Availability Updated</div>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{calendarToast}</p>
            </div>
            <button
              onClick={() => setCalendarToast(null)}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        </div>
      )}
      {addOpen && <AddListingModal onClose={() => setAddOpen(false)} onCreated={reload} />}
    </div>
  );
}

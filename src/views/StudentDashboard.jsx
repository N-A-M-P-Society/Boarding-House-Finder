import { useEffect, useRef, useState } from "react";
import PropertyCard from "../components/PropertyCard.jsx";
import ProfilePhotoUpload from "../components/ProfilePhotoUpload.jsx";
import PaginatedTableBody from "../components/PaginatedTableBody.jsx";
import { useData } from "../context/DataContext.jsx";
import { supabase } from "../lib/supabase.js";
import {
  createPayment,
  fetchBookings,
  fetchPayments,
  fetchSavedHouseIds,
  sendMessage,
  setBookingStatus,
  updateStudentProfile,
} from "../lib/api.js";
// Quiz answer -> students.pref_* integer columns (see sql_script.txt)
const PREF_MAP = {
  sleep: { early: 1, flexible: 2, "night-owl": 3 },
  study: { quiet: 1, "background-music": 2, group: 3 },
  guests: { "no-guests": 1, occasional: 2, frequent: 3 },
};
export default function StudentDashboard({ onNavigate, onStartChat, onSelectProperty, comparedIds, onCompare, displayName, session, onProfilePhotoChange }) {
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
  const [payments, setPayments] = useState([]);
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingStatusFilter, setBookingStatusFilter] = useState("all");
  const [savedSearch, setSavedSearch] = useState("");
  const [savedAvailabilityFilter, setSavedAvailabilityFilter] = useState("all");
  const [bookingDetail, setBookingDetail] = useState(null);
  const [dashboardNotice, setDashboardNotice] = useState(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [paymentBookingId, setPaymentBookingId] = useState("");
  const [paymentType, setPaymentType] = useState("Monthly rent");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Bank transfer");
  const [paymentReceipt, setPaymentReceipt] = useState(null);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const paymentReceiptInput = useRef(null);
  async function refreshMine() {
    if (!session?.studentId) return;
    try {
      const [savedHouseIds, bookingRows, paymentRows] = await Promise.all([
        fetchSavedHouseIds(session.studentId),
        fetchBookings(),
        fetchPayments(),
      ]);
      setSavedIds(savedHouseIds);
      setBookings(bookingRows);
      setPayments(paymentRows);
    } catch (error) {
      setDashboardNotice({ title: "Dashboard data could not be loaded", message: error.message, error: true });
    }
  }
  async function cancelBooking(booking) {
    try {
      await setBookingStatus(booking.id, "Cancelled");
      setBookingDetail(null);
      setDashboardNotice({ title: "Booking cancelled", message: `${booking.propertyTitle} · ${booking.roomName}`, error: false });
      await refreshMine();
    } catch (error) {
      setDashboardNotice({ title: "Booking cancellation failed", message: error.message, error: true });
    }
  }
  useEffect(() => {
    refreshMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.studentId]);
  useEffect(() => {
    if (!session?.accountId) return;
    const channel = supabase
      .channel(`student-payments-${session.accountId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
        refreshMine();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accountId]);
  const payableBookings = bookings.filter((booking) => booking.status === "Confirmed");
  const selectedPaymentBooking = payableBookings.find((booking) => booking.id === paymentBookingId);
  useEffect(() => {
    if (!payableBookings.length) {
      setPaymentBookingId("");
    } else if (!payableBookings.some((booking) => booking.id === paymentBookingId)) {
      setPaymentBookingId(payableBookings[0].id);
    }
  }, [bookings, paymentBookingId]);
  useEffect(() => {
    if (!selectedPaymentBooking) {
      setPaymentAmount("");
      return;
    }
    setPaymentAmount(String(paymentType === "Monthly rent"
      ? selectedPaymentBooking.monthlyRate
      : selectedPaymentBooking.securityDeposit || ""));
  }, [paymentBookingId, paymentType, bookings]);
  const [activeTab, setActiveTab] = useState("overview");
  const [quizStep, setQuizStep] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizDone, setQuizDone] = useState(false);
  // Roommate request form state
  const [requestStep, setRequestStep] = useState("list");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [moveInDate, setMoveInDate] = useState("");
  const [note, setNote] = useState("");
  const savedProperties = PROPERTIES.filter((p) => savedIds.includes(p.id));
  const filteredBookings = bookings.filter((booking) => {
    const query = bookingSearch.trim().toLowerCase();
    const status = String(booking.status || "").toLowerCase();
    const matchesSearch = !query ||
      String(booking.propertyTitle || "").toLowerCase().includes(query) ||
      String(booking.roomName || "").toLowerCase().includes(query) ||
      String(booking.status || "").toLowerCase().includes(query);
    return matchesSearch && (bookingStatusFilter === "all" || status === bookingStatusFilter);
  });
  const filteredSavedProperties = savedProperties.filter((property) => {
    const query = savedSearch.trim().toLowerCase();
    const availableRooms = property.rooms.filter((room) => room.status === "available").length;
    const matchesSearch = !query ||
      property.title.toLowerCase().includes(query) ||
      String(property.address || "").toLowerCase().includes(query);
    const matchesAvailability = savedAvailabilityFilter === "all" ||
      (savedAvailabilityFilter === "available" ? availableRooms > 0 : availableRooms === 0);
    return matchesSearch && matchesAvailability;
  });
  // Properties with available shared rooms
  const sharedProperties = PROPERTIES.filter(
    (p) => p.status === "approved" && p.landlordAccountId && p.rooms.some((r) => r.status === "available" && r.capacity > 1),
  );
  const selectedProperty = sharedProperties.find((p) => p.id === selectedPropertyId);
  const eligibleRooms = selectedProperty?.rooms.filter((room) => room.capacity > 1 && room.status === "available") || [];
  const selectedSharedRoom = eligibleRooms.find((room) => room.id === selectedRoomId);
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
  async function handleQuizAnswer(id, value) {
    const newAnswers = { ...quizAnswers, [id]: value };
    setQuizAnswers(newAnswers);
    if (quizStep < quizQuestions.length - 1) {
      setQuizStep(quizStep + 1);
    } else {
      try {
        if (!session?.studentId) throw new Error("Student profile is not available.");
        await updateStudentProfile(session.studentId, {
          pref_sleep_schedule: PREF_MAP.sleep[newAnswers.sleep],
          pref_study_habits: PREF_MAP.study[newAnswers.study],
          pref_cleanliness: Number(newAnswers.cleanliness),
          pref_guest_policy: PREF_MAP.guests[newAnswers.guests],
        });
        setQuizDone(true);
      } catch (error) {
        setDashboardNotice({ title: "Preferences could not be saved", message: error.message, error: true });
      }
    }
  }
  async function submitRequest() {
    const room = eligibleRooms.find((item) => item.id === selectedRoomId);
    if (!session?.accountId || !selectedProperty?.landlordAccountId || !room || !moveInDate) return;
    setRequestBusy(true);
    setDashboardNotice(null);
    try {
      await sendMessage(
        session.accountId,
        Number(selectedProperty.landlordAccountId),
        [
          `Roommate request: ${selectedProperty.title} · ${room.name}`,
          `Preferred move-in: ${moveInDate}`,
          `Same-gender roommate preference: ${genderText || "not set"}`,
          `Additional note: ${note.trim() || "None"}`,
        ].join("\n"),
      );
      setRequestStep("submitted");
    } catch (error) {
      setDashboardNotice({ title: "Request could not be sent", message: error.message, error: true });
    } finally {
      setRequestBusy(false);
    }
  }
  async function submitPayment(event) {
    event.preventDefault();
    if (!selectedPaymentBooking || !paymentReceipt) {
      setDashboardNotice({ title: "Payment details required", message: "Choose a confirmed booking and attach your payment proof.", error: true });
      return;
    }
    setPaymentBusy(true);
    try {
      await createPayment({
        bookingId: selectedPaymentBooking.id,
        amount: paymentAmount,
        paymentType,
        paymentMethod,
        receiptFile: paymentReceipt,
      });
      setPaymentReceipt(null);
      if (paymentReceiptInput.current) paymentReceiptInput.current.value = "";
      setDashboardNotice({ title: "Payment submitted", message: "Your landlord can now review your payment and receipt.", error: false });
      await refreshMine();
    } catch (error) {
      setDashboardNotice({ title: "Payment could not be submitted", message: error.message, error: true });
    } finally {
      setPaymentBusy(false);
    }
  }
  function genderLabel(g) {
    if (g === "Female") return "♀ Female";
    if (g === "Male") return "♂ Male";
    return "Gender not set";
  }
  return (
    <div className="student-dashboard max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <ProfilePhotoUpload
          name={displayName}
          photoUrl={studentProfile.profile_photo_url}
          onUploaded={async (url) => {
            await updateStudentProfile(session.studentId, { profile_photo_url: url });
            onProfilePhotoChange?.(url);
          }}
        />
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
          ["payments", "Payments"],
          ["roommates", "Roommate Requests"],
          ["saved", `Saved (${savedProperties.length})`],
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: "Saved Listings", value: String(savedProperties.length), icon: "🏠", color: "bg-[var(--secondary)] text-[var(--primary)]" },
              { label: "My Bookings", value: String(bookings.length), icon: "💬", color: "bg-amber-50 text-amber-700" },
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
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-display text-xl font-semibold">My Bookings</h2>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">{filteredBookings.length} of {bookings.length} bookings</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input type="search" value={bookingSearch} onChange={(event) => setBookingSearch(event.target.value)} placeholder="Search property or room" aria-label="Search bookings" className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" />
                  <select value={bookingStatusFilter} onChange={(event) => setBookingStatusFilter(event.target.value)} aria-label="Filter bookings by status" className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
                    <option value="all">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
                <table className="w-full min-w-[42rem] text-sm">
                  <thead className="bg-[var(--muted)]"><tr>{["Property", "Room", "Lease dates", "Monthly rent", "Status", "Details"].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{heading}</th>)}</tr></thead>
                  <PaginatedTableBody
                    rows={filteredBookings}
                    columns={6}
                    resetKey={`${bookingSearch}|${bookingStatusFilter}`}
                    emptyMessage="No bookings match your search or status filter."
                    renderRow={(booking) => (
                      <tr key={booking.id} className="hover:bg-[var(--muted)]">
                        <td className="px-4 py-3 font-medium">{booking.propertyTitle}</td>
                        <td className="px-4 py-3">{booking.roomName}</td>
                        <td className="px-4 py-3 text-xs">{booking.startDate} → {booking.endDate}</td>
                        <td className="px-4 py-3">₱{Number(booking.monthlyRate).toLocaleString()}/mo</td>
                        <td className="px-4 py-3"><span className="rounded-full bg-[var(--secondary)] px-2.5 py-1 text-xs font-semibold text-[var(--primary)]">{booking.status}</span></td>
                        <td className="px-4 py-3"><button type="button" onClick={() => setBookingDetail(booking)} className="rounded-lg bg-[var(--secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)]">View details</button></td>
                      </tr>
                    )}
                  />
                </table>
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

      {activeTab === "payments" && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="mb-4">
              <h2 className="font-display text-xl font-semibold">Submit a payment</h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">Submit proof of a monthly rent or security deposit payment for a confirmed booking. Your landlord will review it.</p>
            </div>
            {payableBookings.length === 0 ? (
              <p className="rounded-xl bg-[var(--muted)] p-4 text-sm text-[var(--muted-foreground)]">You can submit a payment after a landlord confirms one of your bookings.</p>
            ) : (
              <form onSubmit={submitPayment} className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold">
                  Confirmed booking
                  <select value={paymentBookingId} onChange={(event) => setPaymentBookingId(event.target.value)} className="mt-1 block w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm font-normal">
                    {payableBookings.map((booking) => (
                      <option key={booking.id} value={booking.id}>{booking.propertyTitle} · {booking.roomName}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold">
                  Payment type
                  <select value={paymentType} onChange={(event) => setPaymentType(event.target.value)} className="mt-1 block w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm font-normal">
                    <option>Monthly rent</option>
                    <option>Security deposit</option>
                  </select>
                </label>
                <label className="text-xs font-semibold">
                  Amount (₱)
                  <input type="number" min="0.01" step="0.01" required value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="mt-1 block w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm font-normal" />
                </label>
                <label className="text-xs font-semibold">
                  Payment method
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="mt-1 block w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm font-normal">
                    {["Bank transfer", "E-wallet", "Cash", "Other"].map((method) => <option key={method}>{method}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold sm:col-span-2">
                  Receipt or payment proof (JPG, PNG, WebP, or PDF; max 10 MB)
                  <input
                    ref={paymentReceiptInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    required
                    onChange={(event) => setPaymentReceipt(event.target.files?.[0] || null)}
                    className="mt-1 block w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-normal file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--secondary)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--primary)]"
                  />
                </label>
                <div className="sm:col-span-2">
                  <button type="submit" disabled={paymentBusy || !paymentReceipt} className="rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
                    {paymentBusy ? "Submitting payment…" : "Submit for landlord review"}
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="font-display text-xl font-semibold">My payments</h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">Payment submissions and landlord review decisions.</p>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
              <table className="w-full min-w-[48rem] text-sm">
                <thead className="bg-[var(--muted)]"><tr>{["Property / room", "Type", "Amount", "Submitted", "Method", "Status", "Review note"].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{heading}</th>)}</tr></thead>
                <PaginatedTableBody
                  rows={payments}
                  columns={7}
                  emptyMessage="No payments submitted yet."
                  renderRow={(payment) => (
                    <tr key={payment.id}>
                      <td className="px-4 py-3 font-medium">{payment.propertyTitle} · {payment.roomName}</td>
                      <td className="px-4 py-3">{payment.paymentType}</td>
                      <td className="px-4 py-3">₱{payment.amount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs">{payment.paymentDate?.slice(0, 10) || "—"}</td>
                      <td className="px-4 py-3">{payment.paymentMethod || "—"}</td>
                      <td className="px-4 py-3"><span className="rounded-full bg-[var(--secondary)] px-2.5 py-1 text-xs font-semibold text-[var(--primary)]">{payment.status}</span></td>
                      <td className="px-4 py-3 text-xs text-red-700">{payment.rejectionReason || "—"}</td>
                    </tr>
                  )}
                />
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ── Roommate Requests ── */}
      {activeTab === "roommates" && (
        <div className="space-y-6">
          <div className="bg-[var(--secondary)] border border-[var(--primary)]/15 rounded-xl p-4 flex gap-3 text-sm">
            <span className="text-xl flex-shrink-0">ℹ️</span>
            <div className="text-[var(--primary)]">
              Roommate requests are sent directly to the landlord through Messages. Matching and request status are not tracked as separate records yet.
            </div>
          </div>

          {requestStep === "list" && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-semibold">Request a Roommate</h2>
                <button
                  onClick={() => setRequestStep("form")}
                  className="px-4 py-2 bg-[var(--primary)] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  + New Request
                </button>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 text-sm text-[var(--muted-foreground)]">
                New requests are sent as messages and can be continued from the Messages page.
              </div>
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
                Select an available shared room. The landlord will receive your request in Messages and can confirm roommate compatibility.
              </div>
              <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(15rem,1fr)] gap-4 items-start">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Select a Property</label>
                    <select
                      value={selectedPropertyId}
                      onChange={(e) => {
                        setSelectedPropertyId(e.target.value);
                        setSelectedRoomId("");
                      }}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    >
                      <option value="">Select a property</option>
                      {sharedProperties.map((property) => (
                          <option key={property.id} value={property.id}>
                            {property.title}
                          </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Select a Room</label>
                    <div className="space-y-2">
                      {eligibleRooms.map((room) => (
                        <label
                          key={room.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${selectedRoomId === room.id ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)]"}`}
                        >
                          <input
                            type="radio"
                            name="room"
                            checked={selectedRoomId === room.id}
                            onChange={() => setSelectedRoomId(room.id)}
                            className="accent-[var(--primary)]"
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium">{room.name}</div>
                            <div className="text-[10px] text-[var(--muted-foreground)]">Capacity {room.capacity} · ₱{Number(room.price).toLocaleString()}/mo</div>
                          </div>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">Available</span>
                        </label>
                      ))}
                      {selectedProperty && eligibleRooms.length === 0 && (
                        <p className="rounded-xl border border-[var(--border)] p-3 text-xs text-[var(--muted-foreground)]">This property has no available shared rooms.</p>
                      )}
                      {!selectedProperty && sharedProperties.length === 0 && (
                        <p className="rounded-xl border border-[var(--border)] p-3 text-xs text-[var(--muted-foreground)]">No published properties currently have available shared rooms.</p>
                      )}
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
                    disabled={requestBusy || !session?.accountId || !selectedProperty?.landlordAccountId || !eligibleRooms.some((room) => room.id === selectedRoomId) || !moveInDate}
                    className="w-full rounded-xl bg-[var(--primary)] py-3 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    {requestBusy ? "Sending request…" : "Send Roommate Request"}
                  </button>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                  <h3 className="font-semibold">Request Details</h3>
                  <p className="text-xs text-[var(--muted-foreground)] mt-2">{selectedSharedRoom?.name || "Select a room"}</p>
                  <div className="mt-3 space-y-2">
                    {[
                      ["Room", selectedSharedRoom ? "Shared room selected" : "Choose an available shared room"],
                      ["Availability", selectedSharedRoom ? "Currently available" : "Based on live listing data"],
                      ["Gender", genderText ? `${genderText} preference included in message` : "Not set on your profile"],
                    ].map(([label, value]) => (
                      <div key={label} className="flex flex-col gap-0.5 text-xs">
                        <span className="font-semibold">{label}</span>
                        <span className="text-[var(--muted-foreground)]">{value}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[10px] text-[var(--muted-foreground)]">
                    Only live properties and rooms marked available are included.
                  </p>
                </div>
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
                This request is a message, not a separately tracked request record. Continue the conversation from Messages.
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
              </div>
              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                <button
                  onClick={() => {
                    if (onStartChat) {
                      onStartChat({
                        accountId: Number(selectedProperty?.landlordAccountId),
                        name: selectedProperty?.landlordName,
                        propertyTitle: selectedProperty?.title,
                        profilePhotoUrl: selectedProperty?.landlordAvatar,
                      });
                    }
                    else onNavigate("chat");
                  }}
                  className="rounded-xl bg-[var(--primary)] px-6 py-3 font-semibold text-white hover:opacity-90"
                >
                  Open Messages
                </button>
                <button onClick={() => setRequestStep("list")} className="rounded-xl border border-[var(--border)] px-6 py-3 font-semibold">Done</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Saved ── */}
      {activeTab === "saved" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold">Saved Listings</h2>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">{filteredSavedProperties.length} of {savedProperties.length} saved listings</p>
            </div>
            <button onClick={() => onNavigate("listings")} className="text-left text-sm font-medium text-[var(--primary)] hover:underline sm:text-right">
              Browse more →
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input type="search" value={savedSearch} onChange={(event) => setSavedSearch(event.target.value)} placeholder="Search saved listings" aria-label="Search saved listings" className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" />
            <select value={savedAvailabilityFilter} onChange={(event) => setSavedAvailabilityFilter(event.target.value)} aria-label="Filter saved listings by room availability" className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
              <option value="all">All availability</option>
              <option value="available">Has available rooms</option>
              <option value="full">No available rooms</option>
            </select>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="bg-[var(--muted)]"><tr>{["Listing", "Address", "Rooms available", "Starting rent", "Safety", "Actions"].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{heading}</th>)}</tr></thead>
              <PaginatedTableBody
                rows={filteredSavedProperties}
                columns={6}
                resetKey={`${savedSearch}|${savedAvailabilityFilter}`}
                emptyMessage={savedProperties.length ? "No saved listings match your search or availability filter." : "No saved listings yet. Browse properties and save one to see it here."}
                renderRow={(property) => {
                  const available = property.rooms.filter((room) => room.status === "available").length;
                  return (
                    <tr key={property.id} className="hover:bg-[var(--muted)]">
                      <td className="px-4 py-3 font-medium">{property.title}</td>
                      <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">{property.address}</td>
                      <td className="px-4 py-3">{available} / {property.rooms.length}</td>
                      <td className="px-4 py-3">₱{Number(property.monthlyRent).toLocaleString()}/mo</td>
                      <td className="px-4 py-3 font-semibold">{Number(property.safetyScore).toFixed(1)}/10</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => { onSelectProperty(property.id); onNavigate("detail"); }} className="rounded-lg bg-[var(--secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)]">View</button>
                          <button type="button" onClick={() => onCompare(property.id)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold">{comparedIds.includes(property.id) ? "Remove compare" : "Compare"}</button>
                        </div>
                      </td>
                    </tr>
                  );
                }}
              />
            </table>
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
                Your roommate preferences are saved to your student profile. The quiz does not create or rank roommate matches.
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

      {bookingDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="student-booking-detail-title">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--muted)] px-5 py-4">
              <div>
                <h3 id="student-booking-detail-title" className="font-display text-lg font-semibold">Booking details</h3>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">{bookingDetail.propertyTitle} · {bookingDetail.roomName}</p>
              </div>
              <button type="button" onClick={() => setBookingDetail(null)} aria-label="Close booking details" className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--border)]">✕</button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {[
                ["Status", bookingDetail.status],
                ["Monthly rent", `₱${Number(bookingDetail.monthlyRate).toLocaleString()}`],
                ["Lease starts", bookingDetail.startDate],
                ["Lease ends", bookingDetail.endDate],
              ].map(([label, value]) => <div key={label}><div className="text-xs text-[var(--muted-foreground)]">{label}</div><div className="mt-1 text-sm font-medium">{value}</div></div>)}
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--muted)] px-5 py-3">
              <button type="button" onClick={() => setBookingDetail(null)} className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-semibold">Close</button>
              {["Pending", "Confirmed"].includes(bookingDetail.status) && (
                <button type="button" onClick={() => cancelBooking(bookingDetail)} className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white">Cancel booking</button>
              )}
            </div>
          </div>
        </div>
      )}

      {dashboardNotice && (
        <div className="fixed right-4 top-4 z-[60] w-[min(22.5rem,calc(100vw-2rem))] rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-xl" role="status">
          <div className="flex gap-3">
            <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${dashboardNotice.error ? "bg-red-500" : "bg-emerald-500"}`} />
            <div className="flex-1">
              <div className="text-xs font-semibold">{dashboardNotice.title}</div>
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{dashboardNotice.message}</p>
            </div>
            <button type="button" onClick={() => setDashboardNotice(null)} aria-label="Dismiss dashboard notification" className="text-[var(--muted-foreground)]">×</button>
          </div>
        </div>
      )}
    </div>
  );
}

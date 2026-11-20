import { useEffect, useRef, useState } from "react";
import PropertyCard from "../components/PropertyCard.jsx";
import ProfilePhotoUpload from "../components/ProfilePhotoUpload.jsx";
import PaginatedTableBody from "../components/PaginatedTableBody.jsx";
import DashboardHeader from "../components/DashboardHeader.jsx";
import DashboardTabBar from "../components/DashboardTabBar.jsx";
import { useData } from "../context/DataContext.jsx";
import { supabase } from "../lib/supabase.js";
import {
  chooseRoommateMatchCandidate,
  closeRoommateMatchRequest,
  createPayment,
  createRoommateMatchRequest,
  fetchBookings,
  fetchMyInvoiceBalances,
  fetchMyRoommateMatchCandidates,
  fetchMyRoommateMatchRequest,
  fetchMySharedBookingInvites,
  fetchPayments,
  fetchSavedHouseIds,
  renewBooking,
  respondToSharedBookingInvite,
  studentMoveOutBooking,
  setBookingStatus,
  updateStudentProfile,
} from "../lib/api.js";
// Quiz answer -> students.pref_* integer columns (see sql_script.txt)
const PREF_MAP = {
  sleep: { early: 1, flexible: 2, "night-owl": 3 },
  study: { quiet: 1, "background-music": 2, group: 3 },
  guests: { "no-guests": 1, occasional: 2, frequent: 3 },
};
const ROOMMATE_PREFERENCE_LABELS = {
  sleep: { 1: "Early sleeper", 2: "Flexible sleep schedule", 3: "Night owl" },
  study: { 1: "Quiet study", 2: "Background music", 3: "Group study" },
  cleanliness: { 1: "Very clean", 2: "Very clean", 3: "Organized chaos", 4: "Generally tidy", 5: "Spotless" },
  guests: { 1: "No guests", 2: "Occasional guests", 3: "Frequent guests" },
};
function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}
function roommatePreferenceSummary(preferences) {
  return Object.entries(ROOMMATE_PREFERENCE_LABELS)
    .map(([category, labels]) => labels[preferences[category]] && `${labels[preferences[category]]}`)
    .filter(Boolean);
}
function cyclePromptKey(booking) {
  return `${booking.id}:${booking.endDate}`;
}
function studentBookingStartDate(booking, studentId) {
  return booking.roommateStudentId === String(studentId)
    ? booking.roommateStartDate || booking.startDate
    : booking.startDate;
}
export default function StudentDashboard({ onNavigate, onStartChat, onSelectProperty, comparedIds, onCompare, displayName, session, onProfilePhotoChange, initialTab = "overview" }) {
  const { properties: PROPERTIES, reload } = useData();
  const studentProfile = session?.student ?? {};
  const gender = studentProfile.gender;
  const [roommatePreferenceOverrides, setRoommatePreferenceOverrides] = useState(null);
  const roommatePreferences = roommatePreferenceOverrides || {
    sleep: studentProfile.pref_sleep_schedule,
    study: studentProfile.pref_study_habits,
    cleanliness: studentProfile.pref_cleanliness,
    guests: studentProfile.pref_guest_policy,
  };
  const hasCompleteRoommatePreferences = Object.values(roommatePreferences).every((value) => value != null);
  const genderBadgeClass = gender === "Female"
    ? "bg-pink-100 text-pink-700"
    : gender === "Male"
      ? "bg-blue-100 text-blue-700"
      : "bg-[var(--muted)] text-[var(--muted-foreground)]";
  const [savedIds, setSavedIds] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [payments, setPayments] = useState([]);
  const [invoiceBalances, setInvoiceBalances] = useState([]);
  const [sharedBookingInvites, setSharedBookingInvites] = useState([]);
  const [roommateMatchRequest, setRoommateMatchRequest] = useState(null);
  const [roommateMatchCandidates, setRoommateMatchCandidates] = useState([]);
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingStatusFilter, setBookingStatusFilter] = useState("all");
  const [savedSearch, setSavedSearch] = useState("");
  const [savedAvailabilityFilter, setSavedAvailabilityFilter] = useState("all");
  const [bookingDetail, setBookingDetail] = useState(null);
  const [stayDecisionBookingId, setStayDecisionBookingId] = useState(null);
  const [dismissedCyclePromptKeys, setDismissedCyclePromptKeys] = useState([]);
  const [stayActionBusy, setStayActionBusy] = useState(false);
  const [dashboardNotice, setDashboardNotice] = useState(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [bookingInviteBusyId, setBookingInviteBusyId] = useState("");
  const [paymentBookingId, setPaymentBookingId] = useState("");
  const [paymentInvoiceId, setPaymentInvoiceId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Bank transfer");
  const [paymentReceipt, setPaymentReceipt] = useState(null);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const paymentReceiptInput = useRef(null);
  async function refreshMine() {
    if (!session?.studentId) return;
    try {
      const [savedHouseIds, bookingRows, paymentRows, invoiceRows, bookingInvites, matchRequest, matchCandidates] = await Promise.all([
        fetchSavedHouseIds(session.studentId),
        fetchBookings(),
        fetchPayments(),
        fetchMyInvoiceBalances(),
        fetchMySharedBookingInvites(),
        fetchMyRoommateMatchRequest(),
        fetchMyRoommateMatchCandidates(),
      ]);
      setSavedIds(savedHouseIds);
      setBookings(bookingRows);
      setPayments(paymentRows);
      setInvoiceBalances(invoiceRows);
      setSharedBookingInvites(bookingInvites);
      setRoommateMatchRequest(matchRequest);
      setRoommateMatchCandidates(matchCandidates);
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
      .channel(`student-dashboard-${session.accountId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "bookings",
      }, () => {
        refreshMine();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
        refreshMine();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accountId]);
  const myBookings = bookings.filter((booking) =>
    booking.studentId === String(session?.studentId) ||
    (booking.roommateStudentId === String(session?.studentId) && booking.roommateInviteStatus === "Accepted")
  );
  const payableBookings = myBookings.filter((booking) =>
    booking.status === "Confirmed" &&
    invoiceBalances.some((invoice) => invoice.bookingId === booking.id && invoice.remainingBalance > 0)
  );
  const selectedPaymentBooking = payableBookings.find((booking) => booking.id === paymentBookingId);
  const payableInvoices = invoiceBalances.filter((invoice) =>
    invoice.bookingId === paymentBookingId && invoice.remainingBalance > 0
  );
  const selectedPaymentInvoice = payableInvoices.find((invoice) => invoice.id === paymentInvoiceId);
  useEffect(() => {
    if (!payableBookings.length) {
      setPaymentBookingId("");
    } else if (!payableBookings.some((booking) => booking.id === paymentBookingId)) {
      setPaymentBookingId(payableBookings[0].id);
    }
  }, [bookings, invoiceBalances, paymentBookingId]);
  useEffect(() => {
    if (!payableInvoices.length) {
      setPaymentInvoiceId("");
    } else if (!payableInvoices.some((invoice) => invoice.id === paymentInvoiceId)) {
      setPaymentInvoiceId(payableInvoices[0].id);
    }
  }, [payableInvoices, paymentInvoiceId]);
  useEffect(() => {
    if (!selectedPaymentInvoice) {
      setPaymentAmount("");
      return;
    }
    setPaymentAmount(String(selectedPaymentInvoice.remainingBalance.toFixed(2)));
  }, [paymentInvoiceId, invoiceBalances]);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [quizStep, setQuizStep] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizDone, setQuizDone] = useState(false);
  // Roommate matching request state
  const [requestStep, setRequestStep] = useState("list");
  const todayDate = localDate(new Date());
  const renewalWindowEnd = addDays(todayDate, 7);
  const dueBookings = myBookings.filter((booking) =>
    booking.status === "Confirmed" &&
    booking.studentId === String(session?.studentId) &&
    booking.startDate <= todayDate &&
    booking.endDate <= renewalWindowEnd
  );
  const stayDecisionBooking = myBookings.find((booking) => booking.id === stayDecisionBookingId);
  const stayRenewalAvailable = stayDecisionBooking && stayDecisionBooking.endDate <= renewalWindowEnd;
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key !== "Escape") return;
      if (!stayDecisionBooking && !bookingDetail) return;
      event.preventDefault();

      if (stayDecisionBooking) {
        if (stayActionBusy) return;
        const promptKey = cyclePromptKey(stayDecisionBooking);
        setDismissedCyclePromptKeys((keys) => keys.includes(promptKey) ? keys : [...keys, promptKey]);
        setStayDecisionBookingId(null);
      } else if (bookingDetail) {
        setBookingDetail(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stayDecisionBooking, stayActionBusy, bookingDetail]);
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  useEffect(() => {
    if (stayDecisionBookingId || bookingDetail) return;
    const dueBooking = dueBookings.find((booking) => !dismissedCyclePromptKeys.includes(cyclePromptKey(booking)));
    if (dueBooking) setStayDecisionBookingId(dueBooking.id);
  }, [dueBookings, dismissedCyclePromptKeys, stayDecisionBookingId, bookingDetail]);
  async function continueStay(booking) {
    setStayActionBusy(true);
    try {
      const nextBillingDate = await renewBooking(booking.id);
      setDismissedCyclePromptKeys((keys) => keys.includes(cyclePromptKey(booking)) ? keys : [...keys, cyclePromptKey(booking)]);
      setStayDecisionBookingId(null);
      setBookingDetail(null);
      setPaymentBookingId(booking.id);
      setPaymentInvoiceId("");
      setActiveTab("payments");
      await refreshMine();
      setDashboardNotice({
        title: "Stay renewed",
        message: `Your room remains active through ${nextBillingDate}. Submit the next monthly payment from this tab.`,
        error: false,
      });
    } catch (error) {
      setDashboardNotice({ title: "Stay could not be renewed", message: error.message, error: true });
    } finally {
      setStayActionBusy(false);
    }
  }
  async function confirmMoveOut(booking) {
    setStayActionBusy(true);
    try {
      await studentMoveOutBooking(booking.id);
      setDismissedCyclePromptKeys((keys) => keys.includes(cyclePromptKey(booking)) ? keys : [...keys, cyclePromptKey(booking)]);
      setStayDecisionBookingId(null);
      setBookingDetail(null);
      await Promise.all([refreshMine(), reload()]);
      setDashboardNotice({
        title: "Move-out confirmed",
        message: `${booking.propertyTitle} · ${booking.roomName} is now available for new bookings.`,
        error: false,
      });
    } catch (error) {
      setDashboardNotice({ title: "Move-out could not be confirmed", message: error.message, error: true });
    } finally {
      setStayActionBusy(false);
    }
  }
  const savedProperties = PROPERTIES.filter((p) => savedIds.includes(p.id));
  const filteredBookings = myBookings.filter((booking) => {
    const query = bookingSearch.trim().toLowerCase();
    const status = String(booking.status || "").toLowerCase();
    const matchesSearch = !query ||
      String(booking.propertyTitle || "").toLowerCase().includes(query) ||
      String(booking.roomName || "").toLowerCase().includes(query) ||
      String(booking.roommateName || "").toLowerCase().includes(query) ||
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
        setRoommatePreferenceOverrides({
          sleep: PREF_MAP.sleep[newAnswers.sleep],
          study: PREF_MAP.study[newAnswers.study],
          cleanliness: Number(newAnswers.cleanliness),
          guests: PREF_MAP.guests[newAnswers.guests],
        });
        setQuizDone(true);
      } catch (error) {
        setDashboardNotice({ title: "Preferences could not be saved", message: error.message, error: true });
      }
    }
  }
  async function submitRequest() {
    if (!session?.studentId) return;
    if (!hasCompleteRoommatePreferences) {
      setDashboardNotice({
        title: "Complete the compatibility quiz first",
        message: "All four roommate preferences are needed to create a matching request.",
        error: true,
      });
      return;
    }
    setRequestBusy(true);
    setDashboardNotice(null);
    try {
      await createRoommateMatchRequest();
      await refreshMine();
      setRequestStep("list");
      setDashboardNotice({ title: "Roommate request submitted", message: "A landlord will review your compatibility profile and suggest three same-gender candidates.", error: false });
    } catch (error) {
      setDashboardNotice({ title: "Request could not be sent", message: error.message, error: true });
    } finally {
      setRequestBusy(false);
    }
  }
  async function closeMatchRequest() {
    setRequestBusy(true);
    try {
      await closeRoommateMatchRequest();
      await refreshMine();
      setDashboardNotice({ title: "Roommate request closed", message: "You are no longer available for roommate matching.", error: false });
    } catch (error) {
      setDashboardNotice({ title: "Request could not be closed", message: error.message, error: true });
    } finally {
      setRequestBusy(false);
    }
  }
  async function chooseMatchCandidate(candidate) {
    if (!roommateMatchRequest) return;
    setRequestBusy(true);
    try {
      await chooseRoommateMatchCandidate(roommateMatchRequest.id, candidate.studentId);
      await refreshMine();
      setDashboardNotice({ title: "Roommate selected", message: `${candidate.name} is now your roommate match.`, error: false });
    } catch (error) {
      setDashboardNotice({ title: "Roommate could not be selected", message: error.message, error: true });
    } finally {
      setRequestBusy(false);
    }
  }
  async function respondToBookingInvite(invite, accept) {
    setBookingInviteBusyId(invite.bookingId);
    try {
      await respondToSharedBookingInvite(invite.bookingId, accept);
      await refreshMine();
      setDashboardNotice({
        title: accept ? "Roommate invite accepted" : "Roommate invite declined",
        message: accept
          ? invite.bookingStatus === "Confirmed"
            ? `Sharing starts ${invite.shareStartDate}. Your monthly rent share is ₱${(invite.monthlyRent / 2).toLocaleString()}; your deposit share will be billed, and any excess deposit already paid by the resident becomes a future rent credit.`
            : "The landlord can now review the shared booking. Rent and security deposit will be split equally if it is confirmed."
          : "The booking can continue as a single-student request at the full room price.",
        error: false,
      });
    } catch (error) {
      setDashboardNotice({ title: "Roommate invite could not be updated", message: error.message, error: true });
    } finally {
      setBookingInviteBusyId("");
    }
  }
  async function submitPayment(event) {
    event.preventDefault();
    if (!selectedPaymentBooking || !selectedPaymentInvoice || !paymentReceipt) {
      setDashboardNotice({ title: "Payment details required", message: "Choose an outstanding balance and attach your payment proof.", error: true });
      return;
    }
    if (Number(paymentAmount) > selectedPaymentInvoice.remainingBalance) {
      setDashboardNotice({ title: "Amount exceeds the balance", message: "Enter an amount no greater than the remaining balance for this due item.", error: true });
      return;
    }
    setPaymentBusy(true);
    try {
      await createPayment({
        invoiceId: selectedPaymentInvoice.id,
        amount: paymentAmount,
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
    <div className="student-dashboard dashboard-shell">
      {/* Header */}
      <DashboardHeader
        avatar={(
          <ProfilePhotoUpload
            name={displayName}
            photoUrl={studentProfile.profile_photo_url}
            onUploaded={async (url) => {
              await updateStudentProfile(session.studentId, { profile_photo_url: url });
              onProfilePhotoChange?.(url);
            }}
          />
        )}
        title={(
          <>
            Hi, {displayName}!
            <span className={`ml-2 inline-flex rounded-full px-2 py-0.5 align-middle text-xs font-semibold ${genderBadgeClass}`}>
              {genderLabel(gender)}
            </span>
          </>
        )}
        description={`${studentProfile.academic_year || "Academic year not set"} · ${studentProfile.student_id_number || "Student ID not set"}`}
      />

      {/* Tabs */}
      <DashboardTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        items={[
          { id: "overview", label: "Overview" },
          { id: "payments", label: "Payments" },
          { id: "roommates", label: "Roommate Requests" },
          { id: "saved", label: `Saved (${savedProperties.length})` },
          { id: "quiz", label: "Compatibility Quiz" },
        ]}
      />

      {sharedBookingInvites.length > 0 && (
        <section className="mb-8 space-y-3" aria-labelledby="shared-booking-invites-title">
          <h2 id="shared-booking-invites-title" className="font-display text-xl font-semibold">Roommate booking invitations</h2>
          {sharedBookingInvites.map((invite) => (
            <article key={invite.bookingId} className="rounded-2xl border border-[var(--primary)]/30 bg-[var(--secondary)] p-5">
              <p className="text-sm">
                <span className="font-semibold">{invite.requesterName}</span> invited you to share {invite.propertyTitle} · {invite.roomName}.
              </p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Sharing starts {invite.shareStartDate}. If accepted, your monthly rent share is ₱{(invite.monthlyRent / 2).toLocaleString()} and your security-deposit share is ₱{(invite.securityDeposit / 2).toLocaleString()}.
                {invite.bookingStatus === "Confirmed" ? " Any deposit amount already paid above the resident’s half will be credited toward their future rent." : " The landlord must confirm the booking before billing begins."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => respondToBookingInvite(invite, true)}
                  disabled={bookingInviteBusyId === invite.bookingId}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {bookingInviteBusyId === invite.bookingId ? "Updating…" : "Accept"}
                </button>
                <button
                  type="button"
                  onClick={() => respondToBookingInvite(invite, false)}
                  disabled={bookingInviteBusyId === invite.bookingId}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

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
                  <thead className="bg-[var(--muted)]"><tr>{["Property", "Room", "Move-in / cycle end", "Monthly rent", "Status", "Details"].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{heading}</th>)}</tr></thead>
                  <PaginatedTableBody
                    rows={filteredBookings}
                    columns={6}
                    resetKey={`${bookingSearch}|${bookingStatusFilter}`}
                    emptyMessage="No bookings match your search or status filter."
                    renderRow={(booking) => (
                      <tr key={booking.id} className="hover:bg-[var(--muted)]">
                        <td className="px-4 py-3 font-medium">{booking.propertyTitle}</td>
                        <td className="px-4 py-3">{booking.roomName}</td>
                        <td className="px-4 py-3 text-xs">{studentBookingStartDate(booking, session?.studentId)} → {booking.endDate}</td>
                        <td className="px-4 py-3">
                          ₱{Number(booking.monthlyShare).toLocaleString()}/mo
                          {booking.isShared && <span className="block text-[10px] text-[var(--muted-foreground)]">50% shared rent</span>}
                        </td>
                        <td className="px-4 py-3"><span className="rounded-full bg-[var(--secondary)] px-2.5 py-1 text-xs font-semibold text-[var(--primary)]">{booking.status}</span></td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => setBookingDetail(booking)} className="rounded-lg bg-[var(--secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)]">View details</button>
                            {booking.status === "Confirmed" && booking.studentId === String(session?.studentId) && booking.startDate <= todayDate && (
                              <button type="button" onClick={() => setStayDecisionBookingId(booking.id)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold">Move-out / renew</button>
                            )}
                          </div>
                        </td>
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
                    imageClickNavigates
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
                You can find a roommate before booking a boarding house. Complete the compatibility quiz first, then submit a request.
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
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">Choose an outstanding rent or deposit balance. The amount is filled from your balance; you may pay it in part. Your landlord will review the receipt.</p>
            </div>
            {payableBookings.length === 0 ? (
              <div className="rounded-xl bg-[var(--muted)] p-4 text-sm text-[var(--muted-foreground)]">
                {myBookings.some((booking) => booking.status === "Confirmed")
                  ? "There are no outstanding balances. Pending payments are counted until your landlord reviews them."
                  : "You can submit a payment after a landlord confirms one of your bookings."}
                {myBookings.filter((booking) => booking.status === "Pending").map((booking) => (
                  <p key={booking.id} className="mt-2">{booking.propertyTitle} · {booking.roomName} is awaiting landlord confirmation. The payment form will be available here once approved.</p>
                ))}
              </div>
            ) : (
              <form onSubmit={submitPayment} className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold">
                  Confirmed booking
                  <select value={paymentBookingId} onChange={(event) => setPaymentBookingId(event.target.value)} className="mt-1 block w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm font-normal">
                    {payableBookings.map((booking) => (
                      <option key={booking.id} value={booking.id}>
                        {booking.propertyTitle} · {booking.roomName}{booking.isShared ? " · shared" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold">
                  Outstanding item
                  <select value={paymentInvoiceId} onChange={(event) => setPaymentInvoiceId(event.target.value)} className="mt-1 block w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm font-normal">
                    {payableInvoices.map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.paymentType} · {invoice.periodStart}–{invoice.periodEnd} · ₱{invoice.remainingBalance.toLocaleString()} remaining
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold">
                  Amount to pay (₱)
                  <input type="number" min="0.01" max={selectedPaymentInvoice?.remainingBalance} step="0.01" required value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="mt-1 block w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm font-normal" />
                  {selectedPaymentInvoice && (
                    <span className="mt-1 block font-normal text-[var(--muted-foreground)]">
                      Remaining: ₱{selectedPaymentInvoice.remainingBalance.toLocaleString()} (includes payments awaiting review)
                    </span>
                  )}
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
          <div className="rounded-xl border border-[var(--primary)]/15 bg-[var(--secondary)] p-4 text-sm text-[var(--primary)]">
            You do not need a boarding house booking to apply. Complete the compatibility quiz first; landlords suggest three same-gender candidates, then you choose one.
          </div>

          {requestStep === "list" && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-xl font-semibold">Your roommate match</h2>
                <button
                  type="button"
                  onClick={() => refreshMine()}
                  className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold"
                >
                  Refresh
                </button>
              </div>

              {roommateMatchRequest?.selectedStudent ? (
                <article className="rounded-2xl border border-[var(--primary)] bg-[var(--card)] p-5">
                  <h3 className="font-semibold">You chose your roommate</h3>
                  <div className="mt-4 flex items-center gap-3">
                    {roommateMatchRequest.selectedStudent.profilePhotoUrl
                      ? <img src={roommateMatchRequest.selectedStudent.profilePhotoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
                      : <div aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--secondary)] font-semibold text-[var(--primary)]">{roommateMatchRequest.selectedStudent.name?.charAt(0) || "S"}</div>}
                    <div className="flex-1">
                      <p className="font-semibold">{roommateMatchRequest.selectedStudent.name}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{roommateMatchRequest.selectedStudent.gender} · Same-gender match</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!onStartChat) return onNavigate("chat");
                        onStartChat({
                          accountId: roommateMatchRequest.selectedStudent.accountId,
                          name: roommateMatchRequest.selectedStudent.name,
                          profilePhotoUrl: roommateMatchRequest.selectedStudent.profilePhotoUrl,
                          propertyTitle: "Roommate match",
                          role: "student",
                        });
                      }}
                      className="rounded-xl bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white"
                    >
                      Message
                    </button>
                  </div>
                </article>
              ) : roommateMatchRequest?.isOpen ? (
                <article className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">Your request is active</h3>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        Your compatibility profile is shared with landlords for same-gender matching.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeMatchRequest}
                      disabled={requestBusy}
                      className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold disabled:opacity-50"
                    >
                      {requestBusy ? "Please wait…" : "Cancel request"}
                    </button>
                  </div>
                  {roommateMatchCandidates.length === 0 ? (
                    <p className="rounded-xl bg-[var(--muted)] p-4 text-sm text-[var(--muted-foreground)]">
                      Waiting for a landlord to suggest three compatible {gender === "Female" ? "female" : "male"} candidates.
                    </p>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {roommateMatchCandidates.map((candidate) => (
                        <article key={candidate.studentId} className="rounded-xl border border-[var(--border)] p-4">
                          <div className="flex items-center gap-3">
                            {candidate.profilePhotoUrl
                              ? <img src={candidate.profilePhotoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                              : <div aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--secondary)] font-semibold text-[var(--primary)]">{candidate.name?.charAt(0) || "S"}</div>}
                            <div className="min-w-0 flex-1">
                              <h4 className="truncate text-sm font-semibold">{candidate.name}</h4>
                              <p className="text-xs text-[var(--muted-foreground)]">{candidate.gender}{candidate.academicYear ? ` · ${candidate.academicYear}` : ""}</p>
                            </div>
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">{candidate.compatibilityScore}%</span>
                          </div>
                          <p className="mt-3 text-xs text-[var(--muted-foreground)]">{roommatePreferenceSummary(candidate.preferences).join(" · ")}</p>
                          <button
                            type="button"
                            onClick={() => chooseMatchCandidate(candidate)}
                            disabled={requestBusy}
                            className="mt-4 w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            Choose as roommate
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </article>
              ) : (
                <article className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                  <h3 className="font-semibold">{roommateMatchRequest ? "Your previous request is closed" : "No active roommate request"}</h3>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    Submit your compatibility profile to let a landlord suggest three same-gender candidates.
                  </p>
                  <button
                    type="button"
                    onClick={() => setRequestStep("form")}
                    className="mt-4 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Request a roommate
                  </button>
                </article>
              )}
            </section>
          )}

          {requestStep === "form" && (
            <section className="mx-auto max-w-2xl space-y-4">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setRequestStep("list")} className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                  ← Back
                </button>
                <h2 className="font-display text-xl font-semibold">Request a Roommate</h2>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                <p className="text-sm text-[var(--muted-foreground)]">
                  Your saved habits are used to calculate compatibility. A landlord will choose three candidates with the same gender as you, and you will choose your preferred match.
                </p>
                {hasCompleteRoommatePreferences ? (
                  <>
                    <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                      {[
                        ["Sleep schedule", ROOMMATE_PREFERENCE_LABELS.sleep[roommatePreferences.sleep]],
                        ["Study habits", ROOMMATE_PREFERENCE_LABELS.study[roommatePreferences.study]],
                        ["Cleanliness", ROOMMATE_PREFERENCE_LABELS.cleanliness[roommatePreferences.cleanliness]],
                        ["Guest policy", ROOMMATE_PREFERENCE_LABELS.guests[roommatePreferences.guests]],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl bg-[var(--muted)] p-3">
                          <dt className="text-xs text-[var(--muted-foreground)]">{label}</dt>
                          <dd className="mt-1 text-sm font-medium">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-4 text-xs text-[var(--muted-foreground)]">
                      Matching is strictly same-gender: female students are matched with female students, and male students with male students.
                    </p>
                    <button
                      type="button"
                      onClick={submitRequest}
                      disabled={requestBusy || !session?.studentId || !gender}
                      className="mt-5 w-full rounded-xl bg-[var(--primary)] py-3 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      {requestBusy ? "Submitting…" : "Submit roommate request"}
                    </button>
                  </>
                ) : (
                  <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                    <p>Complete all four compatibility quiz questions before requesting a roommate.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setRequestStep("list");
                        setActiveTab("quiz");
                      }}
                      className="mt-3 rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white"
                    >
                      Complete compatibility quiz
                    </button>
                  </div>
                )}
              </div>
            </section>
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

      {stayDecisionBooking && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="student-stay-decision-title">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="student-stay-decision-title" className="font-display text-xl font-semibold">
                  {stayDecisionBooking.endDate <= todayDate ? "Your billing cycle is ending" : "Choose what happens next"}
                </h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">{stayDecisionBooking.propertyTitle} · {stayDecisionBooking.roomName}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDismissedCyclePromptKeys((keys) => keys.includes(cyclePromptKey(stayDecisionBooking)) ? keys : [...keys, cyclePromptKey(stayDecisionBooking)]);
                  setStayDecisionBookingId(null);
                }}
                aria-label="Decide later"
                className="rounded-full px-2 py-1 text-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                ×
              </button>
            </div>
            <p className="mt-4 text-sm">
              Your current monthly cycle ends on <strong>{stayDecisionBooking.endDate}</strong>. Renew to keep your room active, or confirm your move-out to release it.
            </p>
            <div className="mt-5 grid gap-2">
              <button
                type="button"
                onClick={() => continueStay(stayDecisionBooking)}
                disabled={stayActionBusy || !stayRenewalAvailable}
                className="rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {stayActionBusy ? "Updating stay…" : "Continue Payment / Renew Stay"}
              </button>
              <button
                type="button"
                onClick={() => confirmMoveOut(stayDecisionBooking)}
                disabled={stayActionBusy}
                className="rounded-xl border border-red-300 px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-50"
              >
                Confirm Move-Out
              </button>
            </div>
            <p className="mt-3 text-xs text-[var(--muted-foreground)]">
              {stayRenewalAvailable
                ? "Renewing extends the monthly cycle and opens the payment form. Moving out ends your stay today and makes the room available."
                : "Renewal becomes available during the final seven days of this cycle. You can still confirm move-out now."}
            </p>
          </div>
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
                ...(bookingDetail.isShared ? [
                  ["Your monthly rent share", `₱${Number(bookingDetail.monthlyShare).toLocaleString()}`],
                ] : []),
                ...(bookingDetail.hasRoommate ? [
                  ["Your security deposit share", `₱${Number(bookingDetail.securityDepositShare).toLocaleString()}`],
                ] : []),
                ...(bookingDetail.hasRoommate && !bookingDetail.isShared
                  ? [["Rent sharing starts", bookingDetail.roommateStartDate]]
                  : []),
                ...(bookingDetail.roommateStudentId ? [["Roommate", bookingDetail.roommateName || "Your matched roommate"]] : []),
                ...(bookingDetail.roommateInviteStatus === "Pending" ? [["Roommate invitation", "Waiting for acceptance"]] : []),
                ["Move-in date", studentBookingStartDate(bookingDetail, session?.studentId)],
                ["Current billing cycle ends", bookingDetail.endDate],
              ].map(([label, value]) => <div key={label}><div className="text-xs text-[var(--muted-foreground)]">{label}</div><div className="mt-1 text-sm font-medium">{value}</div></div>)}
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--muted)] px-5 py-3">
              <button type="button" onClick={() => setBookingDetail(null)} className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-semibold">Close</button>
              {bookingDetail.status === "Pending" && bookingDetail.studentId === String(session?.studentId) && (
                <button type="button" onClick={() => cancelBooking(bookingDetail)} className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white">Cancel booking</button>
              )}
              {bookingDetail.status === "Confirmed" && bookingDetail.studentId === String(session?.studentId) && bookingDetail.startDate <= todayDate && (
                <button
                  type="button"
                  onClick={() => {
                    setStayDecisionBookingId(bookingDetail.id);
                    setBookingDetail(null);
                  }}
                  className="rounded-xl bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white"
                >
                  Move-out / renewal options
                </button>
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

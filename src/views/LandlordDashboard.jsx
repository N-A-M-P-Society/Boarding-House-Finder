import { useEffect, useState } from "react";
import { useData } from "../context/DataContext.jsx";
import { supabase } from "../lib/supabase.js";
import ProfilePhotoUpload from "../components/ProfilePhotoUpload.jsx";
import PaginatedTableBody from "../components/PaginatedTableBody.jsx";
import {
  createRoom,
  completeBooking,
  fetchBookings,
  fetchPayments,
  getPaymentProofUrl,
  setPaymentStatus,
  setBookingStatus,
  updateLandlordProfile,
  updateHouse,
  updateRoom,
  uploadPublicImages,
  uploadVerificationDocuments,
  submitVerification,
  fetchLatestLandlordVerification,
  fetchLandlordRoommateMatchRequests,
  fetchRoommateMatchCandidates,
  setRoommateMatchCandidates as saveRoommateMatchCandidates,
} from "../lib/api.js";
import { AMENITY_ENUM, AMENITY_LABELS } from "../lib/mappers.js";
import AddListingModal from "../components/AddListingModal.jsx";
import DashboardHeader from "../components/DashboardHeader.jsx";
import DashboardTabBar from "../components/DashboardTabBar.jsx";
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const ROOMMATE_PREFERENCE_LABELS = {
  sleep: { 1: "Early sleeper", 2: "Flexible sleep schedule", 3: "Night owl" },
  study: { 1: "Quiet study", 2: "Background music", 3: "Group study" },
  cleanliness: { 1: "Very clean", 2: "Very clean", 3: "Organized chaos", 4: "Generally tidy", 5: "Spotless" },
  guests: { 1: "No guests", 2: "Occasional guests", 3: "Frequent guests" },
};
function AvailabilityCalendar({ rooms, bookings, onEvent }) {
  const statusClasses = {
    available: "bg-emerald-100 text-emerald-700",
    reserved: "bg-amber-100 text-amber-700",
    occupied: "bg-red-100 text-red-700",
  };
  function bookingForMonth(roomId, monthIndex) {
    const year = new Date().getFullYear();
    const monthStart = new Date(year, monthIndex, 1);
    const nextMonthStart = new Date(year, monthIndex + 1, 1);
    return bookings.find((booking) => {
      if (booking.roomId !== roomId || ["cancelled", "completed"].includes(booking.status.toLowerCase())) return false;
      const start = new Date(`${booking.startDate}T00:00:00`);
      const end = new Date(`${booking.endDate}T00:00:00`);
      return start < nextMonthStart && (booking.openEnded || end > monthStart);
    });
  }
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[59rem]">
        <div className="grid grid-cols-[minmax(7rem,1.2fr)_repeat(12,minmax(4rem,1fr))] gap-1">
          <div className="py-1 text-xs font-medium text-[var(--muted-foreground)]">Room</div>
          {MONTHS.map((month) => (
            <div key={month} className="py-1 text-center text-xs font-medium text-[var(--muted-foreground)]">
              {month}
            </div>
          ))}
        </div>
        {rooms.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
            Add a room to one of your listings to see it on the calendar.
          </p>
        ) : rooms.map((room) => (
          <div key={room.id} className="grid grid-cols-[minmax(7rem,1.2fr)_repeat(12,minmax(4rem,1fr))] items-center gap-1 border-t border-[var(--border)] py-2">
            <div className="truncate px-1 text-xs font-medium" title={`${room.name} · ${room.propertyTitle}`}>
              <span className="block truncate">{room.name}</span>
              <span className="block truncate text-[10px] font-normal text-[var(--muted-foreground)]">{room.propertyTitle}</span>
            </div>
            {MONTHS.map((month, monthIndex) => {
              const booking = bookingForMonth(room.id, monthIndex);
              const status = booking
                ? booking.status.toLowerCase() === "confirmed" ? "occupied" : "reserved"
                : room.status;
              return (
                <button
                  key={month}
                  type="button"
                  onClick={() => booking && onEvent(room, status, month, booking)}
                  disabled={!booking}
                  className={`flex h-12 min-w-0 flex-col items-center justify-center rounded-lg border border-[var(--border)] text-[9px] font-semibold uppercase ${booking ? "transition-colors hover:ring-2 hover:ring-[var(--ring)]" : "cursor-default"} ${statusClasses[status] || statusClasses.available}`}
                  aria-label={`${room.name}, ${month} ${new Date().getFullYear()}: ${status}${booking ? `, booked by ${booking.studentName}` : ""}`}
                  title={`${month} ${new Date().getFullYear()} · ${status}${booking ? ` · ${booking.studentName}` : ""}`}
                >
                  <span>{status}</span>
                  {booking && <span className="block max-w-full truncate px-1 text-[8px] font-medium normal-case">{booking.studentName}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
export default function LandlordDashboard({ onNavigate, displayName, session, onProfilePhotoChange }) {
  const { properties: PROPERTIES, reload } = useData();
  const [bookings, setBookings] = useState([]);
  const [payments, setPayments] = useState([]);
  const [selectedPaymentReview, setSelectedPaymentReview] = useState(null);
  const [rejectingPayment, setRejectingPayment] = useState(false);
  const [paymentReviewReason, setPaymentReviewReason] = useState("");
  const [paymentBusyId, setPaymentBusyId] = useState("");
  const [paymentProofLinks, setPaymentProofLinks] = useState({});
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingStatusFilter, setBookingStatusFilter] = useState("all");
  const [bookingDetail, setBookingDetail] = useState(null);
  const [bookingNotice, setBookingNotice] = useState(null);
  const [roommateMatchRequests, setRoommateMatchRequests] = useState([]);
  const [roommateCandidates, setRoommateCandidates] = useState([]);
  const [selectedRoommateRequestId, setSelectedRoommateRequestId] = useState("");
  const [selectedRoommateCandidateIds, setSelectedRoommateCandidateIds] = useState([]);
  const [roommateMatchBusy, setRoommateMatchBusy] = useState(false);
  const [moveOutDate, setMoveOutDate] = useState("");
  const [moveOutBusy, setMoveOutBusy] = useState(false);
  const [listingSearch, setListingSearch] = useState("");
  const [listingStatusFilter, setListingStatusFilter] = useState("all");
  const [listingDetail, setListingDetail] = useState(null);
  const [listingPhotoFiles, setListingPhotoFiles] = useState([]);
  const [listingPhotoBusy, setListingPhotoBusy] = useState(false);
  const [listingPhotoError, setListingPhotoError] = useState("");
  const [roomEditId, setRoomEditId] = useState("");
  const [roomEditForm, setRoomEditForm] = useState(null);
  const [roomEditMode, setRoomEditMode] = useState("");
  const [roomEditPhotoFiles, setRoomEditPhotoFiles] = useState([]);
  const [roomEditBusy, setRoomEditBusy] = useState(false);
  const [roomEditError, setRoomEditError] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(session?.landlord?.profile_photo_url || "");
  const [landlordVerification, setLandlordVerification] = useState(null);
  const [governmentIdFile, setGovernmentIdFile] = useState(null);
  const [ownershipProofFile, setOwnershipProofFile] = useState(null);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const verificationDocumentsStored = Boolean(
    landlordVerification?.government_id_url &&
    landlordVerification?.proof_of_ownership_url &&
    [landlordVerification.government_id_url, landlordVerification.proof_of_ownership_url]
      .every((path) => path.startsWith("verification/") || /^https:\/\//i.test(path))
  );
  const [addOpen, setAddOpen] = useState(false);
  const today = new Date();
  const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  async function refreshBookings() {
    try {
      setBookings(await fetchBookings());
      return "";
    } catch (error) {
      setBookingNotice({ title: "Bookings could not be loaded", message: error.message, error: true });
      return error.message;
    }
  }
  async function refreshPayments() {
    try {
      setPayments(await fetchPayments());
      return "";
    } catch (error) {
      setBookingNotice({ title: "Payments could not be loaded", message: error.message, error: true });
      return error.message;
    }
  }
  async function refreshRoommateMatchRequests() {
    try {
      setRoommateMatchRequests(await fetchLandlordRoommateMatchRequests());
    } catch (error) {
      setBookingNotice({ title: "Roommate requests could not be loaded", message: error.message, error: true });
    }
  }
  async function openRoommateCandidatePicker(request) {
    setSelectedRoommateRequestId(request.id);
    setRoommateCandidates([]);
    setSelectedRoommateCandidateIds([]);
    setRoommateMatchBusy(true);
    try {
      const candidates = await fetchRoommateMatchCandidates(request.id);
      setRoommateCandidates(candidates);
      setSelectedRoommateCandidateIds(candidates.filter((candidate) => candidate.isNominated).map((candidate) => candidate.studentId));
    } catch (error) {
      setBookingNotice({ title: "Matching candidates could not be loaded", message: error.message, error: true });
      setSelectedRoommateRequestId("");
    } finally {
      setRoommateMatchBusy(false);
    }
  }
  async function submitRoommateCandidates() {
    if (selectedRoommateCandidateIds.length !== 3) {
      setBookingNotice({ title: "Choose three candidates", message: "Select exactly three same-gender candidates for this student.", error: true });
      return;
    }
    setRoommateMatchBusy(true);
    try {
      await saveRoommateMatchCandidates(selectedRoommateRequestId, selectedRoommateCandidateIds);
      await refreshRoommateMatchRequests();
      setBookingNotice({ title: "Candidates sent", message: "The student can now review and choose one of the three suggestions.", error: false });
    } catch (error) {
      setBookingNotice({ title: "Candidates could not be saved", message: error.message, error: true });
    } finally {
      setRoommateMatchBusy(false);
    }
  }
  async function reviewPayment(payment, status) {
    const reason = paymentReviewReason;
    if (status === "Failed" && !reason.trim()) {
      setBookingNotice({ title: "Rejection reason required", message: "Explain why this payment could not be accepted.", error: true });
      return;
    }
    setPaymentBusyId(payment.id);
    try {
      await setPaymentStatus(payment.id, status, reason);
      const refreshError = await refreshPayments();
      const action = status === "Verified" ? "accepted" : "rejected";
      setBookingNotice({
        title: `Payment ${action}`,
        message: `${payment.studentName}'s ${payment.paymentType.toLowerCase()} payment for ${payment.propertyTitle} was ${action}.${refreshError ? ` Payment list could not be refreshed: ${refreshError}` : ""}`,
        error: Boolean(refreshError),
      });
      setSelectedPaymentReview(null);
      setRejectingPayment(false);
      setPaymentReviewReason("");
    } catch (error) {
      setBookingNotice({ title: "Payment review failed", message: error.message, error: true });
    } finally {
      setPaymentBusyId("");
    }
  }
  function closePaymentReview() {
    if (paymentBusyId) return;
    setSelectedPaymentReview(null);
    setRejectingPayment(false);
    setPaymentReviewReason("");
  }
  async function loadPaymentProof(payment) {
    try {
      const url = await getPaymentProofUrl(payment.receiptPath);
      setPaymentProofLinks((current) => ({ ...current, [payment.id]: url }));
    } catch (error) {
      setBookingNotice({ title: "Receipt could not be opened", message: error.message, error: true });
    }
  }
  async function updateBookingStatus(booking, status) {
    if (status === "Confirmed" && booking.roommateInviteStatus === "Pending") {
      setBookingNotice({ title: "Waiting for roommate", message: "The invited student must accept before a shared booking can be confirmed.", error: true });
      return;
    }
    try {
      await setBookingStatus(booking.id, status);
      const refreshError = await refreshBookings();
      setBookingDetail(null);
      const action = status === "Confirmed" ? "confirmed" : booking.status === "Confirmed" ? "cancelled" : "declined";
      setBookingNotice({
        title: `Booking ${action}`,
        message: `${booking.studentName}'s booking for ${booking.roomName} was ${action}.${refreshError ? ` The booking list could not be refreshed: ${refreshError}` : ""}`,
        error: Boolean(refreshError),
      });
    } catch (error) {
      setBookingNotice({ title: "Booking update failed", message: error.message, error: true });
    }
  }
  async function markBookingVacated(booking) {
    if (!moveOutDate || moveOutDate < booking.startDate || moveOutDate > todayDate) {
      setBookingNotice({ title: "Move-out date is invalid", message: "Choose a date between the booking start date and today.", error: true });
      return;
    }

    setMoveOutBusy(true);
    try {
      await completeBooking(booking.id, moveOutDate);
      const bookingsRefreshError = await refreshBookings();
      let listingsRefreshError = "";
      try {
        await reload();
      } catch (error) {
        listingsRefreshError = error.message;
      }
      setBookingDetail(null);
      const refreshErrors = [bookingsRefreshError, listingsRefreshError].filter(Boolean);
      setBookingNotice({
        title: refreshErrors.length === 0 ? "Room marked as vacated" : "Move-out date saved",
        message: `The room is available for new bookings starting ${moveOutDate}.${refreshErrors.length === 0 ? "" : ` Dashboard refresh failed: ${refreshErrors.join("; ")}`}`,
        error: refreshErrors.length > 0,
      });
    } catch (error) {
      setBookingNotice({ title: "Could not release the room", message: error.message, error: true });
    } finally {
      setMoveOutBusy(false);
    }
  }
  useEffect(() => {
    refreshBookings();
    refreshPayments();
  }, [session?.landlordId]);
  useEffect(() => {
    if (!session?.accountId) return;
    const channel = supabase
      .channel(`landlord-payments-${session.accountId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
        refreshPayments();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accountId]);
  useEffect(() => {
    if (!session?.landlordId) return;
    fetchLatestLandlordVerification()
      .then(setLandlordVerification)
      .catch((error) => setBookingNotice({ title: "Verification status could not be loaded", message: error.message, error: true }));
  }, [session?.landlordId]);
  useEffect(() => {
    setListingPhotoFiles([]);
    setListingPhotoError("");
    setRoomEditId("");
    setRoomEditForm(null);
    setRoomEditMode("");
    setRoomEditPhotoFiles([]);
    setRoomEditError("");
  }, [listingDetail?.id]);
  function chooseListingPhotos(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length > 8) {
      setListingPhotoError("Choose no more than 8 photos at a time.");
      setListingPhotoFiles([]);
      return;
    }
    const invalidFile = files.find((file) =>
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024
    );
    if (invalidFile) {
      setListingPhotoError(`${invalidFile.name} must be a JPG, PNG, or WebP image no larger than 8 MB.`);
      setListingPhotoFiles([]);
      return;
    }
    setListingPhotoError("");
    setListingPhotoFiles(files);
  }
  async function addListingPhotos() {
    if (!listingDetail || listingPhotoFiles.length === 0) return;
    setListingPhotoBusy(true);
    setListingPhotoError("");
    try {
      const uploadedImages = await uploadPublicImages(listingPhotoFiles, "listings");
      const currentImages = (listingDetail.images || []).filter((image) => typeof image === "string" && !image.startsWith("data:"));
      const image_urls = [...currentImages, ...uploadedImages];
      await updateHouse(listingDetail.id, { image_urls });
      setListingDetail({ ...listingDetail, images: image_urls });
      setListingPhotoFiles([]);
      await reload();
    } catch (error) {
      setListingPhotoError(error.message);
    } finally {
      setListingPhotoBusy(false);
    }
  }
  function startRoomEdit(room) {
    const amenityValues = Object.fromEntries(
      Object.entries(AMENITY_LABELS).map(([value, label]) => [label, value])
    );
    setRoomEditMode("edit");
    setRoomEditId(room.id);
    setRoomEditForm({
      roomNumber: room.name || "",
      monthlyRate: String(room.price ?? ""),
      securityDeposit: String(room.securityDeposit ?? 0),
      capacity: String(room.capacity ?? 1),
      amenities: (room.amenities || []).map((amenity) => amenityValues[amenity] || amenity),
      images: [...(room.images || [])],
    });
    setRoomEditPhotoFiles([]);
    setRoomEditError("");
  }
  function startRoomAdd() {
    setRoomEditMode("add");
    setRoomEditId("");
    setRoomEditForm({
      roomNumber: "",
      monthlyRate: "",
      securityDeposit: "0",
      capacity: "1",
      amenities: [],
      images: [],
    });
    setRoomEditPhotoFiles([]);
    setRoomEditError("");
  }
  function chooseRoomEditPhotos(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!roomEditForm) return;
    if (files.length + roomEditForm.images.length > 8) {
      setRoomEditError("A room can have no more than 8 photos.");
      setRoomEditPhotoFiles([]);
      return;
    }
    const invalidFile = files.find((file) =>
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024
    );
    if (invalidFile) {
      setRoomEditError(`${invalidFile.name} must be a JPG, PNG, or WebP image no larger than 8 MB.`);
      setRoomEditPhotoFiles([]);
      return;
    }
    setRoomEditError("");
    setRoomEditPhotoFiles(files);
  }
  async function saveRoomEdit() {
    if (!listingDetail || !roomEditForm || (roomEditMode === "edit" && !roomEditId)) return;
    const monthlyRate = Number(roomEditForm.monthlyRate);
    const securityDeposit = roomEditForm.securityDeposit === "" ? 0 : Number(roomEditForm.securityDeposit);
    const capacity = Number(roomEditForm.capacity);
    if (
      !roomEditForm.roomNumber.trim()
      || roomEditForm.monthlyRate === ""
      || !Number.isFinite(monthlyRate)
      || monthlyRate < 0
      || !Number.isFinite(securityDeposit)
      || securityDeposit < 0
      || !Number.isInteger(capacity)
      || capacity < 1
    ) {
      setRoomEditError("Enter a room name, valid rates, and a capacity of at least one.");
      return;
    }

    setRoomEditBusy(true);
    setRoomEditError("");
    try {
      const addedImages = await uploadPublicImages(roomEditPhotoFiles, "listings");
      const imageUrls = [...roomEditForm.images, ...addedImages];
      const roomValues = {
        roomNumber: roomEditForm.roomNumber.trim(),
        monthlyRate,
        securityDeposit,
        capacity,
        amenities: roomEditForm.amenities,
        images: imageUrls,
      };
      let updatedRoomId = roomEditId;
      if (roomEditMode === "add") {
        updatedRoomId = await createRoom(listingDetail.id, roomValues);
      } else {
        await updateRoom(roomEditId, {
          room_number: roomValues.roomNumber,
          monthly_rate: roomValues.monthlyRate,
          security_deposit: roomValues.securityDeposit,
          capacity: roomValues.capacity,
          amenities: roomValues.amenities,
          image_urls: imageUrls,
        });
      }
      const roomForView = {
        id: updatedRoomId,
        name: roomValues.roomNumber,
        price: monthlyRate,
        securityDeposit,
        capacity,
        status: "available",
        amenities: roomEditForm.amenities.map((amenity) => AMENITY_LABELS[amenity] || amenity),
        images: imageUrls,
      };
      setListingDetail((current) => {
        if (!current) return current;
        const updatedRooms = roomEditMode === "add"
          ? [...current.rooms, roomForView]
          : current.rooms.map((room) => room.id === roomEditId ? { ...room, ...roomForView } : room);
        return {
          ...current,
          rooms: updatedRooms,
          monthlyRent: Math.min(...updatedRooms.map((room) => Number(room.price) || 0)),
        };
      });
      setRoomEditId("");
      setRoomEditForm(null);
      setRoomEditMode("");
      setRoomEditPhotoFiles([]);
      await reload();
    } catch (error) {
      setRoomEditError(error.message);
    } finally {
      setRoomEditBusy(false);
    }
  }
  async function submitLandlordVerification(event) {
    event.preventDefault();
    if (!governmentIdFile || !ownershipProofFile) {
      setVerificationError("Attach both your government-issued ID and property ownership proof.");
      return;
    }

    setVerificationBusy(true);
    setVerificationError("");
    try {
      const [governmentIdPath, ownershipProofPath] = await uploadVerificationDocuments([governmentIdFile, ownershipProofFile]);
      await submitVerification({ governmentIdPath, ownershipProofPath });
      setLandlordVerification(await fetchLatestLandlordVerification());
      setGovernmentIdFile(null);
      setOwnershipProofFile(null);
    } catch (error) {
      setVerificationError(error.message);
    } finally {
      setVerificationBusy(false);
    }
  }
  const [activeTab, setActiveTab] = useState("overview");
  useEffect(() => {
    if (activeTab === "roommates" && session?.landlordId) refreshRoommateMatchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, session?.landlordId]);
  const [selectedCalendarPropertyId, setSelectedCalendarPropertyId] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("all");
  const [roomDetail, setRoomDetail] = useState(null);
  const myProperties = PROPERTIES.filter((p) => p.landlordId === String(session?.landlordId));
  const myBookings = bookings.filter((booking) => myProperties.some((property) => property.id === booking.propertyId));
  const myPayments = payments.filter((payment) => payment.landlordId === String(session?.landlordId));
  const currentPaymentReview = selectedPaymentReview
    ? payments.find((payment) => payment.id === selectedPaymentReview.id) || selectedPaymentReview
    : null;
  const selectedCalendarProperty = myProperties.find((property) => property.id === selectedCalendarPropertyId) || myProperties[0];
  const calendarRooms = selectedCalendarProperty
    ? selectedCalendarProperty.rooms.map((room) => ({ ...room, propertyTitle: selectedCalendarProperty.title }))
    : [];
  const selectedCalendarRoom = calendarRooms.find((room) => room.id === selectedRoom);
  const visibleCalendarRooms = selectedRoom === "all"
    ? calendarRooms
    : [selectedCalendarRoom || calendarRooms[0]].filter(Boolean);
  const totalRooms = myProperties.flatMap((p) => p.rooms).length;
  const currentlyBookedRoomIds = new Set(bookings
    .filter((booking) =>
      ["Pending", "Confirmed"].includes(booking.status) &&
      booking.startDate <= todayDate &&
      (booking.openEnded || todayDate < booking.endDate)
    )
    .map((booking) => booking.roomId));
  const availableRooms = myProperties.flatMap((property) => property.rooms)
    .filter((room) => room.status === "available" && !currentlyBookedRoomIds.has(room.id)).length;
  const filteredBookings = myBookings.filter((booking) => {
    const query = bookingSearch.trim().toLowerCase();
    const matchesSearch = !query ||
      String(booking.studentName || "").toLowerCase().includes(query) ||
      String(booking.roommateName || "").toLowerCase().includes(query) ||
      String(booking.propertyTitle || "").toLowerCase().includes(query) ||
      String(booking.roomName || "").toLowerCase().includes(query);
    return matchesSearch && (bookingStatusFilter === "all" || String(booking.status).toLowerCase() === bookingStatusFilter);
  });
  const filteredProperties = myProperties.filter((property) => {
    const query = listingSearch.trim().toLowerCase();
    const matchesSearch = !query ||
      property.title.toLowerCase().includes(query) ||
      String(property.address || "").toLowerCase().includes(query);
    return matchesSearch && (listingStatusFilter === "all" || property.status === listingStatusFilter);
  });
  const roomBeingEdited = listingDetail?.rooms.find((room) => room.id === roomEditId);
  return (
    <div className="landlord-dashboard dashboard-shell">
      {/* Header */}
      <DashboardHeader
        avatar={(
          <ProfilePhotoUpload
            name={displayName}
            photoUrl={profilePhotoUrl}
            onUploaded={async (url) => {
              await updateLandlordProfile(session.landlordId, { profile_photo_url: url });
              setProfilePhotoUrl(url);
              onProfilePhotoChange?.(url);
            }}
          />
        )}
        title={displayName}
        description={`Landlord · ${myProperties.length} propert${myProperties.length === 1 ? "y" : "ies"}`}
        action={(
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 rounded-xl bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 sm:px-4 sm:py-2.5 sm:text-sm">
            + Add Listing
          </button>
        )}
      />

      {landlordVerification?.verification_status === "Approved" || (landlordVerification?.verification_status === "Pending" && verificationDocumentsStored) ? (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <span className={`mt-0.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${landlordVerification.verification_status === "Approved" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
            {landlordVerification.verification_status}
          </span>
          <p className="text-sm text-[var(--muted-foreground)]">
            {landlordVerification.verification_status === "Approved"
              ? "Your landlord documents have been approved."
              : "Your landlord documents are being reviewed. You can continue managing your listings while they are reviewed."}
          </p>
        </div>
      ) : (
        <form onSubmit={submitLandlordVerification} className="mb-6 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div>
            <h2 className="font-display text-lg font-semibold">Complete landlord verification</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">Upload a government-issued ID and property ownership proof. These files are stored privately and only you and UniRent admins can access them.</p>
            {landlordVerification?.rejection_reason && <p className="mt-2 rounded-xl bg-red-50 p-3 text-xs text-red-700">Previous submission: {landlordVerification.rejection_reason}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm">
              <span className="mb-2 block font-semibold">Government-issued ID</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setGovernmentIdFile(event.target.files?.[0] || null)} className="w-full text-xs" />
              <span className="mt-1 block text-xs text-[var(--muted-foreground)]">{governmentIdFile?.name || "Image or PDF · maximum 10 MB"}</span>
            </label>
            <label className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm">
              <span className="mb-2 block font-semibold">Property ownership proof</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setOwnershipProofFile(event.target.files?.[0] || null)} className="w-full text-xs" />
              <span className="mt-1 block text-xs text-[var(--muted-foreground)]">{ownershipProofFile?.name || "Image or PDF · maximum 10 MB"}</span>
            </label>
          </div>
          {verificationError && <p role="alert" className="text-sm text-red-600">{verificationError}</p>}
          <button type="submit" disabled={verificationBusy || !governmentIdFile || !ownershipProofFile} className="rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
            {verificationBusy ? "Uploading documents…" : "Submit for verification"}
          </button>
        </form>
      )}

      {/* Tabs */}
      <DashboardTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        items={[
          { id: "overview", label: "Overview" },
          { id: "listings", label: "My Listings" },
          { id: "payments", label: "Payments" },
          { id: "calendar", label: "Calendar" },
          { id: "roommates", label: "Roommate Requests" },
        ]}
      />

      {/* ── Overview ── */}
      {activeTab === "overview" && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: "Properties", value: myProperties.length, icon: "🏠", color: "bg-[var(--secondary)] text-[var(--primary)]" },
              { label: "Total Rooms", value: totalRooms, icon: "🚪", color: "bg-amber-50 text-amber-700" },
              { label: "Available Rooms", value: availableRooms, icon: "✅", color: "bg-emerald-50 text-emerald-700" },
            ].map((stat) => (
              <div key={stat.label} className={`rounded-2xl border border-[var(--border)] p-4 ${stat.color}`}>
                <div className="text-2xl mb-1">{stat.icon}</div>
                <div className="font-display text-2xl font-bold">{stat.value}</div>
                <div className="text-xs font-medium opacity-75 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="space-y-6">
            <section className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-display text-xl font-semibold">Booking Requests</h2>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">{filteredBookings.length} of {myBookings.length} bookings for your listings</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input type="search" value={bookingSearch} onChange={(event) => setBookingSearch(event.target.value)} placeholder="Search student, property, room" aria-label="Search booking requests" className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" />
                  <select value={bookingStatusFilter} onChange={(event) => setBookingStatusFilter(event.target.value)} aria-label="Filter booking requests by status" className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
                    <option value="all">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
                <table className="w-full min-w-[48rem] text-sm">
                  <thead className="bg-[var(--muted)]"><tr>{["Student", "Property / room", "Move-in / cycle end", "Rent", "Status", "Details"].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{heading}</th>)}</tr></thead>
                  <PaginatedTableBody
                    rows={filteredBookings}
                    columns={6}
                    resetKey={`${bookingSearch}|${bookingStatusFilter}`}
                    emptyMessage={myBookings.length ? "No bookings match your search or status filter." : "No booking requests for your listings."}
                    renderRow={(booking) => (
                      <tr key={booking.id} className="hover:bg-[var(--muted)]">
                        <td className="px-4 py-3 font-medium">
                          {booking.studentName}
                          {booking.roommateStudentId && (
                            <span className="block text-[10px] font-normal text-[var(--muted-foreground)]">
                              + {booking.roommateName || "Matched roommate"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">{booking.propertyTitle} · {booking.roomName}</td>
                        <td className="px-4 py-3 text-xs">{booking.startDate} → {booking.endDate}</td>
                        <td className="px-4 py-3">
                          ₱{Number(booking.monthlyRate).toLocaleString()}/mo
                          {booking.isShared && <span className="block text-[10px] text-[var(--muted-foreground)]">₱{Number(booking.monthlyShare).toLocaleString()} per student</span>}
                          {booking.roommateInviteStatus === "Pending" && <span className="block text-[10px] text-amber-700">Roommate invitation pending</span>}
                        </td>
                        <td className="px-4 py-3"><span className="rounded-full bg-[var(--secondary)] px-2.5 py-1 text-xs font-semibold text-[var(--primary)]">{booking.status}</span></td>
                        <td className="px-4 py-3"><button type="button" onClick={() => { setBookingDetail(booking); setMoveOutDate(todayDate); }} className="rounded-lg bg-[var(--secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)]">Review</button></td>
                      </tr>
                    )}
                  />
                </table>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-xl font-semibold">Listing Status</h2>
              <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
                <table className="w-full min-w-[38rem] text-sm">
                  <thead className="bg-[var(--muted)]"><tr>{["Listing", "Starting rent", "Rooms", "Safety", "Status", "Details"].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{heading}</th>)}</tr></thead>
                  <PaginatedTableBody
                    rows={myProperties}
                    columns={6}
                    resetKey={`${session?.landlordId}|${myProperties.length}`}
                    emptyMessage="Create a listing to see its status here."
                    renderRow={(property) => (
                      <tr key={property.id} className="hover:bg-[var(--muted)]">
                        <td className="px-4 py-3 font-medium">{property.title}</td>
                        <td className="px-4 py-3">₱{Number(property.monthlyRent).toLocaleString()}/mo</td>
                        <td className="px-4 py-3">{property.rooms.length}</td>
                        <td className="px-4 py-3">{Number(property.safetyScore).toFixed(1)}/10</td>
                        <td className="px-4 py-3 capitalize">{property.status}</td>
                        <td className="px-4 py-3"><button type="button" onClick={() => setListingDetail(property)} className="rounded-lg bg-[var(--secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)]">View</button></td>
                      </tr>
                    )}
                  />
                </table>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ── Listings ── */}
      {activeTab === "listings" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold">My Listings</h2>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">{filteredProperties.length} of {myProperties.length} listings</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input type="search" value={listingSearch} onChange={(event) => setListingSearch(event.target.value)} placeholder="Search listing or address" aria-label="Search your listings" className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" />
            <select value={listingStatusFilter} onChange={(event) => setListingStatusFilter(event.target.value)} aria-label="Filter your listings by status" className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
              <option value="all">All statuses</option>
              <option value="approved">Published</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            <table className="w-full min-w-[48rem] text-sm">
              <thead className="bg-[var(--muted)]"><tr>{["Listing", "Address", "Available rooms", "Starting rent", "Safety", "Status", "Details"].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{heading}</th>)}</tr></thead>
              <PaginatedTableBody
                rows={filteredProperties}
                columns={7}
                resetKey={`${listingSearch}|${listingStatusFilter}`}
                emptyMessage={myProperties.length ? "No listings match your search or status filter." : "You have not created any listings yet."}
                renderRow={(property) => (
                  <tr key={property.id} className="hover:bg-[var(--muted)]">
                    <td className="px-4 py-3 font-medium">{property.title}</td>
                    <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">{property.address}</td>
                    <td className="px-4 py-3">{property.rooms.filter((room) => room.status === "available").length} / {property.rooms.length}</td>
                    <td className="px-4 py-3">₱{Number(property.monthlyRent).toLocaleString()}/mo</td>
                    <td className="px-4 py-3 font-semibold">{Number(property.safetyScore).toFixed(1)}/10</td>
                    <td className="px-4 py-3 capitalize">{property.status}</td>
                    <td className="px-4 py-3"><button type="button" onClick={() => setListingDetail(property)} className="rounded-lg bg-[var(--secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)]">Review</button></td>
                  </tr>
                )}
              />
            </table>
          </div>
        </div>
      )}

      {/* ── Calendar ── */}
      {activeTab === "calendar" && (
        <div className="space-y-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-display text-xl font-semibold">Room Availability Calendar</h2>
              {selectedCalendarProperty && <p className="mt-1 text-xs text-[var(--muted-foreground)]">{selectedCalendarProperty.title}</p>}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={selectedCalendarProperty?.id || ""}
                onChange={(event) => {
                  setSelectedCalendarPropertyId(event.target.value);
                  setSelectedRoom("all");
                }}
                aria-label="Filter calendar by property"
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none"
              >
                {myProperties.length === 0 && <option value="">No listings</option>}
                {myProperties.map((property) => <option key={property.id} value={property.id}>{property.title}</option>)}
              </select>
              <select
                value={selectedRoom}
                onChange={(event) => setSelectedRoom(event.target.value)}
                aria-label="Filter calendar by room"
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none"
              >
                <option value="all">All rooms</option>
                {calendarRooms.map((room) => (
                  <option key={room.id} value={room.id}>{room.name} · {room.propertyTitle}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-semibold text-lg">{new Date().getFullYear()}</span>
              <span className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium">Year</span>
            </div>
            <AvailabilityCalendar
              rooms={visibleCalendarRooms}
              bookings={bookings}
              onEvent={(room, status, month, booking) => setRoomDetail({ room, status, month, booking })}
            />
            <div className="mt-4 flex flex-wrap gap-4 text-xs">
              {[
                ["bg-emerald-100", "Available"],
                ["bg-amber-100", "Reserved"],
                ["bg-red-100", "Occupied"],
              ].map(([className, label]) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className={`h-3 w-3 rounded ${className}`} />
                  <span className="text-[var(--muted-foreground)]">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "payments" && (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Payment Reviews</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">Review student-submitted payment details and private receipt proofs for your properties.</p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            <table className="w-full min-w-[70rem] text-sm">
              <thead className="bg-[var(--muted)]"><tr>{["Student", "Property / room", "Payment", "Amount", "Method", "Date", "Receipt", "Status", "Review"].map((heading) => <th key={heading} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{heading}</th>)}</tr></thead>
              <PaginatedTableBody
                rows={myPayments}
                columns={9}
                emptyMessage="No student payments have been submitted for your properties."
                renderRow={(payment) => (
                  <tr key={payment.id} className="align-top">
                    <td className="px-3 py-3 font-medium">{payment.studentName}</td>
                    <td className="px-3 py-3">{payment.propertyTitle} · {payment.roomName}</td>
                    <td className="px-3 py-3">{payment.paymentType}</td>
                    <td className="px-3 py-3">₱{payment.amount.toLocaleString()}</td>
                    <td className="px-3 py-3">{payment.paymentMethod || "—"}</td>
                    <td className="px-3 py-3 text-xs">{payment.paymentDate?.slice(0, 10) || "—"}</td>
                    <td className="px-3 py-3">
                      {paymentProofLinks[payment.id]
                        ? <a href={paymentProofLinks[payment.id]} target="_blank" rel="noreferrer" className="font-semibold text-[var(--primary)] underline">Open proof</a>
                        : <button type="button" onClick={() => loadPaymentProof(payment)} className="whitespace-nowrap rounded-lg bg-[var(--secondary)] px-2.5 py-1.5 text-xs font-semibold text-[var(--primary)]">View proof</button>}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${payment.status === "Verified" ? "bg-emerald-100 text-emerald-800" : payment.status === "Failed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{payment.status}</span>
                      {payment.rejectionReason && <p className="mt-1 max-w-36 text-xs text-red-700">{payment.rejectionReason}</p>}
                    </td>
                    <td className="px-3 py-3">
                      {payment.status === "Pending" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPaymentReview(payment);
                            setRejectingPayment(false);
                            setPaymentReviewReason("");
                          }}
                          className="rounded-lg bg-[var(--secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)]"
                        >
                          Review
                        </button>
                      ) : <span className="text-xs text-[var(--muted-foreground)]">Reviewed</span>}
                    </td>
                  </tr>
                )}
              />
            </table>
          </div>
        </div>
      )}

      {/* Roommate matching requests */}
      {activeTab === "roommates" && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">Roommate Matching</h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Review compatibility habits and suggest exactly three candidates of the requesting student’s gender.
              </p>
            </div>
            <button type="button" onClick={refreshRoommateMatchRequests} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold">
              Refresh requests
            </button>
          </div>
          {roommateMatchRequests.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 text-sm text-[var(--muted-foreground)]">
              There are no active roommate requests.
            </div>
          ) : (
            <div className="space-y-4">
              {roommateMatchRequests.map((request) => (
                <article key={request.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {request.profilePhotoUrl
                        ? <img src={request.profilePhotoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
                        : <div aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--secondary)] font-semibold text-[var(--primary)]">{request.name?.charAt(0) || "S"}</div>}
                      <div>
                        <h3 className="font-semibold">{request.name}</h3>
                        <p className="text-xs text-[var(--muted-foreground)]">{request.gender} only{request.academicYear ? ` · ${request.academicYear}` : ""}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => selectedRoommateRequestId === request.id
                        ? setSelectedRoommateRequestId("")
                        : openRoommateCandidatePicker(request)}
                      disabled={roommateMatchBusy}
                      className="rounded-xl bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {selectedRoommateRequestId === request.id ? "Close candidates" : `Choose candidates (${request.candidateCount}/3 selected)`}
                    </button>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ["Sleep", ROOMMATE_PREFERENCE_LABELS.sleep[request.preferences.sleep]],
                      ["Study", ROOMMATE_PREFERENCE_LABELS.study[request.preferences.study]],
                      ["Cleanliness", ROOMMATE_PREFERENCE_LABELS.cleanliness[request.preferences.cleanliness]],
                      ["Guests", ROOMMATE_PREFERENCE_LABELS.guests[request.preferences.guests]],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl bg-[var(--muted)] p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{label}</p>
                        <p className="mt-1 text-xs font-medium">{value || "Not answered"}</p>
                      </div>
                    ))}
                  </div>

                  {selectedRoommateRequestId === request.id && (
                    <div className="mt-5 border-t border-[var(--border)] pt-4">
                      <p className="mb-3 text-xs text-[var(--muted-foreground)]">
                        Choose three candidates. The compatibility score compares the four saved quiz answers; only same-gender students with active requests are listed.
                      </p>
                      {roommateCandidates.length === 0 ? (
                        <p className="rounded-xl bg-[var(--muted)] p-4 text-sm text-[var(--muted-foreground)]">
                          There are not yet three eligible same-gender students with completed compatibility quizzes.
                        </p>
                      ) : (
                        <>
                          {roommateCandidates.length < 3 && (
                            <p className="mb-3 text-xs text-amber-700">
                              At least three eligible candidates are needed. Currently available: {roommateCandidates.length}.
                            </p>
                          )}
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {roommateCandidates.map((candidate) => {
                              const selected = selectedRoommateCandidateIds.includes(candidate.studentId);
                              const limitReached = selectedRoommateCandidateIds.length >= 3 && !selected;
                              return (
                                <label
                                  key={candidate.studentId}
                                  className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${selected ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)]"} ${limitReached ? "cursor-not-allowed opacity-50" : ""}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    disabled={limitReached || roommateMatchBusy}
                                    onChange={() => setSelectedRoommateCandidateIds((current) => selected
                                      ? current.filter((id) => id !== candidate.studentId)
                                      : [...current, candidate.studentId])}
                                    className="mt-1 accent-[var(--primary)]"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <p className="text-sm font-semibold">{candidate.name}</p>
                                        <p className="text-[10px] text-[var(--muted-foreground)]">{candidate.gender}{candidate.academicYear ? ` · ${candidate.academicYear}` : ""}</p>
                                      </div>
                                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">{candidate.compatibilityScore}%</span>
                                    </div>
                                    <p className="mt-2 text-[10px] text-[var(--muted-foreground)]">
                                      {ROOMMATE_PREFERENCE_LABELS.sleep[candidate.preferences.sleep]} · {ROOMMATE_PREFERENCE_LABELS.study[candidate.preferences.study]} · {ROOMMATE_PREFERENCE_LABELS.cleanliness[candidate.preferences.cleanliness]} · {ROOMMATE_PREFERENCE_LABELS.guests[candidate.preferences.guests]}
                                    </p>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xs text-[var(--muted-foreground)]">{selectedRoommateCandidateIds.length} of 3 candidates selected</p>
                            <button
                              type="button"
                              onClick={submitRoommateCandidates}
                              disabled={roommateMatchBusy || selectedRoommateCandidateIds.length !== 3}
                              className="rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {roommateMatchBusy ? "Saving…" : "Send 3 candidates to student"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {bookingDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="landlord-booking-detail-title">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--muted)] px-5 py-4">
              <div>
                <h3 id="landlord-booking-detail-title" className="font-display text-lg font-semibold">Booking request</h3>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">{bookingDetail.studentName} · {bookingDetail.propertyTitle} · {bookingDetail.roomName}</p>
              </div>
              <button type="button" onClick={() => setBookingDetail(null)} aria-label="Close booking details" className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--border)]">✕</button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {[
                ["Student", bookingDetail.studentName],
                ["Status", bookingDetail.status],
                ["Property", bookingDetail.propertyTitle],
                ["Room", bookingDetail.roomName],
                ["Move-in date", bookingDetail.startDate],
                ["Current billing cycle ends", bookingDetail.endDate],
                ...(bookingDetail.actualEndDate ? [["Room released from", bookingDetail.actualEndDate]] : []),
                ["Monthly rent", `₱${Number(bookingDetail.monthlyRate).toLocaleString()}`],
                ...(bookingDetail.roommateStudentId ? [["Roommate", `${bookingDetail.roommateName || "Matched student"} · ${bookingDetail.roommateInviteStatus || "Invited"}`]] : []),
                ...(bookingDetail.isShared ? [
                  ["Rent per student", `₱${Number(bookingDetail.monthlyShare).toLocaleString()}/mo`],
                ] : bookingDetail.hasRoommate ? [
                  ["Rent sharing starts", bookingDetail.roommateStartDate],
                  ["Rent per student after start", `₱${Number(bookingDetail.monthlyRate / 2).toLocaleString()}/mo`],
                ] : []),
                ...(bookingDetail.hasRoommate ? [
                  ["Security deposit per student", `₱${Number(bookingDetail.securityDepositShare).toLocaleString()}`],
                ] : []),
                ["Request received", bookingDetail.createdAt || "—"],
              ].map(([label, value]) => <div key={label}><div className="text-xs text-[var(--muted-foreground)]">{label}</div><div className="mt-1 text-sm font-medium">{value}</div></div>)}
            </div>
            <div className="space-y-3 border-t border-[var(--border)] bg-[var(--muted)] px-5 py-3">
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setBookingDetail(null)} className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-semibold">Close</button>
                {bookingDetail.status === "Pending" && (
                  <>
                    <button type="button" onClick={() => updateBookingStatus(bookingDetail, "Cancelled")} className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white">Decline</button>
                    <button
                      type="button"
                      onClick={() => updateBookingStatus(bookingDetail, "Confirmed")}
                      disabled={bookingDetail.roommateInviteStatus === "Pending"}
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {bookingDetail.roommateInviteStatus === "Pending" ? "Waiting for roommate" : "Confirm booking"}
                    </button>
                  </>
                )}
                {bookingDetail.status === "Confirmed" && bookingDetail.startDate > todayDate && (
                  <button type="button" onClick={() => updateBookingStatus(bookingDetail, "Cancelled")} className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white">Cancel future booking</button>
                )}
              </div>
              {bookingDetail.status === "Confirmed" && bookingDetail.startDate <= todayDate && (
                <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 sm:flex-row sm:items-end sm:justify-between">
                  <label className="text-xs text-[var(--muted-foreground)]">
                    Move-out date (first day available again)
                    <input
                      type="date"
                      value={moveOutDate}
                      min={bookingDetail.startDate}
                      max={todayDate}
                      onChange={(event) => setMoveOutDate(event.target.value)}
                      className="mt-1 block rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => markBookingVacated(bookingDetail)}
                    disabled={moveOutBusy || !moveOutDate}
                    className="rounded-xl bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {moveOutBusy ? "Updating…" : "Mark room vacated"}
                  </button>
                </div>
              )}
              {bookingDetail.status === "Completed" && (
                <p className="text-right text-xs text-[var(--muted-foreground)]">
                  The room is available for new bookings from {bookingDetail.actualEndDate || bookingDetail.endDate}.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {listingDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="landlord-listing-detail-title">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--muted)] px-5 py-4">
              <div>
                <h3 id="landlord-listing-detail-title" className="font-display text-lg font-semibold">{listingDetail.title}</h3>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">{listingDetail.address}</p>
              </div>
              <button type="button" onClick={() => setListingDetail(null)} aria-label="Close listing details" className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--border)]">✕</button>
            </div>
            <div className="space-y-5 overflow-y-auto p-5">
              <section className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Listing photos</h4>
                {listingDetail.images?.filter((image) => typeof image === "string" && !image.startsWith("data:")).length ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {listingDetail.images.filter((image) => typeof image === "string" && !image.startsWith("data:")).map((image, index) => (
                      <a key={`${image}-${index}`} href={image} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-[var(--border)]">
                        <img src={image} alt={`${listingDetail.title} photo ${index + 1}`} className="h-32 w-full object-cover" />
                      </a>
                    ))}
                  </div>
                ) : <p className="text-sm text-[var(--muted-foreground)]">No listing photos have been added yet.</p>}
                <div className="flex flex-col gap-3 rounded-xl border border-dashed border-[var(--border)] p-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="text-xs text-[var(--muted-foreground)]">
                    <span className="mb-1 block font-semibold text-[var(--foreground)]">Add photos to this listing</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={chooseListingPhotos} className="max-w-full text-xs" />
                    <span className="mt-1 block">{listingPhotoFiles.length ? `${listingPhotoFiles.length} photo${listingPhotoFiles.length === 1 ? "" : "s"} selected` : "JPG, PNG, or WebP · up to 8 MB each · max 8 at a time"}</span>
                  </label>
                  <button type="button" onClick={addListingPhotos} disabled={listingPhotoBusy || listingPhotoFiles.length === 0} className="rounded-xl bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
                    {listingPhotoBusy ? "Uploading…" : "Upload photos"}
                  </button>
                </div>
                {listingPhotoError && <p role="alert" className="text-sm text-red-600">{listingPhotoError}</p>}
              </section>
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Listing details</h4>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{listingDetail.description || "No description provided."}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-[var(--secondary)] px-3 py-1 font-semibold text-[var(--primary)] capitalize">{listingDetail.status}</span>
                  <span className="rounded-full bg-[var(--muted)] px-3 py-1">Starting rent ₱{Number(listingDetail.monthlyRent).toLocaleString()} / month</span>
                  <span className="rounded-full bg-[var(--muted)] px-3 py-1">Safety {Number(listingDetail.safetyScore).toFixed(1)} / 10</span>
                </div>
              </section>
              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Rooms</h4>
                  {!roomEditForm && (
                    <button
                      type="button"
                      onClick={startRoomAdd}
                      className="rounded-lg bg-[var(--secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)]"
                    >
                      + Add room
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="w-full min-w-[42rem] text-sm">
                    <thead className="bg-[var(--muted)]"><tr>{["Room", "Monthly rent", "Capacity", "Availability", "Photos", "Amenities", "Actions"].map((heading) => <th key={heading} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{heading}</th>)}</tr></thead>
                    <PaginatedTableBody
                      rows={listingDetail.rooms}
                      columns={7}
                      resetKey={`${listingDetail.id}|${listingDetail.rooms.length}`}
                      emptyMessage="No rooms have been added to this listing."
                      renderRow={(room) => (
                        <tr key={room.id}>
                          <td className="px-3 py-2 font-medium">{room.name}</td>
                          <td className="px-3 py-2">₱{Number(room.price || 0).toLocaleString()}/mo</td>
                          <td className="px-3 py-2">{room.capacity ?? "—"}</td>
                          <td className="px-3 py-2 capitalize">{room.status}</td>
                          <td className="px-3 py-2">{room.images?.length ? <div className="flex gap-1">{room.images.slice(0, 3).map((image, index) => <img key={`${room.id}-${image}`} src={image} alt={`${room.name} photo ${index + 1}`} className="h-9 w-12 rounded object-cover" />)}</div> : "—"}</td>
                          <td className="px-3 py-2 text-xs">{room.amenities?.join(", ") || "—"}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => startRoomEdit(room)}
                              disabled={roomEditBusy || Boolean(roomEditForm)}
                              className="rounded-lg bg-[var(--secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)] disabled:opacity-50"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      )}
                    />
                  </table>
                </div>
                {roomEditForm && (
                  <section className="mt-4 space-y-4 rounded-xl border border-[var(--border)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h5 className="text-sm font-semibold">
                          {roomEditMode === "add" ? "Add room" : `Edit ${roomBeingEdited?.name || "room"}`}
                        </h5>
                        {roomEditMode === "edit" && (
                          <p className="mt-1 text-xs text-[var(--muted-foreground)]">Rate changes apply to future bookings and billing cycles; existing invoices are unchanged.</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setRoomEditId("");
                          setRoomEditForm(null);
                          setRoomEditMode("");
                          setRoomEditPhotoFiles([]);
                          setRoomEditError("");
                        }}
                        disabled={roomEditBusy}
                        className="text-xs font-medium text-[var(--muted-foreground)] hover:underline disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-medium">
                        Room name/number
                        <input
                          value={roomEditForm.roomNumber}
                          onChange={(event) => setRoomEditForm((current) => ({ ...current, roomNumber: event.target.value }))}
                          disabled={roomEditBusy}
                          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="text-xs font-medium">
                        Capacity
                        <input
                          type="number"
                          min="1"
                          value={roomEditForm.capacity}
                          onChange={(event) => setRoomEditForm((current) => ({ ...current, capacity: event.target.value }))}
                          disabled={roomEditBusy}
                          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="text-xs font-medium">
                        Monthly rent (₱)
                        <input
                          type="number"
                          min="0"
                          value={roomEditForm.monthlyRate}
                          onChange={(event) => setRoomEditForm((current) => ({ ...current, monthlyRate: event.target.value }))}
                          disabled={roomEditBusy}
                          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="text-xs font-medium">
                        Security deposit (₱)
                        <input
                          type="number"
                          min="0"
                          value={roomEditForm.securityDeposit}
                          onChange={(event) => setRoomEditForm((current) => ({ ...current, securityDeposit: event.target.value }))}
                          disabled={roomEditBusy}
                          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold">Room amenities</p>
                      <div className="flex flex-wrap gap-2">
                        {AMENITY_ENUM.map((amenity) => (
                          <button
                            key={amenity}
                            type="button"
                            disabled={roomEditBusy}
                            onClick={() => setRoomEditForm((current) => ({
                              ...current,
                              amenities: current.amenities.includes(amenity)
                                ? current.amenities.filter((item) => item !== amenity)
                                : [...current.amenities, amenity],
                            }))}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                              roomEditForm.amenities.includes(amenity)
                                ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                                : "border-[var(--border)] bg-[var(--muted)]"
                            }`}
                          >
                            {AMENITY_LABELS[amenity]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold">Room photos (up to 8)</p>
                      {roomEditForm.images.length > 0 && (
                        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {roomEditForm.images.map((image, index) => (
                            <div key={`${image}-${index}`} className="relative overflow-hidden rounded-lg border border-[var(--border)]">
                              <img src={image} alt={`${roomBeingEdited?.name || "Room"} photo ${index + 1}`} className="h-24 w-full object-cover" />
                              <button
                                type="button"
                                disabled={roomEditBusy}
                                onClick={() => setRoomEditForm((current) => ({
                                  ...current,
                                  images: current.images.filter((_, imageIndex) => imageIndex !== index),
                                }))}
                                className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-1 text-[10px] text-white disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        onChange={chooseRoomEditPhotos}
                        disabled={roomEditBusy || roomEditForm.images.length >= 8}
                        className="w-full text-xs"
                      />
                      {roomEditPhotoFiles.length > 0 && (
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          {roomEditPhotoFiles.length} new photo{roomEditPhotoFiles.length === 1 ? "" : "s"} selected.
                        </p>
                      )}
                    </div>
                    {roomEditError && <p role="alert" className="text-sm text-red-600">{roomEditError}</p>}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={saveRoomEdit}
                        disabled={roomEditBusy}
                        className="rounded-xl bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {roomEditBusy ? "Saving…" : roomEditMode === "add" ? "Add room" : "Save room"}
                      </button>
                    </div>
                  </section>
                )}
              </section>
              <section className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Latest safety inspection</h4>
                {listingDetail.safetyBreakdown.inspectedAt ? (
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs text-[var(--muted-foreground)]">Date</dt><dd className="font-medium">{listingDetail.safetyBreakdown.inspectedAt}</dd></div>
                    <div><dt className="text-xs text-[var(--muted-foreground)]">Police distance</dt><dd className="font-medium">{listingDetail.safetyBreakdown.policeDistanceMeters == null ? "Not recorded" : `${listingDetail.safetyBreakdown.policeDistanceMeters.toLocaleString()} m`}</dd></div>
                    <div><dt className="text-xs text-[var(--muted-foreground)]">Lighting</dt><dd className="font-medium">{listingDetail.safetyBreakdown.lightingRating == null ? "Not recorded" : `${listingDetail.safetyBreakdown.lightingRating}/5`}</dd></div>
                    <div><dt className="text-xs text-[var(--muted-foreground)]">Secure gated access</dt><dd className="font-medium">{listingDetail.safetyBreakdown.hasGatedAccess ? "Yes" : "No"}</dd></div>
                    <div><dt className="text-xs text-[var(--muted-foreground)]">Active / required CCTV</dt><dd className="font-medium">{listingDetail.safetyBreakdown.cctvActive == null ? "Not recorded" : `${listingDetail.safetyBreakdown.cctvActive} / ${listingDetail.safetyBreakdown.cctvRequired}`}</dd></div>
                  </dl>
                ) : <p className="mt-2 text-sm text-[var(--muted-foreground)]">No inspection has been recorded for this listing.</p>}
              </section>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--muted)] px-5 py-3">
              <button type="button" onClick={() => setListingDetail(null)} className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-semibold">Close</button>
              <button type="button" onClick={() => { setListingDetail(null); setActiveTab("calendar"); setSelectedCalendarPropertyId(listingDetail.id); setSelectedRoom("all"); }} className="rounded-xl bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white">Open calendar</button>
            </div>
          </div>
        </div>
      )}

      {selectedPaymentReview && currentPaymentReview && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closePaymentReview();
          }}
        >
          <div
            className="w-full max-w-lg space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-review-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="payment-review-title" className="font-display text-xl font-semibold">Review payment</h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {currentPaymentReview.studentName} · {currentPaymentReview.propertyTitle} · {currentPaymentReview.roomName}
                </p>
              </div>
              <button
                type="button"
                onClick={closePaymentReview}
                disabled={Boolean(paymentBusyId)}
                aria-label="Close payment review"
                className="text-xl text-[var(--muted-foreground)] disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-[var(--muted)] p-4 text-sm">
              <div>
                <dt className="text-xs text-[var(--muted-foreground)]">Payment type</dt>
                <dd className="font-medium">{currentPaymentReview.paymentType}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted-foreground)]">Amount</dt>
                <dd className="font-semibold">₱{currentPaymentReview.amount.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted-foreground)]">Method</dt>
                <dd className="font-medium">{currentPaymentReview.paymentMethod || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted-foreground)]">Submitted</dt>
                <dd className="font-medium">{currentPaymentReview.paymentDate?.slice(0, 10) || "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-[var(--muted-foreground)]">Receipt</dt>
                <dd className="mt-1">
                  {paymentProofLinks[currentPaymentReview.id]
                    ? <a href={paymentProofLinks[currentPaymentReview.id]} target="_blank" rel="noreferrer" className="font-semibold text-[var(--primary)] underline">Open payment proof</a>
                    : <button type="button" onClick={() => loadPaymentProof(currentPaymentReview)} className="text-xs font-semibold text-[var(--primary)] underline">View payment proof</button>}
                </dd>
              </div>
            </dl>

            {currentPaymentReview.status !== "Pending" ? (
              <p className="rounded-xl bg-[var(--muted)] p-3 text-sm text-[var(--muted-foreground)]">
                This payment has already been reviewed as {currentPaymentReview.status.toLowerCase()}.
              </p>
            ) : rejectingPayment ? (
              <div className="space-y-3">
                <label className="block text-sm font-medium" htmlFor="payment-rejection-reason">
                  Reason for rejection
                  <textarea
                    id="payment-rejection-reason"
                    value={paymentReviewReason}
                    onChange={(event) => setPaymentReviewReason(event.target.value)}
                    placeholder="Explain why this payment cannot be accepted."
                    rows={3}
                    disabled={paymentBusyId === currentPaymentReview.id}
                    className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingPayment(false);
                      setPaymentReviewReason("");
                    }}
                    disabled={Boolean(paymentBusyId)}
                    className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-semibold disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => reviewPayment(currentPaymentReview, "Failed")}
                    disabled={paymentBusyId === currentPaymentReview.id || !paymentReviewReason.trim()}
                    className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {paymentBusyId === currentPaymentReview.id ? "Saving…" : "Confirm rejection"}
                  </button>
                </div>
              </div>
            ) : currentPaymentReview.status === "Pending" && (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRejectingPayment(true);
                    setPaymentReviewReason("");
                  }}
                  className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white"
                >
                  Reject payment
                </button>
                <button
                  type="button"
                  onClick={() => reviewPayment(currentPaymentReview, "Verified")}
                  disabled={paymentBusyId === currentPaymentReview.id}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {paymentBusyId === currentPaymentReview.id ? "Saving…" : "Accept payment"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {bookingNotice && (
        <div className="fixed right-4 top-4 z-[60] w-[min(22.5rem,calc(100vw-2rem))] rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-xl" role="status">
          <div className="flex gap-3">
            <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${bookingNotice.error ? "bg-red-500" : "bg-emerald-500"}`} />
            <div className="flex-1">
              <div className="text-xs font-semibold">{bookingNotice.title}</div>
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{bookingNotice.message}</p>
            </div>
            <button type="button" onClick={() => setBookingNotice(null)} aria-label="Dismiss booking notification" className="text-[var(--muted-foreground)]">×</button>
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
                  {roomDetail.room.name}
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
                <div className="text-sm font-medium">{roomDetail.room.propertyTitle}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--muted-foreground)]">Move-in / billing cycle</div>
                <div className="text-sm font-medium">
                  {roomDetail.booking.startDate} → {roomDetail.booking.openEnded ? "ongoing stay" : roomDetail.booking.endDate}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--muted-foreground)]">Booked by</div>
                <div className="text-sm font-medium">{roomDetail.booking.studentName}</div>
              </div>
            </div>
            <button type="button" onClick={() => setRoomDetail(null)} className="mt-6 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white">Close</button>
          </div>
        </div>
      )}

      {addOpen && <AddListingModal onClose={() => setAddOpen(false)} onCreated={reload} />}
    </div>
  );
}

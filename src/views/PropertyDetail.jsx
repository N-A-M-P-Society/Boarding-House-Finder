import { useEffect, useState } from "react";
import { useData } from "../context/DataContext.jsx";
import LeafletMap from "../components/LeafletMap.jsx";
import ImageLightbox from "../components/ImageLightbox.jsx";
import BookRoomButton from "../components/BookRoomButton.jsx";
import { fetchMyRoommateMatchRequest, fetchPublicRoomBookings, saveListing } from "../lib/api.js";

const ACTIVE_BOOKING_STATUSES = new Set(["Pending", "Confirmed"]);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nextBillingDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  const nextMonth = new Date(year, month, 1);
  const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
  nextMonth.setDate(Math.min(day, lastDay));
  return formatLocalDate(nextMonth);
}

function bookingForDate(roomId, date, bookings) {
  return bookings.find((booking) =>
    booking.roomId === String(roomId) &&
    ACTIVE_BOOKING_STATUSES.has(booking.status) &&
    booking.startDate <= date &&
    (booking.openEnded || date < booking.endDate)
  );
}

function findBookingConflict(roomId, startDate, endDate, bookings) {
  if (!roomId || !startDate || !endDate) return null;
  return bookings.find((booking) =>
    booking.roomId === String(roomId) &&
    ACTIVE_BOOKING_STATUSES.has(booking.status) &&
    (booking.openEnded
      ? endDate > booking.startDate
      : startDate < booking.endDate && endDate > booking.startDate)
  ) || null;
}

function findShareableBooking(room, bookings) {
  if (!room || room.capacity !== 2) return null;
  return bookings.find((booking) =>
    booking.roomId === String(room.id) &&
    ACTIVE_BOOKING_STATUSES.has(booking.status) &&
    booking.occupiedSlots === 1 &&
    (booking.status === "Pending" ? booking.startDate : booking.endDate) >= formatLocalDate(new Date())
  ) || null;
}

function shareStartDate(booking) {
  return booking.status === "Pending" ? booking.startDate : booking.endDate;
}

function findShareableBookingForDate(room, startDate, bookings) {
  if (!startDate || !room || room.capacity !== 2) return null;
  return bookings.find((booking) =>
    booking.roomId === String(room.id) &&
    ACTIVE_BOOKING_STATUSES.has(booking.status) &&
    booking.occupiedSlots === 1 &&
    shareStartDate(booking) === startDate
  ) || null;
}

function RoomAvailabilityCalendar({ room, bookings, month, onMonthChange, availabilityError }) {
  if (!room) return <p className="text-sm text-[var(--muted-foreground)]">No rooms are listed for this property.</p>;

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const startOffset = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cellCount = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const today = formatLocalDate(new Date());
  const cells = Array.from({ length: cellCount }, (_, index) => {
    const day = index - startOffset + 1;
    if (day < 1 || day > daysInMonth) return null;

    const date = formatLocalDate(new Date(year, monthIndex, day));
    const booking = bookingForDate(room.id, date, bookings);
    const hasOpenSpot = room.capacity === 2 && booking?.occupiedSlots === 1;
    const status = booking
      ? hasOpenSpot ? "Shared spot" : booking.status === "Confirmed" ? "Booked" : "Reserved"
      : date < today ? "Past" : availabilityError ? "Unknown" : room.status === "available" ? "Available" : "Unavailable";

    return { day, date, status, booking };
  });
  const statusStyles = {
    Available: "border-emerald-200 bg-emerald-50 text-emerald-800",
    "Shared spot": "border-violet-200 bg-violet-50 text-violet-800",
    Reserved: "border-amber-200 bg-amber-50 text-amber-800",
    Booked: "border-red-200 bg-red-50 text-red-800",
    Unavailable: "border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]",
    Unknown: "border-slate-300 bg-slate-100 text-slate-700",
    Past: "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)]/60",
  };
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(month);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => onMonthChange(-1)} aria-label="Previous month" className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm">‹</button>
        <h4 className="font-semibold">{monthLabel}</h4>
        <button type="button" onClick={() => onMonthChange(1)} aria-label="Next month" className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`${room.name} availability for ${monthLabel}`}>
        {WEEKDAYS.map((day) => <div key={day} role="columnheader" className="py-1 text-center text-[10px] font-semibold text-[var(--muted-foreground)]">{day}</div>)}
        {cells.map((cell, index) => cell ? (
          <div
            key={cell.date}
            role="gridcell"
            title={cell.booking ? cell.booking.openEnded ? `${cell.status}: ongoing stay` : `${cell.status}: ${cell.booking.startDate} to ${cell.booking.endDate}` : cell.status}
            aria-label={`${monthLabel} ${cell.day}: ${cell.status}`}
            className={`flex min-h-11 flex-col items-center justify-center rounded-lg border text-xs ${statusStyles[cell.status]}`}
          >
            <span className="font-semibold">{cell.day}</span>
            <span className="hidden text-[8px] sm:block">{cell.status}</span>
          </div>
        ) : <div key={`empty-${index}`} aria-hidden="true" />)}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px]">
        {["Available", "Shared spot", "Reserved", "Booked", "Unavailable", ...(availabilityError ? ["Unknown"] : [])].map((status) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded border ${statusStyles[status]}`} />
            {status}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function PropertyDetail({ propertyId, onNavigate, onStartChat, onBookingCreated, onRoommateCompatibility, userRole, session, onRequireLogin }) {
  const { properties: PROPERTIES, gates, campus, reload } = useData();
  const property = PROPERTIES.find((p) => p.id === propertyId);
  const [bookRoom, setBookRoom] = useState("");
  const [startDate, setStartDate] = useState("");
  const [bookMsg, setBookMsg] = useState({ type: "", text: "" });
  const [availabilityBookings, setAvailabilityBookings] = useState([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [availabilityRoomId, setAvailabilityRoomId] = useState("");
  const [roommateMatchRequest, setRoommateMatchRequest] = useState(null);
  const [roommateMatchError, setRoommateMatchError] = useState("");
  const [shareWithMatchedRoommate, setShareWithMatchedRoommate] = useState(false);
  const [availabilityMonth, setAvailabilityMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [lightbox, setLightbox] = useState(null);
  const [activeImg, setActiveImg] = useState(0);
  const [activeTab, setActiveTab] = useState("overview");
  useEffect(() => {
    if (!property?.id) return;
    let active = true;
    setAvailabilityBookings([]);
    setAvailabilityError("");
    setAvailabilityLoading(true);
    fetchPublicRoomBookings(property.id)
      .then((bookings) => {
        if (active) setAvailabilityBookings(bookings);
      })
      .catch((error) => {
        if (active) setAvailabilityError(error.message);
      })
      .finally(() => {
        if (active) setAvailabilityLoading(false);
      });
    return () => {
      active = false;
    };
  }, [property?.id]);

  useEffect(() => {
    if (userRole !== "student" || !session?.studentId) {
      setRoommateMatchRequest(null);
      return;
    }
    let active = true;
    setRoommateMatchError("");
    fetchMyRoommateMatchRequest()
      .then((request) => {
        if (active) setRoommateMatchRequest(request);
      })
      .catch((error) => {
        if (active) setRoommateMatchError(error.message);
      });
    return () => {
      active = false;
    };
  }, [session?.studentId, userRole]);

  const today = formatLocalDate(new Date());
  const selectedRoom = property?.rooms.find((room) => room.id === bookRoom);
  const endDate = startDate ? nextBillingDate(startDate) : "";
  const selectedRoomBookingConflict = findBookingConflict(bookRoom, startDate, endDate, availabilityBookings);
  const selectedShareBooking = findShareableBookingForDate(selectedRoom, startDate, availabilityBookings);
  const selectedRoomConflict = Boolean(selectedRoomBookingConflict && !selectedShareBooking);
  const selectedRoomUnavailable = Boolean(
    selectedRoom &&
    selectedRoom.status !== "available" &&
    !selectedShareBooking
  );
  async function refreshAfterBooking({ isRoommateJoinRequest = false } = {}) {
    setShareWithMatchedRoommate(false);
    const refreshErrors = [];

    try {
      await reload();
    } catch (error) {
      refreshErrors.push(error.message);
    }

    try {
      setAvailabilityBookings(await fetchPublicRoomBookings(property.id));
      setAvailabilityError("");
    } catch (error) {
      setAvailabilityError(error.message);
      refreshErrors.push(error.message);
    }

    if (!isRoommateJoinRequest) {
      try {
        await onBookingCreated?.();
      } catch (error) {
        refreshErrors.push(error.message);
      }
    }

    if (refreshErrors.length > 0) {
      setBookMsg({
        type: "error",
        text: `Booking request sent, but some details could not refresh: ${refreshErrors.join("; ")}`,
      });
    }
  }
  async function handleSave() {
    try {
      await saveListing(session.studentId, property.id);
      setBookMsg({ type: "ok", text: "Saved to your dashboard." });
    } catch (e) {
      setBookMsg({ type: "error", text: e.message });
    }
  }
  useEffect(() => {
    setBookRoom("");
    setStartDate("");
    setAvailabilityRoomId("");
    setActiveImg(0);
    setActiveTab("overview");
    setLightbox(null);
    setShareWithMatchedRoommate(false);
  }, [propertyId]);
  useEffect(() => {
    if (!property || activeTab !== "overview" || lightbox) return;
    function handleGalleryKeys(event) {
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (property.images.length < 2) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveImg((index) => (index - 1 + property.images.length) % property.images.length);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveImg((index) => (index + 1) % property.images.length);
      }
    }
    window.addEventListener("keydown", handleGalleryKeys);
    return () => window.removeEventListener("keydown", handleGalleryKeys);
  }, [activeTab, lightbox, property]);
  function showLightbox(images, index, title, isPropertyGallery = false) {
    setLightbox({ images, index, title, isPropertyGallery });
  }
  if (!property) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-[var(--muted-foreground)]">Property not found.</p>
          <button onClick={() => onNavigate("listings")} className="mt-4 text-[var(--primary)] text-sm font-medium hover:underline">
            ← Back to listings
          </button>
        </div>
      </div>
    );
  }
  const avgRating = property.reviews.length ? property.reviews.reduce((s, r) => s + r.overallRating, 0) / property.reviews.length : null;
  const safetyFactors = [
    { label: "Police Proximity", value: property.safetyBreakdown.policeProximity, weight: 25 },
    { label: "Street Lighting", value: property.safetyBreakdown.lighting, weight: 25 },
    { label: "Gated Access", value: property.safetyBreakdown.gatedAccess, weight: 25 },
    { label: "CCTV Coverage", value: property.safetyBreakdown.cctv, weight: 25 },
  ];
  const safetyColor = property.safetyScore >= 8.5 ? "text-emerald-600" : property.safetyScore >= 7 ? "text-amber-600" : "text-red-600";
  const safetyBg =
    property.safetyScore >= 8.5
      ? "bg-emerald-50 border-emerald-200"
      : property.safetyScore >= 7
        ? "bg-amber-50 border-amber-200"
        : "bg-red-50 border-red-200";
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Back */}
      <button
        onClick={() => onNavigate("listings")}
        className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-6 flex items-center gap-1 transition-colors"
      >
        ← Back to listings
      </button>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Left: images + tabs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Image gallery */}
          <div className="space-y-2">
            <div
              className="relative rounded-2xl overflow-hidden h-72 sm:h-96 bg-[var(--muted)]"
            >
              <button
                type="button"
                onClick={() => showLightbox(property.images, activeImg, property.title, true)}
                aria-label={`Open ${property.title} photo ${activeImg + 1} in photo viewer`}
                className="h-full w-full"
              >
                <img src={property.images[activeImg]} alt={`${property.title}, photo ${activeImg + 1} of ${property.images.length}`} className="h-full w-full object-cover" />
              </button>
              {property.images.length > 1 && (
                <>
                  <button type="button" onClick={() => setActiveImg((index) => (index - 1 + property.images.length) % property.images.length)} aria-label="Previous photo" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-xl text-white hover:bg-black/80">‹</button>
                  <button type="button" onClick={() => setActiveImg((index) => (index + 1) % property.images.length)} aria-label="Next photo" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-xl text-white hover:bg-black/80">›</button>
                  <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">{activeImg + 1} / {property.images.length}</span>
                </>
              )}
            </div>
            {property.images.length > 1 && (
              <div className="flex gap-2">
                {property.images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setActiveImg(i);
                      showLightbox(property.images, i, property.title, true);
                    }}
                    aria-label={`Open ${property.title} photo ${i + 1} in photo viewer`}
                    className={`h-16 w-24 rounded-lg overflow-hidden border-2 transition-all ${i === activeImg ? "border-[var(--primary)]" : "border-transparent opacity-60 hover:opacity-100"}`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div>
            <div className="flex gap-1 border-b border-[var(--border)] mb-6">
              {["overview", "availability", "rooms", "safety", "reviews"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                    activeTab === tab
                      ? "border-[var(--primary)] text-[var(--primary)]"
                      : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {tab}
                  {tab === "reviews" && property.reviews.length > 0 && (
                    <span className="ml-1.5 text-xs font-mono">({property.reviews.length})</span>
                  )}
                </button>
              ))}
            </div>

            {activeTab === "overview" && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-display text-2xl font-semibold mb-2">{property.title}</h2>
                  <p className="text-[var(--muted-foreground)] text-sm">{property.address}</p>
                </div>
                <p className="text-sm leading-relaxed text-[var(--foreground)]">{property.description}</p>
                <div>
                  <h3 className="font-semibold text-sm mb-3">Amenities</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {property.amenities.map((a) => (
                      <div key={a} className="flex items-center gap-2 text-sm">
                        <span className="w-5 h-5 rounded bg-[var(--secondary)] text-[var(--primary)] flex items-center justify-center text-xs">
                          ✓
                        </span>
                        {a}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-3">Verification Badges</h3>
                  <div className="flex flex-wrap gap-2">
                    {property.badges.map((badge) => (
                      <span
                        key={badge}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--secondary)] text-[var(--primary)] rounded-full text-xs font-semibold border border-[var(--primary)]/20"
                      >
                        ✓ {badge}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="bg-[var(--muted)] rounded-xl p-4 text-sm">
                  <h3 className="font-semibold mb-2">Walking Route to ADDU Jacinto</h3>
                  <div className="flex gap-6">
                    <div>
                      <span className="text-[var(--muted-foreground)]">Distance</span>
                      <div className="font-semibold">{property.walkingMeters}m</div>
                    </div>
                    <div>
                      <span className="text-[var(--muted-foreground)]">Est. time</span>
                      <div className="font-semibold">{property.walkingMinutes} min</div>
                    </div>
                  </div>
                  <div className="mt-4 h-64 rounded-xl overflow-hidden border border-[var(--border)] relative">
                    <LeafletMap properties={[property]} campus={campus} gates={gates} radiusMeters={800} activeId={property.id} />
                  </div>
                </div>
              </div>
            )}

            {activeTab === "availability" && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display text-xl font-semibold">Room availability</h2>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    This calendar is for {property.title}. Pending requests reserve their selected dates; confirmed stays remain occupied until move-out.
                  </p>
                </div>
                {availabilityError && (
                  <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    Live availability could not be loaded: {availabilityError} New requests are still checked against booking conflicts by the server.
                  </p>
                )}
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <label htmlFor="availability-room" className="mb-2 block text-sm font-semibold">Room</label>
                  <select
                    id="availability-room"
                    value={availabilityRoomId || property.rooms[0]?.id || ""}
                    onChange={(event) => setAvailabilityRoomId(event.target.value)}
                    disabled={property.rooms.length === 0}
                    className="mb-4 w-full rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-2.5 text-sm sm:max-w-sm"
                  >
                    {property.rooms.length === 0 && <option value="">No rooms listed</option>}
                    {property.rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
                  </select>
                  {availabilityLoading
                    ? <p role="status" className="text-sm text-[var(--muted-foreground)]">Loading booked dates…</p>
                    : (
                      <RoomAvailabilityCalendar
                        room={property.rooms.find((room) => room.id === (availabilityRoomId || property.rooms[0]?.id))}
                        bookings={availabilityBookings}
                        month={availabilityMonth}
                        availabilityError={availabilityError}
                        onMonthChange={(offset) => setAvailabilityMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))}
                      />
                    )}
                </div>
              </div>
            )}

            {activeTab === "rooms" && (
              <div className="space-y-4">
                {property.rooms.map((room) => {
                  const currentBooking = bookingForDate(room.id, today, availabilityBookings);
                  const status = currentBooking
                    ? currentBooking.status === "Confirmed" ? "occupied" : "reserved"
                    : room.status;
                  return (
                    <div key={room.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-medium text-sm">{room.name}</div>
                          <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
                            Capacity: {room.capacity} person{room.capacity > 1 ? "s" : ""}
                          </div>
                          {currentBooking && (
                            <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                              {currentBooking.openEnded
                                ? `Occupied since ${currentBooking.startDate} (ongoing stay)`
                                : `Reserved from ${currentBooking.startDate} until ${currentBooking.endDate}`}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            status === "available" ? "bg-emerald-100 text-emerald-700" : status === "reserved" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                          }`}>
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                          </span>
                          <span className="font-display font-semibold text-[var(--primary)]">₱{room.price.toLocaleString()}/mo</span>
                        </div>
                      </div>
                      {room.images?.length > 0 && (
                        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {room.images.map((image, index) => (
                            <button
                              key={`${room.id}-${image}`}
                              type="button"
                              onClick={() => showLightbox(room.images, index, room.name)}
                              aria-label={`Open ${room.name} photo ${index + 1} in photo viewer`}
                              className="overflow-hidden rounded-xl"
                            >
                              <img src={image} alt={`${room.name}, photo ${index + 1}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === "safety" && (
              <div className="space-y-6">
                <div className={`rounded-2xl border p-5 flex items-center gap-5 ${safetyBg}`}>
                  <div className={`text-5xl font-display font-bold ${safetyColor}`}>{property.safetyScore}</div>
                  <div>
                    <div className="font-semibold">Safety Score</div>
                    <div className={`text-sm ${safetyColor}`}>
                      {property.safetyScore >= 8.5 ? "✓ Vetted Safe" : property.safetyScore >= 7 ? "Good Standing" : "Needs Attention"}
                    </div>
                    <div className="text-xs text-[var(--muted-foreground)] mt-1">Computed from 4 weighted factors below</div>
                  </div>
                </div>

                <div className="space-y-4">
                  {safetyFactors.map((f) => (
                    <div key={f.label}>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-sm font-medium">{f.label}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[var(--muted-foreground)]">weight {f.weight}%</span>
                          <span className="font-mono text-sm font-semibold text-[var(--primary)]">{f.value}/10</span>
                        </div>
                      </div>
                      <div className="h-2.5 bg-[var(--muted)] rounded-full overflow-hidden">
                        <div className="h-full bg-[var(--primary)] rounded-full transition-all" style={{ width: `${f.value * 10}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="text-xs text-[var(--muted-foreground)] bg-[var(--muted)] rounded-lg p-3">
                  Safety scores are independently assessed by the UniRent admin team. Weights may be adjusted by admins in the console.
                </div>
              </div>
            )}

            {activeTab === "reviews" && (
              <div className="space-y-4">
                {property.reviews.length === 0 ? (
                  <div className="text-center py-8 text-[var(--muted-foreground)]">
                    <div className="text-2xl mb-2">📝</div>
                    <p className="text-sm">No reviews yet — be the first verified tenant to leave one.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-4 bg-[var(--secondary)] rounded-xl p-4">
                      <div className="text-4xl font-display font-bold text-[var(--primary)]">{avgRating?.toFixed(1)}</div>
                      <div>
                        <div className="text-yellow-500">{"★".repeat(Math.round(avgRating || 0))}</div>
                        <div className="text-xs text-[var(--muted-foreground)]">
                          {property.reviews.length} verified review{property.reviews.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>
                    {property.reviews.map((review) => (
                      <div key={review.id} className="border border-[var(--border)] rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <img src={review.studentAvatar} alt={review.studentName} className="w-9 h-9 rounded-full object-cover" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{review.studentName}</span>
                              {review.isVerifiedTenant && (
                                <span className="px-1.5 py-0.5 bg-[var(--secondary)] text-[var(--primary)] rounded text-[10px] font-semibold">
                                  ✓ Verified Tenant
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[var(--muted-foreground)]">{review.createdAt}</div>
                          </div>
                          <div className="text-yellow-500 text-sm">{"★".repeat(review.overallRating)}</div>
                        </div>
                        <p className="text-sm text-[var(--foreground)] mb-3 leading-relaxed">"{review.comment}"</p>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          {[
                            ["Cleanliness", review.cleanlinessRating],
                            ["Responsiveness", review.responsivenessRating],
                            ["Value", review.valueRating],
                          ].map(([label, val]) => (
                            <div key={label} className="bg-[var(--muted)] rounded-lg p-2 text-center">
                              <div className="text-[var(--muted-foreground)] mb-0.5">{label}</div>
                              <div className="font-semibold text-[var(--primary)]">{val}/5</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: booking card */}
        <div className="space-y-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 sticky top-24">
            <div className="mb-4">
              <span className="text-3xl font-display font-bold text-[var(--primary)]">₱{property.monthlyRent.toLocaleString()}</span>
              <span className="text-[var(--muted-foreground)] text-sm">/month</span>
            </div>
            <div className="space-y-2 text-sm mb-5">
              <div className="flex justify-between">
                <span className="text-[var(--muted-foreground)]">Security Deposit</span>
                <span className="font-medium">₱{property.securityDeposit.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted-foreground)]">Walk to ADDU</span>
                <span className="font-medium">
                  {property.walkingMinutes} min ({property.walkingMeters}m)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted-foreground)]">Safety Score</span>
                <span className={`font-semibold ${safetyColor}`}>⚡ {property.safetyScore}/10</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted-foreground)]">Rooms with space</span>
                <span className="font-medium">
                  {property.rooms.filter((room) =>
                    (room.status === "available" && !bookingForDate(room.id, today, availabilityBookings))
                    || findShareableBooking(room, availabilityBookings)
                  ).length}/{property.rooms.length}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              {userRole === "student" ? (
                <>
                  <select
                    value={bookRoom}
                    onChange={(e) => {
                      const roomId = e.target.value;
                      const room = property.rooms.find((item) => item.id === roomId);
                      const openSpot = findShareableBooking(room, availabilityBookings);
                      setBookRoom(roomId);
                      setStartDate(openSpot ? shareStartDate(openSpot) : "");
                      setShareWithMatchedRoommate(false);
                    }}
                    aria-label="Select an available room"
                    className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--muted)] text-sm"
                  >
                    <option value="">Select a room…</option>
                    {property.rooms.map((room) => {
                      const hasDateConflict = Boolean(findBookingConflict(room.id, startDate, endDate, availabilityBookings));
                      const openSpot = findShareableBooking(room, availabilityBookings);
                      const unavailable = (room.status !== "available" && !openSpot) || (hasDateConflict && !openSpot);
                      return (
                        <option key={room.id} value={room.id} disabled={unavailable}>
                          {room.name} — ₱{room.price.toLocaleString()}/mo{openSpot ? " · one roommate spot" : hasDateConflict ? " · booked for selected dates" : room.status !== "available" ? " · unavailable" : ""}
                        </option>
                      );
                    })}
                  </select>
                  <label className="block text-[10px] font-medium text-[var(--muted-foreground)]">
                    Move-In Date
                    <input
                      type="date"
                      value={startDate}
                      min={today}
                      onChange={(event) => setStartDate(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-xs text-[var(--foreground)]"
                    />
                  </label>
                  {selectedRoomConflict && <p role="alert" className="text-xs text-red-600">This room is reserved or occupied for the selected move-in date.</p>}
                  {availabilityError && <p role="status" className="text-xs text-amber-800">Could not load the live calendar. The server will still check for date conflicts when you submit.</p>}
                  {selectedShareBooking && (
                    <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-violet-950">
                      <p className="text-xs font-semibold">This room has one resident and one spot available.</p>
                      <p className="text-xs">
                        Sharing can start {shareStartDate(selectedShareBooking)}. The resident must accept, and you must be mutually matched through compatibility first.
                      </p>
                      {selectedShareBooking.status === "Confirmed" && (
                        <p className="text-[10px]">
                          From that date you pay about ₱{(selectedRoom.price / 2).toLocaleString()}/mo. Your half of the deposit will be billed; any verified excess deposit paid by the resident becomes a future rent credit.
                        </p>
                      )}
                      {selectedShareBooking.status === "Pending" && (
                        <p className="text-[10px]">
                          If the landlord confirms, rent and the security deposit will be split equally: about ₱{(selectedRoom.price / 2).toLocaleString()}/mo rent and ₱{(selectedRoom.securityDeposit / 2).toLocaleString()} deposit.
                        </p>
                      )}
                      {selectedShareBooking.isMyMatch ? (
                        <label className="flex items-start gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={shareWithMatchedRoommate}
                            onChange={(event) => setShareWithMatchedRoommate(event.target.checked)}
                            className="mt-0.5 accent-[var(--primary)]"
                          />
                          <span>Request to share this room with the current resident</span>
                        </label>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[10px]">Complete the compatibility quiz and mutually match with the current resident before requesting this spot.</p>
                          <button
                            type="button"
                            onClick={onRoommateCompatibility}
                            className="rounded-lg border border-violet-300 px-3 py-1.5 text-[10px] font-semibold"
                          >
                            Go to roommate compatibility
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {roommateMatchRequest?.selectedStudent && !selectedShareBooking && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3">
                      <label className="flex items-start gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={shareWithMatchedRoommate}
                          onChange={(event) => setShareWithMatchedRoommate(event.target.checked)}
                          disabled={!selectedRoom || selectedRoom.capacity < 2}
                          className="mt-0.5 accent-[var(--primary)]"
                        />
                        <span>
                          Invite <strong>{roommateMatchRequest.selectedStudent.name}</strong> to share this room
                        </span>
                      </label>
                      {selectedRoom?.capacity < 2 ? (
                        <p className="mt-2 text-[10px] text-[var(--muted-foreground)]">This room is listed for one person only.</p>
                      ) : shareWithMatchedRoommate && selectedRoom ? (
                        <p className="mt-2 text-[10px] text-[var(--muted-foreground)]">
                          Each student pays half after the invitation is accepted and the landlord confirms: ₱{(selectedRoom.price / 2).toLocaleString()}/mo rent and ₱{(selectedRoom.securityDeposit / 2).toLocaleString()} deposit.
                        </p>
                      ) : null}
                    </div>
                  )}
                  {roommateMatchError && (
                    <p role="status" className="text-xs text-amber-800">
                      Roommate match could not be loaded: {roommateMatchError}
                    </p>
                  )}
                  <p className="text-xs text-[var(--muted-foreground)]">Your stay renews monthly. Payment is available after the landlord confirms your booking.</p>
                  <BookRoomButton
                    studentId={session.studentId}
                    roomId={bookRoom}
                    startDate={startDate}
                    endDate={endDate}
                    roommateStudentId={!selectedShareBooking && shareWithMatchedRoommate ? roommateMatchRequest?.selectedStudent?.studentId : null}
                    joinBookingId={selectedShareBooking && shareWithMatchedRoommate ? selectedShareBooking.bookingId : null}
                    disabled={availabilityLoading || !bookRoom || !startDate || selectedRoomConflict || selectedRoomUnavailable || Boolean(selectedShareBooking && (!selectedShareBooking.isMyMatch || !shareWithMatchedRoommate))}
                    label={availabilityLoading ? "Checking availability…" : selectedShareBooking ? "Request to share" : "Book"}
                    successMessage={selectedShareBooking
                      ? selectedShareBooking.status === "Confirmed"
                        ? `Request sent. If the resident accepts, sharing starts ${shareStartDate(selectedShareBooking)}. Your deposit share will be billed, and any excess deposit paid by the resident becomes a future rent credit.`
                        : "Request sent. The current resident must accept before the landlord can confirm the shared booking."
                      : shareWithMatchedRoommate
                      ? `Invitation sent to ${roommateMatchRequest?.selectedStudent?.name}. The landlord can confirm the shared booking after they accept.`
                      : "Booking request sent. The landlord must confirm it before payment can be submitted."}
                    onBookingCreated={refreshAfterBooking}
                  />
                  <button
                    onClick={() => onStartChat({
                      accountId: property.landlordAccountId,
                      name: property.landlordName,
                      propertyTitle: property.title,
                      profilePhotoUrl: property.landlordAvatar,
                    })}
                    className="w-full py-3 border border-[var(--border)] rounded-xl font-semibold text-sm hover:bg-[var(--muted)] transition-colors"
                  >
                    💬 Message Landlord
                  </button>
                  <button onClick={handleSave} className="w-full py-2 text-sm text-[var(--primary)] hover:underline">♡ Save listing</button>
                  {bookMsg.text && (
                    <p className={`text-xs ${bookMsg.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>{bookMsg.text}</p>
                  )}
                </>
              ) : (
                <button
                  onClick={onRequireLogin}
                  className="w-full py-3 bg-[var(--primary)] text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity"
                >
                  Sign in as student to inquire
                </button>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 shrink-0 overflow-hidden rounded-full bg-[var(--primary)] text-white flex items-center justify-center font-bold">
                  {property.landlordAvatar
                    ? <img src={property.landlordAvatar} alt={`${property.landlordName} profile`} className="h-full w-full object-cover" />
                    : property.landlordName.charAt(0)}
                </div>
                <div>
                  <div className="text-xs text-[var(--muted-foreground)]">Managed by</div>
                  <div className="font-medium text-sm">{property.landlordName}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          title={lightbox.title}
          keyboardNavigation
          onClose={() => setLightbox(null)}
          onIndexChange={(index) => {
            setLightbox((current) => current && { ...current, index });
            if (lightbox.isPropertyGallery) setActiveImg(index);
          }}
        />
      )}
    </div>
  );
}

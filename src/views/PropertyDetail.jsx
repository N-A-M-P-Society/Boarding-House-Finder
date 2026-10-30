import { useState } from "react";
import { useData } from "../context/DataContext";
import LeafletMap from "../components/LeafletMap";
import { createBooking, saveListing } from "../lib/api";
export default function PropertyDetail({ propertyId, onNavigate, onStartChat, userRole, session, onRequireLogin }) {
  const { properties: PROPERTIES, gates, campus, reload } = useData();
  const property = PROPERTIES.find((p) => p.id === propertyId);
  const [bookRoom, setBookRoom] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [bookMsg, setBookMsg] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);
  async function handleBook() {
    if (!bookRoom || !startDate || !endDate) return setBookMsg({ type: "error", text: "Pick a room and both dates." });
    if (endDate <= startDate) return setBookMsg({ type: "error", text: "End date must be after the start date." });
    setBusy(true);
    try {
      await createBooking({ studentId: session.studentId, roomId: bookRoom, startDate, endDate });
      setBookMsg({ type: "ok", text: "Booking request sent. The landlord will confirm it." });
      reload();
    } catch (e) {
      setBookMsg({ type: "error", text: e.message });
    } finally {
      setBusy(false);
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
  const [activeImg, setActiveImg] = useState(0);
  const [activeTab, setActiveTab] = useState("overview");
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
            <div className="rounded-2xl overflow-hidden h-72 sm:h-96 bg-[var(--muted)]">
              <img src={property.images[activeImg]} alt={property.title} className="w-full h-full object-cover" />
            </div>
            {property.images.length > 1 && (
              <div className="flex gap-2">
                {property.images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImg(i)}
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
              {["overview", "rooms", "safety", "reviews"].map((tab) => (
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

            {activeTab === "rooms" && (
              <div className="space-y-3">
                {property.rooms.map((room) => (
                  <div key={room.id} className="border border-[var(--border)] rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{room.name}</div>
                      <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
                        Capacity: {room.capacity} person{room.capacity > 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          room.status === "available"
                            ? "bg-emerald-100 text-emerald-700"
                            : room.status === "reserved"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {room.status.charAt(0).toUpperCase() + room.status.slice(1)}
                      </span>
                      <span className="font-display font-semibold text-[var(--primary)]">₱{room.price.toLocaleString()}/mo</span>
                    </div>
                  </div>
                ))}
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
                <span className="text-[var(--muted-foreground)]">Available Rooms</span>
                <span className="font-medium">
                  {property.rooms.filter((r) => r.status === "available").length}/{property.rooms.length}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              {userRole === "student" ? (
                <>
                  <select
                    value={bookRoom}
                    onChange={(e) => setBookRoom(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--muted)] text-sm"
                  >
                    <option value="">Select a room…</option>
                    {property.rooms.filter((r) => r.status === "available").map((r) => (
                      <option key={r.id} value={r.id}>{r.name} — ₱{r.price.toLocaleString()}/mo</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--muted)] text-xs" />
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--muted)] text-xs" />
                  </div>
                  <button
                    onClick={handleBook}
                    disabled={busy}
                    className="w-full py-3 bg-[var(--primary)] text-white rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-60"
                  >
                    📅 Request Booking
                  </button>
                  <button
                    onClick={() => onStartChat({ accountId: property.landlordAccountId, name: property.landlordName, propertyTitle: property.title })}
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
                <div className="w-10 h-10 rounded-full bg-[var(--primary)] text-white flex items-center justify-center font-bold">{property.landlordName.charAt(0)}</div>
                <div>
                  <div className="text-xs text-[var(--muted-foreground)]">Managed by</div>
                  <div className="font-medium text-sm">{property.landlordName}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

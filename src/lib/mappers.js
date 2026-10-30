import { nearestGateWalk } from "./geo";

const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='500'><rect width='800' height='500' fill='#e5eef0'/><g fill='#0B5E6F' opacity='.55'><path d='M400 150 270 260h30v90h70v-60h60v60h70v-90h30z'/></g></svg>`,
  );

export const AMENITY_LABELS = {
  Aircon: "Air Conditioning",
  Fan: "Fan",
  "Wi-Fi": "WiFi",
  "Shared Bathroom": "Shared Bathroom",
  "Solo Bathroom": "Private Bathroom",
  "Study Desk": "Study Desk",
  Wardrobe: "Wardrobe",
  Refrigerator: "Refrigerator",
};
export const AMENITY_ENUM = Object.keys(AMENITY_LABELS);

const num = (v) => (v == null ? null : Number(v));
const clamp10 = (n) => Math.max(0, Math.min(10, n));
const round1 = (n) => Math.round(n * 10) / 10;

const ROOM_STATUS = { Available: "available", Reserved: "reserved", Occupied: "occupied" };
const LISTING_STATUS = { Pending: "pending", Published: "approved", Suspended: "suspended", Rejected: "rejected" };

function safetyBreakdown(inspection) {
  if (!inspection) return { policeProximity: 0, lighting: 0, gatedAccess: 0, cctv: 0 };
  const dist = num(inspection.police_distance_m);
  return {
    policeProximity: dist == null ? 0 : round1(clamp10(10 * (1 - Math.min(dist, 2000) / 2000))),
    lighting: inspection.lighting_rating ? round1(clamp10(inspection.lighting_rating * 2)) : 0,
    gatedAccess: inspection.has_gated_access ? 10 : 0,
    cctv: inspection.cctv_required ? round1(clamp10((inspection.cctv_active / inspection.cctv_required) * 10)) : 0,
  };
}

export function mapReview(r) {
  return {
    id: String(r.review_id),
    studentName: r.students?.full_name || "ADDU Student",
    studentAvatar: null,
    overallRating: r.rating_overall,
    cleanlinessRating: r.rating_cleanliness,
    responsivenessRating: r.rating_responsiveness,
    valueRating: r.rating_value,
    comment: r.comment || "",
    isVerifiedTenant: r.is_student_verified,
    createdAt: (r.created_at || "").slice(0, 10),
  };
}

export function mapRoom(r) {
  return {
    id: String(r.room_id),
    propertyId: String(r.house_id),
    name: r.room_number,
    price: num(r.monthly_rate),
    securityDeposit: num(r.security_deposit),
    status: ROOM_STATUS[r.availability_status] || "available",
    capacity: r.capacity,
    amenities: (r.amenities || []).map((a) => AMENITY_LABELS[a] || a),
  };
}

// boarding_houses row (+ nested rooms, reviews, property_inspections, landlords) -> UI property
export function mapHouse(h, gates, landlordsById = {}) {
  const landlord = landlordsById[h.landlord_id] || h.landlords || null;
  const rooms = (h.rooms || []).map(mapRoom);
  const reviews = (h.reviews || []).map(mapReview);
  const inspections = [...(h.property_inspections || [])].sort(
    (a, b) => new Date(b.inspection_date) - new Date(a.inspection_date),
  );
  const lat = num(h.latitude);
  const lng = num(h.longitude);
  const walk = nearestGateWalk(lat, lng, gates);
  const prices = rooms.map((r) => r.price).filter((p) => p != null);
  const deposits = rooms.map((r) => r.securityDeposit).filter((p) => p != null);
  const badges = [];
  if (h.badge_fast_wifi) badges.push("WiFi Verified");
  if (h.badge_24_7_water) badges.push("Water 24/7");
  if (h.badge_vetted_safe) badges.push("Vetted Safe");
  const images = Array.isArray(h.image_urls) && h.image_urls.length ? h.image_urls : [PLACEHOLDER_IMG];

  return {
    id: String(h.house_id),
    landlordId: String(h.landlord_id),
    landlordName: landlord?.full_name || "Landlord",
    landlordAccountId: landlord?.account_id ?? null,
    landlordAvatar: null,
    title: h.house_name,
    description: h.description || "",
    address: h.address,
    lat,
    lng,
    monthlyRent: prices.length ? Math.min(...prices) : 0,
    securityDeposit: deposits.length ? Math.min(...deposits) : 0,
    amenities: Array.from(new Set(rooms.flatMap((r) => r.amenities))),
    status: LISTING_STATUS[h.listing_status] || "pending",
    rejectionReason: h.rejection_reason,
    images,
    safetyScore: num(h.safety_score) ?? 0,
    safetyBreakdown: safetyBreakdown(inspections[0]),
    badges,
    walkingMinutes: walk.minutes ?? 99,
    walkingMeters: walk.meters ?? 0,
    rooms,
    reviews,
    createdAt: (h.created_at || "").slice(0, 10),
  };
}

export function mapGate(g) {
  return {
    id: String(g.gate_id),
    name: g.gate_name,
    lat: num(g.latitude),
    lng: num(g.longitude),
    isMain: g.is_main_entry,
  };
}

export const HOUSE_SELECT = `
  *,
  rooms ( * ),
  reviews ( *, students ( full_name ) ),
  property_inspections ( * )
`;

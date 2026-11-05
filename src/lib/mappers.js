
/*
  Import the nearestGateWalk function from geo.js.

  This function calculates the distance and estimated walking time
  from a property to its nearest campus gate.

  mappers.js uses it when converting database property records
  into frontend property objects.
*/
import { nearestGateWalk } from "./geo.js";

/*
  PLACEHOLDER IMAGE

  This is a default image used when a boarding house does not
  have any uploaded property images.

  The SVG creates:
  - A light-colored background.
  - A simple house illustration in the center.

  encodeURIComponent() converts special characters in the SVG
  into a format that can safely be included in a data URL.

  Because the image is stored directly as a data URL, there is
  no need to retrieve a separate image file.
*/
const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='500'><rect width='800' height='500' fill='#e5eef0'/><g fill='#0B5E6F' opacity='.55'><path d='M400 150 270 260h30v90h70v-60h60v60h70v-90h30z'/></g></svg>`,
  );

/*
  AMENITY LABELS

  Converts the amenity values stored in the database into
  more readable labels for the frontend.

  For example:
  - "Aircon" becomes "Air Conditioning"
  - "Wi-Fi" becomes "WiFi"
  - "Solo Bathroom" becomes "Private Bathroom"

  The keys are the values stored in the database.
  The values are the labels displayed to users.
*/
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

/*
  AMENITY ENUM

  Object.keys() retrieves all the keys from AMENITY_LABELS.

  This produces an array containing the allowed database amenity
  values, which can be used by forms and other frontend components.

  Example:
  ["Aircon", "Fan", "Wi-Fi", ...]
*/
export const AMENITY_ENUM = Object.keys(AMENITY_LABELS);

/*
  NUMBER CONVERSION HELPER

  Converts a value into a JavaScript number.

  If the value is null or undefined, it returns null instead.

  This is useful because database numeric values may sometimes
  arrive as strings, and the frontend needs actual numbers
  for calculations.
*/
const num = (v) => (v == null ? null : Number(v));

/*
  LIMIT VALUE TO 0–10

  Makes sure a number does not go below 0 or above 10.

  Math.max(0, ...) prevents values below zero.
  Math.min(10, ...) prevents values above ten.

  This is mainly used when calculating safety scores.
*/
const clamp10 = (n) => Math.max(0, Math.min(10, n));

/*
  ROUND TO ONE DECIMAL PLACE

  Multiplies the number by 10, rounds it to a whole number,
  then divides by 10 again.

  Example:
  8.456 becomes 8.5
  7.23 becomes 7.2
*/
const round1 = (n) => Math.round(n * 10) / 10;

/*
  ROOM STATUS MAPPING

  Converts room availability statuses from the database
  into the lowercase status values used by the frontend.

  Example:
  "Available" becomes "available"
  "Reserved" becomes "reserved"
  "Occupied" becomes "occupied"
*/
const ROOM_STATUS = {
  Available: "available",
  Reserved: "reserved",
  Occupied: "occupied"
};

/*
  LISTING STATUS MAPPING

  Converts the listing statuses from the database into
  the status names expected by the frontend.

  Example:
  "Pending" becomes "pending"
  "Published" becomes "approved"
  "Suspended" becomes "suspended"
  "Rejected" becomes "rejected"

  Notice that "Published" becomes "approved" because the
  frontend uses "approved" as its display status.
*/
const LISTING_STATUS = {
  Pending: "pending",
  Published: "approved",
  Suspended: "suspended",
  Rejected: "rejected"
};

/*
  SAFETY BREAKDOWN

  Calculates individual safety scores for a property based
  on its latest inspection information.

  The returned categories are:
  - policeProximity
  - lighting
  - gatedAccess
  - cctv

  Each category has a score between 0 and 10.
*/
function safetyBreakdown(inspection) {

  /*
    If there is no inspection record, return zero for every
    safety category because no inspection information is available.
  */
  if (!inspection) {
    return {
      policeProximity: 0,
      lighting: 0,
      gatedAccess: 0,
      cctv: 0
    };
  }

  // Convert the recorded police distance into a number.
  const dist = num(inspection.police_distance_m);

  return {

    /*
      POLICE PROXIMITY SCORE

      Calculates a score based on the property's distance
      from police assistance.

      A distance of 0 meters produces a score of 10.
      A distance of 2,000 meters or more produces a score of 0.

      Math.min(dist, 2000) prevents distances above 2,000 meters
      from making the score negative.

      If the distance is unavailable, the score is zero.
    */
    policeProximity:
      dist == null
        ? 0
        : round1(clamp10(10 * (1 - Math.min(dist, 2000) / 2000))),

    /*
      LIGHTING SCORE

      The lighting_rating is multiplied by 2 to convert
      the inspection rating into a 0–10 scale.

      For example:
      A rating of 4 becomes 8.

      If there is no lighting rating, the score is zero.
    */
    lighting:
      inspection.lighting_rating
        ? round1(clamp10(inspection.lighting_rating * 2))
        : 0,

    /*
      GATED ACCESS SCORE

      If the property has gated access, it receives 10.
      Otherwise, it receives 0.
    */
    gatedAccess: inspection.has_gated_access ? 10 : 0,

    /*
      CCTV SCORE

      Compares the number of active CCTV cameras with
      the number of required CCTV cameras.

      The result is multiplied by 10 to produce a score
      between 0 and 10.

      If cctv_required is zero or missing, the score is zero
      to avoid division by zero.
    */
    cctv:
      inspection.cctv_required
        ? round1(
            clamp10(
              (inspection.cctv_active / inspection.cctv_required) * 10
            )
          )
        : 0,
  };
}

/*
  MAP REVIEW

  Converts a review record retrieved from Supabase into
  a frontend-friendly review object.

  The input r represents one review from the reviews table,
  including its related student information.
*/
export function mapReview(r) {
  return {

    // Convert the review ID into a string for frontend consistency.
    id: String(r.review_id),

    // Use the student's full name when available.
    // Otherwise, display "ADDU Student" as a fallback.
    studentName: r.students?.full_name || "ADDU Student",

    // No student avatar is retrieved here, so use null.
    studentAvatar: null,

    // Copy the individual review ratings.
    overallRating: r.rating_overall,
    cleanlinessRating: r.rating_cleanliness,
    responsivenessRating: r.rating_responsiveness,
    valueRating: r.rating_value,

    // Use an empty string if the review has no written comment.
    comment: r.comment || "",

    // Indicates whether the reviewer is a verified student tenant.
    isVerifiedTenant: r.is_student_verified,

    // Keep only the date portion of the review creation timestamp.
    createdAt: (r.created_at || "").slice(0, 10),
  };
}

/*
  MAP ROOM

  Converts one room record from the database into
  a frontend-friendly room object.

  The input r represents one room from the rooms table.
*/
export function mapRoom(r) {
  return {

    // Room ID and property ID are converted into strings.
    id: String(r.room_id),
    propertyId: String(r.house_id),

    // Room number becomes the frontend room name.
    name: r.room_number,

    // Convert the monthly rate and security deposit into numbers.
    price: num(r.monthly_rate),
    securityDeposit: num(r.security_deposit),

    /*
      Convert the database availability status into
      the lowercase status expected by the frontend.

      If the database status is not recognized, default to available.
    */
    status: ROOM_STATUS[r.availability_status] || "available",

    // Maximum number of occupants allowed in the room.
    capacity: r.capacity,

    /*
      Convert database amenity values into readable frontend labels.

      Example:
      ["Aircon", "Wi-Fi"] becomes
      ["Air Conditioning", "WiFi"].

      If an amenity does not exist in AMENITY_LABELS,
      its original value is used instead.
    */
    amenities: (r.amenities || []).map(
      (a) => AMENITY_LABELS[a] || a
    ),
  };
}

/*
  MAP HOUSE

  This is the main property-mapping function.

  It converts a boarding_houses database record into
  a complete property object that the UniRent frontend can use.

  The database record may include related information:
  - rooms
  - reviews
  - property_inspections
  - landlords

  Parameters:
  - h: boarding house database record
  - gates: available campus gate coordinates
  - landlordsById: landlord records organized by landlord ID

  The returned object contains the property's information,
  room details, reviews, safety information, images, and
  estimated walking distance.
*/
export function mapHouse(h, gates, landlordsById = {}) {

  /*
    FIND THE LANDLORD

    First, try to find the landlord in landlordsById using
    the property's landlord_id.

    If that does not exist, use the landlord information
    already included in the database record (h.landlords).

    If neither is available, use null.
  */
  const landlord =
    landlordsById[h.landlord_id] || h.landlords || null;

  /*
    MAP RELATED ROOMS

    Convert every room database record into the frontend
    room structure by using mapRoom().
  */
  const rooms = (h.rooms || []).map(mapRoom);

  /*
    MAP RELATED REVIEWS

    Convert every review database record using mapReview().
  */
  const reviews = (h.reviews || []).map(mapReview);

  /*
    SORT PROPERTY INSPECTIONS

    Copy the inspection array using the spread operator (...)
    so the original array is not sorted directly.

    Then sort inspections by inspection_date in descending order.

    The newest inspection appears first.
  */
  const inspections = [...(h.property_inspections || [])].sort(
    (a, b) =>
      new Date(b.inspection_date) - new Date(a.inspection_date),
  );

  /*
    PROPERTY COORDINATES

    Convert the property's latitude and longitude into numbers.

    These coordinates are used by the map and distance calculations.
  */
  const lat = num(h.latitude);
  const lng = num(h.longitude);

  /*
    CALCULATE WALKING DISTANCE

    Use nearestGateWalk() from geo.js to calculate the distance
    and estimated walking time to the nearest campus gate.

    The function checks all available gates and chooses
    the closest one.
  */
  const walk = nearestGateWalk(lat, lng, gates);

  /*
    COLLECT ROOM PRICES

    Extract the monthly rental prices from all mapped rooms.

    filter() removes null values so missing prices are not
    included in the calculation.
  */
  const prices = rooms
    .map((r) => r.price)
    .filter((p) => p != null);

  /*
    COLLECT SECURITY DEPOSITS

    Extract all available room security deposits.

    Null values are removed before calculating the minimum.
  */
  const deposits = rooms
    .map((r) => r.securityDeposit)
    .filter((p) => p != null);

  /*
    PROPERTY BADGES

    Start with an empty array.

    Depending on the property's database values, add badges
    that communicate verified property features to users.
  */
  const badges = [];

  // Add the WiFi badge if the property has verified fast WiFi.
  if (h.badge_fast_wifi) badges.push("WiFi Verified");

  // Add the water availability badge if 24/7 water is verified.
  if (h.badge_24_7_water) badges.push("Water 24/7");

  // Add the safety badge if the property has passed the relevant check.
  if (h.badge_vetted_safe) badges.push("Vetted Safe");

  /*
    PROPERTY IMAGES

    Check whether image_urls is an array containing at least one image.

    If images exist, use them.
    Otherwise, use the placeholder house image.

    This prevents the frontend from having an empty image list.
  */
  const images =
    Array.isArray(h.image_urls) && h.image_urls.length
      ? h.image_urls
      : [PLACEHOLDER_IMG];

  /*
    RETURN THE COMPLETE FRONTEND PROPERTY OBJECT

    The following object combines the original property data
    with information calculated or mapped above.

    Its property names are designed for convenient use
    in React components.
  */
  return {

    // Convert database IDs into strings for consistent frontend use.
    id: String(h.house_id),
    landlordId: String(h.landlord_id),

    // Use the landlord's full name if available.
    landlordName: landlord?.full_name || "Landlord",

    // Use null if the landlord's account ID is unavailable.
    landlordAccountId: landlord?.account_id ?? null,

    // No landlord avatar is retrieved here.
    landlordAvatar: null,

    // Basic property information.
    title: h.house_name,
    description: h.description || "",
    address: h.address,

    // Property coordinates for map display.
    lat,
    lng,

    /*
      MONTHLY RENT

      Find the lowest monthly room price within the property.

      Math.min(...prices) uses the spread operator to pass
      all prices as individual arguments.

      If there are no room prices, use 0.

      This means the property's displayed monthly rent represents
      its cheapest available room price, not an average price.
    */
    monthlyRent: prices.length ? Math.min(...prices) : 0,

    /*
      SECURITY DEPOSIT

      Find the lowest security deposit among the property's rooms.

      If no deposits are available, use 0.
    */
    securityDeposit: deposits.length
      ? Math.min(...deposits)
      : 0,

    /*
      COMBINE PROPERTY AMENITIES

      Each room may have its own amenities.

      flatMap() combines all room amenity arrays into one array.

      Set removes duplicate amenities.
      Array.from() converts the Set back into an array.

      This creates one combined list of amenities for the property.
    */
    amenities: Array.from(
      new Set(rooms.flatMap((r) => r.amenities))
    ),

    /*
      LISTING STATUS

      Convert the database listing status into the frontend status.

      If the status is not recognized, default to "pending".
    */
    status: LISTING_STATUS[h.listing_status] || "pending",

    // Include the reason if the property listing was rejected.
    rejectionReason: h.rejection_reason,

    // Include the property's images or its placeholder image.
    images,

    /*
      SAFETY SCORE

      Convert the property's overall safety score into a number.

      If the database value is missing, use zero.
    */
    safetyScore: num(h.safety_score) ?? 0,

    /*
      SAFETY BREAKDOWN

      Use the newest inspection record to calculate the individual
      safety category scores.

      inspections[0] is the newest inspection because the array
      was sorted earlier.

      If there are no inspections, safetyBreakdown() returns zeros.
    */
    safetyBreakdown: safetyBreakdown(inspections[0]),

    // Include the verified property badges.
    badges,

    /*
      WALKING DISTANCE

      Use the estimated walking time calculated by nearestGateWalk().

      If the walking time is null, use 99 as a frontend fallback.

      The 99 value is a placeholder; it does not mean the property
      actually takes 99 minutes to reach.
    */
    walkingMinutes: walk.minutes ?? 99,

    // Use zero if the walking distance is unavailable.
    walkingMeters: walk.meters ?? 0,

    // Include the already-mapped room and review arrays.
    rooms,
    reviews,

    // Keep only the date portion of the property's creation timestamp.
    createdAt: (h.created_at || "").slice(0, 10),
  };
}

/*
  MAP GATE

  Converts one campus gate database record into
  a frontend-friendly gate object.

  The resulting object can be used by LeafletMap and geo.js.
*/
export function mapGate(g) {
  return {

    // Convert the database gate ID into a string.
    id: String(g.gate_id),

    // Name displayed for the campus gate.
    name: g.gate_name,

    // Convert the gate's geographical coordinates into numbers.
    lat: num(g.latitude),
    lng: num(g.longitude),

    // Indicates whether this is the main campus entrance.
    isMain: g.is_main_entry,
  };
}

/*
  HOUSE SELECT QUERY

  This string defines which database information should be
  retrieved when fetchHouses() queries the boarding_houses table.

  It requests:
  - All boarding house columns (*)
  - All related room records
  - All related reviews, including each reviewer's full name
  - All related property inspection records

  Supabase uses the database relationships to retrieve
  the nested information in the same query.

  The returned data is later processed by mapHouse().
*/
export const HOUSE_SELECT = `
  *,
  rooms ( * ),
  reviews ( *, students ( full_name ) ),
  property_inspections ( * )
`;

import { supabase } from "./supabase.js";
import { HOUSE_SELECT, mapGate, mapHouse } from "./mappers.js";

const fail = (error) => {
  if (error) throw new Error(error.message || String(error));
};

/* ───────────────────────── Auth ───────────────────────── */
const ROLE_TO_UI = { Student: "student", Landlord: "landlord", Admin: "admin", SuperAdmin: "admin" };
export const uiRole = (dbRole) => ROLE_TO_UI[dbRole] || "student";

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  fail(error);
  return data;
}

// The SQL trigger builds accounts + students/landlords rows from this metadata.
export async function signUp({ email, password, fullName, role }) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { role: role === "landlord" ? "Landlord" : "Student", full_name: fullName } },
  });
  fail(error);
  return data; // data.session is null when email confirmation is enabled
}

export const signOut = () => supabase.auth.signOut();

// account + role-specific profile for the signed-in user
export async function loadProfile() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: account, error } = await supabase
    .from("accounts")
    .select("account_id, email, role, mfa_enabled")
    .eq("auth_id", auth.user.id)
    .maybeSingle();
  fail(error);
  if (!account) return null;

  const profile = { accountId: account.account_id, email: account.email, dbRole: account.role, role: uiRole(account.role) };
  if (account.role === "Student") {
    const { data } = await supabase.from("students").select("*").eq("account_id", account.account_id).maybeSingle();
    Object.assign(profile, { studentId: data?.student_id, name: data?.full_name, student: data });
  } else if (account.role === "Landlord") {
    const { data } = await supabase.from("landlords").select("*").eq("account_id", account.account_id).maybeSingle();
    Object.assign(profile, { landlordId: data?.landlord_id, name: data?.full_name, landlord: data });
  } else {
    profile.name = account.email.split("@")[0];
  }
  return profile;
}

export async function updateStudentProfile(studentId, patch) {
  const { error } = await supabase.from("students").update(patch).eq("student_id", studentId);
  fail(error);
}
export async function updateLandlordProfile(landlordId, patch) {
  const { error } = await supabase.from("landlords").update(patch).eq("landlord_id", landlordId);
  fail(error);
}

/* ───────────────────────── Listings ───────────────────────── */
export async function fetchGates() {
  const { data, error } = await supabase.from("campus_gates").select("*");
  fail(error);
  return (data || []).map(mapGate);
}

// RLS decides what comes back: public sees Published, landlords also see their own, staff see all.
export async function fetchHouses(gates) {
  const { data, error } = await supabase.from("boarding_houses").select(HOUSE_SELECT).order("house_id");
  fail(error);
  // landlord_public is a safe view (name + account only) from supabase_additions.sql
  const { data: ll } = await supabase.from("landlord_public").select("landlord_id, account_id, full_name");
  const byId = Object.fromEntries((ll || []).map((l) => [l.landlord_id, l]));
  return (data || []).map((h) => mapHouse(h, gates, byId));
}

export async function createHouse({ title, address, description, lat, lng }) {
  // landlord_id is auto-assigned by the enforce_landlord_identity trigger
  const { data, error } = await supabase
    .from("boarding_houses")
    .insert({ house_name: title, address, description, latitude: lat ?? null, longitude: lng ?? null })
    .select("house_id")
    .single();
  fail(error);
  return data.house_id;
}

export async function updateHouse(houseId, patch) {
  const { error } = await supabase.from("boarding_houses").update(patch).eq("house_id", houseId);
  fail(error);
}

export async function createRoom(houseId, { roomNumber, monthlyRate, securityDeposit, capacity, amenities }) {
  const { error } = await supabase.from("rooms").insert({
    house_id: houseId,
    room_number: roomNumber,
    monthly_rate: monthlyRate,
    security_deposit: securityDeposit ?? 0,
    capacity: capacity ?? 1,
    amenities: amenities ?? [],
  });
  fail(error);
}

export async function updateRoom(roomId, patch) {
  const { error } = await supabase.from("rooms").update(patch).eq("room_id", roomId);
  fail(error);
}

export async function submitVerification(docs = {}) {
  // landlord_id defaults to auth_landlord_id() in SQL
  const { data, error } = await supabase
    .from("property_verifications")
    .insert({
      business_permit_url: docs.businessPermitUrl ?? null,
      isp_bill_url: docs.ispBillUrl ?? null,
      water_proof_url: docs.waterProofUrl ?? null,
      safety_audit_url: docs.safetyAuditUrl ?? null,
    })
    .select("verification_id")
    .single();
  fail(error);
  return data.verification_id;
}

/* ───────────────────────── Student actions ───────────────────────── */
export async function fetchSavedHouseIds(studentId) {
  const { data, error } = await supabase.from("saved_listings").select("house_id").eq("student_id", studentId);
  fail(error);
  return (data || []).map((r) => String(r.house_id));
}
export async function saveListing(studentId, houseId) {
  const { error } = await supabase.from("saved_listings").insert({ student_id: studentId, house_id: Number(houseId) });
  if (error && error.code !== "23505") fail(error);
}
export async function unsaveListing(studentId, houseId) {
  const { error } = await supabase.from("saved_listings").delete().eq("student_id", studentId).eq("house_id", Number(houseId));
  fail(error);
}

export async function createBooking({ studentId, roomId, startDate, endDate }) {
  const { data, error } = await supabase
    .from("bookings")
    .insert({ student_id: studentId, room_id: Number(roomId), start_date: startDate, end_date: endDate, status: "Pending" })
    .select("booking_id")
    .single();
  if (error) {
    if (error.code === "23P01") throw new Error("That room is already booked for those dates.");
    fail(error);
  }
  return data.booking_id;
}

export async function fetchBookings() {
  const { data, error } = await supabase
    .from("bookings")
    .select("*, students ( full_name, student_id_number ), rooms ( room_id, room_number, monthly_rate, house_id, boarding_houses ( house_name ) )")
    .order("created_at", { ascending: false });
  fail(error);
  return (data || []).map((b) => ({
    id: String(b.booking_id),
    studentId: String(b.student_id),
    studentName: b.students?.full_name || "Student",
    roomId: String(b.room_id),
    roomName: b.rooms?.room_number,
    propertyId: String(b.rooms?.house_id),
    propertyTitle: b.rooms?.boarding_houses?.house_name,
    monthlyRate: Number(b.rooms?.monthly_rate || 0),
    startDate: b.start_date,
    endDate: b.end_date,
    status: b.status,
    createdAt: (b.created_at || "").slice(0, 10),
  }));
}

export async function setBookingStatus(bookingId, status) {
  const { error } = await supabase.from("bookings").update({ status }).eq("booking_id", Number(bookingId));
  fail(error);
}

export async function fetchPayments() {
  const { data, error } = await supabase.from("payments").select("*").order("payment_date", { ascending: false });
  fail(error);
  return data || [];
}
export async function createPayment({ bookingId, amount, paymentType, paymentMethod, receiptUrl }) {
  const { error } = await supabase.from("payments").insert({
    booking_id: Number(bookingId),
    amount,
    payment_type: paymentType,
    payment_method: paymentMethod ?? null,
    receipt_url: receiptUrl ?? null,
    verification_status: "Pending",
  });
  fail(error);
}
export async function setPaymentStatus(paymentId, status) {
  const { error } = await supabase.from("payments").update({ verification_status: status }).eq("payment_id", paymentId);
  fail(error);
}

export async function fetchComparisonRoomIds(studentId) {
  const { data, error } = await supabase.from("room_comparisons").select("room_id").eq("student_id", studentId);
  fail(error);
  return (data || []).map((r) => String(r.room_id));
}
export async function addComparison(studentId, roomId) {
  const { error } = await supabase.from("room_comparisons").insert({ student_id: studentId, room_id: Number(roomId) });
  if (error && error.code !== "23505") fail(error);
}
export async function removeComparison(studentId, roomId) {
  const { error } = await supabase.from("room_comparisons").delete().eq("student_id", studentId).eq("room_id", Number(roomId));
  fail(error);
}

export async function createReview({ studentId, houseId, overall, cleanliness, responsiveness, value, comment }) {
  const { error } = await supabase.from("reviews").insert({
    student_id: studentId,
    house_id: Number(houseId),
    rating_overall: overall,
    rating_cleanliness: cleanliness,
    rating_responsiveness: responsiveness,
    rating_value: value,
    comment,
  });
  fail(error);
}

/* ───────────────────────── Messaging ───────────────────────── */
export async function fetchMessages(myAccountId) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(`sender_id.eq.${myAccountId},receiver_id.eq.${myAccountId}`)
    .order("created_at", { ascending: true });
  fail(error);
  return data || [];
}
export async function sendMessage(senderId, receiverId, content) {
  const { data, error } = await supabase
    .from("messages")
    .insert({ sender_id: senderId, receiver_id: receiverId, content })
    .select()
    .single();
  fail(error);
  return data;
}
export async function markRead(messageIds) {
  if (!messageIds.length) return;
  const { error } = await supabase.from("messages").update({ is_read: true }).in("message_id", messageIds);
  fail(error);
}
// Names of people I exchange messages with (message_peers view from supabase_additions.sql)
export async function fetchAccountNames(accountIds) {
  if (!accountIds.length) return {};
  const { data } = await supabase.from("message_peers").select("account_id, full_name, role").in("account_id", accountIds);
  const names = {};
  (data || []).forEach((r) => (names[r.account_id] = { name: r.full_name, role: r.role === "Landlord" ? "landlord" : "student" }));
  return names;
}

/* ───────────────────────── Admin ───────────────────────── */
export async function fetchPendingVerifications() {
  const { data, error } = await supabase
    .from("property_verifications")
    .select("*, landlords ( full_name )")
    .eq("verification_status", "Pending");
  fail(error);
  return data || [];
}

export async function writeAudit({ adminId, action, reason, targetTable, targetId }) {
  const { error } = await supabase
    .from("audit_logs")
    .insert({ admin_id: adminId, action_taken: action, reason, target_table: targetTable, target_id: Number(targetId) });
  fail(error);
}

export async function fetchAuditLogs() {
  const { data, error } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false });
  fail(error);
  return data || [];
}

export async function moderateHouse({ adminId, houseId, status, reason }) {
  const { error } = await supabase
    .from("boarding_houses")
    .update({ listing_status: status, rejection_reason: status === "Rejected" || status === "Suspended" ? reason : null })
    .eq("house_id", Number(houseId));
  fail(error);
  await writeAudit({
    adminId,
    action: `${status.toUpperCase()}_LISTING`,
    reason,
    targetTable: "boarding_houses",
    targetId: houseId,
  });
}

export async function recordInspection({ adminId, houseId, policeDistanceM, lightingRating, hasGatedAccess, cctvActive, cctvRequired }) {
  const { error } = await supabase.from("property_inspections").insert({
    house_id: Number(houseId),
    admin_id: adminId,
    police_distance_m: policeDistanceM,
    lighting_rating: lightingRating,
    has_gated_access: hasGatedAccess,
    cctv_active: cctvActive,
    cctv_required: cctvRequired,
  });
  fail(error);
}

export async function setVerificationStatus({ adminId, verificationId, status, reason }) {
  const { error } = await supabase
    .from("property_verifications")
    .update({
      verification_status: status,
      rejection_reason: status === "Rejected" ? reason : null,
      admin_reviewer_id: adminId,
      verified_at: status === "Approved" ? new Date().toISOString() : null,
    })
    .eq("verification_id", Number(verificationId));
  fail(error);
  await writeAudit({ adminId, action: `${status.toUpperCase()}_VERIFICATION`, reason, targetTable: "property_verifications", targetId: verificationId });
}

export async function setReviewHidden({ adminId, reviewId, hidden, reason }) {
  const { error } = await supabase.from("reviews").update({ is_hidden: hidden }).eq("review_id", Number(reviewId));
  fail(error);
  await writeAudit({ adminId, action: hidden ? "REMOVED_REVIEW" : "RESTORED_REVIEW", reason, targetTable: "reviews", targetId: reviewId });
}

export async function fetchSettings() {
  const { data, error } = await supabase.from("system_settings").select("*");
  fail(error);
  return data || [];
}
export async function updateSetting(key, value, accountId) {
  const { error } = await supabase
    .from("system_settings")
    .update({ setting_value: value, updated_by: accountId, updated_at: new Date().toISOString() })
    .eq("setting_key", key);
  fail(error);
}

export async function fetchModerationReviews() {
  const { data, error } = await supabase
    .from("reviews")
    .select("*, students ( full_name ), boarding_houses ( house_name )")
    .order("created_at", { ascending: false });
  fail(error);
  return (data || []).map((r) => ({
    id: String(r.review_id),
    studentName: r.students?.full_name || "Student",
    propertyTitle: r.boarding_houses?.house_name || "",
    date: (r.created_at || "").slice(0, 10),
    rating: r.rating_overall || 0,
    comment: r.comment || "",
    reason: "—",
    status: r.is_hidden ? "hidden" : "flagged", // "flagged" = visible & moderatable (schema has no flag column)
  }));
}

export async function fetchAuditEntries() {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*, accounts ( email )")
    .order("created_at", { ascending: false });
  fail(error);
  const categoryOf = (t) => ({ boarding_houses: "listing", property_verifications: "verification", reviews: "review", property_inspections: "safety", system_settings: "system" }[t] || "account");
  return (data || []).map((l) => ({
    id: String(l.log_id),
    admin: l.accounts?.email?.split("@")[0] || `admin-${l.admin_id}`,
    adminId: String(l.admin_id),
    action: l.action_taken,
    category: categoryOf(l.target_table),
    target: `${l.target_table} #${l.target_id}`,
    targetId: String(l.target_id),
    reason: l.reason,
    at: new Date(l.created_at).toISOString().slice(0, 16).replace("T", " "),
    ip: "—",
    sessionId: `log-${l.log_id}`,
    severity: /REJECT|SUSPEND|REMOV/.test(l.action_taken) ? "warning" : "info",
    meta: { table: l.target_table },
  }));
}

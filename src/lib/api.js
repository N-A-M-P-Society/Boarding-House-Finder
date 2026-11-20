
import { supabase } from "./supabase.js";
import { HOUSE_SELECT, mapGate, mapHouse } from "./mappers.js";

export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

const fail = (error) => {
  if (error) throw new Error(GENERIC_ERROR_MESSAGE);
};

const PUBLIC_MEDIA_BUCKET = "unirent-images";
const PRIVATE_DOCUMENT_BUCKET = "unirent-verification";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const DOCUMENT_TYPES = [...IMAGE_TYPES, "application/pdf"];

async function uploadStorageFiles(files, bucket, folder, allowedTypes, maxBytes, makePublicUrl) {
  const selectedFiles = Array.from(files || []);
  if (selectedFiles.length === 0) return [];

  const { data: authData, error: authError } = await supabase.auth.getUser();
  fail(authError);
  if (!authData.user) throw new Error("Sign in before uploading files.");

  const uploadedPaths = [];
  const results = [];
  try {
    for (const file of selectedFiles) {
      if (!allowedTypes.includes(file.type)) {
        throw new Error(`Unsupported file type for "${file.name}".`);
      }
      if (file.size > maxBytes) {
        throw new Error(`"${file.name}" is too large. Maximum size is ${Math.round(maxBytes / 1024 / 1024)} MB.`);
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${folder}/${authData.user.id}/${crypto.randomUUID()}-${safeName}`;
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: false });
      fail(error);
      uploadedPaths.push(data.path);
      results.push(makePublicUrl ? supabase.storage.from(bucket).getPublicUrl(data.path).data.publicUrl : data.path);
    }
    return results;
  } catch (error) {
    if (uploadedPaths.length > 0) {
      const { error: cleanupError } = await supabase.storage.from(bucket).remove(uploadedPaths);
      if (cleanupError) {
        throw new Error(GENERIC_ERROR_MESSAGE);
      }
    }
    throw error;
  }
}

export async function uploadPublicImages(files, folder) {
  if (!["profiles", "listings", "rooms"].includes(folder)) {
    throw new Error("Invalid image upload folder.");
  }
  return uploadStorageFiles(files, PUBLIC_MEDIA_BUCKET, folder, IMAGE_TYPES, 8 * 1024 * 1024, true);
}

export async function uploadVerificationDocuments(files) {
  return uploadStorageFiles(files, PRIVATE_DOCUMENT_BUCKET, "verification", DOCUMENT_TYPES, 10 * 1024 * 1024, false);
}

export async function uploadPaymentProof(file) {
  const [path] = await uploadStorageFiles([file], PRIVATE_DOCUMENT_BUCKET, "payments", DOCUMENT_TYPES, 10 * 1024 * 1024, false);
  return path;
}

async function signedVerificationDocument(path) {
  if (!path) return null;
  if (/^https:\/\//i.test(path)) return path;
  if (!path.startsWith("verification/")) return null;

  const { data, error } = await supabase.storage
    .from(PRIVATE_DOCUMENT_BUCKET)
    .createSignedUrl(path, 60 * 60);
  fail(error);
  return data.signedUrl;
}

export async function getPaymentProofUrl(path) {
  if (!path) return null;
  if (!path.startsWith("payments/")) throw new Error("Invalid payment proof path.");

  const { data, error } = await supabase.storage
    .from(PRIVATE_DOCUMENT_BUCKET)
    .createSignedUrl(path, 60 * 60);
  fail(error);
  return data.signedUrl;
}

/* ───────────────────────── Auth ───────────────────────── */

/*
  Converts role names from the database into the lowercase role names
  used by the frontend.

  Example:
  "Student"    becomes "student"
  "Landlord"   becomes "landlord"
  "Admin"      becomes "admin"
  "SuperAdmin" becomes "admin"
*/
const ROLE_TO_UI = {
  Student: "student",
  Landlord: "landlord",
  Admin: "admin",
  SuperAdmin: "admin"
};

// Converts a database role into the corresponding frontend role.
// If the role is not recognized, it defaults to "student".
export const uiRole = (dbRole) => ROLE_TO_UI[dbRole] || "student";

/*
  SIGN IN

  Authenticates an existing user through Supabase.

  Parameters:
  - email: the user's email address
  - password: the user's password

  trim() removes unnecessary spaces around the email.
  toLowerCase() makes the email lowercase so capitalization
  does not cause sign-in problems.

  signInWithPassword() checks the credentials using Supabase Auth.
*/
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password
  });

  // Stop and report the error if authentication fails.
  fail(error);

  // Return the authentication result, including user/session data.
  return data;
}

export async function requestPasswordReset(email, redirectTo) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo,
  });
  fail(error);
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  fail(error);
}

/*
  SIGN UP

  Creates a new user account through Supabase Auth.

  The function receives an object containing:
  - email: user's email
  - password: chosen password
  - fullName: user's complete name
  - role: frontend role ("student" or "landlord")

  The role and full name are saved as user metadata.
  A SQL trigger uses this metadata to create the related
  accounts and students/landlords database records.
*/
export async function signUp({ email, password, fullName, role, studentIdNumber, academicYear, gender, phoneNumber }) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,

    // Metadata is additional information stored with the Auth user.
    options: {
      data: {
        // Convert the frontend role into the database's role format.
        role: role === "landlord" ? "Landlord" : "Student",

        // Save the user's full name in the metadata.
        full_name: fullName,
        ...(role === "student"
          ? {
              student_id_number: studentIdNumber,
              academic_year: academicYear,
              gender,
              phone_number: phoneNumber || null
            }
          : {})
      }
    },
  });

  fail(error);

  // Return the registration result.
  // data.session may be null when email confirmation is required.
  return data;
}

// Signs out the currently authenticated user.
export const signOut = () => supabase.auth.signOut();

/*
  LOAD PROFILE

  Retrieves the currently signed-in user's account and role-specific
  profile information.

  This function is useful after login because the application needs
  to know who the user is and which role they have.
*/
export async function loadProfile() {

  // Ask Supabase Auth for the currently authenticated user.
  const { data: auth } = await supabase.auth.getUser();

  // If nobody is signed in, there is no profile to load.
  if (!auth?.user) return null;

  // Find the user's account record using their Supabase Auth ID.
  const { data: account, error } = await supabase
    .from("accounts")
    .select("account_id, email, role, mfa_enabled, profile_photo_url")
    .eq("auth_id", auth.user.id)
    .maybeSingle();

  fail(error);

  // If the account record does not exist, return null.
  if (!account) return null;

  // Create a basic profile object containing common account information.
  const profile = {
    accountId: account.account_id,
    email: account.email,
    dbRole: account.role,
    role: uiRole(account.role),
    profile_photo_url: account.profile_photo_url
  };

  /*
    If the user is a student, retrieve their student-specific record.
    The student table contains information such as their full name
    and student ID.
  */
  if (account.role === "Student") {
    const { data } = await supabase
      .from("students")
      .select("*")
      .eq("account_id", account.account_id)
      .maybeSingle();

    // Add student information to the profile object.
    Object.assign(profile, {
      studentId: data?.student_id,
      name: data?.full_name,
      student: data
    });

  /*
    If the user is a landlord, retrieve their landlord-specific record.
    This provides the landlord's profile information.
  */
  } else if (account.role === "Landlord") {
    const { data } = await supabase
      .from("landlords")
      .select("*")
      .eq("account_id", account.account_id)
      .maybeSingle();

    // Add landlord information to the profile object.
    Object.assign(profile, {
      landlordId: data?.landlord_id,
      name: data?.full_name,
      landlord: data
    });

  /*
    Admin and other account types do not use the student or landlord
    profile tables here. Their display name is taken from their email.
  */
  } else {
    profile.name = account.email.split("@")[0];
  }

  // Return the completed profile to the frontend.
  return profile;
}

/*
  UPDATE STUDENT PROFILE

  Updates an existing student's information.

  Parameters:
  - studentId: identifies which student record to update
  - patch: an object containing the fields and new values

  patch can contain only the fields that need to be changed.
*/
export async function updateStudentProfile(studentId, patch) {
  const { error } = await supabase
    .from("students")
    .update(patch)
    .eq("student_id", studentId);

  fail(error);
}

/*
  UPDATE LANDLORD PROFILE

  Works similarly to updateStudentProfile(), but updates
  the landlords table instead.
*/
export async function updateLandlordProfile(landlordId, patch) {
  const { error } = await supabase
    .from("landlords")
    .update(patch)
    .eq("landlord_id", landlordId);

  fail(error);
}

export async function updateAccountProfile(accountId, patch) {
  const { error } = await supabase
    .from("accounts")
    .update(patch)
    .eq("account_id", accountId);

  fail(error);
}

/* ───────────────────────── Listings ───────────────────────── */

/*
  FETCH GATES

  Retrieves all campus gates from the campus_gates table.

  mapGate converts each database record into the format expected
  by the frontend.
*/
export async function fetchGates() {
  const { data, error } = await supabase
    .from("campus_gates")
    .select("*");

  fail(error);

  // Return an array of mapped gates.
  // If Supabase returns null, use an empty array instead.
  return (data || []).map(mapGate);
}

/*
  FETCH HOUSES

  Retrieves boarding house listings from the database.

  The gates parameter is passed to mapHouse so property information
  can be connected with the campus gate data.

  Row Level Security (RLS) controls which listings the current user
  is allowed to retrieve:
  - Public users can see published listings.
  - Landlords can also see their own listings.
  - Staff can see listings according to their database permissions.
*/
export async function fetchHouses(gates) {
  const { data, error } = await supabase
    .from("boarding_houses")
    .select(HOUSE_SELECT)
    .order("house_id");

  fail(error);

  /*
    Retrieve limited landlord information from the landlord_public view.

    This view is defined in supabase_additions.sql.
    It exposes only selected public information instead of retrieving
    every column from the landlords table.
  */
  const { data: ll } = await supabase
    .from("landlord_public")
    .select("landlord_id, account_id, full_name, profile_photo_url");

  /*
    Convert the landlord records into an object indexed by landlord_id.

    Example:
    {
      1: { landlord_id: 1, full_name: "John" },
      2: { landlord_id: 2, full_name: "Jane" }
    }

    This makes it easier for mapHouse() to find the landlord
    associated with each property.
  */
  const byId = Object.fromEntries(
    (ll || []).map((l) => [l.landlord_id, l])
  );

  // Convert every database house record into the frontend format.
  return (data || []).map((h) => mapHouse(h, gates, byId));
}

/*
  CREATE HOUSE

  Inserts a new boarding house listing into the database.

  The function receives:
  - title: property name
  - address: property address
  - description: property description
  - lat: latitude coordinate
  - lng: longitude coordinate

  The landlord_id is automatically assigned by the
  enforce_landlord_identity SQL trigger.
*/
export async function createHouse({
  title,
  address,
  description,
  lat,
  lng,
  genderPolicy = "Any",
  images = []
}) {
  const { data, error } = await supabase
    .from("boarding_houses")
    .insert({
      house_name: title,
      address,
      description,

      // Use null if latitude or longitude was not provided.
      latitude: lat ?? null,
      longitude: lng ?? null,
      gender_policy: genderPolicy,
      image_urls: images
    })

    // Return only the newly created house ID.
    .select("house_id")
    .single();

  fail(error);

  // Return the ID so it can be used when creating rooms for this house.
  return data.house_id;
}

/*
  UPDATE HOUSE

  Updates an existing boarding house listing.

  houseId identifies the property.
  patch contains the database fields that need to be updated.
*/
export async function updateHouse(houseId, patch) {
  const { error } = await supabase
    .from("boarding_houses")
    .update(patch)
    .eq("house_id", houseId);

  fail(error);
}

const BADGE_REVIEW_FIELDS = {
  badge_fast_wifi: { reasonField: "badge_fast_wifi_reason", label: "WiFi Verified" },
  badge_24_7_water: { reasonField: "badge_24_7_water_reason", label: "Water 24/7" },
  badge_vetted_safe: { reasonField: "badge_vetted_safe_reason", label: "Vetted Safe" },
};

export async function reviewListingBadge({ adminId, houseId, badgeField, enabled, reason = "" }) {
  const badge = Object.prototype.hasOwnProperty.call(BADGE_REVIEW_FIELDS, badgeField)
    ? BADGE_REVIEW_FIELDS[badgeField]
    : null;
  if (!badge) throw new Error("Choose a valid verification badge.");

  const normalizedReason = reason.trim();
  if (!enabled && !normalizedReason) {
    throw new Error("Enter a reason before disabling this badge.");
  }

  const { error } = await supabase
    .from("boarding_houses")
    .update({
      [badgeField]: Boolean(enabled),
      [badge.reasonField]: enabled ? null : normalizedReason,
    })
    .eq("house_id", Number(houseId));

  fail(error);
  await writeAudit({
    adminId,
    action: enabled ? "ENABLED_LISTING_BADGE" : "DISABLED_LISTING_BADGE",
    reason: enabled ? `Enabled ${badge.label}.` : `${badge.label}: ${normalizedReason}`,
    targetTable: "boarding_houses",
    targetId: houseId,
  });
}

/*
  CREATE ROOM

  Adds a room to an existing boarding house.

  Parameters:
  - houseId: the property this room belongs to
  - roomNumber: room identifier or number
  - monthlyRate: monthly rental price
  - securityDeposit: required security deposit
  - capacity: maximum number of occupants
  - amenities: room features

  The ?? operator supplies a default value when a field is null
  or undefined.
*/
export async function createRooms(houseId, rooms) {
  if (!Array.isArray(rooms) || rooms.length === 0) {
    throw new Error("Add at least one room.");
  }

  const { data, error } = await supabase
    .from("rooms")
    .insert(rooms.map((room) => ({
      house_id: houseId,
      room_number: room.roomNumber,
      monthly_rate: room.monthlyRate,
      security_deposit: room.securityDeposit ?? 0,
      capacity: room.capacity ?? 1,
      availability_status: room.availabilityStatus ?? "Available",
      unavailable_reason: room.availabilityStatus === "Unavailable"
        ? room.unavailableReason?.trim() || null
        : null,
      amenities: room.amenities ?? [],
      image_urls: room.images ?? [],
    })))
    .select("room_id");

  fail(error);
  return (data || []).map((room) => String(room.room_id));
}

export async function createRoom(houseId, room) {
  const [roomId] = await createRooms(houseId, [room]);
  if (!roomId) throw new Error("Room could not be saved. Please try again.");
  return roomId;
}

/*
  UPDATE ROOM

  Updates the information of an existing room.
  roomId identifies the room, while patch contains the new values.
*/
export async function updateRoom(roomId, patch) {
  const { data, error } = await supabase
    .from("rooms")
    .update(patch)
    .eq("room_id", roomId)
    .select("room_id")
    .maybeSingle();

  fail(error);
  if (!data) throw new Error("Room could not be updated. Refresh and try again.");
}

/*
  SUBMIT VERIFICATION

  Submits a landlord's property verification documents.

  docs is an object that may contain URLs for:
  - Business permit
  - Internet service provider bill
  - Water proof or water bill
  - Safety audit

  Missing document URLs are stored as null.

  The SQL function auth_landlord_id() supplies the landlord ID
  automatically when the record is inserted.
*/
export async function submitVerification(docs = {}) {
  const { data, error } = await supabase
    .from("property_verifications")
    .insert({
      business_permit_url: docs.businessPermitUrl ?? null,
      isp_bill_url: docs.ispBillUrl ?? null,
      water_proof_url: docs.waterProofUrl ?? null,
      safety_audit_url: docs.safetyAuditUrl ?? null,
      government_id_url: docs.governmentIdPath ?? null,
      proof_of_ownership_url: docs.ownershipProofPath ?? null
    })
    .select("verification_id")
    .single();

  fail(error);

  // Return the ID of the submitted verification record.
  return data.verification_id;
}

export async function fetchLatestLandlordVerification() {
  const { data, error } = await supabase
    .from("property_verifications")
    .select("*")
    .order("verification_id", { ascending: false })
    .limit(1)
    .maybeSingle();

  fail(error);
  return data || null;
}

/* ───────────────────────── Student actions ───────────────────────── */

/*
  FETCH SAVED HOUSE IDS

  Retrieves the IDs of properties saved by a particular student.

  The result is converted into strings so the frontend can use
  consistent ID types when comparing saved properties.
*/
export async function fetchSavedHouseIds(studentId) {
  const { data, error } = await supabase
    .from("saved_listings")
    .select("house_id")
    .eq("student_id", studentId);

  fail(error);

  return (data || []).map((r) => String(r.house_id));
}

/*
  SAVE LISTING

  Adds a property to the student's saved listings.

  Number(houseId) converts the property ID into a number
  before inserting it into the database.

  Error code 23505 means a duplicate/unique constraint violation.
  It is ignored here because the listing is already saved.
*/
export async function saveListing(studentId, houseId) {
  const { error } = await supabase
    .from("saved_listings")
    .insert({
      student_id: studentId,
      house_id: Number(houseId)
    });

  if (error && error.code !== "23505") fail(error);
}

/*
  UNSAVE LISTING

  Removes a saved property from the student's saved list.

  Both student_id and house_id are used to make sure the correct
  student's saved record is deleted.
*/
export async function unsaveListing(studentId, houseId) {
  const { error } = await supabase
    .from("saved_listings")
    .delete()
    .eq("student_id", studentId)
    .eq("house_id", Number(houseId));

  fail(error);
}

/*
  CREATE BOOKING

  Creates a booking request for a room.

  The new booking is initially assigned the status "Pending".
  The student and room IDs connect the booking to the correct records.

  Error code 23P01 is handled separately because it represents
  an exclusion constraint violation, such as overlapping bookings
  for the same room and dates.
*/
export async function createBooking({
  studentId,
  roomId,
  startDate,
  endDate,
  roommateStudentId = null,
}) {
  if (roommateStudentId) {
    const { data, error } = await supabase.rpc("create_shared_room_booking", {
      p_room_id: Number(roomId),
      p_start_date: startDate,
      p_end_date: endDate,
      p_roommate_student_id: Number(roommateStudentId),
    });

    if (error?.code === "23P01") {
      throw new Error("This room is no longer available for the selected dates. Choose a different room or date.");
    }
    if (error && /room is unavailable/i.test(error.message)) {
      throw new Error("This room is no longer available. Choose a different room.");
    }
    fail(error);
    return data;
  }

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      student_id: studentId,
      room_id: Number(roomId),
      start_date: startDate,
      end_date: endDate,
      status: "Pending"
    })
    .select("booking_id")
    .single();

  if (error) {
    if (error.code === "23P01") {
      throw new Error("This room is no longer available for the selected dates. Choose a different room or date.");
    }

    // Throw any other database error.
    fail(error);
  }

  // Return the newly created booking ID.
  return data.booking_id;
}

export async function createRoommateJoinRequest(bookingId, startDate) {
  const { data, error } = await supabase.rpc("request_to_join_room_booking", {
    p_booking_id: Number(bookingId),
    p_start_date: startDate,
  });

  fail(error);
  return data;
}

export async function fetchMySharedBookingInvites() {
  const { data, error } = await supabase.rpc("get_my_shared_booking_invites");
  fail(error);
  return (data || []).map((invite) => ({
    bookingId: String(invite.booking_id),
    requesterName: invite.requester_name,
    propertyTitle: invite.property_title,
    roomName: invite.room_name,
    startDate: invite.start_date,
    endDate: invite.end_date,
    shareStartDate: invite.share_start_date,
    bookingStatus: invite.booking_status,
    monthlyRent: Number(invite.monthly_rent),
    securityDeposit: Number(invite.security_deposit),
  }));
}

export async function respondToSharedBookingInvite(bookingId, accept) {
  const { error } = await supabase.rpc("respond_to_shared_booking_invite", {
    p_booking_id: Number(bookingId),
    p_accept: Boolean(accept),
  });
  fail(error);
}

export async function fetchPublicRoomBookings(houseId) {
  const { data, error } = await supabase.rpc("get_public_room_bookings", {
    p_house_id: Number(houseId),
  });

  fail(error);

  return (data || []).map((booking) => ({
    bookingId: String(booking.booking_id),
    roomId: String(booking.room_id),
    startDate: booking.start_date,
    endDate: booking.end_date,
    status: booking.status,
    openEnded: booking.is_open_ended,
    occupiedSlots: Number(booking.occupied_slots),
    isMyMatch: Boolean(booking.is_my_match),
  }));
}

export async function fetchMyInvoiceBalances() {
  const { data, error } = await supabase.rpc("get_my_invoice_balances");
  fail(error);
  return (data || []).map((invoice) => ({
    id: String(invoice.invoice_id),
    bookingId: String(invoice.booking_id),
    studentId: String(invoice.student_id),
    paymentType: invoice.payment_type,
    periodStart: invoice.period_start,
    periodEnd: invoice.period_end,
    amountDue: Number(invoice.amount_due),
    remainingBalance: Number(invoice.remaining_balance),
    dueDate: invoice.due_date,
  }));
}

/*
  FETCH BOOKINGS

  Retrieves booking records, including related student, room,
  and boarding house information.

  Supabase can retrieve related records through foreign-key
  relationships. This avoids having to make separate queries
  for each booking.
*/
export async function fetchBookings() {
  const { data, error } = await supabase
    .from("bookings")
    .select(`
      *,
      students!bookings_student_id_fkey ( full_name, student_id_number ),
      roommate:students!bookings_roommate_student_id_fkey ( full_name ),
      rooms (
        room_id,
        room_number,
        monthly_rate,
        security_deposit,
        house_id,
        boarding_houses ( house_name )
      )
    `)
    // Show the newest bookings first.
    .order("created_at", { ascending: false });

  fail(error);

  /*
    Convert each database booking into a simpler object
    that the frontend can display.

    The database uses its own column names, while the frontend
    uses convenient names such as studentName and propertyTitle.
  */
  return (data || []).map((b) => {
    const hasRoommate = b.roommate_invite_status === "Accepted";
    const isShared = hasRoommate && (
      b.status !== "Confirmed" ||
      !b.roommate_start_date ||
      b.roommate_start_date < b.end_date
    );
    const monthlyRate = Number(b.rooms?.monthly_rate || 0);
    const securityDeposit = Number(b.rooms?.security_deposit || 0);
    return {
      id: String(b.booking_id),
      studentId: String(b.student_id),
      studentName: b.students?.full_name || "Student",
      roommateStudentId: b.roommate_student_id == null ? "" : String(b.roommate_student_id),
      roommateName: b.roommate?.full_name || "",
      roommateInviteStatus: b.roommate_invite_status || "",
      roommateStartDate: b.roommate_start_date || null,
      hasRoommate,
      isShared,
      roomId: String(b.room_id),
      roomName: b.rooms?.room_number,
      propertyId: String(b.rooms?.house_id),
      propertyTitle: b.rooms?.boarding_houses?.house_name,
      monthlyRate,
      monthlyShare: isShared ? Math.round(monthlyRate * 50) / 100 : monthlyRate,
      securityDeposit,
      securityDepositShare: hasRoommate ? Math.round(securityDeposit * 50) / 100 : securityDeposit,
      startDate: b.start_date,
      endDate: b.end_date,
      actualEndDate: b.actual_end_date || null,
      status: b.status,
      openEnded: b.status === "Confirmed" && !b.actual_end_date,

      // Keep only the date portion of the creation timestamp.
      createdAt: (b.created_at || "").slice(0, 10)
    };
  });
}

/*
  SET BOOKING STATUS

  Changes the status of a booking.

  This can be used by the appropriate user or staff member
  to update a booking's status, depending on database permissions.
*/
export async function setBookingStatus(bookingId, status) {
  const { error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("booking_id", Number(bookingId));

  fail(error);
}

export async function completeBooking(bookingId, actualEndDate) {
  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "Completed", actual_end_date: actualEndDate })
    .eq("booking_id", Number(bookingId))
    .eq("status", "Confirmed")
    .select("booking_id")
    .maybeSingle();

  fail(error);
  if (!data) throw new Error("This booking is no longer confirmed. Refresh the bookings list and try again.");
  return data.booking_id;
}

export async function renewBooking(bookingId) {
  const { data, error } = await supabase.rpc("renew_booking", {
    p_booking_id: Number(bookingId),
  });

  fail(error);
  return data;
}

export async function studentMoveOutBooking(bookingId) {
  const { data, error } = await supabase.rpc("student_move_out_booking", {
    p_booking_id: Number(bookingId),
  });

  fail(error);
  return data;
}

/*
  FETCH PAYMENTS

  Retrieves payment records from the payments table.

  Payments are sorted by payment_date in descending order,
  meaning the most recent payment appears first.
*/
export async function fetchPayments() {
  const { data, error } = await supabase
    .from("payments")
    .select(`
      *,
      bookings (
        booking_id,
        start_date,
        end_date,
        rooms (
          room_number,
          boarding_houses ( house_name, landlord_id )
        )
      ),
      student:students!payments_student_id_fkey ( full_name )
    `)
    .order("payment_date", { ascending: false });

  fail(error);

  return (data || []).map((payment) => ({
    id: String(payment.payment_id),
    bookingId: String(payment.booking_id),
    invoiceId: payment.invoice_id == null ? "" : String(payment.invoice_id),
    studentId: String(payment.student_id),
    studentName: payment.student?.full_name || "Student",
    propertyTitle: payment.bookings?.rooms?.boarding_houses?.house_name || "Property",
    landlordId: String(payment.bookings?.rooms?.boarding_houses?.landlord_id || ""),
    roomName: payment.bookings?.rooms?.room_number || "Room",
    startDate: payment.bookings?.start_date || "",
    endDate: payment.bookings?.end_date || "",
    amount: Number(payment.amount),
    paymentType: payment.payment_type,
    paymentDate: payment.payment_date,
    paymentMethod: payment.payment_method || "",
    receiptPath: payment.receipt_url || "",
    status: payment.verification_status,
    rejectionReason: payment.rejection_reason || "",
  }));
}

export async function fetchLandlordInvoiceBalances() {
  const { data, error } = await supabase
    .from("invoices")
    .select(`
      invoice_id,
      booking_id,
      student_id,
      payment_type,
      period_start,
      period_end,
      amount_due,
      due_date,
      is_paid,
      student:students!invoices_student_id_fkey ( full_name ),
      bookings!invoices_booking_id_fkey (
        rooms!bookings_room_id_fkey (
          room_number,
          boarding_houses!rooms_house_id_fkey ( house_name, landlord_id )
        )
      ),
      invoicePayments:payments!payments_invoice_id_fkey ( amount, verification_status )
    `)
    .order("due_date", { ascending: true });

  fail(error);

  return (data || []).map((invoice) => {
    const due = Number(invoice.amount_due);
    const payments = invoice.invoicePayments || [];
    const verifiedAmount = payments
      .filter((payment) => payment.verification_status === "Verified")
      .reduce((total, payment) => total + Number(payment.amount), 0);
    const pendingAmount = payments
      .filter((payment) => payment.verification_status === "Pending")
      .reduce((total, payment) => total + Number(payment.amount), 0);
    const remainingBalance = invoice.is_paid
      ? 0
      : Math.max(0, due - verifiedAmount - pendingAmount);
    const status = remainingBalance === 0
      ? pendingAmount > 0 ? "Awaiting review" : "Paid"
      : pendingAmount > 0
        ? "Partially submitted"
        : verifiedAmount > 0
          ? "Partially paid"
          : "Unpaid";
    const booking = invoice.bookings;
    const room = booking?.rooms;
    const property = room?.boarding_houses;

    return {
      id: String(invoice.invoice_id),
      studentId: String(invoice.student_id),
      studentName: invoice.student?.full_name || "Student",
      landlordId: String(property?.landlord_id || ""),
      propertyTitle: property?.house_name || "Property",
      roomName: room?.room_number || "Room",
      paymentType: invoice.payment_type,
      periodStart: invoice.period_start,
      periodEnd: invoice.period_end,
      dueDate: invoice.due_date,
      amountDue: due,
      verifiedAmount,
      pendingAmount,
      remainingBalance,
      status,
    };
  });
}

/*
  CREATE PAYMENT

  Saves a payment against an invoice for the authenticated student.

  Parameters:
  - invoiceId: outstanding invoice
  - amount: payment amount
  - paymentMethod: how the payment was made
  - receiptFile: uploaded payment proof

  A new payment starts with verification_status set to "Pending".
*/
export async function createPayment({
  invoiceId,
  amount,
  paymentMethod,
  receiptFile
}) {
  const paymentAmount = Number(amount);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    throw new Error("Enter a payment amount greater than zero.");
  }
  if (!receiptFile) throw new Error("Upload your payment receipt before submitting.");
  const receiptPath = await uploadPaymentProof(receiptFile);
  const { data, error } = await supabase.rpc("submit_payment", {
    p_invoice_id: Number(invoiceId),
    p_amount: paymentAmount,
    p_payment_method: paymentMethod ?? null,
    p_receipt_path: receiptPath,
  });
  if (error) {
    const { error: cleanupError } = await supabase.storage
      .from(PRIVATE_DOCUMENT_BUCKET)
      .remove([receiptPath]);
    if (cleanupError) {
      throw new Error(GENERIC_ERROR_MESSAGE);
    }
    fail(error);
  }
  return String(data);
}

/*
  SET PAYMENT STATUS

  Updates the verification status of a payment.

  For example, an administrator may change a payment from
  "Pending" to "Approved" or "Rejected".
*/
export async function setPaymentStatus(paymentId, status, rejectionReason = "") {
  if (!["Verified", "Failed"].includes(status)) {
    throw new Error("Choose whether to accept or reject this payment.");
  }
  if (status === "Failed" && !rejectionReason.trim()) {
    throw new Error("Enter a reason for rejecting this payment.");
  }

  const { data, error } = await supabase
    .from("payments")
    .update({
      verification_status: status,
      rejection_reason: status === "Failed" ? rejectionReason.trim() : null,
    })
    .eq("payment_id", Number(paymentId))
    .eq("verification_status", "Pending")
    .select("payment_id")
    .maybeSingle();

  fail(error);
  if (!data) throw new Error("This payment has already been reviewed. Refresh the payment list.");
}

/*
  FETCH COMPARISON ROOM IDS

  Retrieves the room IDs that a student has added to their
  room comparison list.

  IDs are converted to strings to make frontend comparisons consistent.
*/
export async function fetchComparisonRoomIds(studentId) {
  const { data, error } = await supabase
    .from("room_comparisons")
    .select("room_id")
    .eq("student_id", studentId);

  fail(error);

  return (data || []).map((r) => String(r.room_id));
}

/*
  ADD COMPARISON

  Adds a room to the student's comparison list.

  Duplicate entries are ignored when Supabase returns error code 23505.
*/
export async function addComparison(studentId, roomId) {
  const { error } = await supabase
    .from("room_comparisons")
    .insert({
      student_id: studentId,
      room_id: Number(roomId)
    });

  if (error && error.code !== "23505") fail(error);
}

/*
  REMOVE COMPARISON

  Removes a room from the student's comparison list.
*/
export async function removeComparison(studentId, roomId) {
  const { error } = await supabase
    .from("room_comparisons")
    .delete()
    .eq("student_id", studentId)
    .eq("room_id", Number(roomId));

  fail(error);
}

/*
  CREATE REVIEW

  Saves a student's review of a boarding house.

  The review includes:
  - Overall rating
  - Cleanliness rating
  - Responsiveness rating
  - Value-for-money rating
  - Written comment

  The houseId is converted to a number before insertion.
*/
export async function createReview({
  studentId,
  houseId,
  overall,
  cleanliness,
  responsiveness,
  value,
  comment
}) {
  const numericHouseId = Number(houseId);
  const ratings = [overall, cleanliness, responsiveness, value].map(Number);
  if (!studentId || !Number.isSafeInteger(numericHouseId) || numericHouseId <= 0) {
    throw new Error("A valid student and property are required to submit a review.");
  }
  if (!ratings.every((rating) => Number.isInteger(rating) && rating >= 1 && rating <= 5)) {
    throw new Error("All review ratings must be between 1 and 5.");
  }
  const normalizedComment = String(comment ?? "").trim();
  if (normalizedComment.length > 2000) {
    throw new Error("Review comments must be 2,000 characters or fewer.");
  }

  const { error } = await supabase
    .from("reviews")
    .insert({
      student_id: studentId,
      house_id: numericHouseId,
      rating_overall: ratings[0],
      rating_cleanliness: ratings[1],
      rating_responsiveness: ratings[2],
      rating_value: ratings[3],
      comment: normalizedComment || null
    });

  fail(error);
}

/* ───────────────────────── Messaging ───────────────────────── */

/*
  FETCH MESSAGES

  Retrieves messages where the current account is either:
  - The sender, or
  - The receiver.

  The .or() filter combines these two conditions.
  Messages are ordered from oldest to newest.
*/
export async function fetchMessages(myAccountId) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(`sender_id.eq.${myAccountId},receiver_id.eq.${myAccountId}`)
    .order("created_at", { ascending: true });

  fail(error);

  return data || [];
}

function mapRoommateProfile(row) {
  return {
    studentId: String(row.student_id),
    accountId: Number(row.account_id),
    name: row.full_name,
    profilePhotoUrl: row.profile_photo_url || "",
    gender: row.gender || "",
    academicYear: row.academic_year || "",
    preferences: {
      sleep: row.pref_sleep_schedule,
      study: row.pref_study_habits,
      cleanliness: row.pref_cleanliness,
      guests: row.pref_guest_policy,
    },
    compatibilityScore: row.compatibility_score == null ? null : Number(row.compatibility_score),
    isNominated: Boolean(row.is_nominated),
  };
}

export async function fetchMyRoommateMatchRequest() {
  const { data, error } = await supabase.rpc("get_my_roommate_match_request");
  fail(error);
  const request = data?.[0];
  if (!request) return null;

  return {
    id: String(request.request_id),
    isOpen: request.is_open,
    selectedStudent: request.selected_student_id == null
      ? null
      : {
          studentId: String(request.selected_student_id),
          accountId: Number(request.selected_account_id),
          name: request.selected_full_name,
          profilePhotoUrl: request.selected_profile_photo_url || "",
          gender: request.selected_gender || "",
        },
  };
}

export async function fetchMyRoommateMatchCandidates() {
  const { data, error } = await supabase.rpc("get_my_roommate_match_candidates");
  fail(error);
  return (data || []).map(mapRoommateProfile);
}

export async function createRoommateMatchRequest() {
  const { data, error } = await supabase.rpc("create_roommate_match_request");
  fail(error);
  return data;
}

export async function closeRoommateMatchRequest() {
  const { error } = await supabase.rpc("close_roommate_match_request");
  fail(error);
}

export async function chooseRoommateMatchCandidate(requestId, studentId) {
  const { error } = await supabase.rpc("choose_roommate_match_candidate", {
    p_request_id: Number(requestId),
    p_candidate_student_id: Number(studentId),
  });
  fail(error);
}

export async function fetchLandlordRoommateMatchRequests() {
  const { data, error } = await supabase.rpc("get_landlord_roommate_match_requests");
  fail(error);
  return (data || []).map((request) => ({
    ...mapRoommateProfile(request),
    id: String(request.request_id),
    candidateCount: Number(request.candidate_count || 0),
    createdAt: request.created_at,
  }));
}

export async function fetchRoommateMatchCandidates(requestId) {
  const { data, error } = await supabase.rpc("get_roommate_match_candidates", {
    p_request_id: Number(requestId),
  });
  fail(error);
  return (data || []).map(mapRoommateProfile);
}

export async function setRoommateMatchCandidates(requestId, studentIds) {
  const { error } = await supabase.rpc("set_roommate_match_candidates", {
    p_request_id: Number(requestId),
    p_candidate_student_ids: studentIds.map(Number),
  });
  fail(error);
}

/*
  SEND MESSAGE

  Inserts a new message into the messages table.

  Parameters:
  - senderId: account sending the message
  - receiverId: account receiving the message
  - content: message text

  .select().single() returns the newly inserted message record.
*/
export async function sendMessage(senderId, receiverId, content) {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      sender_id: senderId,
      receiver_id: receiverId,
      content
    })
    .select()
    .single();

  fail(error);

  return data;
}

/*
  MARK READ

  Marks selected messages as read.

  If messageIds is empty, the function stops immediately
  because there are no messages to update.
*/
export async function markRead(messageIds) {
  if (!messageIds.length) return;

  const { error } = await supabase
    .from("messages")
    .update({ is_read: true })
    .in("message_id", messageIds);

  fail(error);
}

export async function fetchNotifications(limit = 100) {
  const { data, error } = await supabase
    .from("notifications")
    .select("notification_id, notification_type, title, body, related_verification_id, created_at, is_read")
    .order("created_at", { ascending: false })
    .limit(limit);

  fail(error);
  return data || [];
}

export async function fetchUnreadNotificationCount() {
  const { count, error } = await supabase
    .from("notifications")
    .select("notification_id", { count: "exact", head: true })
    .or("is_read.eq.false,is_read.is.null");

  fail(error);
  return count || 0;
}

export async function markNotificationRead(notificationId) {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("notification_id", Number(notificationId));

  fail(error);
}

/*
  FETCH ACCOUNT NAMES

  Retrieves the names and roles of accounts involved in messaging.

  The message_peers view is defined in supabase_additions.sql.
  It provides the public name and role information needed
  to label conversations.

  If accountIds is empty, return an empty object without querying.
*/
export async function fetchAccountNames(accountIds) {
  if (!accountIds.length) return {};

  const { data, error } = await supabase
    .from("message_peers")
    .select("account_id, full_name, role, profile_photo_url")
    .in("account_id", accountIds);
  fail(error);

  // Create an object that stores account details using account IDs as keys.
  const names = {};

  (data || []).forEach((r) => (
    names[r.account_id] = {
      name: r.full_name,
      profilePhotoUrl: r.profile_photo_url,

      // Convert the database role into the frontend role format.
      role: r.role.toLowerCase()
    }
  ));

  return names;
}

export async function fetchChatContacts() {
  const { data, error } = await supabase
    .from("message_peers")
    .select("account_id, full_name, role, profile_photo_url")
    .order("full_name", { ascending: true });

  fail(error);
  return (data || []).map((contact) => ({
    accountId: Number(contact.account_id),
    name: contact.full_name || "User",
    role: contact.role.toLowerCase(),
    profilePhotoUrl: contact.profile_photo_url || "",
  }));
}

/* ───────────────────────── Admin ───────────────────────── */

/*
  FETCH PENDING VERIFICATIONS

  Retrieves property verification submissions that are still pending.

  The query also retrieves the landlord's full name through
  the relationship with the landlords table.
*/
export async function fetchPendingVerifications() {
  const { data, error } = await supabase
    .from("property_verifications")
    .select("*, landlords ( full_name, government_id, proof_of_ownership_url )")
    .eq("verification_status", "Pending");

  fail(error);

  return Promise.all((data || []).map(async (verification) => ({
    ...verification,
    government_id_url: await signedVerificationDocument(verification.government_id_url),
    proof_of_ownership_url: await signedVerificationDocument(verification.proof_of_ownership_url),
    business_permit_url: await signedVerificationDocument(verification.business_permit_url),
    isp_bill_url: await signedVerificationDocument(verification.isp_bill_url),
    water_proof_url: await signedVerificationDocument(verification.water_proof_url),
    safety_audit_url: await signedVerificationDocument(verification.safety_audit_url),
    landlords: verification.landlords ? {
      ...verification.landlords,
      government_id: await signedVerificationDocument(verification.landlords.government_id),
      proof_of_ownership_url: await signedVerificationDocument(verification.landlords.proof_of_ownership_url)
    } : verification.landlords
  })));
}

/*
  WRITE AUDIT

  Creates an audit log entry whenever an administrative action
  needs to be recorded.

  Parameters:
  - adminId: administrator who performed the action
  - action: description of the action
  - reason: explanation for the action
  - targetTable: database table affected
  - targetId: ID of the affected record
*/
export async function writeAudit({
  adminId,
  action,
  reason,
  targetTable,
  targetId
}) {
  const { error } = await supabase
    .from("audit_logs")
    .insert({
      admin_id: adminId,
      action_taken: action,
      reason,
      target_table: targetTable,
      target_id: Number(targetId)
    });

  fail(error);
}

/*
  FETCH AUDIT LOGS

  Retrieves all audit log records, with the newest entries first.
*/
export async function fetchAuditLogs() {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false });

  fail(error);

  return data || [];
}

/*
  MODERATE HOUSE

  Allows an administrator to change a property's listing status.

  Parameters:
  - adminId: administrator performing the action
  - houseId: property being moderated
  - status: new listing status
  - reason: explanation for rejection or suspension

  When a listing is Rejected or Suspended, the reason is saved.
  For other statuses, rejection_reason is cleared by setting it to null.

  After updating the property, the function creates an audit log.
*/
export async function moderateHouse({
  adminId,
  houseId,
  status,
  reason
}) {
  const { error } = await supabase
    .from("boarding_houses")
    .update({
      listing_status: status,
      rejection_reason:
        status === "Rejected" || status === "Suspended"
          ? reason
          : null
    })
    .eq("house_id", Number(houseId));

  fail(error);

  // Record the administrative action after the listing update succeeds.
  await writeAudit({
    adminId,
    action: `${status.toUpperCase()}_LISTING`,
    reason,
    targetTable: "boarding_houses",
    targetId: houseId
  });
}

/*
  RECORD INSPECTION

  Saves the results of an administrator's property safety inspection.

  The inspection includes:
  - Distance from police assistance
  - Lighting rating
  - Whether the property has gated access
  - Whether CCTV is active
  - Whether CCTV is required

  This creates a new inspection record rather than updating an old one.
*/
export async function recordInspection({
  adminId,
  houseId,
  policeDistanceM,
  lightingRating,
  hasGatedAccess,
  cctvActive,
  cctvRequired
}) {
  const { error } = await supabase
    .from("property_inspections")
    .insert({
      house_id: Number(houseId),
      admin_id: adminId,
      police_distance_m: policeDistanceM,
      lighting_rating: lightingRating,
      has_gated_access: hasGatedAccess,
      cctv_active: cctvActive,
      cctv_required: cctvRequired
    });

  fail(error);
}

/*
  SET VERIFICATION STATUS

  Allows an administrator to approve or reject a property verification.

  When rejected, the reason is saved.
  When approved, verified_at is set to the current date and time.
  When not approved, verified_at is set to null.

  The admin_reviewer_id records which administrator reviewed the request.

  After the database update succeeds, an audit entry is created.
*/
export async function setVerificationStatus({
  adminId,
  verificationId,
  status,
  reason
}) {
  const { error } = await supabase
    .from("property_verifications")
    .update({
      verification_status: status,
      rejection_reason: status === "Rejected" ? reason : null,
      admin_reviewer_id: adminId,
      verified_at: status === "Approved" ? new Date().toISOString() : null
    })
    .eq("verification_id", Number(verificationId));

  fail(error);

  // Record the approval or rejection in the audit log.
  await writeAudit({
    adminId,
    action: `${status.toUpperCase()}_VERIFICATION`,
    reason,
    targetTable: "property_verifications",
    targetId: verificationId
  });
}

/*
  SET REVIEW HIDDEN

  Controls whether a review is hidden from normal display.

  hidden = true  -> hides the review
  hidden = false -> restores the review

  The action is also recorded in the audit log.
*/
export async function setReviewHidden({
  adminId,
  reviewId,
  hidden,
  reason
}) {
  const normalizedReason = hidden ? reason?.trim() : "";
  if (hidden && !normalizedReason) {
    throw new Error("Enter a reason before hiding this review.");
  }

  const { error } = await supabase
    .from("reviews")
    .update({
      is_hidden: hidden,
      moderation_reason: hidden ? normalizedReason : null,
    })
    .eq("review_id", Number(reviewId));

  fail(error);

  // Record whether the review was removed or restored.
  await writeAudit({
    adminId,
    action: hidden ? "REMOVED_REVIEW" : "RESTORED_REVIEW",
    reason,
    targetTable: "reviews",
    targetId: reviewId
  });
}

/*
  FETCH SETTINGS

  Retrieves all system settings from the system_settings table.
  These settings can be used by the administrative part of UniRent.
*/
export async function fetchSettings() {
  const { data, error } = await supabase
    .from("system_settings")
    .select("*");

  fail(error);

  return data || [];
}

/*
  UPDATE SETTING

  Updates a system setting using its key.

  Parameters:
  - key: identifies which setting should be changed
  - value: new setting value
  - accountId: administrator account making the change

  updated_at stores the current timestamp.
  updated_by records who made the change.
*/
export async function updateSetting(key, value, accountId) {
  const { error } = await supabase
    .from("system_settings")
    .update({
      setting_value: value,
      updated_by: accountId,
      updated_at: new Date().toISOString()
    })
    .eq("setting_key", key);

  fail(error);
}

/*
  FETCH MODERATION REVIEWS

  Retrieves reviews together with the student's name
  and the boarding house name.

  The records are sorted newest first and converted into
  a format used by the moderation interface.
*/
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
    reason: r.moderation_reason || "—",

    /*
      The database schema does not contain a separate "flagged" column.

      Therefore, this frontend code uses:
      - "hidden" when is_hidden is true
      - "flagged" when is_hidden is false

      Here, "flagged" means visible and available for moderation,
      not necessarily that a user explicitly reported the review.
    */
    status: r.is_hidden ? "hidden" : "flagged"
  }));
}

/*
  FETCH AUDIT ENTRIES

  Retrieves audit logs together with the email address of
  the administrator who performed each action.

  It then converts the raw database records into a format
  expected by the frontend's audit log interface.
*/
export async function fetchAuditEntries() {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*, accounts ( email )")
    .order("created_at", { ascending: false });

  fail(error);

  /*
    Converts a database table name into a frontend category.

    For example:
    "boarding_houses"       -> "listing"
    "property_verifications" -> "verification"
    "reviews"                -> "review"

    Unknown table names default to "account".
  */
  const categoryOf = (t) => ({
    boarding_houses: "listing",
    property_verifications: "verification",
    reviews: "review",
    property_inspections: "safety",
    system_settings: "system"
  }[t] || "account");

  // Convert every audit record into the structure used by the UI.
  return (data || []).map((l) => ({
    id: String(l.log_id),

    // Use the administrator's email prefix as their display name.
    // If no email is available, create a fallback name from their ID.
    admin: l.accounts?.email?.split("@")[0] || `admin-${l.admin_id}`,

    adminId: String(l.admin_id),
    action: l.action_taken,
    category: categoryOf(l.target_table),
    target: `${l.target_table} #${l.target_id}`,
    targetId: String(l.target_id),
    reason: l.reason,

    // Convert the timestamp into a readable date and time.
    at: new Date(l.created_at)
      .toISOString()
      .slice(0, 16)
      .replace("T", " "),

    // These fields currently use placeholders/generated values.
    ip: "—",
    sessionId: `log-${l.log_id}`,

    // Mark potentially serious actions as warnings.
    // Other actions are treated as informational.
    severity: /REJECT|SUSPEND|REMOV/.test(l.action_taken)
      ? "warning"
      : "info",

    // Store the target table as additional metadata.
    meta: {
      table: l.target_table
    }
  }));
}

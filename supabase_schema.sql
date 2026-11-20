-- ==============================================================================
-- 0. MASTER WIPE  (DEV ONLY - destroys all data)
-- ==============================================================================
SET session_replication_role = 'replica';
DELETE FROM auth.users;
SET session_replication_role = 'origin';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS check_student_email ON auth.users;

CREATE EXTENSION IF NOT EXISTS btree_gist;

DROP TABLE IF EXISTS saved_listings CASCADE;
DROP TABLE IF EXISTS roommate_match_candidates CASCADE;
DROP TABLE IF EXISTS roommate_match_requests CASCADE;
DROP TABLE IF EXISTS roommate_board_requests CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS campus_gates CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS room_comparisons CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS property_inspections CASCADE;
DROP TABLE IF EXISTS boarding_houses CASCADE;
DROP TABLE IF EXISTS property_verifications CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS landlords CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;

DROP FUNCTION IF EXISTS auth_user_role() CASCADE;
DROP FUNCTION IF EXISTS auth_account_id() CASCADE;
DROP FUNCTION IF EXISTS auth_student_id() CASCADE;
DROP FUNCTION IF EXISTS auth_landlord_id() CASCADE;
DROP FUNCTION IF EXISTS my_house_ids() CASCADE;
DROP FUNCTION IF EXISTS my_room_ids() CASCADE;
DROP FUNCTION IF EXISTS my_booking_ids() CASCADE;
DROP FUNCTION IF EXISTS is_staff() CASCADE;
DROP FUNCTION IF EXISTS is_superadmin() CASCADE;
DROP FUNCTION IF EXISTS public.get_public_room_bookings(BIGINT) CASCADE;
DROP FUNCTION IF EXISTS create_staff_user(TEXT, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.create_shared_room_booking(BIGINT, DATE, DATE, BIGINT) CASCADE;
DROP FUNCTION IF EXISTS public.respond_to_shared_booking_invite(BIGINT, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS public.get_my_shared_booking_invites() CASCADE;
DROP FUNCTION IF EXISTS public.create_booking_invoices() CASCADE;
DROP FUNCTION IF EXISTS public.get_my_invoice_balances() CASCADE;
DROP FUNCTION IF EXISTS public.submit_payment(BIGINT, NUMERIC, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.sync_invoice_paid_status() CASCADE;

DROP TYPE IF EXISTS room_amenity CASCADE;
DROP TYPE IF EXISTS listing_status CASCADE;
DROP TYPE IF EXISTS booking_status CASCADE;
DROP TYPE IF EXISTS payment_status CASCADE;
DROP TYPE IF EXISTS room_status CASCADE;
DROP TYPE IF EXISTS verification_status CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

-- ==============================================================================
-- 1. ENUMS
-- ==============================================================================
CREATE TYPE user_role AS ENUM ('SuperAdmin', 'Admin', 'Landlord', 'Student');
CREATE TYPE verification_status AS ENUM ('Pending', 'Approved', 'Rejected');
CREATE TYPE room_status AS ENUM ('Available', 'Reserved', 'Occupied', 'Unavailable');
CREATE TYPE payment_status AS ENUM ('Pending', 'Verified', 'Failed');
CREATE TYPE booking_status AS ENUM ('Pending', 'Confirmed', 'Cancelled', 'Completed');
CREATE TYPE listing_status AS ENUM ('Pending', 'Published', 'Suspended', 'Rejected');
CREATE TYPE room_amenity AS ENUM (
    'Aircon', 'Fan', 'Wi-Fi', 'Shared Bathroom', 'Solo Bathroom',
    'Study Desk', 'Wardrobe', 'Refrigerator'
);

-- ==============================================================================
-- 2. TABLES
-- ==============================================================================
CREATE TABLE accounts (
    account_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,   -- FIX: FK + cascade
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL DEFAULT '(managed by supabase auth)',
    role user_role NOT NULL DEFAULT 'Student',
    mfa_enabled BOOLEAN DEFAULT FALSE,
    profile_photo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_student_email_domain CHECK (
        role <> 'Student' OR LOWER(email) LIKE '%@addu.edu.ph'
    )
);

CREATE TABLE landlords (
    landlord_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id BIGINT NOT NULL UNIQUE REFERENCES accounts(account_id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone_number TEXT,
    government_id TEXT,
    proof_of_ownership_url TEXT,
    profile_photo_url TEXT
);

CREATE TABLE students (
    student_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id BIGINT NOT NULL UNIQUE REFERENCES accounts(account_id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone_number TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    student_id_number TEXT CHECK (student_id_number IS NULL OR student_id_number ~ '^[0-9]{12}$'),
    gender TEXT CHECK (gender IS NULL OR gender IN ('Female', 'Male')),
    university_name TEXT DEFAULT 'Ateneo de Davao University',
    academic_year TEXT,
    pref_sleep_schedule INT CHECK (pref_sleep_schedule BETWEEN 1 AND 3),
    pref_study_habits INT CHECK (pref_study_habits BETWEEN 1 AND 3),
    pref_cleanliness INT CHECK (pref_cleanliness BETWEEN 1 AND 5),
    pref_guest_policy INT CHECK (pref_guest_policy BETWEEN 1 AND 3),
    profile_photo_url TEXT
);

CREATE UNIQUE INDEX students_id_number_key
    ON students (student_id_number) WHERE student_id_number IS NOT NULL;

CREATE TABLE campus_gates (
    gate_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    university_name TEXT NOT NULL DEFAULT 'Ateneo de Davao University',
    gate_name TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    is_main_entry BOOLEAN DEFAULT TRUE
);

CREATE TABLE property_verifications (
    verification_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    landlord_id BIGINT REFERENCES landlords(landlord_id) ON DELETE CASCADE,  -- FIX: owner, set by default below
    business_permit_url TEXT,
    isp_bill_url TEXT,
    water_proof_url TEXT,
    safety_audit_url TEXT,
    government_id_url TEXT,
    proof_of_ownership_url TEXT,
    verification_status verification_status NOT NULL DEFAULT 'Pending',
    rejection_reason TEXT,
    admin_reviewer_id BIGINT REFERENCES accounts(account_id),
    verified_at TIMESTAMPTZ
);

CREATE TABLE boarding_houses (
    house_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    landlord_id BIGINT NOT NULL REFERENCES landlords(landlord_id) ON DELETE CASCADE,
    verification_id BIGINT UNIQUE REFERENCES property_verifications(verification_id) ON DELETE SET NULL,
    house_name TEXT NOT NULL,
    address TEXT NOT NULL,
    gender_policy TEXT NOT NULL DEFAULT 'Any'
        CHECK (gender_policy IN ('Any', 'Female', 'Male')),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    description TEXT,
    image_urls TEXT[] NOT NULL DEFAULT '{}',
    listing_status listing_status NOT NULL DEFAULT 'Pending',
    rejection_reason TEXT,
    safety_score DECIMAL(3, 1),
    badge_fast_wifi BOOLEAN DEFAULT FALSE,
    badge_24_7_water BOOLEAN DEFAULT FALSE,
    badge_vetted_safe BOOLEAN DEFAULT FALSE,
    badge_fast_wifi_reason TEXT,
    badge_24_7_water_reason TEXT,
    badge_vetted_safe_reason TEXT
);

CREATE TABLE property_inspections (
    inspection_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    house_id BIGINT NOT NULL REFERENCES boarding_houses(house_id) ON DELETE CASCADE,
    admin_id BIGINT NOT NULL REFERENCES accounts(account_id),
    police_distance_m DECIMAL(10, 2),
    lighting_rating INT CHECK (lighting_rating BETWEEN 1 AND 5),
    has_gated_access BOOLEAN,
    cctv_active INT,
    cctv_required INT,
    inspection_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rooms (
    room_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    house_id BIGINT NOT NULL REFERENCES boarding_houses(house_id) ON DELETE CASCADE,
    room_number TEXT NOT NULL,
    monthly_rate DECIMAL(10, 2) NOT NULL,
    security_deposit DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    capacity INT NOT NULL DEFAULT 1,
    availability_status room_status NOT NULL DEFAULT 'Available',
    unavailable_reason TEXT,
    amenities room_amenity[] NOT NULL DEFAULT '{}',
    image_urls TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE bookings (
    booking_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id BIGINT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    roommate_student_id BIGINT REFERENCES students(student_id),
    roommate_invite_status TEXT CHECK (
        (roommate_student_id IS NULL AND roommate_invite_status IS NULL)
        OR (roommate_student_id IS NOT NULL AND roommate_invite_status IN ('Pending', 'Accepted', 'Declined'))
    ),
    room_id BIGINT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    actual_end_date DATE,
    status booking_status NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_booking_dates CHECK (end_date > start_date),      -- FIX
    CONSTRAINT valid_actual_booking_end_date CHECK (actual_end_date IS NULL OR actual_end_date >= start_date),
    CONSTRAINT prevent_overlapping_bookings EXCLUDE USING gist (
        room_id WITH =,
        daterange(start_date, end_date, '[)') WITH &&
    ) WHERE (status IN ('Pending', 'Confirmed'))
);

CREATE OR REPLACE FUNCTION prevent_unavailable_room_booking() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
    booking_changed BOOLEAN;
BEGIN
    IF TG_OP = 'INSERT' THEN
        booking_changed := TRUE;
    ELSE
        booking_changed :=
            OLD.room_id IS DISTINCT FROM NEW.room_id
            OR OLD.start_date IS DISTINCT FROM NEW.start_date
            OR OLD.end_date IS DISTINCT FROM NEW.end_date
            OR OLD.status IS DISTINCT FROM NEW.status
            OR OLD.roommate_student_id IS DISTINCT FROM NEW.roommate_student_id
            OR OLD.roommate_invite_status IS DISTINCT FROM NEW.roommate_invite_status;
    END IF;

    IF booking_changed
       AND NEW.status IN ('Pending', 'Confirmed')
       AND EXISTS (
           SELECT 1
           FROM rooms r
           WHERE r.room_id = NEW.room_id
             AND r.availability_status::TEXT = 'Unavailable'
       ) THEN
        RAISE EXCEPTION 'This room is unavailable while repairs are in progress.';
    END IF;

    RETURN NEW;
END;
$$;
CREATE TRIGGER prevent_unavailable_room_booking
BEFORE INSERT OR UPDATE OF room_id, start_date, end_date, status, roommate_student_id, roommate_invite_status
ON bookings
FOR EACH ROW EXECUTE FUNCTION prevent_unavailable_room_booking();

CREATE OR REPLACE FUNCTION public.get_public_room_bookings(p_house_id BIGINT)
RETURNS TABLE (room_id BIGINT, start_date DATE, end_date DATE, status TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT b.room_id, b.start_date, b.end_date, b.status::TEXT
    FROM public.bookings b
    JOIN public.rooms r ON r.room_id = b.room_id
    JOIN public.boarding_houses h ON h.house_id = r.house_id
    WHERE h.house_id = p_house_id
      AND h.listing_status = 'Published'
      AND b.status IN ('Pending', 'Confirmed')
    ORDER BY b.start_date;
$$;
REVOKE ALL ON FUNCTION public.get_public_room_bookings(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_room_bookings(BIGINT) TO anon, authenticated;

CREATE TABLE invoices (
    invoice_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id BIGINT NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    payment_type TEXT NOT NULL DEFAULT 'Monthly rent'
        CHECK (payment_type IN ('Monthly rent', 'Security deposit')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    amount_due DECIMAL(10, 2) NOT NULL,
    due_date DATE NOT NULL,
    is_paid BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payments (
    payment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id BIGINT NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
    invoice_id BIGINT REFERENCES invoices(invoice_id) ON DELETE SET NULL,
    student_id BIGINT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    payment_type TEXT NOT NULL,
    payment_date TIMESTAMPTZ DEFAULT NOW(),
    payment_method TEXT,
    verification_status payment_status NOT NULL DEFAULT 'Pending',
    receipt_url TEXT,
    rejection_reason TEXT,
    CONSTRAINT valid_payment_rejection_reason CHECK (
        (verification_status = 'Failed' AND NULLIF(BTRIM(rejection_reason), '') IS NOT NULL)
        OR (verification_status <> 'Failed' AND rejection_reason IS NULL)
    )
);

CREATE TABLE reviews (
    review_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id BIGINT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    house_id BIGINT NOT NULL REFERENCES boarding_houses(house_id) ON DELETE CASCADE,
    rating_overall INT CHECK (rating_overall BETWEEN 1 AND 5),
    rating_cleanliness INT CHECK (rating_cleanliness BETWEEN 1 AND 5),
    rating_responsiveness INT CHECK (rating_responsiveness BETWEEN 1 AND 5),
    rating_value INT CHECK (rating_value BETWEEN 1 AND 5),
    comment TEXT,
    is_student_verified BOOLEAN DEFAULT TRUE,
    is_hidden BOOLEAN DEFAULT FALSE,
    moderation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE saved_listings (
    saved_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id BIGINT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    house_id BIGINT NOT NULL REFERENCES boarding_houses(house_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(student_id, house_id)
);

CREATE TABLE room_comparisons (
    comparison_item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id BIGINT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    room_id BIGINT REFERENCES rooms(room_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(student_id, room_id)
);

CREATE TABLE messages (
    message_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sender_id BIGINT NOT NULL REFERENCES accounts(account_id),
    receiver_id BIGINT NOT NULL REFERENCES accounts(account_id),
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
    log_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admin_id BIGINT NOT NULL REFERENCES accounts(account_id),
    action_taken TEXT NOT NULL,
    reason TEXT NOT NULL,
    target_table TEXT NOT NULL,
    target_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE system_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value DECIMAL(5,4) NOT NULL,
    updated_by BIGINT REFERENCES accounts(account_id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (setting_key, setting_value) VALUES
('weight_police', 0.25), ('weight_lighting', 0.25), ('weight_gated', 0.25), ('weight_cctv', 0.25);

-- ==============================================================================
-- 3. HELPER FUNCTIONS (SECURITY DEFINER = bypass RLS, which kills policy recursion)
-- ==============================================================================
CREATE OR REPLACE FUNCTION auth_user_role() RETURNS user_role
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT role FROM accounts WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION auth_account_id() RETURNS BIGINT
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT account_id FROM accounts WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION auth_student_id() RETURNS BIGINT
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT s.student_id FROM students s JOIN accounts a ON a.account_id = s.account_id
  WHERE a.auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION auth_landlord_id() RETURNS BIGINT
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT l.landlord_id FROM landlords l JOIN accounts a ON a.account_id = l.account_id
  WHERE a.auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION my_house_ids() RETURNS SETOF BIGINT
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT house_id FROM boarding_houses WHERE landlord_id = auth_landlord_id();
$$;

CREATE OR REPLACE FUNCTION my_room_ids() RETURNS SETOF BIGINT
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT room_id FROM rooms WHERE house_id IN (SELECT my_house_ids());
$$;

CREATE OR REPLACE FUNCTION my_booking_ids() RETURNS SETOF BIGINT
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT booking_id FROM bookings WHERE room_id IN (SELECT my_room_ids());
$$;

-- Staff role helpers
CREATE OR REPLACE FUNCTION is_superadmin() RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(auth_user_role() = 'SuperAdmin', FALSE);
$$;

CREATE OR REPLACE FUNCTION is_staff() RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(auth_user_role() IN ('Admin', 'SuperAdmin'), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.is_chat_eligible_account(p_account_id BIGINT) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.accounts
    WHERE account_id = p_account_id
      AND role IN ('Admin', 'Landlord', 'Student')
  );
$$;
REVOKE ALL ON FUNCTION public.is_chat_eligible_account(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_chat_eligible_account(BIGINT) TO authenticated;

-- Now that the helper exists, give verifications an automatic owner
ALTER TABLE property_verifications ALTER COLUMN landlord_id SET DEFAULT auth_landlord_id();

-- ==============================================================================
-- 4. BUSINESS LOGIC TRIGGERS
-- ==============================================================================

-- A. Limit room comparisons
CREATE OR REPLACE FUNCTION check_max_comparisons() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF (SELECT COUNT(*) FROM room_comparisons WHERE student_id = NEW.student_id) >= 4 THEN
        RAISE EXCEPTION 'Comparison matrix cannot exceed 4 items simultaneously (FR-COMP-01)';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_max_comparisons BEFORE INSERT ON room_comparisons
FOR EACH ROW EXECUTE FUNCTION check_max_comparisons();

-- B. Pre-signup validation (role whitelist + ADDU domain)
CREATE OR REPLACE FUNCTION public.enforce_addu_email()
RETURNS TRIGGER SECURITY DEFINER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    v_role TEXT := COALESCE(NEW.raw_user_meta_data->>'role', 'Student');
BEGIN
    IF COALESCE(current_setting('app.allow_staff_create', true), '') = 'on' THEN
        RETURN NEW;  -- internal staff creation path
    END IF;
    IF v_role NOT IN ('Student', 'Landlord') THEN
        RAISE EXCEPTION 'Access Denied: Invalid signup role. Only Student or Landlord may self-register.';
    END IF;
    IF v_role = 'Student' AND LOWER(COALESCE(NEW.email, '')) NOT LIKE '%@addu.edu.ph' THEN
        RAISE EXCEPTION 'Access Denied: Students must use a valid @addu.edu.ph email address.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER check_student_email BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.enforce_addu_email();

-- C. Post-signup: build account + profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER SECURITY DEFINER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    new_account_id BIGINT;
    v_role  TEXT := COALESCE(NEW.raw_user_meta_data->>'role', 'Student');
    v_name  TEXT := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'Unknown Name');
    v_staff BOOLEAN := COALESCE(current_setting('app.allow_staff_create', true), '') = 'on';
BEGIN
    IF v_staff AND v_role IN ('Admin', 'SuperAdmin') THEN
        INSERT INTO public.accounts (auth_id, email, role)
        VALUES (NEW.id, NEW.email, v_role::public.user_role);
        RETURN NEW;  -- staff have no student/landlord profile
    END IF;

    IF v_role NOT IN ('Student', 'Landlord') THEN v_role := 'Student'; END IF;

    INSERT INTO public.accounts (auth_id, email, role)
    VALUES (NEW.id, NEW.email, v_role::public.user_role)
    RETURNING account_id INTO new_account_id;

    IF v_role = 'Landlord' THEN
        INSERT INTO public.landlords (account_id, full_name) VALUES (new_account_id, v_name);
    ELSE
        INSERT INTO public.students (
            account_id, full_name, phone_number, student_id_number, academic_year, gender
        )
        VALUES (
            new_account_id,
            v_name,
            NULLIF(NEW.raw_user_meta_data->>'phone_number', ''),
            NULLIF(NEW.raw_user_meta_data->>'student_id_number', ''),
            NULLIF(NEW.raw_user_meta_data->>'academic_year', ''),
            NULLIF(NEW.raw_user_meta_data->>'gender', '')
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- D. Boarding house insert: auto-assign landlord (SQL editor / service role may pass landlord_id)
CREATE OR REPLACE FUNCTION public.auto_assign_landlord_id()
RETURNS TRIGGER SECURITY DEFINER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        IF NEW.landlord_id IS NULL THEN
            RAISE EXCEPTION 'landlord_id is required when not authenticated.';
        END IF;
        RETURN NEW;
    END IF;
    NEW.landlord_id := public.auth_landlord_id();
    IF NEW.landlord_id IS NULL THEN
        RAISE EXCEPTION 'Access Denied: You must be a registered Landlord to create a property.';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_landlord_identity BEFORE INSERT ON boarding_houses
FOR EACH ROW EXECUTE FUNCTION public.auto_assign_landlord_id();

-- E. Landlords may not touch moderation fields on their houses (replaces the broken WITH CHECK)
CREATE OR REPLACE FUNCTION public.protect_house_admin_fields()
RETURNS TRIGGER SECURITY DEFINER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.is_staff() THEN
        IF NEW.landlord_id        IS DISTINCT FROM OLD.landlord_id
        OR NEW.listing_status     IS DISTINCT FROM OLD.listing_status
        OR NEW.rejection_reason   IS DISTINCT FROM OLD.rejection_reason
        OR NEW.safety_score       IS DISTINCT FROM OLD.safety_score
        OR NEW.badge_fast_wifi    IS DISTINCT FROM OLD.badge_fast_wifi
        OR NEW.badge_24_7_water   IS DISTINCT FROM OLD.badge_24_7_water
        OR NEW.badge_vetted_safe  IS DISTINCT FROM OLD.badge_vetted_safe
        OR NEW.badge_fast_wifi_reason   IS DISTINCT FROM OLD.badge_fast_wifi_reason
        OR NEW.badge_24_7_water_reason  IS DISTINCT FROM OLD.badge_24_7_water_reason
        OR NEW.badge_vetted_safe_reason IS DISTINCT FROM OLD.badge_vetted_safe_reason THEN
            RAISE EXCEPTION 'Only admins can change listing status, scores, or badges.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER protect_house_fields BEFORE UPDATE ON boarding_houses
FOR EACH ROW EXECUTE FUNCTION public.protect_house_admin_fields();

-- F. Booking identity/date columns are immutable for app users
CREATE OR REPLACE FUNCTION public.lock_booking_keys()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NOT NULL THEN
        IF NEW.student_id IS DISTINCT FROM OLD.student_id
           OR NEW.room_id IS DISTINCT FROM OLD.room_id
           OR NEW.start_date IS DISTINCT FROM OLD.start_date THEN
            RAISE EXCEPTION 'Booking student, room and move-in date cannot be changed.';
        END IF;
        IF NEW.end_date IS DISTINCT FROM OLD.end_date
           AND current_setting('app.allow_booking_renewal', TRUE) IS DISTINCT FROM 'on' THEN
            RAISE EXCEPTION 'Billing-cycle dates can only be changed through the renewal flow.';
        END IF;
        IF NEW.roommate_student_id IS DISTINCT FROM OLD.roommate_student_id
           OR (
             NEW.roommate_invite_status IS DISTINCT FROM OLD.roommate_invite_status
             AND current_setting('app.allow_roommate_invite', TRUE) IS DISTINCT FROM 'on'
           ) THEN
            RAISE EXCEPTION 'Roommate invitations can only be changed through the invitation flow.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER lock_booking_keys_trg BEFORE UPDATE ON bookings
FOR EACH ROW EXECUTE FUNCTION public.lock_booking_keys();

-- G. Landlords may review payment status/reason but cannot alter submitted details.
CREATE OR REPLACE FUNCTION public.protect_payment_fields()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NOT NULL AND (
           NEW.booking_id     IS DISTINCT FROM OLD.booking_id
        OR NEW.invoice_id     IS DISTINCT FROM OLD.invoice_id
        OR NEW.amount         IS DISTINCT FROM OLD.amount
        OR NEW.payment_type   IS DISTINCT FROM OLD.payment_type
        OR NEW.student_id     IS DISTINCT FROM OLD.student_id
        OR NEW.payment_date   IS DISTINCT FROM OLD.payment_date
        OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
        OR NEW.receipt_url    IS DISTINCT FROM OLD.receipt_url) THEN
        RAISE EXCEPTION 'Payment details cannot be changed after submission.';
    END IF;
    IF NEW.verification_status = 'Failed'
       AND NULLIF(BTRIM(NEW.rejection_reason), '') IS NULL THEN
        RAISE EXCEPTION 'A rejection reason is required.';
    END IF;
    IF NEW.verification_status <> 'Failed' AND NEW.rejection_reason IS NOT NULL THEN
        RAISE EXCEPTION 'A rejection reason is only allowed for a rejected payment.';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_payment_fields_trg BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION public.protect_payment_fields();

-- ==============================================================================
-- 5. RLS ENABLE + PRIVILEGES
-- ==============================================================================
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE landlords ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE campus_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE boarding_houses ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- FIX: users must never be able to change their own role/email/auth_id
REVOKE UPDATE ON accounts FROM anon, authenticated;
GRANT UPDATE (mfa_enabled, profile_photo_url) ON accounts TO authenticated;

-- ==============================================================================
-- 6. POLICIES
-- ==============================================================================
-- 6.1 Accounts
CREATE POLICY users_self_account_select ON accounts FOR SELECT USING (auth_id = auth.uid());
CREATE POLICY users_self_account_update ON accounts FOR UPDATE USING (auth_id = auth.uid()) WITH CHECK (auth_id = auth.uid());
CREATE POLICY staff_select_accounts ON accounts FOR SELECT USING (is_staff());

-- 6.2 Profiles
CREATE POLICY landlord_self_profile ON landlords FOR ALL USING (landlord_id = auth_landlord_id()) WITH CHECK (landlord_id = auth_landlord_id());
CREATE POLICY student_self_profile  ON students  FOR ALL USING (student_id  = auth_student_id())  WITH CHECK (student_id  = auth_student_id());
CREATE POLICY landlord_view_applicant_students ON students FOR SELECT USING (
    student_id IN (
        SELECT student_id FROM bookings WHERE booking_id IN (SELECT my_booking_ids())
        UNION
        SELECT roommate_student_id FROM bookings
        WHERE booking_id IN (SELECT my_booking_ids()) AND roommate_student_id IS NOT NULL
    )
);
CREATE POLICY staff_select_landlords ON landlords FOR SELECT USING (is_staff());
CREATE POLICY staff_select_students  ON students  FOR SELECT USING (is_staff());

-- 6.3 Campus gates
CREATE POLICY everyone_read_campus_gates ON campus_gates FOR SELECT USING (true);
CREATE POLICY superadmin_manage_campus_gates ON campus_gates FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());

-- 6.4 Boarding houses & verifications
CREATE POLICY landlord_select_houses ON boarding_houses FOR SELECT USING (landlord_id = auth_landlord_id());
CREATE POLICY landlord_insert_houses ON boarding_houses FOR INSERT WITH CHECK (
    landlord_id = auth_landlord_id() AND listing_status = 'Pending' AND safety_score IS NULL
    AND badge_fast_wifi = FALSE AND badge_24_7_water = FALSE AND badge_vetted_safe = FALSE
);
CREATE POLICY landlord_update_houses ON boarding_houses FOR UPDATE
    USING (landlord_id = auth_landlord_id()) WITH CHECK (landlord_id = auth_landlord_id());  -- moderation fields guarded by trigger
CREATE POLICY public_select_published_houses ON boarding_houses FOR SELECT USING (
    listing_status = 'Published' AND COALESCE(auth_user_role()::text, '') <> 'Landlord'
);

CREATE POLICY landlord_insert_verifications ON property_verifications FOR INSERT WITH CHECK (
    auth_user_role() = 'Landlord' AND landlord_id = auth_landlord_id()
    AND verification_status = 'Pending' AND admin_reviewer_id IS NULL
);
CREATE POLICY landlord_select_verifications ON property_verifications FOR SELECT USING (landlord_id = auth_landlord_id());

-- 6.5 Rooms
CREATE POLICY landlord_select_rooms ON rooms FOR SELECT USING (house_id IN (SELECT my_house_ids()));
CREATE POLICY landlord_insert_rooms ON rooms FOR INSERT WITH CHECK (house_id IN (SELECT my_house_ids()) AND availability_status IN ('Available', 'Unavailable'));
CREATE POLICY landlord_update_rooms ON rooms FOR UPDATE USING (house_id IN (SELECT my_house_ids())) WITH CHECK (house_id IN (SELECT my_house_ids()));
CREATE POLICY student_select_rooms ON rooms FOR SELECT USING (house_id IN (SELECT house_id FROM boarding_houses WHERE listing_status = 'Published'));

-- 6.6 Bookings & invoices
CREATE POLICY student_select_bookings ON bookings FOR SELECT USING (
    student_id = auth_student_id()
    OR (roommate_student_id = auth_student_id() AND roommate_invite_status IN ('Pending', 'Accepted'))
);
CREATE POLICY student_insert_bookings ON bookings FOR INSERT WITH CHECK (
    student_id = auth_student_id() AND status = 'Pending'
    AND start_date >= CURRENT_DATE
    AND roommate_student_id IS NULL AND roommate_invite_status IS NULL
    AND room_id IN (SELECT room_id FROM rooms WHERE house_id IN (SELECT house_id FROM boarding_houses WHERE listing_status = 'Published'))
);
CREATE POLICY student_cancel_bookings ON bookings FOR UPDATE USING (student_id = auth_student_id()) WITH CHECK (student_id = auth_student_id() AND status = 'Cancelled');
CREATE POLICY landlord_select_bookings ON bookings FOR SELECT USING (booking_id IN (SELECT my_booking_ids()));
CREATE POLICY landlord_update_bookings ON bookings FOR UPDATE USING (booking_id IN (SELECT my_booking_ids())) WITH CHECK (
    booking_id IN (SELECT my_booking_ids())
    AND (
        status <> 'Completed'
        OR (actual_end_date IS NOT NULL AND actual_end_date >= start_date AND actual_end_date <= CURRENT_DATE)
    )
);

CREATE POLICY student_select_invoices ON invoices FOR SELECT USING (student_id = auth_student_id());
CREATE POLICY landlord_select_invoices ON invoices FOR SELECT USING (booking_id IN (SELECT my_booking_ids()));
CREATE POLICY staff_select_invoices ON invoices FOR SELECT USING (is_staff());

-- 6.7 Payments
CREATE POLICY student_select_payments ON payments FOR SELECT USING (student_id = auth_student_id());
CREATE POLICY landlord_select_payments ON payments FOR SELECT USING (booking_id IN (SELECT my_booking_ids()));
CREATE POLICY landlord_update_payments ON payments FOR UPDATE
USING (
    verification_status = 'Pending'
    AND booking_id IN (SELECT my_booking_ids())
)
WITH CHECK (
    booking_id IN (SELECT my_booking_ids())
    AND verification_status IN ('Verified', 'Failed')
    AND (
        (verification_status = 'Verified' AND rejection_reason IS NULL)
        OR (verification_status = 'Failed' AND NULLIF(BTRIM(rejection_reason), '') IS NOT NULL)
    )
);

-- 6.8 Saved listings & comparisons
CREATE POLICY student_manage_saved_listings ON saved_listings FOR ALL USING (student_id = auth_student_id()) WITH CHECK (student_id = auth_student_id());
CREATE POLICY student_manage_comparisons ON room_comparisons FOR ALL USING (student_id = auth_student_id()) WITH CHECK (student_id = auth_student_id());

-- 6.9 Reviews
CREATE POLICY general_select_reviews ON reviews FOR SELECT USING (is_hidden = FALSE);
CREATE POLICY student_insert_reviews ON reviews FOR INSERT WITH CHECK (
    student_id = auth_student_id() AND is_hidden = FALSE AND is_student_verified = TRUE
    AND EXISTS (SELECT 1 FROM bookings b JOIN rooms r ON b.room_id = r.room_id
                WHERE b.student_id = auth_student_id() AND r.house_id = reviews.house_id
                AND b.status IN ('Confirmed', 'Completed'))
);
CREATE POLICY staff_select_all_reviews ON reviews FOR SELECT USING (is_staff());
CREATE POLICY staff_moderate_reviews ON reviews FOR UPDATE USING (is_staff());

-- 6.10 Messaging
REVOKE ALL ON TABLE messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT (sender_id, receiver_id, content), UPDATE (is_read)
ON TABLE messages TO authenticated;
CREATE POLICY users_select_messages ON messages FOR SELECT USING (
    auth_user_role() IN ('Admin', 'Landlord', 'Student')
    AND (sender_id = auth_account_id() OR receiver_id = auth_account_id())
    AND is_chat_eligible_account(sender_id)
    AND is_chat_eligible_account(receiver_id)
);
CREATE POLICY users_insert_messages ON messages FOR INSERT WITH CHECK (
    auth_user_role() IN ('Admin', 'Landlord', 'Student')
    AND sender_id = auth_account_id()
    AND is_chat_eligible_account(sender_id)
    AND is_chat_eligible_account(receiver_id)
);
CREATE POLICY users_update_messages ON messages FOR UPDATE
USING (
    auth_user_role() IN ('Admin', 'Landlord', 'Student')
    AND receiver_id = auth_account_id()
    AND is_chat_eligible_account(sender_id)
    AND is_chat_eligible_account(receiver_id)
)
WITH CHECK (
    auth_user_role() IN ('Admin', 'Landlord', 'Student')
    AND receiver_id = auth_account_id()
    AND is_chat_eligible_account(sender_id)
    AND is_chat_eligible_account(receiver_id)
);

CREATE OR REPLACE VIEW public.message_peers AS
SELECT
    a.account_id,
    a.role::TEXT AS role,
    COALESCE(l.full_name, s.full_name, NULLIF(split_part(a.email, '@', 1), '')) AS full_name,
    COALESCE(l.profile_photo_url, s.profile_photo_url, a.profile_photo_url) AS profile_photo_url
FROM public.accounts a
LEFT JOIN public.landlords l ON l.account_id = a.account_id
LEFT JOIN public.students s ON s.account_id = a.account_id
WHERE a.role IN ('Admin', 'Landlord', 'Student')
  AND auth_user_role() IN ('Admin', 'Landlord', 'Student')
  AND a.account_id <> auth_account_id();
GRANT SELECT ON public.message_peers TO authenticated;

-- 6.11 Settings & audit
CREATE POLICY everyone_read_settings ON system_settings FOR SELECT USING (true);
CREATE POLICY superadmin_manage_settings ON system_settings FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());
CREATE POLICY staff_select_audit ON audit_logs FOR SELECT USING (is_staff());
CREATE POLICY staff_insert_audit ON audit_logs FOR INSERT WITH CHECK (is_staff());

-- 6.12 Admin oversight
CREATE POLICY staff_all_verifications ON property_verifications FOR ALL USING (is_staff());
CREATE POLICY staff_all_inspections ON property_inspections FOR ALL USING (is_staff());
CREATE POLICY staff_select_houses ON boarding_houses FOR SELECT USING (is_staff());
CREATE POLICY staff_moderate_houses ON boarding_houses FOR UPDATE USING (is_staff());
CREATE POLICY staff_select_rooms ON rooms FOR SELECT USING (is_staff());
CREATE POLICY staff_select_bookings ON bookings FOR SELECT USING (is_staff());
CREATE POLICY staff_select_payments ON payments FOR SELECT USING (is_staff());

-- ==============================================================================
-- 7. STAFF CREATION (SuperAdmin / Admin) - callable only from the SQL Editor
-- ==============================================================================
-- 5. create_staff_user(): run from the SQL Editor (postgres) only -------------------
CREATE OR REPLACE FUNCTION public.create_staff_user(
    p_email     TEXT,
    p_password  TEXT,
    p_full_name TEXT,
    p_role      TEXT DEFAULT 'Admin'
) RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, auth AS $$
DECLARE
    v_uid UUID := gen_random_uuid();
    v_acc BIGINT;
    v_email TEXT := LOWER(TRIM(p_email));
BEGIN
    IF p_role NOT IN ('Admin', 'SuperAdmin') THEN
        RAISE EXCEPTION 'p_role must be Admin or SuperAdmin';
    END IF;

    PERFORM set_config('app.allow_staff_create', 'on', true);   -- transaction-local

    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
        v_email, crypt(p_password, gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('role', p_role, 'full_name', p_full_name),
        now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (
        id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_uid, v_uid::text, 'email',
        jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
        now(), now(), now()
    );

    PERFORM set_config('app.allow_staff_create', 'off', true);

    SELECT account_id INTO v_acc FROM public.accounts WHERE auth_id = v_uid;
    RETURN v_acc;
END;
$$;

-- Nobody but postgres/service role can call it
REVOKE ALL ON FUNCTION public.create_staff_user(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Realtime listing updates allow clients to refresh safety scores immediately.
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.boarding_houses;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==============================================================================
-- 7b. CACHE REFRESH
-- ==============================================================================
NOTIFY pgrst, 'reload schema';
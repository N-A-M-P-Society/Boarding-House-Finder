-- ==============================================================================
-- UniRent: additions to run AFTER supabase_schema.sql (safe to re-run)
-- ==============================================================================

ALTER TYPE public.room_status ADD VALUE IF NOT EXISTS 'Unavailable';
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS unavailable_reason TEXT;
ALTER TABLE public.boarding_houses
  ADD COLUMN IF NOT EXISTS badge_fast_wifi_reason TEXT,
  ADD COLUMN IF NOT EXISTS badge_24_7_water_reason TEXT,
  ADD COLUMN IF NOT EXISTS badge_vetted_safe_reason TEXT;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS moderation_reason TEXT;

CREATE OR REPLACE FUNCTION public.protect_house_admin_fields()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_staff() THEN
    IF NEW.landlord_id IS DISTINCT FROM OLD.landlord_id
      OR NEW.listing_status IS DISTINCT FROM OLD.listing_status
      OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
      OR NEW.safety_score IS DISTINCT FROM OLD.safety_score
      OR NEW.badge_fast_wifi IS DISTINCT FROM OLD.badge_fast_wifi
      OR NEW.badge_24_7_water IS DISTINCT FROM OLD.badge_24_7_water
      OR NEW.badge_vetted_safe IS DISTINCT FROM OLD.badge_vetted_safe
      OR NEW.badge_fast_wifi_reason IS DISTINCT FROM OLD.badge_fast_wifi_reason
      OR NEW.badge_24_7_water_reason IS DISTINCT FROM OLD.badge_24_7_water_reason
      OR NEW.badge_vetted_safe_reason IS DISTINCT FROM OLD.badge_vetted_safe_reason THEN
      RAISE EXCEPTION 'Only admins can change listing status, scores, or badges.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS landlord_insert_rooms ON public.rooms;
CREATE POLICY landlord_insert_rooms ON public.rooms FOR INSERT
WITH CHECK (
  house_id IN (SELECT my_house_ids())
  AND availability_status::TEXT IN ('Available', 'Unavailable')
);

DROP POLICY IF EXISTS landlord_update_rooms ON public.rooms;
CREATE POLICY landlord_update_rooms ON public.rooms FOR UPDATE
USING (house_id IN (SELECT my_house_ids()))
WITH CHECK (house_id IN (SELECT my_house_ids()));

CREATE OR REPLACE FUNCTION public.prevent_unavailable_room_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
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
       FROM public.rooms r
       WHERE r.room_id = NEW.room_id
         AND r.availability_status::TEXT = 'Unavailable'
     ) THEN
    RAISE EXCEPTION 'This room is unavailable while repairs are in progress.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_unavailable_room_booking ON public.bookings;
CREATE TRIGGER prevent_unavailable_room_booking
BEFORE INSERT OR UPDATE OF room_id, start_date, end_date, status, roommate_student_id, roommate_invite_status
ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.prevent_unavailable_room_booking();

-- Student profile requirements: optional gender and a unique 12-digit student ID.
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_gender_check;
ALTER TABLE public.students
  ADD CONSTRAINT students_gender_check
  CHECK (gender IS NULL OR gender IN ('Female', 'Male'));

ALTER TABLE public.boarding_houses
  ADD COLUMN IF NOT EXISTS gender_policy TEXT NOT NULL DEFAULT 'Any';
ALTER TABLE public.boarding_houses
  DROP CONSTRAINT IF EXISTS boarding_houses_gender_policy_check;
ALTER TABLE public.boarding_houses
  ADD CONSTRAINT boarding_houses_gender_policy_check
  CHECK (gender_policy IN ('Any', 'Female', 'Male'));

DROP INDEX IF EXISTS public.students_id_number_key;

UPDATE public.students
SET student_id_number = CASE
      WHEN regexp_replace(student_id_number, '[^0-9]', '', 'g') ~ '^[0-9]{12}$'
        THEN regexp_replace(student_id_number, '[^0-9]', '', 'g')
      ELSE NULL
    END
WHERE student_id_number IS NOT NULL;

UPDATE public.students s
SET student_id_number = NULL
WHERE student_id_number IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.students o
    WHERE o.student_id_number = s.student_id_number
      AND o.student_id < s.student_id
  );

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_id_number_format;
ALTER TABLE public.students
  ADD CONSTRAINT students_id_number_format
  CHECK (student_id_number IS NULL OR student_id_number ~ '^[0-9]{12}$');
CREATE UNIQUE INDEX IF NOT EXISTS students_id_number_key
  ON public.students (student_id_number) WHERE student_id_number IS NOT NULL;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS actual_end_date DATE;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'valid_actual_booking_end_date'
      AND conrelid = 'public.bookings'::regclass
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT valid_actual_booking_end_date
      CHECK (actual_end_date IS NULL OR actual_end_date >= start_date);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'valid_payment_rejection_reason'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT valid_payment_rejection_reason
      CHECK (
        (verification_status = 'Failed' AND NULLIF(BTRIM(rejection_reason), '') IS NOT NULL)
        OR (verification_status <> 'Failed' AND rejection_reason IS NULL)
      ) NOT VALID;
  END IF;
END $$;

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
        RETURN NEW;
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

-- Landlords can see their own houses through landlord_select_houses, but not
-- other landlords' published houses. Students and guests still see published listings.
DROP POLICY IF EXISTS public_select_published_houses ON public.boarding_houses;
CREATE POLICY public_select_published_houses ON public.boarding_houses
  FOR SELECT USING (
    listing_status = 'Published'
    AND COALESCE(public.auth_user_role()::text, '') <> 'Landlord'
  );

DROP POLICY IF EXISTS student_insert_bookings ON public.bookings;
CREATE POLICY student_insert_bookings ON public.bookings FOR INSERT WITH CHECK (
  student_id = public.auth_student_id()
  AND status = 'Pending'
  AND start_date >= CURRENT_DATE
  AND room_id IN (
    SELECT room_id FROM public.rooms
    WHERE house_id IN (SELECT house_id FROM public.boarding_houses WHERE listing_status = 'Published')
  )
);

DROP POLICY IF EXISTS student_cancel_bookings ON public.bookings;
CREATE POLICY student_cancel_bookings ON public.bookings FOR UPDATE
  USING (student_id = public.auth_student_id() AND status = 'Pending')
  WITH CHECK (student_id = public.auth_student_id() AND status = 'Cancelled');

DROP POLICY IF EXISTS landlord_update_bookings ON public.bookings;
CREATE POLICY landlord_update_bookings ON public.bookings FOR UPDATE
  USING (booking_id IN (SELECT public.my_booking_ids()))
  WITH CHECK (
    booking_id IN (SELECT public.my_booking_ids())
    AND (
      status <> 'Completed'
      OR (actual_end_date IS NOT NULL AND actual_end_date >= start_date AND actual_end_date <= CURRENT_DATE)
    )
  );

DROP POLICY IF EXISTS student_insert_payments ON public.payments;
CREATE POLICY student_insert_payments ON public.payments FOR INSERT WITH CHECK (
  booking_id IN (
    SELECT booking_id FROM public.bookings
    WHERE student_id = public.auth_student_id() AND status = 'Confirmed'
  )
  AND verification_status = 'Pending'
  AND payment_type IN ('Monthly rent', 'Security deposit')
  AND amount > 0
  AND receipt_url LIKE ('payments/' || auth.uid()::TEXT || '/%')
);

DROP POLICY IF EXISTS landlord_update_payments ON public.payments;
CREATE POLICY landlord_update_payments ON public.payments FOR UPDATE
USING (
  verification_status = 'Pending'
  AND booking_id IN (SELECT public.my_booking_ids())
)
WITH CHECK (
  booking_id IN (SELECT public.my_booking_ids())
  AND verification_status IN ('Verified', 'Failed')
  AND (
    (verification_status = 'Verified' AND rejection_reason IS NULL)
    OR (verification_status = 'Failed' AND NULLIF(BTRIM(rejection_reason), '') IS NOT NULL)
  )
);

CREATE OR REPLACE FUNCTION public.protect_payment_fields()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (
       NEW.booking_id IS DISTINCT FROM OLD.booking_id
    OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.payment_type IS DISTINCT FROM OLD.payment_type
    OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
    OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
    OR NEW.receipt_url IS DISTINCT FROM OLD.receipt_url
  ) THEN
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

-- 1. Public-safe landlord directory (name + account only; government_id etc. stay private)
ALTER TABLE public.landlords ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
CREATE OR REPLACE VIEW public.landlord_public AS
  SELECT landlord_id, account_id, full_name, profile_photo_url FROM public.landlords;
GRANT SELECT ON public.landlord_public TO anon, authenticated;

-- 2. Contacts for direct messages between regular users. SuperAdmin is developer-only.
CREATE OR REPLACE FUNCTION public.is_chat_eligible_account(p_account_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.accounts
    WHERE account_id = p_account_id
      AND role IN ('Admin', 'Landlord', 'Student')
  );
$$;
REVOKE ALL ON FUNCTION public.is_chat_eligible_account(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_chat_eligible_account(BIGINT) TO authenticated;

CREATE OR REPLACE VIEW public.message_peers AS
  SELECT
    a.account_id,
    a.role::text AS role,
    COALESCE(l.full_name, s.full_name, NULLIF(split_part(a.email, '@', 1), '')) AS full_name,
    COALESCE(l.profile_photo_url, s.profile_photo_url, a.profile_photo_url) AS profile_photo_url
  FROM public.accounts a
  LEFT JOIN public.landlords l ON l.account_id = a.account_id
  LEFT JOIN public.students  s ON s.account_id = a.account_id
  WHERE a.role IN ('Admin', 'Landlord', 'Student')
    AND public.auth_user_role() IN ('Admin', 'Landlord', 'Student')
    AND a.account_id <> public.auth_account_id();
GRANT SELECT ON public.message_peers TO authenticated;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT (sender_id, receiver_id, content), UPDATE (is_read)
ON TABLE public.messages TO authenticated;

DO $$
DECLARE
  v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'messages'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.messages', v_policy.policyname);
  END LOOP;
END $$;

CREATE POLICY users_select_messages ON public.messages FOR SELECT TO authenticated USING (
  public.auth_user_role() IN ('Admin', 'Landlord', 'Student')
  AND (sender_id = public.auth_account_id() OR receiver_id = public.auth_account_id())
  AND public.is_chat_eligible_account(sender_id)
  AND public.is_chat_eligible_account(receiver_id)
);

CREATE POLICY users_insert_messages ON public.messages FOR INSERT TO authenticated WITH CHECK (
  public.auth_user_role() IN ('Admin', 'Landlord', 'Student')
  AND sender_id = public.auth_account_id()
  AND public.is_chat_eligible_account(sender_id)
  AND public.is_chat_eligible_account(receiver_id)
);

CREATE POLICY users_update_messages ON public.messages FOR UPDATE TO authenticated
USING (
  public.auth_user_role() IN ('Admin', 'Landlord', 'Student')
  AND receiver_id = public.auth_account_id()
  AND public.is_chat_eligible_account(sender_id)
  AND public.is_chat_eligible_account(receiver_id)
)
WITH CHECK (
  public.auth_user_role() IN ('Admin', 'Landlord', 'Student')
  AND receiver_id = public.auth_account_id()
  AND public.is_chat_eligible_account(sender_id)
  AND public.is_chat_eligible_account(receiver_id)
);

-- 3. Let everyone see inspection results of PUBLISHED houses (powers the safety breakdown)
DROP POLICY IF EXISTS public_select_published_inspections ON public.property_inspections;
CREATE POLICY public_select_published_inspections ON public.property_inspections
  FOR SELECT USING (house_id IN (SELECT house_id FROM public.boarding_houses WHERE listing_status = 'Published'));

-- 4. Optional photo support (the app reads image_urls if present, else shows a placeholder)
ALTER TABLE public.boarding_houses ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
GRANT UPDATE (profile_photo_url) ON public.accounts TO authenticated;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
ALTER TABLE public.property_verifications ADD COLUMN IF NOT EXISTS government_id_url TEXT;
ALTER TABLE public.property_verifications ADD COLUMN IF NOT EXISTS proof_of_ownership_url TEXT;

-- Public listing/profile/room photos and private landlord verification documents.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'unirent-images',
  'UniRent Images',
  TRUE,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::TEXT[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'unirent-verification',
  'UniRent Verification Documents',
  FALSE,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::TEXT[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS unirent_images_public_read ON storage.objects;
CREATE POLICY unirent_images_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'unirent-images');

DROP POLICY IF EXISTS unirent_images_owner_insert ON storage.objects;
CREATE POLICY unirent_images_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'unirent-images'
    AND (storage.foldername(name))[2] = auth.uid()::TEXT
    AND (
      (storage.foldername(name))[1] = 'profiles'
      OR (
        (storage.foldername(name))[1] IN ('listings', 'rooms')
        AND public.auth_user_role() = 'Landlord'
      )
    )
  );

DROP POLICY IF EXISTS unirent_images_owner_update ON storage.objects;
CREATE POLICY unirent_images_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'unirent-images'
    AND (storage.foldername(name))[2] = auth.uid()::TEXT
    AND (
      (storage.foldername(name))[1] = 'profiles'
      OR (
        (storage.foldername(name))[1] IN ('listings', 'rooms')
        AND public.auth_user_role() = 'Landlord'
      )
    )
    AND (
      (storage.foldername(name))[1] = 'profiles'
      OR (
        (storage.foldername(name))[1] IN ('listings', 'rooms')
        AND public.auth_user_role() = 'Landlord'
      )
    )
  )
  WITH CHECK (
    bucket_id = 'unirent-images'
    AND (storage.foldername(name))[2] = auth.uid()::TEXT
    AND (
      (storage.foldername(name))[1] = 'profiles'
      OR (
        (storage.foldername(name))[1] IN ('listings', 'rooms')
        AND public.auth_user_role() = 'Landlord'
      )
    )
  );

DROP POLICY IF EXISTS unirent_images_owner_delete ON storage.objects;
CREATE POLICY unirent_images_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'unirent-images'
    AND (storage.foldername(name))[2] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS unirent_verification_owner_or_staff_read ON storage.objects;
CREATE POLICY unirent_verification_owner_or_staff_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'unirent-verification'
    AND (
      (
        (storage.foldername(name))[2] = auth.uid()::TEXT
        AND (storage.foldername(name))[1] = 'verification'
        AND public.auth_user_role() = 'Landlord'
      )
      OR public.is_staff()
      OR (
        (storage.foldername(name))[1] = 'payments'
        AND (storage.foldername(name))[2] = auth.uid()::TEXT
        AND public.auth_user_role() = 'Student'
        AND EXISTS (
          SELECT 1
          FROM public.payments p
          JOIN public.bookings b ON b.booking_id = p.booking_id
          WHERE p.receipt_url = storage.objects.name
            AND b.student_id = public.auth_student_id()
        )
      )
      OR (
        (storage.foldername(name))[1] = 'payments'
        AND public.auth_user_role() = 'Landlord'
        AND EXISTS (
          SELECT 1
          FROM public.payments p
          JOIN public.bookings b ON b.booking_id = p.booking_id
          JOIN public.rooms r ON r.room_id = b.room_id
          JOIN public.boarding_houses h ON h.house_id = r.house_id
          WHERE p.receipt_url = storage.objects.name
            AND h.landlord_id = public.auth_landlord_id()
        )
      )
    )
  );

DROP POLICY IF EXISTS unirent_verification_owner_insert ON storage.objects;
CREATE POLICY unirent_verification_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'unirent-verification'
    AND (storage.foldername(name))[2] = auth.uid()::TEXT
    AND (
      ((storage.foldername(name))[1] = 'verification' AND public.auth_user_role() = 'Landlord')
      OR ((storage.foldername(name))[1] = 'payments' AND public.auth_user_role() = 'Student')
    )
  );

DROP POLICY IF EXISTS unirent_verification_owner_update ON storage.objects;
CREATE POLICY unirent_verification_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'unirent-verification'
    AND (storage.foldername(name))[2] = auth.uid()::TEXT
    AND public.auth_user_role() = 'Landlord'
  )
  WITH CHECK (
    bucket_id = 'unirent-verification'
    AND (storage.foldername(name))[2] = auth.uid()::TEXT
    AND public.auth_user_role() = 'Landlord'
  );

DROP POLICY IF EXISTS unirent_verification_owner_delete ON storage.objects;
CREATE POLICY unirent_verification_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'unirent-verification'
    AND (storage.foldername(name))[2] = auth.uid()::TEXT
    AND (
      ((storage.foldername(name))[1] = 'verification' AND public.auth_user_role() = 'Landlord')
      OR (
        (storage.foldername(name))[1] = 'payments'
        AND public.auth_user_role() = 'Student'
        AND NOT EXISTS (
          SELECT 1 FROM public.payments p
          WHERE p.receipt_url = storage.objects.name
        )
      )
    )
  );

-- 5. Campus gates for the Leaflet map + walking-distance calculation (ADDU Jacinto - adjust to your survey)
INSERT INTO public.campus_gates (university_name, gate_name, latitude, longitude, is_main_entry)
SELECT 'Ateneo de Davao University', 'Main Gate (Roxas Ave.)', 7.07220000, 125.61310000, TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.campus_gates WHERE gate_name = 'Main Gate (Roxas Ave.)');

-- 6. Realtime for chat
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Realtime listing updates so students see recalculated safety scores without reloading.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.boarding_houses;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Confirmed bookings represent open-ended stays; end_date is the current billing-cycle end.
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
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_booking_during_open_stay()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('Pending', 'Confirmed') THEN
    PERFORM pg_advisory_xact_lock(NEW.room_id);

    IF EXISTS (
      SELECT 1
      FROM public.bookings current_stay
      WHERE current_stay.room_id = NEW.room_id
        AND current_stay.booking_id IS DISTINCT FROM NEW.booking_id
        AND current_stay.status = 'Confirmed'
        AND current_stay.actual_end_date IS NULL
        AND current_stay.start_date < NEW.end_date
    ) THEN
      RAISE EXCEPTION 'This room is occupied by an open-ended stay.';
    END IF;

    IF NEW.status = 'Confirmed' AND EXISTS (
      SELECT 1
      FROM public.bookings future_request
      WHERE future_request.room_id = NEW.room_id
        AND future_request.booking_id IS DISTINCT FROM NEW.booking_id
        AND future_request.status = 'Pending'
        AND future_request.start_date >= NEW.start_date
        AND future_request.end_date > NEW.start_date
    ) THEN
      RAISE EXCEPTION 'This room has a pending booking after the requested move-in date.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_booking_during_open_stay_trg ON public.bookings;
CREATE TRIGGER reject_booking_during_open_stay_trg
  BEFORE INSERT OR UPDATE OF room_id, start_date, end_date, status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.reject_booking_during_open_stay();

CREATE OR REPLACE FUNCTION public.release_room_after_move_out()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'Completed' AND OLD.status <> 'Completed' THEN
    UPDATE public.rooms
    SET availability_status = 'Available'
    WHERE room_id = NEW.room_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.bookings active_stay
        WHERE active_stay.room_id = NEW.room_id
          AND active_stay.booking_id <> NEW.booking_id
          AND active_stay.status = 'Confirmed'
          AND active_stay.actual_end_date IS NULL
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS release_room_after_move_out_trg ON public.bookings;
CREATE TRIGGER release_room_after_move_out_trg
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.release_room_after_move_out();

CREATE OR REPLACE FUNCTION public.renew_booking(p_booking_id BIGINT)
RETURNS DATE
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  current_booking public.bookings%ROWTYPE;
  renewed_end_date DATE;
BEGIN
  IF public.auth_user_role() <> 'Student' THEN
    RAISE EXCEPTION 'Only the student on this booking can renew the stay.';
  END IF;

  SELECT * INTO current_booking
  FROM public.bookings
  WHERE booking_id = p_booking_id
    AND student_id = public.auth_student_id()
  FOR UPDATE;

  IF NOT FOUND OR current_booking.status <> 'Confirmed' OR current_booking.actual_end_date IS NOT NULL THEN
    RAISE EXCEPTION 'This booking is not an active confirmed stay.';
  END IF;
  IF current_booking.roommate_invite_status = 'Pending' THEN
    RAISE EXCEPTION 'Accept or decline the pending roommate request before renewing this stay.';
  END IF;
  IF current_booking.end_date > CURRENT_DATE + 7 THEN
    RAISE EXCEPTION 'Stay renewal is available during the seven days before the billing-cycle end.';
  END IF;

  PERFORM set_config('app.allow_booking_renewal', 'on', TRUE);
  UPDATE public.bookings
  SET end_date = (current_booking.end_date + INTERVAL '1 month')::DATE
  WHERE booking_id = current_booking.booking_id
  RETURNING end_date INTO renewed_end_date;

  RETURN renewed_end_date;
END;
$$;
REVOKE ALL ON FUNCTION public.renew_booking(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renew_booking(BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.student_move_out_booking(p_booking_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  moved_booking_id BIGINT;
BEGIN
  IF public.auth_user_role() <> 'Student' THEN
    RAISE EXCEPTION 'Only the student on this booking can confirm move-out.';
  END IF;

  UPDATE public.bookings
  SET status = 'Completed',
      actual_end_date = CURRENT_DATE
  WHERE booking_id = p_booking_id
    AND student_id = public.auth_student_id()
    AND status = 'Confirmed'
    AND actual_end_date IS NULL
    AND start_date <= CURRENT_DATE
  RETURNING booking_id INTO moved_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This booking is not an active stay that can be moved out.';
  END IF;

  RETURN moved_booking_id;
END;
$$;
REVOKE ALL ON FUNCTION public.student_move_out_booking(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_move_out_booking(BIGINT) TO authenticated;

DROP FUNCTION IF EXISTS public.get_public_roommate_requests();

CREATE TABLE IF NOT EXISTS public.roommate_match_requests (
  request_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id BIGINT NOT NULL UNIQUE REFERENCES public.students(student_id) ON DELETE CASCADE,
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  selected_student_id BIGINT REFERENCES public.students(student_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (selected_student_id IS NULL OR selected_student_id <> student_id)
);

CREATE TABLE IF NOT EXISTS public.roommate_match_candidates (
  request_id BIGINT NOT NULL REFERENCES public.roommate_match_requests(request_id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES public.students(student_id) ON DELETE CASCADE,
  landlord_id BIGINT NOT NULL REFERENCES public.landlords(landlord_id) ON DELETE CASCADE,
  compatibility_score SMALLINT NOT NULL CHECK (compatibility_score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (request_id, student_id)
);

CREATE INDEX IF NOT EXISTS roommate_match_requests_open_idx
  ON public.roommate_match_requests (created_at DESC) WHERE is_open;
CREATE INDEX IF NOT EXISTS roommate_match_candidates_student_idx
  ON public.roommate_match_candidates (student_id);

ALTER TABLE public.roommate_match_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roommate_match_candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.roommate_match_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.roommate_match_candidates FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_roommate_match_request()
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_student_id BIGINT;
  v_gender TEXT;
  v_request_id BIGINT;
BEGIN
  IF public.auth_user_role() IS DISTINCT FROM 'Student'::public.user_role THEN
    RAISE EXCEPTION 'Only students can request a roommate';
  END IF;

  v_student_id := public.auth_student_id();
  SELECT s.gender INTO v_gender
  FROM public.students s
  WHERE s.student_id = v_student_id
    AND s.pref_sleep_schedule IS NOT NULL
    AND s.pref_study_habits IS NOT NULL
    AND s.pref_cleanliness IS NOT NULL
    AND s.pref_guest_policy IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Complete the compatibility quiz before requesting a roommate';
  END IF;
  IF v_gender IS NULL OR v_gender NOT IN ('Female', 'Male') THEN
    RAISE EXCEPTION 'A Female or Male profile is required for same-gender roommate matching';
  END IF;

  INSERT INTO public.roommate_match_requests (student_id, is_open, selected_student_id)
  VALUES (v_student_id, TRUE, NULL)
  ON CONFLICT (student_id) DO UPDATE
    SET is_open = TRUE,
        selected_student_id = NULL,
        created_at = NOW(),
        updated_at = NOW()
  RETURNING request_id INTO v_request_id;

  DELETE FROM public.roommate_match_candidates
  WHERE request_id = v_request_id
     OR student_id = v_student_id;

  RETURN v_request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_roommate_match_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_roommate_match_request() TO authenticated;

CREATE OR REPLACE FUNCTION public.close_roommate_match_request()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_student_id BIGINT;
  v_request_id BIGINT;
BEGIN
  IF public.auth_user_role() IS DISTINCT FROM 'Student'::public.user_role THEN
    RAISE EXCEPTION 'Only students can close a roommate request';
  END IF;

  v_student_id := public.auth_student_id();
  UPDATE public.roommate_match_requests
  SET is_open = FALSE, updated_at = NOW()
  WHERE student_id = v_student_id
    AND is_open
  RETURNING request_id INTO v_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active roommate request was found';
  END IF;

  DELETE FROM public.roommate_match_candidates
  WHERE request_id = v_request_id
     OR student_id = v_student_id;
END;
$$;
REVOKE ALL ON FUNCTION public.close_roommate_match_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_roommate_match_request() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_roommate_match_request()
RETURNS TABLE (
  request_id BIGINT,
  is_open BOOLEAN,
  selected_student_id BIGINT,
  selected_account_id BIGINT,
  selected_full_name TEXT,
  selected_profile_photo_url TEXT,
  selected_gender TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.request_id, r.is_open, r.selected_student_id,
         chosen.account_id, chosen.full_name, chosen.profile_photo_url, chosen.gender
  FROM public.roommate_match_requests r
  LEFT JOIN public.students chosen ON chosen.student_id = r.selected_student_id
  WHERE r.student_id = public.auth_student_id()
    AND public.auth_user_role() = 'Student'
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_my_roommate_match_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_roommate_match_request() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_roommate_match_candidates()
RETURNS TABLE (
  student_id BIGINT,
  account_id BIGINT,
  full_name TEXT,
  profile_photo_url TEXT,
  gender TEXT,
  academic_year TEXT,
  pref_sleep_schedule INT,
  pref_study_habits INT,
  pref_cleanliness INT,
  pref_guest_policy INT,
  compatibility_score INTEGER,
  is_nominated BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.student_id, s.account_id, s.full_name, s.profile_photo_url, s.gender,
         s.academic_year, s.pref_sleep_schedule, s.pref_study_habits,
         s.pref_cleanliness, s.pref_guest_policy, mc.compatibility_score::INTEGER,
         (r.selected_student_id = s.student_id) AS is_nominated
  FROM public.roommate_match_requests r
  JOIN public.roommate_match_candidates mc ON mc.request_id = r.request_id
  JOIN public.students s ON s.student_id = mc.student_id
  WHERE r.student_id = public.auth_student_id()
    AND public.auth_user_role() = 'Student'
    AND EXISTS (
      SELECT 1
      FROM public.roommate_match_requests candidate_request
      WHERE candidate_request.student_id = s.student_id
        AND candidate_request.is_open
    )
  ORDER BY mc.compatibility_score DESC, s.full_name;
$$;
REVOKE ALL ON FUNCTION public.get_my_roommate_match_candidates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_roommate_match_candidates() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_landlord_roommate_match_requests()
RETURNS TABLE (
  request_id BIGINT,
  student_id BIGINT,
  account_id BIGINT,
  full_name TEXT,
  profile_photo_url TEXT,
  gender TEXT,
  academic_year TEXT,
  pref_sleep_schedule INT,
  pref_study_habits INT,
  pref_cleanliness INT,
  pref_guest_policy INT,
  created_at TIMESTAMPTZ,
  candidate_count BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.request_id, s.student_id, s.account_id, s.full_name, s.profile_photo_url,
         s.gender, s.academic_year, s.pref_sleep_schedule, s.pref_study_habits,
         s.pref_cleanliness, s.pref_guest_policy, r.created_at,
         (SELECT COUNT(*) FROM public.roommate_match_candidates mc WHERE mc.request_id = r.request_id)
  FROM public.roommate_match_requests r
  JOIN public.students s ON s.student_id = r.student_id
  WHERE r.is_open
    AND s.gender IN ('Female', 'Male')
    AND s.pref_sleep_schedule IS NOT NULL
    AND s.pref_study_habits IS NOT NULL
    AND s.pref_cleanliness IS NOT NULL
    AND s.pref_guest_policy IS NOT NULL
    AND public.auth_user_role() = 'Landlord'
    AND public.auth_landlord_id() IS NOT NULL
  ORDER BY r.created_at;
$$;
REVOKE ALL ON FUNCTION public.get_landlord_roommate_match_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_landlord_roommate_match_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_roommate_match_candidates(p_request_id BIGINT)
RETURNS TABLE (
  student_id BIGINT,
  account_id BIGINT,
  full_name TEXT,
  profile_photo_url TEXT,
  gender TEXT,
  academic_year TEXT,
  pref_sleep_schedule INT,
  pref_study_habits INT,
  pref_cleanliness INT,
  pref_guest_policy INT,
  compatibility_score INTEGER,
  is_nominated BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT candidate.student_id, candidate.account_id, candidate.full_name,
         candidate.profile_photo_url, candidate.gender, candidate.academic_year,
         candidate.pref_sleep_schedule, candidate.pref_study_habits,
         candidate.pref_cleanliness, candidate.pref_guest_policy,
         CASE WHEN scores.answered = 0 THEN 0
              ELSE ROUND(scores.matched * 100.0 / scores.answered)::INTEGER
         END AS compatibility_score,
         EXISTS (
           SELECT 1 FROM public.roommate_match_candidates saved
           WHERE saved.request_id = target.request_id
             AND saved.student_id = candidate.student_id
         ) AS is_nominated
  FROM public.roommate_match_requests target
  JOIN public.students requester ON requester.student_id = target.student_id
  JOIN public.roommate_match_requests candidate_request
    ON candidate_request.is_open
  JOIN public.students candidate ON candidate.student_id = candidate_request.student_id
  CROSS JOIN LATERAL (
    SELECT
      (CASE WHEN requester.pref_sleep_schedule IS NOT NULL AND candidate.pref_sleep_schedule IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN requester.pref_study_habits IS NOT NULL AND candidate.pref_study_habits IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN requester.pref_cleanliness IS NOT NULL AND candidate.pref_cleanliness IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN requester.pref_guest_policy IS NOT NULL AND candidate.pref_guest_policy IS NOT NULL THEN 1 ELSE 0 END) AS answered,
      (CASE WHEN requester.pref_sleep_schedule IS NOT NULL AND requester.pref_sleep_schedule = candidate.pref_sleep_schedule THEN 1 ELSE 0 END
       + CASE WHEN requester.pref_study_habits IS NOT NULL AND requester.pref_study_habits = candidate.pref_study_habits THEN 1 ELSE 0 END
       + CASE WHEN requester.pref_cleanliness IS NOT NULL AND requester.pref_cleanliness = candidate.pref_cleanliness THEN 1 ELSE 0 END
       + CASE WHEN requester.pref_guest_policy IS NOT NULL AND requester.pref_guest_policy = candidate.pref_guest_policy THEN 1 ELSE 0 END) AS matched
  ) scores
  WHERE target.request_id = p_request_id
    AND target.is_open
    AND candidate_request.student_id = candidate.student_id
    AND candidate.student_id <> requester.student_id
    AND candidate.gender = requester.gender
    AND candidate.pref_sleep_schedule IS NOT NULL
    AND candidate.pref_study_habits IS NOT NULL
    AND candidate.pref_cleanliness IS NOT NULL
    AND candidate.pref_guest_policy IS NOT NULL
    AND requester.pref_sleep_schedule IS NOT NULL
    AND requester.pref_study_habits IS NOT NULL
    AND requester.pref_cleanliness IS NOT NULL
    AND requester.pref_guest_policy IS NOT NULL
    AND public.auth_user_role() = 'Landlord'
    AND public.auth_landlord_id() IS NOT NULL
  ORDER BY compatibility_score DESC, candidate.full_name;
$$;
REVOKE ALL ON FUNCTION public.get_roommate_match_candidates(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_roommate_match_candidates(BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_roommate_match_candidates(
  p_request_id BIGINT,
  p_candidate_student_ids BIGINT[]
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_requester_id BIGINT;
  v_gender TEXT;
  v_valid_count INTEGER;
  v_unique_count INTEGER;
BEGIN
  IF public.auth_user_role() IS DISTINCT FROM 'Landlord'::public.user_role
     OR public.auth_landlord_id() IS NULL THEN
    RAISE EXCEPTION 'Only landlords can suggest roommate candidates';
  END IF;

  IF p_candidate_student_ids IS NULL OR CARDINALITY(p_candidate_student_ids) <> 3 THEN
    RAISE EXCEPTION 'Select exactly three roommate candidates';
  END IF;
  SELECT COUNT(DISTINCT ids.student_id) INTO v_unique_count
  FROM UNNEST(p_candidate_student_ids) AS ids(student_id);
  IF v_unique_count <> 3 THEN
    RAISE EXCEPTION 'The three roommate candidates must be different students';
  END IF;

  SELECT r.student_id, s.gender INTO v_requester_id, v_gender
  FROM public.roommate_match_requests r
  JOIN public.students s ON s.student_id = r.student_id
  WHERE r.request_id = p_request_id AND r.is_open
  FOR UPDATE OF r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This roommate request is no longer active';
  END IF;
  IF v_gender IS NULL OR v_gender NOT IN ('Female', 'Male') THEN
    RAISE EXCEPTION 'The request does not have a supported gender for matching';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.student_id = v_requester_id
      AND (
        s.pref_sleep_schedule IS NULL OR s.pref_study_habits IS NULL
        OR s.pref_cleanliness IS NULL OR s.pref_guest_policy IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'The requester must complete the compatibility quiz before candidates can be selected';
  END IF;

  SELECT COUNT(*) INTO v_valid_count
  FROM UNNEST(p_candidate_student_ids) AS ids(student_id)
  JOIN public.roommate_match_requests candidate_request
    ON candidate_request.student_id = ids.student_id AND candidate_request.is_open
  JOIN public.students candidate ON candidate.student_id = ids.student_id
  WHERE candidate.student_id <> v_requester_id
    AND candidate.gender = v_gender
    AND candidate.pref_sleep_schedule IS NOT NULL
    AND candidate.pref_study_habits IS NOT NULL
    AND candidate.pref_cleanliness IS NOT NULL
    AND candidate.pref_guest_policy IS NOT NULL;
  IF v_valid_count <> 3 THEN
    RAISE EXCEPTION 'All candidates must have active requests, complete compatibility profiles, and the same gender';
  END IF;

  DELETE FROM public.roommate_match_candidates WHERE request_id = p_request_id;

  INSERT INTO public.roommate_match_candidates (
    request_id, student_id, landlord_id, compatibility_score
  )
  SELECT p_request_id, candidate.student_id, public.auth_landlord_id(),
         ROUND(scores.matched * 100.0 / NULLIF(scores.answered, 0))::SMALLINT
  FROM UNNEST(p_candidate_student_ids) AS ids(student_id)
  JOIN public.students requester ON requester.student_id = v_requester_id
  JOIN public.students candidate ON candidate.student_id = ids.student_id
  CROSS JOIN LATERAL (
    SELECT
      (CASE WHEN requester.pref_sleep_schedule IS NOT NULL AND candidate.pref_sleep_schedule IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN requester.pref_study_habits IS NOT NULL AND candidate.pref_study_habits IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN requester.pref_cleanliness IS NOT NULL AND candidate.pref_cleanliness IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN requester.pref_guest_policy IS NOT NULL AND candidate.pref_guest_policy IS NOT NULL THEN 1 ELSE 0 END) AS answered,
      (CASE WHEN requester.pref_sleep_schedule IS NOT NULL AND requester.pref_sleep_schedule = candidate.pref_sleep_schedule THEN 1 ELSE 0 END
       + CASE WHEN requester.pref_study_habits IS NOT NULL AND requester.pref_study_habits = candidate.pref_study_habits THEN 1 ELSE 0 END
       + CASE WHEN requester.pref_cleanliness IS NOT NULL AND requester.pref_cleanliness = candidate.pref_cleanliness THEN 1 ELSE 0 END
       + CASE WHEN requester.pref_guest_policy IS NOT NULL AND requester.pref_guest_policy = candidate.pref_guest_policy THEN 1 ELSE 0 END) AS matched
  ) scores;
END;
$$;
REVOKE ALL ON FUNCTION public.set_roommate_match_candidates(BIGINT, BIGINT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_roommate_match_candidates(BIGINT, BIGINT[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.choose_roommate_match_candidate(
  p_request_id BIGINT,
  p_candidate_student_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_requester_id BIGINT;
  v_requester_gender TEXT;
  v_candidate_request_id BIGINT;
  v_candidate_gender TEXT;
BEGIN
  IF public.auth_user_role() IS DISTINCT FROM 'Student'::public.user_role THEN
    RAISE EXCEPTION 'Only students can choose a roommate';
  END IF;

  SELECT r.student_id, requester.gender INTO v_requester_id, v_requester_gender
  FROM public.roommate_match_requests r
  JOIN public.students requester ON requester.student_id = r.student_id
  WHERE r.request_id = p_request_id
    AND r.student_id = public.auth_student_id()
    AND r.is_open
  FOR UPDATE OF r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This roommate request is no longer active';
  END IF;

  SELECT candidate_request.request_id, candidate.gender
    INTO v_candidate_request_id, v_candidate_gender
  FROM public.roommate_match_candidates nominated
  JOIN public.roommate_match_requests candidate_request
    ON candidate_request.student_id = nominated.student_id
   AND candidate_request.is_open
  JOIN public.students candidate ON candidate.student_id = candidate_request.student_id
  WHERE nominated.request_id = p_request_id
    AND nominated.student_id = p_candidate_student_id
  FOR UPDATE OF candidate_request;
  IF NOT FOUND OR v_candidate_gender IS DISTINCT FROM v_requester_gender THEN
    RAISE EXCEPTION 'This candidate is unavailable or does not meet the same-gender rule';
  END IF;

  UPDATE public.roommate_match_requests
  SET is_open = FALSE, selected_student_id = p_candidate_student_id, updated_at = NOW()
  WHERE request_id = p_request_id;
  UPDATE public.roommate_match_requests
  SET is_open = FALSE, selected_student_id = v_requester_id, updated_at = NOW()
  WHERE request_id = v_candidate_request_id;

  DELETE FROM public.roommate_match_candidates
  WHERE request_id IN (p_request_id, v_candidate_request_id)
     OR student_id IN (v_requester_id, p_candidate_student_id);
END;
$$;
REVOKE ALL ON FUNCTION public.choose_roommate_match_candidate(BIGINT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.choose_roommate_match_candidate(BIGINT, BIGINT) TO authenticated;

-- A matched roommate can join a booking only after accepting the invitation.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS roommate_student_id BIGINT REFERENCES public.students(student_id),
  ADD COLUMN IF NOT EXISTS roommate_invite_status TEXT,
  ADD COLUMN IF NOT EXISTS roommate_start_date DATE;

UPDATE public.bookings
SET roommate_start_date = start_date
WHERE roommate_student_id IS NOT NULL
  AND roommate_start_date IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'valid_booking_roommate_invite'
      AND conrelid = 'public.bookings'::regclass
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT valid_booking_roommate_invite CHECK (
        (roommate_student_id IS NULL AND roommate_invite_status IS NULL)
        OR (roommate_student_id IS NOT NULL AND roommate_invite_status IN ('Pending', 'Accepted', 'Declined'))
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'valid_booking_roommate_start_date'
      AND conrelid = 'public.bookings'::regclass
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT valid_booking_roommate_start_date CHECK (
        (roommate_student_id IS NULL AND roommate_start_date IS NULL)
        OR (roommate_student_id IS NOT NULL AND roommate_start_date IS NOT NULL)
      );
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.get_public_room_bookings(BIGINT);
CREATE FUNCTION public.get_public_room_bookings(p_house_id BIGINT)
RETURNS TABLE (
  booking_id BIGINT,
  room_id BIGINT,
  start_date DATE,
  end_date DATE,
  status TEXT,
  is_open_ended BOOLEAN,
  occupied_slots INTEGER,
  is_my_match BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT b.booking_id,
         b.room_id,
         b.start_date,
         b.end_date,
         b.status::TEXT,
         (b.status = 'Confirmed' AND b.actual_end_date IS NULL) AS is_open_ended,
         CASE
           WHEN b.roommate_student_id IS NOT NULL
            AND b.roommate_invite_status IN ('Pending', 'Accepted') THEN 2
           ELSE 1
         END,
         EXISTS (
           SELECT 1
           FROM public.roommate_match_requests requester
           JOIN public.roommate_match_requests resident
             ON resident.student_id = b.student_id
            AND resident.selected_student_id = requester.student_id
           WHERE requester.student_id = public.auth_student_id()
             AND requester.selected_student_id = b.student_id
             AND requester.is_open = FALSE
             AND resident.is_open = FALSE
         )
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

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS student_id BIGINT REFERENCES public.students(student_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS payment_type TEXT,
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE;

UPDATE public.invoices i
SET student_id = COALESCE(i.student_id, b.student_id),
    payment_type = COALESCE(i.payment_type, 'Monthly rent'),
    period_start = COALESCE(i.period_start, b.start_date),
    period_end = COALESCE(i.period_end, b.end_date)
FROM public.bookings b
WHERE b.booking_id = i.booking_id
  AND (i.student_id IS NULL OR i.payment_type IS NULL OR i.period_start IS NULL OR i.period_end IS NULL);

ALTER TABLE public.invoices
  ALTER COLUMN student_id SET NOT NULL,
  ALTER COLUMN payment_type SET DEFAULT 'Monthly rent',
  ALTER COLUMN payment_type SET NOT NULL,
  ALTER COLUMN period_start SET NOT NULL,
  ALTER COLUMN period_end SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'valid_invoice_payment_type'
      AND conrelid = 'public.invoices'::regclass
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT valid_invoice_payment_type CHECK (payment_type IN ('Monthly rent', 'Security deposit'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.student_booking_credits (
  credit_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES public.students(student_id) ON DELETE CASCADE,
  booking_id BIGINT NOT NULL REFERENCES public.bookings(booking_id) ON DELETE CASCADE,
  credit_type TEXT NOT NULL CHECK (credit_type = 'deposit_share'),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  remaining_amount NUMERIC(10, 2) NOT NULL CHECK (remaining_amount >= 0 AND remaining_amount <= amount),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, student_id, credit_type)
);
ALTER TABLE public.student_booking_credits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_booking_credits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_student_booking_credits(
  p_student_id BIGINT,
  p_amount NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_due NUMERIC := GREATEST(COALESCE(p_amount, 0), 0);
  v_credit RECORD;
  v_applied NUMERIC;
BEGIN
  FOR v_credit IN
    SELECT credit_id, remaining_amount
    FROM public.student_booking_credits
    WHERE student_id = p_student_id
      AND remaining_amount > 0
    ORDER BY created_at, credit_id
    FOR UPDATE
  LOOP
    EXIT WHEN v_due <= 0;
    v_applied := LEAST(v_due, v_credit.remaining_amount);
    UPDATE public.student_booking_credits
    SET remaining_amount = remaining_amount - v_applied
    WHERE credit_id = v_credit.credit_id;
    v_due := v_due - v_applied;
  END LOOP;

  RETURN v_due;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_student_booking_credits(BIGINT, NUMERIC) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.sync_booking_deposit_credit(p_booking_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_invoice_id BIGINT;
  v_student_id BIGINT;
  v_amount_due NUMERIC;
  v_verified NUMERIC;
  v_credit NUMERIC;
  v_consumed NUMERIC;
BEGIN
  SELECT b.student_id, i.invoice_id, i.amount_due
  INTO v_student_id, v_invoice_id, v_amount_due
  FROM public.bookings b
  JOIN public.invoices i ON i.booking_id = b.booking_id
  WHERE b.booking_id = p_booking_id
    AND b.roommate_invite_status = 'Accepted'
    AND i.student_id = b.student_id
    AND i.payment_type = 'Security deposit'
  ORDER BY i.period_start
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(p.amount), 0)
  INTO v_verified
  FROM public.payments p
  WHERE p.invoice_id = v_invoice_id
    AND p.verification_status = 'Verified';

  v_credit := GREATEST(0, v_verified - v_amount_due);
  SELECT amount - remaining_amount
  INTO v_consumed
  FROM public.student_booking_credits
  WHERE booking_id = p_booking_id
    AND student_id = v_student_id
    AND credit_type = 'deposit_share'
  FOR UPDATE;
  IF FOUND AND v_credit < v_consumed THEN
    RAISE EXCEPTION 'A deposit payment backing an applied rent credit cannot be reversed automatically.';
  END IF;
  IF v_credit <= 0 THEN
    DELETE FROM public.student_booking_credits
    WHERE booking_id = p_booking_id
      AND student_id = v_student_id
      AND credit_type = 'deposit_share';
    RETURN;
  END IF;

  INSERT INTO public.student_booking_credits AS current_credit (
    student_id, booking_id, credit_type, amount, remaining_amount
  )
  VALUES (v_student_id, p_booking_id, 'deposit_share', v_credit, v_credit)
  ON CONFLICT (booking_id, student_id, credit_type) DO UPDATE
    SET amount = EXCLUDED.amount,
        remaining_amount = GREATEST(
          0,
          EXCLUDED.amount - (current_credit.amount - current_credit.remaining_amount)
        );
END;
$$;
REVOKE ALL ON FUNCTION public.sync_booking_deposit_credit(BIGINT) FROM PUBLIC;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS student_id BIGINT REFERENCES public.students(student_id) ON DELETE CASCADE;

UPDATE public.payments p
SET student_id = b.student_id
FROM public.bookings b
WHERE b.booking_id = p.booking_id
  AND p.student_id IS NULL;

ALTER TABLE public.payments
  ALTER COLUMN student_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_payment_fields()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (
       NEW.booking_id IS DISTINCT FROM OLD.booking_id
    OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.payment_type IS DISTINCT FROM OLD.payment_type
    OR NEW.student_id IS DISTINCT FROM OLD.student_id
    OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
    OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
    OR NEW.receipt_url IS DISTINCT FROM OLD.receipt_url
  ) THEN
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

DROP POLICY IF EXISTS student_insert_bookings ON public.bookings;
CREATE POLICY student_insert_bookings ON public.bookings FOR INSERT WITH CHECK (
  student_id = public.auth_student_id()
  AND status = 'Pending'
  AND roommate_student_id IS NULL
  AND roommate_invite_status IS NULL
  AND start_date >= CURRENT_DATE
  AND room_id IN (
    SELECT room_id FROM public.rooms
    WHERE house_id IN (SELECT house_id FROM public.boarding_houses WHERE listing_status = 'Published')
  )
);

DROP POLICY IF EXISTS student_select_bookings ON public.bookings;
CREATE POLICY student_select_bookings ON public.bookings FOR SELECT USING (
  student_id = public.auth_student_id()
  OR (
    roommate_student_id = public.auth_student_id()
    AND roommate_invite_status IN ('Pending', 'Accepted')
  )
);

DROP POLICY IF EXISTS landlord_view_applicant_students ON public.students;
CREATE POLICY landlord_view_applicant_students ON public.students FOR SELECT USING (
  student_id IN (
    SELECT booking.student_id
    FROM public.bookings booking
    WHERE booking.booking_id IN (SELECT public.my_booking_ids())
    UNION
    SELECT booking.roommate_student_id
    FROM public.bookings booking
    WHERE booking.booking_id IN (SELECT public.my_booking_ids())
      AND booking.roommate_student_id IS NOT NULL
  )
);

DROP POLICY IF EXISTS student_select_invoices ON public.invoices;
CREATE POLICY student_select_invoices ON public.invoices FOR SELECT USING (
  student_id = public.auth_student_id()
);
DROP POLICY IF EXISTS landlord_manage_invoices ON public.invoices;
DROP POLICY IF EXISTS landlord_select_invoices ON public.invoices;
CREATE POLICY landlord_select_invoices ON public.invoices FOR SELECT USING (
  booking_id IN (SELECT public.my_booking_ids())
);
REVOKE INSERT, UPDATE, DELETE ON public.invoices FROM authenticated;

DROP POLICY IF EXISTS student_select_payments ON public.payments;
CREATE POLICY student_select_payments ON public.payments FOR SELECT USING (
  student_id = public.auth_student_id()
);

DROP POLICY IF EXISTS student_insert_payments ON public.payments;
REVOKE INSERT ON public.payments FROM authenticated;

CREATE OR REPLACE FUNCTION public.lock_booking_keys()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
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
    IF (
      NEW.roommate_student_id IS DISTINCT FROM OLD.roommate_student_id
      OR NEW.roommate_start_date IS DISTINCT FROM OLD.roommate_start_date
      OR NEW.roommate_invite_status IS DISTINCT FROM OLD.roommate_invite_status
    ) AND current_setting('app.allow_roommate_invite', TRUE) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Roommate invitations can only be changed through the invitation flow.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_shared_room_booking(
  p_room_id BIGINT,
  p_start_date DATE,
  p_end_date DATE,
  p_roommate_student_id BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_student_id BIGINT;
  v_capacity INTEGER;
  v_booking_id BIGINT;
BEGIN
  IF public.auth_user_role() IS DISTINCT FROM 'Student'::public.user_role THEN
    RAISE EXCEPTION 'Only students can request a shared booking.';
  END IF;

  v_student_id := public.auth_student_id();
  IF v_student_id IS NULL OR p_roommate_student_id IS NULL OR p_roommate_student_id = v_student_id THEN
    RAISE EXCEPTION 'Choose your selected roommate to request a shared booking.';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL
     OR p_start_date < CURRENT_DATE OR p_end_date <= p_start_date THEN
    RAISE EXCEPTION 'Choose a valid move-in date and billing-cycle end date.';
  END IF;

  PERFORM pg_advisory_xact_lock(LEAST(v_student_id, p_roommate_student_id));
  PERFORM pg_advisory_xact_lock(GREATEST(v_student_id, p_roommate_student_id));

  IF NOT EXISTS (
    SELECT 1
    FROM public.roommate_match_requests requester
    JOIN public.roommate_match_requests roommate
      ON roommate.student_id = requester.selected_student_id
     AND roommate.selected_student_id = requester.student_id
    JOIN public.students requester_profile ON requester_profile.student_id = requester.student_id
    JOIN public.students roommate_profile ON roommate_profile.student_id = roommate.student_id
    WHERE requester.student_id = v_student_id
      AND requester.selected_student_id = p_roommate_student_id
      AND requester_profile.gender IN ('Female', 'Male')
      AND requester_profile.gender = roommate_profile.gender
  ) THEN
    RAISE EXCEPTION 'Only your confirmed same-gender roommate match can be invited.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings existing
    WHERE existing.status IN ('Pending', 'Confirmed')
      AND (
        existing.student_id IN (v_student_id, p_roommate_student_id)
        OR (
          existing.roommate_invite_status IN ('Pending', 'Accepted')
          AND existing.roommate_student_id IN (v_student_id, p_roommate_student_id)
        )
      )
      AND (
        (
          existing.status = 'Confirmed'
          AND existing.actual_end_date IS NULL
          AND existing.start_date <= p_start_date
        )
        OR (
          existing.start_date < p_end_date
          AND COALESCE(existing.actual_end_date, existing.end_date) > p_start_date
        )
      )
  ) THEN
    RAISE EXCEPTION 'You or your selected roommate already have an overlapping booking.';
  END IF;

  SELECT r.capacity INTO v_capacity
  FROM public.rooms r
  JOIN public.boarding_houses h ON h.house_id = r.house_id
  WHERE r.room_id = p_room_id
    AND r.availability_status = 'Available'
    AND h.listing_status = 'Published'
  FOR UPDATE OF r;

  IF NOT FOUND OR v_capacity < 2 THEN
    RAISE EXCEPTION 'The selected room is unavailable or cannot accommodate two students.';
  END IF;

  INSERT INTO public.bookings (
    student_id, room_id, start_date, end_date, status,
    roommate_student_id, roommate_invite_status, roommate_start_date
  )
  VALUES (
    v_student_id, p_room_id, p_start_date, p_end_date, 'Pending',
    p_roommate_student_id, 'Pending', p_start_date
  )
  RETURNING booking_id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_shared_room_booking(BIGINT, DATE, DATE, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_shared_room_booking(BIGINT, DATE, DATE, BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_to_join_room_booking(
  p_booking_id BIGINT,
  p_start_date DATE
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_student_id BIGINT;
  v_booking public.bookings%ROWTYPE;
  v_capacity INTEGER;
BEGIN
  IF public.auth_user_role() IS DISTINCT FROM 'Student'::public.user_role THEN
    RAISE EXCEPTION 'Only students can request to share an occupied room.';
  END IF;

  v_student_id := public.auth_student_id();
  IF v_student_id IS NULL OR p_start_date IS NULL OR p_start_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Choose a valid move-in date before requesting to share.';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE booking_id = p_booking_id
    AND status IN ('Pending', 'Confirmed');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This room booking is no longer available.';
  END IF;

  PERFORM pg_advisory_xact_lock(LEAST(v_student_id, v_booking.student_id));
  PERFORM pg_advisory_xact_lock(GREATEST(v_student_id, v_booking.student_id));
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE booking_id = p_booking_id
    AND status IN ('Pending', 'Confirmed')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This room booking is no longer available.';
  END IF;

  SELECT r.capacity INTO v_capacity
  FROM public.rooms r
  JOIN public.boarding_houses h ON h.house_id = r.house_id
  WHERE r.room_id = v_booking.room_id
    AND h.listing_status = 'Published'
  FOR UPDATE OF r;
  IF NOT FOUND OR v_capacity <> 2 THEN
    RAISE EXCEPTION 'This room cannot accommodate another student.';
  END IF;

  IF v_booking.status = 'Pending' AND p_start_date <> v_booking.start_date THEN
    RAISE EXCEPTION 'Choose the move-in date on the existing booking.';
  END IF;
  IF v_booking.status = 'Confirmed'
     AND (
       v_booking.actual_end_date IS NOT NULL
       OR p_start_date <> v_booking.end_date
     ) THEN
    RAISE EXCEPTION 'Sharing with this resident starts at the next billing cycle.';
  END IF;
  IF v_booking.roommate_student_id IS NOT NULL
     AND v_booking.roommate_invite_status IN ('Pending', 'Accepted') THEN
    RAISE EXCEPTION 'This room already has two students or a pending roommate request.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.roommate_match_requests requester
    JOIN public.roommate_match_requests resident
      ON resident.student_id = v_booking.student_id
     AND resident.selected_student_id = requester.student_id
    JOIN public.students requester_profile ON requester_profile.student_id = requester.student_id
    JOIN public.students resident_profile ON resident_profile.student_id = resident.student_id
    WHERE requester.student_id = v_student_id
      AND requester.selected_student_id = v_booking.student_id
      AND requester.is_open = FALSE
      AND resident.is_open = FALSE
      AND requester_profile.gender IN ('Female', 'Male')
      AND requester_profile.gender = resident_profile.gender
      AND requester_profile.pref_sleep_schedule IS NOT NULL
      AND requester_profile.pref_study_habits IS NOT NULL
      AND requester_profile.pref_cleanliness IS NOT NULL
      AND requester_profile.pref_guest_policy IS NOT NULL
      AND resident_profile.pref_sleep_schedule IS NOT NULL
      AND resident_profile.pref_study_habits IS NOT NULL
      AND resident_profile.pref_cleanliness IS NOT NULL
      AND resident_profile.pref_guest_policy IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Complete compatibility matching and mutually match with the current resident first.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings existing
    WHERE existing.booking_id <> v_booking.booking_id
      AND existing.status IN ('Pending', 'Confirmed')
      AND (
        existing.student_id = v_student_id
        OR (
          existing.roommate_student_id = v_student_id
          AND existing.roommate_invite_status IN ('Pending', 'Accepted')
        )
      )
      AND (
        (
          existing.status = 'Confirmed'
          AND existing.actual_end_date IS NULL
          AND existing.start_date <= p_start_date
        )
        OR (
          existing.start_date < (p_start_date + INTERVAL '1 month')::DATE
          AND COALESCE(existing.actual_end_date, existing.end_date) > p_start_date
        )
      )
  ) THEN
    RAISE EXCEPTION 'You already have an overlapping booking.';
  END IF;

  PERFORM set_config('app.allow_roommate_invite', 'on', TRUE);
  UPDATE public.bookings
  SET roommate_student_id = v_student_id,
      roommate_invite_status = 'Pending',
      roommate_start_date = p_start_date
  WHERE booking_id = v_booking.booking_id;

  RETURN v_booking.booking_id;
END;
$$;
REVOKE ALL ON FUNCTION public.request_to_join_room_booking(BIGINT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_to_join_room_booking(BIGINT, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_shared_booking_invite(
  p_booking_id BIGINT,
  p_accept BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_student_id BIGINT;
  v_booking public.bookings%ROWTYPE;
  v_deposit NUMERIC;
  v_deposit_share NUMERIC;
  v_roommate_deposit_share NUMERIC;
  v_rent NUMERIC;
  v_primary_rent NUMERIC;
  v_roommate_rent NUMERIC;
  v_rent_due NUMERIC;
  v_share_end DATE;
BEGIN
  IF public.auth_user_role() IS DISTINCT FROM 'Student'::public.user_role THEN
    RAISE EXCEPTION 'Only students can respond to roommate booking invitations.';
  END IF;

  v_student_id := public.auth_student_id();
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE booking_id = p_booking_id
    AND roommate_student_id = v_student_id
    AND roommate_invite_status = 'Pending'
    AND status IN ('Pending', 'Confirmed');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This roommate invitation is no longer available.';
  END IF;

  IF p_accept THEN
    PERFORM pg_advisory_xact_lock(LEAST(v_booking.student_id, v_student_id));
    PERFORM pg_advisory_xact_lock(GREATEST(v_booking.student_id, v_student_id));
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE booking_id = p_booking_id
    AND roommate_student_id = v_student_id
    AND roommate_invite_status = 'Pending'
    AND status IN ('Pending', 'Confirmed')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This roommate invitation is no longer available.';
  END IF;

  IF p_accept AND (
       (v_booking.status = 'Pending' AND v_booking.roommate_start_date < CURRENT_DATE)
       OR (
         v_booking.status = 'Pending'
         AND v_booking.roommate_start_date <> v_booking.start_date
       )
       OR (
         v_booking.status = 'Confirmed'
         AND (
           v_booking.actual_end_date IS NOT NULL
           OR v_booking.roommate_start_date < CURRENT_DATE
           OR v_booking.roommate_start_date <> v_booking.end_date
         )
       )
     ) THEN
    RAISE EXCEPTION 'The booking cycle changed. Ask the student to send a new roommate request.';
  END IF;

  IF p_accept THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.roommate_match_requests requester
      JOIN public.roommate_match_requests resident
        ON resident.student_id = v_booking.student_id
       AND resident.selected_student_id = requester.student_id
      JOIN public.students requester_profile ON requester_profile.student_id = requester.student_id
      JOIN public.students resident_profile ON resident_profile.student_id = resident.student_id
      WHERE requester.student_id = v_student_id
        AND requester.selected_student_id = v_booking.student_id
        AND requester.is_open = FALSE
        AND resident.is_open = FALSE
        AND requester_profile.gender IN ('Female', 'Male')
        AND requester_profile.gender = resident_profile.gender
    ) THEN
      RAISE EXCEPTION 'This roommate match is no longer active.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.bookings existing
      WHERE existing.booking_id <> v_booking.booking_id
        AND existing.status IN ('Pending', 'Confirmed')
        AND (
          existing.student_id IN (v_booking.student_id, v_student_id)
          OR (
            existing.roommate_invite_status IN ('Pending', 'Accepted')
            AND existing.roommate_student_id IN (v_booking.student_id, v_student_id)
          )
        )
        AND (
          (
            existing.status = 'Confirmed'
            AND existing.actual_end_date IS NULL
            AND existing.start_date <= v_booking.roommate_start_date
          )
          OR (
              existing.start_date < CASE
                WHEN v_booking.status = 'Confirmed'
                  THEN (v_booking.roommate_start_date + INTERVAL '1 month')::DATE
                ELSE v_booking.end_date
              END
              AND COALESCE(existing.actual_end_date, existing.end_date) > CASE
                WHEN v_booking.status = 'Confirmed'
                  THEN v_booking.roommate_start_date
                ELSE v_booking.start_date
              END
          )
        )
    ) THEN
      RAISE EXCEPTION 'You or the requesting student already have an overlapping booking.';
    END IF;
  END IF;

  PERFORM set_config('app.allow_roommate_invite', 'on', TRUE);
  UPDATE public.bookings
  SET roommate_invite_status = CASE WHEN p_accept THEN 'Accepted' ELSE 'Declined' END
  WHERE booking_id = p_booking_id
    AND roommate_student_id = v_student_id
    AND roommate_invite_status = 'Pending'
  AND status IN ('Pending', 'Confirmed');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This roommate invitation is no longer available.';
  END IF;

  IF p_accept AND v_booking.status = 'Confirmed' THEN
    SELECT r.monthly_rate, r.security_deposit
    INTO v_rent, v_deposit
    FROM public.rooms r
    WHERE r.room_id = v_booking.room_id;
    v_share_end := (v_booking.roommate_start_date + INTERVAL '1 month')::DATE;

    v_deposit_share := ROUND(COALESCE(v_deposit, 0) / 2, 2);
    v_roommate_deposit_share := COALESCE(v_deposit, 0) - v_deposit_share;
    IF v_deposit_share > 0 OR v_roommate_deposit_share > 0 THEN
      UPDATE public.invoices i
      SET amount_due = v_deposit_share,
          is_paid = COALESCE((
            SELECT SUM(p.amount) >= v_deposit_share
            FROM public.payments p
            WHERE p.invoice_id = i.invoice_id
              AND p.verification_status = 'Verified'
          ), FALSE)
      WHERE i.booking_id = v_booking.booking_id
        AND i.student_id = v_booking.student_id
        AND i.payment_type = 'Security deposit';

      PERFORM public.sync_booking_deposit_credit(v_booking.booking_id);
      INSERT INTO public.invoices (
        booking_id, student_id, payment_type, period_start, period_end,
        amount_due, due_date, is_paid
      )
      SELECT v_booking.booking_id, v_student_id, 'Security deposit',
             v_booking.roommate_start_date, v_share_end,
             v_roommate_deposit_share, v_booking.roommate_start_date, FALSE
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.invoices i
        WHERE i.booking_id = v_booking.booking_id
          AND i.student_id = v_student_id
          AND i.payment_type = 'Security deposit'
      )
      AND v_roommate_deposit_share > 0;
    END IF;

    v_primary_rent := ROUND(COALESCE(v_rent, 0) / 2, 2);
    v_roommate_rent := COALESCE(v_rent, 0) - v_primary_rent;
    IF NOT EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.booking_id = v_booking.booking_id
        AND i.student_id = v_booking.student_id
        AND i.payment_type = 'Monthly rent'
        AND i.period_start = v_booking.roommate_start_date
    ) THEN
      v_rent_due := public.apply_student_booking_credits(
        v_booking.student_id,
        v_primary_rent
      );
      INSERT INTO public.invoices (
        booking_id, student_id, payment_type, period_start, period_end,
        amount_due, due_date, is_paid
      )
      VALUES (
        v_booking.booking_id, v_booking.student_id, 'Monthly rent',
        v_booking.roommate_start_date, v_share_end,
        v_rent_due, v_booking.roommate_start_date, v_rent_due = 0
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.booking_id = v_booking.booking_id
        AND i.student_id = v_student_id
        AND i.payment_type = 'Monthly rent'
        AND i.period_start = v_booking.roommate_start_date
    ) THEN
      INSERT INTO public.invoices (
        booking_id, student_id, payment_type, period_start, period_end,
        amount_due, due_date
      )
      VALUES (
        v_booking.booking_id, v_student_id, 'Monthly rent',
        v_booking.roommate_start_date, v_share_end,
        v_roommate_rent, v_booking.roommate_start_date
      );
    END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.respond_to_shared_booking_invite(BIGINT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_shared_booking_invite(BIGINT, BOOLEAN) TO authenticated;

DROP FUNCTION IF EXISTS public.get_my_shared_booking_invites();
CREATE FUNCTION public.get_my_shared_booking_invites()
RETURNS TABLE (
  booking_id BIGINT,
  requester_name TEXT,
  property_title TEXT,
  room_name TEXT,
  start_date DATE,
  end_date DATE,
  share_start_date DATE,
  booking_status TEXT,
  monthly_rent NUMERIC,
  security_deposit NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT b.booking_id, s.full_name, h.house_name, r.room_number,
         b.start_date, b.end_date, b.roommate_start_date,
         b.status::TEXT, r.monthly_rate, r.security_deposit
  FROM public.bookings b
  JOIN public.students s ON s.student_id = b.student_id
  JOIN public.rooms r ON r.room_id = b.room_id
  JOIN public.boarding_houses h ON h.house_id = r.house_id
  WHERE b.roommate_student_id = public.auth_student_id()
    AND b.roommate_invite_status = 'Pending'
    AND b.status IN ('Pending', 'Confirmed');
$$;
REVOKE ALL ON FUNCTION public.get_my_shared_booking_invites() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_shared_booking_invites() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_booking_invoices()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_initial_confirmation BOOLEAN := FALSE;
  v_shared BOOLEAN := FALSE;
  v_rent NUMERIC;
  v_deposit NUMERIC;
  v_primary_rent NUMERIC;
  v_roommate_rent NUMERIC;
  v_primary_deposit NUMERIC;
  v_roommate_deposit NUMERIC;
  v_period_start DATE;
  v_period_end DATE;
  v_due_date DATE;
  v_rent_due NUMERIC;
  v_member RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_initial_confirmation := NEW.status = 'Confirmed';
  ELSIF NEW.status = 'Confirmed' AND OLD.status IS DISTINCT FROM 'Confirmed' THEN
    v_initial_confirmation := TRUE;
  END IF;

  IF v_initial_confirmation THEN
    IF NEW.roommate_student_id IS NOT NULL AND NEW.roommate_invite_status = 'Pending' THEN
      RAISE EXCEPTION 'The invited roommate must accept before the landlord can confirm this shared booking.';
    END IF;

    v_shared := NEW.roommate_student_id IS NOT NULL AND NEW.roommate_invite_status = 'Accepted';
    SELECT r.monthly_rate, r.security_deposit INTO v_rent, v_deposit
    FROM public.rooms r WHERE r.room_id = NEW.room_id;

    v_primary_rent := CASE WHEN v_shared THEN ROUND(v_rent / 2, 2) ELSE v_rent END;
    v_roommate_rent := v_rent - v_primary_rent;
    v_primary_deposit := CASE WHEN v_shared THEN ROUND(v_deposit / 2, 2) ELSE v_deposit END;
    v_roommate_deposit := v_deposit - v_primary_deposit;
    v_period_start := NEW.start_date;
    v_period_end := NEW.end_date;
    v_due_date := NEW.start_date;

    FOR v_member IN
      SELECT NEW.student_id AS student_id, v_primary_rent AS rent_share, v_primary_deposit AS deposit_share
      UNION ALL
      SELECT NEW.roommate_student_id, v_roommate_rent, v_roommate_deposit WHERE v_shared
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.booking_id = NEW.booking_id
          AND i.student_id = v_member.student_id
          AND i.payment_type = 'Monthly rent'
          AND i.period_start = v_period_start
      ) THEN
        v_rent_due := public.apply_student_booking_credits(
          v_member.student_id,
          v_member.rent_share
        );
        INSERT INTO public.invoices (
          booking_id, student_id, payment_type, period_start, period_end,
          amount_due, due_date, is_paid
        ) VALUES (
          NEW.booking_id, v_member.student_id, 'Monthly rent',
          v_period_start, v_period_end, v_rent_due, v_due_date, v_rent_due = 0
        );
      END IF;
      IF v_member.deposit_share > 0 AND NOT EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.booking_id = NEW.booking_id
          AND i.student_id = v_member.student_id
          AND i.payment_type = 'Security deposit'
          AND i.period_start = v_period_start
      ) THEN
        INSERT INTO public.invoices (
          booking_id, student_id, payment_type, period_start, period_end, amount_due, due_date
        ) VALUES (
          NEW.booking_id, v_member.student_id, 'Security deposit',
          v_period_start, v_period_end, v_member.deposit_share, v_due_date
        );
      END IF;
    END LOOP;
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'Confirmed'
      AND OLD.status = 'Confirmed' AND NEW.end_date > OLD.end_date THEN
    v_shared := NEW.roommate_student_id IS NOT NULL AND NEW.roommate_invite_status = 'Accepted';
    SELECT r.monthly_rate INTO v_rent
    FROM public.rooms r WHERE r.room_id = NEW.room_id;
    v_primary_rent := CASE WHEN v_shared THEN ROUND(v_rent / 2, 2) ELSE v_rent END;
    v_roommate_rent := v_rent - v_primary_rent;
    v_period_start := OLD.end_date;
    v_period_end := NEW.end_date;
    v_due_date := OLD.end_date;

    FOR v_member IN
      SELECT NEW.student_id AS student_id, v_primary_rent AS rent_share
      UNION ALL
      SELECT NEW.roommate_student_id, v_roommate_rent WHERE v_shared
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.booking_id = NEW.booking_id
          AND i.student_id = v_member.student_id
          AND i.payment_type = 'Monthly rent'
          AND i.period_start = v_period_start
      ) THEN
        v_rent_due := public.apply_student_booking_credits(
          v_member.student_id,
          v_member.rent_share
        );
        INSERT INTO public.invoices (
          booking_id, student_id, payment_type, period_start, period_end,
          amount_due, due_date, is_paid
        ) VALUES (
          NEW.booking_id, v_member.student_id, 'Monthly rent',
          v_period_start, v_period_end, v_rent_due, v_due_date, v_rent_due = 0
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_booking_invoices_trg ON public.bookings;
CREATE TRIGGER create_booking_invoices_trg
  AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.create_booking_invoices();

CREATE OR REPLACE FUNCTION public.get_my_invoice_balances()
RETURNS TABLE (
  invoice_id BIGINT,
  booking_id BIGINT,
  student_id BIGINT,
  payment_type TEXT,
  period_start DATE,
  period_end DATE,
  amount_due NUMERIC,
  remaining_balance NUMERIC,
  due_date DATE
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT i.invoice_id, i.booking_id, i.student_id, i.payment_type,
         i.period_start, i.period_end, i.amount_due,
         CASE WHEN i.is_paid THEN 0::NUMERIC ELSE GREATEST(
           0::NUMERIC,
           i.amount_due - COALESCE(SUM(p.amount) FILTER (
             WHERE p.verification_status IN ('Pending', 'Verified')
           ), 0)
         ) END AS remaining_balance,
         i.due_date
  FROM public.invoices i
  JOIN public.bookings b ON b.booking_id = i.booking_id
  LEFT JOIN public.payments p ON p.invoice_id = i.invoice_id
  WHERE i.student_id = public.auth_student_id()
    AND b.status = 'Confirmed'
  GROUP BY i.invoice_id, i.booking_id, i.student_id, i.payment_type,
           i.period_start, i.period_end, i.amount_due, i.due_date, i.is_paid;
$$;
REVOKE ALL ON FUNCTION public.get_my_invoice_balances() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_invoice_balances() TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_payment(
  p_invoice_id BIGINT,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_receipt_path TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_paid NUMERIC;
  v_payment_id BIGINT;
BEGIN
  IF public.auth_user_role() IS DISTINCT FROM 'Student'::public.user_role THEN
    RAISE EXCEPTION 'Only students can submit rent or deposit payments.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Enter a payment amount greater than zero.';
  END IF;
  IF p_receipt_path IS NULL OR p_receipt_path NOT LIKE ('payments/' || auth.uid()::TEXT || '/%') THEN
    RAISE EXCEPTION 'Upload a valid payment receipt before submitting.';
  END IF;

  SELECT i.* INTO v_invoice
  FROM public.invoices i
  JOIN public.bookings b ON b.booking_id = i.booking_id
  WHERE i.invoice_id = p_invoice_id
    AND i.student_id = public.auth_student_id()
    AND b.status = 'Confirmed'
  FOR UPDATE OF i;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This payment balance is no longer available.';
  END IF;
  IF v_invoice.is_paid THEN
    RAISE EXCEPTION 'This invoice has already been paid.';
  END IF;

  SELECT COALESCE(SUM(p.amount), 0) INTO v_paid
  FROM public.payments p
  WHERE p.invoice_id = v_invoice.invoice_id
    AND p.verification_status IN ('Pending', 'Verified');

  IF p_amount > GREATEST(0::NUMERIC, v_invoice.amount_due - v_paid) THEN
    RAISE EXCEPTION 'Payment exceeds the remaining balance.';
  END IF;

  INSERT INTO public.payments (
    booking_id, invoice_id, student_id, amount, payment_type,
    payment_method, receipt_url, verification_status
  )
  VALUES (
    v_invoice.booking_id, v_invoice.invoice_id, v_invoice.student_id,
    p_amount, v_invoice.payment_type, p_payment_method, p_receipt_path, 'Pending'
  )
  RETURNING payment_id INTO v_payment_id;

  RETURN v_payment_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_payment(BIGINT, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_payment(BIGINT, NUMERIC, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_invoice_paid_status()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_invoice_id BIGINT;
  v_booking_id BIGINT;
BEGIN
  v_invoice_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
  IF v_invoice_id IS NOT NULL THEN
    UPDATE public.invoices i
    SET is_paid = COALESCE((
      SELECT SUM(p.amount) >= i.amount_due
      FROM public.payments p
      WHERE p.invoice_id = i.invoice_id
        AND p.verification_status = 'Verified'
    ), FALSE)
    WHERE i.invoice_id = v_invoice_id;

    SELECT b.booking_id INTO v_booking_id
    FROM public.invoices i
    JOIN public.bookings b ON b.booking_id = i.booking_id
    WHERE i.invoice_id = v_invoice_id
      AND i.payment_type = 'Security deposit'
      AND i.student_id = b.student_id
      AND b.roommate_invite_status = 'Accepted';
    IF FOUND THEN
      PERFORM public.sync_booking_deposit_credit(v_booking_id);
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_invoice_paid_status_trg ON public.payments;
CREATE TRIGGER sync_invoice_paid_status_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_paid_status();

UPDATE public.invoices i
SET is_paid = COALESCE((
  SELECT SUM(p.amount) >= i.amount_due
  FROM public.payments p
  WHERE p.invoice_id = i.invoice_id
    AND p.verification_status = 'Verified'
), FALSE)
WHERE EXISTS (SELECT 1 FROM public.payments p WHERE p.invoice_id = i.invoice_id);

INSERT INTO public.invoices (
  booking_id, student_id, payment_type, period_start, period_end, amount_due, due_date
)
SELECT b.booking_id, b.student_id, 'Monthly rent', b.start_date, b.end_date,
       CASE
         WHEN b.roommate_invite_status = 'Accepted'
          AND b.roommate_start_date <= b.start_date THEN ROUND(r.monthly_rate / 2, 2)
         ELSE r.monthly_rate
       END, b.start_date
FROM public.bookings b
JOIN public.rooms r ON r.room_id = b.room_id
WHERE b.status = 'Confirmed'
  AND NOT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.booking_id = b.booking_id
      AND i.student_id = b.student_id
      AND i.payment_type = 'Monthly rent'
      AND i.period_start = b.start_date
  )
UNION ALL
SELECT b.booking_id, b.roommate_student_id, 'Monthly rent',
       b.roommate_start_date,
       CASE
         WHEN b.roommate_start_date = b.start_date THEN b.end_date
         ELSE (b.roommate_start_date + INTERVAL '1 month')::DATE
       END,
       r.monthly_rate - ROUND(r.monthly_rate / 2, 2), b.roommate_start_date
FROM public.bookings b
JOIN public.rooms r ON r.room_id = b.room_id
WHERE b.status = 'Confirmed'
  AND b.roommate_invite_status = 'Accepted'
  AND NOT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.booking_id = b.booking_id
      AND i.student_id = b.roommate_student_id
      AND i.payment_type = 'Monthly rent'
      AND i.period_start = b.roommate_start_date
  );

INSERT INTO public.invoices (
  booking_id, student_id, payment_type, period_start, period_end, amount_due, due_date
)
SELECT b.booking_id, b.student_id, 'Security deposit', b.start_date, b.end_date,
       CASE
         WHEN b.roommate_invite_status = 'Accepted' THEN ROUND(r.security_deposit / 2, 2)
         ELSE r.security_deposit
       END, b.start_date
FROM public.bookings b
JOIN public.rooms r ON r.room_id = b.room_id
WHERE b.status = 'Confirmed'
  AND r.security_deposit > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.booking_id = b.booking_id
      AND i.student_id = b.student_id
      AND i.payment_type = 'Security deposit'
      AND i.period_start = b.start_date
  )
UNION ALL
SELECT b.booking_id, b.roommate_student_id, 'Security deposit',
       b.roommate_start_date,
       CASE
         WHEN b.roommate_start_date = b.start_date THEN b.end_date
         ELSE (b.roommate_start_date + INTERVAL '1 month')::DATE
       END,
       r.security_deposit - ROUND(r.security_deposit / 2, 2), b.roommate_start_date
FROM public.bookings b
JOIN public.rooms r ON r.room_id = b.room_id
WHERE b.status = 'Confirmed'
  AND b.roommate_invite_status = 'Accepted'
  AND r.security_deposit > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.booking_id = b.booking_id
      AND i.student_id = b.roommate_student_id
      AND i.payment_type = 'Security deposit'
      AND i.period_start = b.roommate_start_date
  );

UPDATE public.payments p
SET invoice_id = (
  SELECT i.invoice_id
  FROM public.invoices i
  WHERE i.booking_id = p.booking_id
    AND i.student_id = p.student_id
    AND i.payment_type = p.payment_type
    AND p.payment_date::DATE BETWEEN i.period_start AND i.period_end
  ORDER BY i.period_start DESC
  LIMIT 1
)
WHERE p.invoice_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.booking_id = p.booking_id
      AND i.student_id = p.student_id
      AND i.payment_type = p.payment_type
      AND p.payment_date::DATE BETWEEN i.period_start AND i.period_end
  );

UPDATE public.invoices i
SET is_paid = COALESCE((
  SELECT SUM(p.amount) >= i.amount_due
  FROM public.payments p
  WHERE p.invoice_id = i.invoice_id
    AND p.verification_status = 'Verified'
), FALSE)
WHERE EXISTS (SELECT 1 FROM public.payments p WHERE p.invoice_id = i.invoice_id);

-- Realtime payment changes update student statuses and landlord review queues.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';

-- Persistent inbox entries for account-level events such as landlord verification.
CREATE TABLE IF NOT EXISTS public.notifications (
  notification_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES public.accounts(account_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  link_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notification_type TEXT NOT NULL DEFAULT 'general',
  related_verification_id BIGINT REFERENCES public.property_verifications(verification_id) ON DELETE SET NULL
);

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS notification_type TEXT NOT NULL DEFAULT 'general';
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_verification_id BIGINT
  REFERENCES public.property_verifications(verification_id) ON DELETE SET NULL;

DO $$
DECLARE
  v_column_default TEXT;
  v_is_identity TEXT;
  v_next_id BIGINT;
BEGIN
  SELECT column_default, is_identity
  INTO v_column_default, v_is_identity
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'notifications'
    AND column_name = 'notification_id';

  IF v_column_default IS NULL AND v_is_identity = 'NO' THEN
    CREATE SEQUENCE IF NOT EXISTS public.notifications_notification_id_seq;
    SELECT COALESCE(MAX(notification_id), 0) + 1
    INTO v_next_id
    FROM public.notifications;
    PERFORM setval('public.notifications_notification_id_seq'::regclass, v_next_id, FALSE);
    ALTER TABLE public.notifications
      ALTER COLUMN notification_id
      SET DEFAULT nextval('public.notifications_notification_id_seq'::regclass);
    ALTER SEQUENCE public.notifications_notification_id_seq
      OWNED BY public.notifications.notification_id;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON public.notifications (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_recipient_idx
  ON public.notifications (account_id)
  WHERE is_read IS NOT TRUE;

WITH latest_verifications AS (
  SELECT DISTINCT ON (verification.landlord_id)
    verification.verification_id,
    verification.landlord_id,
    verification.verification_status,
    verification.rejection_reason,
    verification.verified_at
  FROM public.property_verifications AS verification
  WHERE verification.landlord_id IS NOT NULL
  ORDER BY verification.landlord_id, verification.verification_id DESC
)
INSERT INTO public.notifications (
  account_id,
  notification_type,
  title,
  body,
  is_read,
  related_verification_id,
  created_at
)
SELECT
  landlord.account_id,
  'landlord_verification',
  CASE latest.verification_status
    WHEN 'Approved' THEN 'Documents approved'
    ELSE 'Documents need attention'
  END,
  CASE latest.verification_status
    WHEN 'Approved' THEN 'Your landlord documents have been approved.'
    ELSE 'Your landlord documents were not approved.'
      || CASE
        WHEN NULLIF(BTRIM(latest.rejection_reason), '') IS NOT NULL
          THEN ' Reason: ' || BTRIM(latest.rejection_reason)
        ELSE ''
      END
  END,
  FALSE,
  latest.verification_id,
  COALESCE(latest.verified_at, NOW())
FROM latest_verifications AS latest
JOIN public.landlords AS landlord ON landlord.landlord_id = latest.landlord_id
WHERE latest.verification_status IN ('Approved', 'Rejected')
  AND NOT EXISTS (
    SELECT 1
    FROM public.notifications AS existing
    WHERE existing.related_verification_id = latest.verification_id
  );

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE (is_read) ON TABLE public.notifications TO authenticated;

DO $$
DECLARE
  v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.notifications', v_policy.policyname);
  END LOOP;
END $$;

CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (account_id = public.auth_account_id());

CREATE POLICY notifications_mark_own_read ON public.notifications
  FOR UPDATE TO authenticated
  USING (account_id = public.auth_account_id())
  WITH CHECK (
    account_id = public.auth_account_id()
    AND is_read IS TRUE
  );

CREATE OR REPLACE FUNCTION public.notify_landlord_verification_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account_id BIGINT;
  v_title TEXT;
  v_message TEXT;
BEGIN
  IF NEW.verification_status IS NOT DISTINCT FROM OLD.verification_status
     OR NEW.verification_status NOT IN ('Approved', 'Rejected') THEN
    RETURN NEW;
  END IF;

  SELECT account_id
  INTO v_account_id
  FROM public.landlords
  WHERE landlord_id = NEW.landlord_id;

  IF v_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.verification_status = 'Approved' THEN
    v_title := 'Documents approved';
    v_message := 'Your landlord documents have been approved.';
  ELSE
    v_title := 'Documents need attention';
    v_message := 'Your landlord documents were not approved.';
    IF NULLIF(BTRIM(NEW.rejection_reason), '') IS NOT NULL THEN
      v_message := v_message || ' Reason: ' || BTRIM(NEW.rejection_reason);
    END IF;
  END IF;

  INSERT INTO public.notifications (
    account_id,
    notification_type,
    title,
    body,
    is_read,
    related_verification_id,
    created_at
  )
  VALUES (
    v_account_id,
    'landlord_verification',
    v_title,
    v_message,
    FALSE,
    NEW.verification_id,
    NOW()
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_landlord_verification_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_landlord_verification_status_change ON public.property_verifications;
CREATE TRIGGER notify_landlord_verification_status_change
  AFTER UPDATE OF verification_status ON public.property_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_landlord_verification_status_change();

CREATE OR REPLACE FUNCTION public.notify_house_moderation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account_id BIGINT;
  v_title TEXT;
  v_message TEXT;
BEGIN
  IF NEW.listing_status IS NOT DISTINCT FROM OLD.listing_status
     AND NEW.rejection_reason IS NOT DISTINCT FROM OLD.rejection_reason THEN
    RETURN NEW;
  END IF;

  SELECT landlord.account_id
  INTO v_account_id
  FROM public.landlords AS landlord
  WHERE landlord.landlord_id = NEW.landlord_id;

  IF v_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.listing_status::TEXT IN ('Rejected', 'Suspended') THEN
    IF NULLIF(BTRIM(NEW.rejection_reason), '') IS NULL THEN
      RAISE EXCEPTION 'A reason is required when rejecting or suspending a listing.';
    END IF;
    v_title := CASE NEW.listing_status::TEXT
      WHEN 'Rejected' THEN 'Listing rejected'
      ELSE 'Listing suspended'
    END;
    v_message := format(
      'Your listing "%s" was %s. Reason: %s',
      NEW.house_name,
      lower(NEW.listing_status::TEXT),
      BTRIM(NEW.rejection_reason)
    );
  ELSIF OLD.listing_status::TEXT IN ('Rejected', 'Suspended')
        AND NEW.listing_status::TEXT = 'Published' THEN
    v_title := 'Listing restored';
    v_message := format('Your listing "%s" is visible to students again.', NEW.house_name);
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (account_id, notification_type, title, body, is_read, created_at)
  VALUES (v_account_id, 'listing_moderation', v_title, v_message, FALSE, NOW());

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_house_moderation_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_house_moderation_change ON public.boarding_houses;
CREATE TRIGGER notify_house_moderation_change
  AFTER UPDATE OF listing_status, rejection_reason ON public.boarding_houses
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_house_moderation_change();

CREATE OR REPLACE FUNCTION public.notify_badge_moderation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account_id BIGINT;
  v_badge RECORD;
  v_title TEXT;
  v_message TEXT;
BEGIN
  SELECT landlord.account_id
  INTO v_account_id
  FROM public.landlords AS landlord
  WHERE landlord.landlord_id = NEW.landlord_id;

  IF v_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_badge IN
    SELECT * FROM (VALUES
      ('badge_fast_wifi', 'WiFi Verified', OLD.badge_fast_wifi, NEW.badge_fast_wifi, OLD.badge_fast_wifi_reason, NEW.badge_fast_wifi_reason),
      ('badge_24_7_water', 'Water 24/7', OLD.badge_24_7_water, NEW.badge_24_7_water, OLD.badge_24_7_water_reason, NEW.badge_24_7_water_reason),
      ('badge_vetted_safe', 'Vetted Safe', OLD.badge_vetted_safe, NEW.badge_vetted_safe, OLD.badge_vetted_safe_reason, NEW.badge_vetted_safe_reason)
    ) AS badge(badge_key, badge_label, was_enabled, is_enabled, old_reason, reason)
  LOOP
    IF v_badge.was_enabled IS DISTINCT FROM v_badge.is_enabled
       OR (v_badge.is_enabled IS FALSE AND v_badge.old_reason IS DISTINCT FROM v_badge.reason) THEN
      IF NOT v_badge.is_enabled AND NULLIF(BTRIM(v_badge.reason), '') IS NULL THEN
        RAISE EXCEPTION 'A reason is required when disabling a verification badge.';
      END IF;

      IF v_badge.is_enabled THEN
        v_title := 'Verification badge enabled';
        v_message := format('The "%s" badge was enabled for "%s".', v_badge.badge_label, NEW.house_name);
      ELSE
        v_title := 'Verification badge disabled';
        v_message := format(
          'The "%s" badge was disabled for "%s". Reason: %s',
          v_badge.badge_label,
          NEW.house_name,
          BTRIM(v_badge.reason)
        );
      END IF;

      INSERT INTO public.notifications (account_id, notification_type, title, body, is_read, created_at)
      VALUES (v_account_id, 'badge_moderation', v_title, v_message, FALSE, NOW());
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_badge_moderation_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_badge_moderation_change ON public.boarding_houses;
CREATE TRIGGER notify_badge_moderation_change
  AFTER UPDATE OF
    badge_fast_wifi, badge_24_7_water, badge_vetted_safe,
    badge_fast_wifi_reason, badge_24_7_water_reason, badge_vetted_safe_reason
  ON public.boarding_houses
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_badge_moderation_change();

CREATE OR REPLACE FUNCTION public.notify_student_review_moderation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account_id BIGINT;
  v_house_name TEXT;
BEGIN
  IF NEW.is_hidden IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF NEW.is_hidden IS NOT DISTINCT FROM OLD.is_hidden
     AND NEW.moderation_reason IS NOT DISTINCT FROM OLD.moderation_reason THEN
    RETURN NEW;
  END IF;
  IF NULLIF(BTRIM(NEW.moderation_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required when hiding a student review.';
  END IF;

  SELECT student.account_id, house.house_name
  INTO v_account_id, v_house_name
  FROM public.students AS student
  JOIN public.boarding_houses AS house ON house.house_id = NEW.house_id
  WHERE student.student_id = NEW.student_id;

  IF v_account_id IS NOT NULL THEN
    INSERT INTO public.notifications (account_id, notification_type, title, body, is_read, created_at)
    VALUES (
      v_account_id,
      'review_moderation',
      'Your review was hidden',
      format(
        'Your review for "%s" was hidden by a moderator. Reason: %s',
        COALESCE(v_house_name, 'a listing'),
        BTRIM(NEW.moderation_reason)
      ),
      FALSE,
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_student_review_moderation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_student_review_moderation ON public.reviews;
CREATE TRIGGER notify_student_review_moderation
  AFTER UPDATE OF is_hidden, moderation_reason ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_student_review_moderation();

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

NOTIFY pgrst, 'reload schema';

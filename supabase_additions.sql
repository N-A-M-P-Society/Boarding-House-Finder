-- ==============================================================================
-- UniRent: additions to run AFTER supabase_schema.sql (safe to re-run)
-- ==============================================================================

-- Student profile requirements: optional gender and a unique 12-digit student ID.
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_gender_check;
ALTER TABLE public.students
  ADD CONSTRAINT students_gender_check
  CHECK (gender IS NULL OR gender IN ('Female', 'Male'));

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

-- 1. Public-safe landlord directory (name + account only; government_id etc. stay private)
ALTER TABLE public.landlords ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
CREATE OR REPLACE VIEW public.landlord_public AS
  SELECT landlord_id, account_id, full_name, profile_photo_url FROM public.landlords;
GRANT SELECT ON public.landlord_public TO anon, authenticated;

-- 2. Names of the people I exchange messages with (students <-> landlords)
CREATE OR REPLACE VIEW public.message_peers AS
  SELECT
    a.account_id,
    a.role::text AS role,
    COALESCE(l.full_name, s.full_name) AS full_name,
    COALESCE(l.profile_photo_url, s.profile_photo_url) AS profile_photo_url
  FROM public.accounts a
  LEFT JOIN public.landlords l ON l.account_id = a.account_id
  LEFT JOIN public.students  s ON s.account_id = a.account_id
  WHERE a.account_id IN (
    SELECT sender_id   FROM public.messages WHERE receiver_id = public.auth_account_id()
    UNION
    SELECT receiver_id FROM public.messages WHERE sender_id   = public.auth_account_id()
  );
GRANT SELECT ON public.message_peers TO authenticated;

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
        AND public.auth_user_role() = 'Landlord'
      )
      OR public.is_staff()
    )
  );

DROP POLICY IF EXISTS unirent_verification_owner_insert ON storage.objects;
CREATE POLICY unirent_verification_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'unirent-verification'
    AND (storage.foldername(name))[2] = auth.uid()::TEXT
    AND public.auth_user_role() = 'Landlord'
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
    AND public.auth_user_role() = 'Landlord'
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

NOTIFY pgrst, 'reload schema';

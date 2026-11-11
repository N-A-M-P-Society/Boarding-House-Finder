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

-- 1. Public-safe landlord directory (name + account only; government_id etc. stay private)
CREATE OR REPLACE VIEW public.landlord_public AS
  SELECT landlord_id, account_id, full_name FROM public.landlords;
GRANT SELECT ON public.landlord_public TO anon, authenticated;

-- 2. Names of the people I exchange messages with (students <-> landlords)
CREATE OR REPLACE VIEW public.message_peers AS
  SELECT a.account_id, a.role::text AS role, COALESCE(l.full_name, s.full_name) AS full_name
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

-- 5. Campus gates for the Leaflet map + walking-distance calculation (ADDU Jacinto - adjust to your survey)
INSERT INTO public.campus_gates (university_name, gate_name, latitude, longitude, is_main_entry)
SELECT 'Ateneo de Davao University', 'Main Gate (Roxas Ave.)', 7.07220000, 125.61310000, TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.campus_gates WHERE gate_name = 'Main Gate (Roxas Ave.)');

-- 6. Realtime for chat
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';

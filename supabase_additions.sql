-- ==============================================================================
-- UniRent: additions to run AFTER sql_script.txt (safe to re-run)
-- ==============================================================================

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

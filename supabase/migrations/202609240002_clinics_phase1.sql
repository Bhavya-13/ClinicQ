BEGIN;

-- 1. Clinics table: one row per independent clinic
CREATE TABLE IF NOT EXISTS public.clinics (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 3 AND 40),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  pin_hash TEXT NOT NULL CHECK (pin_hash LIKE 'scrypt:%'),
  day_reset_hour INTEGER NOT NULL DEFAULT 16 CHECK (day_reset_hour BETWEEN 0 AND 23),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_paused BOOLEAN NOT NULL DEFAULT FALSE,
  avg_total_minutes REAL NOT NULL DEFAULT 30,
  avg_total_people INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only the backend may read this table (it holds PIN hashes)
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinics FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clinics TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.clinics_id_seq TO service_role;

-- 2. Demo clinic, carrying over your current average and pause setting
INSERT INTO public.clinics (slug, name, pin_hash, avg_total_minutes, avg_total_people, is_paused)
SELECT 'demo', 'Demo Clinic', 'PASTE_PIN_HASH_HERE',
  COALESCE((SELECT total_minutes FROM public.avg_stats WHERE id = 1), 30),
  COALESCE((SELECT total_people  FROM public.avg_stats WHERE id = 1), 5),
  COALESCE((SELECT is_paused     FROM public.queue_settings WHERE id = 1), FALSE)
ON CONFLICT (slug) DO NOTHING;

-- 3. Tag queues and patients with their clinic
ALTER TABLE public.queues   ADD COLUMN IF NOT EXISTS clinic_id INTEGER REFERENCES public.clinics(id);
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS clinic_id INTEGER REFERENCES public.clinics(id);

-- 4. Existing rows belong to the demo clinic, and so does anything the
--    currently deployed code creates (via a default), so the live site keeps working
DO $$
DECLARE demo_id INTEGER;
BEGIN
  SELECT id INTO demo_id FROM public.clinics WHERE slug = 'demo';
  UPDATE public.queues   SET clinic_id = demo_id WHERE clinic_id IS NULL;
  UPDATE public.patients SET clinic_id = demo_id WHERE clinic_id IS NULL;
  EXECUTE format('ALTER TABLE public.queues   ALTER COLUMN clinic_id SET DEFAULT %s', demo_id);
  EXECUTE format('ALTER TABLE public.patients ALTER COLUMN clinic_id SET DEFAULT %s', demo_id);
END $$;

CREATE INDEX IF NOT EXISTS queues_clinic_date_idx ON public.queues (clinic_id, date);
CREATE INDEX IF NOT EXISTS patients_clinic_idx    ON public.patients (clinic_id);

COMMIT;
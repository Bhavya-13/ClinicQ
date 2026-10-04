BEGIN;

-- 1. Sessions: up to 2 per clinic (slot 1 and slot 2)
CREATE TABLE IF NOT EXISTS public.clinic_sessions (
  id BIGSERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  slot SMALLINT NOT NULL CHECK (slot IN (1, 2)),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 30),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  booking_opens_before_min INTEGER NOT NULL DEFAULT 120
    CHECK (booking_opens_before_min BETWEEN 0 AND 720),
  booking_closes_before_end_min INTEGER NOT NULL DEFAULT 30
    CHECK (booking_closes_before_end_min BETWEEN 0 AND 240),
  closed_days SMALLINT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, slot),
  CHECK (start_time <> end_time)
);

ALTER TABLE public.clinic_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinic_sessions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clinic_sessions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.clinic_sessions_id_seq TO service_role;

-- 2. Each queue now belongs to one session on one day
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS session_id BIGINT;
ALTER TABLE public.queues DROP CONSTRAINT IF EXISTS queues_clinic_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS queues_clinic_session_date_key
  ON public.queues (clinic_id, (COALESCE(session_id, 0)), date);

NOTIFY pgrst, 'reload schema';

COMMIT;
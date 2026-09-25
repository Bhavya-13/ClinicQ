BEGIN;

-- 1. One queue per clinic per day (instead of one per day for everyone)
ALTER TABLE public.queues DROP CONSTRAINT IF EXISTS queues_date_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'queues_clinic_date_key') THEN
    ALTER TABLE public.queues ADD CONSTRAINT queues_clinic_date_key UNIQUE (clinic_id, date);
  END IF;
END $$;

-- 2. Every queue and patient must belong to a clinic
ALTER TABLE public.queues   ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE public.patients ALTER COLUMN clinic_id SET NOT NULL;

-- 3. Copy the latest average (the live site kept updating avg_stats since phase 1)
UPDATE public.clinics c
SET avg_total_minutes = s.total_minutes,
    avg_total_people  = s.total_people
FROM public.avg_stats s
WHERE s.id = 1 AND c.slug = 'demo';

-- 4. Hand out token numbers one at a time (no duplicates under simultaneous registrations)
CREATE OR REPLACE FUNCTION public.next_token_number(p_queue_id INTEGER)
RETURNS INTEGER
LANGUAGE sql
AS $$
  UPDATE public.queues
  SET current_number = current_number + 1
  WHERE id = p_queue_id
  RETURNING current_number;
$$;
REVOKE EXECUTE ON FUNCTION public.next_token_number(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_token_number(INTEGER) TO service_role;

-- 5. Lock tables to the backend only (the backend's service key bypasses these rules)
ALTER TABLE public.queues    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avg_stats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.queues, public.patients, public.avg_stats FROM anon, authenticated;

COMMIT;
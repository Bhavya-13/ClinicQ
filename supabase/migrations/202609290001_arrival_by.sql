BEGIN;

-- The time a waiting patient says they can reach the clinic by (information only)
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS arrival_by TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';

COMMIT;

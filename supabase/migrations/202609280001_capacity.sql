BEGIN;

-- Per session: closing-time warning (on by default) and optional online limit (off = no limit)
ALTER TABLE public.clinic_sessions
  ADD COLUMN IF NOT EXISTS closing_warning BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS max_online_people INTEGER
    CHECK (max_online_people IS NULL OR max_online_people BETWEEN 1 AND 1000);

-- Today's limit, if staff changed it on the day
ALTER TABLE public.queues
  ADD COLUMN IF NOT EXISTS limit_override INTEGER
    CHECK (limit_override IS NULL OR limit_override BETWEEN 1 AND 1000);

-- Walk-ins added by staff don't count towards the online limit
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'online'
    CHECK (source IN ('online', 'walkin'));

NOTIFY pgrst, 'reload schema';

COMMIT;
BEGIN;

CREATE TABLE IF NOT EXISTS public.queue_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  is_paused BOOLEAN NOT NULL DEFAULT FALSE
);

-- Keep any existing setting; do not reset it.
INSERT INTO public.queue_settings (id, is_paused)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

-- Only the trusted backend should access this table directly.
ALTER TABLE public.queue_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.queue_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE
ON TABLE public.queue_settings TO service_role;

COMMIT;
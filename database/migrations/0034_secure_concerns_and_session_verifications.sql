-- These tables are accessed only through DutyTrace's authenticated backend.
-- The app uses its own sessions and authorization, not Supabase Auth policies.
ALTER TABLE public.concerns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concern_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concern_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_session_verifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.concerns, public.concern_participants,
  public.concern_messages, public.attendance_session_verifications FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.concern_messages_seq_seq FROM PUBLIC;

-- Supabase roles need not exist on a standalone PostgreSQL test installation.
DO $$
DECLARE client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.concerns, public.concern_participants, public.concern_messages, public.attendance_session_verifications FROM %I', client_role);
      EXECUTE format('REVOKE ALL ON SEQUENCE public.concern_messages_seq_seq FROM %I', client_role);
    END IF;
  END LOOP;
END $$;

-- No client-facing policies: direct Data API access is denied by default.
-- The table owner / trusted backend keeps its existing access.

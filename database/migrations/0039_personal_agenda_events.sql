CREATE TABLE personal_agenda_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES institutions(id),
 owner_id uuid NOT NULL REFERENCES users(id),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 event_date date NOT NULL,
 all_day boolean NOT NULL DEFAULT true,
 starts_at time,
 ends_at time,
 notes text NOT NULL DEFAULT '' CHECK(length(notes) <= 2000),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((all_day AND starts_at IS NULL AND ends_at IS NULL)
   OR (NOT all_day AND starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at))
);
CREATE INDEX personal_agenda_events_owner_date ON personal_agenda_events(institution_id,owner_id,event_date);
ALTER TABLE personal_agenda_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE personal_agenda_events FROM PUBLIC;
DO $$
DECLARE client_role text;
BEGIN
 FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
   EXECUTE format('REVOKE ALL ON TABLE personal_agenda_events FROM %I',client_role);
  END IF;
 END LOOP;
END $$;

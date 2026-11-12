-- Remember onboarding per account, role and tutorial version across devices.
CREATE TABLE user_tutorial_progress (
 user_id uuid NOT NULL REFERENCES users(id),
 role user_role NOT NULL,
 version integer NOT NULL CHECK(version > 0),
 step_index smallint NOT NULL DEFAULT 0 CHECK(step_index BETWEEN 0 AND 19),
 status text NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed','dismissed')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,role,version)
);
ALTER TABLE user_tutorial_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE user_tutorial_progress FROM PUBLIC;
DO $$
DECLARE client_role text;
BEGIN
 FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
   EXECUTE format('REVOKE ALL ON TABLE user_tutorial_progress FROM %I',client_role);
  END IF;
 END LOOP;
END $$;

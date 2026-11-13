CREATE TABLE user_appearance_preferences (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 theme text NOT NULL DEFAULT 'light' CHECK(theme IN ('light','dark','system')),
 accent text NOT NULL DEFAULT 'teal' CHECK(accent IN ('teal','blue','violet','rose','amber')),
 density text NOT NULL DEFAULT 'comfortable' CHECK(density IN ('comfortable','compact')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_appearance_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON user_appearance_preferences FROM PUBLIC;
DO $$ DECLARE client_role text; BEGIN
 FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
   EXECUTE format('REVOKE ALL ON user_appearance_preferences FROM %I',client_role);
  END IF;
 END LOOP;
END $$;

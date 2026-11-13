CREATE TABLE account_email_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 new_email text NOT NULL CHECK(new_email=lower(new_email)),
 token_hash text NOT NULL UNIQUE,
 credential_fingerprint text NOT NULL,
 expires_at timestamptz NOT NULL,
 sent_at timestamptz,
 used_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX account_email_changes_one_pending ON account_email_changes(user_id)
 WHERE used_at IS NULL AND revoked_at IS NULL;
ALTER TABLE account_email_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_email_changes FROM PUBLIC;
DO $$ DECLARE client_role text; BEGIN
 FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
   EXECUTE format('REVOKE ALL ON account_email_changes FROM %I',client_role);
  END IF;
 END LOOP;
END $$;

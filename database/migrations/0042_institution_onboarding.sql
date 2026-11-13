-- Platform maintainers have no school membership. School accounts retain one.
ALTER TABLE users ALTER COLUMN institution_id DROP NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_role_institution_scope
  CHECK ((role::text = 'superadmin') = (institution_id IS NULL));

ALTER TABLE institutions ADD COLUMN short_name text NOT NULL DEFAULT '';
ALTER TABLE institutions ADD COLUMN institution_type text NOT NULL DEFAULT 'college'
  CHECK (institution_type IN ('university','college'));
ALTER TABLE institutions ADD COLUMN address text NOT NULL DEFAULT '';
ALTER TABLE institutions ADD COLUMN city text NOT NULL DEFAULT 'Naga City';
ALTER TABLE institutions ADD COLUMN contact_email text;
ALTER TABLE institutions ADD COLUMN created_by uuid REFERENCES users(id) ON DELETE RESTRICT;

CREATE TABLE institution_admin_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  email text NOT NULL CHECK (email = lower(email)),
  full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 120),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending','sent','failed','manual')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((accepted_at IS NULL) = (accepted_by IS NULL)),
  CHECK (NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX institution_admin_invitation_open_school
 ON institution_admin_invitations(institution_id) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE UNIQUE INDEX institution_admin_invitation_open_email
 ON institution_admin_invitations(email) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX institution_admin_invitation_history ON institution_admin_invitations(institution_id,created_at DESC);
ALTER TABLE institution_admin_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON institution_admin_invitations FROM PUBLIC;
DO $$ DECLARE client_role text; BEGIN
 FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
   EXECUTE format('REVOKE ALL ON institution_admin_invitations FROM %I',client_role);
  END IF;
 END LOOP;
END $$;

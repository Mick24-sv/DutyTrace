-- DutyTrace migration 0001: users, offices, duty assignments, sessions,
-- audit log, and an attendance_events skeleton for Phase 3.
--
-- Rules for migrations: never edit one after it has been applied anywhere
-- (the runner stores a checksum and will refuse). Add a new numbered file.

-- ---------------------------------------------------------------- enums
CREATE TYPE user_role AS ENUM ('student', 'supervisor', 'admin');
CREATE TYPE user_status AS ENUM ('active', 'disabled');
CREATE TYPE attendance_event_type AS ENUM ('time_in', 'time_out');

-- ------------------------------------------------- shared trigger helpers
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------- offices
CREATE TABLE offices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offices_code_not_blank CHECK (length(btrim(code)) > 0),
  CONSTRAINT offices_name_not_blank CHECK (length(btrim(name)) > 0)
);
CREATE UNIQUE INDEX offices_code_unique ON offices (lower(code));
CREATE TRIGGER offices_set_updated_at BEFORE UPDATE ON offices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------ users
CREATE TABLE users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 text NOT NULL,
  password_hash         text NOT NULL,          -- bcrypt hash, never plaintext
  full_name             text NOT NULL,
  role                  user_role NOT NULL,
  status                user_status NOT NULL DEFAULT 'active',
  failed_login_count    integer NOT NULL DEFAULT 0,
  locked_until          timestamptz,
  last_login_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT users_name_not_blank CHECK (length(btrim(full_name)) > 0)
);
CREATE UNIQUE INDEX users_email_unique ON users (email);
CREATE INDEX users_role_idx ON users (role);
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------ duty assignments
-- Links a student assistant or supervisor to an office. History is kept:
-- ending an assignment sets ends_on instead of deleting the row.
CREATE TABLE duty_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  office_id   uuid NOT NULL REFERENCES offices (id) ON DELETE RESTRICT,
  starts_on   date NOT NULL DEFAULT CURRENT_DATE,
  ends_on     date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT duty_assignments_dates_valid CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
-- A user may have at most ONE current (open-ended) assignment.
CREATE UNIQUE INDEX duty_assignments_one_current_per_user
  ON duty_assignments (user_id) WHERE ends_on IS NULL;
CREATE INDEX duty_assignments_office_idx ON duty_assignments (office_id);

-- --------------------------------------------------------------- sessions
-- Server-side login sessions. Only a SHA-256 hash of the cookie token is
-- stored, so a leaked database does not leak usable session tokens.
CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  ip_address   text,
  user_agent   text
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- -------------------------------------------------------------- audit log
-- Append-only. The trigger below blocks UPDATE and DELETE for everyone,
-- including the application's own database role.
CREATE TABLE audit_logs (
  id           bigserial PRIMARY KEY,
  actor_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  action       text NOT NULL,
  target_type  text,
  target_id    text,
  before_data  jsonb,
  after_data   jsonb,
  ip_address   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_id, created_at DESC);
CREATE INDEX audit_logs_target_idx ON audit_logs (target_type, target_id);

CREATE FUNCTION audit_logs_block_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_changes();
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_block_changes();

-- -------------------------------------------------- attendance (skeleton)
-- Created now so relationships exist; NO endpoints use it until Phase 3.
-- recorded_at defaults to the database clock; the API must never accept a
-- timestamp from the browser.
CREATE TABLE attendance_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  office_id    uuid NOT NULL REFERENCES offices (id) ON DELETE RESTRICT,
  event_type   attendance_event_type NOT NULL,
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  source       text NOT NULL DEFAULT 'qr',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attendance_events_user_time_idx ON attendance_events (user_id, recorded_at);
CREATE INDEX attendance_events_office_time_idx ON attendance_events (office_id, recorded_at);

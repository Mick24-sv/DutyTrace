-- DutyTrace migration 0007: password reset tokens
-- Stores SHA-256 hashes of single-use, time-limited password recovery tokens.
-- The raw token is sent to the user via email and never stored in the database.

CREATE TABLE password_reset_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  ip_address  text,
  user_agent  text
);

CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id);
CREATE INDEX password_reset_tokens_expires_idx ON password_reset_tokens (expires_at) WHERE used_at IS NULL;


-- Phase 7: in-app notifications and idempotent reminder delivery.
ALTER TABLE institution_dtr_policies
  ADD COLUMN review_sla_hours integer
    CHECK (review_sla_hours IS NULL OR review_sla_hours BETWEEN 1 AND 720);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  type text NOT NULL CHECK (length(btrim(type)) > 0),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  message text NOT NULL CHECK (length(btrim(message)) > 0),
  related_type text,
  related_id uuid,
  important boolean NOT NULL DEFAULT false,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT notifications_related_pair CHECK ((related_type IS NULL) = (related_id IS NULL)),
  CONSTRAINT notifications_recipient_dedupe UNIQUE (recipient_id, dedupe_key)
);

CREATE INDEX notifications_recipient_recent_idx ON notifications (recipient_id, created_at DESC);
CREATE INDEX notifications_recipient_unread_idx ON notifications (recipient_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX notifications_institution_idx ON notifications (institution_id, created_at DESC);

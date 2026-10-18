-- DutyTrace migration 0002: office QR codes and attendance recording (Phase 3).

-- ----------------------------------------------------------- office QR codes
-- The QR *payload* is not stored. It is derived on demand as an HMAC signature
-- of this row's id (see server/src/modules/qr/qr.service.js), so admins can
-- re-display or print it. Revoking sets revoked_at; rows are never deleted so
-- attendance events stay traceable to the code that was scanned.
CREATE TABLE office_qr_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id   uuid NOT NULL REFERENCES offices (id) ON DELETE RESTRICT,
  created_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  revoked_by  uuid REFERENCES users (id) ON DELETE SET NULL
);
-- At most ONE valid (not revoked) QR code per office.
CREATE UNIQUE INDEX office_qr_one_active_per_office
  ON office_qr_codes (office_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------- attendance_events
-- seq gives a stable order when two events share a timestamp.
ALTER TABLE attendance_events
  ADD COLUMN seq         bigserial,
  ADD COLUMN qr_code_id  uuid REFERENCES office_qr_codes (id) ON DELETE RESTRICT,
  ADD COLUMN ip_address  text,
  ADD COLUMN user_agent  text;

CREATE INDEX attendance_events_user_order_idx ON attendance_events (user_id, recorded_at, seq);

-- Attendance history is append-only: nobody (including the application's
-- database role) can silently edit or delete an event. Corrections will be
-- separate records (attendance_corrections) in a later phase.
CREATE FUNCTION attendance_events_block_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'attendance_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER attendance_events_no_update_delete
  BEFORE UPDATE OR DELETE ON attendance_events
  FOR EACH ROW EXECUTE FUNCTION attendance_events_block_changes();

-- DutyTrace migration 0018: add institution_id to audit_logs for multi-tenant scoping.
-- Without this column, admin queries must join through users, which breaks for
-- system events where actor_id IS NULL (e.g. anonymous failed logins).
--
-- The column is nullable for backward-compatibility with existing rows, but every
-- new row written by audit.service.js will always supply a value.

ALTER TABLE audit_logs
  ADD COLUMN institution_id uuid REFERENCES institutions (id) ON DELETE SET NULL;

-- Index for the admin Audit Trail page query: list events for my institution sorted by time.
CREATE INDEX audit_logs_institution_time_idx ON audit_logs (institution_id, created_at DESC);


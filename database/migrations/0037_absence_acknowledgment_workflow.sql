-- Receipts can acknowledge follow-up requests; new uploads reopen acknowledgment.
-- Preserve the legacy reviewed state and existing immutable-record protections.
CREATE OR REPLACE FUNCTION public.absence_notices_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Absence notices cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.user_id <> OLD.user_id OR NEW.office_id <> OLD.office_id OR NEW.absence_type <> OLD.absence_type
     OR NEW.start_date <> OLD.start_date OR NEW.end_date <> OLD.end_date OR NEW.reason <> OLD.reason
     OR NEW.submitted_at <> OLD.submitted_at THEN
    RAISE EXCEPTION 'The submitted details of an absence notice cannot be changed' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.status = OLD.status OR NOT (
       (OLD.status = 'pending'         AND NEW.status IN ('acknowledged', 'reviewed', 'needs_follow_up'))
    OR (OLD.status = 'acknowledged'    AND NEW.status IN ('pending', 'reviewed', 'needs_follow_up'))
    OR (OLD.status = 'needs_follow_up' AND NEW.status IN ('pending', 'acknowledged', 'reviewed'))
  ) THEN
    RAISE EXCEPTION 'Invalid absence status change: % -> %', OLD.status, NEW.status USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

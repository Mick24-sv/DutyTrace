-- An individual policy is already an explicit administrator authorization,
-- recorded in duty_requirement_policies and the audit log. Keep a note
-- optional while validating it when supplied.
ALTER TABLE duty_requirement_policies
  DROP CONSTRAINT IF EXISTS duty_requirement_policy_exception,
  ADD CONSTRAINT duty_requirement_policy_exception CHECK (
    (scope_type = 'student'
      AND (exception_reason IS NULL OR length(btrim(exception_reason)) >= 5))
    OR (scope_type <> 'student' AND exception_reason IS NULL)
  );

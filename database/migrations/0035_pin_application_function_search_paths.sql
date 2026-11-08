-- Pin the 35 application trigger functions to trusted schemas.
-- pg_catalog first protects built-ins; public resolves the existing app tables
-- and enums; pg_temp last prevents temporary tables from shadowing app tables.
-- Keep existing function bodies, trigger attachments, and execution privileges.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
DO $$
DECLARE client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('REVOKE CREATE ON SCHEMA public FROM %I', client_role);
    END IF;
  END LOOP;
END $$;

ALTER FUNCTION public.absence_notices_guard() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.absence_policy_version_guard() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.academic_terms_prevent_finalized_changes() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.academic_terms_prevent_overlap() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.attendance_adjustments_immutable() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.attendance_discrepancy_history_immutable() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.attendance_discrepancy_transition_guard() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.attendance_event_policy_version_guard() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.attendance_events_block_changes() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.audit_logs_block_changes() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.case_requirements_guard() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.compliance_cases_guard() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.dtr_block_truncate() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.dtr_history_block_changes() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.duty_assignments_same_institution() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.duty_requirement_daily_cap_validate() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.duty_requirement_default_daily_cap_validate() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.duty_requirement_policy_validate() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.historical_duty_credit_history_immutable() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.historical_duty_credit_immutable() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.historical_duty_credit_no_truncate() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.historical_duty_credit_validate() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.institution_policy_assignment_immutable() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.institution_policy_assignment_validate() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.institution_policy_template_actor_guard() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.institution_policy_version_actor_guard() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.institution_policy_version_guard() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.institution_policy_version_no_delete() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.monthly_dtrs_guard() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.seed_institution_alert_policy() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.semester_requirement_assignments_immutable() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.semester_requirement_assignments_validate() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.student_duty_schedule_day_editable() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.student_duty_schedule_validate() SET search_path = pg_catalog, public, pg_temp;

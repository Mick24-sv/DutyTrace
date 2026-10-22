-- DutyTrace accesses these tables through its trusted backend connection.
-- Supabase's PostgREST roles must not be able to read or mutate notification
-- policies, preferences, or delivery records directly without row policies.
REVOKE ALL ON TABLE institution_alert_policies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE notification_deliveries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE notification_preferences FROM PUBLIC, anon, authenticated;

ALTER TABLE institution_alert_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE TABLE problem_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 report_number bigserial UNIQUE NOT NULL,
 institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
 reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 reporter_role text NOT NULL CHECK(reporter_role IN ('admin','supervisor','student')),
 category text NOT NULL CHECK(category IN ('calculation','qr','login','display','other')),
 title text NOT NULL CHECK(length(title) BETWEEN 5 AND 160),
 description text NOT NULL CHECK(length(description) BETWEEN 10 AND 4000),
 expected text NOT NULL CHECK(length(expected) BETWEEN 5 AND 2000),
 page_path text NOT NULL,
 browser text NOT NULL,
 app_version text NOT NULL,
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','investigating','resolved')),
 response text NOT NULL DEFAULT '' CHECK(length(response)<=2000),
 screenshot bytea,
 screenshot_mime text CHECK(screenshot_mime IN ('image/png','image/jpeg')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES users(id) ON DELETE RESTRICT,
 CHECK((screenshot IS NULL)=(screenshot_mime IS NULL)),
 CHECK(screenshot IS NULL OR octet_length(screenshot)<=2097152)
);
CREATE INDEX problem_reports_inbox ON problem_reports(status,created_at DESC);
CREATE INDEX problem_reports_owner ON problem_reports(institution_id,reporter_id,created_at DESC);
ALTER TABLE problem_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON problem_reports FROM PUBLIC;
REVOKE ALL ON SEQUENCE problem_reports_report_number_seq FROM PUBLIC;
DO $$ DECLARE client_role text; BEGIN
 FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
   EXECUTE format('REVOKE ALL ON problem_reports FROM %I',client_role);
   EXECUTE format('REVOKE ALL ON SEQUENCE problem_reports_report_number_seq FROM %I',client_role);
  END IF;
 END LOOP;
END $$;

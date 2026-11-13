# Problem reports

School administrators, office supervisors, and Student Assistants can select **Report a problem** from their account menu. The dialog includes a new report form and **My reports**, which lists their latest 50 submissions and maintainer replies. Reporting requires sign-in; the public login page does not accept anonymous reports.

Reports include a category, title, description, expected result, reporter, institution, role, submission timestamp, coarse browser family, backend app version, and an allowlisted page section. Query strings, fragments, and record identifiers are removed. Cookies, passwords, console logs, QR payloads, and duty records are never attached automatically. Free-text fields are user supplied: reporters are reminded not to paste secrets or private student records.

Each report receives a `BUG-…` reference. Screenshots are optional, manually selected PNG/JPEG files up to 2 MB, validated by extension and file signatures. They are stored in the report row, served only through authenticated, ownership-checked routes, and are not public storage URLs. Attachments are accepted once, while the report is new and within ten minutes of submission. If attachment upload fails, the report stays saved and the dialog lets the user retry or continue without the image. Reports and their attachments have no automatic deletion in this release.

The superadmin header shows a new-report count and links to `/superadmin/problem-reports`. The institution dashboard has a report summary and inbox link. Summary counts refresh every 30 seconds while the page is visible and when the window receives focus. This is an in-app indicator, not push or email delivery. The inbox can be refreshed explicitly; it does not reload an in-progress reply automatically.

The inbox supports status/search filters and pagination. Maintainers move reports through **New**, **Investigating**, and **Resolved**, and write replies visible to the reporter. Resolution requires a reply. Reporters cannot change statuses. Institution admins cannot see other users’ reports, including reports from their own school. The platform maintainer can see submitted reports across schools, including their voluntarily attached context, without receiving access to unrelated private school records.

Creation, screenshot attachment, and status changes are audited without copying report descriptions or image bytes into the audit log. Authenticated submission/upload requests are rate limited. New tables and their sequence are unavailable to Supabase public client roles.

Validation: `node --test backend/tests/problem-reports.test.js` checks context sanitization and role rules. `node backend/scripts/check-problem-reports.mjs` verifies creation for all three school roles, ownership isolation, screenshot validation, status replies, and inbox filtering inside a rolled-back transaction. It leaves no test reports, users, institutions, or audit rows; database sequence counters can advance.

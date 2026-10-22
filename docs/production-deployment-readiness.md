# DutyTrace production deployment readiness

Prepared for the existing Supabase PostgreSQL database, Render backend, and Vercel frontend. Migration 0025 was applied and verified on 2026-10-22; nothing was pushed or deployed.

## Verified repository facts

- The root npm workspace supports Node.js `>=20.12 <25`; the backend starts with `npm run start -w backend`, and the Vite frontend builds with `npm run build -w frontend`.
- The backend reads `PORT`, listens on that port, enables Helmet, exact-origin credentialed CORS, origin checks on state-changing requests, login and password-reset rate limits, and httpOnly session cookies. Production requires a valid HTTPS `CLIENT_ORIGIN` and matching `APP_URL`, `DATABASE_URL`, `DATABASE_SSL=true`, a 32-character `QR_SIGNING_SECRET`, `TRUST_PROXY>=1`, a durable document-storage configuration, SMTP credentials for account recovery, and a 32-character `ATTENDANCE_RECONCILE_SECRET`.
- Supabase was rechecked over verified client-to-pooler TLS 1.3 immediately before migration 0025. The database is PostgreSQL 17.11 with 43 public tables; all 42 tables declared by the repository migrations exist. It has 310 validated constraints, including 125 foreign keys, and 122 valid indexes. Every table with an `institution_id` column has a foreign key to `institutions`. All 24 preexisting migration checksums matched the repository before applying 0025. One institution row exists.
- All 25 repository migration filenames are numbered contiguously through 0025. Migration 0025 passed a static scan for destructive DDL/data statements and was applied transactionally on 2026-10-22 using the repository runner. Its stored checksum was verified after application.
- The public schema has no RLS policies. Migration 0025 now enables RLS on `institution_alert_policies`, `notification_deliveries`, and `notification_preferences` and removes `anon` and `authenticated` table privileges. Verified after application: RLS is enabled on all three tables; those roles have no SELECT, INSERT, UPDATE, or DELETE privileges on them. Backend access remains through the trusted backend database role and API authorization/institution scoping.
- Password-reset email is implemented through SMTP. Production startup now requires SMTP host, user, password, and a non-local sender, and reset links must use the exact `CLIENT_ORIGIN`. Delivery failures invalidate the new token, log only a safe error code, and preserve a generic public response. SMTP credentials and sender-domain verification still need configuration.
- Uploaded documents use a storage adapter. Development/tests retain private local disk; production is configured for a private Supabase Storage bucket using a backend-only Supabase secret key. Files remain accessible only through authorization-checked DutyTrace routes; no public or signed URL is returned. The bucket and credentials are not configured yet. Supabase Storage objects need their own backup/recovery procedure; a PostgreSQL schema dump does not contain object bytes.
- `POST /api/notifications/sweep` is protected by `ATTENDANCE_RECONCILE_SECRET` and runs alert, reminder, and discrepancy sweeps. It is designed for scheduled invocation. No scheduler configuration is present; no worker or paid resource has been created.
- `/api/health` is a liveness check. `/api/health/ready` checks PostgreSQL connectivity and should be used as Render's health-check path.
- The Vite frontend reads only `VITE_API_BASE_URL` at runtime/build time; browser-visible `VITE_` values must never contain credentials. Development localhost references occur only in Vite's proxy target/example. Vercel's SPA rewrite is present. Auth checks `/auth/me` on load and relies on the server's httpOnly session cookie; role routes are guarded in the client and enforced again by the API. QR scanning checks secure-context camera availability and offers manual code entry when camera access is unavailable.
- The database pool has a configurable `DB_POOL_MAX` (default `10`) and connection/idle timeouts. Login and password-reset rate limits still use per-process memory, so configure a shared rate-limit store before running multiple backend instances.
- `.env` files are ignored, `backend/.env` is ignored and untracked, and no environment file is tracked. Never use a `VITE_` variable for a secret.

## Readiness

| Area | Status | Finding |
|---|---|---|
| Database connectivity and TLS | Ready | Read-only connection succeeded with verified TLS. |
| Existing migration history | Ready | Migrations 0001–0025 are applied; prior checksums and migration 0025's stored checksum match repository files. |
| Supabase table access | Ready for the three notification tables | Migration 0025 enables RLS and removes `anon`/`authenticated` table privileges on all three. Post-application privilege and RLS checks passed. Other RLS-enabled public tables have no policies (default deny). |
| Backend runtime | Needs configuration | Set production values listed below; startup now fails closed if proxy trust, private Supabase document storage, SMTP recovery, matching frontend origins, or the scheduled-job secret is missing. `PORT` is supplied by Render. |
| Render service configuration | Needs configuration | Repository root, Node runtime, commands, health-check path, and required environment variable names are documented below. No Render service has been created. |
| Vercel project configuration | Needs configuration | Frontend root, Vite build/output, public API URL, and SPA fallback are documented below. No Vercel project has been created. |
| Authentication/session | Needs configuration | Sessions are random, stored as hashes, revalidated against the database, and set in httpOnly, Secure production, SameSite=Lax cookies. Production now rejects unsafe session-cookie requests with missing or mismatched Origin. `CLIENT_ORIGIN` must exactly match the frontend HTTPS origin. Use custom domains on the same registrable domain for Vercel and Render; their default hostnames are cross-site and will not support this cookie flow. Do not weaken cookie settings. |
| QR attendance | Needs configuration | Supply a stable random `QR_SIGNING_SECRET` of at least 32 characters; changing it invalidates existing QR codes. |
| File storage | Needs configuration | The backend storage adapter now supports private Supabase Storage. Create a private `dutytrace-documents` bucket with the app's 5 MB limit and PDF/PNG/JPEG MIME allowlist, then configure `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `DOCUMENT_STORAGE=supabase` in Render. Configure and verify a separate object backup/recovery procedure before enabling document uploads. |
| Scheduled processing | Needs configuration | Configure a scheduled invocation of `/api/notifications/sweep` and `ATTENDANCE_RECONCILE_SECRET`. The task is retry-safe for persisted alerts/reminders/discrepancies, but no scheduler is configured. |
| In-app notifications | Ready | Database-backed in-app notifications do not require SMTP. |
| Account recovery | Needs configuration | Brevo is the selected SMTP provider. The existing single-use, 30-minute, hashed-token password reset flow now requires SMTP settings at production startup and uses an `APP_URL` matching `CLIENT_ORIGIN`. Activate transactional sending, authenticate a sender domain, add the SMTP login/key in Render, and verify delivery before deployment. Brevo's Free plan currently allows 300 sends per day. |
| Frontend routing | Ready | `frontend/vercel.json` configures Vite SPA deep-link fallback. |
| Frontend production build | Ready | `npm run build -w frontend` succeeded. Vite emitted a non-blocking warning that the minified JavaScript chunk is larger than 500 kB (756.14 kB); code-splitting can reduce initial download size. |
| Frontend/API domains | Needs configuration | Set Vercel `VITE_API_BASE_URL=https://api.<your-owned-domain>/api`, Render `CLIENT_ORIGIN=https://app.<your-owned-domain>`, and Render `APP_URL` to that exact frontend origin. Actual domains and provider DNS/verification remain to be supplied/configured. |
| Frontend auth and environment safety | Ready | Browser requests include credentials for the backend-managed httpOnly session cookie. The only application `VITE_` read is the public API base URL; no database, session, QR, or SMTP credentials are referenced by frontend source. |
| Frontend mobile and QR access | Ready | App shell and login use responsive layouts. QR scanner requires HTTPS (or localhost for local development), reports camera errors, and supports manual entry. Production mobile camera use still requires the deployed HTTPS origin and browser permission. |
| Frontend branding | Ready | Existing `/logo.png` and favicon assets remain in use. |
| Backend tests | Ready | Full suite passed against the isolated PostgreSQL 17.11 test database: 329 passed, 0 failed, 0 cancelled. No tests connected to Supabase. A non-failing `pg` client concurrency deprecation warning remains for follow-up. |
| Backend syntax and frontend build | Ready | `node --check` passed for all 67 backend source JavaScript files. `npm run build -w frontend` passed; Vite reports a non-blocking 756.14 kB minified JavaScript chunk warning. |
| Backup/restore | Blocked | The public-schema backup passed archive integrity checks, but all three isolated restore attempts failed before application objects were restored. Preserve all targets. Migration 0025 has since been applied; no production restore was attempted. |
| Push/deploy | Not performed | Explicit approval is required before either action. |

### Backend integration test run — 2026-10-22

- The configured `TEST_DATABASE_URL` originally targeted `localhost:5432/dutytrace_test`, but no server was listening there. The existing PostgreSQL Windows service was left untouched.
- A fresh PostgreSQL `17.11` cluster was created under `%TEMP%\dutytrace-integration-pg17-20261022`, bound only to `127.0.0.1:5437`. A new empty database, `dutytrace_integration_test_20261022`, was confirmed absent before creation. Only local `NOLOGIN` stubs for `anon` and `authenticated` were added because migration 0025 references them. Test environment variables were overridden for the test process; `backend/.env` was not changed.
- The first test run stopped during schema setup because the local `anon` role was missing. After creating the two required non-login role stubs in this disposable cluster, the first complete run had **329 tests total, 320 passed, 9 failed, 0 cancelled**.
- The failures exposed an overly restrictive supervisor scan route, notification category filtering suppressing uncategorized notices, and test setup that did not match current behavior (missing DTR revision fixtures, an invalid 3-hour schedule against a 4-hour minimum, a transfer targeting the wrong office/date, and direct semester finalization bypassing the required planner). The route and notification service were corrected; the test fixtures/assertions were aligned with current policy and planner behavior.
- Focused regression tests passed: **29/29** across attendance, duty schedules, notifications, and semesters. The full backend suite then passed: **329/329, 0 failed, 0 cancelled**. The full run emitted one non-failing `pg` deprecation warning about concurrent `client.query()` calls; this should be traced before upgrading to `pg` 9.
- The temporary PostgreSQL server is stopped. Its cluster and test database files are preserved under `%TEMP%`; no development, test service, or production database was changed by this run. The test database contains test fixtures and is not a production backup.

## Backup and restore status — Blocker 1

**Status: backup created and integrity checked; restore not verified.** Read-only facts and user-provided encryption verification recorded on 2026-10-22:

- The configured Supabase PostgreSQL server reports version `17.11`; database size is approximately `14 MB`.
- The backend's configured TLS CA file exists. A read-only PostgreSQL client socket check reported encryption active and certificate authorization successful when using that CA. The connection uses the Supabase session pooler; `pg_stat_ssl` reports the database-side pooled session, so it is not a substitute for checking the client-to-pooler TLS socket.
- There are 43 base tables in `public`; `public.schema_migrations` has 24 records, from `0001_initial_schema.sql` through `0024_institution_policy_templates.sql`.
- Read-only representative row counts observed during inspection: `institutions` 1, `users` 3, `offices` 2, `academic_terms` 2, `duty_assignments` 2, `attendance_events` 2, `monthly_dtrs` 1, `audit_logs` 290, and `notifications` 4. These are reference counts, not counts verified inside the archive; the live application remains active.
- Non-system schemas present include `auth`, `extensions`, `graphql`, `graphql_public`, `public`, `realtime`, `storage`, and `vault`. Installed extensions include `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, and `uuid-ossp`.
- Supabase `auth.users` has 0 rows; `storage.buckets` and `storage.objects` each have 0 rows at inspection time. DutyTrace application user records are in `public.users`.
- PostgreSQL client utilities are now available at `C:\Program Files\PostgreSQL\17\bin`: both `pg_dump` and `pg_restore` report version `17.11`, matching the Supabase server's PostgreSQL `17.11`. This is a compatible major/minor client version. No local PostgreSQL restore server was found; a dedicated isolated PG17 instance on port 5433 remains necessary for restore verification. No installation was needed.
- The destination `C:\Users\moral\Documents\DutyTraceBackups` is outside the repository, is not under the redirected OneDrive Documents path, and the C: volume had about `287.16 GiB` free for a current `14 MB` database. The directory now exists with an ACL restricted to the current Windows account. The user verified using `Get-BitLockerVolume` that C: is fully encrypted, protection is on, and encryption is 100%. EFS is not enabled for new files; BitLocker supplies volume encryption.
- The user approved the export. On 2026-10-22, `pg_dump 17.11` created `C:\Users\moral\Documents\DutyTraceBackups\dutytrace-public-2026-10-22.dump` over TLS with `PGSSLMODE=verify-full` and the configured CA. The password was supplied only as a transient process environment value and was not printed or passed in command arguments. The new destination directory ACL grants access only to the current Windows account.
- The archive is `312,254` bytes. SHA-256: `005061C92A3704460F5C35393E950FC1BB3E5E69C7A53645D9574EFA0FFDB372`. `pg_restore --list` succeeded (619 TOC entries); the archive contains all 43 `public` tables, one `public.schema_migrations` data entry, and 88 ACL entries. A full `pg_restore --exit-on-error --no-owner --file=NUL` archive read/decompression check succeeded. These checks establish that the custom archive is readable and its compressed data stream can be traversed; they do not replace a database restore test.
- Supabase Dashboard backup/PITR availability and plan retention have not been inspected. Do not assume a managed backup exists. Supabase documents that managed daily backup availability/retention depends on plan, and database backups do not include Storage API file contents; see [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups).

### Proposed logical backup coverage

For migration 0025 rollback/recovery, the PostgreSQL 17 custom-format logical dump covers the `public` schema only. It includes all DutyTrace application tables and their rows/schema objects, including `public.schema_migrations`; the archive contains a data entry for that table, and 24 applied records were verified in the live DB during read-only inspection. Migration 0025 changes table privileges and RLS, not application rows or columns. ACLs were retained (no `--no-privileges`) so pre-migration grants are available for recovery. `--no-owner` avoids restoring Supabase ownership. The local restore must create any referenced roles as non-privileged stubs, or selectively restore ACLs after review; do not import Supabase role definitions/password hashes. A public-schema dump is sufficient to recover application data and pre-0025 ACL statements, but is not a full project or cluster backup. The database's app migration SQL uses PostgreSQL's built-in `gen_random_uuid()`; local restore will reveal any additional extension dependency.

This is an application-schema recovery artifact, not a complete Supabase project clone. The dump will exclude Supabase-managed schemas (`auth`, `storage`, `realtime`, `vault`, GraphQL schemas), cluster roles/passwords, extension installations/settings, Supabase Auth configuration/API keys, Realtime and Edge Function settings, and Storage API binary objects. Auth has no users and Storage has no buckets/objects in the verified counts; nevertheless those platform settings are not backed up by this `public` dump. Supabase's [restore-to-new-project documentation](https://supabase.com/docs/guides/platform/clone-project) lists platform configuration and Storage objects that require separate recovery steps.

### Export command and execution

The approved export parsed `DATABASE_URL` from ignored `backend/.env` in memory to set `PGHOST`, `PGPORT`, `PGDATABASE`, and `PGUSER` without echoing the URL. It set `PGSSLMODE=verify-full` and `PGSSLROOTCERT` to the configured CA. The database password was held only in the `pg_dump` process environment, not printed or placed in command arguments/logs. The executed command was:

```powershell
pg_dump --format=custom --schema=public --no-owner --verbose `
  --file="C:\Users\moral\Documents\DutyTraceBackups\dutytrace-public-2026-10-22.dump"
```

The production export was read-only, but copied application data to this computer. The approved file is outside Git on the BitLocker-protected C: volume. Keep it access-restricted and delete it securely after the recovery window ends.

### Isolated restore verification — FAIL

- The existing local PostgreSQL 17 service was identified on port `5433` with data directory `C:\Program Files\PostgreSQL\17\data`; password authentication prevented catalog inspection, so it was left untouched. The previously configured development/test endpoint on port `5432` did not respond. A new isolated PostgreSQL `17.11` cluster was initialized under `C:\Users\moral\Documents\DutyTraceBackups\restore-cluster-20261022`, bound only to `127.0.0.1:5434`, using UTF-8 and a current-user-only directory ACL. It was not installed as a service.
- The approved target `dutytrace_restore_verify_20261022` was queried in the fresh cluster before creation and was absent (`0` catalog matches). It was created once, owned by the local restore administrator. The backup's ACL recipients were handled with local `NOLOGIN` role stubs for `postgres`, `anon`, `authenticated`, and `service_role`; no Supabase role definitions/passwords or production settings were imported. `pg_restore` used `--exit-on-error --single-transaction --no-owner`, preserving the archive ACL statements in the isolated database context.
- **Restore failed/incomplete.** PowerShell's stop-on-error handling treated `pg_restore`'s verbose stderr progress line (`pg_restore: connecting to database for restore`) as a terminating native-command error before a completion status could be captured. The stopped cluster was inspected read-only in PostgreSQL single-user mode: server version `17.11`, target database exists, but public table count is `0`, `schema_migrations` is absent, and public constraint count is `0`. This confirms application objects were not restored. The PostgreSQL server log contains zero `ERROR`, `FATAL`, or `WARNING` lines; this does not change the failed result.
- The cluster is stopped and the database/cluster files are preserved. No drop, overwrite, or retry was performed. As required, the existing target will not be reused; a retry needs a separately approved new database name/target. No representative data counts or migration checksum checks could be run against restored application data. No production database or schema was touched.

### Second isolated restore attempt — FAIL

- The backup hash was reverified as `005061C92A3704460F5C35393E950FC1BB3E5E69C7A53645D9574EFA0FFDB372`. A new PG17.11 cluster was initialized at `C:\Users\moral\Documents\DutyTraceBackups\restore-cluster-retry-20261022`, bound only to `127.0.0.1:5435`; the prior cluster on 5434 and development/test port 5432 were not changed. The target `dutytrace_restore_verify_retry_20261022` was confirmed absent before it was created.
- `pg_restore` was launched with `Start-Process -Wait -PassThru`, stdout and stderr were captured to separate restricted files, and normal stderr did not terminate PowerShell. It returned **exit code 1**. Stderr contains one genuine error: `could not execute query: ERROR: schema "public" already exists` while executing the archive's `CREATE SCHEMA public;`. There were **0 warnings**. The stdout log is empty; stderr log is preserved at `C:\Users\moral\Documents\DutyTraceBackups\restore-cluster-retry-20261022\pg_restore.stderr.log`.
- Read-only catalog inspection after stopping the cluster found **0 public tables**, no `public.schema_migrations`, **0 public constraints**, and **0 valid public indexes**. Representative data counts and migration checksums could not be verified because the single-transaction restore rolled back. No student records were printed. The new database and cluster are preserved and stopped; they will not be reused, dropped, or overwritten.
- The next attempt must use a new separately approved target. To handle the local preexisting `public` schema, prepare a `pg_restore --list` TOC file and omit only the `SCHEMA public` creation entry; keep the archived objects, ACLs, and all other entries. Then retain `--exit-on-error --single-transaction --no-owner`, local `NOLOGIN` ACL role stubs, separate Start-Process output/error logs, and verify the actual exit code. This next attempt has not been run.

### Third and final isolated restore attempt — FAIL

- The approved archive SHA-256 was rechecked and matches `005061C92A3704460F5C35393E950FC1BB3E5E69C7A53645D9574EFA0FFDB372`. Its TOC contains exactly one schema-creation entry: `38; 2615 2200 SCHEMA - public pg_database_owner`. A private modified list is prepared at `C:\Users\moral\Documents\DutyTraceBackups\dutytrace-public-2026-10-22.restore-third.list` (SHA-256 `CBE453F1C28D37C843D0DC92D712C5C199AD215216C812CC076FC8FC59CFC18A`). Only that one entry is prefixed with `;`; all other list lines were byte-for-text verified unchanged.
- The modified list retains 43 table definitions, 43 table-data entries, 8 sequences and 8 sequence-set entries, 61 constraints, 125 foreign-key constraints, 61 indexes, 31 functions, 55 triggers, and all 83 ACL entries. It also retains the `COMMENT - SCHEMA public` and `ACL - SCHEMA public` entries. The schema ACL comprises `USAGE` grants to `postgres`, `anon`, `authenticated`, and `service_role`; the restore plan creates only those local roles as `NOLOGIN` stubs. The archive's schema owner is `pg_database_owner`, a built-in role. Skipping schema creation leaves the fresh database's existing `public` schema in place; `--no-owner` avoids ownership changes, while the retained schema comment and ACL entries continue to restore.
- The approved target was verified before creation: the cluster directory did not exist and port `5436` was available. A new PostgreSQL `17.11` cluster was initialized at `C:\Users\moral\Documents\DutyTraceBackups\restore-cluster-third-20261022`, bound only to `127.0.0.1:5436`. The target database `dutytrace_restore_verify_third_20261022` was confirmed absent in that fresh cluster and created there. The existing 5433 service and failed clusters on 5434 and 5435 were not touched.
- Before restore, the backup SHA-256 was reverified as `005061C92A3704460F5C35393E950FC1BB3E5E69C7A53645D9574EFA0FFDB372` and the modified TOC SHA-256 as `CBE453F1C28D37C843D0DC92D712C5C199AD215216C812CC076FC8FC59CFC18A`. Only the required local `NOLOGIN` ACL role stubs (`postgres`, `anon`, `authenticated`, `service_role`) were created. The archive owner/ACL references also include `supabase_admin`, which was not stubbed.
- `pg_restore` used the approved modified TOC with `--no-owner --exit-on-error --single-transaction`, and was launched with `Start-Process -Wait -PassThru`; stdout and stderr were captured separately. The actual process exit code was **1**. Stderr contains one genuine error and **0 warnings**: `ERROR: role "supabase_admin" does not exist` while executing archived `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public ...` statements. Stdout was empty. The PostgreSQL server log confirms that error, then shutdown aborted active transactions and completed cleanly. The single-transaction restore therefore did not commit application objects.
- The cluster is stopped and the database, cluster, and logs are preserved. Logs are in `C:\Users\moral\Documents\DutyTraceBackups\restore-cluster-third-20261022\` (`pg_restore.stdout.log`, `pg_restore.stderr.log`, and `postgres-server.log`). No student rows or credentials were printed. The restore attempt did not modify production, development, or test databases. No fourth restore attempt is authorized or will be prepared/run automatically.
- Restore verification result: **FAIL**. Tables, migration records/checksums, constraints, indexes, and representative aggregate data counts could not be verified because the restore transaction failed before commit. At that time migration 0025 remained NO-GO pending further direction; it was later explicitly authorized and applied as documented below. Backup recoverability remains unverified.

- Post-restore catalog verification was not run because the restore exited nonzero and the single transaction rolled back. Expected source reference values remain 43 public tables, 24 migration records, 310 validated constraints (125 foreign keys), 122 valid indexes, and the representative counts listed above; none of these were verified in this failed target.

### Migration 0025 — applied and verified

- On 2026-10-22, after explicit user instruction to apply migration 0025, the configured `DATABASE_URL` was confirmed to point to the DutyTrace Supabase project (`aws-0-ap-northeast-1.pooler.supabase.com`, database `postgres`, PostgreSQL `17.11`). The client-to-pooler socket was encrypted and certificate-authorized with TLS 1.3. No connection secret was displayed.
- Before applying, a read-only check found exactly 24 migration records, ending at `0024_institution_policy_templates.sql`; all 24 checksums matched repository migration files. The local 0025 checksum was `0aec5bbc94627df6f81cb4ae8c45f4a977b889d7f6586d7253838d5eb5074e1d`.
- `npm run db:migrate -w backend` completed and reported `applied 0025_lock_down_notification_table_access.sql`. The runner applies each migration in a transaction and records its checksum.
- Read-only verification confirmed 25 migration records and a matching stored checksum for 0025. On `institution_alert_policies`, `notification_deliveries`, and `notification_preferences`, RLS is enabled and `anon` and `authenticated` have no SELECT, INSERT, UPDATE, or DELETE table privileges. No data was queried or changed by verification.
- The migration is applied, but production deployment remains **NO-GO** because backup restore verification and other readiness items below remain unresolved. No restore, push, or deploy was performed.

## Phase 10 — Final GO/NO-GO assessment

**Decision: NO-GO for production deployment.** Preparation is complete, but the following conditions remain unresolved:

| Blocker | Verified state | Required resolution |
|---|---|---|
| Supabase recovery point | Backup availability and restore success are unverified. Database connectivity does not establish backup readiness. | Confirm a current recoverable backup and successfully restore it to an isolated target before changing production schema. |
| Migration 0025 | Applied; checksum, RLS flags, and client-role privileges verified after application. | Keep the security migration in place; retain a verified backup/recovery path before further production changes. |
| Private documents | Supabase Storage adapter is implemented, but private bucket, Render storage credentials, and object backup/recovery are not configured. | Create the private bucket, configure backend-only secret settings, and verify a separate Storage object backup procedure before enabling uploads. |
| Account recovery | SMTP password reset is implemented; production startup requires SMTP, but a provider, credentials, and verified sender are not configured. | Configure a verified sender domain and SMTP credentials in Render; verify a real reset end to end before production users rely on it. |
| Browser/API origin | Actual custom domains, Vercel `VITE_API_BASE_URL`, and Render `CLIENT_ORIGIN`/`APP_URL` are unverified/unconfigured. | Choose owned HTTPS domains under the same registrable domain and set matching origins exactly. |
| Integration tests | Full suite passed in isolated local PostgreSQL: 329 passed, 0 failed. One non-failing `pg` client concurrency deprecation warning appeared. | Trace the warning before upgrading to `pg` 9. Never use Supabase for this suite. |
| Scheduled sweeps | Endpoint is implemented, but Render Cron is not configured. | Configure the reviewed schedule and secret after approving any associated service cost. |
| GitHub synchronization | Local branch is `Phase6` at `e63e0fd`; no upstream is configured. A cached `origin/Phase6` ref exists at the same commit, but its freshness was not verified during this review. | Confirm the intended GitHub branch and refresh/compare its remote state before approving a push. |

### Source-control state reviewed

There are no staged changes. These changes are local and uncommitted (21 modified tracked files and 3 untracked files):

- Modified: `backend/.env.example`, `backend/src/config/env.js`, `backend/src/db/pool.js`, `backend/src/middleware/auth.js`, `backend/src/modules/attendance/attendance.routes.js`, `backend/src/modules/auth/auth.routes.js`, `backend/src/modules/auth/email.service.js`, `backend/src/modules/auth/password-reset.service.js`, `backend/src/modules/documents/documents.service.js`, `backend/src/modules/documents/storage.js`, `backend/src/modules/notifications/notifications.service.js`, `backend/src/routes/health.js`, `backend/src/server.js`, `backend/tests/duty-schedules.test.js`, `backend/tests/notifications.test.js`, `backend/tests/semesters.test.js`, `docs/architecture.md`, `frontend/src/components/layout/Topbar.jsx`, `frontend/src/pages/auth/ForgotPasswordPage.jsx`, `package.json`, and `package-lock.json`.
- Untracked: `database/migrations/0025_lock_down_notification_table_access.sql`, `docs/production-deployment-readiness.md`, and `frontend/vercel.json`.

The local cached `origin/Phase6` ref points to the same commit as `HEAD`, but no upstream is configured and a live remote comparison was not performed. The uncommitted files are not represented by that commit. Do not assume these changes are already on GitHub or push them without reviewing the diff and confirming the target branch.

### Deployment sequence after approval

1. Resolve backup recovery readiness. The approved public-schema dump is valid, but all three isolated restores failed; no production restore was attempted. Do not restore over production.
2. Migration 0025 is already applied and verified. Do not rerun it; ensure the release code and repository migration file are included in the reviewed, approved push.
3. Start disposable local PostgreSQL at the configured `dutytrace_test` target and rerun the backend suite. Rebuild the frontend and review all local diffs. Confirm the GitHub target branch, then obtain explicit approval before committing/pushing.
4. Configure Render's approved repository/branch, Node runtime, required environment, verified database TLS, same-site custom API domain, private Supabase Storage, verified SMTP recovery, and scheduled job. Keep the pre-deploy command empty. Deploy the backend only after settings and migration status are verified.
5. Check Render `/api/health` and `/api/health/ready`, inspect logs for errors without exposing secrets, and verify session/CORS origins.
6. Configure Vercel's approved repository/branch, `frontend` root, Vite build, output directory, production API URL, and frontend custom domain. Preview must use a non-production API/database or remain isolated. Deploy after Render is healthy.
7. Verify production variables and exact origin matching: Vercel API URL, Render `CLIENT_ORIGIN`/`APP_URL`, TLS, QR secret, scheduler secret, Supabase Storage settings, and SMTP sender/credentials. Configure secrets only in provider dashboards.
8. With dedicated test accounts, verify login, logout, session persistence, role guards, and institution/office separation. Test QR scanning on HTTPS mobile and the manual code fallback.
9. Smoke-test attendance, schedules/reviews, DTR, forecasts, recovery plans, semester transitions, discrepancy resolution, policy application, notifications, document upload/download, and audit history. Avoid changing real student records; inspect logs afterward.

### Rollback plan

- **Database:** Take and verify a backup before the migration. Migration execution is transactional; on failure the runner rolls it back. If 0025 succeeds but a later release fails, keep the security migration and roll back the application. Do not restore production or re-grant broad `anon`/`authenticated` privileges without separate explicit approval and security review. Validate any recovery point in isolation first and agree on the data-loss scope.
- **Backend:** Keep the last healthy Render release available and redeploy it if readiness or API smoke checks fail. Preserve database state and diagnose before retrying.
- **Frontend:** Restore the last healthy Vercel deployment if routing, API requests, or session behavior fails. Keep the API URL and Render `CLIENT_ORIGIN` aligned.
- **Configuration/storage:** Record approved settings without secret values. Revert only the failing setting; never copy credentials into Git or logs.

### Actions requiring your manual approval

- Resolve the failed backup restore verification and approve any new recovery approach before another restore attempt.
- Approve committing/pushing the reviewed local changes to the confirmed GitHub branch.
- Approve creating/configuring Render and Vercel services and entering production settings/domains.
- Review any new Supabase Storage usage, SMTP provider, scheduled-job, or domain costs before enabling them.
- Approve production deployment and any later production rollback or restore.

## Production configuration

### Render web service

Connect the repository in Render as a Node web service. Use repository root `.` so npm can use the root workspace lockfile.

- Build command: `npm ci`
- Start command: `npm run start -w backend`
- Health-check path: `/api/health/ready`
- Node version: set Render's `NODE_VERSION=24.21.0` (current Render runtime as of 2026-10-22); the repository range is bounded to `>=20.12 <25`.

In Render's New Web Service form, connect the existing DutyTrace GitHub repository, select the branch you intend to deploy after approval, choose the Node runtime, and use repository root `.`. Keep auto-deploy disabled until the code push and deployment are explicitly approved. Render should use the root workspace lockfile for `npm ci`; do not set the service root to `backend/`.

Leave Render's pre-deploy command blank. Do not add `npm run db:migrate` to build, start, or pre-deploy settings: migration 0025 is already applied and verified. Review later migrations separately before applying them.

Set these variables in the Render dashboard. Enter secret values there; do not commit them.

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24.21.0` (bounded by the repository's Node engine range) |
| `CLIENT_ORIGIN` | Exact frontend custom origin, e.g. `https://app.<your-owned-domain>` |
| `APP_URL` | Same exact frontend origin as `CLIENT_ORIGIN`; used for password reset links |
| `DATABASE_URL` | Supabase PostgreSQL server-side connection string from the Supabase Connect panel; choose a connection endpoint reachable from Render and keep it private |
| `DATABASE_SSL` | `true` |
| `DATABASE_SSL_CA` | Optional path to the Supabase CA certificate if the selected endpoint requires it; certificate verification remains enabled |
| `QR_SIGNING_SECRET` | Random secret with at least 32 characters; generate and store securely |
| `TRUST_PROXY` | `1` |
| `ATTENDANCE_RECONCILE_SECRET` | A separate random secret for the scheduled sweep endpoint |
| `DOCUMENT_STORAGE` | `supabase` in production |
| `SUPABASE_URL` | HTTPS origin of the Supabase project |
| `SUPABASE_SECRET_KEY` | Backend-only Supabase secret key (preferred; legacy `SUPABASE_SERVICE_ROLE_KEY` is accepted); never expose either in Vercel or browser code |
| `SUPABASE_STORAGE_BUCKET` | `dutytrace-documents`; create it as a private bucket with 5 MB max size and PDF/PNG/JPEG allowed types |
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` (STARTTLS) |
| `SMTP_SECURE` | `false` |
| `SMTP_USER` | SMTP login displayed in Brevo (may be account email or a generated login) |
| `SMTP_PASS` | Brevo SMTP key, not the account password or API key; store as a secret |
| `SMTP_FROM` | DutyTrace sender address on a domain authenticated with Brevo |
| `DB_POOL_MAX` | Maximum PostgreSQL connections per backend instance (defaults to `10`; reduce if Supabase connection limits require it) |
| `APP_TIMEZONE` | Fallback timezone; institution-specific term timezones remain authoritative |

`PORT` is supplied by Render. `SESSION_HOURS`, upload limits, and login throttling have code defaults and can be set explicitly if desired. SMTP settings are required at startup so password recovery cannot silently be unavailable in production. Login throttles use in-process memory, so they are per-instance; use a shared store before horizontal scaling. There is no `SESSION_SECRET` setting: session tokens are random and only their hashes are stored. The backend drains requests on `SIGTERM`, closes PostgreSQL, and force-closes stragglers after 10 seconds.

Create the `dutytrace-documents` bucket through the Supabase Storage Dashboard or supported Storage API. Keep it private, set its maximum file size to 5 MB, and restrict MIME types to `application/pdf`, `image/png`, and `image/jpeg`. Do not edit Supabase's managed `storage` tables directly. Test uploading and downloading only through the authenticated DutyTrace API. Supabase Storage object bytes are separate from the PostgreSQL schema dump; define and verify an object backup/recovery plan. No bucket or external resource has been created by this code change.

#### Scheduled sweeps

The API has no in-process timer. A persistent external scheduler must call the combined sweep endpoint. A 15-minute cadence is appropriate for the configured upcoming-shift windows (whose minimum is one hour) and attendance discrepancy checks. Review the selected Render Cron plan's current pricing and limits before creating a job; no job has been configured or billed.

Configure the Cron Job with the same `ATTENDANCE_RECONCILE_SECRET` value as the API, plus `DUTYTRACE_API_URL=https://<your-api-custom-domain>`. Use this command:

```sh
curl --fail --silent --show-error --request POST \
  "$DUTYTRACE_API_URL/api/notifications/sweep" \
  --header "x-attendance-reconcile-secret: $ATTENDANCE_RECONCILE_SECRET"
```

The endpoint returns a non-2xx response for an invalid scheduler secret; the `--fail` flag makes the scheduled command fail in that case. Treat non-zero command exits as failed runs and let the scheduler retry according to its configured policy. Keep the API and cron secret values out of source control and logs.

Repeat and overlap behavior:

- Notifications have a unique `(recipient_id, dedupe_key)` constraint. Reminder keys are stable by assignment, event/stage, or missing assignment. Repeated successful sweeps therefore do not create another copy for the same dedupe key.
- Risk detection uses a PostgreSQL advisory lock across backend instances. Email delivery claims rows in a transaction with `FOR UPDATE SKIP LOCKED`; failed sends are retried with exponential backoff and stop after eight attempts. If SMTP is unset, in-app notifications continue and email deliveries are skipped.
- Discrepancies have a unique `(institution_id, dedupe_key)` constraint. Reconciliation upserts detections and updates/cancels stale findings when attendance, absence, or recovery-shift state changes. It evaluates schedules in each academic term's timezone and applies institution/policy grace periods.
- Reminder dates and upcoming shifts are calculated in the relevant academic-term timezone. Review SLA reminders use elapsed hours from recorded review events.
- Concurrent manual calls can still run reminder and reconciliation scans at the same time; their database uniqueness/locking prevents duplicate persisted findings, but they can add load. Use one scheduler and avoid manual overlap during a long run. Render Cron serializes runs of the same job; the database lock additionally protects the risk sweep across application instances.

No scheduler job, worker, paid resource, or deployment has been created.

### Vercel frontend

Create a separate Vercel project from the same Git repository, then set:

- Root directory: `frontend`
- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Install command: leave Vercel's automatic npm/workspace detection enabled; the repository has one root `package-lock.json` and an npm workspace for `frontend`.
- Production environment variable `VITE_API_BASE_URL`: `https://api.<your-owned-domain>/api`

Set the production API URL only for Production. For Preview deployments, use a separate non-production API and database if one is available; do not point previews at production Supabase by default. `VITE_` values are compiled into public browser assets, so this variable may contain the API origin/path only and must never contain a credential. In local development, keep `VITE_API_BASE_URL=/api`; Vite forwards it to the local backend through `VITE_API_PROXY_TARGET`.

Use custom domains under the same registrable domain for the frontend and API, for example `app.<your-owned-domain>` and `api.<your-owned-domain>`. If DutyTrace has its own registered domain, a branded pair such as `app.dutytrace.<owned-domain>` and `api.dutytrace.<owned-domain>` is appropriate. This keeps the API's `SameSite=Lax` session cookie in a same-site context while retaining HTTPS and exact-origin CORS. Default Vercel and Render hostnames do not meet this requirement. Set Render's `CLIENT_ORIGIN` and `APP_URL` to the exact Vercel custom origin, without a trailing path or slash.

The existing `frontend/vercel.json` rewrite serves `index.html` for direct navigation to client routes. Vercel documents this `/(.*)` to `/index.html` pattern for single-page applications. Do not add a Vercel API proxy rewrite: the frontend uses the configured external API URL and backend CORS/session rules. Do not put database URLs, session/QR/scheduler secrets, or SMTP credentials in Vercel variables.

## Migration review and approval checkpoint

The production database currently matches migrations `0001` through `0025`. Migration `0025_lock_down_notification_table_access.sql` revokes `PUBLIC`, `anon`, and `authenticated` privileges on three notification tables and enables RLS without client policies. Post-application checks verified the stored checksum, RLS flags, and lack of `anon`/`authenticated` table privileges. It contains no data deletion, table recreation, or column removal. Do not rerun it. The backup restore blocker remains unresolved.

## SMTP-backed account recovery

The existing forgot-password flow uses single-use, 30-minute reset tokens stored only as hashes. Brevo is the selected SMTP provider. In production, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and a verified `SMTP_FROM` are required at startup, and `APP_URL` must exactly match `CLIENT_ORIGIN`. Forgot-password responses do not reveal whether an account exists. If a configured provider fails during handoff, the newly issued token is marked used, and the backend logs only a safe provider error code. Activate transactional email sending, authenticate the sender domain in Brevo, add its SPF/DKIM records, create an SMTP key, then exercise a reset with a dedicated test account. Brevo requires the SMTP key rather than the account password or API key, and its SMTP login is the value displayed on the SMTP settings page. The current Free plan allows 300 emails per day; confirm the account's limit before production use. [Brevo SMTP setup](https://developers.brevo.com/docs/smtp-integration), [Free plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan), [Brevo troubleshooting](https://help.brevo.com/hc/en-us/articles/115000188150-Troubleshooting-Issues-with-Brevo-SMTP).

There is no audited administrator-assisted password reset flow in the current application. The admin user-management API can create accounts and change roles/status, but it cannot reset another user's password. Do not use direct SQL or the bootstrap administrator command as an ad hoc password-recovery path. Since SMTP is the chosen recovery mechanism, provide the verified provider credentials in Render's secret settings and verify delivery before launch.

Migration 0025 was applied to production Supabase at the user's explicit request and verified read-only. No Git push, external resource creation, or deployment has been performed.

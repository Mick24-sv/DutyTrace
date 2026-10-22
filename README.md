# DutyTrace

**A QR-enabled Student Assistant duty verification and compliance platform for universities and colleges**

An academic capstone project. DutyTrace aims to digitize Student Assistant (SA) attendance, duty-hour compliance, monthly DTRs, supervisor verification, absence notices, and compliance-case tracking.

> **Status: Phases 1–8, with security hardening and QA updates.** DutyTrace includes institution-scoped in-app notifications and a configurable risk-alert service for completion forecasts, upcoming approved duty shifts, recovery review, schedule conflicts, attendance discrepancies, deadlines, and finalized term transitions. External scheduled processing is required for time-based detection and email retries. Academic terms, requirement thresholds, notification rules, and reminder timing are institution-configurable. An absence notice **never excuses an absence or changes required hours**, and nothing marks a student compliant or noncompliant automatically. The DTR template remains provisional until an institution supplies its official form. See [docs/open-questions.md](docs/open-questions.md).

Duty-hour rules can be configured by term for an institution, office, or an authorized individual exception, including minimum and optional maximum daily hours. The default minimum is 3 hours per duty day and can be changed by an administrator; it is not a universal requirement. Student Assistants can submit preferred weekly hours for office-supervisor review. The interface estimates whether proposed recurring hours could cover remaining verified hours by the deadline; this estimate is advisory. Supervisors can view overlapping approved preferences and suggest alternative times. Approved preferences support monitoring only and do not authorize or block the existing office QR attendance flow. See [docs/api-endpoints.md](docs/api-endpoints.md#duty-requirements-and-sa-schedule-preferences).

## Tech stack

PostgreSQL · Express.js · React (Vite) · Node.js · Tailwind CSS v4 · `pg` (node-postgres) with plain SQL migrations · Zod validation · bcrypt password hashing · `jsqr` (camera QR decoding) · `qrcode` (QR drawing)

> **Why not Prisma?** The original plan used Prisma. Its engine downloads were blocked in the environment this phase was built in, which made migrations and tests impossible to run and verify. We use `pg` and versioned `.sql` files instead (see [docs/architecture.md](docs/architecture.md)). Everything stays compatible with ordinary PostgreSQL, including Supabase.

## Requirements

- Node.js 20.12 or newer (developed on v22) and npm 10+
- PostgreSQL 14 or newer (local install, Docker, or a hosted Supabase project)
- Git

## Project layout

```
dutytrace/
  frontend/   React + Vite app (components/, pages/, routes/, hooks/, services/, styles/)
  backend/    Express API (src/{config,db,middleware,utils,routes,modules}, tests/)
  database/   SQL migrations, the single source of truth for the schema
  docs/       architecture, database schema, API endpoints, development plan, open questions
```

There is **no demo data and no hardcoded account** in the app. Everything on screen comes from your database through the API.

## Setup (Supabase)

1. **Install:** `npm install` (at the root; installs frontend and backend).
2. **Create a Supabase project** and copy the *database connection string* (Project Settings -> Database). Use the *Session pooler* or *Direct connection* string (port 5432); migrations use an advisory lock, which the *Transaction pooler* (port 6543) does not support.
3. **Configure the backend:** `cp backend/.env.example backend/.env`, then set at least:
   - `DATABASE_URL=<your Supabase connection string>` and `DATABASE_SSL=true`
   - `QR_SIGNING_SECRET=<long random string>` (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`). Changing it invalidates printed QR codes.
   - `CLIENT_ORIGIN`, `APP_TIMEZONE` (fallback timezone for the existing monthly DTR workflow)
   - `ATTENDANCE_RECONCILE_SECRET` (required to secure the external alert and attendance scheduler endpoint)
4. **Create/update the tables:** `npm run db:migrate`. This applies `database/migrations/*.sql` in order and is safe to re-run (a checksum stops edited migrations). Run it after deploying code that adds a migration, using the same `DATABASE_URL` as the API. For a hosted API, run the command in the deployment environment with its database secret, then restart/redeploy the API. The API does not apply schema changes automatically.
5. **Create your first administrator** (nothing is preloaded):

   ```bash
   ADMIN_EMAIL=you@school.edu ADMIN_NAME="Your Name" ADMIN_PASSWORD='a-long-password-10+' ADMIN_INSTITUTION_NAME="Your Institution" ADMIN_INSTITUTION_TIMEZONE="America/New_York" npm run db:create-admin
   ```

   Set the institution name and IANA timezone for this administrator's tenant. Each institution is managed by its own administrator account. To bootstrap a separate institution, run this command with that institution's unique admin email, name and institution name. Sign in, add offices under *Offices*, create accounts under *Users & Roles*, configure academic years and semester dates under *Academic Terms*, assign individual hour requirements, and generate office QR codes.
6. **Run:** `npm run dev` (API on http://localhost:4000, app on http://localhost:5173).

7. **Schedule alerts in production:** Configure a Render Cron Job to `POST https://<api-host>/api/notifications/sweep` every 6 hours (or at the cadence appropriate for the institution) with the `x-attendance-reconcile-secret` header set to `ATTENDANCE_RECONCILE_SECRET`. This sweep also reconciles missed approved shifts. Configure `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` to enable opted-in email alerts; in-app notifications work without SMTP.

Notes for Supabase:

- The backend connects as a normal PostgreSQL client with the database password. **Keep that password server-side only; never put it in `frontend/`** (anything `VITE_` is public). The app does not use Supabase Auth, the Supabase JS client or the auto-generated REST API; sessions and roles are handled by the backend. Because the tables live in the `public` schema, **turn Row Level Security on for them in the Supabase dashboard (with no policies) so the public Supabase API cannot read them**; the backend's direct connection is unaffected.
- Uploaded documents are stored on the backend's disk (`UPLOAD_DIR`). On a host with a temporary disk, use a persistent volume, or replace `backend/src/modules/documents/storage.js` with Supabase Storage (private bucket).
- Tests need a **separate** database (`TEST_DATABASE_URL`, its name must contain "test"). The tests drop and recreate its schema, so never point it at your Supabase project with real data. A local PostgreSQL works: `createdb dutytrace_test`. Set `TEST_DATABASE_SSL=false` for a local server; this is independent of production `DATABASE_SSL`. Set it to `true` (and optionally `TEST_DATABASE_SSL_CA`) only for a separate hosted test database that requires TLS.

## Run

```bash
npm run dev          # backend on :4000 and frontend on :5173
```

## Other commands

| Command | What it does |
| --- | --- |
| `npm test` | Backend tests (auth, institution permissions, QR, attendance, DTR workflow, semester requirements, notifications/reminders, PDF, absences, documents and cases) against `TEST_DATABASE_URL`. Test fixtures with fictional users live in `backend/tests/fixtures/` and are never used by the app |
| `npm run build` | Production build of the frontend into `frontend/dist/` |
| `npm start` | Runs the API without file watching |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:create-admin` | Create/reset an administrator and institution from `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`, and optionally `ADMIN_INSTITUTION_NAME` / `ADMIN_INSTITUTION_TIMEZONE` |

## QR attendance: how to use it

1. **Administrator** opens *Office QR Codes*, picks an office, and prints the code (the Print button prints only the QR sheet). Post it at the office.
2. **Student Assistant or Supervisor** opens *Scan QR*, taps **Scan QR to time in**, and points the camera at the code. The page then offers **time out** the same way. If the camera can't be used, they can paste the code text instead.
3. Everyone sees their own history under *My Attendance* (daily and monthly). **Supervisors** see their office's assistants under *Student Assistants*; **administrators** manage QR codes.

Things worth knowing:

- **Camera access requires HTTPS or `localhost`.** On a phone, `http://192.168.x.x:5173` will *not* get camera access; use HTTPS (for example a tunnel or a deployed site) or the manual-entry fallback.
- **Regenerate** replaces an office's code (the old one stops working at once). **Revoke** removes it with no replacement. Old codes are kept in a history list.
- The server uses its **own clock** for every time-in/out; the API accepts no timestamp and no user id.
- Set a real `QR_SIGNING_SECRET` in production (the app refuses to start without one). Changing it invalidates every printed code.

### Recorded hours: the rules (confirm with your institution)

Hours come only from events; nothing is stored as a total. See `backend/src/modules/attendance/calc.js`.

| Situation | Shown as | Counted? |
| --- | --- | --- |
| time-in followed by time-out, up to `MAX_SESSION_HOURS` (default 12) | Recorded | Yes |
| time-in with no time-out yet (within the limit) | In progress | No |
| time-in with no time-out, past the limit, or followed by another time-in | Missing time-out | No |
| time-out with no time-in before it | No matching time-in | No |
| complete but longer than the limit | Needs review | No |

A session belongs to the local day it started (in `APP_TIMEZONE`). **Recorded is not verified:** *Verified hours* is 0 for a month until a supervisor approves that month's DTR (see below).

### Limits of QR attendance (be honest in your capstone defense)

A printed QR code is static: a photo of it could be scanned from somewhere else. This build reduces the risk (sign-in required, the code must match the user's *assigned* office, server-side timestamps, revocable and regenerable codes, every accepted and refused scan audited with IP/device) but does **not** prove physical presence. Stronger options for later: a rotating code shown on a screen at the office, or office Wi-Fi/location checks. Both need institutional approval.

## Monthly DTR: how to use it

1. **Student Assistant** opens *Monthly DTR*. The last 12 **ended** months are listed. A month can only become a DTR after it has ended in `APP_TIMEZONE` (the current month and future months are refused by the server). *Preview & create* shows the month first; *Create* saves a **draft** (revision 1).
2. The DTR page shows daily time-in/out, recorded hours, required hours, remaining hours, **flagged (incomplete) sessions** and, separately, *Supervisor-verified hours* ("Not verified" until approved). *Download PDF* produces a printable A4 document.
3. The student **submits** the draft. While *Submitted* or *Under review* it is locked.
4. **Supervisor** opens *DTR Review* (only their own office's submitted DTRs), presses **Start review**, then **Approve** or **Return for correction** (a written reason is required).
5. A returned DTR (*Needs correction*) can be **regenerated** (adds revision 2 from the latest attendance; revision 1 is kept) or resubmitted as it is.
6. **Approval verifies only the counted hours** and locks the DTR permanently. If the DTR has flagged sessions, the supervisor must tick an acknowledgement that those sessions are *not* verified.
7. **Administrator** has a read-only *DTR Overview* and edits the *required hours per month* under *Policy Settings*.

| Status | Meaning | Who moves it on |
| --- | --- | --- |
| Draft | Generated, private to the student (supervisors cannot see drafts) | Student: submit / regenerate |
| Submitted | Waiting for the supervisor | Supervisor: start review |
| Under review | Supervisor is reviewing | Supervisor: approve / return |
| Needs correction | Returned with a reason | Student: regenerate (-> Draft) or resubmit |
| Approved | Verified and locked, never changes again | nobody |

Rules worth knowing:

- **Recorded vs verified.** A DTR snapshot contains recorded hours only. *Verified* hours are written by approval alone and only count approved DTRs; the Attendance and dashboard "Verified hours" figures are read from approved DTRs, never derived from recorded hours.
- **Nothing is silently counted.** Missing time-outs, orphan time-outs, over-length sessions and sessions still open when the DTR was made are listed as *flagged* and are not counted. (There is no separate "disputed" mechanism yet; the way to dispute is to return the DTR with a reason.)
- **Revisions are immutable.** Every generation adds a revision; revisions and the event history (who generated/submitted/started review/approved/returned, when, and the reason) are append-only, enforced by database triggers (UPDATE, DELETE and TRUNCATE are refused). Approved DTRs cannot be updated or deleted, even with SQL. A change to the required hours affects only later revisions.
- **Access.** Students: own DTRs only. Supervisors: DTRs of the office on the DTR (their own office), never their own, never drafts. Administrators: read-only. Nobody can review their own DTR (checked in the API and by a database constraint).
- **The PDF is a provisional template** and says so on every page. It is not any institution's official DTR form; replace it when the institution supplies one. The monthly DTR target is separate from semester completion requirements.
- A DTR belongs to the office the student is assigned to **when it is generated**. A student who worked in two offices in one month still gets one DTR (documented limitation).

## Absence notices, documents and compliance cases: how to use them

**Absence notices** (Student Assistant -> supervisor of their office)

1. The student opens *Absence Notices* -> *New absence notice*: type (*planned*: starts today or later; *unexpected*: starts today or earlier), first and last day, and a reason. Dates are checked on the server clock (`APP_TIMEZONE`). A notice can be up to 31 days long; these are technical limits, not institutional rules.
2. The student can attach PDF/PNG/JPEG supporting documents to the notice.
3. The supervisor of that office sees it under *Absence Notices* and can **acknowledge**, **mark reviewed** (response required) or **request follow-up** (response required). The student answers a follow-up and the notice returns to *Awaiting review*. Supervisors can also record something received **by email or in person** (a note with a date; no file).
4. The student follows the status and every response on the notice page.

> A notice is information only. "Acknowledged" and "Reviewed" **do not mean excused**. There is no "excused" field, and a notice never touches attendance, DTRs, verified hours or cases. Administrators have read-only access to notices.

**Documents.** Uploads are a raw request body (`POST .../documents?filename=letter.pdf`, no multipart). Only PDF, PNG and JPEG are accepted, decided by the file's real content *and* its extension; default maximum 5 MB (`MAX_UPLOAD_MB`), at most 10 per record (`MAX_DOCS_PER_RECORD`). Files are stored outside the web root in `UPLOAD_DIR` (default `backend/uploads/`, git-ignored) under random names with mode 0600. The API never returns a stored name or path. The **only** way to read a file is `GET /api/documents/:id/download`, which checks who is asking on every request (owner, supervisor of the record's office, or administrator; everyone else gets `403`, signed-out users `401`), is audited, and sends the file as an attachment with `nosniff` and `no-store`. Uploaded documents cannot be deleted or replaced; send a new one instead.

**Compliance cases** (administrator-run)

1. Only an **administrator** opens a case (*Compliance Cases* -> *Open a case*): student, a **case type**, period, description. Cases are never opened automatically from hours or absence notices.
2. *Case types* are configured by the administrator on the same page (name, code, list of requested documents). The two types in the demo seed are fictional placeholders, not institutional policy. A case copies its type's requested documents when it is opened; changing the type later does not change existing cases.
3. The student uploads a document for each requested item (or an administrator/supervisor records an email/in-person receipt, or an administrator **waives** it with a reason), then **submits** the case. While documents are missing the case is *Documents pending* and cannot be submitted.
4. The administrator **starts review**, then **requests a correction** (note required), **resolves** (final decision text and resolution date required) or **closes** (note required). A student answers a correction with **respond** (message required; all required documents must be present). A resolved case can be **reopened** by an administrator (reason required). *Closed* is final.
5. Supervisors of the case's office can read the case, add notes and record receipts. They cannot decide, correct, resolve or close.
6. Every step is written to the case history (who, what, when, note) and the history cannot be edited or deleted (database triggers).

| Case status | Meaning | Moves on by |
| --- | --- | --- |
| Open / Documents pending | Waiting for the student's documents | Student: submit |
| Under review | Administrator is reviewing | Admin: request correction, resolve, close |
| Needs correction | Student must fix or add something | Student: respond |
| Resolved | A decision is recorded | Admin: reopen or close |
| Closed | Final | nobody |

Limits to know about: no virus scanning of uploads, local-disk file storage (swap `backend/src/modules/documents/storage.js` for object storage when deploying), no outbound email notifications for workflow updates, a supervisor cannot make case decisions, and a case/notice stays with the office the student had when it was created.

## Dashboards and reports (Phase 6)

### Role-specific dashboards

- **Student Assistant Dashboard:** Displays today's clock-in state, selected semester's recorded and approved-DTR verified hours, assigned remaining semester hours and completion progress (or "No duty-hour requirement assigned"), recent attendance, monthly DTR status, and active notices/compliance cases.
- **Office Supervisor Dashboard:** Displays assigned student assistants, today's live office attendance overview, incomplete records requiring review, pending DTR reviews, semester requirement progress, absence notices awaiting review or follow-up, and active compliance cases in the office. Strictly scoped to the supervisor's authorized office.
- **Administrator Dashboard:** Institution-scoped metrics showing total and active users, office counts, live duty attendance, monthly DTR status, recorded vs. verified hours, semester completion progress, compliance cases, absence notices, and document submissions.

### Institutional reports and CSV export

Available to **Administrators** (all offices in their institution or filtered) and **Office Supervisors** (strictly scoped to their office) under *Reports*:
1. **Attendance Sessions:** Filter by office, student, date range (`from`/`to`), and month. Shows session time-in, time-out, duration, counted status, and flags (such as midnight crossings or over-length sessions).
2. **Recorded vs. Verified Hours:** Filter by month and office. Displays student recorded duty time, approved verified time, remaining deficit, unverified variance, and DTR status.
3. **Monthly DTR Status:** Filter by month, office, and review status (`draft`, `submitted`, `under_review`, `approved`, `needs_correction`).
4. **Outstanding Requirements:** Highlights students who have not met their monthly duty requirements, with the exact deficit and progress.
5. **Absence Notifications:** Filter by office, absence type (`planned`, `unexpected`), date range, and review status.
6. **Compliance Cases:** Filter by office, case type, date range, and status (`open`, `documents_pending`, `under_review`, `needs_correction`, `resolved`, `closed`).
7. **Semester Hours:** Filter by academic term and office. Shows each student's assigned requirement, recorded and approved verified totals, remaining hours, and completion percentage.

Every report includes pagination controls and a one-click **Export CSV** button adhering to RFC 4180.

All administrator views and actions are restricted to the administrator's institution. Reports for administrators can include all offices within that institution or a selected office.

## Semester duty-hour completion

Administrators configure their institution name and timezone, academic year, semester dates, optional deadline, and individual Student Assistant hour requirements under *Academic Terms*. Requirements are not inferred or defaulted: students without an assignment see **No duty-hour requirement assigned**. Semester reports keep each term separate; only counted sessions from approved DTR revisions contribute to verified hours. Requirement changes are audited and append a history row. Finalizing a term locks its dates and assignments so later changes cannot silently alter its historical report.

Semester totals are separate from monthly DTR generation and monthly DTR policy. Monthly DTRs continue to follow the existing month-end generation and supervisor review workflow.

## How authentication works (short version)

- Login checks the password (bcrypt), then creates a **server-side session**. The browser receives a random token in an **httpOnly, SameSite=Lax cookie** (JavaScript can't read it). The database stores only a hash of the token.
- Every request re-reads the user's role and status from the database, so a role change or a disabled account takes effect immediately.
- Permissions are enforced by the API (`requireAuth`, `requireRole`, and per-record checks). The React route guards only improve the experience; they are not security.
- Defences: login rate limit, temporary lockout after repeated failures, generic error messages, Origin check on state-changing requests, append-only audit log.

## Design system

All colors are defined once in `frontend/src/styles/index.css` (`@theme` block) and used through Tailwind names such as `bg-navy`, `text-teal`, `bg-canvas`, `border-line`, and the status pairs `ok-*`, `warn-*`, `bad-*`, `info-*`. Do not hardcode hex colors in components. Status colors are reserved for status badges and alerts.

## Security notes and known limitations

- Secrets belong in `.env` files, which are git-ignored. Only `.env.example` files are committed.
- Anything prefixed `VITE_` is public in the browser bundle.
- **Production:** set `NODE_ENV=production`, `QR_SIGNING_SECRET` (at least 32 random characters), `DATABASE_URL`, `DATABASE_SSL=true`, and `CLIENT_ORIGIN` to the exact HTTPS origin (scheme and host, no path). The API refuses to start if these requirements are missing. Database TLS certificate verification is enabled; set `DATABASE_SSL_CA` only when the database provider requires a custom CA. Production session cookies are `Secure`, `HttpOnly`, and `SameSite=Lax`. Set `TRUST_PROXY` to the number of trusted proxy hops when deployed behind a reverse proxy. If the client and API are on *different sites*, cookie settings (`SameSite`) and CORS must be reviewed; serving both from one origin is simplest.
- State-changing browser requests are checked against the configured `Origin`, in addition to `SameSite=Lax`; the app does not use a separate CSRF token. Keep `CLIENT_ORIGIN` exact and do not weaken this check.
- Login and password-reset endpoints have per-process IP rate limits and login lockout. The built-in limiter uses an in-memory store; deployments with multiple API instances should configure a shared rate-limit store before relying on limits across instances.
- Password-reset links are single-use, expire after 30 minutes, and only a token hash is stored. Reset-token verification sends the token in a POST body instead of a URL. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` to send email. In production, reset requests do not create undeliverable tokens when SMTP is missing; the page tells the user to contact an administrator. Development may return a reset URL for testing.
- Run tests only with a separate `TEST_DATABASE_URL` whose database name contains `test` and differs from `DATABASE_URL`; the test helper drops and recreates its schema. Never use the production Supabase URL for tests.
- **Uploaded documents are sensitive.** They are private and access-checked, but there is no virus scanning, no encryption at rest beyond what the disk provides, and no retention/deletion policy yet. Institutional data-privacy review (open question 8 and 11) must happen before real student documents are stored.
- Not yet implemented: attendance corrections (a returned DTR cannot fix attendance by itself; corrections need their own auditable records), partial approval, email verification, multi-factor authentication, outbound workflow email, admin forms for creating users in the UI (the API supports it).
- This is a development build. It has not had a security review and must not be called production-ready.

## Roadmap

See [docs/development-plan.md](docs/development-plan.md).

# Architecture (through Phase 5)

## Overview

```
Browser (React + Vite, :5173)
   │  /api/*  (Vite dev proxy → same origin for the browser, so cookies just work)
   ▼
Express API (:4000) ──► PostgreSQL (local, or Supabase) via node-postgres (pg)
```

- **Monorepo, npm workspaces.** `frontend/` and `backend/` share one `npm install` and root scripts.
- **Server** separates `createApp()` in `app.js` from `server.js` (which opens the port), so tests build the app without a fixed port. Feature code lives in `src/modules/<feature>/`.
- **Response shape** is always `{ success, data }` or `{ success: false, error }`. One error handler; unknown errors are logged server-side and hidden from clients in production.
- **Validation:** Zod schemas at the edge of each route (`utils/validate.js` turns failures into field-level 400s).
- **SQL safety:** every query uses `$1, $2…` placeholders. Multi-step changes (and their audit rows) run in one transaction.

## Decision: `pg` + SQL migrations instead of Prisma

Prisma was the original plan. Prisma's CLI downloads engine binaries from `binaries.prisma.sh`; in the environment used for Phase 2 that host was blocked (HTTP 403), so `prisma generate` and `prisma migrate` could not run, and nothing built on them could be verified.

Trade-offs of the replacement:

| | `pg` + SQL files (chosen) | Prisma |
| --- | --- | --- |
| Verified in our environment | Yes | No |
| Learning curve | You write SQL (useful for a database-heavy capstone) | Schema DSL + generated client |
| Type safety / autocomplete | None (plain JS) | Strong |
| Constraints like partial unique indexes, triggers | Written directly in SQL | Need raw SQL in migrations anyway |
| Provider lock-in | None (plain PostgreSQL) | None |

If you later want Prisma, `database/migrations/` can be introspected (`prisma db pull`) on a machine with normal internet access. That is a deliberate future option, not a Phase 2 deliverable.

Migrations: `backend/src/db/migrate.js` applies `database/migrations/NNNN_name.sql` in order, each in a transaction, under an advisory lock, recording name + SHA-256 checksum in `schema_migrations`. Editing an applied file is refused.

## Decision: authentication

Chosen: **server-side sessions in an httpOnly cookie**, with our own password check (bcrypt, cost 12).

| Option | Verdict |
| --- | --- |
| **Server sessions + httpOnly cookie** | **Chosen.** Token unreadable by JavaScript (limits XSS damage); instantly revocable (logout, disable user); fits one Express API. Needs CSRF care → `SameSite=Lax` + `Origin` check. |
| JWT in browser storage | Rejected: readable by injected scripts, hard to revoke. |
| Supabase Auth | Not used now. Avoids storing passwords, but ties login to one provider and the roles/office logic still lives in our DB. It remains a possible later swap because the rest of the app only depends on `req.user`. |

Details:

- `sessions.token_hash` stores SHA-256 of a 32-byte random token; a leaked database does not yield usable sessions.
- `loadSession` middleware runs on every request and reads the user, role and **current office** from the database, so role changes and account disabling apply immediately.
- Guards: `requireAuth`, `requireRole(...)`, plus per-record checks (a user may read only their own record; a supervisor may list assistants only for their own office). Changing IDs in URLs is covered by tests.
- Login hardening: per-IP rate limit; account lockout (5 failures → 15 min); one generic error message for unknown email / wrong password / disabled / locked; bcrypt comparison always executed so timing doesn't reveal valid emails.
- Everything security-relevant is written to the append-only `audit_logs`.

## Decision: QR attendance (Phase 3)

**Codes.** Each office has at most one valid QR code. Its payload is `DT1.<code-id>.<signature>` where the signature is HMAC-SHA256 of the id with `QR_SIGNING_SECRET`. A forged or edited code fails the signature check; a genuine but replaced code fails the database check (`revoked_at`). Because the payload is derived rather than stored, admins can re-display and print any active code, and a database leak does not reveal usable codes (an attacker would also need the server secret).

**Why not rotating codes?** Short-lived codes shown on a screen are stronger against remote scanning, but need a display at each office and a polling UI. You asked for generate/regenerate/revoke, so static codes with revocation are implemented, with the limitation documented in the README. Rotation can be added later without changing the scan API: only how the payload is produced and validated.

**Scan rules** (`attendance.service.js`), inside one transaction:
1. payload is genuine and its code is not revoked;
2. the user is assigned to *that code's* office;
3. an advisory lock on the user serializes their scans, so double taps / two devices cannot both pass the next check (a stress test of 25 parallel requests × 5 rounds fails without the lock and passes with it);
4. the action fits the user's state (no double time-in, no time-out without time-in);
5. the event is inserted with the database clock, the signed-in user's id, the QR code id, IP and user-agent, plus an audit row. Refused scans are audited too.

**Calculation** is a pure module (`calc.js`) with no database access, so every rule is unit-tested. Events are append-only (database trigger); corrections will be separate records.

**Verified vs recorded.** The API returns `verifiedHours` and `verificationAvailable` next to `recordedHours`. They are different concepts and are never derived from each other: verified hours come only from an **approved** DTR (Phase 4) and are `0` / `false` otherwise.

## Decision: monthly DTR (Phase 4)

**Snapshots, not live totals.** Generating a DTR calls the same attendance calculation as the history screens and stores the result as an immutable `dtr_revisions` row (daily sessions, flagged sessions, totals, the required-hours value used, timezone). What a supervisor reviews and approves is therefore exactly what was stored, even if attendance or policy changes later. Regenerating while a DTR is a draft (or was returned) adds revision N+1; nothing is overwritten. Revisions and `dtr_events` are append-only via triggers.

**Month-end rule.** `isMonthEnded(month, now, tz)` (pure, unit-tested) compares `YYYY-MM` with the current month in `APP_TIMEZONE`, using the database clock. The month ends at *local* midnight, not UTC midnight (tested at the boundary instant). Preview and generate both refuse the current and future months.

**State machine** (`dtr.rules.js`, mirrored by a database trigger as defence in depth):

```
draft --submit--> submitted --start-review--> under_review --approve--> approved (terminal, locked)
  ^                                                  |
  |                                                  +--return(reason)--> needs_correction
  +------------- regenerate (new revision) ------------------------------------+   |
                       submitted <------------------ resubmit ---------------------+
```

Every transition runs in one transaction that locks the DTR row (`SELECT ... FOR UPDATE`), so simultaneous approvals produce exactly one approval (tested with 6 parallel requests). Generation takes a per-user-per-month advisory lock (6 parallel generates give revisions 1..6 with no gaps or duplicates).

**Verified hours.** Approval is the only code path that writes `verified_seconds`, and it copies the *counted* seconds of the reviewed revision. Incomplete sessions are never counted; approving a DTR that has flagged sessions requires an explicit acknowledgement (`409 INCOMPLETE_NOT_ACKNOWLEDGED` otherwise). The attendance endpoints read verified hours from approved DTRs only.

**Access** is decided in one function (`assertCanView`): students their own, supervisors only DTRs whose office is their own current office (never their own DTR, never drafts), administrators read-only. Unknown and forbidden ids look the same (`403`). Self-review is blocked in the API (`SELF_REVIEW`/`FORBIDDEN`) and by a CHECK constraint.

**PDF** is rendered server-side with `pdfkit` (`dtr.pdf.js`): A4, mostly white, navy headings, teal rule, repeating table header, page numbers, DTR id and revision in the footer. It is labeled *provisional template, not the institution's official form* on every page and states "not verified" unless the rendered revision is the approved one. It was checked visually (rendered to images) and by tests for headers, `%PDF` signature, access control and pagination.

## Decision: absences, documents and cases (Phase 5)

- **A notice is a record plus a conversation, nothing more.** There is no "excused" flag and nothing reads absence notices when computing hours, DTRs or cases. Each institution must configure its own absence policy; the software does not decide whether an absence is excused.
- **Cases are opened only by an administrator** and never from hours or notices. Case types and their requested documents are configuration; each case copies the type's list when opened so later edits do not rewrite a case in progress.
- **Rules live in two places on purpose.** Pure functions (`absences.rules.js`, `cases.rules.js`) define the allowed status moves and are unit-tested; database triggers enforce the same moves so SQL run outside the API cannot break them.
- **One access function.** `modules/common/access.js` (`assertCanView`) decides who may see a notice, case or document (owner, supervisor of the record's office, administrator). Unknown and forbidden ids both return `403` so ids cannot be probed.
- **Documents are private.** Files go to `UPLOAD_DIR` under random names (mode 0600), outside any static route. The type is decided from the file's magic bytes and must agree with the extension (PDF/PNG/JPEG). A failed or refused upload removes the file from disk. The one read path, `GET /api/documents/:id/download`, re-checks access every time, writes an audit entry and forces download with `nosniff`, `no-store` and a sandbox CSP. `storage.js` is the only file that touches the disk, so moving to object storage means replacing that file.
- **Uploads are raw bodies** (`express.raw`, file name in `?filename=`), which avoids a multipart parser dependency.
- **Emails are recorded, not read.** Staff record "received by email / in person" receipts by hand. There is no Gmail integration.
- **History is append-only** (events and documents), reusing the Phase 4 trigger functions.

## Decision: semester transitions

- `semester_transitions` stores an institution-scoped preview, the policy snapshot, source fingerprint, decision status and actor timestamps. A unique source/destination pair prevents duplicate transitions; `semester_transition_students` snapshots each explicitly selected student's source balance, destination target, and review issues.
- The only configured policy is `keep_original`. It requires an administrator to select continuing students, preserves source verified and remaining hours, and leaves destination requirements unchanged. It never carries old hours forward. A null policy blocks previews. Destination requirements must be configured separately before a student is eligible.
- Preview/finalization recheck term ownership/order, policy, hours, DTRs, incomplete attendance, destination targets and recovery requests. Finalization requires the source end date to have passed, rejects stale fingerprints, blocks institution-wide open DTR/recovery/incomplete-attendance reviews, and closes the source term and transition atomically. It does not rewrite attendance, DTRs, schedules or requirement assignments.
- There is no enrollment/continuation status or explanation-letter workflow. The administrator's explicit student selection is the continuation confirmation; unsupported explanation statuses are reported as unavailable rather than inferred.

## Frontend

- `AuthProvider` (`hooks/useAuth.jsx`) asks `GET /auth/me` on load; `RequireRole` redirects visitors to `/login` or to their own dashboard. These guards are convenience only; the API is the real gate.
- Pages that exist as real features show real data; everything else is labeled ("Sample data" cards, "Planned: Phase N" pages).

## Known limitations

- No password change/reset, email verification or MFA yet.
- No CSRF token; relies on `SameSite=Lax` + `Origin` check (adequate when the client and API share a site).
- No session cleanup job (expired rows stay in `sessions` until a future maintenance task).
- Administrators can create users and offices and assign offices in the UI; there is no password reset and no editing of names or emails yet.
- Static QR codes do not prove physical presence (see README). No attendance corrections yet, so a returned DTR can only be regenerated from the same attendance or resubmitted.
- A DTR belongs to the office the student is assigned to at generation time; a month split between two offices is not modelled.
- The PDF uses the built-in Helvetica font (Latin-1). Accented Latin names print correctly; characters outside Latin-1 (e.g. CJK) print as `?` rather than as garbage. The on-screen DTR is exact.
- The scanner depends on a camera and a secure context (HTTPS or localhost); a paste-the-code fallback exists.
- Unit/integration tests cover auth and permissions; there are no frontend tests yet (the UI was checked with a scripted browser session, which is not part of the repo).
- Phase 5: uploads have no virus scanning, are stored on local disk and cannot be deleted; no Gmail/email integration or notifications; supervisors cannot decide cases; administrators read absence notices (privacy decision pending); the browser checks of Phase 5 were a scripted session that is not part of the repo.

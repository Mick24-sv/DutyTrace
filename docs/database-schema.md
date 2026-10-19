# Database Schema (migrations 0001 onward)

Source of truth: `database/migrations/*.sql`.

```
offices 1───* duty_assignments *───1 users 1───* sessions
                     │                   │
                     │                   ├───* audit_logs (actor_id)
offices 1───* attendance_events *────────┘
offices 1───* office_qr_codes 1───* attendance_events (qr_code_id)

users 1───* monthly_dtrs *───1 offices          (one DTR per user per month)
monthly_dtrs 1───* dtr_revisions                 (immutable snapshots)
monthly_dtrs 1───* dtr_events                    (immutable who/what/when history)
institution_dtr_policies                         (one monthly DTR policy per institution)

institutions 1───* users, offices, academic_terms, case_types, institution_dtr_policies
users 1───* notifications *───1 institutions             (recipient-scoped inbox)
academic_terms 1───* semester_requirement_assignments *───1 users
semester_requirement_assignments                 (append-only target history)

users 1───* absence_notices *───1 offices        (office at submission)
absence_notices 1───* absence_events             (append-only history)
users 1───* compliance_cases *───1 offices *───1 case_types   (office at creation)
compliance_cases 1───* case_requirements, case_events
documents *───1 absence_notices  XOR  compliance_cases   (+ optional case_requirement)
```

| Table | Purpose | Key rules |
| --- | --- | --- |
| `users` | Accounts for all three roles | Unique lowercase email (CHECK enforces lowercase); `role` and `status` are enums; bcrypt `password_hash`; lockout columns |
| `offices` | Offices where SAs and supervisors are assigned | Unique lowercase `code` per institution; `is_active` |
| `duty_assignments` | Which office a user currently belongs to, with history | Partial unique index: **at most one open (`ends_on IS NULL`) assignment per user**; `ends_on >= starts_on`; ending an assignment sets `ends_on`, never deletes |
| `sessions` | Server-side login sessions | Stores SHA-256 **hash** of the cookie token; `expires_at`, `revoked_at` |
| `audit_logs` | Append-only record of important actions | Triggers block `UPDATE`, `DELETE` and `TRUNCATE`; before/after stored as JSON (never passwords) |
| `office_qr_codes` | One row per issued QR code (0002) | Partial unique index: **one non-revoked code per office**. The printable payload is *not stored*; it is an HMAC of the row id (see architecture.md). Rows are never deleted |
| `attendance_events` | Every time-in / time-out (0002 adds `seq`, `qr_code_id`, `ip_address`, `user_agent`) | `recorded_at` defaults to the database clock; the API accepts no timestamp. **Append-only:** a trigger blocks UPDATE and DELETE. `seq` orders events with equal timestamps. Traceable to the QR code scanned |
| `policy_settings` | Legacy single-row monthly target source (0003) used to initialize per-institution monthly DTR policies | Retained for migration compatibility; new policy updates use `institution_dtr_policies` |
| `institutions` | Tenant boundary, display name and default IANA timezone (0008) | Users, offices, academic terms, case types and monthly DTR policies are institution-scoped; administrator APIs are scoped to the signed-in administrator's institution |
| `academic_terms` | Institution-specific academic year, semester, date range, deadline and timezone (0008) | Term ranges cannot overlap within an institution; finalization freezes the calendar and prevents later requirement changes |
| `semester_requirement_assignments` | Individual required hours and office assignment for one student and term (0008) | Immutable version rows; each change preserves the previous assignment, validated to keep the term, student and office within one institution |
| `institution_dtr_policies` | Monthly DTR target and optional review SLA (0009, 0011) | One policy per institution; review SLA is nullable and from 1–720 hours; semester requirements are individually assigned |
| `notifications` | In-app notifications (0011) | Recipient and institution scoped; unique `(recipient_id, dedupe_key)` prevents duplicate event/reminder notifications; nullable `read_at` tracks unread state |
| `monthly_dtrs` | One DTR per (user, month) (0003) with `status` (`dtr_status` enum), `current_revision`, `office_id` (office at generation) | `UNIQUE (user_id, month)`. `verified_seconds` is **only** allowed when `status = 'approved'` (CHECK) and is required then. `decided_by <> user_id` (CHECK, no self-decision). A trigger refuses: DELETE, TRUNCATE, any change to an approved row, changing owner/month, and invalid status moves (`draft->submitted`, `submitted->under_review`, `under_review->approved/needs_correction`, `needs_correction->draft/submitted`) |
| `dtr_revisions` | Frozen JSON snapshot of each generation (0003): daily sessions, flags, totals, required hours used, timezone | `UNIQUE (dtr_id, revision_no)`. **Append-only**: triggers block UPDATE, DELETE and TRUNCATE (0004). Contains recorded hours only, never verified hours |
| `dtr_events` | History (0003): `generated, regenerated, submitted, review_started, approved, returned` with actor, from/to status, `reason`, time | **Append-only** like revisions. CHECK: a `returned` event must have a non-blank reason |
| `absence_notices` | A student's notice of absence (0005) | Office, dates, reason and server `submitted_at` are fixed at submission. CHECKs: end >= start, span <= 30 days past the start, no self-response. A trigger blocks DELETE, changes to submitted details and invalid status moves (`pending -> acknowledged/reviewed/needs_follow_up`, `acknowledged -> reviewed/needs_follow_up`, `needs_follow_up -> pending/reviewed`; `reviewed` is final). **No excused column exists** |
| `absence_events` | History of a notice | Append-only (UPDATE, DELETE, TRUNCATE blocked) |
| `case_types` | Admin-configured kinds of case (0005, scoped by 0010) | Unique lowercase `code` per institution; `required_documents` is a JSON array of labels; `is_active` |
| `compliance_cases` | A case about one student (0005) | Reference `CC-YYYY-NNNNNN` from `case_reference_seq`; office and type fixed at creation. CHECKs: `resolved` needs a decision, resolver is not the student. A trigger blocks DELETE, any change to a closed case, identity changes and invalid status moves |
| `case_requirements` | Documents a case asks for, copied from the type when opened | Satisfied by a document, a recorded receipt or a one-time waiver with a reason; no deletes |
| `case_events` | History of a case (who, what, note, when) | Append-only |
| `documents` | One row per uploaded file or manual receipt (0005) | Belongs to exactly one notice **or** one case (CHECK). `online` rows have a stored file, `uploaded_by = owner`; `email`/`in_person` rows have a received date and recorded-by staff, no file. Stores a random `stored_name` and SHA-256, never returned by the API. Append-only |
| `institution_duty_requirement_settings` | Configurable institution defaults for new duty policies | Minimum daily hours is configurable; new institutions default to 3 hours/day unless changed |
| `duty_requirement_policies` | Term-specific institution, office or individual rules | Effective dates must fit the term; same-scope policies cannot overlap; minimum/maximum daily caps are checked; total term hours may be omitted when assigned per student under Academic Terms; individual exceptions are created by an authorized administrator and audited; an explanatory note is optional |
| `student_duty_schedules` | Versioned SA preference proposals and reviewer decisions | Status transitions are constrained; reviewer, decision time, reason and optional alternative times are retained; office and institution are checked server-side |
| `student_duty_schedule_days` | Weekly duty preference intervals for a schedule version | One row per ISO weekday with a required morning interval and optional non-overlapping afternoon interval; overnight intervals are unsupported |
| `schema_migrations` | Created by the migration runner | Name + checksum of applied files |

## Conventions

- Primary keys are UUIDs (`gen_random_uuid()`), except `audit_logs` (bigserial, naturally ordered).
- Timestamps are `timestamptz` (stored in UTC). Semester ranges use the IANA timezone stored on each academic term. Monthly DTR boundaries use the existing configured timezone (`APP_TIMEZONE`). `monthly_dtrs.month` is a text `YYYY-MM` in that timezone.
- Foreign keys use `ON DELETE RESTRICT` for records that must stay traceable (assignments, attendance) so a user or office with history can't be deleted by accident.
- Derived totals (hours) are intentionally **not stored** for attendance; they are calculated from `attendance_events` on every request (`backend/src/modules/attendance/calc.js`). Events are the single source of truth. A DTR is different on purpose: it is a **frozen snapshot** (what the supervisor actually reviewed), stored in `dtr_revisions`, so later changes to attendance or policy never rewrite what was approved. `monthly_dtrs.verified_seconds` is the only stored verified figure and approval is the only thing that writes it.
- Never edit an applied migration; add the next numbered file (e.g. `0003_….sql`). The runner stores a checksum and refuses edited files.

Duty requirement precedence is student exception, office policy, then institution policy. An existing per-student `semester_requirement_assignments` total remains authoritative unless an explicit student exception overrides it. Approved preferences are for monitoring only and do not authorize or block attendance scans. Monthly DTR revisions and finalized academic terms remain unchanged by later policy edits.

## Not yet in the schema

`attendance_corrections` (the append-only trigger means fixes must be new records, not edits), `office_calendar_events`.

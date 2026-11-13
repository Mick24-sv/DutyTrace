# DutyTrace database

The PostgreSQL schema runs on Supabase. The Express backend accesses it through a trusted server connection; browser clients use the authenticated application API.

## Where things belong

| Location | Purpose |
| --- | --- |
| `migrations/` | Ordered, immutable schema history; the source of truth |
| [Schema guide](../docs/database-schema.md) | Table purposes, relationships, and preservation rules |
| [Review findings](../docs/database-review.md) | Read-only inventory and cleanup recommendations |
| `../backend/scripts/review-database.mjs` | Regenerates the schema/count/storage review |
| `schema-review.json` | Generated local metadata; ignored by Git; no record bodies or credentials |
| `../backend/src/db/migrate.js` | Applies migrations and verifies checksums |
| `../backend/src/db/createAdmin.js` | Legacy institution-admin bootstrap |
| `../backend/scripts/setup-superadmin.ps1` | Separate platform maintainer bootstrap |

## Migration catalog

| Range | Feature area |
| --- | --- |
| 0001–0006 | Accounts, offices, QR attendance, DTRs, absences, cases, documents, initial requirements |
| 0007–0010 | Password recovery, institutions, terms, semester requirements, institution policies |
| 0011–0019 | Notifications, duty preferences, time windows, daily limits, office capacity, audit scope, forecasts |
| 0020–0021 | Dated recovery plans and semester transitions |
| 0022–0025 | Attendance discrepancies, risk alerts, policy templates, notification access |
| 0026–0029 | Historical credits, validation fixes, adjustment ranges, supervisor amendments |
| 0030–0032 | Student profiles, photos, session verification |
| 0033–0035 | Concerns, access hardening, function search paths |
| 0036–0038 | Account archiving, absence acknowledgment, per-user concern inbox actions |
| 0039–0040 | Personal agendas and tutorial progress |
| 0041–0042 | Superadmin role and institution invitations |
| 0043–0044 | Verified email changes and private problem reports |
| 0045 | Backend-only application table, sequence, and trigger-function access |
| 0046 | Private per-account appearance preferences |

Apply changes from the repository root with `npm.cmd run db:migrate`.

Never rename, merge, delete, or edit an applied migration. Add a new numbered migration for corrections. Old files are required for fresh-database reproduction and checksum verification.

## Review without changing live data

Run `node backend/scripts/review-database.mjs`. It uses a read-only transaction to inspect table counts, backend references, indexes, constraints, trigger attachments, migration checksums, expired authentication rows, test-data naming patterns, and storage metadata. It checks local file existence without opening document contents. Only the generated local JSON report is written.

Empty tables and zero index-scan counts do not establish that objects are safe to remove. Some workflows are optional, and official history is intentionally retained.

## Access and preservation

Application tables use RLS without browser policies, and public Supabase client roles have no direct application-table privileges. Keep storage private and apply future migrations through the trusted database owner.

Do not delete audit trails, attendance events, approved DTR snapshots, requirement versions, historical credits, or document references for cosmetic cleanup. Authentication cleanup needs a retention rule; missing files need investigation or recovery.

See [institution onboarding](../docs/institution-onboarding.md), [problem reports](../docs/problem-reports.md), and [security hardening](../docs/security-hardening.md).

# Database

PostgreSQL schema for DutyTrace (works on Supabase). `migrations/` holds numbered SQL files applied in order by `npm run db:migrate` (runner: `backend/src/db/migrate.js`). Never edit a migration that has been applied; add the next number instead. The runner stores a checksum and refuses edited files.

| File | Adds |
| --- | --- |
| `0001_*` | users, offices, duty assignments, sessions, append-only audit log |
| `0002_*` | office QR codes, attendance events (append-only) |
| `0003_*` | monthly DTRs, immutable revisions and history, policy settings |
| `0004_*` | TRUNCATE guards |
| `0005_*` | absence notices, documents, case types, compliance cases, requirements, history |

No seed data is included. Create the first administrator with `npm run db:create-admin`. Table-by-table description: [../docs/database-schema.md](../docs/database-schema.md).

On Supabase, enable Row Level Security on these tables (no policies) so the public Supabase API cannot read them; the backend connects directly and is unaffected.

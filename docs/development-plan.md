# Development Plan

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Foundation: monorepo, design system, app shell, demo dashboards, health check | Done (see README) |
| 2 | Database schema and SQL migrations (`pg`; see architecture.md for why not Prisma), authentication, RBAC, safe seed data, permission tests | Done |
| 3 | QR attendance (signed, revocable office codes), state validation, recorded-hour calculation, history, supervisor view, admin QR management | Done (see README). Rotating codes and corrections are not included |
| 4 | Monthly DTR: month-end eligibility, generation, review/approval (this is where *verified* hours come from), immutable revisions and history, provisional-template PDF; monthly DTR policy | Done (see README). Institution-specific official form, partial approval and attendance corrections are not included |
| 5 | Absence notices, private document uploads, administrator-run compliance cases with correction/resolution history | Done (see README). No Gmail integration, notifications, virus scanning or automatic compliance decisions |
| 6 | Role dashboards with real data, institutional reports, filters and CSV export | Done (see README) |
| Correction | Institution-scoped academic terms and individual semester duty-hour requirements, without changing monthly DTR generation | Implemented alongside the existing phases; not Phase 7 |
| 7 | Polish, automated edge-case test suite, accessibility, deployment docs | Next |

Rule: do not start a phase while the previous one is broken.

# Security hardening review

This is a targeted code/configuration review with regression checks, not a complete penetration test or a guarantee against compromise. API URLs and browser-delivered JavaScript are visible to users by design; authorization and secret handling protect the records behind those URLs.

## Changes made

- Updated the locked dependencies to patched `body-parser` 1.20.9 and Vite 6.4.6. The npm advisory audit reported zero known vulnerabilities after the update, including development dependencies. Future advisories may change that result.
- Made login-failure counting atomic and rechecked active status, lockout state, and password hash under a database row lock before issuing a session. This blocks sessions based on password checks that became stale during a password change or account disable.
- Reject malformed session cookies before database lookup. Cookie attributes remain HttpOnly, Secure in production, SameSite=Lax, and host-scoped. Session values remain hashed in storage.
- Reject cross-site browser mutations using Fetch Metadata in addition to the existing exact-Origin checks. Production requests carrying a session cookie still require an Origin for mutations. Server-to-server scheduler requests continue using their separate credential.
- Added fixed-size, timing-safe scheduler-secret comparisons. Requests without the credential fail before starting jobs.
- Added API no-store/no-referrer headers and disabled compressed request-body inflation for JSON and raw uploads. Oversized and unsupported compressed bodies produce bounded, safe errors.
- Reject new passwords above bcrypt's 72-byte limit rather than silently truncating them. Existing credentials retain their original verification behavior.
- Added frontend production CSP, anti-framing, anti-sniffing, referrer, HTTPS, and permissions headers in `frontend/vercel.json`. Camera access remains available to the same-origin QR workflow; microphone and geolocation are disabled. The CSP allows inline styles required by the existing UI/motion but does not allow inline scripts or eval.
- Restricted the Vite development file-serving scope and explicitly denied backend, database, script, Git, environment, and key files. Development servers bind to localhost by default and are not production hosting.
- Applied migration `0045_backend_only_database_access.sql` to remove residual Supabase public-client grants on application tables, sequences, and application trigger functions. Existing records and trusted backend ownership were preserved. Default table/sequence privileges for future migrations by the same database owner were restricted too.

## Verified evidence

- 106 frontend, rules, and security tests passed, including anonymous rejection across 15 private endpoints, forged Origin and cross-site requests, malformed cookies, compressed/oversized bodies, scheduler authorization, and safe errors.
- Rollback-only login checks verified successful login, password/disable races, parallel failed attempts, and lockout without changing real accounts.
- All 55 application tables have RLS enabled and no permissive policies. Public `anon` and `authenticated` roles have no application-table privileges; direct user-table reads fail with insufficient privilege. Before hardening, some grants remained, but RLS with no permissive policies was already preventing direct data reads. This was not evidence of an existing data leak.
- The configured Supabase project had one storage bucket and no public buckets at review time.
- The secret-exposure check found no configured secret values in the scanned source/build files, no tracked real environment files, and no production source maps. Git filename history showed no real `.env` files committed. This does not prove that every credential, encoding, external log, or historical source file is safe.
- The production build passed. A local browser test applied the production headers to the built app and verified the login, lazy-loaded GSAP transition, and superadmin dashboard with no CSP violations. API responses were mocked; this did not sign into a real account.

## Deployment steps and remaining work

1. Restart development servers to load patched packages. Do not expose Vite directly to the public internet.
2. Deploy the updated backend and frontend. Vercel header configuration and backend middleware changes do not update existing cloud deployments merely because files changed locally. The database migration is already applied to the configured Supabase database.
3. Confirm the deployed backend uses `NODE_ENV=production`, an exact HTTPS `CLIENT_ORIGIN`/`APP_URL`, verified database TLS, correct proxy-hop configuration, private durable document storage, and independent long QR/scheduler credentials. Do not put database, mail, Supabase service, or signing credentials in `VITE_` variables.
4. Verify live response headers and authorization after deployment. Apply CDN/WAF abuse controls and infrastructure monitoring; in-process rate limiting is not distributed DDoS protection.
5. Use MFA on GitHub, Supabase, hosting, and email accounts. In-app MFA for maintainers/admins remains a separate implementation; this review did not silently enroll users or change their passwords.
6. Maintain backups and test restoration, review account access regularly, and rotate any credentials known to have been disclosed. No existing keys were rotated during this review, so printed office QR codes and scheduled jobs were not unexpectedly invalidated.
7. Before expanding to multiple schools, arrange an independent assessment covering authenticated cross-institution workflows, file handling, infrastructure, and recovery. Full database-reset integration tests were not run against the live database; only rollback-safe checks were used there.

## Repeatable checks

```powershell
npm.cmd audit
npm.cmd run build
node --test frontend/tests/*.test.js backend/tests/*rules*.test.js backend/tests/security-*.test.js backend/tests/semester-status.test.js backend/tests/platform-account.test.js backend/tests/problem-reports.test.js
node backend/scripts/check-secret-exposure.mjs
node backend/scripts/check-database-boundary.mjs
node backend/scripts/check-login-security.mjs
node backend/scripts/check-browser-policy.mjs
```

The database-boundary script expects Supabase public client roles and permission to switch into them inside a rollback transaction. The browser-policy script currently expects Microsoft Edge installed at its standard Windows path and uses only fake local API responses.

Guidance: [Express production security](https://expressjs.com/en/advanced/best-practice-security/), [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). Patched advisories: [request parser](https://github.com/advisories/GHSA-27r3-jxmh-p828), [Vite](https://github.com/advisories/GHSA-8g5g-mxqh-grgj).

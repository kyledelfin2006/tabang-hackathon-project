# Verification: FEAT-002

Created: 2026-10-21T11:18:00+08:00
Updated: 2026-10-21T11:51:00+08:00

Environment for every row unless stated: Windows 11 dev machine, Node 24.14.0, Docker 29.7.2, Docker Compose 5.4.0, worktree `../Project_Tabang-integration` on `feat-002/render`, local untracked `.env` never staged.

| Requirement / phase | Check or scenario | Environment and conditions | Actual result | When run | Evidence / limitations |
| --- | --- | --- | --- | --- | --- |
| Phase 1, D-24 | Install `pg` dependency | `npm install pg@^8.23.1` | Passed under stated conditions: installed `pg@8.23.1` and `pg-pool@3.14.0`. | 2026-10-21T11:05:53+08:00 | Verified with `npm list pg`. |
| Phase 1, REQ-001 | Local Postgres Compose service | `compose.yaml` with `postgres:17` on `127.0.0.1:54329`, named volume `tabang_pg_data`, health check `pg_isready -U postgres -d tabang` | Passed under stated conditions: container starts and reports healthy. | 2026-10-21T11:07:17+08:00 | Tested with `docker compose up -d --wait`. |
| Phase 1, REQ-001 | `npm run db:start` and `npm run db:reset` | Local Postgres container running | Passed under stated conditions: `db:start` reports Healthy; `db:reset` drops and recreates `public` schema and applies 5 migrations. | 2026-10-21T11:15:55+08:00 | Database builds from nothing with no manual step. |
| Phase 1, REQ-001, REQ-002 | `npm run test:integration` | Local Postgres container running, 11 tests in `tests/integration/` | Passed under stated conditions: 11 of 11 tests pass (migrations runner fresh migration, second run no-op, broken migration fails and records nothing; function-level claim, transition, verify, cancel, incident_counts, submit/decide application, role upgrade, hotline directory rating view; transitionParity; pg imported only in `server/db.mjs`). | 2026-10-21T11:16:05+08:00 | Duration 941ms. |
| Phase 1 | `npm run lint` | ESLint across `src`, `server`, `scripts`, `tests` | Passed under stated conditions: exit 0, no errors or warnings. | 2026-10-21T11:16:49+08:00 | Initial `no-useless-assignment` in `migrate.mjs` fixed. |
| Phase 1 | `npm run test:unit` | vitest unit suite | Passed under stated conditions: 24 files, 240 of 240 tests pass. | 2026-10-21T11:16:35+08:00 | Unchanged behavior. |
| Phase 1 | `npm run test:server` | node --test server suite | Passed under stated conditions: 33 of 33 tests pass. | 2026-10-21T11:16:35+08:00 | Unchanged behavior. |
| Phase 1 | `npm run db:stop` | Docker Compose stack | Passed under stated conditions: container and network removed cleanly. | 2026-10-21T11:17:00+08:00 | Stack stopped after checks. |
| Phase 2, REQ-003, REQ-004, REQ-005, REQ-008 | `npm run test:server` | In-memory store, 40 tests in `tests/server/` | Passed under stated conditions: 40 of 40 tests pass, including new session routes, rate limiting, csrf origin/content-type checks, and password reset. | 2026-10-21T11:34:58+08:00 | Verified with `tests/server/session.test.mjs`. |
| Phase 2, REQ-003 to REQ-006, REQ-008 | `npm run test:integration` | Local Postgres container running, 16 tests in `tests/integration/` | Passed under stated conditions: 16 of 16 tests pass, including `accounts.test.mjs` covering sign-up, scrypt password hashing, session cookies, rate limiting, password reset token single use and revocation of active sessions, immediate role reflection, and cross-site write prevention. | 2026-10-21T11:34:51+08:00 | Duration 1.65s. |
| Phase 2 | `npm run lint` | ESLint across `src`, `server`, `scripts`, `tests` | Passed under stated conditions: exit 0, no errors or warnings. | 2026-10-21T11:35:07+08:00 | Clean. |
| Phase 2 | `npm run test:unit` | vitest unit suite | Passed under stated conditions: 24 files, 240 of 240 tests pass. | 2026-10-21T11:35:24+08:00 | 0 regressions. |
| Phase 3, REQ-007, REQ-014, REQ-015 | `npm run test:integration` | Local Postgres container running, 26 tests in `tests/integration/` | Passed under stated conditions: 26 of 26 tests pass, including `appReports.test.mjs`, `appIncidents.test.mjs`, `appFeed.test.mjs`, `appHotlines.test.mjs`, `appApplications.test.mjs`, and `partnerApi.test.mjs` covering all app data routes, role boundaries, database functions, and partner contract behavior. | 2026-10-21T11:49:43+08:00 | Duration 4.49s. |
| Phase 3, REQ-015 | `git diff f8e08d8 -- docs/api/openapi.json` | git diff against f8e08d8 | Passed under stated conditions: 0 changes to openapi.json. | 2026-10-21T11:49:50+08:00 | OpenAPI contract unchanged. |
| Phase 3 | `npm run test:server` | node --test server suite | Passed under stated conditions: 40 of 40 tests pass. | 2026-10-21T11:49:58+08:00 | Health check with DB ping verified. |
| Phase 3 | `npm run lint` | ESLint across `src`, `server`, `scripts`, `tests` | Passed under stated conditions: exit 0, no errors or warnings. | 2026-10-21T11:50:31+08:00 | Clean. |
| Phase 3 | `npm run test:unit` | vitest unit suite | Passed under stated conditions: 24 files, 240 of 240 tests pass. | 2026-10-21T11:50:49+08:00 | 0 regressions. |

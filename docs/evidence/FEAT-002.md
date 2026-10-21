# Verification: FEAT-002

Created: 2026-10-21T11:18:00+08:00
Updated: 2026-10-21T11:18:00+08:00

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

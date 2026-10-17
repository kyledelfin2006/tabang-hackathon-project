# Verification: FEAT-001

Earlier results for A1, A2, and C1 are in [FEAT-001-track-a.md](FEAT-001-track-a.md) and [FEAT-001-track-c.md](FEAT-001-track-c.md); Revision 1's B1 results are on `archive/feat-001-b1-firestore-rules`.

Created: 2026-10-17T22:33:38+08:00
Updated: 2026-10-17T22:33:38+08:00

Environment for every row unless stated: Windows 11 dev machine, Node 24.14.0, Docker 29.7.2, Supabase CLI 2.121.0 from the dev dependency, worktree `../Project_Tabang-integration` on `feat-001/integration`, local untracked `.env` never staged.
Local Supabase key values are development defaults printed by `npx supabase status`; they are not recorded here.

| Requirement / phase | Check or scenario | Environment and conditions | Actual result | When run | Evidence / limitations |
| --- | --- | --- | --- | --- | --- |
| Phase 1, D-14 | Park Revision 1 B1 | `../Project_Tabang-track-b`, new branch `archive/feat-001-b1-firestore-rules` | Passed: committed the five modified files, `src/test/transitionParity.test.js`, and the track B status and evidence files as `c2f8dde` `wip(rules): park the unfinished firestore rules work`; toolkit files left untracked. | 2026-10-17T22:23+08:00 | Nothing was discarded; the worktree stays on the archive branch. |
| Phase 1 | Merge A2 and C1 | `git merge --no-ff feat-001/track-a`, then `feat-001/track-c` | Passed: no conflicts; merge commits `56deeac` and `12de08f`. | 2026-10-17T22:24+08:00 | - |
| Phase 1, D-16 | Dependency changes | `npm install @supabase/supabase-js`, `npm install --save-dev supabase`, `npm uninstall firebase-tools @firebase/rules-unit-testing` | Passed: `@supabase/supabase-js` ^2.118.0 and `supabase` ^2.121.0 added; the two Firebase tooling packages removed; `firebase` web SDK kept until Phase 3. | 2026-10-17T22:25+08:00 | `package.json` had no `overrides` block, so that task did not apply. |
| Phase 1, D-17 | `npx supabase init` and config | Fresh `supabase/config.toml` | Passed: `project_id = "tabang"`; `[auth.email] enable_confirmations = false` (the CLI default). | 2026-10-17T22:26+08:00 | Hosted project settings are not covered. |
| Phase 1 | Key names from `npx supabase status` | Local stack running | Passed: the CLI prints `PUBLISHABLE_KEY` and `SECRET_KEY`, matching the planned `VITE_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`; no renaming needed. | 2026-10-17T22:27+08:00 | - |
| Phase 1, REQ-043 | `npm run db:start` | First run pulled the Supabase images | Passed: stack started. | 2026-10-17T22:26+08:00 to 22:27+08:00 | - |
| Phase 1, REQ-002 | `npm ci` | After the dependency changes | Passed. | 2026-10-17T22:28:37+08:00 to 22:28:58+08:00 | npm reported audit findings; see the audit row. |
| Phase 1 | `npm run lint` | - | Passed: exit 0. | 2026-10-17T22:28:58+08:00 | - |
| Phase 1 | `npm run test:unit` | - | Passed: 19 files, 205 tests. | 2026-10-17T22:29:04+08:00 to 22:29:15+08:00 | - |
| Phase 1 | `npm run test:server` | Ephemeral ports | Passed: 6 of 6. | 2026-10-17T22:29:15+08:00 to 22:29:16+08:00 | - |
| Phase 1, REQ-043 | `npm run db:reset` | Local stack, no migrations yet | Passed: "Reset local database." | 2026-10-17T22:29:20+08:00 | The CLI noted that `supabase/seed.sql` does not exist; no seed is needed yet. |
| Phase 1, REQ-043 | `npm run test:policies` | Local stack | Passed: 2 of 2 (`local auth answers`, `local data API answers`). | 2026-10-17T22:29:54+08:00 | Smoke tests only; they prove the stack answers, not any policy. |
| Phase 1, REQ-003, REQ-004 | `npm run check` | Local `.env` with Supabase values | Failed: 1 of 205 unit tests failed in `src/test/feeds.test.jsx` "queries only for the signed-in resident" (`listMyReports` not called with `{ reporterId: "resident-1" }` before the assertion). | 2026-10-17T22:29:54+08:00 to 22:30:10+08:00 | Same race Track B recorded on 2026-09-27: `MyReportsPage` queried with `reporterId: undefined` before the fake session arrived. Three immediate reruns of `npm run test:unit` passed, so the failure was timing dependent. |
| Phase 1, REQ-004 | Fix attempt 1 for the `MyReportsPage` race | `MyReportsPage` skips loading until the session names a reporter; the test also asserts exactly one call | Passed: `npm run lint` exit 0; `npm run test:unit` three consecutive runs, 205 of 205 each. | 2026-10-17T22:31+08:00 to 22:32+08:00 | One attempt used; problem resolved. |
| Phase 1, REQ-003 | `npm run check` twice | Local `.env` with Supabase values | Passed both runs: secret scan clean, contrast check, 205 of 205 unit tests, 6 of 6 server tests, "Supabase configuration present.", build succeeded. | 2026-10-17T22:32:30+08:00 to 22:33:05+08:00 | - |
| Phase 1, REQ-003 | Secret scan negative probe for Supabase secret keys | Throwaway repository in the session scratchpad with a staged dummy `sb_secret_` literal | Passed: exit 1 with "Supabase secret key literal". | 2026-10-17T22:33+08:00 | Dummy value only; probe repository deleted. |
| Phase 1 | `npm audit --omit=dev --audit-level=high` | - | Failed under stated conditions: 4 high findings, all in the `firebase` web SDK through `@grpc/grpc-js` below 1.13.6 (`@firebase/firestore`, `@firebase/firestore-compat`, `@grpc/grpc-js`, `firebase`). | 2026-10-17T22:30:10+08:00 | Pre-existing in `firebase` 12.17.1, not introduced by this phase; Phase 3 removes the `firebase` dependency and reruns the audit. |
| Phase 1 | CI `policies` job | `.github/workflows/check.yml` | Not run: CI runs only after Len pushes. | - | The status export command and its unquoting were exercised locally against the running stack; the GitHub runner was not. |
| Phase 1 | `npm run db:stop` | - | Passed: "Stopped supabase local development setup." | 2026-10-17T22:33:38+08:00 | - |

Use Not run, Passed under stated conditions, Failed, or Blocked.
Record actual commands or repeatable scenarios, not just conclusions.
Attach screenshots for meaningful UI checks when capture is available.
Keep emulator, physical-device, hardware-bench, and field validation distinct.
Len performs physical-device checks; keep them pending until Len supplies results.
Neither implementation nor a simulation establishes effectiveness in the intended environment.

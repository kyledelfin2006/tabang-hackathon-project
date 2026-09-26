# Verification: FEAT-001 track A

Created: 2026-09-26T20:07:30+08:00
Updated: 2026-09-26T20:07:30+08:00

Environment for every row unless stated: Windows 11 dev machine, Node from the local install, Java 24.0.2, worktree `../Project_Tabang-integration` on `feat-001/integration`, local untracked `.env` copied from the main checkout and never staged.

| Requirement / phase | Check or scenario | Environment and conditions | Actual result | When run | Evidence / limitations |
| --- | --- | --- | --- | --- | --- |
| A1 precondition | SHA-256 of copied `ARCHITECTURE.md`, FEAT-001, and plan compared with `HANDOFF.md` | Files copied from the main checkout | Passed: prefixes `0243d23ec57d`, `c4449b259a02`, `789878aa94f0` match the approval record | 2026-09-26T20:01+08:00 | Git blob ids at staging: architecture `2abe5e1f`, FEAT-001 `232301c0`, plan `ebb34ccf`. |
| A1, REQ-004 | Before the fix: `npm run test:unit` three times | Integration worktree, `src/services/uploads/` and `scripts/uploads/` not yet copied | Failed: 2 of 19 files failed to import `src/services/uploads/imageValidation.js`; 172 tests passed | 2026-09-26T20:03:25+08:00 to 20:03:44+08:00 | Showed that `src/services/uploads/*.js` were also hidden by the old `uploads/` ignore rule, not only the signing module. |
| A1, REQ-004 | `npm run test:unit` three consecutive full runs | After tracking the upload modules and setting `asyncUtilTimeout` to 5000 ms | Passed under stated conditions: 19 of 19 files and 200 of 200 tests in each of the three runs | 2026-09-26T20:04:07+08:00 to 20:04:26+08:00 | Three runs on one machine; not a proof of determinism under other load. |
| A1 | `npm run lint` | ESLint now also covers `scripts/**/*.mjs` and `tests/**/*.mjs` with Node globals | Passed: no errors or warnings; JSON formatter listed 7 files under `scripts/` and `tests/` | 2026-09-26T20:02+08:00 | - |
| A1, D-8 | `npm run test:rules` | Firestore emulator only; storage emulator and storage tests removed | Passed: 26 of 26 tests | 2026-09-26T20:04:36+08:00 to 20:04:45+08:00 | 29 before D-8; the 3 removed tests were the storage rules tests. |
| A1 | Port 18085 cleanup after the rules run | PowerShell `Get-NetTCPConnection` | `java` PID 16088, started 20:04:38 inside this run, still listened on 18085 after exit; stopped with `Stop-Process`; port then had 0 listeners | 2026-09-26T20:04:58+08:00 | Port was free before the run. |
| A1, REQ-003 | Secret scan against `git ls-files` | Integration worktree with untracked `.env` present | Passed: "No committed secrets matched the known patterns." | 2026-09-26T20:03+08:00 | - |
| A1, REQ-003 | Secret scan negative probe | Throwaway repository in the session scratchpad holding a dummy one-line `.env` | Untracked `.env`: exit 0; after `git add .env`: exit 1 with "Committed .env file" | 2026-09-26T20:03+08:00 | Dummy placeholder content only; probe repository deleted. |
| A1, REQ-003 | `npm run check` | Local `.env` present | Passed: lint, secret scan, contrast, 200 unit tests, 4 redirect tests, env check, and Vite build | 2026-09-26T20:05:06+08:00 to 20:05:17+08:00 | `dist/` is ignored and not staged. |
| A1, REQ-002 | Clean tree install and tests before commit | `git archive` of the staged tree `09d384f1` extracted into the scratchpad, only `.env` copied in | Passed: `npm ci` exit 0; `npm run test:unit` 19 of 19 files, 200 of 200 tests | 2026-09-26T20:05:50+08:00 to 20:07:01+08:00 | Same staged content as the commit except this evidence, the status file, `HANDOFF.md`, and `docs/SPEC_INDEX.md`; the post-commit throwaway worktree run is recorded in the next track A evidence update. |

Use Not run, Passed under stated conditions, Failed, or Blocked.
Emulator, physical-device, and field validation stay separate; none of the above is physical-device or field evidence.

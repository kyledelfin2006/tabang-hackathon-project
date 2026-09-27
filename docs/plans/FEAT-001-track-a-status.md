# FEAT-001 track A status

Created: 2026-09-26T20:07:45+08:00
Updated: 2026-09-27T15:36:29+08:00
Owner: Agent A
Execution mode: hard-stop, from the plan header

## Current phase

A1 (gate G0) committed on `feat-001/integration`; the checkpoint hash is confirmed with `git log -1` after the commit and reported to Len.
Current phase: A2 verification is complete on `feat-001/track-a` in `../Project_Tabang-track-a`; Len gave the go-ahead in chat.

## Done

| Phase | Checkpoint message | Hash |
| --- | --- | --- |
| A1 (G0) | `chore(repo): track the signing module and make checks pass on a fresh clone` | Found with `git log --grep` on `feat-001/integration`; not written into its own commit. |
| A2 | `fix(server): serve only the build and redirect retired pages` | Confirm with `git log -1` after the checkpoint commit and report the hash; do not write it into its own commit. |

## A1 notes

- `src/services/uploads/cloudinaryUploader.js`, `imageValidation.js`, and `prepareImage.js` were also hidden by the old `uploads/` ignore rule; they are added to Git unchanged because REQ-002 fails without them.
- These three files are track B paths from now on.
- The plan file is committed byte-for-byte as approved, so its SHA-256 still matches `HANDOFF.md`; phase progress is tracked here and in the evidence file instead of in the plan checkboxes.
- `README.md` still says the emulators include Storage; A5 rewrites the README.
- The local `.env` still has two unused `VITE_STORAGE_EMULATOR_*` keys; nothing reads them, and `.env` is Len's local file.

## A2 progress

- The static Node server, legacy redirects, server tests, Hosting configuration cleanup, and legacy URL documentation are implemented in this worktree.
- `npm run check` passed on 2026-09-27, including lint, secret scan, contrast, all 200 unit tests, all 6 server tests, environment validation, and the production build.
- The A2 HTTP smoke checks passed on 2026-09-27, including the moved Google verification file.
- `npm run test:unit` initially reported 199 of 200 tests passing because `src/test/accessibility.test.jsx` still read removed legacy pages.
- After C1 completed without changing that test, Len authorized a one-file exception on A's branch; the pinch-zoom check now covers the remaining `index.html` app shell.
- The complete A2 checks pass; the scoped diff is ready for checkpoint review and commit.

## Next action

After the A2 checkpoint, confirm its hash with `git log -1`, report the verified results to Len, and stop at the approved hard-stop.

## Blockers

| Problem | Fix-and-check attempts used (maximum 3) | Changes tried and observed result | Required decision or access |
| --- | --- | --- | --- |
| The C-owned accessibility test referenced legacy pages deleted by A2. | 0/3 unsuccessful fix-and-check attempts. | Len authorized a one-file exception; the test now checks only `index.html`, and `npm run check` passed with all 200 unit tests. | Resolved. |

## Requests to other tracks

None.

## Contract change proposals

None.

# Current handoff

Created: 2026-09-26T16:25:25+08:00
Updated: 2026-10-18T01:18:37+08:00
State: Revision 2 approved; plan phases 1 to 7 complete (barangay lists blocked), phase 8 next; execution mode `auto`, one Claude Code agent
Feature: FEAT-001

## Read first

- Workspace rules: `../AGENTS.md`
- Index: [docs/SPEC_INDEX.md](docs/SPEC_INDEX.md)
- Architecture: [docs/product/ARCHITECTURE.md](docs/product/ARCHITECTURE.md) Revision 2, approved
- Feature: [docs/features/FEAT-001-stabilization-and-integration-api.md](docs/features/FEAT-001-stabilization-and-integration-api.md) Revision 2, approved
- Plan: [docs/plans/FEAT-001-implementation.md](docs/plans/FEAT-001-implementation.md) Revision 2, approved
- Review evidence: [docs/evidence/2026-09-26-project-review.md](docs/evidence/2026-09-26-project-review.md)

Reread these files and inspect actual Git status before acting; prior chat memory is not authoritative.
The Revision 1 documents are in Git at `d928c56` on `feat-001/integration`.

## Approval and allowed work

Revision 1 was approved by Len in chat on 2026-09-26 at about 16:27 +08:00 ("Okay I approve"), with execution mode `hard-stop` and D-5 to D-9.
On 2026-10-03 Len said in chat that the Firebase account is inaccessible, that the project will switch to Supabase, that time is not a constraint, and that the app is a work in progress and not live.
Len then chose, in chat on 2026-10-03: Supabase Storage for files (D-11), direct access with row-level security (D-12), revising FEAT-001 in place (D-14), and local Supabase in Docker for tests (D-13).
Those choices set the direction; they are not approval of the Revision 2 documents, which were drafted afterwards.
On 2026-10-17 at about 22:15 +08:00 Len said in chat: "Switch to auto and make these instructions executable by claude code as a single agent no need to divide tasks anymore".
The plan draft was revised accordingly: execution mode `auto`, one Claude Code agent, eight sequential phases, no tracks or gates.
That instruction changed the draft; it was not itself approval.
On 2026-10-17 at about 22:21 +08:00 Len approved the revisions in chat: "alright i approve of the revisions, you may also execute the ingtegration yourself after dinng phase 1"
This approves Architecture Revision 2, FEAT-001 Revision 2, plan Revision 2, D-15 to D-19, execution mode `auto`, and execution by Claude Code in this session starting with phase 1.

| Document or decision | Revision | State | Len chat approval reference |
| --- | --- | --- | --- |
| Architecture | Revision 2 | Approved | 2026-10-17 about 22:21 +08:00 |
| FEAT-001 | Revision 2 | Approved | 2026-10-17 about 22:21 +08:00 |
| FEAT-001 plan | Revision 2 | Approved | 2026-10-17 about 22:21 +08:00 |
| Execution mode | `auto` | Approved | 2026-10-17 about 22:15 and 22:21 +08:00 |
| Execution model | One Claude Code agent | Approved | 2026-10-17 about 22:15 and 22:21 +08:00 |
| D-10 to D-14 | - | Decided in chat, recorded in the drafts | 2026-10-03, before the drafts existed |
| D-15 no data migration | - | Approved | 2026-10-17 about 22:21 +08:00 |
| D-16 add `@supabase/supabase-js` and dev `supabase`; remove three Firebase packages | - | Approved | 2026-10-17 about 22:21 +08:00 |
| D-17 email confirmation off during development | - | Approved | 2026-10-17 about 22:21 +08:00 |
| D-18 state changes through database functions | - | Approved | 2026-10-17 about 22:21 +08:00 |
| D-19 hotline rating totals computed by a view | - | Approved | 2026-10-17 about 22:21 +08:00 |
| D-6 `firebase-admin` | - | Withdrawn by Revision 2 | - |

Allowed phases: plan Revision 2 phases 1 to 8, in order.
No agent continues a Revision 1 phase or the earlier track split; in particular nobody starts A3, resumes B1, or starts C2.
Architecture and behavior changes return to Len; this handoff cannot override the linked specs.

## Progress and working tree

- A1 (gate G0) is committed at `d928c56`.
- Approved Revision 2 documents are committed at `ca7ead5` `docs(feat-001): approve revision 2 for supabase and single-agent execution`.
- Phase 1 is complete with checkpoint `chore(supabase): merge earlier phases, add the local stack, and remove firebase tooling` on `feat-001/integration`.
- Phase 1 merged A2 (`32d17bf`, merge `56deeac`) and C1 (`81b1012`, merge `12de08f`) into integration.
- Revision 1's B1 work is parked, not discarded, at `c2f8dde` on `archive/feat-001-b1-firestore-rules`; `../Project_Tabang-track-b` stays on that branch.
- The track worktrees and branches are no longer used; removing them is Len's action.
- The main checkout `Project_Tabang` on `main` still holds the Revision 1 documents and an older handoff; this file is the current one.
- Untracked toolkit files (`.agents/`, `.claude/`, `.editorconfig`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`) from `npx len-toolkit start` are preserved and never staged.
- The local `.env` now also holds the local Supabase development values; it is gitignored.
- Phase 2 is complete with checkpoint `feat(db): add the supabase schema, policies, and functions`: three migrations, 42 policy tests.
- Phase 3 is complete with checkpoint `feat(data): move auth, data, and uploads to supabase`: the app runs on Supabase, Firebase and Cloudinary are gone from code and dependencies, and a `/update-password` page keeps emailed reset links working.
- Phase 4 is complete with checkpoint `feat(resident): barangay picker, offline replay, and honest failures`: municipality picker, optional GPS, error summary, send without photos, 911 on failure, pending reports with send now and discard, automatic replay, cancel only when allowed, and account details editing.
- Phase 4 gap: barangay lists are empty because the PSA PSGC download was refused (HTTP 403); the form takes the barangay as text until Len supplies the file.
- Phase 5 is complete with checkpoint `feat(responder): paged queue, evidence review, and advisory publishing`: paged queue, exact dashboard counts, incident photos, map link, verify and reject, advisory publishing, reviewer evidence links and notes, reapply after rejection, workspace links, modal focus trap, bottom-navigation clearance, and the copy scan.
- The privacy page in `src/routes/auth/PrivacyPage.jsx` is a draft pending Len's review; it is not legal advice.
- Phase 6 is complete with checkpoint `feat(api): add the versioned api foundation and client keys`: `/api/v1` router with the error envelope, request ids, partner key checks, scopes, rate limits, redacted request logs, `GET /api/v1/health`, the OpenAPI document, and `npm run api-clients`.
- Phase 7 is complete with checkpoint `feat(api): add partner incidents, signals, and the dost seam`: `GET /api/v1/incidents` and `/{id}` in the D-5 projection with cursor paging and `since`, public `GET /api/v1/advisories`, idempotent `POST /api/v1/signals`, the DOST route answering 501, and `npm run seed:hotlines`.
- Phase 8: not started.

## Checks and evidence

Phase 1 to 7 results are in [docs/evidence/FEAT-001.md](docs/evidence/FEAT-001.md): lint, 195 unit tests, 8 server tests, `db:reset`, 48 policy tests, build, and full `npm run check` runs passed on 2026-10-17 and 2026-10-18.
`npm audit --omit=dev --audit-level=high` reports 0 vulnerabilities since Phase 3 removed `firebase`.
`README.md` and `docs/operations.md` still describe Firebase until Phase 8 rewrites them.
The CI `policies` job has not run, because nothing is pushed.
The Supabase free plan limits and email sender restrictions in the architecture are remembered, not verified.
Earlier results are in [docs/evidence/FEAT-001-track-a.md](docs/evidence/FEAT-001-track-a.md), [docs/evidence/FEAT-001-track-c.md](docs/evidence/FEAT-001-track-c.md), and on the archive branch.

## Blockers and attempts

| Problem | Fix-and-check attempts used (maximum 3) | Changes tried and observed result | Required decision or access |
| --- | --- | --- | --- |
| Revision 1 B1: Firestore rules exceed the emulator's 1000-expression limit on denied report writes. | 3 of 3 | Recorded by Agent B in the track B status file: three restructurings; the last run reported 32 of 32 passing but logged expression-limit errors, so it was not accepted. | Closed: Firestore rules were removed in Phase 1. |
| `MyReportsPage` queried with `reporterId: undefined` before the session arrived, failing `feeds.test.jsx` under load (REQ-004). | 1, resolved | The page now skips loading until a reporter id exists, and the test asserts one call; three unit runs and two full checks passed. | None. |
| Aklan barangay lists for REQ-014 cannot be built from the PSA PSGC publication. | - | `psa.gov.ph` returned HTTP 403 to every download attempt on 2026-10-18; municipalities are listed and the barangay is typed. | Len supplies the PSGC publication file (or another approved PSA source). |
| The Firebase project cannot be administered. | - | Len cannot access the owning account. | Account recovery so it can be deleted (Q-6); no longer blocks work. |

Do not reset a count on a new session or silently reinterpret a failed check as passing.

## Next action

Execute plan phase 8 (documentation and release readiness) in this worktree, in `auto` mode.
Docker Desktop must be running; start the stack with `npm run db:start`.
A new session resumes with the prompt in plan section 5.

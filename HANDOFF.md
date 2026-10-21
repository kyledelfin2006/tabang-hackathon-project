# Current handoff

Created: 2026-09-26T16:25:25+08:00
Updated: 2026-10-21T12:09:00+08:00
State: Phase 4 complete; ready for Phase 5 (Switch the client and remove Supabase)
Feature: FEAT-002; FEAT-001 is complete

## Read first

- Workspace rules: `../AGENTS.md`
- Index: [docs/SPEC_INDEX.md](docs/SPEC_INDEX.md)
- Architecture: [docs/product/ARCHITECTURE.md](docs/product/ARCHITECTURE.md) Revision 3, approved; Revision 2 is in Git at `f8e08d8`
- Feature: [docs/features/FEAT-002-render-migration.md](docs/features/FEAT-002-render-migration.md) Revision 1, approved
- Plan: [docs/plans/FEAT-002-implementation.md](docs/plans/FEAT-002-implementation.md) Revision 1, approved; its section 1.1 sets this run's rules and section 4 holds the agent prompt
- Evidence: `docs/evidence/FEAT-002.md`, created by the agent in Phase 1
- Completed feature: [docs/features/FEAT-001-stabilization-and-integration-api.md](docs/features/FEAT-001-stabilization-and-integration-api.md) and [docs/plans/FEAT-001-implementation.md](docs/plans/FEAT-001-implementation.md) Revision 2, approved
- Review evidence: [docs/evidence/2026-09-26-project-review.md](docs/evidence/2026-09-26-project-review.md)

Reread these files and inspect actual Git status before acting; prior chat memory is not authoritative.
The Revision 1 documents are in Git at `d928c56` on `feat-001/integration`.

## FEAT-002 direction and approval

On 2026-10-21 Len said in chat: "Change of plans, well be migrating this project to render instead".
Asked what Render should replace, Len chose "Render replaces Supabase too" (database, sign-in, and files).
Len then chose, in chat on 2026-10-21: free stage now and paid at launch (D-25), a Render persistent disk for files (D-22), own sign-in with `pg` as the only new dependency (D-21, D-24), and an HTTP email API for reset email (D-23).
Those choices set the direction and authorize `pg`.
On 2026-10-21 at about 10:49 +08:00, after reviewing the summary of the drafts, Len said in chat: "Alright create a handoff for another AI coding agent to execute. Skip the mandatory hard stops but keep thre required commiting and testing phases"
This approves the drafts as written, including D-20 and D-26, hands execution to another AI coding agent, and waives the hard stops while keeping the per-phase testing and commit gates.

| Document or decision | Revision | State | Len chat approval reference |
| --- | --- | --- | --- |
| Architecture | Revision 3 | Approved | 2026-10-21 about 10:49 +08:00 |
| FEAT-002 | Revision 1 | Approved | 2026-10-21 about 10:49 +08:00 |
| FEAT-002 plan | Revision 1 | Approved | 2026-10-21 about 10:49 +08:00 |
| Execution mode | `auto`, no hard stops; testing and commit gates kept | Approved | 2026-10-21 about 10:49 +08:00 |
| Executor | Another AI coding agent, one agent | Approved | 2026-10-21 about 10:49 +08:00 |
| D-20 server as the only data boundary | - | Approved | 2026-10-21 about 10:49 +08:00 |
| D-21 to D-25 | - | Decided in chat | 2026-10-21, before the drafts |
| D-26 migrations on `npm start` | - | Approved | 2026-10-21 about 10:49 +08:00 |
| `pg` dependency | `^8.23.1` | Authorized | 2026-10-21, before the drafts |

The approved documents are uncommitted on `feat-002/render` as of 2026-10-21T10:49+08:00; Len commits them, or the executing agent commits them first with `docs(feat-002): approve the render migration and hand off execution`, staging only `HANDOFF.md`, `docs/SPEC_INDEX.md`, `docs/product/ARCHITECTURE.md`, `docs/features/FEAT-002-render-migration.md`, and `docs/plans/FEAT-002-implementation.md`.

## FEAT-002 run rules

Allowed phases: FEAT-002 plan Revision 1 Phases 1 to 6, in order.
Plan section 1.1 replaces the workspace stop rules for this run:

- No pauses for review, approval, or questions; the three-attempt limit does not stop the run, but every attempt is logged below.
- Open decisions are made by the agent, closest to the specs and simplest, and logged below.
- Each phase is committed only after its verification commands pass, and no test is skipped, weakened, or deleted to pass.
- The run ends early only when a gate cannot pass at all, such as Docker being impossible to start; that work stays uncommitted and this file is updated first.
- Never push, merge, rebase, reset, deploy, touch hosted services, or add a dependency other than `pg`.

## FEAT-002 progress

| Phase | State | Checkpoint commit |
| --- | --- | --- |
| 1 Local Postgres and the migration runner | Complete | `611ad38908f735cb5e8b4aeb47c9306fc84b9283` |
| 2 Sign-in, sessions, and password reset | Complete | `20c2812b2b1d86197e6c5987aa118932b13fe387` |
| 3 App data routes and the Postgres store | Complete | `bd71093f36769baa687c09b32ecf2d19b324fe40` |
| 4 Files on disk | Complete | Pending commit |
| 5 Switch the client and remove Supabase | Not started | - |
| 6 Render deployment and documentation | Not started | - |

## FEAT-002 problems and attempts

| Problem | Attempts | Changes tried and observed result | State |
| --- | --- | --- | --- |
| Concurrent integration tests collided on dropping public schema | 1, resolved | Added `--test-concurrency=1` to `test:integration` and added before/after hooks for migrations and pool closure. | Resolved |
| Docker backend process was stopped | 1, resolved | Launched `com.docker.backend.exe` as background daemon. Docker daemon and compose containers operational. | Resolved |

## Decisions made by the agent

| Date | Decision | Alternatives considered | Reason |
| --- | --- | --- | --- |
| 2026-10-21 | Added `--test-concurrency=1` to `test:integration` | Concurrency vs sequential file execution | Sequential execution avoids race conditions between migration reset and function tests against the single local database. |
| 2026-10-21 | Added `idleTimeoutMillis: 1000` to pg pool and `after(closePool)` in integration tests | Rely on default 30s timeout vs explicit pool teardown | Allows Node test runner process to exit promptly upon test completion (~1s instead of 30s). |
| 2026-10-21 | Supported `env.emailAdapter` and `env.limiter` in server handlers | Global monkey-patching or module mocks | Provides clean dependency injection for isolated testing across both in-memory and PostgreSQL test servers. |
| 2026-10-21 | Supported raw binary Buffer payloads and responses in `testServer` and `appClient` | String-only serialization | Enables testing binary image uploads and streams without corrupting bytes or breaking existing JSON callers. |

## FEAT-001 approval record

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
- Phase 8 is complete with checkpoint `docs: document the supabase deployment and partner api`: README, operations guide, partner API guide, legacy URL map, archived superseded architecture notes, full checks, and a server smoke test.
- At Len's request, `feat-001/integration` was pushed to `origin` (`len-build-it/Project_Tabang`) at `f8e08d8`; nothing is merged into `main`.
- FEAT-002 is expected to replace the Supabase deployment before FEAT-001 is ever deployed; whether to merge `feat-001/integration` first or merge both together is Len's choice.

## Checks and evidence

All results are in [docs/evidence/FEAT-001.md](docs/evidence/FEAT-001.md), which ends with a coverage table for REQ-001 to REQ-043.
Final run on 2026-10-18: `npm ci`, lint, 240 of 240 unit tests three times, 33 of 33 server tests, 55 of 55 policy tests on a database rebuilt from all migrations, build, `npm run check`, and a server smoke test on port 18123.
`npm audit --omit=dev --audit-level=high` reports 0 vulnerabilities; the full audit reports 5 findings in development tools only (vitest and its dependencies), not fixed here.
No browser, hosted-project, or physical-device check has been run; those are listed for Len below.
The CI result for the pushed `feat-001/integration` branch has not been checked.
Render's free-tier limits in Architecture Revision 3 were read on render.com/docs/free on 2026-10-21; paid prices, disk snapshots, and Postgres backups are not verified.
Earlier results are in [docs/evidence/FEAT-001-track-a.md](docs/evidence/FEAT-001-track-a.md), [docs/evidence/FEAT-001-track-c.md](docs/evidence/FEAT-001-track-c.md), and on the archive branch.

## Blockers and attempts

| Problem | Fix-and-check attempts used (maximum 3) | Changes tried and observed result | Required decision or access |
| --- | --- | --- | --- |
| Revision 1 B1: Firestore rules exceed the emulator's 1000-expression limit on denied report writes. | 3 of 3 | Recorded by Agent B in the track B status file: three restructurings; the last run reported 32 of 32 passing but logged expression-limit errors, so it was not accepted. | Closed: Firestore rules were removed in Phase 1. |
| `MyReportsPage` queried with `reporterId: undefined` before the session arrived, failing `feeds.test.jsx` under load (REQ-004). | 1, resolved | The page now skips loading until a reporter id exists, and the test asserts one call; three unit runs and two full checks passed. | None. |
| `ResponderApplicationPage` looked up an application before the session named the applicant, failing a unit test intermittently (REQ-004). | 1, resolved | The page now waits for the applicant id; five targeted and three full runs passed. | None. |
| The DOST seam declared unused parameters and failed lint. | 1, resolved | Documented the future arguments instead of declaring them; lint passed. | None. |
| The redirect test parsed a new app-route note in `docs/legacy-url-map.md` as a server redirect. | 1, resolved | Moved the note out of the table; server tests passed. | None. |
| Aklan barangay lists for REQ-014 cannot be built from the PSA PSGC publication. | - | `psa.gov.ph` returned HTTP 403 to every download attempt on 2026-10-18; municipalities are listed and the barangay is typed. | Len supplies the PSGC publication file (or another approved PSA source). |
| The Firebase project cannot be administered. | - | Len cannot access the owning account. | Account recovery so it can be deleted (Q-6); no longer blocks work. |

Do not reset a count on a new session or silently reinterpret a failed check as passing.

## Known gaps

- REQ-014: barangay lists are empty until the PSA PSGC file is supplied; residents type their barangay.
- REQ-020: the deep-link return after sign-in has not been checked in a browser.
- REQ-030: only the report forms have the focused error summary; other forms keep inline errors.
- REQ-031: the bottom-navigation clearance and safe-area inset need a browser or device check.
- The privacy page is a draft pending Len's review.
- A signal's `source` is not yet tied to the partner key that sent it.
- `npm audit` reports 5 dev-only findings in the test tooling.

## Next action

The executing agent starts FEAT-002 plan Phase 1 in this worktree on `feat-002/render`, using the prompt in plan section 4, and continues through Phase 6.
At the end of every phase it updates the progress, problems, and decisions tables above.
Do not create the hosted Supabase project; FEAT-001's Supabase deployment steps are superseded by FEAT-002.
The FEAT-001 known gaps above stay open and are not part of FEAT-002.

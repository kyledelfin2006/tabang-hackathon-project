# Implementation Plan: FEAT-001 Stabilize core flows, move to Supabase, and open an integration API

Created: 2026-09-26T16:25:09+08:00
Updated: 2026-10-18T01:18:37+08:00
Revision: 2
Status: Approved, in progress
**Execution mode:** auto
Feature spec and revision: [FEAT-001 Revision 2](../features/FEAT-001-stabilization-and-integration-api.md), approved
Approved baseline and architecture revisions: [Architecture Revision 2](../product/ARCHITECTURE.md), approved
Len's chat approval: Revision 1 and execution mode `hard-stop` were approved on 2026-09-26 at about 16:27 +08:00; Revision 2, execution mode `auto`, single-agent execution, and D-15 to D-19 were approved on 2026-10-17 at about 22:21 +08:00: "alright i approve of the revisions, you may also execute the ingtegration yourself after dinng phase 1"
Previous revision: Revision 1, in Git at `d928c56` on `feat-001/integration`
Target branch: `feat-001/integration`, created from `main` at `80a51de`; Len merges it into `main`

Execution mode note: Len chose `auto` in chat on 2026-10-17 at about 22:15 +08:00, replacing `hard-stop`.
The agent runs every phase in order without routine stops and stops only for a blocker defined in the workspace `AGENTS.md`.

Execution model note: Len chose in chat on 2026-10-17 to run this plan with one Claude Code agent instead of three parallel tracks.
The earlier track A, B, and C split, gates G1 and G2, file ownership, and cross-track requests are retired.
Phase names A1, A2, and C1 below refer to work already committed under the earlier split.

## Scope

This plan implements REQ-001 to REQ-043 of FEAT-001 Revision 2 in one worktree, one phase at a time.
Revision 2 replaces Firebase and Cloudinary with Supabase (D-10 to D-19) and keeps every other Revision 1 goal.

State when this revision was written, observed in Git on 2026-10-17:

| Earlier phase | State | Checkpoint |
|---|---|---|
| A1 | Complete on `feat-001/integration` | `d928c56` `chore(repo): track the signing module and make checks pass on a fresh clone` |
| A2 | Complete on `feat-001/track-a`, not merged | `32d17bf` `fix(server): serve only the build and redirect retired pages` |
| C1 | Complete on `feat-001/track-c`, not merged | `81b1012` `fix(ui): make hotlines public and remove developer copy` |
| B1 (Revision 1) | Uncommitted in `../Project_Tabang-track-b`; stopped after three unsuccessful attempts at a Firestore rules expression-limit error | none |

A2 and C1 change disjoint sets of files relative to `d928c56`, so their merges are not expected to conflict.
Revision 1's B1 problem is closed by removing Firestore rules, not by a fourth attempt; its attempt count does not carry to Phase 2, which is different work.

Existing edits to preserve:

- The main checkout and the track worktrees hold untracked toolkit files (`.agents/`, `.claude/`, `.editorconfig`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`); never stage or delete them.
- `../Project_Tabang-track-b` holds the uncommitted Revision 1 B1 work; Phase 1 parks it on an archive branch and nothing discards it.
- Every worktree has a local untracked `.env`; never stage, print, or copy its values into documents.

Workspace folders outside `Project_Tabang` are out of scope.

## 1. Working rules

### 1.1 Worktree and branch

- Work only in `../Project_Tabang-integration` on `feat-001/integration`.
- The only edit outside it is Phase 1's parking commit in `../Project_Tabang-track-b`.
- Never edit the main checkout `Project_Tabang` on `main`.
- The track worktrees and branches stay as they are after Phase 1; removing them is Len's action.
- Merges use `git merge --no-ff`; never rebase, reset, force-update, or push.

### 1.2 Progress, evidence, and handoff

- Tick each task in this file as it is done.
- Record actual commands, results, times, and limitations in `docs/evidence/FEAT-001.md`, in the `.agents/templates/docs/VERIFICATION.md` format.
- The earlier `docs/evidence/FEAT-001-track-*.md` files stay as historical evidence and are not edited.
- `HANDOFF.md` on `feat-001/integration` is the single status record: update it at the end of every phase with the checkpoint hash, checks run, blockers with attempt counts, and the next action.

### 1.3 Local Supabase and other shared resources

- The Docker daemon must be running for any `db:*` or `test:policies` command.
- If it is not running, that is unavailable access: record it in `HANDOFF.md`, finish any remaining tasks in the phase that do not need it, and stop for Len.
- Run `npm run db:stop` when a phase's checks are done and record it.
- Never link to, push migrations to, or run tests against a hosted Supabase project.
- Server tests listen on port 0, never a fixed port.
- `npm run build` needs the local `.env`; never commit `dist/`.

### 1.4 Every phase ends the same way

1. Run the phase's verification commands and record actual results.
2. Review the diff for correctness, scope, simplicity, dependencies, and unrelated changes.
3. Update this plan's task boxes, `docs/evidence/FEAT-001.md`, and `HANDOFF.md`.
4. Stage only the reviewed paths, never with `git add -A` or `git add .`, and inspect `git diff --cached`.
5. Commit with the phase's checkpoint message and confirm the hash with `git log -1`.
6. Continue to the next phase.

## 2. Interface contracts

These are the shapes the code must end up with.
Changing a name or meaning listed here is a change to FEAT-001 behavior only when it changes what a user or partner observes; otherwise record it in evidence and continue.

### 2.1 Pure domain modules

These must not import Supabase, React, browser globals, or Node built-ins; `src/test/domainPurity.test.js` enforces this.
Their mappers take plain values; timestamps are millisecond numbers.

| Module | Contract |
|---|---|
| `src/services/places/aklanPlaces.js` | `AKLAN_MUNICIPALITIES: readonly string[]` (17 entries); `barangaysFor(municipality): readonly string[]`; `isKnownPlace(municipality, barangay?): boolean`; `PLACES_SOURCE: { name, url, retrievedAt }` |
| `src/services/reports/reportSchemas.js` | `validateReport(kind, input)` where input has `municipality`, `barangay`, `landmark?`, `latitude?`, `longitude?` (both or neither), `description`, `contactPhone`, `severity` or `need` and `peopleAffected`; `SEVERITY_LABELS`, `NEED_LABELS`; `buildPublicSummary(values)` with readable labels |
| `src/services/incidents/incidentLifecycle.js` | Existing exports plus `STATUS_LABELS` and `ALLOWED_TRANSITIONS` exported for the transition parity test |
| `src/services/observability/redact.js` | Unchanged `redactText`, `redactValue`; used by `server/log.mjs` |
| `src/services/auth/roles.js`, `profile.js` | Unchanged |

### 2.2 Client services

Every factory takes an optional `{ client }` and otherwise uses `getSupabaseClient()` from `src/config/supabase.js`.
Method names and result shapes that exist today do not change in Phase 3, so route components and test fakes stay valid.

| Function | Contract |
|---|---|
| `createAuthGateway()` in `src/services/auth/supabaseAuthGateway.js` | Same methods as today: `observeSession`, `signIn`, `register`, `updateOwnProfile`, `sendPasswordReset`, `signOut`; the session shape `{ user: { uid, email, displayName, emailVerified }, role, profile }` is unchanged |
| `useAuth()` | Same shape; `status` stays `loading` until a changed user's session is built |
| `createStorageUploader()` in `src/services/uploads/storageUploader.js` | `.upload(file, { reporterId, reportId, onProgress, signal })` resolves `{ path, width, height }`; `onProgress` is called with 100 on completion and may be called earlier |
| `createReportSubmitter({ repository, uploader, queue })` in `src/services/reports/submitReport.js` | `.submit({ reportId, reporterId, kind, form, attachments, skipPhotos, onProgress, signal })` resolves `{ status: "submitted" }` or `{ status: "invalid", errors }` or `{ status: "failed", reason: "upload" \| "network" \| "permission" \| "unknown", message }`; the report is queued before any network call and removed only on success |
| `replayQueuedReports({ queue, repository, reporterId })` in `src/services/reports/replayQueuedReports.js` | Sends queued text-only entries in order, idempotent by `reportId`; resolves `{ sent: string[], remaining: QueueEntry[] }` |
| `createSubmissionQueue()` | Adds `discard(reportId)`; entries carry `reportId`, `kind`, `values`, `queuedAtMillis`, `attempts`, `lastFailure` |
| `describeActionError(error)` in `src/services/errors/describeActionError.js` | Returns plain-language copy for database, permission, network, and storage failures and for the database function codes; never returns `error.message` |
| `createReportRepository()` | `submitReport` is idempotent by `reportId`; `listMyReports` returns `{ reports, cursor, hasMore }` with an opaque cursor; `cancelReport` calls `cancel_report` |
| `toPersonalReport` | Adds `municipality`, `barangay`, `landmark`, `canCancel` |
| `createIncidentRepository().listIncidents({ status, kind, cursor })` | Resolves `{ incidents, cursor, hasMore }` (was an array) |
| `createIncidentRepository().countIncidents()` | Resolves `{ openIncidents, unclaimed, overdue, verified, awaitingVerification, countedAtMillis }` from `incident_counts` |
| `createIncidentRepository().transitionIncident` | From `new` to `acknowledged` performs a claim |
| `createIncidentRepository().verifyIncident({ incidentId, verificationStatus })` | `verificationStatus` is `verified` or `rejected`; the database records the actor and appends an event |
| `createIncidentRepository().getPhotoUrls(imagePaths)` | Resolves signed links that expire, in the same order |
| `toIncident` | Adds `imagePaths`, `municipality`, `barangay`, `landmark` |
| `createAdvisoryRepository()` | `listRecentAdvisories()` items add `source`, `municipality`, `expiresAtMillis` and exclude expired items; adds `publishAdvisory({ summary, municipality, barangay, actorId })` and `unpublishAdvisory(id)` |
| `createHotlineRepository()` | Same methods; `submitReview` writes only the review, and counts come from `hotline_directory` |
| `createReviewRepository()` | Items add `applicantName`, `applicantEmail`; adds `getEvidenceUrl(path)`; `decide(...)` resolves `{ evidenceDeleted: boolean }` and never throws after the decision commits |
| `createApplicationRepository()` | `uploadEvidence` stores into `identity-evidence`; `submitApplication` works after a rejection; `getMyApplication` rejects on failure instead of looking empty |

### 2.3 HTTP

- There are no upload routes; the SPA does not call the server's API.
- Partner and signal endpoints, error envelope, and schemas are defined in `../product/ARCHITECTURE.md`.
- Partner incident listing orders by `updated_at` ascending then id, with optional `municipality` equality and `since` on `updated_at`.

### 2.4 Database

- Table, column, function, and bucket names are those in `../product/ARCHITECTURE.md`; record any necessary difference in evidence.
- `server/store.mjs` may read `reports`, `public_feed`, `hotlines`, `signals`, and `api_clients`, and call `ingest_signal`, using the server's secret key.

### 2.5 Routes

`/hotlines` is public; `/app/community` redirects to `/app`; `/responder/advisories` is the responder advisory page; all other paths are unchanged.

## 3. Phases

Order: 1 foundation → 2 database → 3 provider switch → 4 resident flows → 5 responder and reviewer flows → 6 API foundation → 7 partner endpoints → 8 documentation and release readiness.
Each phase depends on the one before it.

### Phase 1: Consolidate the branches and add the Supabase foundation

Requirements: REQ-043 (tooling), REQ-039 (tooling part), D-13, D-14, D-16, D-17
Depends on: Len's approval of Revision 2 recorded in `HANDOFF.md`
State: Complete; checkpoint commit `chore(supabase): merge earlier phases, add the local stack, and remove firebase tooling`

#### Tasks

- [x] Confirm `HANDOFF.md` records Len's approval of Architecture Revision 2, FEAT-001 Revision 2, this plan Revision 2, and D-15 to D-19; if it does not, stop.
- [x] Park the Revision 1 B1 work without discarding it: in `../Project_Tabang-track-b`, run `git switch -c archive/feat-001-b1-firestore-rules`, stage only the five modified files, `src/test/transitionParity.test.js`, `docs/plans/FEAT-001-track-b-status.md`, and `docs/evidence/FEAT-001-track-b.md`, inspect the staged diff, commit `wip(rules): park the unfinished firestore rules work`, and confirm with `git log -1`; leave that worktree on the archive branch.
- [x] In `../Project_Tabang-integration`, run `git merge --no-ff feat-001/track-a`, then `git merge --no-ff feat-001/track-c`; on a conflict run `git merge --abort`, record the files in `HANDOFF.md`, and stop.
- [x] Move `docs/plans/FEAT-001-track-a-status.md` and `docs/plans/FEAT-001-track-c-status.md` to `docs/archive/` with a first line linking `../../HANDOFF.md`.
- [x] Create `docs/evidence/FEAT-001.md` from the verification template, with a first line linking the earlier track evidence files.
- [x] Run `npm install @supabase/supabase-js` and `npm install --save-dev supabase` (D-16).
- [x] Run `npx supabase init`; in `supabase/config.toml` set the project id to `tabang` and turn email confirmation off (D-17); commit no keys.
- [x] Remove Firebase tooling: `firebase.json`, `.firebaserc`, `firebase/`, `tests/rules/`, the dev dependencies `firebase-tools` and `@firebase/rules-unit-testing`, and the scripts `deploy:rules`, `firebase:emulators`, and `test:rules`.
- [x] Keep the `firebase` web SDK dependency; the SPA imports it until Phase 3 removes it.
- [x] Remove the `overrides` block from `package.json` only if `npm ci` and `npm audit --omit=dev --audit-level=high` stay clean without it; record the result either way.
- [x] Add scripts: `db:start` (`supabase start`), `db:stop` (`supabase stop`), `db:reset` (`supabase db reset`), and `test:policies` (`node --test --test-concurrency=1 tests/policies/`).
- [x] Add `tests/policies/smoke.test.mjs` that passes when the local auth and data endpoints answer.
- [x] `.env.example`: add key names `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, and `SUPABASE_SECRET_KEY`, with a comment that the last one is server only; if `npx supabase status` prints the keys under other names, use the names it prints and record the mapping in evidence.
- [x] Add the local values from `npx supabase status` to the gitignored `.env`; never stage or print them.
- [x] `scripts/build/check-env.mjs`: require the two `VITE_SUPABASE_*` keys and stop requiring the Firebase keys.
- [x] CI: replace the `rules` job with a `policies` job that installs the Supabase CLI, starts the local stack, and runs `npm run test:policies`.
- [x] Update `docs/SPEC_INDEX.md`.

#### Verification

- [x] `npm ci`, `npm run lint`, `npm run test:unit`, and `npm run test:server` pass.
- [x] With Docker running: `npm run db:start`, `npm run db:reset`, and `npm run test:policies` pass, then `npm run db:stop`.
- [x] `npm run check` passes with the local Supabase values in `.env`.
- [x] `npm audit --omit=dev --audit-level=high` result recorded (4 high findings in the `firebase` SDK, removed in Phase 3).

Checkpoint message: `chore(supabase): merge earlier phases, add the local stack, and remove firebase tooling`

### Phase 2: Database schema, policies, functions, and storage

Requirements: REQ-006, REQ-007, REQ-008, REQ-009, REQ-018 (database), REQ-022 (database), REQ-027 (database), REQ-042, REQ-043
Depends on: Phase 1
State: Complete; checkpoint commit `feat(db): add the supabase schema, policies, and functions`

#### Tasks

- [x] Write migrations in `supabase/migrations/` for every table, constraint, index, and the `hotline_directory` view in `../product/ARCHITECTURE.md`, with row-level security enabled on every table.
- [x] Add a role helper that reads `role_assignments` for the caller and treats a missing row as `resident`.
- [x] Add policies and column privileges exactly as the architecture's schema table states; `signals` and `api_clients` get no policy.
- [x] Add the sign-up trigger that validates the metadata and creates the `profiles` row.
- [x] Add the functions in the architecture's function table, each checking the caller, fixing its `search_path`, raising the stable error codes, and granted only to the roles that may call it.
- [x] Seed `incident_transitions` from the same moves as `ALLOWED_TRANSITIONS`.
- [x] Create the `report-photos` and `identity-evidence` buckets with image-only type lists, size limits, and the storage policies in the architecture.
- [x] Export `ALLOWED_TRANSITIONS` from `incidentLifecycle.js` and add `tests/policies/transitionParity.test.mjs` comparing it with `incident_transitions`.
- [x] Add `tests/policies/helpers/` that create a resident, responder, reviewer, admin, and anonymous client against the local stack.
- [x] Add policy tests for every clause of REQ-006, REQ-007, REQ-008, REQ-009, and REQ-042, and for the claim, transition, verify, cancel, application, and decision functions including each refusal.
- [x] Never use the secret key in a test that checks what a user is supposed to be denied.

#### Verification

- [x] `npm run db:reset` builds the schema from nothing, and `npm run test:policies` passes, with the tests listed by name in evidence; `npm run db:stop` recorded.
- [x] `npm run lint` and `npm run test:unit` pass.

Checkpoint message: `feat(db): add the supabase schema, policies, and functions`
Applying these migrations to a hosted project is Len's action after Phase 8.

### Phase 3: Move the app to Supabase and remove Firebase and Cloudinary

Requirements: REQ-005, REQ-010 (Content Security Policy), REQ-020, REQ-039, REQ-040, REQ-041
Depends on: Phase 2
State: Complete; checkpoint commit `feat(data): move auth, data, and uploads to supabase`

This phase changes the provider and nothing else: every screen behaves as it does today.

#### Tasks

- [x] Add `src/config/supabase.js` with `getSupabaseClient()` and a reset for tests; make `src/config/env.js` resolve the Supabase settings; delete `src/config/firebase.js` and replace `src/test/firebase-config.test.js` with a Supabase config test.
- [x] Replace `firebaseAuthGateway.js` with `supabaseAuthGateway.js`, keeping the same methods and session shape; `register` sends name, phone, and barangay as sign-up metadata.
- [x] Session: use one auth state subscription, build the session outside that callback, ignore stale builds with a sequence number, and keep `status` as `loading` while a changed user's session is built; update `fakeAuthGateway.js` and `authProviderBoot.test.jsx`.
- [x] Map Supabase auth error codes in `authErrors.js` to the existing plain messages.
- [x] Port the report, incident, hotline, advisory, application, and review repositories to the client and the Phase 2 functions, mapping rows to the plain shapes the domain mappers take.
- [x] Replace `cloudinaryUploader.js` with `storageUploader.js`, and make `uploadEvidence` use the `identity-evidence` bucket; keep `imageValidation.js` and `prepareImage.js` as they are.
- [x] Update the unit tests that used Firestore-shaped fakes, and remove every import of `scripts/uploads/cloudinarySignature.mjs` from tests and source.
- [x] Remove the server's upload handlers, `scripts/uploads/`, and the `firebase` dependency.
- [x] Remove every Firebase and Cloudinary key name from `.env.example` and `scripts/build/check-env.mjs`.
- [x] Set the Content Security Policy in `server/securityHeaders.mjs` to `'self'` and the configured Supabase origin for `connect-src` and `img-src`.
- [x] Add `src/test/providerIsolation.test.js`, which scans `src/` and `server/` and fails if `@supabase/supabase-js` is imported anywhere except `src/config/supabase.js` and `server/supabaseAdmin.mjs`, and `src/test/domainPurity.test.js` (REQ-040).
- [x] Add policy tests that drive the real repositories and gateway: resident report then responder claim (REQ-005), and sign-up, sign-in, sign-out, and reset request (REQ-041).

#### Verification

- [x] `npm run lint`, `npm run test:unit`, `npm run test:server`, and `npm run build` pass.
- [x] `npm run db:reset` and `npm run test:policies` pass; `npm run db:stop` recorded.
- [x] A search of the repository, excluding `docs/archive`, `docs/evidence`, and `node_modules`, for `firebase` and `cloudinary` is recorded with every remaining hit explained (REQ-039).

Checkpoint message: `feat(data): move auth, data, and uploads to supabase`

### Phase 4: Resident flows

Requirements: REQ-014, REQ-015, REQ-016, REQ-017, REQ-018 (resident view), REQ-019 (cancel), REQ-021, REQ-028 (mapping), REQ-030
Depends on: Phase 3
State: Complete except the PSGC barangay lists (blocked, see HANDOFF); checkpoint commit `feat(resident): barangay picker, offline replay, and honest failures`

#### Tasks

- [ ] Build `src/services/places/aklanPlaces.js` from the PSA Philippine Standard Geographic Code publication for Aklan; record the source URL, file, and retrieval date in evidence and `PLACES_SOURCE`.
- [x] If the PSGC source cannot be reached, record a blocker in `HANDOFF.md` asking Len for the file, continue with the 17 municipalities only, and never invent barangay names.
- [x] Update `reportSchemas.js` and the report repository to the section 2.1 and 2.2 contracts, including optional coordinates and `image_paths` from the uploader's `path`.
- [x] Add `submitReport.js`, `replayQueuedReports.js`, queue `discard`, `attempts`, and `lastFailure`.
- [x] Add `describeActionError.js`, and the `toPersonalReport` fields `municipality`, `barangay`, `landmark`, and `canCancel`.
- [x] Report form: municipality select, then barangay select, optional landmark, optional "Use my current location"; remove the latitude and longitude inputs.
- [x] Use `createReportSubmitter`; on `reason: "upload"` show "Send without photos"; on other failures show `EmergencyFallback` with hotlines from the directory plus 911.
- [x] Error summary at the top of the form, focused after a failed submit, linking each invalid field; every field error referenced by `aria-describedby`.
- [x] Pending reports panel on "My reports" and a banner on home, with "Send now" and "Discard"; `ResidentLayout` runs `replayQueuedReports` on mount and on the `online` event.
- [x] "Cancel" only when `canCancel`; cancel and "Load older reports" failures show `describeActionError` copy.
- [x] One advisories view on home; `/app/community` redirects to `/app`; delete `CommunityFeedPage.jsx`.
- [x] Account page profile edit for name, phone, and barangay using `updateOwnProfile`.

#### Verification

- [x] `npm run test:unit` passes, with tests for schema validation, the submitter's four outcomes, replay idempotency, discard, error mapping, the picker, the error summary focus, send without photos, the pending panel actions, replay on `online`, and cancel visibility.
- [x] `npm run db:reset` and `npm run test:policies` pass against the new report shape; `npm run db:stop` recorded.
- [x] `npm run lint` and `npm run build` pass.

Checkpoint message: `feat(resident): barangay picker, offline replay, and honest failures`

### Phase 5: Responder and reviewer flows, accessibility, and privacy copy

Requirements: REQ-018, REQ-019 (verify), REQ-022, REQ-023, REQ-024, REQ-025, REQ-026, REQ-027, REQ-028 (scan test), REQ-031, REQ-037 (services part), REQ-038 (privacy draft)
Depends on: Phase 4
State: Complete; checkpoint commit `feat(responder): paged queue, evidence review, and advisory publishing`

#### Tasks

- [x] Incident repository: cursor paging, `countIncidents` from `incident_counts`, claim on acknowledge, `verifyIncident`, `getPhotoUrls`, and the new `toIncident` fields.
- [x] Advisory repository: `publishAdvisory`, `unpublishAdvisory`, expiry filtering, `source`.
- [x] Review repository: applicant name and email from `profiles`, `getEvidenceUrl`, storage deletion with a checked result, and the `{ evidenceDeleted }` outcome.
- [x] Application repository: reapply after rejection; load failures reject.
- [x] A new migration with indexes for any new client query.
- [x] Replace `TransitionError` and `AlreadyClaimedError` with `Error`; share the whitespace and phone helpers from `profile.js`.
- [x] Incident queue "Load more" with `{ incidents, cursor, hasMore }`; dashboard from `countIncidents` with the counted time.
- [x] Incident detail: photo grid from `getPhotoUrls(imagePaths)`, a map link `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>` when coordinates exist, labels from `SEVERITY_LABELS`, `NEED_LABELS`, and `STATUS_LABELS`, "Verify" and "Reject" buttons; acknowledge performs a claim.
- [x] `/responder/advisories` page to publish and unpublish advisories.
- [x] Review queue: applicant name and email, "View ID" and "View selfie" through `getEvidenceUrl`, a notes field, and outcome messages including "evidence deletion pending".
- [x] Application page: error with retry on load failure; reapply form after rejection.
- [x] Cross-navigation: responder shell link to resident features; resident drawer link to `/responder` for responders.
- [x] `scroll-padding-bottom` equal to the bottom navigation height, `env(safe-area-inset-bottom)` on the navigation, and a focus trap in `Modal`.
- [x] Privacy page draft covering ID and selfie collection and deletion, Supabase as the data and file processor, the on-phone queue, partner sharing under D-5, the Data Privacy Act of 2012, and a contact; mark it "Draft, pending Len's review" in `HANDOFF.md` and do not present it as legal advice.
- [x] `src/test/copyScan.test.jsx` rendering every route and failing on the review section 5.1 strings.

#### Verification

- [x] `npm run test:unit` passes three consecutive times, with tests for paging, counts, claim on acknowledge, verify, publish and unpublish, evidence URL, deletion failure outcome, and reapply.
- [x] `npm run db:reset` and `npm run test:policies` pass with tests for counts over 30 incidents, publish and unpublish, signed photo and evidence links, and reapply; `npm run db:stop` recorded.
- [x] `npm run lint`, `npm run check:contrast`, and `npm run build` pass.

Checkpoint message: `feat(responder): paged queue, evidence review, and advisory publishing`

### Phase 6: API v1 foundation and integration clients

Requirements: REQ-032, REQ-033, REQ-040 (server part)
Depends on: Phase 5
State: Complete; checkpoint commit `feat(api): add the versioned api foundation and client keys`

#### Tasks

- [x] Add `server/http.mjs`: route table, JSON bodies with size limits, the error envelope, `X-Request-Id`, 404 and 405 for `/api`.
- [x] Add `server/auth.mjs`: `authenticateClient` for keys shaped `tbk_<clientId>_<secret>`, comparing SHA-256 hashes with `crypto.timingSafeEqual` and checking `status` and `scopes`.
- [x] Add `server/rateLimit.mjs` (in-memory token bucket per client id and per IP) and `server/log.mjs` (one JSON line per request, passed through `redactValue`).
- [x] Add `server/supabaseAdmin.mjs`, the only server file that imports `@supabase/supabase-js`, reading `SUPABASE_URL` and `SUPABASE_SECRET_KEY` and keeping no session.
- [x] Add `server/store.mjs` (the functions the routes need) and `tests/server/memoryStore.mjs` implementing the same functions for tests.
- [x] Add `GET /api/v1/health`.
- [x] Add `scripts/api-clients.mjs` with `create --name --scopes`, `list`, and `revoke --id`; `create` prints the key once and stores only the hash in `api_clients`.
- [x] Write `docs/api/openapi.json` for the routes that exist and `tests/server/openapi.test.mjs` that fails when the router and the document disagree.
- [x] Add `.env.example` key name `API_RATE_LIMIT_PER_MINUTE`.

#### Verification

- [x] `npm run test:server` covers: missing key 401, revoked key 401, wrong scope 403, rate limit 429, oversized body 413, unknown route 404 envelope, request id present.
- [x] With the local stack running, `scripts/api-clients.mjs` creates, lists, and revokes a client against the real `server/store.mjs`; `npm run db:stop` recorded.
- [x] `npm run lint`, `npm run test:unit`, and `npm run build` pass.
- [x] `npm audit --omit=dev --audit-level=high` result recorded.

Checkpoint message: `feat(api): add the versioned api foundation and client keys`

### Phase 7: Partner incidents, advisories, signals, and the DOST seam

Requirements: REQ-013 (hotline seeding tool), REQ-034, REQ-035, REQ-036
Depends on: Phase 6
State: Complete; checkpoint commit `feat(api): add partner incidents, signals, and the dost seam`

#### Tasks

- [x] `server/routes/incidents.mjs` with a fixed `toPartnerIncident` projection (D-5), filters, `since`, and a cursor encoding `updated_at` and id.
- [x] A new migration with the index for the partner incident query.
- [x] `server/routes/advisories.mjs`, public with `Access-Control-Allow-Origin: *` for `GET` only, excluding expired items.
- [x] `server/signals/canonicalSignal.mjs` (pure validation against `aklanPlaces.js`) and `server/routes/signals.mjs` calling `ingest_signal` through the store.
- [x] `server/integrations/dostSignal.mjs` exporting `toCanonicalSignal` and `verifyRequest`, both throwing a typed "contract pending" error, and the 501 route; fixtures under `tests/server/fixtures/dost-signal/` are labeled synthetic.
- [x] `scripts/seed-hotlines.mjs` loading `docs/hotline-seed.json` with every record left unverified.
- [x] Extend `docs/api/openapi.json`.

#### Verification

- [x] `npm run test:server` covers: projection never contains `contactPhone`, `description`, coordinates, or `reporterId`; cursor paging over 30 records; `since`; signal validation errors; repeated signal creates one advisory; expired advisory hidden; DOST route 501.
- [x] `npm run db:reset` and `npm run test:policies` pass; `npm run db:stop` recorded.
- [x] `npm run lint`, `npm run test:unit`, and `npm run build` pass.

Checkpoint message: `feat(api): add partner incidents, signals, and the dost seam`

### Phase 8: Documentation and release readiness

Requirements: REQ-037, REQ-038, and final verification of REQ-001 to REQ-043
Depends on: Phase 7
State: Draft, not started

#### Tasks

- [ ] Rewrite `README.md`.
- [ ] Rewrite `docs/operations.md` for the Node host and Supabase: local stack, build, start, environment keys by name, creating the hosted project, applying migrations, the first admin, hotline seeding, API client provisioning and revocation, the uptime check that prevents pausing, the email sender, and secret rotation including the S-01 exposure.
- [ ] Add `docs/api/README.md` for partners; update `docs/legacy-url-map.md`.
- [ ] Move `docs/final-architecture.md` and `docs/firebase-migration-note.md` to `docs/archive/` with a first line linking `docs/product/ARCHITECTURE.md`.
- [ ] Update `docs/SPEC_INDEX.md` and `HANDOFF.md`.

#### Verification

- [ ] `npm ci`, `npm run lint`, `npm run test:unit` three times, `npm run test:server`, `npm run db:start`, `npm run db:reset`, `npm run test:policies`, `npm run build`, and `npm run check` all pass; then `npm run db:stop`.
- [ ] Server smoke: `npm run build`, start with `PORT=18123`, then `/`, `/app/reports`, one `/assets/*` file, `/Homepage.html` (301), `/.env` (404), `/api/v1/health` (200), and `/api/v1/incidents` without a key (401); stop the server.
- [ ] Browser scenarios against the local stack, if a browser tool is available, each with a screenshot in `docs/evidence/screenshots/`: signed-out `/hotlines`; sign-up and sign-in; resident report with barangay only; send without photos with storage unavailable; offline report then replay; responder claim and advance; reviewer opens evidence and decides; keyboard-only report submission.
- [ ] Browser scenarios not run are listed as "Not run" for Len; hosted project and physical-device checks stay pending for Len.
- [ ] Every REQ has a row in `docs/evidence/FEAT-001.md` or an earlier track evidence file with an actual result or an explicit "Not run".

#### Review and checkpoint

- [ ] Review the full `feat-001/integration` diff against `main` for scope and unrelated changes, then follow section 1.4.
- [ ] Stop and report to Len; FEAT-001 is complete only after this commit succeeds.

Checkpoint message: `docs: document the supabase deployment and partner api`

## 4. Len's actions outside the agent's scope

- Approve Architecture Revision 2, FEAT-001 Revision 2, this plan Revision 2, and D-15 to D-19, including the new dependencies and parking Revision 1's B1 work on an archive branch.
- Keep Docker Desktop running while the agent works.
- Create the hosted Supabase project (Q-4), then after Phase 8 apply the migrations, create the first admin, verify and seed hotlines, and provision the DOST API client.
- Choose an SMTP provider and decide on email confirmation before real users (Q-5).
- Confirm the Supabase free plan limits on the pricing page before go-live.
- Try account recovery for the old Firebase project so it can be deleted, and delete or rotate the old Cloudinary account's secret (Q-6).
- Choose the Node host and domain (Q-1), then deploy.
- Obtain the DOST Signal contract (Q-2).
- Review the privacy page draft.
- Run hosted project and physical-device checks.
- Merge `feat-001/integration` into `main` and push.
- Remove the unused track worktrees and branches if wanted, and clean up the workspace-level duplicate agent toolkit folders and the nested `Project_Tabang/.agents/.claude/`.

## Recovery

Follow the workspace `AGENTS.md` for the three-attempt limit and immediate blockers.
Record unresolved work and attempt counts in `HANDOFF.md`.
Interrupted or failing work remains uncommitted and the phase remains incomplete.
When blocked, continue only with remaining tasks in the plan that do not depend on the blocked item, and never start a later phase whose checks depend on it.

## 5. Agent prompt

Start Claude Code in `../Project_Tabang-integration` only after `HANDOFF.md` there records Len's approval of Revision 2, then paste:

```text
You are the single implementing agent for Tabang FEAT-001 Revision 2. Execution mode is auto: run every phase of the plan in order without routine stops.

Working directory: the Project_Tabang-integration worktree on branch feat-001/integration. Never edit the main checkout ../Project_Tabang. The only edit outside this worktree is Phase 1's parking commit in ../Project_Tabang-track-b.

Read first, in full:
1. ../AGENTS.md (workspace rules: evidence, commits, three-attempt limit, no new dependency without approval, no push/reset/discard, plain dashes and one sentence per line in Markdown).
2. docs/SPEC_INDEX.md and HANDOFF.md.
3. docs/plans/FEAT-001-implementation.md, then docs/features/FEAT-001-stabilization-and-integration-api.md and docs/product/ARCHITECTURE.md, all Revision 2.
4. Run git status and git log -5 and reconcile them with HANDOFF.md; prior chat memory is not authoritative.

Precondition: HANDOFF.md must record Len's approval of the Revision 2 documents and of D-15 to D-19. If it does not, stop and report that you are waiting for approval.

Resume at the first phase in the plan whose checkpoint commit does not exist in git log, and continue through Phase 8.

For each phase: implement its tasks, run its verification commands, review the diff for correctness and simplicity, record actual results with times in docs/evidence/FEAT-001.md, tick the plan's task boxes, update HANDOFF.md, stage only reviewed paths (never git add -A or git add .), inspect git diff --cached, commit with the phase's checkpoint message, and confirm the hash with git log -1. Then continue.

Rules:
- Follow plan section 1: Docker must be running for db and policy commands; stop the local stack after each phase's checks; never touch a hosted Supabase project; never stage or print .env values or the untracked toolkit files.
- Import @supabase/supabase-js only in src/config/supabase.js and server/supabaseAdmin.mjs.
- Build Aklan barangays only from the PSA PSGC publication; never invent place names.
- Never describe an unrun check as passing. Record "Not run" with the reason.
- Never push, reset, deploy, or call real partner systems.
- Stop only for a real blocker: a third failed fix-and-check attempt on one problem, Docker or other access unavailable, a merge conflict, or a needed change to FEAT-001 behavior or architecture. When you stop, update HANDOFF.md first.

Report at the end, or at a stop: phases completed with commit hashes, checks run with results, items not run, blockers with attempt counts, and the exact next action.
```

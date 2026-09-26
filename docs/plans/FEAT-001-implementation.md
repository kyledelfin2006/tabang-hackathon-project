# Implementation Plan: FEAT-001 Stabilize core flows and open an integration API

Created: 2026-09-26T16:25:09+08:00
Updated: 2026-09-26T16:28:00+08:00
Revision: 1
Status: Approved
**Execution mode:** hard-stop
Feature spec and revision: [FEAT-001 Revision 1](../features/FEAT-001-stabilization-and-integration-api.md)
Approved baseline and architecture revisions: [Architecture Revision 1](../product/ARCHITECTURE.md), approved
Len's chat approval: Revision 1 and execution mode `hard-stop` approved by Len in chat on 2026-09-26 at about 16:27 +08:00: "Okay I approve"
Target branch: `feat-001/integration`, created from `main` at `80a51de`; Len merges it into `main`

Execution mode note: `hard-stop` was approved as proposed; each agent stops after every phase's verification and waits for Len's go-ahead.
Len may switch to `auto` later with `/implementation-plan mode auto`, effective at the next phase boundary.

## Scope

This plan implements REQ-001 to REQ-038 of FEAT-001 using three agents working at the same time.
Decisions D-5 to D-9 are approved, including the single new dependency `firebase-admin` (D-6).

Existing edits to preserve: the main checkout has untracked `.agents/` and `.claude/`; no agent touches them or the main checkout's working tree.
Workspace folders outside `Project_Tabang` are out of scope.

## 1. How three agents work in parallel

### 1.1 Tracks

| Track | Agent focus | Phases |
|---|---|---|
| A | Platform, server, API, integrations, CI, documentation, integration merges | A1 (gate G0), A2, A3, A4, A5 |
| B | Firestore rules and indexes, data services, domain modules, session handling | B1, B2, B3 |
| C | Routes, components, layouts, styles, public assets, UI tests | C1, C2, C3 |

### 1.2 Timeline and gates

```
G0 (A1 only)      G1 merge                      G2 merge and release readiness
A1 ──► A2 ──► A3 ──┤──► A4 ─────────► A5 ───────┤
       B1 ──► B2 ──┤──► B3 ─────────────────────┤
       C1 ──► C2 ──┤──► C3 ─────────────────────┤
```

- G0: A1 is committed on `feat-001/integration` and recorded in `HANDOFF.md` on that branch; only then do B and C create their branches.
- G1: A3, B2, and C2 checkpoints exist; A merges B, then C, then A into integration and runs the G1 checks; each track then merges integration back into its own branch.
- G2: A4, B3, and C3 checkpoints exist; A merges again, runs the full G2 checks, completes A5, and stops for Len.

### 1.3 Branches and worktrees

All paths are relative to `Project_Tabang`.
Nobody edits the main checkout (`Project_Tabang` on `main`).

| Worktree | Branch | Owner |
|---|---|---|
| `../Project_Tabang-integration` | `feat-001/integration` | A |
| `../Project_Tabang-track-a` | `feat-001/track-a` | A |
| `../Project_Tabang-track-b` | `feat-001/track-b` | B |
| `../Project_Tabang-track-c` | `feat-001/track-c` | C |

Setup inside every new worktree:

```bash
npm ci
cp ../Project_Tabang/.env .env   # local only, gitignored, never staged or printed
```

Merges use `git merge --no-ff`; nobody rebases, resets, force-updates, or pushes.

### 1.4 File ownership (applies after G0)

A track edits only paths it owns.
A needed change in another track's path goes into the requester's status file under "Requests" and waits for the owner.

| Owner | Paths |
|---|---|
| A | `server.mjs`, `server/**`, `scripts/**`, `tests/server/**`, `tests/redirects/**`, `.github/**`, `package.json`, `package-lock.json`, `.gitignore`, `.env.example`, `firebase.json`, `.firebaserc`, `eslint.config.js`, `.prettierrc.json`, root `*.html` except `index.html`, `docs/**` except other tracks' status and evidence files, `README.md`, `HANDOFF.md`, `AI_IMPLEMENTATION_PLAN.md` |
| B | `firebase/**`, `tests/rules/**`, `src/services/**`, `src/config/**`, `src/app/providers/**`, `src/test/*.test.js`, `src/test/fakeAuthGateway.js`, `src/test/authProviderBoot.test.jsx`, `docs/plans/FEAT-001-track-b-status.md`, `docs/evidence/FEAT-001-track-b.md` |
| C | `src/routes/**`, `src/components/**`, `src/layouts/**`, `src/app/App.jsx`, `src/app/router.jsx`, `src/app/ErrorBoundary.jsx`, `src/main.jsx`, `src/styles/**`, `index.html`, `public/**` except `public/google*.html`, `images/**`, `src/test/*.test.jsx` except `authProviderBoot.test.jsx`, `src/test/setup.js`, `vite.config.js`, `docs/plans/FEAT-001-track-c-status.md`, `docs/evidence/FEAT-001-track-c.md` |

A1 runs before any branch exists and may touch any path listed in its tasks.
Server code may import B's pure domain modules read-only (listed in section 2.1).

### 1.5 Status, evidence, and handoff

- Each track keeps `docs/plans/FEAT-001-track-<x>-status.md` with: current phase, done with checkpoint messages and hashes, next action, blockers with attempt counts, requests to other tracks, and contract change proposals.
- Each track keeps `docs/evidence/FEAT-001-track-<x>.md` in the `.agents/templates/docs/VERIFICATION.md` format with actual commands, results, times, and limitations.
- Only A edits `HANDOFF.md`, and only on the integration branch at G0, G1, and G2.
- Read another track's status without switching branches: `git show feat-001/track-b:docs/plans/FEAT-001-track-b-status.md`.

### 1.6 Shared-resource rules

- Only one process may use the Firestore emulator ports (18085, 19195) at a time.
- Before G1, only track B runs `npm run test:rules`; A runs it only in A1 and at the gates; C never runs it.
- On this machine `emulators:exec` can leave a Java process listening on 18085 after exit (observed 2026-09-26); after each rules run, stop only a `java` process on 18085 that your own run started, and record it.
- Server tests must listen on port 0 (an ephemeral port), never a fixed port.
- `npm run build` needs the local `.env`; do not commit `dist/`.

### 1.7 Contract changes

Section 2 is the contract between tracks.
A track may add fields or functions without asking.
Renaming, removing, or changing the meaning of a contract item requires a proposal in the status file and agreement recorded by the affected owner; a change to FEAT-001 behavior requires Len.

## 2. Interface contracts

### 2.1 Pure domain modules (owner B, consumed by A and C)

These must not import Firebase, React, browser globals, or Node built-ins.
B adds `src/test/domainPurity.test.js` that fails if they do.

| Module | Contract after B2 and B3 |
|---|---|
| `src/services/places/aklanPlaces.js` | `AKLAN_MUNICIPALITIES: readonly string[]` (17 entries); `barangaysFor(municipality): readonly string[]`; `isKnownPlace(municipality, barangay?): boolean`; `PLACES_SOURCE: { name, url, retrievedAt }` |
| `src/services/reports/reportSchemas.js` | `validateReport(kind, input)` where input has `municipality`, `barangay`, `landmark?`, `latitude?`, `longitude?` (both or neither), `description`, `contactPhone`, `severity` or `need` and `peopleAffected`; `SEVERITY_LABELS`, `NEED_LABELS`; `buildPublicSummary(values)` with readable labels |
| `src/services/incidents/incidentLifecycle.js` | Existing exports plus `STATUS_LABELS` and `ALLOWED_TRANSITIONS` exported for the rules parity test |
| `src/services/observability/redact.js` | Unchanged `redactText`, `redactValue`; used by `server/log.mjs` |
| `src/services/auth/roles.js`, `profile.js` | Unchanged |

### 2.2 Client services (owner B, consumed by C)

| Function | Contract |
|---|---|
| `createReportSubmitter({ repository, uploader, queue })` in `src/services/reports/submitReport.js` | `.submit({ reportId, reporterId, kind, form, attachments, skipPhotos, onProgress, signal })` resolves `{ status: "submitted" }` or `{ status: "invalid", errors }` or `{ status: "failed", reason: "upload" \| "network" \| "permission" \| "unknown", message }`; the report is queued before any network call and removed only on success |
| `replayQueuedReports({ queue, repository, reporterId })` in `src/services/reports/replayQueuedReports.js` | Sends queued text-only entries in order, idempotent by `reportId`; resolves `{ sent: string[], remaining: QueueEntry[] }` |
| `createSubmissionQueue()` | Adds `discard(reportId)`; entries carry `reportId`, `kind`, `values`, `queuedAtMillis`, `attempts`, `lastFailure` |
| `describeActionError(error)` in `src/services/errors/describeActionError.js` | Returns plain-language copy for Firestore, network, and upload failures; never returns `error.message` |
| `toPersonalReport` | Adds `municipality`, `barangay`, `landmark`, `canCancel` |
| `createIncidentRepository().listIncidents({ status, kind, cursor })` | Resolves `{ incidents, cursor, hasMore }` (was an array) |
| `createIncidentRepository().countIncidents()` | Resolves `{ openIncidents, unclaimed, overdue, verified, awaitingVerification, countedAtMillis }` using Firestore count queries |
| `createIncidentRepository().transitionIncident` | From `new` to `acknowledged` performs a claim |
| `createIncidentRepository().verifyIncident({ incidentId, verificationStatus, actorId, actorRole })` | `verificationStatus` is `verified` or `rejected`; appends an event |
| `toIncident` | Adds `imageUrls`, `municipality`, `barangay`, `landmark` |
| `createAdvisoryRepository()` | `listRecentAdvisories()` items add `source`, `municipality`, `expiresAtMillis` and exclude expired items; adds `publishAdvisory({ summary, municipality, barangay, actorId })` and `unpublishAdvisory(id)` |
| `createReviewRepository()` | Items add `applicantName`, `applicantEmail`; adds `getEvidenceUrl(publicId)`; `decide(...)` resolves `{ evidenceDeleted: boolean }` and never throws after the decision commits |
| `createApplicationRepository()` | `submitApplication` works after a rejection; `getMyApplication` rejects on failure instead of looking empty |
| `useAuth()` | Same shape; `status` stays `loading` until a changed user's session is built |

C builds against fakes of these functions until G1 or G2 brings the real ones.

### 2.3 HTTP (owner A, consumed by B and partners)

- Upload paths: `POST /api/v1/uploads/report-signature`, `/identity-signature`, `/identity-view`, `/identity-delete`, same bodies and responses as today.
- Legacy `/api/uploads/*` aliases stay until A5, which removes them only after B2's switch is merged.
- Partner and signal endpoints, error envelope, and schemas are defined in `../product/ARCHITECTURE.md`.
- Partner incident listing orders by `updatedAt` ascending then document id, with optional `municipality` equality and `since` on `updatedAt`; B adds the matching indexes in B3.

### 2.4 Routes (owner C, consumed by A's redirect map)

`/hotlines` is public; `/app/community` redirects to `/app`; `/responder/advisories` is the responder advisory page; all other paths are unchanged.

## 3. Phases

### Phase A1 (gate G0): Repository hygiene and a green baseline

Requirements: REQ-002, REQ-003, REQ-004, REQ-037 (partial), D-7, D-8
Depends on: plan approval (recorded)
State: Approved, not started

#### Tasks

- [ ] From `Project_Tabang`, create `feat-001/integration` from `main` in `../Project_Tabang-integration`, run the worktree setup, and work there.
- [ ] Copy these untracked planning files from the main checkout: `docs/SPEC_INDEX.md`, `docs/features/FEAT-001-stabilization-and-integration-api.md`, `docs/product/ARCHITECTURE.md`, `docs/plans/FEAT-001-implementation.md`, `HANDOFF.md`.
- [ ] Copy the workspace-root `PROJECT_REVIEW_REPORT.md` to `docs/evidence/2026-09-26-project-review.md`.
- [ ] Confirm the copied `HANDOFF.md` records Len's approval of the exact revisions, the execution mode, and D-5 to D-9; if it does not, stop.
- [ ] Change the `.gitignore` rule `uploads/` to `/uploads/`, remove `handa360/`, and add `scripts/uploads/cloudinarySignature.mjs` to Git.
- [ ] Make `scripts/security/scan-secrets.mjs` scan the files listed by `git ls-files`, so a tracked `.env` fails and an untracked one does not.
- [ ] Remove the `tabang-hackathon-project` gitlink and empty folder, `.idea/`, `.vscode/`, and `scripts/check-contrast.mjs`.
- [ ] Remove Firebase Storage (D-8): `firebase/storage.rules`, `tests/rules/storage.rules.test.mjs`, the storage block in `tests/rules/helpers/testEnvironment.mjs`, `emulators.storage` in `firebase.json`, `storage` in the `--only` lists in `package.json`, `VITE_STORAGE_EMULATOR_*` in `.env.example` and `src/config/env.js`, and the matching assertions in `src/test/firebase-config.test.js`.
- [ ] Set a 5000 ms async utility timeout in `src/test/setup.js` (`configure({ asyncUtilTimeout: 5000 })` from `@testing-library/react`) to remove the lazy-route timeouts.
- [ ] Lint `scripts/` and `tests/` with Node globals, drop the `JS/**` and `javascript/**` ignores, and add `npm run check:contrast` to CI.
- [ ] Move `AI_IMPLEMENTATION_PLAN.md` to `docs/archive/` with a header line linking this plan (D-7).
- [ ] Create `docs/plans/FEAT-001-track-a-status.md` and `docs/evidence/FEAT-001-track-a.md`.

#### Verification

- [ ] `npm run lint` passes.
- [ ] `npm run test:unit` passes three consecutive times (REQ-004).
- [ ] `npm run test:rules` passes, then the port 18085 cleanup is recorded.
- [ ] With the local `.env` present, `npm run check` passes (REQ-003).
- [ ] A throwaway worktree from the new integration commit runs `npm ci` and `npm run test:unit` successfully without copying any untracked file except `.env`, then is removed (REQ-002).
- [ ] Results recorded in `docs/evidence/FEAT-001-track-a.md`.

#### Review and checkpoint

- [ ] Review correctness, scope, dependencies, and unrelated changes.
- [ ] Update plan, evidence, and `HANDOFF.md` with "G0 complete" and the commit hash.
- [ ] Stage only the paths above and verify the staged diff.
- [ ] Commit and verify Git reports success.

Checkpoint message: `chore(repo): track the signing module and make checks pass on a fresh clone`
After this commit, A creates `feat-001/track-a` from integration in `../Project_Tabang-track-a`.

### Phase A2: Secure single-origin server and legacy redirects

Requirements: REQ-001, REQ-010, REQ-011, D-2, D-9
Depends on: G0
State: Approved, not started

#### Tasks

- [ ] Split `server.mjs` into `server/index.mjs` (entry exporting `createAppServer({ distRoot, env })`), `server/static.mjs`, and `server/securityHeaders.mjs`; keep the upload handlers working unchanged for now.
- [ ] Serve only resolved paths inside `dist/`; reject dotfiles, encoded traversal, and malformed URI encoding with 404 or 400; fall back to `dist/index.html` for extensionless `GET` requests outside `/api`.
- [ ] Apply the CSP and headers formerly in `firebase.json`, plus `Cache-Control` immutable for `/assets/*` and `no-store` for `index.html` and `service-worker.js`.
- [ ] Add `server/legacyRedirects.mjs` with 301s for every path in `docs/legacy-url-map.md`, sending `/Hotline.html` to `/hotlines`.
- [ ] Delete the 18 root stubs, `404.html`, and `legacy-index.html`; move `googlebf1b788405b1680b.html` to `public/`.
- [ ] Remove the `hosting` block from `firebase.json`; set `"start": "node server/index.mjs"`.
- [ ] Replace `tests/redirects/` with `tests/server/static.test.mjs` and `tests/server/redirects.test.mjs` using a temporary fixture `dist` directory and port 0; add `"test:server": "node --test tests/server/"` and put it in `check` and CI instead of `test:redirects`.
- [ ] Update `docs/legacy-url-map.md`.

#### Verification

- [ ] `npm run test:server` passes, including `/.env`, `/.git/config`, `/server.mjs`, `/package.json`, and `/%2e%2e/.env` returning 404 (REQ-001).
- [ ] `npm run lint` and `npm run test:unit` pass.
- [ ] `npm run build`, then `PORT=18123 npm start` and `curl -s -o /dev/null -w "%{http_code}"` for `/`, `/app/reports`, one `/assets/*` file, `/Homepage.html` (301), and `/.env` (404) match the expected codes; stop the server afterwards.
- [ ] Results recorded in track A evidence.

#### Review and checkpoint

- [ ] Review correctness, scope, dependencies, and unrelated changes.
- [ ] Update the track A status and evidence.
- [ ] Stage only reviewed paths and verify the staged diff.
- [ ] Commit and verify Git reports success.

Checkpoint message: `fix(server): serve only the build and redirect retired pages`

### Phase A3: API v1 foundation and integration clients

Requirements: REQ-032, REQ-033, D-6
Depends on: A2
State: Approved, not started

#### Tasks

- [ ] If D-6 is approved, run `npm install firebase-admin`; import it only from `server/firebaseAdmin.mjs`; if not approved, stop this phase and report.
- [ ] Add `server/http.mjs`: route table, JSON bodies with size limits, the error envelope, `X-Request-Id`, 404 and 405 for `/api`.
- [ ] Add `server/auth.mjs`: `verifyAppUser` with Admin `verifyIdToken`, `readRole` from `roleAssignments`, and `authenticateClient` for keys shaped `tbk_<clientId>_<secret>`, comparing SHA-256 hashes with `crypto.timingSafeEqual` and checking `status` and `scopes`.
- [ ] Add `server/rateLimit.mjs` (in-memory token bucket per client id and per IP) and `server/log.mjs` (one JSON line per request, passed through `redactValue`).
- [ ] Add `server/store.mjs` (Admin Firestore functions the routes need) and `tests/server/memoryStore.mjs` implementing the same functions for tests.
- [ ] Move the four upload handlers to `server/routes/uploads.mjs` under `/api/v1/uploads/*`, keep `/api/uploads/*` aliases, and switch token verification to `verifyAppUser`.
- [ ] Add `GET /api/v1/health`.
- [ ] Add `scripts/api-clients.mjs` with `create --name --scopes`, `list`, and `revoke --id`; `create` prints the key once and stores only the hash in `apiClients/{clientId}`.
- [ ] Write `docs/api/openapi.json` for the routes that exist and `tests/server/openapi.test.mjs` that fails when the router and the document disagree.
- [ ] Update `.env.example` with key names only: `FIREBASE_SERVICE_ACCOUNT_BASE64`, `API_RATE_LIMIT_PER_MINUTE`; remove `FIREBASE_WEB_API_KEY` if nothing uses it.

#### Verification

- [ ] `npm run test:server` covers: missing key 401, revoked key 401, wrong scope 403, rate limit 429, oversized body 413, unknown route 404 envelope, request id present.
- [ ] `npm run lint`, `npm run test:unit`, and `npm run build` pass.
- [ ] `npm audit --omit=dev --audit-level=high` result recorded.

#### Review and checkpoint

- [ ] Review correctness, scope, dependencies, and unrelated changes.
- [ ] Update the track A status and evidence.
- [ ] Stage only reviewed paths and verify the staged diff.
- [ ] Commit and verify Git reports success.

Checkpoint message: `feat(api): add the versioned api foundation and client keys`

### Phase B1: Rules that accept real data and close privilege gaps

Requirements: REQ-005, REQ-006, REQ-007, REQ-008, REQ-009, REQ-022 (rules), REQ-027 (rules), REQ-018 (rules)
Depends on: G0
State: Approved, not started

#### Tasks

- [ ] Create `feat-001/track-b` from `feat-001/integration` in `../Project_Tabang-track-b`, run the worktree setup, and create the track B status and evidence files.
- [ ] Report create: accept `assignedResponderIds == []`, `acknowledgedAt == null`, `resolvedAt == null`, and `priority == "medium"`; validate field types and lengths for `description`, `contactPhone`, `municipality`, `barangay`, `landmark`, `publicLocationLabel`, `imageUrls`, and optional `preciseLocation`.
- [ ] Use `resource.data.get("assignedResponderIds", [])` wherever the field is read, so older documents also work.
- [ ] Transitions and verification changes: only an assigned responder or a reviewer, except the claim itself on an unclaimed incident.
- [ ] Role assignments: reviewers may write only `resident` or `responder` and never their own document; only admins write `reviewer` or `admin`.
- [ ] Delete the `floodReports`, `helpRequests`, and `responders` blocks.
- [ ] Hotline aggregate: require `getAfter` of the caller's review document and a total change of at most 5 per count change.
- [ ] `publicFeed`: responders create and update with an allowlist of fields, `summary` up to 240 characters, `createdBy == request.auth.uid`, `source == "tabang"`; reviewers may unpublish any item.
- [ ] `responderApplications`: the owner may replace a `rejected` application with a new `pending` one without review fields.
- [ ] Add explicit deny tests for `signals` and `apiClients`.
- [ ] Rewrite the report-related rules tests to create reports through a resident context with the real client shape, then claim and transition as a responder.
- [ ] Add `src/test/transitionParity.test.js` comparing the rules' `allowedNextStatuses` table with `ALLOWED_TRANSITIONS`.

#### Verification

- [ ] `npm run test:rules` passes, with the new and rewritten tests listed by name in evidence; port cleanup recorded.
- [ ] `npm run lint` and `npm run test:unit` pass.

#### Review and checkpoint

- [ ] Review correctness, scope, dependencies, and unrelated changes.
- [ ] Update the track B status and evidence.
- [ ] Stage only reviewed paths and verify the staged diff.
- [ ] Commit and verify Git reports success.

Checkpoint message: `fix(rules): accept real report shapes and close privilege gaps`
Deploying these rules to production is Len's action after G2.

### Phase B2: Barangay locations, report submission, offline replay, and stable sessions

Requirements: REQ-014, REQ-015, REQ-016, REQ-020, REQ-021 (service), REQ-028 (mapping)
Depends on: B1
State: Approved, not started

#### Tasks

- [ ] Build `src/services/places/aklanPlaces.js` from the PSA Philippine Standard Geographic Code publication for Aklan; record the source URL, file, and retrieval date in evidence and `PLACES_SOURCE`.
- [ ] If the PSGC source cannot be reached, stop this task, record a blocker asking Len for the file, and continue the remaining B2 tasks with the 17 municipalities only; never invent barangay names.
- [ ] Update `reportSchemas.js` and `buildReportDocument` to the section 2.1 contract, including `assignedResponderIds: []`, `acknowledgedAt: null`, `resolvedAt: null`, and `imageUrls` from the uploader's `secureUrl`.
- [ ] Add `submitReport.js`, `replayQueuedReports.js`, queue `discard`, attempts, and `lastFailure`.
- [ ] Add `describeActionError.js`.
- [ ] Switch `cloudinaryUploader.js`, `applicationRepository.js`, and `reviewRepository.js` to the `/api/v1/uploads/*` paths.
- [ ] Session: subscribe only to `onIdTokenChanged`, ignore stale session builds with a sequence number, and keep `status` as `loading` while a changed user's session is built; update `fakeAuthGateway.js` and `authProviderBoot.test.jsx`.
- [ ] Add `toPersonalReport` fields `municipality`, `barangay`, `landmark`, `canCancel`.
- [ ] Add `src/test/domainPurity.test.js`.

#### Verification

- [ ] `npm run test:unit` passes, with new tests for schema validation, the submitter's four outcomes, replay idempotency, discard, error mapping, and the sign-out race.
- [ ] `npm run test:rules` passes against the new document shape.
- [ ] `npm run lint` passes.

#### Review and checkpoint

- [ ] Review correctness, scope, dependencies, and unrelated changes.
- [ ] Update the track B status and evidence.
- [ ] Stage only reviewed paths and verify the staged diff.
- [ ] Commit and verify Git reports success.

Checkpoint message: `feat(reports): add barangay locations, offline replay, and stable sessions`

### Phase C1: Public emergency access, honest copy, and page structure

Requirements: REQ-012, REQ-013, REQ-028 (copy), REQ-029, REQ-037 (UI part)
Depends on: G0
State: Approved, not started

#### Tasks

- [ ] Create `feat-001/track-c` from `feat-001/integration` in `../Project_Tabang-track-c`, run the worktree setup, and create the track C status and evidence files.
- [ ] Add a public `/hotlines` route under `PublicLayout` reusing `HotlineDirectoryPage`; show an always-present emergency card with `tel:911` and barangay guidance, including in the empty and error states.
- [ ] Put the emergency card and a hotlines link on the landing page.
- [ ] Collapse the hotline rating form behind a disclosure button.
- [ ] Remove or rewrite every string in review section 5.1 and the ErrorBoundary noticeboard claim; `RouteErrorPage` shows friendly copy, not `error.message`.
- [ ] Per-route titles through route `handle.title` read with `useMatches` in each layout; move focus to the page `h1` (with `tabIndex={-1}`) after navigation.
- [ ] One `h1` per page inside `main`; the header brand is not a heading; `Section` levels follow the page `h1` without skips.
- [ ] Move `images/tabang-logo.png` to `public/images/`, show it in the header with alt text, delete the other files in `images/`, and fix manifest and `index.html` colors and description.
- [ ] Delete the toast system, the `AppHeader` `actionLabel` and `actionHref` props, and `fallbackElement`.

#### Verification

- [ ] `npm run test:unit` passes three consecutive times, with tests for signed-out `/hotlines`, the 911 fallback, titles per route, and one `h1` per route.
- [ ] `npm run lint`, `npm run check:contrast`, and `npm run build` pass.
- [ ] The built `dist/manifest.webmanifest` icon path exists in `dist/`.

#### Review and checkpoint

- [ ] Review correctness, scope, dependencies, and unrelated changes.
- [ ] Update the track C status and evidence.
- [ ] Stage only reviewed paths and verify the staged diff.
- [ ] Commit and verify Git reports success.

Checkpoint message: `fix(ui): make hotlines public and remove developer copy`

### Phase C2: Resident flows

Requirements: REQ-014 (UI), REQ-015, REQ-016 (UI), REQ-017, REQ-018 (UI), REQ-019 (cancel), REQ-021, REQ-030
Depends on: C1; builds on section 2.2 contracts with injected fakes until G1
State: Approved, not started

#### Tasks

- [ ] Report form: municipality select, then barangay select, optional landmark, optional "Use my current location"; remove the latitude and longitude inputs.
- [ ] Use `createReportSubmitter`; on `reason: "upload"` show "Send without photos"; on other failures show `EmergencyFallback` with hotlines loaded from the directory plus 911.
- [ ] Error summary at the top of the form, focused after a failed submit, linking each invalid field; every field error referenced by `aria-describedby`.
- [ ] Pending reports panel on "My reports" and a banner on home, with "Send now" and "Discard"; `ResidentLayout` runs `replayQueuedReports` on mount and on the `online` event.
- [ ] "Cancel" only when `canCancel`; failures and "Load older reports" failures show `describeActionError` copy.
- [ ] One advisories view on home; `/app/community` redirects to `/app`; delete `CommunityFeedPage.jsx`.
- [ ] Account page profile edit for name, phone, and barangay using `updateOwnProfile`.

#### Verification

- [ ] `npm run test:unit` passes, with tests for the picker, the error summary focus, send without photos, the pending panel actions, replay on `online`, and cancel visibility.
- [ ] `npm run lint` and `npm run build` pass.

#### Review and checkpoint

- [ ] Review correctness, scope, dependencies, and unrelated changes.
- [ ] Update the track C status and evidence.
- [ ] Stage only reviewed paths and verify the staged diff.
- [ ] Commit and verify Git reports success.

Checkpoint message: `feat(resident): barangay picker, offline queue controls, and honest failures`

### Gate G1: First integration

Performed by A after the A3, B2, and C2 checkpoints exist.

- [ ] In `../Project_Tabang-integration`: `git merge --no-ff feat-001/track-b`, then `feat-001/track-c`, then `feat-001/track-a`.
- [ ] On any conflict: `git merge --abort`, record the files and the owning track in `HANDOFF.md`, and stop; the integrator never hand-edits another track's files.
- [ ] Run `npm ci`, `npm run lint`, `npm run test:unit`, `npm run test:server`, `npm run test:rules`, and `npm run build`; record results in track A evidence.
- [ ] A failing check is assigned to its owning track in `HANDOFF.md`; that track fixes it on its branch and A re-merges.
- [ ] When green, update `HANDOFF.md` with "G1 complete" and the merge commit hashes.
- [ ] Each track then runs `git merge --no-ff feat-001/integration` in its own worktree before starting its next phase.

### Phase A4: Partner incidents, advisories, signals, and the DOST Signal seam

Requirements: REQ-034, REQ-035, REQ-036, REQ-013 (hotline seeding tool)
Depends on: A3, G1
State: Approved, not started

#### Tasks

- [ ] `server/routes/incidents.mjs` with a fixed `toPartnerIncident` projection (D-5), filters, `since`, and a cursor encoding `updatedAt` and id.
- [ ] `server/routes/advisories.mjs`, public with `Access-Control-Allow-Origin: *` for `GET` only, excluding expired items.
- [ ] `server/signals/canonicalSignal.mjs` (pure validation against `aklanPlaces.js`) and `server/routes/signals.mjs` upserting `signals/{source}__{externalId}` and its `publicFeed` item in one transaction.
- [ ] `server/integrations/dostSignal.mjs` exporting `toCanonicalSignal` and `verifyRequest`, both throwing a typed "contract pending" error, and the 501 route; fixtures under `tests/server/fixtures/dost-signal/` are labeled synthetic.
- [ ] `scripts/seed-hotlines.mjs` loading `docs/hotline-seed.json` with every record left unverified.
- [ ] Record index requests for the partner query in the track A status file for B.
- [ ] Extend `docs/api/openapi.json`.

#### Verification

- [ ] `npm run test:server` covers: projection never contains `contactPhone`, `description`, `preciseLocation`, or `reporterId`; cursor paging over 30 records; `since`; signal validation errors; repeated signal creates one advisory; expired advisory hidden; DOST route 501.
- [ ] `npm run lint` and `npm run test:unit` pass.

#### Review and checkpoint

- [ ] Review correctness, scope, dependencies, and unrelated changes.
- [ ] Update the track A status and evidence.
- [ ] Stage only reviewed paths and verify the staged diff.
- [ ] Commit and verify Git reports success.

Checkpoint message: `feat(api): add partner incident, advisory, and signal endpoints`

### Phase B3: Responder, reviewer, and advisory services

Requirements: REQ-018, REQ-019, REQ-022, REQ-023, REQ-024, REQ-026, REQ-027, REQ-037 (services part)
Depends on: B2, G1
State: Approved, not started

#### Tasks

- [ ] Incident repository: cursor paging, `countIncidents` with `getCountFromServer`, claim on acknowledge, `verifyIncident`, and the new `toIncident` fields.
- [ ] Advisory repository: `publishAdvisory`, `unpublishAdvisory`, expiry filtering, `source`.
- [ ] Review repository: applicant name and email from `users/{uid}`, `getEvidenceUrl`, checked delete responses, and the `{ evidenceDeleted }` outcome.
- [ ] Application repository: reapply after rejection; load failures reject.
- [ ] `firestore.indexes.json`: indexes for the partner query requested by A and any new client query.
- [ ] Remove `getFirebaseApp`; replace `TransitionError` and `AlreadyClaimedError` with `Error`; share the whitespace and phone helpers from `profile.js`.

#### Verification

- [ ] `npm run test:unit` passes with tests for paging, counts, claim on acknowledge, verify, publish and unpublish, evidence URL, deletion failure outcome, and reapply.
- [ ] `npm run test:rules` passes with emulator tests for count queries, publish rules, and reapply.
- [ ] `npm run lint` passes.

#### Review and checkpoint

- [ ] Review correctness, scope, dependencies, and unrelated changes.
- [ ] Update the track B status and evidence.
- [ ] Stage only reviewed paths and verify the staged diff.
- [ ] Commit and verify Git reports success.

Checkpoint message: `feat(incidents): page the queue, count exactly, and give reviewers evidence`

### Phase C3: Responder and reviewer UI, accessibility, and privacy copy

Requirements: REQ-019 (verify), REQ-023, REQ-024, REQ-025, REQ-026, REQ-027, REQ-028 (scan test), REQ-031, REQ-038 (privacy draft)
Depends on: C2, G1; uses section 2.2 contracts with fakes until G2
State: Approved, not started

#### Tasks

- [ ] Incident queue "Load more" with `{ incidents, cursor, hasMore }`; dashboard from `countIncidents` with the counted time.
- [ ] Incident detail: photo grid from `imageUrls`, a map link `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>` when coordinates exist, labels from `SEVERITY_LABELS`, `NEED_LABELS`, and `STATUS_LABELS`, "Verify" and "Reject" buttons, acknowledge performs a claim.
- [ ] `/responder/advisories` page to publish and unpublish advisories.
- [ ] Review queue: applicant name and email, "View ID" and "View selfie" through `getEvidenceUrl`, a notes field, and outcome messages including "evidence deletion pending".
- [ ] Application page: error with retry on load failure; reapply form after rejection.
- [ ] Cross-navigation: responder shell link to resident features; resident drawer link to `/responder` for responders.
- [ ] `scroll-padding-bottom` equal to the bottom navigation height, `env(safe-area-inset-bottom)` on the navigation, and a focus trap in `Modal`.
- [ ] Privacy page draft covering ID and selfie collection and deletion, Cloudinary as processor, the on-phone queue, partner sharing under D-5, the Data Privacy Act of 2012, and a contact; mark it "Draft, pending Len's review" in the status file.
- [ ] `src/test/copyScan.test.jsx` rendering every route and failing on the section 5.1 strings.

#### Verification

- [ ] `npm run test:unit` passes three consecutive times.
- [ ] `npm run lint`, `npm run check:contrast`, and `npm run build` pass.

#### Review and checkpoint

- [ ] Review correctness, scope, dependencies, and unrelated changes.
- [ ] Update the track C status and evidence.
- [ ] Stage only reviewed paths and verify the staged diff.
- [ ] Commit and verify Git reports success.

Checkpoint message: `feat(responder): paged queue, evidence review, and advisory publishing`

### Gate G2 and Phase A5: Final integration and release readiness

Requirements: REQ-037, REQ-038, and final verification of REQ-001 to REQ-038
Depends on: A4, B3, C3
State: Approved, not started

#### Tasks

- [ ] Merge B, then C, then A into integration as in G1, with the same conflict rule.
- [ ] Remove the `/api/uploads/*` aliases now that B2 is merged; commit on `feat-001/track-a` and merge.
- [ ] Documentation: rewrite `README.md`; rewrite `docs/operations.md` for the Node host (build, start, environment keys by name, uptime check, secret rotation including the S-01 exposure, API client provisioning and revocation, hotline seeding, first reviewer, rules deploy, emulator port cleanup); add `docs/api/README.md` for partners; update `docs/legacy-url-map.md`.
- [ ] Move `docs/final-architecture.md` and `docs/firebase-migration-note.md` to `docs/archive/` with a first line linking `docs/product/ARCHITECTURE.md`.
- [ ] Update `docs/SPEC_INDEX.md` and `HANDOFF.md`.

#### Verification

- [ ] `npm ci`, `npm run lint`, `npm run test:unit` three times, `npm run test:server`, `npm run test:rules`, `npm run build`, and `npm run check` all pass on the integration branch.
- [ ] Server smoke: `npm run build`, `PORT=18123 npm start`, then the A2 curl list plus `/api/v1/health` 200 and `/api/v1/incidents` without a key 401.
- [ ] Browser scenarios, if a browser tool is available, each with a screenshot in `docs/evidence/screenshots/`: signed-out `/hotlines`; resident report with barangay only; send without photos with uploads disabled; offline report then replay; responder claim and advance; reviewer opens evidence and decides; keyboard-only report submission.
- [ ] Browser scenarios not run are listed as "Not run" for Len; physical-device checks stay pending for Len.
- [ ] Every REQ has a row in some track's evidence file with an actual result or an explicit "Not run".

#### Review and checkpoint

- [ ] Review the full integration diff against `main` for scope and unrelated changes.
- [ ] Update plan states, evidence, `docs/SPEC_INDEX.md`, and `HANDOFF.md`.
- [ ] Stage only reviewed paths and verify the staged diff.
- [ ] Commit and verify Git reports success, then stop for Len.

Checkpoint message: `docs: document the single-origin deployment and partner api`

## 4. Len's actions outside the agents' scope

- Approve FEAT-001 Revision 1, Architecture Revision 1, this plan Revision 1, the execution mode, and D-5 to D-9 (including `firebase-admin`).
- Rotate the Cloudinary API secret if the current `server.mjs` was ever reachable from another machine.
- Provide a Firebase service account for local development and the host, stored only in `.env` and host secrets.
- Choose the Node host and domain (Q-1), then deploy.
- After G2, deploy rules and indexes with `npm run deploy:rules`, seed the first reviewer, verify and seed hotlines, and provision the DOST API client.
- Obtain the DOST Signal contract (Q-2).
- Review the privacy page draft.
- Run physical-device checks.
- Merge `feat-001/integration` into `main` and push.
- Clean up the workspace-level duplicate agent toolkit folders and the nested `Project_Tabang/.agents/.claude/`.

## Recovery

Follow the workspace `AGENTS.md` for the three-attempt limit and immediate blockers.
Each track records unresolved work and attempt counts in its status file; A copies blockers into `HANDOFF.md` at each gate.
Interrupted or failing work remains uncommitted and the phase remains incomplete.
A blocked track continues only with its own tasks that do not depend on the blocked item.

## 5. Agent prompts

Each prompt is self-contained and works for Claude Code, Codex, or Gemini.
Start all three after Len records approval; B and C wait until G0 is complete.

### Prompt for Agent A: Platform, API, and integration

```text
You are Agent A on Tabang FEAT-001. You own track A: repository hygiene (gate G0), the single-origin Node server, the /api/v1 API, the DOST Signal adapter seam, CI, documentation, and all integration merges.

Repository: C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Tabang/Project_Tabang (branch main). Never edit files in this main checkout. Work only in the worktrees named in the plan.

Read first, in full:
1. ../AGENTS.md (workspace root rules: evidence, commits, three-attempt limit, no new dependency without approval, no push/reset/discard, plain dashes and one sentence per line in Markdown).
2. docs/plans/FEAT-001-implementation.md (this plan; you will copy it into the integration branch in A1).
3. docs/features/FEAT-001-stabilization-and-integration-api.md and docs/product/ARCHITECTURE.md.
4. HANDOFF.md, then run git status and git log -5 to reconcile.

Preconditions: HANDOFF.md must record Len's approval of the exact revisions and of D-6 (firebase-admin). If approval is not recorded, stop and report that you are waiting for approval.

Do, in order: Phase A1 (gate G0) in ../Project_Tabang-integration, then create feat-001/track-a in ../Project_Tabang-track-a and do A2 and A3. Then perform Gate G1 when feat-001/track-b and feat-001/track-c show B2 and C2 checkpoints in their status files (read them with git show <branch>:<path>). If they are not ready, keep working on A4 tasks that do not need G1, and check again after each commit. Then A4, then Gate G2 and A5.

Rules:
- Edit only track A paths from section 1.4, except in A1. Put requests for other tracks in docs/plans/FEAT-001-track-a-status.md.
- Only you edit HANDOFF.md, only on feat-001/integration, only at G0, G1, G2.
- Before G1, run npm run test:rules only in A1. Server tests listen on port 0.
- Merges: git merge --no-ff only. On a conflict run git merge --abort, record it in HANDOFF.md, and stop; never hand-edit another track's files.
- Each phase: implement, run the listed verification, review the diff for correctness and simplicity (no speculative code), record actual results with times in docs/evidence/FEAT-001-track-a.md, update your status file, stage only reviewed paths, inspect the staged diff, commit with the phase's checkpoint message, and confirm the hash with git log -1.
- Never print, commit, or log secret values; the local .env is copied, never staged.
- Do not deploy, push, change production Firebase, or call real partner systems.
- Execution mode is in the plan header; in hard-stop mode, stop after each phase's verification and report.

Report at every stop: phase, commit hash, checks run with results, what is not run, blockers with attempt counts, and the exact next action.
```

### Prompt for Agent B: Rules, data, and services

```text
You are Agent B on Tabang FEAT-001. You own track B: Firestore rules and indexes, rules tests, the client data services and pure domain modules, and session handling.

Repository: C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Tabang/Project_Tabang. Never edit the main checkout. Your worktree is ../Project_Tabang-track-b on branch feat-001/track-b.

Read first, in full:
1. ../AGENTS.md (workspace root rules).
2. The plan, spec, and architecture as committed on the integration branch: git show feat-001/integration:docs/plans/FEAT-001-implementation.md, and the files it links.
3. git show feat-001/integration:HANDOFF.md.

Precondition: HANDOFF.md on feat-001/integration says "G0 complete". If the branch or that line does not exist, stop and report "waiting for G0".

Setup: git worktree add ../Project_Tabang-track-b -b feat-001/track-b feat-001/integration, then npm ci and copy ../Project_Tabang/.env to .env (never stage it). Create docs/plans/FEAT-001-track-b-status.md and docs/evidence/FEAT-001-track-b.md.

Do Phases B1 and B2. Then wait until HANDOFF.md on feat-001/integration says "G1 complete", run git merge --no-ff feat-001/integration in your worktree, and do B3. Stop after B3 and report.

Rules:
- Edit only track B paths from plan section 1.4. Requests for other tracks go in your status file. Check feat-001/track-a's status file for index requests before B3.
- Keep the section 2.1 modules free of Firebase, React, browser, and Node imports; implement exactly the section 2.2 contracts. Propose any rename or removal in your status file instead of doing it.
- You are the only track that runs npm run test:rules before G1. After each run, if a java process you started still listens on port 18085, stop it and record that.
- Build Aklan barangays only from the PSA PSGC publication, recording source and retrieval date; if you cannot reach it, record a blocker and never invent names.
- Rules tests must create reports through a resident client using buildReportDocument, never by seeding shapes the client cannot write.
- Each phase: implement, verify with the listed commands, review the diff, record actual results with times in your evidence file, update your status file, stage only reviewed paths, inspect the staged diff, commit with the checkpoint message, confirm with git log -1.
- Never deploy rules to production, push, reset, or print secrets. Follow the three-attempt limit.
- Execution mode is in the plan header; in hard-stop mode, stop after each phase's verification and report.

Report at every stop: phase, commit hash, checks run with results, not run items, blockers with attempt counts, contract proposals, and the exact next action.
```

### Prompt for Agent C: UI and user flows

```text
You are Agent C on Tabang FEAT-001. You own track C: routes, components, layouts, styles, public assets, and UI tests. Your goal is that an anonymous visitor, a resident, a responder, and a reviewer can each complete their flow accessibly and without developer language on screen.

Repository: C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Tabang/Project_Tabang. Never edit the main checkout. Your worktree is ../Project_Tabang-track-c on branch feat-001/track-c.

Read first, in full:
1. ../AGENTS.md (workspace root rules).
2. git show feat-001/integration:docs/plans/FEAT-001-implementation.md, the spec and architecture it links, and docs/evidence/2026-09-26-project-review.md sections 4 and 5.
3. git show feat-001/integration:HANDOFF.md.

Precondition: HANDOFF.md on feat-001/integration says "G0 complete". If not, stop and report "waiting for G0".

Setup: git worktree add ../Project_Tabang-track-c -b feat-001/track-c feat-001/integration, then npm ci and copy ../Project_Tabang/.env to .env (never stage it). Create docs/plans/FEAT-001-track-c-status.md and docs/evidence/FEAT-001-track-c.md.

Do Phases C1 and C2. Then wait until HANDOFF.md on feat-001/integration says "G1 complete", run git merge --no-ff feat-001/integration in your worktree, and do C3. Stop after C3 and report.

Rules:
- Edit only track C paths from plan section 1.4. Requests for other tracks go in your status file.
- Code against the section 2.2 service contracts. Until the real functions are merged, inject fakes through the existing repository props in tests; do not write your own versions inside src/services.
- Never run npm run test:rules or start the Firestore emulator.
- Use the project's ui-ux-pro-max skill for focused checks (for example "error summary validation" --domain ux) and follow WCAG 2.2 AA: one h1 per page, per-route titles, focus management, labelled errors, 44 px targets, contrast checked with npm run check:contrast.
- No new dependency. No map library: location is a municipality and barangay picker with optional GPS.
- User-facing copy is plain, calm, and specific; never show error.message from Firebase; never claim a report was delivered unless the submitter returned "submitted".
- The privacy page is a draft for Len's review; do not present it as legal advice.
- Each phase: implement, verify with the listed commands (unit tests three consecutive runs where the plan says so), review the diff, record actual results with times in your evidence file, attach screenshots if a browser tool is available, update your status file, stage only reviewed paths, inspect the staged diff, commit with the checkpoint message, confirm with git log -1.
- Never push, reset, deploy, or print secrets. Follow the three-attempt limit.
- Execution mode is in the plan header; in hard-stop mode, stop after each phase's verification and report.

Report at every stop: phase, commit hash, checks run with results, not run items, blockers with attempt counts, contract proposals, and the exact next action.
```

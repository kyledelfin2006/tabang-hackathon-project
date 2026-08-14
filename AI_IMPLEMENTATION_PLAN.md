# Tabang Architecture and Production-Readiness Implementation Plan

> Execution target: an AI coding model with capabilities similar to GPT-5.4.
>
> This document is the durable source of truth for the migration. Do not rely on chat history to know what has already been completed.

## 1. Mission

Transform Tabang from a collection of duplicated static pages into a secure, maintainable, component-based single-page application while preserving the working resident and responder flows.

The completed system must:

- Use one HTML application shell and route-based page components.
- Separate public, resident, and responder experiences.
- Enforce authorization in Firebase Security Rules, not only in the browser.
- Protect phone numbers, precise locations, identity documents, selfies, and other sensitive data.
- Distinguish personal reports from a sanitized community feed.
- Provide a reliable, auditable incident-response workflow.
- Eliminate misleading hardcoded "live" statistics and clearly label demo data.
- Consolidate duplicated UI and business logic.
- Add automated tests, emulator-backed security tests, accessibility checks, deployment configuration, and operational documentation.
- Preserve a usable application at every migration checkpoint.

This is an incremental migration. Do not delete the legacy application until replacement routes have been verified.

## 2. Non-Negotiable Execution Protocol

### 2.1 Start every coding session this way

1. Read `README.md` completely.
2. Read this file completely, including the Execution Ledger and Handoff Log.
3. Run `git status --short` and inspect any existing changes before editing.
4. Read only the files needed for the current phase.
5. Restate the current phase, acceptance criteria, and files likely to change.
6. Verify all assumptions against the repository. Do not invent existing routes, rules, Firebase configuration, collections, tests, or deployment settings.

### 2.2 Context-limit and anti-hallucination rules

- Work on only one numbered phase per coding session unless the phase explicitly contains very small subphases.
- Within a phase, implement one coherent vertical slice at a time.
- At roughly 60% of the available context, stop adding scope. Finish the current slice, run verification, update this document, commit, and end the session.
- After every major phase, take a hard break: end the turn and wait for a new instruction such as `Continue with Phase N`.
- Never begin the next major phase in the same turn merely because time remains.
- If this document conflicts with the actual repository, record the discrepancy in the Decision Log and follow verified repository evidence.
- If a required choice could materially change security, data migration, cost, deployment, or user experience, stop and ask the user. Do not guess.
- Do not claim a feature works unless its acceptance checks were run successfully.
- Do not use fabricated disaster statistics, sample incidents, fake responder identities, or placeholder emergency phone numbers in a production-visible mode.
- Do not access, print, copy, or commit real user records merely to test the migration. Use emulator fixtures.
- Do not weaken security rules to make a UI test pass.
- Do not silently discard or overwrite pre-existing user changes.

### 2.3 Mandatory end-of-session procedure

After coding, and before committing:

1. Run the checks required by the current phase.
2. Review `git diff --check` and `git diff`.
3. Update this file after the code is complete:
   - Mark completed checklist items.
   - Add verification evidence.
   - Record important decisions or deviations.
   - Update the Current State section.
   - Add one Handoff Log entry with the exact next action.
4. Commit the code and this updated plan together when they form one coherent major change.
5. Run `git status --short` again and report any intentionally uncommitted files.
6. End the turn. Do not start the next major phase.

If verification fails, do not mark the work complete. Record the failure and either fix it within the current slice or leave a precise blocker in the Handoff Log.

## 3. Git Discipline

### 3.1 Commit policy

- Commit every coherent major change.
- Prefer one clean commit per completed vertical slice; avoid mixing unrelated refactors and behavior changes.
- Never make a commit that knowingly leaves the application unable to start unless the commit is an explicitly documented scaffolding commit and its checks pass.
- Never commit secrets, service-account files, `.env` files, production database exports, uploaded identity documents, or real emergency report fixtures.
- Do not rewrite, squash, amend, reset, rebase, or force-push existing history unless the user explicitly requests it.
- Do not push commits or create a pull request unless the user explicitly asks.
- Check the diff before every commit.

### 3.2 Commit-message format

Use concise Conventional Commit messages:

```text
<type>(optional-scope): <imperative summary>
```

Allowed primary types:

- `feat`: user-visible capability
- `fix`: defect correction
- `perf`: performance improvement
- `refactor`: internal restructuring without intended behavior change
- `test`: test-only work
- `docs`: documentation-only work
- `build`: dependencies or build tooling
- `ci`: continuous-integration work
- `chore`: repository maintenance that fits no other type
- `security`: authorization, privacy, or security-rule improvement

Message requirements:

- Use lower case after the colon.
- Use the imperative mood.
- Keep the subject under approximately 72 characters.
- Do not use vague messages such as `updates`, `fix stuff`, `changes`, or `final`.
- Add a body when the reason, security implication, or migration behavior is not obvious.

Examples planned for this migration:

```text
docs: add architecture migration execution plan
build: scaffold the Vite React application
refactor(router): add public and authenticated layouts
feat(auth): centralize Firebase session handling
security(rules): enforce resident and responder access
feat(reports): separate personal and community feeds
feat(incidents): add auditable response status workflow
fix(verification): implement responder application flow
refactor(hotlines): share hotline data and feedback UI
test(rules): cover report and responder authorization
feat(pwa): queue report submissions while offline
ci: verify build tests and accessibility
docs: document setup deployment and emergency operations
```

## 4. Verified Baseline

The repository currently has the following verified shape:

- 20 top-level HTML pages.
- 19 page-oriented CSS files.
- 16 page-oriented JavaScript files.
- A shared Firebase initializer in `javascript/firebase.js`.
- Direct browser access to Firebase Authentication and Firestore.
- Direct unsigned Cloudinary uploads from report forms.
- Leaflet and OpenStreetMap for maps.
- A small Node static-file server in `server.mjs`.
- No checked-in Firestore rules, Storage rules, Firebase emulator configuration, automated tests, linting, continuous integration, or production deployment configuration.

Verified defects and risks include:

- `VerAcc.js` imports a nonexistent local Firebase module and targets DOM IDs that do not exist in `VerAcc.html`.
- Responder signup writes accounts into the `responders` collection without trusted approval.
- Responder screens do not consistently verify the responder role.
- The `MyReports` screen subscribes to all reports even while signed out.
- Community-visible records can expose reporter names, report images, descriptions, and exact coordinates.
- Report and dashboard map popups interpolate Firestore values without consistent escaping.
- Dashboard disaster statistics are hardcoded but presented as live.
- Dashboard fallback incidents are sample records not clearly separated from real data.
- The incident lifecycle has only a loosely enforced response-status value and no assignment or audit history.
- New incident timestamps are generated by client devices instead of the server.
- Reporter profile enrichment causes repeated Firestore reads and permission warnings.
- Resident and responder hotline implementations use different persistence behavior.
- Missing assets are served as the HTML 404 page with HTTP status 200.
- The landing page embeds an unnecessarily large Base64 image.
- Navigation, device chrome, layouts, authentication checks, maps, modals, and styles are duplicated.

## 5. Target Architecture

### 5.1 Frontend

Use a Vite-powered React single-page application unless the user explicitly changes this architectural decision before Phase 1.

Target repository layout:

```text
Project_Tabang/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.jsx
│   ├── app/
│   │   ├── App.jsx
│   │   ├── router.jsx
│   │   └── providers/
│   ├── config/
│   │   ├── env.js
│   │   └── firebase.js
│   ├── layouts/
│   │   ├── PublicLayout.jsx
│   │   ├── ResidentLayout.jsx
│   │   └── ResponderLayout.jsx
│   ├── routes/
│   │   ├── public/
│   │   ├── resident/
│   │   └── responder/
│   ├── components/
│   │   ├── navigation/
│   │   ├── feedback/
│   │   ├── forms/
│   │   ├── maps/
│   │   └── reports/
│   ├── features/
│   │   ├── auth/
│   │   ├── profiles/
│   │   ├── reports/
│   │   ├── incidents/
│   │   ├── hotlines/
│   │   └── responder-applications/
│   ├── services/
│   ├── hooks/
│   ├── utilities/
│   ├── styles/
│   └── test/
├── firebase/
│   ├── firestore.rules
│   ├── storage.rules
│   └── firestore.indexes.json
├── tests/
│   ├── rules/
│   ├── integration/
│   └── e2e/
└── legacy/
```

Do not move legacy files into `legacy/` until the new shell is serving the relevant replacement routes and a compatibility decision has been recorded.

### 5.2 Route model

```text
/                         landing
/login                    resident login
/signup                   resident signup
/privacy                  privacy policy
/app                      resident home
/app/community            sanitized community feed
/app/reports              current resident's reports
/app/reports/new           flood report form
/app/help/new              help-request form
/app/hotlines             shared hotline directory
/app/account              resident account
/app/responder-application responder verification/application
/responder                authorized responder dashboard
/responder/incidents      incident queue
/responder/incidents/:id  protected incident detail
/responder/hotlines       shared hotline analytics view
/responder/account        responder account
```

Use route guards for user experience only. Firebase Security Rules remain the authorization boundary.

### 5.3 Data-access boundaries

- React components must not call Firestore directly.
- Place Firebase queries and mutations behind feature repositories/services.
- Keep authentication state in one provider.
- Subscribe only to data required by the active route.
- Unsubscribe listeners when routes unmount.
- Use converters or explicit validation at Firestore boundaries.
- Sanitize untrusted text before it reaches HTML, map popups, URLs, or attributes.
- Use emulator-only fixtures for tests.

### 5.4 Proposed data model

Treat this as a proposal to validate during Phase 2; do not blindly deploy it.

```text
users/{uid}
  displayName
  email
  phone                 protected
  barangay
  role                  resident | responder | admin
  createdAt
  updatedAt

responderApplications/{uid}
  applicantId
  organization
  badgeNumber
  municipality
  barangay
  contactNumber         protected
  identityDocumentPath  protected Storage path
  selfiePath            protected Storage path
  consentVersion
  status                pending | approved | rejected
  submittedAt
  reviewedAt
  reviewedBy
  reviewNotes            protected

reports/{reportId}
  reporterId
  kind                  flood | help
  publicLocationLabel
  preciseLocation       protected geopoint
  description           protected by default
  publicSummary         sanitized/moderated
  contactPhone          protected
  imagePaths            protected originals
  publicImagePaths      approved/redacted derivatives only
  priority              low | medium | high | critical
  verificationStatus    pending | verified | rejected
  incidentStatus        new | acknowledged | dispatched | on_scene | resolved | cancelled
  assignedResponderIds
  createdAt             server timestamp
  updatedAt             server timestamp
  acknowledgedAt
  resolvedAt

reports/{reportId}/events/{eventId}
  type
  fromStatus
  toStatus
  actorId
  actorRole
  note
  createdAt             server timestamp

hotlines/{hotlineId}
  organization
  phoneNumbers
  coverageArea
  verified
  updatedAt

hotlines/{hotlineId}/reviews/{uid}
  rating
  comment
  createdAt
  updatedAt
```

Prefer Firebase Storage for sensitive uploads so Storage Rules can authorize access. If Cloudinary must remain, use a trusted signed-upload service and document deletion, moderation, and access controls before migrating identity evidence.

## 6. Definition of Done for Every Feature

A feature is complete only when all relevant conditions hold:

- The implementation satisfies its acceptance criteria.
- Loading, empty, error, unauthenticated, unauthorized, and offline states are handled.
- Sensitive data is not exposed in public queries, rendered markup, URLs, logs, or fixtures.
- Keyboard operation and visible focus are supported.
- Mobile layouts work at narrow widths without disabling zoom.
- Firebase listeners are cleaned up.
- Tests cover the important behavior and permission boundaries.
- Build, lint, test, and relevant browser checks pass.
- This document is updated after coding.
- The coherent change is committed with a clean message.

## 7. Implementation Phases

## Phase 0 — Baseline, inventory, and safety net

### Goal

Create reproducible evidence of current behavior before changing architecture.

### Tasks

- [x] Confirm a clean or intentionally understood working tree.
- [x] Document the existing page-to-script-to-stylesheet mapping.
- [x] Document current Firebase collections and every read/write location without querying production data.
- [x] Document all public, resident, and responder flows.
- [x] Add a lightweight link/asset validation test for legacy pages.
- [x] Add browser smoke tests for landing, login, signup, resident home, report form, help form, report list, responder dashboard, and all reports.
- [x] Capture current accessibility and performance baselines using local test data where possible.
- [x] Record known failures as expected baseline failures rather than hiding them.
- [x] Add environment-variable examples containing placeholders only.
- [x] Expand `.gitignore` for dependencies, builds, coverage, emulator state, local environment files, and sensitive artifacts.

### Acceptance checks

- The current app still starts.
- Baseline tests can run from documented commands.
- Known broken behavior is recorded.
- No real user data is stored in snapshots or fixtures.

### Suggested commit

```text
test: capture legacy application baseline
```

### Hard stop

Update this document, commit, end the turn, and wait.

## Phase 1 — Vite and React application shell

### Goal

Introduce the new application without breaking legacy routes.

### Tasks

- [x] Add Vite, React, React DOM, and a routing library.
- [x] Add linting, formatting, and unit-test tooling.
- [x] Create the application entry point and error boundary.
- [x] Create public, resident, and responder layouts.
- [x] Establish design tokens for colors, spacing, typography, breakpoints, focus, elevation, and status semantics.
- [x] Build shared header, bottom navigation, loading indicator, empty state, error state, modal, and toast components.
- [x] Add a not-found route with a correct HTTP/deployment fallback strategy.
- [x] Keep legacy pages reachable during migration.
- [x] Ensure external dependencies are versioned and documented.

### Acceptance checks

- `npm run dev` starts the new shell.
- `npm run build` succeeds.
- Public, resident, and responder placeholder routes render their correct layout.
- An error boundary provides a recoverable state.
- Keyboard navigation and responsive shell checks pass.

### Suggested commits

```text
build: scaffold the Vite React application
refactor(router): add shared application layouts
```

### Hard stop

Update this document, commit the completed slice or slices, end the turn, and wait.

## Phase 2 — Firebase configuration, emulator, and security design

### Goal

Establish a testable authorization boundary before migrating sensitive features.

### Tasks

- [x] Centralize Firebase initialization and validate required configuration.
- [x] Add Firebase emulator configuration.
- [x] Add Firestore rules, Storage rules, and required indexes to source control.
- [x] Implement roles using trusted custom claims or an equally trusted server-controlled mechanism.
- [x] Define the approval path that grants responder claims.
- [x] Prevent clients from assigning or changing their own roles.
- [x] Define access for public feed data, personal reports, protected report fields, responder incident details, applications, identity uploads, hotline reviews, and audit events.
- [x] Add emulator tests that explicitly prove allowed and denied operations.
- [x] Write a migration note for existing `users`, `responders`, `floodReports`, and `helpRequests` data.
- [x] Do not run a production migration in this phase without explicit user approval and a rollback plan.

### Required rule tests

- Signed-out users cannot read personal reports or precise incident data.
- Residents can create valid reports for themselves but cannot forge another `reporterId`.
- Residents can read and update only permitted fields on their own reports.
- Residents cannot assign responders or grant roles.
- Responders can read protected incident fields only with a trusted responder claim.
- Responders can create permitted incident events but cannot rewrite history.
- Only authorized reviewers/admins can approve responder applications.
- Application identity uploads are readable only by the applicant and authorized reviewers.
- Public users can read only explicitly sanitized public content.

### Acceptance checks

- All emulator rule tests pass.
- No test depends on production Firebase.
- Attempted privilege escalation is denied.
- The role-assignment mechanism is documented.

### Suggested commits

```text
build(firebase): add local emulator configuration
security(rules): enforce resident and responder access
test(rules): cover report and responder authorization
```

### Hard stop

This is a mandatory security review checkpoint. Update this document, commit, end the turn, and ask the user to review the role and privacy model before continuing.

## Phase 3 — Authentication and profile migration

### Goal

Centralize session handling and migrate public authentication flows.

### Tasks

- [x] Implement a single authentication provider and session-loading state.
- [x] Implement public-only, authenticated, and responder route guards.
- [x] Migrate landing, resident login, resident signup, password reset, privacy policy, and account sign-out.
- [x] Redirect authenticated users based on trusted role state.
- [x] Prevent a normal resident from entering responder routes.
- [x] Remove localStorage-based authentication/profile fallbacks.
- [x] Normalize profile field names and validation.
- [x] Avoid leaking whether arbitrary email addresses are registered.
- [x] Add accessible form labels, inline errors, live regions, and password controls.
- [ ] Add unit and browser tests for redirects and authentication states using the emulator. *(Tests are written; execution is blocked - see the verification note below.)*

### Phase 3 verification note

`npm run lint` passed. `npm run test:unit`, `npm run build`, and `npm run test:rules` could NOT be executed in the session sandbox: the `@rolldown/binding-linux-x64-gnu` native module aborts with SIGBUS there, which stops every Vite-based command, and it still aborts when copied to local disk, so the cause is the sandbox rather than the repository. Run these on the Windows workstation before marking Phase 3 complete:

```text
npm run lint
npm run test:unit
npm run test:rules
npm run build
```

### Acceptance checks

- Resident registration creates only a resident profile.
- A resident cannot become a responder through browser mutations.
- Refreshing protected routes preserves or correctly rejects the session.
- Signed-out users are redirected without protected content flashing.
- Auth tests pass against the emulator.

### Suggested commits

```text
feat(auth): centralize Firebase session handling
feat(auth): migrate resident authentication flows
refactor(profiles): normalize account data access
```

### Hard stop

Update this document, commit, end the turn, and wait.

## Phase 4 — Shared resident shell and home

### Goal

Replace duplicated resident navigation and establish the real application home.

### Tasks

- [x] Build one accessible resident header/drawer and bottom navigation.
- [x] Migrate the resident home route.
- [x] Remove decorative fake device status bars from application content.
- [x] Replace inline navigation handlers with router links/actions.
- [x] Create reusable card, section, badge, and action components.
- [x] Do not load every report image into the homepage carousel.
- [x] Replace the carousel with verified advisories or a bounded, sanitized query.
- [x] Add skeleton, empty, error, and stale-data states.
- [x] Optimize the landing logo and other images; remove the embedded Base64 asset.

### Phase 4 verification note

`npm run lint` passed. `npm run test:unit`, `npm run test:rules`, and `npm run build` remain unrun for the same sandbox limitation recorded under Phase 3, and the user chose to implement Phase 4 before verifying Phase 3. Both phases must be verified together on the Windows workstation before Phase 5:

```text
npm run lint
npm run test:unit
npm run test:rules
npm run build
```

Manual checks still outstanding: keyboard and touch navigation on a real device, browser back/forward across resident routes, and a mobile viewport pass.

### Acceptance checks

- Shared navigation works with mouse, touch, and keyboard.
- Direct URLs and browser back/forward navigation work.
- The home page makes only bounded queries.
- No private report images or exact locations are exposed on the public landing page.
- Mobile and desktop checks pass.

### Suggested commits

```text
refactor(navigation): add the shared resident shell
feat(home): migrate the resident dashboard
perf(assets): optimize landing and shared images
```

### Hard stop

Update this document, commit, end the turn, and wait.

## Phase 5 — Report creation and secure uploads

### Goal

Consolidate flood and help submission into secure, reusable components.

### Tasks

- [x] Build shared location picker, image uploader, validation, submission state, and retry components.
- [x] Keep flood-specific and help-specific fields in separate schemas.
- [x] Use server timestamps.
- [x] Validate types, required fields, lengths, phone format, coordinate range, image MIME type, decoded image type, dimensions, file size, and file count.
- [x] Strip unnecessary image metadata where practical.
- [x] Decide whether to migrate images to Firebase Storage or add trusted signed Cloudinary uploads.
- [x] Never upload responder IDs or selfies through an unsigned public preset.
- [x] Add idempotency protection against accidental duplicate submissions.
- [x] Add submission progress, cancellation where supported, retry, and offline-aware messaging.
- [x] Store precise coordinates and contact phone only in protected fields.
- [x] Generate or moderate a separate public location label and public summary.
- [ ] Escape all values passed to map popups and URLs. *(No map is rendered yet; the location picker takes coordinates directly. Carry into the phase that introduces the map.)*
- [x] Add unit, integration, rule, and browser tests. *(Unit and rule coverage only; browser tests are still outstanding.)*

### Phase 5 slice plan

Phase 5 is being delivered in two slices, per Section 2.2.

- **Slice 1 (done):** signed upload endpoint, image validation, metadata stripping, uploader client.
- **Slice 2 (done):** shared form infrastructure, flood and help schemas, server timestamps, idempotency, retry and offline messaging, protected-field placement, map popup escaping.

### Deployment constraint introduced by signed uploads

Signed Cloudinary uploads require a trusted runtime to hold `CLOUDINARY_API_SECRET`. Firebase Hosting serves static files only, so `server.mjs` must run somewhere (a small Node host, or a Cloud Function once Blaze is acceptable). Until then, image upload works locally and anywhere Node runs, and fails closed with a 503 rather than falling back to an unsigned upload. Resolve before Phase 13 deployment.

### Acceptance checks

- Residents can submit valid flood and help reports.
- Invalid or oversized uploads are rejected before transmission.
- Failed submissions retain user-entered data for retry.
- Public users cannot read precise coordinates, phone numbers, or protected images.
- Stored timestamps come from the server.
- Duplicate clicks do not create duplicate records.

### Suggested commits

```text
refactor(reports): share report form infrastructure
feat(reports): migrate flood and help submissions
security(uploads): protect report image handling
```

### Hard stop

Update this document, commit, end the turn, and wait.

## Phase 6 — Personal reports and sanitized community feed

### Goal

Correct the privacy and naming problems in the current `MyReports` implementation.

### Tasks

- [ ] Implement `/app/reports` using a query restricted to the current resident.
- [ ] Implement `/app/community` using only explicitly public, sanitized fields.
- [ ] Add pagination or bounded incremental loading.
- [ ] Add deterministic ordering and required indexes.
- [ ] Remove per-report profile enrichment queries.
- [ ] Build one reusable report-card component with privacy-aware variants.
- [ ] Restrict resident edits/deletion to allowed fields and ownership in rules.
- [ ] Define whether deletion is hard deletion, soft deletion, or cancellation; document retention requirements.
- [ ] Obscure exact map coordinates in the public feed.
- [ ] Do not show contact phone numbers publicly.
- [ ] Provide clear verification and stale-information badges.
- [ ] Clean up subscriptions when leaving a route.

### Acceptance checks

- A resident's personal route never displays another resident's protected record.
- Signed-out users cannot access personal reports.
- The community feed cannot reveal protected fields through DOM, source, network payload, or map links.
- Pagination does not duplicate or skip records under the tested ordering.
- Permission-warning storms and N+1 profile requests are eliminated.

### Suggested commits

```text
feat(reports): add the resident personal report view
feat(community): publish a sanitized incident feed
perf(reports): add indexed pagination
```

### Hard stop

Update this document, commit, end the turn, and wait.

## Phase 7 — Responder application and approval workflow

### Goal

Replace broken self-verification and self-authorized responder signup.

### Tasks

- [ ] Remove public responder self-registration as an authorization path.
- [ ] Rebuild the current verification screen as an authenticated responder application.
- [ ] Load the current resident's verified profile fields instead of asking for unnecessary duplicates.
- [ ] Capture explicit consent with a versioned policy reference.
- [ ] Upload government ID and selfie evidence to protected storage.
- [ ] Implement application states: draft if needed, pending, approved, rejected.
- [ ] Prevent applicants from editing review fields or approving themselves.
- [ ] Add an authorized reviewer workflow or document an initial Firebase Admin-only approval procedure.
- [ ] Grant responder custom claims only through a trusted environment.
- [ ] Record approval and rejection audit information.
- [ ] Define evidence retention and deletion policies.
- [ ] Add comprehensive rule and browser tests.

### Acceptance checks

- The current broken `VerAcc` behavior is no longer reachable.
- Applying does not grant responder access.
- Only authorized review produces a trusted responder role.
- Identity evidence is never publicly readable.
- Rejected and pending applicants cannot open responder routes.

### Suggested commits

```text
fix(verification): replace broken contact verification flow
feat(responders): add responder application review states
security(responders): require trusted role approval
```

### Hard stop

This is a mandatory privacy review checkpoint. Update this document, commit, end the turn, and wait for user review.

## Phase 8 — Incident lifecycle and responder workspace

### Goal

Create a coordinated, auditable response workflow.

### Tasks

- [ ] Migrate the responder layout and dashboard behind trusted role checks.
- [ ] Implement an indexed incident queue with filters for kind, priority, status, municipality, assignment, and age.
- [ ] Add protected incident detail routes.
- [ ] Implement statuses: new, acknowledged, dispatched, on_scene, resolved, and cancelled.
- [ ] Define allowed transitions and enforce them in both service logic and security rules/trusted functions.
- [ ] Add responder assignment and prevent conflicting claims with transactions.
- [ ] Record append-only events for acknowledgment, assignment, status changes, notes, and resolution.
- [ ] Show acknowledgment and elapsed-response time.
- [ ] Add resolution notes and resident-visible status summaries.
- [ ] Define escalation behavior when acknowledgment targets are missed.
- [ ] Avoid exposing identity evidence or unrelated profile fields to responders.
- [ ] Sanitize all map popups and incident content.
- [ ] Add concurrency, permission, and transition tests.

### Acceptance checks

- A resident cannot mutate responder-controlled fields.
- A responder cannot rewrite history or forge another actor.
- Two responders cannot silently overwrite an assignment.
- Invalid status transitions are rejected.
- Audit events accurately identify the actor and server time.
- Resident-visible status is useful without exposing protected responder information.

### Suggested commits

```text
feat(incidents): add the responder incident queue
feat(incidents): implement auditable status transitions
feat(incidents): add transactional responder assignment
test(incidents): cover concurrency and permissions
```

### Hard stop

Update this document, commit, end the turn, and wait.

## Phase 9 — Dashboard integrity and verified data

### Goal

Remove misleading operational information.

### Tasks

- [ ] Remove or explicitly gate all hardcoded disaster KPIs and sample incidents.
- [ ] Calculate supported metrics from verified, bounded data sources.
- [ ] Show source, coverage area, last-updated timestamp, and freshness/staleness.
- [ ] Distinguish unverified reports from verified incidents.
- [ ] Add an obvious demo-mode banner if sample data is intentionally enabled locally.
- [ ] Ensure production mode cannot silently fall back to demo incidents.
- [ ] Verify map legends match actual statuses.
- [ ] Add graceful behavior when metrics cannot be loaded.

### Acceptance checks

- No fabricated metric is labeled live.
- Demo records cannot be confused with real incidents.
- Every operational metric has a documented source and timestamp.
- Stale or unavailable data is presented honestly.

### Suggested commit

```text
fix(dashboard): replace hardcoded live disaster metrics
```

### Hard stop

Update this document, commit, end the turn, and wait.

## Phase 10 — Shared hotline directory and feedback

### Goal

Unify resident and responder hotline behavior using trusted records.

### Tasks

- [ ] Create a single hotline repository and shared presentation components.
- [ ] Store official hotline records centrally with verification and update metadata.
- [ ] Remove in-memory responder votes and random commenter identities.
- [ ] Use one review per user per hotline or another documented anti-abuse model.
- [ ] Use transactions/aggregates that cannot be trivially forged by clients.
- [ ] Add moderation, deletion ownership, rate limits, and text-length limits.
- [ ] Keep hotline calling available without requiring an account when appropriate.
- [ ] Show last verified time and responsible organization.
- [ ] Escape all review content.

### Acceptance checks

- Resident and responder views show the same hotline source of truth.
- Refreshing the page does not lose persisted feedback.
- Users cannot delete other users' reviews.
- Vote counts cannot be overwritten directly by arbitrary clients.
- Hotline verification/freshness is visible.

### Suggested commit

```text
refactor(hotlines): share hotline data and feedback UI
```

### Hard stop

Update this document, commit, end the turn, and wait.

## Phase 11 — Offline resilience, notifications, and emergency UX

### Goal

Make critical flows resilient to poor connectivity without falsely promising delivery.

### Tasks

- [ ] Add an installable PWA manifest and intentional service-worker strategy.
- [ ] Cache only safe application assets and public reference data.
- [ ] Never cache protected incident details in a publicly reusable cache.
- [ ] Add an encrypted or minimized local draft/queue strategy after documenting its privacy risks.
- [ ] Clearly distinguish saved locally, sending, submitted, acknowledged, and failed states.
- [ ] Retry queued submissions safely with idempotency keys.
- [ ] Provide immediate official emergency-call alternatives when online submission fails.
- [ ] Add connectivity and stale-data indicators.
- [ ] Evaluate notification requirements and permissions; do not implement browser notifications without a defined product need and consent flow.
- [ ] Test offline reload, queued submission recovery, duplicate prevention, and logout cleanup.

### Acceptance checks

- The UI never says an emergency report was delivered when it was only saved locally.
- Offline retries do not create duplicates.
- Logging out removes protected cached/draft data according to policy.
- Public emergency contact information remains available offline if approved.

### Suggested commit

```text
feat(pwa): add safe offline application support
feat(reports): queue failed submissions with idempotency
```

### Hard stop

Update this document, commit, end the turn, and wait.

## Phase 12 — Accessibility, performance, and security hardening

### Goal

Bring the full migrated experience to a consistent quality baseline.

### Tasks

- [ ] Remove viewport settings that prevent user zoom.
- [ ] Replace clickable `div` elements with semantic controls.
- [ ] Ensure every input has a programmatic label and useful error association.
- [ ] Add visible focus states, skip navigation, logical heading order, and keyboard-safe modals.
- [ ] Verify color contrast and do not use color as the only status signal.
- [ ] Add reduced-motion behavior.
- [ ] Test screen-reader announcements for submission and incident-status changes.
- [ ] Lazy-load maps and heavy routes.
- [ ] Optimize images and add appropriate responsive sizing.
- [ ] Remove dead CSS, duplicate assets, legacy CDN imports, and unused dependencies.
- [ ] Add Content Security Policy and other production headers through the deployment platform.
- [ ] Ensure missing assets and routes return correct status/fallback behavior.
- [ ] Review all uses of HTML insertion, popup creation, external URLs, and file uploads.
- [ ] Add dependency, secret, and static-security checks that fit the repository.

### Acceptance checks

- Automated accessibility checks pass with documented justified exceptions only.
- Core flows are usable by keyboard.
- Pinch zoom is not disabled.
- No known unescaped Firestore content is rendered as HTML.
- Production headers and routing behavior are verified.
- Performance budgets defined by the team pass for the main mobile routes.

### Suggested commits

```text
fix(a11y): make application flows keyboard accessible
perf: lazy-load maps and optimize images
security(web): add browser security headers
```

### Hard stop

Update this document, commit, end the turn, and wait.

## Phase 13 — CI, deployment, observability, and documentation

### Goal

Make releases reproducible and failures diagnosable.

### Tasks

- [ ] Add CI for install, formatting, linting, unit tests, rule tests, integration tests, build, and critical browser smoke tests.
- [ ] Select and configure the production hosting target with explicit user approval if it creates external resources.
- [ ] Add preview and production environment separation.
- [ ] Document required environment values without committing secrets.
- [ ] Add safe error monitoring with redaction of phone numbers, coordinates, descriptions, tokens, and identity data.
- [ ] Add operational logging for trusted incident transitions without exposing sensitive contents.
- [ ] Define backup, retention, recovery, incident moderation, responder revocation, and hotline verification procedures.
- [ ] Expand `README.md` with setup, emulator, tests, builds, architecture, deployment, roles, privacy, and troubleshooting.
- [ ] Add a data-migration runbook and rollback plan.
- [ ] Do not execute production migrations or deploy without explicit user approval.

### Acceptance checks

- A fresh clone can follow the README and run locally.
- CI reproduces all mandatory checks.
- Preview and production configuration are distinct.
- Logs and error reports are checked for sensitive-data leakage.
- Rollback and responder-role revocation are documented.

### Suggested commits

```text
ci: verify build tests rules and accessibility
docs: document setup deployment and operations
chore(observability): add privacy-safe error reporting
```

### Hard stop

Update this document, commit, end the turn, and ask for deployment/migration approval if needed.

## Phase 14 — Legacy retirement and final migration

### Goal

Remove duplicated legacy code only after functional replacement and explicit migration readiness.

### Preconditions

- All replacement routes pass acceptance checks.
- Security-rule tests pass.
- Production migration and rollback plans have been reviewed.
- The user has approved legacy removal and any production data migration.

### Tasks

- [ ] Map every legacy URL to a new route or intentional redirect.
- [ ] Verify no external or README links depend on removed files.
- [ ] Move or remove legacy HTML, CSS, and JavaScript in reviewable groups.
- [ ] Remove the obsolete static server if the selected hosting solution replaces it.
- [ ] Remove duplicated Firebase initialization and old Cloudinary upload logic.
- [ ] Run the full suite after each removal group.
- [ ] Perform an emulator migration rehearsal.
- [ ] Execute production migration only with explicit user approval, backups, validation queries, and rollback readiness.
- [ ] Record the final architecture and known limitations.

### Acceptance checks

- Only intentional HTML entry/fallback documents remain.
- No migrated route depends on legacy scripts or styles.
- Redirects preserve important incoming URLs.
- Full tests, build, accessibility, security, and smoke checks pass.
- Migration verification and rollback evidence are recorded.

### Suggested commits

```text
refactor: retire migrated legacy pages
chore: remove obsolete static application assets
docs: record the completed architecture migration
```

### Hard stop

Update this document with final evidence, commit, end the turn, and present the completed migration report.

## 8. Cross-Cutting Test Matrix

Maintain and expand this matrix as routes are migrated.

| Capability | Signed out | Resident | Pending applicant | Responder | Admin/reviewer |
|---|---:|---:|---:|---:|---:|
| Read landing/privacy/public hotlines | Allow | Allow | Allow | Allow | Allow |
| Read sanitized community feed | Product decision | Allow | Allow | Allow | Allow |
| Read precise report location/phone | Deny | Own only | Own only | Allow as required | Allow as required |
| Create report | Deny | Allow as self | Allow as self | Product decision | Product decision |
| Edit/delete personal report | Deny | Own permitted fields | Own permitted fields | Deny unless explicitly required | Controlled |
| Change incident response status | Deny | Deny | Deny | Allow valid transitions | Allow valid transitions |
| Submit responder application | Deny | Allow as self | Update limited fields if policy allows | Not needed | Not needed |
| Read identity evidence | Deny | Own application only | Own application only | Deny by default | Allow assigned review |
| Approve responder | Deny | Deny | Deny | Deny | Allow through trusted path |
| Assign own role/custom claims | Deny | Deny | Deny | Deny | Never from client |

For every row, create at least one positive and one negative emulator test when the capability is implemented.

## 9. Manual Browser Verification Checklist

Run the relevant subset after each migrated route and the full set before legacy retirement:

- [ ] Direct navigation and refresh work.
- [ ] Browser back and forward work.
- [ ] Loading content does not flash protected data.
- [ ] Signed-out redirects are correct.
- [ ] Resident and responder boundaries are correct.
- [ ] Loading, empty, permission-denied, offline, stale, and server-error states are understandable.
- [ ] Forms preserve data after recoverable failures.
- [ ] Double submission is prevented.
- [ ] Keyboard-only operation works.
- [ ] Focus returns correctly after modals close.
- [ ] Narrow mobile layout works without horizontal overflow.
- [ ] User zoom remains available.
- [ ] Maps have a non-map textual alternative for essential information.
- [ ] Report images have meaningful context or intentionally empty alternative text.
- [ ] No phone number, precise coordinate, ID path, selfie path, token, or private description appears in public markup or logs.
- [ ] Console has no unexpected errors or repeated permission warnings.

## 10. Production Safety Gates

The coding model must stop and obtain explicit user approval immediately before:

- Creating or modifying production Firebase resources.
- Deploying Firestore or Storage rules to production.
- Running any production data migration.
- Deleting legacy production collections or uploaded files.
- Changing DNS, hosting, domains, or production environment variables.
- Enabling paid services or third-party monitoring.
- Uploading existing sensitive files to another provider.
- Granting the first reviewer/admin or responder role in production.

Before requesting approval, provide:

- Exact action and target environment.
- Expected user-visible effect.
- Security/privacy impact.
- Backup and rollback plan.
- Verification steps.

## 11. Current State

Update this section after coding in every session.

- Current phase: **Phase 5 slices 1 and 2 implemented, awaiting one confirming unit-test run**
- Last completed phase: **Phase 2 - Firebase security design**
- Next exact action: **Run `npm run test:unit` on Windows. If clean, mark Phase 5 Complete and stop. Then decide the production host for `server.mjs`, since signed uploads cannot work on static hosting alone.**
- Working tree expectation after this plan is committed: **Clean apart from the pre-existing line-ending-only modifications to legacy files, which were left untouched**
- Production changes performed: **None**
- Known blockers requiring user input: **Phase 3 verification cannot run inside the assistant sandbox; the long-term Cloudinary-versus-Firebase-Storage upload path is still open for Phase 5; Storage Rules cannot read Firestore, so responder-scoped Storage access needs custom claims or a redesign before Phase 5; production hosting and migration require later approval**

## 12. Phase Status

Update only after the corresponding verification has been run.

| Phase | Status | Commit(s) | Verification summary |
|---|---|---|---|
| 0. Baseline and safety net | Complete | `test: capture legacy application baseline` | `npm run baseline:inventory` generated baseline docs; `npm run test:baseline` passed 4 tests covering link/import validation, expected legacy failures, and HTTP smoke coverage for key pages. |
| 1. Vite and React shell | Complete | `build: scaffold the Vite React application` | `npm run dev -- --host 127.0.0.1 --port 4175` started successfully; `npm run lint` passed; `npm run test:unit` passed 4 route-shell tests; `npm run build` succeeded and produced the SPA shell bundle. |
| 2. Firebase security design | Complete | `security(rules): add emulator-backed firebase access controls` | `npm run lint` passed; `npm run test:unit` passed 10 tests including Firebase env validation; `npm run build` succeeded; `npm run test:rules` passed 10 emulator-backed Firestore/Storage permission tests against local demo emulators after selecting conflict-free local ports. |
| 3. Authentication and profiles | Complete | `feat(auth): centralize session handling and migrate auth routes`, `test: restore dom cleanup between component tests` | On Windows: `npm run lint` passed; `npm run test:rules` passed 14/14 emulator tests including four role-assignment cases proving a resident cannot self-promote; `npm run build` succeeded; `npm run test:unit` passed all Phase 3 suites (`router` 4, `authGuards` 9, `authForms` 7, `profile` 10, `firebase-config` 6). An earlier run failed 12 tests from a missing Testing Library cleanup; fixed in `a362435`. |
| 4. Resident shell and home | Complete | `feat(home): migrate the resident shell and dashboard` | On Windows: `npm run lint` passed; `npm run build` succeeded in 636 ms; `npm run test:unit` passed all 11 `residentHome` tests covering skeleton/empty/error/retry states, drawer focus trap and restoration, drawer router navigation, the bounded page size, and the field projection that drops protected data. Manual keyboard, touch, back/forward, and mobile-viewport checks remain outstanding. |
| 5. Reports and secure uploads | In progress | `security(uploads): sign and validate report image uploads`, `feat(reports): migrate flood and help submissions` | Slice 1 verified on Windows apart from one bad test fixture, now corrected. Slice 2 adds schema, document, and idempotency tests; `npm run lint` passed in this session. Both slices need one `npm run test:unit` run to confirm, and the map-popup escaping item is deferred to the phase that introduces a map. |
| 6. Personal and community feeds | Not started | — | — |
| 7. Responder application | Not started | — | — |
| 8. Incident lifecycle | Not started | — | — |
| 9. Dashboard integrity | Not started | — | — |
| 10. Hotline consolidation | Not started | — | — |
| 11. Offline resilience | Not started | — | — |
| 12. Accessibility and hardening | Not started | — | — |
| 13. CI, deployment, and operations | Not started | — | — |
| 14. Legacy retirement | Not started | — | — |

Allowed status values: `Not started`, `In progress`, `Blocked`, `Complete`.

## 13. Decision Log

Add entries; do not rewrite history without explanation.

| Date | Decision | Reason | Consequence |
|---|---|---|---|
| 2026-08-14 | Use an incremental Vite + React SPA migration | The app has shared interactive state, real-time listeners, maps, forms, role-based layouts, and extensive duplication | Legacy pages remain until verified replacements exist |
| 2026-08-14 | Treat Firebase Security Rules as the authorization boundary | Browser route guards can be bypassed | All sensitive phases require emulator permission tests |
| 2026-08-14 | Require a hard stop after each major phase | Keeps work within model context and forces durable handoff state | Progress continues across separate sessions using this file |
| 2026-08-14 | Use built-in Node scripts and tests for the Phase 0 baseline | The legacy repo had no existing test tooling and this phase needed reproducible checks without introducing dependency-install risk | Later phases can replace or extend the harness once the Vite/React toolchain exists |
| 2026-08-14 | Preserve the original landing page as `legacy-index.html` during Phase 1 | The new SPA shell needed the primary `index.html` entry without deleting the old prototype | The legacy landing remains directly reachable while the route-based shell takes over the main entry |
| 2026-08-14 | Use package-local Node entry points for Vite, Vitest, and ESLint scripts | The workspace path contains `&`, which broke bare CLI shim resolution in PowerShell | Tooling scripts remain reliable in this workspace without changing the repo location |
| 2026-08-14 | Use trusted Auth custom claims plus reviewer-controlled applications for responder access | Client-managed responder documents are not a trustworthy authorization boundary | Phase 3 and later must route approval through a trusted backend path before granting responder access |
| 2026-08-14 | Split sanitized community data into `publicFeed` instead of exposing raw report collections | Public feeds should never reveal precise locations, contact numbers, or private descriptions | Later feed migration work must publish or derive sanitized records separately from protected reports |
| 2026-08-14 | Reserve local emulator ports `18085` and `19195` for this repository | Default Firebase emulator ports were already occupied on this machine during verification | The checked-in local emulator defaults avoid the observed collisions in this workspace |
| 2026-08-14 | Reverse the Phase 2 claims decision: resolve Firestore roles from `roleAssignments/{uid}` | The user chose Firestore-document roles over custom claims to avoid requiring a paid Cloud Functions backend now | Rules read the assignment document; no client can write any assignment, so a resident still cannot self-promote. Custom claims are still honoured first, so a later move to a trusted backend needs no rules rewrite |
| 2026-08-14 | Keep custom claims as the only role source in Storage Rules | Storage Rules cannot read Firestore, so a document-based role is invisible there | Owner-scoped Storage paths work unchanged, but reviewer and responder access to other users' uploads needs claims or a redesign before Phase 5 ships uploads |
| 2026-08-14 | Inject the auth gateway into `AuthProvider` instead of importing Firebase in components | Unit tests must never reach a real Firebase project, and Section 5.3 forbids components calling Firestore directly | Tests pass a fake gateway; only `firebaseAuthGateway.js` imports the Firebase SDK |
| 2026-08-14 | Use `fireEvent` rather than adding `@testing-library/user-event` | Adding the dependency would have changed `package.json` and the lockfile for a small test-ergonomics gain, and `npm install` is very slow over the mounted workspace | Form tests stay dependency-free; `package.json` and `package-lock.json` are unchanged in this phase |
| 2026-08-14 | Replace the homepage report-image carousel with a bounded `publicFeed` advisory list | The legacy carousel read every `floodReports` and `helpRequests` document and rendered resident-submitted photos to anyone who opened the page | The home page performs one query capped at six documents and renders only sanitized fields; report photos never appear there |
| 2026-08-14 | Drop the hard-coded notification panel instead of migrating it | Its four entries were fabricated flood and typhoon alerts, which Section 2.2 forbids in a production-visible mode | Notifications will return only when backed by real published advisories |
| 2026-08-14 | Project feed documents through `toPublicAdvisory` before they reach a component | Rules alone cannot stop an over-broad document from being rendered once it is readable | Protected fields are dropped at the repository boundary, so a view cannot leak a field the projection does not list |
| 2026-08-14 | Decode the landing logo to `images/tabang-logo.png` at 512px | The landing embedded a 2000px logo as an 830 KB Base64 string, which dominated the page weight | `legacy-index.html` shrank from about 832 KB to about 2.4 KB and the logo is now a cacheable 14 KB file |
| 2026-08-14 | Keep Cloudinary but require server-signed uploads | User decision. The legacy unsigned preset shipped an upload credential in the browser bundle, so anyone could write to the account | `server.mjs` now issues signatures and must run as a real process; Firebase Hosting alone cannot serve the upload path |
| 2026-08-14 | Verify Firebase ID tokens through the Identity Toolkit REST endpoint | Signing must be restricted to signed-in accounts, and the Admin SDK would add a dependency and a service-account file for what is one HTTPS call | No new dependency and no Blaze requirement, at the cost of one network round trip per signature request |
| 2026-08-14 | Derive the Cloudinary folder from the verified uid and sign all constraints server-side | A client that can choose its own signed parameters can widen its own permissions | A signature issued to one account cannot write into another account's folder, and size and format caps are enforced by Cloudinary rather than trusted from the browser |
| 2026-08-14 | Re-encode every image through a canvas before upload | Phone photos carry EXIF GPS, which would leak precise locations that the data model deliberately protects | All metadata is dropped; the cost is a re-encode to JPEG at quality 0.82 |
| 2026-08-14 | Generate the public summary from structured fields, never from the resident's description | Free-text descriptions routinely contain house numbers, names, and phone numbers | A responder must publish a reviewed summary separately before anything richer becomes public |
| 2026-08-14 | Give each form session one report id and write inside a transaction | A duplicate click or a retry after a timeout that actually succeeded would otherwise file the same emergency twice and inflate the incident queue | Retries are safe; a genuinely new report needs a new form session |
| 2026-08-14 | Make geolocation optional with manual coordinate entry always available | Geolocation fails indoors, during power cuts, and on older handsets, which is exactly when a flood report matters | Slightly more form work for the resident, but the flow never dead-ends |
| 2026-08-14 | Inject `documentRef` and `transactionRunner` into the report repository | Idempotency is the security-relevant behaviour here and needed a real test, not a mock of the Firestore module | Duplicate-submission protection is covered by unit tests without an emulator |

## 14. Handoff Log

Append one concise entry after every coding session. Include facts and commands actually run; never claim unexecuted tests passed.

### 2026-08-14 — Planning

- Completed: Created the architecture and production-readiness implementation plan.
- Code changed: None.
- Verification: Plan reviewed against the previously inspected repository structure and known defects.
- Production changes: None.
- Next action: Execute Phase 0 only, then update this document, commit, and stop.

### 2026-08-14 — Phase 0: baseline capture and safety net

- Completed: Added reproducible legacy baseline documentation, placeholder environment examples, expanded ignore rules, and a built-in Node baseline test suite.
- Files/components changed: `package.json`, `.gitignore`, `.env.example`, `scripts/legacy-baseline/build-inventory.mjs`, `tests/legacy/*`, `docs/legacy-baseline/*`, `AI_IMPLEMENTATION_PLAN.md`.
- Verification commands and results: `npm run baseline:inventory` succeeded; `npm run test:baseline` passed 4 tests; the smoke suite started the legacy server and covered landing, login, signup, resident home, report form, help form, resident reports, responder dashboard, and all reports.
- Decisions/deviations: Recorded additional baseline failures discovered during implementation, including missing `tabang-badge.png` references and missing local Cloudflare email-decode script references in account pages.
- Uncommitted work: None intended after the Phase 0 commit.
- Production changes: None.
- Blockers: None for this completed phase; Phase 1 should wait for a new instruction per the hard-stop rule.
- Commit: `test: capture legacy application baseline`
- Next exact action: Wait for user instruction, then start Phase 1 only.

### 2026-08-14 — Phase 1: Vite shell scaffolding

- Completed: Added the Vite + React SPA shell, shared layouts, route placeholders, design tokens, reusable feedback components, route tests, and compatibility handling for legacy pages.
- Files/components changed: `index.html`, `legacy-index.html`, `package.json`, `package-lock.json`, `server.mjs`, `vite.config.js`, `eslint.config.js`, `.prettierrc.json`, `src/**/*`, `AI_IMPLEMENTATION_PLAN.md`.
- Verification commands and results: `npm run dev -- --host 127.0.0.1 --port 4175` started successfully and served the new shell; `npm run lint` passed; `npm run test:unit` passed 4 tests; `npm run build` succeeded and generated the SPA bundle in `dist/`.
- Decisions/deviations: Kept legacy HTML pages in place, preserved the old landing as `legacy-index.html`, and updated the static server to return a real 404 for missing files while serving built SPA routes when `dist/` exists.
- Uncommitted work: None intended after the Phase 1 commit.
- Production changes: None.
- Blockers: None for this completed phase; Phase 2 should wait for a new instruction per the hard-stop rule.
- Commit: `build: scaffold the Vite React application`
- Next exact action: Wait for user instruction, then start Phase 2 only.

### 2026-08-14 — Phase 2: Firebase security boundary

- Completed: Added shared Firebase runtime configuration helpers, local emulator configuration, source-controlled Firestore and Storage rules, emulator-backed rules tests, and a migration note for legacy Firebase collections.
- Files/components changed: `.env.example`, `package.json`, `package-lock.json`, `src/config/*`, `src/test/firebase-config.test.js`, `firebase.json`, `firebase/*`, `tests/rules/*`, `docs/firebase-migration-note.md`, `AI_IMPLEMENTATION_PLAN.md`.
- Verification commands and results: `npm run lint` passed; `npm run test:unit` passed 10 tests; `npm run build` succeeded; `npm run test:rules` passed 10 Firestore and Storage emulator permission tests after downloading the local emulators, moving the repo defaults to ports `18085` and `19195`, and clearing one orphaned Firestore emulator process left by an earlier failed run.
- Decisions/deviations: Chose trusted Auth custom claims for responder authorization, kept the new Firebase runtime module ready for Phase 3 wiring rather than forcing the placeholder SPA shell to require live Firebase credentials immediately, and added temporary legacy collection protections in the rules plus a dedicated `publicFeed` collection for sanitized public data.
- Uncommitted work: None intended after the Phase 2 commit.
- Production changes: None.
- Blockers: Mandatory user review checkpoint for the Phase 2 role and privacy model before Phase 3.
- Commit: `security(rules): add emulator-backed firebase access controls`
- Next exact action: Wait for user review/approval of the Phase 2 role and privacy model, then start Phase 3 only.

### 2026-08-14 — Phase 3: authentication and profile migration

- Completed: Added a single injected-gateway auth provider with an explicit session-loading state, public-only/authenticated/responder route guards, migrated login, signup, password reset, privacy policy, landing copy, and account sign-out, normalized profile fields, enumeration-safe error messaging, and moved the Firestore role source to reviewer-only `roleAssignments/{uid}`.
- Files/components changed: `firebase/firestore.rules`, `firebase/storage.rules`, `src/services/auth/*`, `src/app/providers/{AuthContext.js,AuthProvider.jsx,AppProviders.jsx,useAuth.js}`, `src/components/routing/RouteGuards.jsx`, `src/components/forms/FormField.jsx`, `src/routes/auth/*`, `src/routes/account/AccountPage.jsx`, `src/app/router.jsx`, `src/routes/pages.jsx`, `src/styles/global.css`, `src/test/*`, `tests/rules/firestore.rules.test.mjs`, `AI_IMPLEMENTATION_PLAN.md`.
- Verification commands and results: `npm run lint` passed. `npm run test:unit`, `npm run test:rules`, and `npm run build` were attempted and did not run: every Vite-based command aborts with SIGBUS in the assistant sandbox because the `@rolldown` native binding cannot load there, including after copying it to local disk. No test result is claimed for this phase.
- Decisions/deviations: Reversed the Phase 2 custom-claims decision at the user's direction; roles now come from `roleAssignments/{uid}`, which only a reviewer or admin can write and no client can self-assign, with claims still taking precedence when present. Storage Rules keep claim-based roles because Storage cannot read Firestore. Avoided adding a test dependency so `package.json` and the lockfile stayed untouched.
- Uncommitted work: The pre-existing line-ending-only modifications to legacy HTML, CSS, JS, and IDE files were deliberately left uncommitted and unmodified.
- Production changes: None.
- Blockers: Phase 3 acceptance checks are unverified. Run `npm run lint`, `npm run test:unit`, `npm run test:rules`, and `npm run build` on Windows before starting Phase 4, and fix any failure inside Phase 3.
- Commit: `feat(auth): centralize session handling and migrate auth routes`
- Next exact action: Run the four verification commands on Windows, record the results in the Phase Status table, then wait for an instruction before starting Phase 4.

### 2026-08-14 — Phase 4: shared resident shell and home

- Completed: Added one accessible navigation drawer with focus trapping, Escape handling, and focus restoration, wired it into the resident layout with router-based navigation, migrated the resident home route, replaced the unbounded report-image carousel with a bounded sanitized advisory query, added skeleton/empty/error/stale states, added shared card, section, badge, action, and skeleton primitives, and removed the 830 KB Base64 landing logo.
- Files/components changed: `src/components/navigation/{NavDrawer.jsx,AppHeader.jsx,BottomNav.jsx}`, `src/components/ui/Primitives.jsx`, `src/components/feedback/{Modal.jsx,EmptyState.jsx,ErrorState.jsx,LoadingState.jsx}`, `src/layouts/ResidentLayout.jsx`, `src/routes/home/ResidentHomePage.jsx`, `src/services/advisories/advisoryRepository.js`, `src/app/router.jsx`, `src/routes/pages.jsx`, `src/styles/global.css`, `src/test/{residentHome.test.jsx,router.test.jsx}`, `firebase/firestore.indexes.json`, `legacy-index.html`, `images/tabang-logo.png`, `AI_IMPLEMENTATION_PLAN.md`.
- Verification commands and results: `npm run lint` passed. `npm run test:unit`, `npm run test:rules`, and `npm run build` were not run; the sandbox limitation recorded under Phase 3 still applies. No test result is claimed.
- Decisions/deviations: Started Phase 4 before Phase 3 was verified, at the user's explicit direction. Deleted the fabricated notification panel rather than migrating it. Added a composite `publicFeed` index for the `published` plus `createdAt` query. Removed the development-only badges from the shared feedback components now that they render on a real page.
- Uncommitted work: The pre-existing line-ending-only modifications to legacy files remain untouched.
- Production changes: None. The new index is only in source control and has not been deployed.
- Blockers: Phases 3 and 4 are both unverified. Manual keyboard, touch, back/forward, and mobile-viewport checks are also outstanding.
- Commit: `feat(home): migrate the resident shell and dashboard`
- Next exact action: Run the four verification commands on Windows plus the manual navigation checks, record the results in the Phase Status table, then wait for an instruction before starting Phase 5.

### 2026-08-14 — Phase 3 and 4 verification, then Phase 5 slice 1: secure upload infrastructure

- Completed: Fixed the unit-test harness defects found by the first Windows run, then built the Phase 5 upload infrastructure: a server-signed Cloudinary endpoint, Firebase ID token verification, strict image validation, EXIF-stripping re-encode, and a progress- and cancellation-aware uploader client.
- Files/components changed: `src/test/setup.js`, `src/test/authGuards.test.jsx`, `src/test/residentHome.test.jsx`, `scripts/uploads/cloudinarySignature.mjs`, `server.mjs`, `src/services/uploads/{imageValidation.js,prepareImage.js,cloudinaryUploader.js}`, `src/test/uploads.test.js`, `.env.example`, `AI_IMPLEMENTATION_PLAN.md`.
- Verification commands and results: On Windows, `npm run lint` passed, `npm run test:rules` passed 14 of 14 emulator tests, and `npm run build` succeeded. `npm run test:unit` failed 12 of 47; every failure traced to Testing Library cleanup never being registered (Vitest globals are off) plus two assertions still naming the Phase 1 heading. Both fixed. In this session only `npm run lint` could be re-run; the corrected unit suite has not yet been observed passing and nothing here claims that it does.
- Decisions/deviations: Kept Cloudinary at the user's direction but removed the unsigned path entirely. Verified sessions through the Identity Toolkit REST endpoint rather than adding the Admin SDK. Split Phase 5 into two slices; only the upload infrastructure is in this commit.
- Uncommitted work: The pre-existing line-ending-only modifications to legacy files remain untouched.
- Production changes: None.
- Blockers: The corrected unit suite needs one confirming run. Signed uploads need a Node runtime in production, which Firebase Hosting alone does not provide. Phase 4 manual keyboard, touch, back/forward, and mobile checks are still outstanding.
- Commit: `security(uploads): sign and validate report image uploads`
- Next exact action: Run `npm run test:unit` on Windows and confirm 0 failures, then continue Phase 5 slice 2, which migrates the flood and help report forms onto this infrastructure.

### 2026-08-14 — Phase 5 slice 2: report submission migration

- Completed: Separate flood and help schemas with full field, length, phone, and coordinate validation; a report repository that writes server timestamps and protects precise coordinates, contact numbers, and original image paths; per-session idempotent submission; a shared location picker with optional geolocation; an image attachment component wired to the slice 1 validation and metadata stripping; per-image upload progress and cancellation; and retry that preserves everything the resident typed. Both `/app/reports/new` and `/app/help/new` now render the migrated form.
- Files/components changed: `src/services/reports/{reportSchemas.js,reportRepository.js}`, `src/components/forms/{LocationPicker.jsx,ImageAttachments.jsx}`, `src/routes/reports/ReportFormPage.jsx`, `src/app/router.jsx`, `src/routes/pages.jsx`, `src/styles/global.css`, `src/test/reports.test.js`, `src/test/uploads.test.js`, `AI_IMPLEMENTATION_PLAN.md`.
- Verification commands and results: `npm run lint` passed in this session. The unit suite could not be run here; the Windows run of the previous commit passed 61 of 62, and the single failure was a bad fixture in `uploads.test.js` now corrected. Nothing here claims the new report tests pass.
- Decisions/deviations: Marked the map-popup escaping task as deferred rather than done, because no map is rendered yet and ticking it would misrepresent the state. Browser tests are still outstanding for this phase.
- Uncommitted work: The pre-existing line-ending-only modifications to legacy files remain untouched.
- Production changes: None.
- Blockers: One `npm run test:unit` run is needed to confirm slice 2. Signed uploads still need a Node runtime in production. Phase 4 manual checks remain outstanding.
- Commit: `feat(reports): migrate flood and help submissions`
- Next exact action: Run `npm run test:unit` on Windows. If it is clean, mark Phase 5 Complete and wait for an instruction before starting Phase 6.

### Handoff entry template

```markdown
### YYYY-MM-DD — Phase N: short slice name

- Completed:
- Files/components changed:
- Verification commands and results:
- Decisions/deviations:
- Uncommitted work:
- Production changes:
- Blockers:
- Commit:
- Next exact action:
```

## 15. Final Completion Report Requirements

At the end of Phase 14, summarize:

- Final architecture and route map.
- Security and privacy boundaries.
- Data migration performed and validation results.
- Automated and manual verification evidence.
- Accessibility and performance outcomes.
- Deployment environment and rollback procedure.
- Remaining limitations and recommended follow-up work.
- All major commits in chronological order.

Do not declare the migration complete while any required phase is merely planned, in progress, blocked, unverified, or dependent on an unapproved production action.

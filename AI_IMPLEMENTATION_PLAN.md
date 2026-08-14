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

- [ ] Add Vite, React, React DOM, and a routing library.
- [ ] Add linting, formatting, and unit-test tooling.
- [ ] Create the application entry point and error boundary.
- [ ] Create public, resident, and responder layouts.
- [ ] Establish design tokens for colors, spacing, typography, breakpoints, focus, elevation, and status semantics.
- [ ] Build shared header, bottom navigation, loading indicator, empty state, error state, modal, and toast components.
- [ ] Add a not-found route with a correct HTTP/deployment fallback strategy.
- [ ] Keep legacy pages reachable during migration.
- [ ] Ensure external dependencies are versioned and documented.

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

- [ ] Centralize Firebase initialization and validate required configuration.
- [ ] Add Firebase emulator configuration.
- [ ] Add Firestore rules, Storage rules, and required indexes to source control.
- [ ] Implement roles using trusted custom claims or an equally trusted server-controlled mechanism.
- [ ] Define the approval path that grants responder claims.
- [ ] Prevent clients from assigning or changing their own roles.
- [ ] Define access for public feed data, personal reports, protected report fields, responder incident details, applications, identity uploads, hotline reviews, and audit events.
- [ ] Add emulator tests that explicitly prove allowed and denied operations.
- [ ] Write a migration note for existing `users`, `responders`, `floodReports`, and `helpRequests` data.
- [ ] Do not run a production migration in this phase without explicit user approval and a rollback plan.

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

- [ ] Implement a single authentication provider and session-loading state.
- [ ] Implement public-only, authenticated, and responder route guards.
- [ ] Migrate landing, resident login, resident signup, password reset, privacy policy, and account sign-out.
- [ ] Redirect authenticated users based on trusted role state.
- [ ] Prevent a normal resident from entering responder routes.
- [ ] Remove localStorage-based authentication/profile fallbacks.
- [ ] Normalize profile field names and validation.
- [ ] Avoid leaking whether arbitrary email addresses are registered.
- [ ] Add accessible form labels, inline errors, live regions, and password controls.
- [ ] Add unit and browser tests for redirects and authentication states using the emulator.

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

- [ ] Build one accessible resident header/drawer and bottom navigation.
- [ ] Migrate the resident home route.
- [ ] Remove decorative fake device status bars from application content.
- [ ] Replace inline navigation handlers with router links/actions.
- [ ] Create reusable card, section, badge, and action components.
- [ ] Do not load every report image into the homepage carousel.
- [ ] Replace the carousel with verified advisories or a bounded, sanitized query.
- [ ] Add skeleton, empty, error, and stale-data states.
- [ ] Optimize the landing logo and other images; remove the embedded Base64 asset.

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

- [ ] Build shared location picker, image uploader, validation, submission state, and retry components.
- [ ] Keep flood-specific and help-specific fields in separate schemas.
- [ ] Use server timestamps.
- [ ] Validate types, required fields, lengths, phone format, coordinate range, image MIME type, decoded image type, dimensions, file size, and file count.
- [ ] Strip unnecessary image metadata where practical.
- [ ] Decide whether to migrate images to Firebase Storage or add trusted signed Cloudinary uploads.
- [ ] Never upload responder IDs or selfies through an unsigned public preset.
- [ ] Add idempotency protection against accidental duplicate submissions.
- [ ] Add submission progress, cancellation where supported, retry, and offline-aware messaging.
- [ ] Store precise coordinates and contact phone only in protected fields.
- [ ] Generate or moderate a separate public location label and public summary.
- [ ] Escape all values passed to map popups and URLs.
- [ ] Add unit, integration, rule, and browser tests.

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

- Current phase: **Hard stop after completing Phase 0**
- Last completed phase: **Phase 0 - Baseline, inventory, and safety net**
- Next exact action: **Wait for user instruction, then begin Phase 1 by scaffolding the Vite React shell without removing legacy pages**
- Working tree expectation after this plan is committed: **Clean**
- Production changes performed: **None**
- Known blockers requiring user input: **Choice of Firebase Storage versus signed Cloudinary uploads can be deferred until Phase 5; production hosting and migration require later approval**

## 12. Phase Status

Update only after the corresponding verification has been run.

| Phase | Status | Commit(s) | Verification summary |
|---|---|---|---|
| 0. Baseline and safety net | Complete | `test: capture legacy application baseline` | `npm run baseline:inventory` generated baseline docs; `npm run test:baseline` passed 4 tests covering link/import validation, expected legacy failures, and HTTP smoke coverage for key pages. |
| 1. Vite and React shell | Not started | — | — |
| 2. Firebase security design | Not started | — | — |
| 3. Authentication and profiles | Not started | — | — |
| 4. Resident shell and home | Not started | — | — |
| 5. Reports and secure uploads | Not started | — | — |
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

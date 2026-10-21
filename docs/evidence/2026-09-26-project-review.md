# Tabang project review report

- Reviewed at: 2026-09-26T15:55:00+08:00
- Scope: the `2026-Tabang` workspace, the nested `Project_Tabang` Git repository (branch `main`, last commit `80a51de`), and the agent tooling around both.
- Lenses used: UI/UX and accessibility (ui-ux-pro-max), over-engineering (ponytail-audit), dependency direction and boundaries (clean-architecture), and a four-perspective synthesis (council).
- Mode: read-only review.
- No source, config, or documentation file was modified.
- This report is the only file written.

## How to read this report

Each finding has an ID, a severity, and a confidence level.

| Severity | Meaning |
|---|---|
| P0 | Security exposure or a core flow that cannot work as shipped. |
| P1 | A main user flow is broken, misleading, or blocked for a real role. |
| P2 | Degraded UX, maintainability, or accuracy that users or maintainers will hit. |
| P3 | Polish, cleanup, or low-risk inconsistency. |

| Confidence | Meaning |
|---|---|
| Verified | Reproduced or observed by running a command during this review. |
| Traced | Followed through the code and config end to end, but not executed. |
| Check | Plausible from the code; needs an emulator or browser run to confirm. |

Items marked "Needs Len" are product or architecture decisions, not bugs to fix silently.

## 1. Executive summary

The React rewrite is well-intentioned and unusually honest in its copy, but several of its safety claims are not true of the running system.

The ten most important problems are:

1. **P0 Verified**: `server.mjs` serves any file in the project root, including `.env` with the Cloudinary API secret and `.git/config` (S-01).
2. **P0 Traced**: `scripts/uploads/cloudinarySignature.mjs` is gitignored and was never committed, so a fresh clone cannot run `server.mjs` and three unit test files cannot import (S-02).
3. **P0 Verified**: Responders cannot claim or advance any real report, because the rules read `assignedResponderIds`, a field the client is forbidden to create (F-10).
4. **P1 Traced**: Reviewers approve responders without ever seeing the ID or selfie; the view endpoint exists but no UI calls it (F-20).
5. **P1 Traced**: The emergency hotline directory requires sign-in, while the page copy, the rules comment, and the architecture all say it is public (F-01).
6. **P1 Traced**: The offline queue is written but never replayed, so "saved on this phone and will be retried" is false (F-05).
7. **P1 Traced**: Location is mandatory but can only be given by GPS or by typing latitude and longitude, and the error message points to a map that does not exist (F-03).
8. **P1 Traced**: Nothing in the app writes `publicFeed` or sets `verificationStatus`, so the resident home, the community page, and two dashboard metrics are permanently empty or zero (F-07, F-14).
9. **P1 Traced**: The deployed topology cannot deliver uploads or legacy redirects: Firebase Hosting serves only `dist/`, has no `/api` rewrite, and the redirect stubs are not in `dist/` (A-01, A-02).
10. **P1 Verified**: `npm run check` fails locally for anyone who follows the README, and 4 of 200 unit tests fail intermittently under parallel load (T-01, T-02).

The documentation set is internally contradictory in at least 14 places (section 9), and the workspace carries two diverging copies of the agent toolkit plus a governance model that conflicts with the project's own plan (section 8).

## 2. Checks actually run during this review

All commands ran in `Project_Tabang` on Windows 11 at about 15:50 to 15:55 +08:00.

| Command | Result |
|---|---|
| `npm run lint` | Passed with no output. |
| `npm run test:unit` (full suite) | 196 passed, 4 failed, 19 files. |
| `vitest run src/test/router.test.jsx` (alone) | 4 of 4 passed, so the failures are load-dependent. |
| `npm run test:redirects` | 4 of 4 passed. |
| `npm run check:contrast` | All pairs at or above 4.5:1. |
| `npm run scan:secrets` | Failed: "Committed .env file" for the untracked local `.env`. |
| `node server.mjs` on port 18777, then `curl` status only | `/.env` returned 200 with 1094 bytes; `/.git/config`, `/server.mjs`, `/package.json` returned 200. Only key names were printed; the server was stopped afterwards. |
| `ui-ux-pro-max` searches | "error summary validation" and "focus not obscured" returned verified matches; a page-title query returned off-topic results twice, so page-title guidance below is general WCAG guidance. |

Added at about 16:17 +08:00: `npm run test:rules` passed 29 of 29 (Java 24.0.2).
Added at about 16:18 +08:00: a scratch emulator probe outside the repository created a report with the real `buildReportDocument` shape as a resident (allowed), then claimed it as a responder (denied: "Property assignedResponderIds is undefined on object").
On this machine `emulators:exec` leaves the Firestore emulator process listening on port 18085 after it exits, so the next run fails with "port taken" until that process is stopped.

Not run: `npm run build` (it writes `dist/`), any browser or device check, and CI.
No claim below about browser behavior has been observed in a browser.

## 3. Security and breakage (P0 and P1 infrastructure)

### S-01 P0 Verified: the Node server publishes the whole project directory

- Evidence: `Project_Tabang/server.mjs:34` resolves every path against the project root, and `server.mjs:537` serves any existing file after the `dist/` lookup fails.
- Observed: `GET /.env` returned the 1094-byte secrets file, and `/.git/config`, `/server.mjs`, and `/package.json` were also served.
- Impact: this is the only process that holds `CLOUDINARY_API_SECRET`, and the docs say it must be deployed to a public Node host.
- Anyone who can reach it can read the secret, forge upload and delivery signatures, and open identity evidence.
- Direction: serve only `dist/` plus the four `/api/uploads/*` routes, or drop static serving entirely because Firebase Hosting already serves the SPA.
- Rotate the Cloudinary secret if this server has ever been reachable from another machine.

### S-02 P0 Traced: the signing module is gitignored and was never committed

- Evidence: `Project_Tabang/.gitignore:32` has `uploads/`, which also matches `scripts/uploads/`.
- `git log --all -- scripts/uploads/cloudinarySignature.mjs` returns zero commits.
- `server.mjs`, `src/test/uploads.test.js`, `src/test/responderApplication.test.jsx`, and `src/test/reviewQueue.test.jsx` all import it.
- Impact: on a fresh clone or in CI, `npm start` crashes on import and three unit test files fail to load, so the CI `check` job cannot pass.
- Lint does not catch it because ESLint does not resolve imports.
- Direction: anchor the ignore rule (`/uploads/`) and commit the module.

### S-03 P1 Traced: a reviewer can make themselves an admin

- Evidence: `firebase/firestore.rules:80` lets any reviewer create or update any `roleAssignments/{uid}` with role `resident`, `responder`, `reviewer`, or `admin`, including their own document.
- Impact: the README's role table says only admins can do admin things, but a reviewer can self-promote and then delete other role assignments.
- Direction (Needs Len): restrict reviewers to granting `responder` or `resident`, and forbid writes to one's own assignment.

### S-04 P2 Traced: legacy collections still accept unbounded writes

- Evidence: `firebase/firestore.rules:221` onward keeps `floodReports`, `helpRequests`, and `responders`.
- Any signed-in user can create `floodReports` and `helpRequests` documents with arbitrary content and size.
- Impact: the legacy pages are retired, so this is pure attack surface and cost exposure.
- Direction: delete those three match blocks once no production data needs them.

### S-05 P2 Traced: hotline rating totals can be forged

- Evidence: `firebase/firestore.rules:202` bounds `ratingCount` to plus one but only requires `ratingTotal >= 0`, and does not check that a matching review document is written.
- Impact: one account can set any average rating on any emergency number.
- Direction: require `ratingTotal` to move by at most 5 per count and use `getAfter` on the review document.

### S-06 P2 Traced: other rule gaps worth a decision

- `publicFeed` accepts any document from any responder with no schema (`firestore.rules:183`).
- Report creation validates no field types or lengths and lets the client pick `priority`.
- `assignmentIsHonoured()` lets any responder change the status of an incident claimed by someone else, as long as the assignee list is unchanged, which contradicts its own comment.
- Report photos are uploaded as public Cloudinary assets; only EXIF is stripped.

## 4. User flow review

### 4.1 Anonymous visitor

```
/  landing  ->  Sign in | Create account | Reset password | Privacy
            (no hotlines, no advisories, no "call for help" anywhere)
```

- **F-01 P1 Traced**: hotlines are only reachable at `/app/hotlines` and `/responder/hotlines`, both behind `RequireAuth` (`src/app/router.jsx:77`, `:90`).
- The page itself says numbers are "shown to everyone, signed in or not", the rules comment says "Calling a hotline must not require an account", and the rules do allow public reads.
- In a flood, a first-time visitor must register with name, email, phone, barangay, and password before they see a single number.
- **F-02 P2 Traced**: if the hotline collection is unseeded (the plan says it is), the app shows no numbers at all.
- The only copies of the three numbers live in `Hotline.html` and `responderhotline.html`, which are not deployed (A-02).
- No national emergency number is offered as a fallback in any error state.

### 4.2 Resident

```
signup -> /app home -> Report flood | Request help | Hotlines | My reports
                     -> drawer: Community, Apply as responder, Account, Sign out
```

- **F-03 P1 Traced**: location is mandatory (`reportSchemas.js` rejects missing coordinates), but the only inputs are "Use my current location" and two free-text latitude and longitude fields.
- The validation message says "Pick a location on the map" (`reportSchemas.js:70`), and there is no map.
- A resident indoors, without GPS permission, or on an old phone effectively cannot file a report.
- The legacy build used Leaflet (see `.idea/TabangWebApp.iml`), so this is a regression.
- **F-04 P1 Traced**: attaching a photo makes the whole report depend on `server.mjs`.
- Uploads run before the Firestore write, so any upload failure fails the entire submission (`ReportFormPage.jsx` submit handler).
- `docs/operations.md:137` says "reports still submit with text and location" when uploads break; that is only true if the resident removes the photos, and the error does not tell them to.
- **F-05 P1 Traced**: the offline queue is write-only.
- `createSubmissionQueue().list()` is never called outside tests, nothing retries, and reopening the form mints a new report ID, orphaning the queued entry until sign-out.
- `EmergencyFallback.jsx:13` tells the resident the report "will be retried", and the connectivity banner says an offline report "will be saved here".
- Firestore transactions also fail offline, so every offline submission lands in this state.
- **F-06 P1 Traced**: `ReportFormPage` expects a `hotlines` prop (`ReportFormPage.jsx:57`) that the router never passes, so the failure screen always says the directory could not be loaded and never shows a number.
- **F-07 P1 Traced**: the home page's main content is "Latest advisories", read from `publicFeed`, which no code writes; `/app/community` repeats the same six-item query on its own page.
- **F-08 P2 Traced**: every report shows "Not yet verified" forever, because nothing sets `verificationStatus`.
- **F-09 P2 Traced**: "Cancel this report" is shown on every non-cancelled report, but the rules only allow cancelling from `new` or `acknowledged`.
- `MyReportsPage.jsx:81` has no `try`/`catch`, so a refused cancel is an unhandled rejection with no message.
- A failed "Load older reports" silently hides the button.
- Additional resident gaps: no report detail or timeline view, no profile edit (the gateway's `updateOwnProfile` is unused), no email verification, and no data deletion path although the privacy page promises one.

### 4.3 Sign-in and session

- **F-11 P2 Check**: after `signIn` resolves, `LoginPage.jsx:47` navigates immediately, but the session is built asynchronously (role and profile reads).
- For that gap the status is `anonymous`, not `loading`, so `RequireAuth` bounces back to `/login`, and the final landing is the role home, losing the deep link in `location.state.from`.
- **F-12 P2 Check**: `observeSession` subscribes to both `onAuthStateChanged` and `onIdTokenChanged` (`firebaseAuthGateway.js:107`) with an async builder and no ordering guard.
- A sign-out that lands while an earlier `buildSession` is still awaiting can be overwritten by the stale signed-in session.
- The comment says token changes refresh roles after approval, but approval writes `roleAssignments`, not a claim, so users must still sign out and back in.

### 4.4 Responder

```
/responder dashboard -> Incidents (filter) -> Incident detail -> Mark next status
                      -> Hotlines | Account   (no way back to /app features)
```

- **F-10 P0 Verified**: `buildReportDocument` never writes `assignedResponderIds`, and the create rule forbids it (`firestore.rules:127`).
- `assignmentIsHonoured()` (`firestore.rules:60`) then evaluates `resource.data.assignedResponderIds.size()` on a missing field, which errors in every branch, which denies the update.
- The rules tests only pass because `buildManagedReport` seeds `assignedResponderIds: []` with rules disabled, a shape real clients cannot create.
- If confirmed in the emulator, no responder can claim or transition any real report.
- **F-13 P1 Traced**: the queue is oldest first with a hard cap of 25 (`incidentRepository.js:24`) and no pagination.
- With a backlog over 25, the newest emergencies are invisible, and the dashboard metrics are computed from the same truncated page.
- There are no live updates; the queue only changes on manual refresh.
- **F-14 P2 Traced**: "Verified incidents" is always 0 and "Awaiting verification" always equals open incidents, because no UI can verify an incident.
- **F-15 P2 Traced**: the detail page offers "Mark acknowledged" on a `new` incident through `transitionIncident`, which does not assign the responder, so an incident can be acknowledged yet still count as unclaimed.
- **F-16 P2 Traced**: uploaded photos are stored as `imagePaths` but `toIncident` drops them, so responders never see the photos residents were asked to take.
- Coordinates are shown as raw numbers with no map or directions link, and depth, need, status, and role values are shown as raw enums such as `above-head`, `food-water`, and `on_scene`.
- **F-17 P2 Traced**: the README says responders can do everything residents can, but the responder layout has no link to report, request help, or the community page, and residents who become responders have no link to `/responder`.

### 4.5 Reviewer

- **F-20 P1 Traced**: `ReviewQueuePage` lists organization, badge number, municipality, and consent version only.
- It never calls `/api/uploads/identity-view`, and it does not show the applicant's name or email, so approval is blind.
- **F-21 P2 Traced**: `notes` state exists (`ReviewQueuePage.jsx:25`) but no input sets it, so `reviewNotes` is always empty although applicants are shown "Reviewer notes".
- **F-22 P2 Traced**: evidence deletion runs after the decision commits, `destroyEvidence` ignores non-OK responses (`reviewRepository.js:46`), and any throw is reported as "Nothing was changed; try again" (`ReviewQueuePage.jsx:88`), which is false.
- The README promise that evidence is deleted "as soon as an application is decided" is therefore not guaranteed.
- **F-23 P2 Traced**: a rejected applicant sees "Not approved" forever and cannot reapply, because the owner update rule requires status `pending`.
- If loading the application fails, the page shows the empty form instead of an error (`ResponderApplicationPage.jsx:69`), and a resubmit then fails on permissions.
- **F-24 P2 Traced**: the README says reviewers "manage hotlines", but there is no hotline management UI; verification is done by hand in the Firebase console.

## 5. UI, copy, and accessibility

### 5.1 Developer language shown to users

These strings describe the migration or the implementation rather than helping a resident in a flood.

| Location | Text |
|---|---|
| `src/app/App.jsx:13` | "Loading the new shell", "Bootstrapping the Phase 1 application shell" (also a dead prop, see P-06). |
| `src/layouts/PublicLayout.jsx:12` | Header eyebrow "Phase 1 shell" on every public page. |
| `src/layouts/ResponderLayout.jsx:38` | Header eyebrow "Responder shell". |
| `src/routes/pages.jsx:47` | Title "Route error boundary" plus the raw `error.message`. |
| `src/routes/pages.jsx:68` | Not-found page points users to "the project documentation". |
| `src/routes/home/ResidentHomePage.jsx:184` | "Every action here is a real route, so links, bookmarks, and the back button all work." |
| `ResidentHomePage.jsx` advisories description | "Published, sanitized advisories only, at most six". |
| `src/routes/account/AccountPage.jsx:6` | Section tag "Resident route" or "Responder route", and a paragraph about how the session is resolved. |
| `ResponderDashboardPage.jsx` | A whole section explaining what "the previous version" displayed. |
| `IncidentDetailPage.jsx` | "Append-only. Entries carry server time and the account that made them." |
| `index.html` meta description | "Tabang application shell for the incremental migration from duplicated static pages". |
| `src/routes/auth/LoginPage.jsx:79` | Tag "Resident access" on the only sign-in page, which responders also use. |
| Several catch blocks | Raw Firebase `error.message` values such as permission errors are shown directly in report, claim, transition, rating, and application forms. |

`src/app/ErrorBoundary.jsx:34` also states that hotline numbers "are printed on the barangay noticeboard", which the app cannot know.

### 5.2 Visual identity and brand

- **U-01 P2 Traced**: `index.html:11` and `public/manifest.webmanifest:9` still use teal `#0d6e6e` and a cream background from the replaced design, while the UI is navy and orange.
- **U-02 P2 Traced**: the manifest icon `/images/tabang-logo.png` is not in `public/`, so it is not in `dist/`; the PWA has no valid icon and is likely not installable.
- No logo appears anywhere in the UI, and `images/` holds six other unused files.
- **U-03 P3 Traced**: `global.css` hardcodes `#0e2a63`, `#0a2470`, and several rgba values outside `tokens.css`, and eight tokens are defined but unused (`--color-surface-strong`, `--color-primary-strong`, `--color-responder`, `--color-danger-strong`, `--color-responder-text`, `--color-shadow`, `--space-6`, `--shadow-soft`).
- **U-04 P3 Traced**: the UI is English only apart from "Kumusta"; for Aklan residents, Filipino or Aklanon copy is a product question (Needs Len).

### 5.3 Accessibility

- **U-10 P2 Traced**: every route keeps the document title "Tabang"; there is no per-route title and no focus move or announcement on navigation (general WCAG 2.4.2 guidance; no verified dataset match).
- **U-11 P2 Traced**: heading order skips levels.
- The header `h1` repeats on every page ("Kumusta, name", "Tabang", "Responder Workspace"), and pages built from `Section` start at `h3`.
- **U-12 P2 Traced**: the long report form has no error summary and does not move focus to the first error after a failed submit (verified dataset guidance: "Focusable Error Summary", severity High).
- The severity, need, and description errors, the hotline rating error, and the longitude field are not linked with `aria-describedby`.
- **U-13 P2 Check**: the bottom navigation is `position: fixed` with no `scroll-padding-bottom` and no `env(safe-area-inset-bottom)`, so focused fields near the bottom can sit under it, and it can overlap the iOS home indicator (verified dataset guidance on focus not obscured).
- **U-14 P3 Traced**: `Modal` has no focus trap, unlike `NavDrawer`.
- **U-15 P3 Traced**: the rating form appears inside every hotline card, which adds noise to the one screen that must be fastest to scan.
- Positive: contrast is measured and passes, focus-visible styles exist, reduced motion is respected, touch targets are 44 px or more, and form fields have real labels.

## 6. Code correctness and consistency

- **C-01 P2 Traced**: status and label maps are duplicated with different wording.
- `statusLabels.js` calls `new` "Unclaimed", `ReportCard.jsx` calls it "Awaiting response", and tone maps are copied in both.
- `SEVERITY_LABELS` and `NEED_LABELS` live only in the form, so other screens show raw values.
- **C-02 P3 Traced**: `formatWhen` is copied into six files, the Philippine phone regex into three, and a whitespace `collapse` helper into four.
- **C-03 P3 Traced**: `buildPublicSummary` produces text such as "(above-head-deep)" and "(food-water)".
- **C-04 P3 Traced**: `COORDINATE_BOUNDS` covers the whole Philippines while its comment says Aklan.
- **C-05 P3 Traced**: the "15 minute" target is hardcoded in `IncidentQueuePage.jsx:158` and `dashboardMetrics.js` instead of reading `ACKNOWLEDGEMENT_TARGET_MS`.
- **C-06 P3 Traced**: the service worker caches any same-origin GET response, including error responses.
- **C-07 P3 Traced**: `server.mjs` returns a raw 403 with no headers for traversal attempts and calls `fetch` to Cloudinary without a timeout.

## 7. Architecture

### 7.1 Deployment topology does not close

- **A-01 P1 Traced**: the client calls relative `/api/uploads/*` paths, the CSP allows `connect-src 'self'`, and Firebase Hosting serves `dist/` with a catch-all rewrite to `index.html` and no `/api` rewrite.
- The docs say `server.mjs` runs "somewhere with Node".
- As configured, a separate origin is blocked by CSP and the same origin has no backend, so uploads, identity evidence, and therefore responder applications cannot work in the documented deployment.
- Direction (Needs Len): pick one topology, for example a Hosting rewrite to Cloud Run or a Cloud Function, or serve everything from the Node host.
- **A-02 P1 Traced**: the 18 legacy redirect stubs, `404.html`, and the Google verification file live in the project root, not `public/`, so none of them are in `dist/`.
- On Firebase Hosting every legacy URL falls through to the SPA's not-found page, and the "kept deliberately" verification file is already missing.
- The redirect test passes because it checks the repository root, not the build output.
- **A-03 P2 Traced**: `.firebaserc` defines only a `staging` alias, so `npx firebase deploy --only hosting` in `docs/operations.md:82` needs `--project` or `firebase use`.

### 7.2 Boundaries (clean-architecture lens)

Observed facts:

- `incidentLifecycle.js`, `reportSchemas.js`, `roles.js`, and `dashboardMetrics.js` are pure and framework-free, which is the right inner layer.
- Every repository factory imports `getFirebaseDb` and Firestore functions directly, and every page builds its own repository with `repository ?? createXRepository()`, so wiring is spread across nine components instead of one composition root.
- The "submit a report" use case (validate, queue, upload, write, dequeue) lives inside `ReportFormPage.jsx`, and "decide an application" mixes a Firestore transaction, an auth token lookup, and HTTP calls in one repository method.
- Business decisions such as claim eligibility sit inside Firestore transaction callbacks in `incidentRepository.js`, so they can only be tested through Firestore-shaped fakes.
- The transition table is intentionally duplicated in rules and client, but nothing tests that the two copies match.
- Roles are read from two sources, custom claims and `roleAssignments`, and nothing sets claims.

Assessment:

- For a hackathon-scale app, a full layered rewrite is not justified.
- The cheapest boundary with real value is one app-level services context (the composition root) and two extracted use-case functions: `submitReport` and `decideApplication`.
- A shared test that loads the rules' transition list and compares it to `ALLOWED_TRANSITIONS` would protect the duplicated policy.

### 7.3 Repeated page plumbing

- Nine route components hand-roll the same `loadState` plus `activeRef` plus `refresh` state machine, about 30 lines each.
- The app already uses `createBrowserRouter`, whose loaders, `errorElement`, and revalidation provide this natively.

## 8. Over-engineering and dead code (ponytail-audit, ranked by size of cut)

Scope here is complexity only; correctness items are above.

1. `shrink:` nine copies of the fetch-state machine in route pages. Use React Router loaders or one `useAsync` hook. [`src/routes/**`, about -200 lines]
2. `delete:` static file serving, the legacy landing fallback, and the duplicated `getPath`/`getDistPath` in `server.mjs`. Keep only the API routes; Hosting serves the SPA. [`server.mjs`, about -120 lines]
3. `shrink:` four `/api` handlers repeat method check, config check, body parse, and token verify. One wrapper. [`server.mjs`, about -120 lines]
4. `delete:` `redact.js` and its test; its own comment says no monitor is wired up. Nothing. [`src/services/observability/redact.js`, `src/test/redact.test.js`, -148 lines]
5. `yagni:` Storage rules, Storage rules tests, Storage emulator config, and `VITE_STORAGE_EMULATOR_*` for a service the project does not use. Remove until Storage is chosen (Needs Len). [`firebase/storage.rules`, `tests/rules/storage.rules.test.mjs`, `src/config/env.js`, `.env.example`, about -165 lines]
6. `delete:` `CommunityFeedPage` duplicates the home advisories query and limit. One advisories view. [`src/routes/community/CommunityFeedPage.jsx`, -96 lines]
7. `delete:` toast system; `pushToast` is never called. Nothing. [`ToastContext.js`, `ToastProvider.jsx`, `useToast.js`, -41 lines]
8. `delete:` legacy `floodReports`, `helpRequests`, and `responders` rule blocks. Nothing. [`firebase/firestore.rules`, about -30 lines]
9. `delete:` `scripts/check-contrast.mjs`, an older copy of `scripts/a11y/check-contrast.mjs`. Nothing. [-28 lines]
10. `delete:` `legacy-index.html` (redirects `/` to `/`) and Firebase's boilerplate `404.html`. The SPA not-found route. [-55 lines]
11. `native:` `onAuthStateChanged` plus `onIdTokenChanged`; the second already fires on sign-in and sign-out. Use `onIdTokenChanged` alone. [`firebaseAuthGateway.js`]
12. `delete:` `fallbackElement` on `RouterProvider`; React Router 7.18 no longer accepts it. Nothing. [`src/app/App.jsx`]
13. `delete:` unused `updateOwnProfile` (context, provider, gateway), `getFirebaseApp`, and `AppHeader` `actionLabel`/`actionHref`. Nothing, or build the profile edit screen (Needs Len). [about -30 lines]
14. `shrink:` `TransitionError` and `AlreadyClaimedError` are never checked by type. Plain `Error`. [`incidentRepository.js`]
15. `yagni:` custom-claim role branch in the gateway and rules with nothing that sets claims. Pick one role source (Needs Len). [`firebaseAuthGateway.js`, `firestore.rules`]
16. `shrink:` npm scripts call `node ./node_modules/<pkg>/...` instead of the binary name, which npm already puts on `PATH`. [`package.json`]
17. `delete:` six unused images, `.idea/`, `.vscode/launch.json` (port 8080) and `.vscode/settings.json` (Live Server 5501), the `handa360/` ignore entry, and the empty `tabang-hackathon-project` gitlink. Nothing.

net: about -1,000 lines, -0 deps possible.

## 9. Conflicting documentation

| Topic | Source A says | Source B says | Reality in code or config |
|---|---|---|---|
| CI exists | `docs/final-architecture.md:47`: "No CI... Phase 13 was not executed." | Plan section 12: Phase 13 complete. | `.github/workflows/check.yml` exists. |
| Who writes roles | `README.md:53`: "no client can write". | `final-architecture.md:22`: "writable only by a reviewer". | Reviewer clients can write any role, including admin (S-03). |
| Role authority | `docs/firebase-migration-note.md:9`: custom claims are the boundary; evidence in Storage. | README and architecture: `roleAssignments` and Cloudinary. | `roleAssignments` plus Cloudinary; the note was never archived. |
| Hotlines public | `HotlineDirectoryPage` copy and rules comment: no account needed. | Router. | Behind `RequireAuth` (F-01). |
| Upload failure | `operations.md:137`: text reports still submit. | `ReportFormPage` submit order. | Any upload failure fails the whole report (F-04). |
| Offline retry | Plan line 881: "[x] Retry queued submissions". `EmergencyFallback`: "will be retried". | Code. | Nothing replays the queue (F-05). |
| Queue privacy | Plan line 879: "[x] encrypted or minimized" queue. | `submissionQueue.js`. | Plain JSON of the full report in `localStorage`. |
| Webfont | Plan line 1572: "Self-hosted Inter via @fontsource/inter". `tokens.css:23` and `operations.md`: install it. | Commit `58fd878` removed the package. | No webfont; plan never updated. |
| Legacy URLs | `docs/legacy-url-map.md`: every old URL "still reaches the right place". | `firebase.json` hosting `public: dist`. | Stubs are not deployed (A-02). |
| Verification file | `legacy-url-map.md`: kept so domain verification keeps working. | Build output. | Not in `dist/`. |
| Plan state | Plan line 1139: last completed phase is 12; blockers still list the Phase 5 upload decision. | Phase table and handoff log. | All 14 phases marked complete; five later fix commits have no handoff entries. |
| Retired page count | Plan Phase 14: "16 URLs mapped". | `legacy-url-map.md` and the redirect test. | 18 stubs. |
| Reviewer powers | `README.md:50`: reviewers manage hotlines. | UI. | Console only (F-24). |
| Responder powers | README: responders can do everything residents can. | `ResponderLayout`. | No navigation to resident features (F-17). |
| Privacy policy | `PrivacyPage.jsx:28` and `:82`: analytics providers, "Last updated April 2026". | Code. | No analytics; ID and selfie collection, Cloudinary as processor, and local queue storage are not disclosed. |
| Local check | README: `cp .env.example .env`, then `npm run check`. | `scan-secrets.mjs:81`. | Any local `.env` fails the check (T-01). |
| Governance | Root `AGENTS.md` and `GEMINI.md`: read `docs/SPEC_INDEX.md` and `HANDOFF.md`; run phases without routine stops. | `AI_IMPLEMENTATION_PLAN.md` section 2: GPT-5.4 protocol, hard stop after every phase. | Neither `SPEC_INDEX.md` nor `HANDOFF.md` exists. |

The privacy item is flagged for product review, not as legal advice; a Philippine app handling IDs would normally reference the Data Privacy Act of 2012 and name a contact point beyond a Gmail address (Needs Len).

## 10. Stale and misplaced files

| Path | Why it is stale or risky | Suggested fate |
|---|---|---|
| `Project_Tabang/scripts/uploads/cloudinarySignature.mjs` | Required but gitignored and untracked (S-02). | Commit it after fixing the ignore rule. |
| `Project_Tabang/*.html` (18 stubs), `404.html`, `googlebf1b788405b1680b.html` | Not deployed from the root (A-02). | Move to `public/` or delete (Needs Len). |
| `Project_Tabang/legacy-index.html` | Redirects `/` to `/`. | Delete. |
| `Project_Tabang/scripts/check-contrast.mjs` | Older duplicate of `scripts/a11y/check-contrast.mjs`. | Delete. |
| `Project_Tabang/images/*` | Six files unused; the logo is referenced from the manifest but not deployed. | Move the logo to `public/`, delete the rest. |
| `Project_Tabang/tabang-hackathon-project` | Empty gitlink (mode 160000) with no `.gitmodules`. | Remove from the index. |
| `Project_Tabang/.idea/`, `.vscode/` | Legacy IDE and Live Server settings; `.iml` lists Leaflet, D3, Font Awesome. | Remove from Git. |
| `Project_Tabang/firestore-debug.log` | Empty emulator log (ignored). | Delete locally. |
| `Project_Tabang/dist/` | Built on 2026-08-15 12:06, before later source commits. | Rebuild before any deploy. |
| `Project_Tabang/docs/firebase-migration-note.md` | Superseded design (claims plus Storage). | Archive with a link to `final-architecture.md`. |
| `Project_Tabang/docs/final-architecture.md` | Limitation 7 is stale. | Update. |
| `Project_Tabang/AI_IMPLEMENTATION_PLAN.md` (1,609 lines) | Completed plan with stale "Current State", written for a different agent protocol. | Archive; replace with a short handoff (Needs Len). |
| `Project_Tabang/.gitignore` | `handa360/` belongs to another project; `uploads/` is unanchored. | Fix. |
| `Project_Tabang/.agents/.claude/` | A full `.claude` directory (skills copy, `settings.json`, `settings.local.json`, `scheduled_tasks.lock`, `worktrees/`) nested where Claude Code does not read it; its hook reads a `HANDOFF.md` that does not exist. | Delete. |
| `Project_Tabang/.agents/tests/*.py` | Toolkit tests that reference `docs/58_MULTI_AGENT_HANDOFF_SPEC.md`, which is not in this project. | Remove from the product repo. |
| `Project_Tabang/.agents/rules/GEMINI.md` | Points to `docs/README.md#current-register`, which does not exist, and differs from the root copy. | Reconcile with the root copy. |
| Root `.agents/skills` vs `Project_Tabang/.agents/skills` | Two diverging skill trees; root `.claude/skills` symlinks mix both; `__pycache__` files are present. | Keep one source (Needs Len). |
| Root repository | Branch `master` with no commits wrapping a nested repository on `main`; adding the folder would embed a repository. | Decide which repository is canonical (Needs Len). |

## 11. Test and CI health

- **T-01 P1 Verified**: `npm run scan:secrets` fails whenever a local `.env` exists, which the README tells every developer to create, so the documented `npm run check` cannot pass locally with a working configuration.
- CI only passes this step because it has no `.env`; the check should look at tracked files (`git ls-files`) instead of the working tree.
- **T-02 P2 Verified**: 4 of 200 unit tests failed in the full run and passed alone.
- The failures are `findBy*` calls on lazily loaded routes timing out just over the 1 s default (1104 ms, 1265 ms, 1659 ms).
- **T-03 P1 Traced**: CI will fail on a clean checkout because of S-02.
- The plan says the workflow has never run.
- **T-04 Withdrawn**: `npm run test:rules` passed 29 of 29 with the Storage emulator, so the suspected emulator failure does not occur.
- **T-04b P3 Verified**: after `emulators:exec` exits on this machine, the Firestore emulator keeps port 18085, which blocks the next run and any parallel run.
- **T-05 P2 Traced**: rules tests seed report documents with fields the client cannot create, so they validate a data shape production never has (F-10).
- **T-06 P3 Traced**: CI omits `check:contrast`, ESLint ignores `scripts/` and `tests/`, and ESLint ignores `JS/**` and `javascript/**`, which no longer exist.
- **T-07 P3 Traced**: no browser, end-to-end, or device test exists, and the plan's manual browser checklist has never been run.

## 12. Council synthesis

### Observed facts

- The secrets exposure, the untracked signing module, the failing secret check, and the flaky tests were observed during this review.
- The flow gaps (public hotlines, write-only queue, missing map, blind review, empty advisories) were traced through code and router config.
- The rules failure on claims (F-10) was confirmed with an emulator probe; the suspected Storage emulator failure (T-04) was disproved.

### Unverified assumptions

- That `server.mjs` has not yet been exposed publicly.
- That the production Firestore has no reports created outside the app with `assignedResponderIds` already present.
- That residents in the target area have smartphones with GPS and data during floods.

### Perspectives

- Devil's advocate: the product's promise is "report and get help in a flood", and today an anonymous user cannot see a number, a resident without GPS cannot report, and a responder may not be able to claim.
- Simplicity: much of the code protects against future integrations (monitoring, Storage, claims) while core flows are unfinished; cutting about 1,000 lines would free time for the flows that matter.
- Security and reliability: S-01 and S-03 are the real risks; most of the careful client-side hardening is moot while the signing server leaks its own secret.
- Architecture: the pure domain modules are good; the missing pieces are one composition root, two use-case functions, and one deployment topology that actually connects the SPA to its API.

### Proposed decisions for Len's approval

1. Treat S-01, S-02, F-10, and A-01 as a blocking stabilization phase before any new feature.
2. Make the hotline directory a public route and show it on the landing page with a national emergency fallback.
3. Choose a location input: an embedded map (Leaflet was used before and would be a new dependency), a barangay picker with optional GPS, or optional coordinates.
4. Decide whether offline submission is in scope; either implement replay or remove the queue and its promises.
5. Decide who publishes advisories and who verifies incidents, or remove those surfaces until there is an owner.
6. Choose one deployment topology for the upload API.
7. Adopt one governance model: the root `AGENTS.md` spec workflow or the project's plan file, and archive the other.

### Conditions to revisit

- If Storage becomes affordable, identity evidence could move back behind Storage Rules and the signing server would shrink.
- If the app stays a demo with no real responders, the reviewer and incident work can be deprioritized behind the resident and anonymous flows.

## 13. Suggested order of work

This is a proposal only; nothing here is authorized until approved.

1. Stabilize: S-01, S-02, T-01, T-02, then fix F-10 with a rules test that uses the real client document shape.
2. Deployment: A-01, A-02, A-03, U-02.
3. Emergency path: F-01, F-02, F-03, F-04, F-06.
4. Responder and reviewer: F-10, F-13, F-16, F-20, F-21, F-22.
5. Honesty of copy: section 5.1, F-05, F-07, F-08, F-14.
6. Rules hardening: S-03, S-04, S-05, S-06.
7. Cleanup: section 8 and section 10.
8. Documentation: section 9, then one current handoff document.

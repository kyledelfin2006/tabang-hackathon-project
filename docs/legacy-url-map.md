# Legacy URL map

Every retired page has a permanent server redirect to its replacement route,
so an old bookmark, a printed flyer, or a link shared in a barangay group chat
still reaches the right place instead of a 404.

| Legacy URL | Replacement route | Notes |
|---|---|---|
| `/legacy-index.html` | `/` | Landing. |
| `/Homepage.html` | `/app` | Resident home. |
| `/Login.html` | `/login` | One sign-in for everyone. |
| `/Loginresponder.html` | `/login` | Responder access comes from a role, not a separate login. |
| `/signup.html` | `/signup` | Resident registration. |
| `/Signupresponder.html` | `/signup` | Public responder self-registration was removed in Phase 7. |
| `/VerAcc.html` | `/app/responder-application` | Self-verification replaced by reviewed application. |
| `/ReportFlood.html` | `/app/reports/new` | Flood report form. |
| `/RequestHelp.html` | `/app/help/new` | Help request form. |
| `/MyReports.html` | `/app/reports` | Personal report list. |
| `/AllReports.html` | `/responder/incidents` | Responder incident queue. |
| `/Hotline.html` | `/hotlines` | Public hotline directory. |
| `/responderhotline.html` | `/hotlines` | Public hotline directory. |
| `/Dashboard.html` | `/responder` | Fabricated KPIs removed in Phase 9. |
| `/responderhomepage.html` | `/responder` | Responder workspace. |
| `/AccountInfo.html` | `/app/account` | Resident account. |
| `/AccountInformation.html` | `/responder/account` | Responder account. |
| `/Privacypolicy.html` | `/privacy` | Policy content migrated in Phase 3. |

## Retired app routes

- `/app/community` now redirects to `/app` inside the app, because advisories have one home, the resident home page (FEAT-001 plan phase 4). It is an app route, not a server redirect, so it is not in the table above.

## Kept deliberately

- `/index.html` — the application entry.
- `/googlebf1b788405b1680b.html` — served from `public/` so the build keeps
  the search-console verification token.

## Retired with the pages

- `JS/` and `javascript/` — every legacy script, including the duplicated
  Firebase initialisation that hardcoded the project config.
- `css/` — stylesheets referenced only by the retired pages.

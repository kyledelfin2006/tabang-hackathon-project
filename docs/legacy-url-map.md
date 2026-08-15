# Legacy URL map

Every legacy page is mapped to the route that replaced it. None is deleted
outright: each becomes a small redirect stub, so an old bookmark, a printed
flyer, or a link shared in a barangay group chat still reaches the right place
instead of a 404.

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
| `/Hotline.html` | `/app/hotlines` | Keeps the three numbers as static text. |
| `/responderhotline.html` | `/responder/hotlines` | Same directory, responder shell. |
| `/Dashboard.html` | `/responder` | Fabricated KPIs removed in Phase 9. |
| `/responderhomepage.html` | `/responder` | Responder workspace. |
| `/AccountInfo.html` | `/app/account` | Resident account. |
| `/AccountInformation.html` | `/responder/account` | Responder account. |
| `/Privacypolicy.html` | `/privacy` | Policy content migrated in Phase 3. |

## Kept deliberately

- `/index.html` — the application entry.
- `/404.html` — the static server's not-found page.
- `/googlebf1b788405b1680b.html` — a search-console verification token. Removing
  it would silently break domain verification.

## Retired with the pages

- `JS/` and `javascript/` — every legacy script, including the duplicated
  Firebase initialisation that hardcoded the project config.
- `css/` — stylesheets referenced only by the retired pages.

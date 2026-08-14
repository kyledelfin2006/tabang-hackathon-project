# Legacy Flow Map

Generated for Phase 0 baseline documentation.

| Flow area | Entry page | Route path | Notes |
| --- | --- | --- | --- |
| Public entry | index.html | index.html -> Login.html \| signup.html \| Loginresponder.html \| Privacypolicy.html | Landing page routes users into resident login, resident signup, responder login, and privacy policy. |
| Resident authentication | Login.html / signup.html | Login.html -> Homepage.html; signup.html -> Homepage.html | Resident authentication is browser-driven with Firebase Auth and client-side redirects. |
| Resident incident actions | Homepage.html | Homepage.html -> ReportFlood.html \| RequestHelp.html \| Hotline.html \| MyReports.html \| Dashboard.html \| AccountInfo.html | The resident home page exposes the main reporting, help, hotline, dashboard, reports, and account flows. |
| Resident account variants | AccountInfo.html / AccountInformation.html | Homepage.html -> AccountInfo.html; responderhomepage.html -> AccountInformation.html | Two account pages exist with overlapping responsibilities and different role assumptions. |
| Responder authentication | Loginresponder.html / Signupresponder.html / VerAcc.html | Loginresponder.html -> responderhomepage.html; Signupresponder.html -> responderhomepage.html; VerAcc.html -> AccountInfo.html | Responder onboarding is currently exposed publicly and includes a broken verification page and self-created responder records. |
| Responder workspace | responderhomepage.html | responderhomepage.html -> AllReports.html \| responderhotline.html \| AccountInformation.html | Responder navigation is split across dashboard, all reports, hotline view, and account view. |

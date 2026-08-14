# Accessibility and Performance Baseline

Generated from local files only. These are baseline indicators, not final acceptance metrics.

## Heaviest HTML pages

| Page | Size |
| --- | --- |
| index.html | 812.76 KB |
| Hotline.html | 22.03 KB |
| responderhotline.html | 20.60 KB |
| AccountInformation.html | 14.75 KB |
| Homepage.html | 14.18 KB |

## Accessibility baseline notes

- Pages that disable or restrict zoom: `AccountInfo.html`, `AccountInformation.html`, `Dashboard.html`, `Homepage.html`, `Hotline.html`, `index.html`, `Login.html`, `Loginresponder.html`, `MyReports.html`, `ReportFlood.html`, `RequestHelp.html`, `responderhotline.html`, `signup.html`, `Signupresponder.html`, `VerAcc.html`
- Pages that load remote stylesheets: `AccountInfo.html`, `AccountInformation.html`, `AllReports.html`, `Dashboard.html`, `Homepage.html`, `Hotline.html`, `index.html`, `Login.html`, `Loginresponder.html`, `MyReports.html`, `Privacypolicy.html`, `ReportFlood.html`, `RequestHelp.html`, `responderhomepage.html`, `responderhotline.html`, `signup.html`, `Signupresponder.html`, `VerAcc.html`
- Pages that load remote scripts: `Dashboard.html`, `MyReports.html`, `ReportFlood.html`, `RequestHelp.html`, `responderhomepage.html`
- Inline Base64 image occurrences: 1
- HTML image tags missing an alt attribute: `MyReports.html#img-1`

## Phase 0 observations

- The landing page remains the heaviest HTML document because it embeds the logo as a Base64 data URL.
- Multiple pages still use `maximum-scale=1.0` or `user-scalable=no`, which blocks or limits user zoom.
- The legacy app depends on remote CDNs for fonts, icons, Leaflet, and Firebase browser modules.
- This baseline captures the pre-migration state so later phases can measure improvement rather than guess.

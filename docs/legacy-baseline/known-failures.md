# Known Legacy Failures

These issues are intentionally preserved in the Phase 0 baseline so they stay visible while later phases replace them.

## Expected broken local references

| Owner | Source type | Reference | Resolved path | Why it matters |
| --- | --- | --- | --- | --- |
| AccountInfo.html | html-image | tabang-badge.png | tabang-badge.png | The verified badge image is referenced locally but not present in the repository. |
| AccountInfo.html | html-script | /cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js | ../../../../../../../../../cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js | The page expects a Cloudflare-injected email decode script that is not available in the local app. |
| AccountInformation.html | html-image | tabang-badge.png | tabang-badge.png | The verified badge image is referenced locally but not present in the repository. |
| AccountInformation.html | html-script | /cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js | ../../../../../../../../../cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js | The page expects a Cloudflare-injected email decode script that is not available in the local app. |
| JS/VerAcc.js | js-import | ./firebase.js | JS/firebase.js | Responder verification imports a nonexistent module path. |

## Expected HTTP fallback defects

- `/missing-script.js` currently returns HTTP 200 and serves the 404 body. Reason: The legacy static server falls back to 404.html but still responds with HTTP 200.

## Additional verified risks tracked for migration

- `JS/MyReports.js` subscribes to `floodReports` and `helpRequests` before narrowing the resident's view, which leaks community data into a personal reports screen.
- `JS/AllReports.js` gates access on authentication only and does not verify a trusted responder role.
- `JS/Signupresponder.js` and `JS/VerAcc.js` write responder records directly from the browser.
- `server.mjs` serves missing assets with the 404 page but an HTTP 200 status.

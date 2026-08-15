# Operations

Procedures that cannot be automated, and the ones somebody will need under
pressure. Written to be followed by a person who did not build this.

## Granting the first reviewer

Nothing in the application can create the first reviewer: no client may write
`roleAssignments`, which is what makes the role trustworthy. Do it once, by
hand.

1. Firebase console → Firestore → start a collection `roleAssignments`.
2. Document ID: the account's Firebase Auth UID (Authentication → Users).
3. Fields:
   - `userId` (string) — the same UID. Rules reject a mismatch.
   - `role` (string) — `reviewer`.
   - `assignedBy` (string) — your name, for the record.
   - `assignedAt` (timestamp) — now.
4. That account signs out and back in. The role is read when the session is
   established.

After this, reviewers grant responder roles through the app.

## Revoking a responder

1. Firestore → `roleAssignments/{uid}` → set `role` to `resident`.
2. Tell them to sign out. An existing session keeps its role until it is
   re-established, so this is not instant.
3. Their past incident events stay. The audit trail is append-only by design;
   removing somebody's history would falsify the response record.

Only an admin can delete a role assignment outright. Downgrading to `resident`
is the normal action and leaves a clearer record.

## Verifying a hotline

Numbers display as **unverified** until this is done, and residents are told
so.

1. Ring the number. Confirm the organisation answers and covers the area.
2. Firestore → `hotlines/{id}` → set `verified` true, `verifiedAt` to now, and
   `verifiedBy` to your name or office.
3. Re-verify every six months. The app flags verifications older than that.

Do not mark a number verified you have not rung. A wrong emergency number
during a flood is worse than an unverified one, because the label removes the
resident's reason to double-check.

## Moderating a report

Reports are never deleted by residents; they cancel, and the record stays.

- **Abusive or mistaken content**: a reviewer may delete the report document.
  This is the only deletion path and should be rare.
- **A resident asks for their data to be removed**: their report contains
  their own coordinates and number. Deleting it removes the response record
  too, so agree with them what happens to the incident history first.

## Backup and recovery

There is no automated backup. Before any risky change:

1. Firestore console → Import/Export → export to a Cloud Storage bucket.
   *This creates a paid resource; get approval first.*
2. Rules and indexes are in git. `npm run deploy:rules` restores them.
3. To roll back rules, check out the previous commit and deploy again. Rules
   deploys are near-instant and reversible; index deletions are not, so avoid
   removing an index unless you are certain.

## Deploying

Rules and indexes:

```bash
npm run deploy:rules
```

The application, once hosting is configured:

```bash
npm run check
npx firebase deploy --only hosting
```

### The app uses no webfont

The Content-Security-Policy is `style-src 'self'; font-src 'self'`, so a
Google Fonts link is blocked. That is not a bug to work around by loosening the
policy: a font is not worth a third-party request on every visit, and a webfont
that fails on a weak connection is worse than none during a flood.

The design therefore uses Inter if the device already has it and a close native
face otherwise. To ship Inter properly, run `npm install @fontsource/inter` and
import the weights in `src/main.jsx`. Vite emits the files to `/assets`, which
is same-origin, so the policy stays as it is.

### If a deploy fails on Firebase Storage

`Error: Firebase Storage has not been set up on project 'asu-tabang'`

Storage is not enabled and is not meant to be. Uploads go to Cloudinary so the
project can stay on the free plan. `firebase.json` no longer lists a storage
deploy target, which is what caused this. If it reappears, check that nobody
has re-added the `"storage"` block at the top level; the `"storage"` entry
under `"emulators"` is a different thing and should stay.

`server.mjs` runs separately on a Node host with these values set:
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`,
`FIREBASE_WEB_API_KEY`, `FIREBASE_PROJECT_ID`.

Never commit those. `npm run scan:secrets` runs in CI and will fail the build.

## If uploads stop working

The endpoints fail closed. Check, in order:

1. Is `server.mjs` running and reachable at `/api/uploads/...`?
2. Are all five environment values set? A missing one returns 503.
3. Is the Cloudinary account within quota?

While this is broken, reports still submit with text and location. That is the
intended degradation: losing a photo is better than losing the report.

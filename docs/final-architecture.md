# Tabang — final architecture and known limitations

## Shape

A Vite + React single-page application. Every route lives in the SPA; the
former one-HTML-file-per-page structure is retired and each old URL redirects
(see `legacy-url-map.md`).

- `src/routes/` — one component per route, all guarded routes code-split.
- `src/services/` — every Firebase read and write. Components never call
  Firestore directly, and each repository takes its dependencies by injection
  so the security-relevant behaviour is unit testable.
- `firebase/firestore.rules` — the authorization boundary. Service logic is a
  convenience; only the rules are enforced.
- `server.mjs` — static serving plus the Cloudinary signing endpoints. Holds
  the only secret in the system.

## Security boundaries

| Boundary | Enforced by |
|---|---|
| Who is a responder | `roleAssignments/{uid}`, writable only by a reviewer |
| Who reads a report | Firestore rules: owner or trusted responder |
| What is public | The `publicFeed` collection and the `toPublicAdvisory` projection |
| Incident transitions | A transition table duplicated in rules and service logic |
| Assignment races | A Firestore transaction; first claim wins |
| Audit integrity | Append-only events, actor must equal the writer, `createdAt == request.time` |
| Identity evidence | Cloudinary authenticated delivery behind a reviewer-gated endpoint |

## Known limitations

1. **Identity evidence rests on our endpoint, not the database.** Cloudinary
   was chosen over Firebase Storage. A bug in the signing handler exposes
   government IDs, where Storage Rules would have refused the read outright.
   This is the weakest boundary in the system.
2. **Signed uploads need a running process.** Firebase Hosting is static, so
   image upload fails closed until `server.mjs` is hosted somewhere.
3. **Nothing escalates on its own.** Overdue incidents are flagged visually.
   If nobody opens the queue, nothing happens.
4. **Hotline numbers are unverified.** They are carried over from the legacy
   page and displayed as unverified until a reviewer confirms them.
5. **The offline queue holds coordinates and a phone number** in
   `localStorage`, cleared on sign-out but readable meanwhile.
6. **No browser tests.** The manual checklist in the implementation plan has
   never been run. Keyboard operation, focus return, offline reload, and
   "no protected data in public markup" are unverified in a real browser.
7. **No CI, monitoring, or rate limiting.** Phase 13 was not executed.
8. **The first reviewer must be seeded by hand**, and no reviewer exists yet,
   so the responder application flow has never run end to end.

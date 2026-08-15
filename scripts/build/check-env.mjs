/*
 * Refuses to build a bundle that cannot talk to Firebase.
 *
 * Vite inlines VITE_* values at build time. If they are absent the build still
 * succeeds and produces an app where every sign-in fails, which is invisible
 * until somebody tries to use it — and then reads as a network problem. A
 * build with no configuration should not reach a deploy.
 *
 * Skipped when CI=true: continuous integration has no project credentials and
 * only needs to prove the code compiles.
 */
import { existsSync, readFileSync } from "node:fs";

const REQUIRED = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];

if (process.env.CI === "true") {
  console.log("CI build: skipping the Firebase configuration check.");
  process.exit(0);
}

const fromFile = new Map();

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) {
    continue;
  }

  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);

    if (match && match[2] !== "") {
      fromFile.set(match[1], match[2]);
    }
  }
}

const missing = REQUIRED.filter(
  (key) => !process.env[key] && !fromFile.has(key),
);

if (missing.length > 0) {
  console.error(
    [
      "",
      "This build has no Firebase configuration, so sign-in would fail for",
      "everyone who visits the deployed site.",
      "",
      "Missing: " + missing.join(", "),
      "",
      "Copy .env.example to .env and fill in the values from the Firebase",
      "console under Project settings > General > Your apps. They are safe to",
      "keep locally but must not be committed; .env is already ignored.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

console.log("Firebase configuration present.");

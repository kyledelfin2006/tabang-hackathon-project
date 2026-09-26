import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

/*
 * A deliberately small secret scanner.
 *
 * It looks for the specific shapes this project could plausibly leak: a
 * Cloudinary API secret, a Firebase service-account private key, and a
 * committed .env. It is not a general-purpose scanner and does not pretend to
 * be one; it exists so an obvious mistake fails a check instead of reaching a
 * public repository.
 *
 * It scans only files Git tracks or has staged, so a local untracked .env is
 * allowed and a committed one fails.
 */
const PATTERNS = [
  {
    name: "Cloudinary API secret assigned inline",
    pattern: /CLOUDINARY_API_SECRET\s*[:=]\s*["'][A-Za-z0-9_-]{10,}["']/,
  },
  {
    name: "Private key block",
    pattern: /-----BEGIN (?:RSA )?PRIVATE KEY-----/,
  },
  {
    name: "Firebase service account JSON",
    pattern: /"type"\s*:\s*"service_account"/,
  },
  {
    name: "Google API key literal",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/,
  },
];

const SCANNED_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".jsx",
  ".json",
  ".html",
  ".css",
  ".md",
  "",
]);

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

/*
 * No reviewed exceptions remain.
 *
 * The only entry was the legacy Firebase web config, retired with the pages
 * in Phase 14. The application now reads its configuration from environment
 * variables, so nothing hardcodes a project identifier.
 */
const REVIEWED_EXCEPTIONS = new Map();

const findings = [];
const skipped = [];

for (const file of trackedFiles()) {
  // .env.example holds placeholders by design; a real .env must never be here.
  if (file.endsWith(".env")) {
    findings.push({ file, name: "Committed .env file" });
    continue;
  }

  if (!SCANNED_EXTENSIONS.has(extname(file))) {
    continue;
  }

  let contents;

  try {
    contents = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const { name, pattern } of PATTERNS) {
    if (!pattern.test(contents)) {
      continue;
    }

    const normalised = file.replace(/^[.][/\\]/, "").replace(/\\/g, "/");
    const exception = REVIEWED_EXCEPTIONS.get(normalised);

    if (exception) {
      skipped.push({ file: normalised, reason: exception });
      continue;
    }

    findings.push({ file, name });
  }
}

if (findings.length > 0) {
  console.error("Potential secrets found:");

  for (const finding of findings) {
    console.error(`  ${finding.file}: ${finding.name}`);
  }

  process.exit(1);
}

for (const { file, reason } of skipped) {
  console.log(`Reviewed exception — ${file}: ${reason}`);
}

console.log("No committed secrets matched the known patterns.");

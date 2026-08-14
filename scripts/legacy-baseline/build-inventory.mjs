import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  collectAccessibilityAndPerformanceSignals,
  collectBrokenLocalReferences,
  collectDataAccessInventory,
  collectPageInventory,
  expectedMissingRefs,
  expectedServerFallbacks,
  getFlowInventory,
  getRootFileCounts,
  projectRoot,
} from "../../tests/legacy/helpers/legacy_inventory.mjs";

const outputDir = resolve(projectRoot, "docs", "legacy-baseline");

function ensureDirectory(pathname) {
  mkdirSync(pathname, { recursive: true });
}

function writeOutputFile(relativePath, content) {
  const absolutePath = resolve(outputDir, relativePath);
  ensureDirectory(dirname(absolutePath));
  writeFileSync(absolutePath, content, "utf8");
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  return `${bytes} B`;
}

function renderTable(headers, rows) {
  const headerLine = `| ${headers.join(" | ")} |`;
  const dividerLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const rowLines = rows.map((row) => `| ${row.join(" | ")} |`);
  return [headerLine, dividerLine, ...rowLines].join("\n");
}

function uniqueList(items) {
  return Array.from(new Set(items)).sort((left, right) => left.localeCompare(right));
}

const counts = getRootFileCounts();
const pages = collectPageInventory();
const flows = getFlowInventory();
const dataAccess = collectDataAccessInventory();
const a11yPerf = collectAccessibilityAndPerformanceSignals();
const brokenRefs = collectBrokenLocalReferences();

const pageRows = pages.map((page) => [
  page.file,
  page.title.replace(/\|/g, "\\|"),
  page.stylesheets.join("<br>") || "—",
  page.scripts.join("<br>") || "—",
  page.pageLinks.join("<br>") || "—",
  formatBytes(page.sizeBytes),
  page.viewport.replace(/\|/g, "\\|"),
]);

const dataRows = dataAccess.map((row) => [
  row.file,
  String(row.line),
  row.service,
  row.kind,
  row.target.replace(/\|/g, "\\|"),
  row.summary.replace(/\|/g, "\\|"),
]);

const flowRows = flows.map((flow) => [
  flow.area,
  flow.start,
  flow.routes.replace(/\|/g, "\\|"),
  flow.notes.replace(/\|/g, "\\|"),
]);

const brokenRows = brokenRefs.map((entry) => [
  entry.owner,
  entry.sourceType,
  entry.reference,
  entry.resolvedPath,
  expectedMissingRefs.find((item) =>
    item.owner === entry.owner &&
    item.sourceType === entry.sourceType &&
    item.reference === entry.reference &&
    item.resolvedPath === entry.resolvedPath,
  )?.reason || "Unexpected baseline failure",
]);

const pageAssetMap = `# Legacy Page Asset Map

Generated on 2026-08-14 for Phase 0 baseline capture.

## Repository snapshot

- HTML files: ${counts.html}
- CSS files: ${counts.css}
- JavaScript files: ${counts.js}
- Local image assets: ${counts.images}

## Page to asset mapping

${renderTable(
  ["HTML page", "Title", "Stylesheets", "Scripts", "Linked local pages", "File size", "Viewport"],
  pageRows,
)}
`;

const dataAccessInventory = `# Legacy Data Access Inventory

Generated without querying production data. This inventory is static analysis only.

## Firestore, Firebase Auth, and Cloudinary touch points

${renderTable(
  ["File", "Line", "Service", "Kind", "Target", "Summary"],
  dataRows,
)}

## Collections and documents referenced

${uniqueList(
  dataAccess
    .map((row) => row.target)
    .filter((target) => target && target !== "(dynamic or indirect target)")
    .flatMap((target) => target.split(",").map((part) => part.trim()))
).map((target) => `- \`${target}\``).join("\n")}
`;

const flowMap = `# Legacy Flow Map

Generated for Phase 0 baseline documentation.

${renderTable(
  ["Flow area", "Entry page", "Route path", "Notes"],
  flowRows,
)}
`;

const accessibilityPerformanceBaseline = `# Accessibility and Performance Baseline

Generated from local files only. These are baseline indicators, not final acceptance metrics.

## Heaviest HTML pages

${renderTable(
  ["Page", "Size"],
  a11yPerf.heaviestPages.map((page) => [page.file, formatBytes(page.sizeBytes)]),
)}

## Accessibility baseline notes

- Pages that disable or restrict zoom: ${a11yPerf.disabledZoomPages.length ? a11yPerf.disabledZoomPages.map((page) => `\`${page}\``).join(", ") : "none detected"}
- Pages that load remote stylesheets: ${a11yPerf.remoteStylesheetPages.length ? a11yPerf.remoteStylesheetPages.map((page) => `\`${page}\``).join(", ") : "none detected"}
- Pages that load remote scripts: ${a11yPerf.remoteScriptPages.length ? a11yPerf.remoteScriptPages.map((page) => `\`${page}\``).join(", ") : "none detected"}
- Inline Base64 image occurrences: ${a11yPerf.inlineDataUrlCount}
- HTML image tags missing an alt attribute: ${a11yPerf.imageAltIssues.length ? a11yPerf.imageAltIssues.map((item) => `\`${item}\``).join(", ") : "none detected"}

## Phase 0 observations

- The landing page remains the heaviest HTML document because it embeds the logo as a Base64 data URL.
- Multiple pages still use \`maximum-scale=1.0\` or \`user-scalable=no\`, which blocks or limits user zoom.
- The legacy app depends on remote CDNs for fonts, icons, Leaflet, and Firebase browser modules.
- This baseline captures the pre-migration state so later phases can measure improvement rather than guess.
`;

const knownFailures = `# Known Legacy Failures

These issues are intentionally preserved in the Phase 0 baseline so they stay visible while later phases replace them.

## Expected broken local references

${brokenRows.length ? renderTable(
  ["Owner", "Source type", "Reference", "Resolved path", "Why it matters"],
  brokenRows,
) : "No broken local references detected."}

## Expected HTTP fallback defects

${expectedServerFallbacks.map((entry) => `- \`${entry.path}\` currently returns HTTP ${entry.expectedStatus} and serves the 404 body. Reason: ${entry.reason}`).join("\n")}

## Additional verified risks tracked for migration

- \`JS/MyReports.js\` subscribes to \`floodReports\` and \`helpRequests\` before narrowing the resident's view, which leaks community data into a personal reports screen.
- \`JS/AllReports.js\` gates access on authentication only and does not verify a trusted responder role.
- \`JS/Signupresponder.js\` and \`JS/VerAcc.js\` write responder records directly from the browser.
- \`server.mjs\` serves missing assets with the 404 page but an HTTP 200 status.
`;

const indexContent = `# Phase 0 Legacy Baseline

This folder contains the reproducible baseline artifacts created during Phase 0 of the architecture migration.

- [Page asset map](./page-asset-map.md)
- [Data access inventory](./data-access-inventory.md)
- [Flow map](./flow-map.md)
- [Accessibility and performance baseline](./accessibility-performance-baseline.md)
- [Known legacy failures](./known-failures.md)

Regenerate these artifacts with:

\`\`\`text
npm run baseline:inventory
\`\`\`
`;

ensureDirectory(outputDir);
writeOutputFile("README.md", indexContent);
writeOutputFile("page-asset-map.md", pageAssetMap);
writeOutputFile("data-access-inventory.md", dataAccessInventory);
writeOutputFile("flow-map.md", flowMap);
writeOutputFile("accessibility-performance-baseline.md", accessibilityPerformanceBaseline);
writeOutputFile("known-failures.md", knownFailures);

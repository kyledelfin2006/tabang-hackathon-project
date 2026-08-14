import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const projectRoot = resolve(__dirname, "..", "..", "..");

export const smokePages = [
  {
    name: "landing",
    path: "/",
    mustInclude: ["<title>Tabang</title>", "Login.html", "signup.html", "Loginresponder.html"],
  },
  {
    name: "resident login",
    path: "/Login.html",
    mustInclude: ["<title>Login</title>", 'id="loginBtn"', 'src="JS/Login.js"'],
  },
  {
    name: "resident signup",
    path: "/signup.html",
    mustInclude: ["<title>Create Account</title>", 'id="signupBtn"', 'src="JS/signup.js"'],
  },
  {
    name: "resident home",
    path: "/Homepage.html",
    mustInclude: ["Reportings in the Area", "Disaster Dashboard", 'src="JS/Homepage.js"'],
  },
  {
    name: "report form",
    path: "/ReportFlood.html",
    mustInclude: ["<title>Report Flood</title>", 'id="locationMap"', 'src="JS/ReportFlood.js"'],
  },
  {
    name: "help form",
    path: "/RequestHelp.html",
    mustInclude: ["Request Help", 'src="JS/RequestHelp.js"'],
  },
  {
    name: "resident reports",
    path: "/MyReports.html",
    mustInclude: ["<title>All Reports</title>", 'src="JS/MyReports.js"'],
  },
  {
    name: "responder dashboard",
    path: "/responderhomepage.html",
    mustInclude: ["Responder Dashboard | Tabang", "Live Incident Map", 'src="JS/responderhomepage.js"'],
  },
  {
    name: "all reports",
    path: "/AllReports.html",
    mustInclude: ["<title>All Reports | Tabang Responder</title>", 'src="JS/AllReports.js"'],
  },
];

export const expectedMissingRefs = [
  {
    owner: "index.html",
    sourceType: "html-script",
    reference: "/src/main.jsx",
    resolvedPath:
      "../../../../../../../../../src/main.jsx",
    reason:
      "The SPA entry is resolved by Vite at build and dev time rather than served as a static file, so this reference is correct despite having no file on disk.",
  },
  {
    owner: "AccountInfo.html",
    sourceType: "html-image",
    reference: "tabang-badge.png",
    resolvedPath: "tabang-badge.png",
    reason: "The verified badge image is referenced locally but not present in the repository.",
  },
  {
    owner: "AccountInfo.html",
    sourceType: "html-script",
    reference: "/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js",
    resolvedPath: "../../../../../../../../../cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js",
    reason: "The page expects a Cloudflare-injected email decode script that is not available in the local app.",
  },
  {
    owner: "AccountInformation.html",
    sourceType: "html-image",
    reference: "tabang-badge.png",
    resolvedPath: "tabang-badge.png",
    reason: "The verified badge image is referenced locally but not present in the repository.",
  },
  {
    owner: "AccountInformation.html",
    sourceType: "html-script",
    reference: "/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js",
    resolvedPath: "../../../../../../../../../cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js",
    reason: "The page expects a Cloudflare-injected email decode script that is not available in the local app.",
  },
  {
    owner: "JS/VerAcc.js",
    sourceType: "js-import",
    reference: "./firebase.js",
    resolvedPath: "JS/firebase.js",
    reason: "Responder verification imports a nonexistent module path.",
  },
];

export const expectedServerFallbacks = [
  {
    path: "/missing-script.js",
    expectedStatus: 200,
    expectedBodyIncludes: "Page Not Found",
    reason: "The legacy static server falls back to 404.html but still responds with HTTP 200.",
  },
];

const htmlRefPatterns = [
  { type: "stylesheet", regex: /<link\b[^>]*href=["']([^"'#?]+(?:\?[^"']*)?)["'][^>]*>/gi },
  { type: "script", regex: /<script\b[^>]*src=["']([^"'#?]+(?:\?[^"']*)?)["'][^>]*>/gi },
  { type: "image", regex: /<img\b[^>]*src=["']([^"'#?]+(?:\?[^"']*)?)["'][^>]*>/gi },
  { type: "page-link", regex: /(?:href|data-nav|onclick=["'][^"']*window\.location\.href=)["']?([^"'#?]+\.html(?:\?[^"']*)?)["']?/gi },
];

const jsImportRegex = /import\s+(?:[^'"]+from\s+)?["']([^"']+)["']/g;
const cloudinaryRegex = /cloudinary|api\.cloudinary\.com/i;

const firestorePatterns = [
  { service: "auth", kind: "session", regex: /\bonAuthStateChanged\s*\(/g, summary: "Subscribe to auth state changes" },
  { service: "auth", kind: "write", regex: /\bcreateUserWithEmailAndPassword\s*\(/g, summary: "Create authentication account" },
  { service: "auth", kind: "write", regex: /\bsignInWithEmailAndPassword\s*\(/g, summary: "Sign in with email and password" },
  { service: "auth", kind: "write", regex: /\bsendPasswordResetEmail\s*\(/g, summary: "Send password reset email" },
  { service: "auth", kind: "write", regex: /\bsignOut\s*\(/g, summary: "Sign out the current user" },
  { service: "firestore", kind: "read", regex: /\bgetDoc\s*\(/g, summary: "Fetch a single document" },
  { service: "firestore", kind: "read", regex: /\bgetDocs\s*\(/g, summary: "Fetch a collection query" },
  { service: "firestore", kind: "read", regex: /\bonSnapshot\s*\(/g, summary: "Subscribe to live Firestore updates" },
  { service: "firestore", kind: "write", regex: /\baddDoc\s*\(/g, summary: "Create a document with an auto ID" },
  { service: "firestore", kind: "write", regex: /\bsetDoc\s*\(/g, summary: "Create or replace a document" },
  { service: "firestore", kind: "write", regex: /\bupdateDoc\s*\(/g, summary: "Update an existing document" },
  { service: "firestore", kind: "write", regex: /\bdeleteDoc\s*\(/g, summary: "Delete a document" },
  { service: "firestore", kind: "query", regex: /\bquery\s*\(/g, summary: "Compose a Firestore query" },
  { service: "firestore", kind: "query", regex: /\bwhere\s*\(/g, summary: "Filter a Firestore query" },
  { service: "firestore", kind: "query", regex: /\borderBy\s*\(/g, summary: "Order a Firestore query" },
  { service: "firestore", kind: "write", regex: /\bserverTimestamp\s*\(/g, summary: "Generate a server timestamp in a write payload" },
];

function toPosixPath(value) {
  return value.split("\\").join("/");
}

function stripQuery(value) {
  return value.split("?")[0].split("#")[0];
}

function isLocalReference(value) {
  return value &&
    !value.startsWith("http://") &&
    !value.startsWith("https://") &&
    !value.startsWith("data:") &&
    !value.startsWith("mailto:") &&
    !value.startsWith("tel:") &&
    !value.startsWith("#");
}

function fileExists(pathname) {
  try {
    return statSync(pathname).isFile();
  } catch {
    return false;
  }
}

function getLineNumber(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function readText(relativePath) {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

function walkDirectory(root, predicate, entries = []) {
  for (const item of readdirSync(root, { withFileTypes: true })) {
    const absolutePath = join(root, item.name);
    if (item.isDirectory()) {
      walkDirectory(absolutePath, predicate, entries);
      continue;
    }

    if (predicate(absolutePath)) {
      entries.push(absolutePath);
    }
  }

  return entries;
}

export function getHtmlFiles() {
  return readdirSync(projectRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".html")
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export function getJavaScriptFiles() {
  return walkDirectory(projectRoot, (absolutePath) => [".js", ".mjs"].includes(extname(absolutePath).toLowerCase()))
    .map((absolutePath) => toPosixPath(relative(projectRoot, absolutePath)))
    .filter((relativePath) => relativePath.startsWith("JS/") || relativePath.startsWith("javascript/"))
    .sort((left, right) => left.localeCompare(right));
}

export function getRootFileCounts() {
  const allFiles = walkDirectory(projectRoot, (absolutePath) => statSync(absolutePath).isFile());
  return {
    html: allFiles.filter((absolutePath) => extname(absolutePath).toLowerCase() === ".html").length,
    css: allFiles.filter((absolutePath) => extname(absolutePath).toLowerCase() === ".css").length,
    js: allFiles.filter((absolutePath) => extname(absolutePath).toLowerCase() === ".js").length,
    images: allFiles.filter((absolutePath) => [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"].includes(extname(absolutePath).toLowerCase())).length,
  };
}

function extractMatches(content, regex) {
  const results = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    results.push({
      raw: match[1],
      index: match.index,
    });
  }

  return results;
}

export function collectPageInventory() {
  return getHtmlFiles().map((file) => {
    const content = readText(file);
    const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
    const viewportMatch = content.match(/<meta[^>]+name=["']viewport["'][^>]+content=["']([^"']+)["']/i);
    const sizeBytes = Buffer.byteLength(content, "utf8");
    const refs = {};

    for (const { type, regex } of htmlRefPatterns) {
      refs[type] = extractMatches(content, new RegExp(regex));
        // Each regex instance must be fresh because of the global flag.
    }

    return {
      file,
      title: titleMatch ? titleMatch[1].trim() : "(missing title)",
      sizeBytes,
      viewport: viewportMatch ? viewportMatch[1] : "(missing viewport)",
      stylesheets: refs.stylesheet.map((item) => stripQuery(item.raw)),
      scripts: refs.script.map((item) => stripQuery(item.raw)),
      images: refs.image.map((item) => stripQuery(item.raw)),
      pageLinks: Array.from(new Set(refs["page-link"].map((item) => stripQuery(item.raw)))).sort((left, right) => left.localeCompare(right)),
      rawHtml: content,
    };
  });
}

export function collectBrokenLocalReferences() {
  const broken = [];

  for (const page of collectPageInventory()) {
    const localRefs = [
      ...page.stylesheets.map((reference) => ({ sourceType: "html-stylesheet", reference })),
      ...page.scripts.map((reference) => ({ sourceType: "html-script", reference })),
      ...page.images.map((reference) => ({ sourceType: "html-image", reference })),
      ...page.pageLinks.map((reference) => ({ sourceType: "html-page-link", reference })),
    ];

    for (const entry of localRefs) {
      if (!isLocalReference(entry.reference)) {
        continue;
      }

      const resolvedPath = normalize(resolve(projectRoot, entry.reference));
      if (!fileExists(resolvedPath)) {
        broken.push({
          owner: page.file,
          sourceType: entry.sourceType,
          reference: entry.reference,
          resolvedPath: toPosixPath(relative(projectRoot, resolvedPath)),
        });
      }
    }
  }

  for (const file of getJavaScriptFiles()) {
    const content = readText(file);
    let match;

    while ((match = jsImportRegex.exec(content)) !== null) {
      const reference = match[1];
      if (!isLocalReference(reference)) {
        continue;
      }

      const resolvedPath = normalize(resolve(projectRoot, posix.dirname(file), stripQuery(reference)));
      if (!fileExists(resolvedPath)) {
        broken.push({
          owner: file,
          sourceType: "js-import",
          reference: stripQuery(reference),
          resolvedPath: toPosixPath(relative(projectRoot, resolvedPath)),
        });
      }
    }
  }

  return broken.sort((left, right) => {
    const ownerCompare = left.owner.localeCompare(right.owner);
    if (ownerCompare !== 0) {
      return ownerCompare;
    }
    return `${left.sourceType}:${left.reference}`.localeCompare(`${right.sourceType}:${right.reference}`);
  });
}

export function collectDataAccessInventory() {
  const rows = [];

  for (const file of getJavaScriptFiles()) {
    const content = readText(file);
    const lines = content.split(/\r?\n/);

    for (const pattern of firestorePatterns) {
      lines.forEach((line, index) => {
        const matcher = new RegExp(pattern.regex.source, pattern.regex.flags);
        if (matcher.test(line)) {
          const collectionMatches = Array.from(line.matchAll(/(?:collection|doc)\s*\(\s*db\s*,\s*["']([^"']+)["']/g))
            .map((match) => match[1]);
          rows.push({
            file,
            line: index + 1,
            service: pattern.service,
            kind: pattern.kind,
            target: collectionMatches.length ? collectionMatches.join(", ") : "(dynamic or indirect target)",
            summary: pattern.summary,
          });
        }
      });
    }

    lines.forEach((line, index) => {
      if (cloudinaryRegex.test(line)) {
        rows.push({
          file,
          line: index + 1,
          service: "cloudinary",
          kind: "upload",
          target: "unsigned image upload endpoint",
          summary: "Uploads files directly from the browser to Cloudinary.",
        });
      }
    });
  }

  return rows.sort((left, right) => {
    const fileCompare = left.file.localeCompare(right.file);
    if (fileCompare !== 0) {
      return fileCompare;
    }

    return left.line - right.line;
  });
}

export function collectAccessibilityAndPerformanceSignals() {
  const pages = collectPageInventory();
  const disabledZoomPages = [];
  const remoteStylesheetPages = [];
  const remoteScriptPages = [];
  const imageAltIssues = [];
  let inlineDataUrlCount = 0;

  for (const page of pages) {
    if (/maximum-scale\s*=\s*1|user-scalable\s*=\s*no/i.test(page.viewport)) {
      disabledZoomPages.push(page.file);
    }

    if (/https?:\/\//i.test(page.rawHtml)) {
      if (/<link\b[^>]*href=["']https?:\/\//i.test(page.rawHtml)) {
        remoteStylesheetPages.push(page.file);
      }

      if (/<script\b[^>]*src=["']https?:\/\//i.test(page.rawHtml)) {
        remoteScriptPages.push(page.file);
      }
    }

    inlineDataUrlCount += (page.rawHtml.match(/data:image\//gi) || []).length;

    const imageTagMatches = page.rawHtml.match(/<img\b[^>]*>/gi) || [];
    imageTagMatches.forEach((tag, index) => {
      if (!/\balt=["'][^"']*["']/i.test(tag)) {
        imageAltIssues.push(`${page.file}#img-${index + 1}`);
      }
    });
  }

  return {
    heaviestPages: [...pages]
      .sort((left, right) => right.sizeBytes - left.sizeBytes)
      .slice(0, 5)
      .map((page) => ({ file: page.file, sizeBytes: page.sizeBytes })),
    disabledZoomPages,
    remoteStylesheetPages,
    remoteScriptPages,
    inlineDataUrlCount,
    imageAltIssues,
  };
}

export function getFlowInventory() {
  return [
    {
      area: "Public entry",
      start: "index.html",
      routes: "index.html -> Login.html | signup.html | Loginresponder.html | Privacypolicy.html",
      notes: "Landing page routes users into resident login, resident signup, responder login, and privacy policy.",
    },
    {
      area: "Resident authentication",
      start: "Login.html / signup.html",
      routes: "Login.html -> Homepage.html; signup.html -> Homepage.html",
      notes: "Resident authentication is browser-driven with Firebase Auth and client-side redirects.",
    },
    {
      area: "Resident incident actions",
      start: "Homepage.html",
      routes: "Homepage.html -> ReportFlood.html | RequestHelp.html | Hotline.html | MyReports.html | Dashboard.html | AccountInfo.html",
      notes: "The resident home page exposes the main reporting, help, hotline, dashboard, reports, and account flows.",
    },
    {
      area: "Resident account variants",
      start: "AccountInfo.html / AccountInformation.html",
      routes: "Homepage.html -> AccountInfo.html; responderhomepage.html -> AccountInformation.html",
      notes: "Two account pages exist with overlapping responsibilities and different role assumptions.",
    },
    {
      area: "Responder authentication",
      start: "Loginresponder.html / Signupresponder.html / VerAcc.html",
      routes: "Loginresponder.html -> responderhomepage.html; Signupresponder.html -> responderhomepage.html; VerAcc.html -> AccountInfo.html",
      notes: "Responder onboarding is currently exposed publicly and includes a broken verification page and self-created responder records.",
    },
    {
      area: "Responder workspace",
      start: "responderhomepage.html",
      routes: "responderhomepage.html -> AllReports.html | responderhotline.html | AccountInformation.html",
      notes: "Responder navigation is split across dashboard, all reports, hotline view, and account view.",
    },
  ];
}

export function serializeBrokenRefs(value) {
  return value.map((item) => `${item.owner}::${item.sourceType}::${item.reference}::${item.resolvedPath}`);
}

export function readServerSource() {
  return readText("server.mjs");
}

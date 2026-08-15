import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";

/*
 * Replaces the Phase 0 legacy baseline suites, which existed to protect pages
 * that no longer exist. What matters now is that every retired URL still
 * lands somewhere useful: an old bookmark or a printed flyer must not reach a
 * dead end during a flood.
 */
/*
 * The two hotline pages deliberately do not auto-redirect. They keep the
 * numbers on screen because the directory may still be unseeded, and bouncing
 * somebody away from the only numbers they can reach would be worse than a
 * stale page. They must still link onward.
 */
const NO_AUTO_REDIRECT = new Set(["Hotline.html", "responderhotline.html"]);

const REDIRECTS = {
  "legacy-index.html": "/",
  "Homepage.html": "/app",
  "Login.html": "/login",
  "Loginresponder.html": "/login",
  "signup.html": "/signup",
  "Signupresponder.html": "/signup",
  "VerAcc.html": "/app/responder-application",
  "ReportFlood.html": "/app/reports/new",
  "RequestHelp.html": "/app/help/new",
  "MyReports.html": "/app/reports",
  "AllReports.html": "/responder/incidents",
  "Hotline.html": "/app/hotlines",
  "responderhotline.html": "/responder/hotlines",
  "Dashboard.html": "/responder",
  "responderhomepage.html": "/responder",
  "AccountInfo.html": "/app/account",
  "AccountInformation.html": "/responder/account",
  "Privacypolicy.html": "/privacy",
};

test("every retired page redirects to its replacement route", () => {
  for (const [page, target] of Object.entries(REDIRECTS)) {
    assert.ok(existsSync(page), `${page} is missing; an old link would 404`);

    const html = readFileSync(page, "utf8");

    if (!NO_AUTO_REDIRECT.has(page)) {
      assert.match(
        html,
        new RegExp(`http-equiv="refresh"[^>]*url=${target}(?:"|\\s)`),
        `${page} does not redirect to ${target}`,
      );
    }
    assert.match(
      html,
      new RegExp(`href="${target}"`),
      `${page} has no clickable link to ${target}, so a browser that ignores the refresh strands the visitor`,
    );
  }
});

test("no retired page still loads legacy scripts or stylesheets", () => {
  for (const page of Object.keys(REDIRECTS)) {
    const html = readFileSync(page, "utf8");

    assert.doesNotMatch(html, /JS\//, `${page} still references a deleted script`);
    assert.doesNotMatch(html, /css\//, `${page} still references a deleted stylesheet`);
    assert.doesNotMatch(html, /javascript\//, `${page} still references deleted Firebase config`);
  }
});

test("the retired hotline pages keep the numbers reachable", () => {
  // The directory may be unseeded, so these pages are the only place a
  // resident can still find a number.
  for (const page of ["Hotline.html", "responderhotline.html"]) {
    const html = readFileSync(page, "utf8");

    assert.match(html, /\(036\) 262-4979/, `${page} lost the PDRRMO number`);
    assert.match(
      html,
      /None of these has been verified/i,
      `${page} does not state that the numbers are unverified`,
    );
  }
});

test("pages kept on purpose are still present", () => {
  for (const page of ["index.html", "404.html", "googlebf1b788405b1680b.html"]) {
    assert.ok(existsSync(page), `${page} was removed but is still needed`);
  }
});

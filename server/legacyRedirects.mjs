export const LEGACY_REDIRECTS = Object.freeze({
  "/legacy-index.html": "/",
  "/Homepage.html": "/app",
  "/Login.html": "/login",
  "/Loginresponder.html": "/login",
  "/signup.html": "/signup",
  "/Signupresponder.html": "/signup",
  "/VerAcc.html": "/app/responder-application",
  "/ReportFlood.html": "/app/reports/new",
  "/RequestHelp.html": "/app/help/new",
  "/MyReports.html": "/app/reports",
  "/AllReports.html": "/responder/incidents",
  "/Hotline.html": "/hotlines",
  "/responderhotline.html": "/hotlines",
  "/Dashboard.html": "/responder",
  "/responderhomepage.html": "/responder",
  "/AccountInfo.html": "/app/account",
  "/AccountInformation.html": "/responder/account",
  "/Privacypolicy.html": "/privacy",
});

export function redirectLegacyUrl(req, res, pathname, search = "") {
  const destination = LEGACY_REDIRECTS[pathname];

  if (!destination || !["GET", "HEAD"].includes(req.method)) {
    return false;
  }

  res.writeHead(301, { Location: `${destination}${search}` });
  res.end();
  return true;
}

import { ADVISORY_ROUTES } from "./advisories.mjs";
import { APPLICATION_ROUTES } from "./applications.mjs";
import { HOTLINE_ROUTES } from "./hotlines.mjs";
import { INCIDENT_ROUTES } from "./incidents.mjs";
import { REPORT_ROUTES } from "./reports.mjs";
import { SESSION_ROUTES } from "./session.mjs";

export const APP_ROUTES = [
  ...SESSION_ROUTES,
  ...REPORT_ROUTES,
  ...INCIDENT_ROUTES,
  ...ADVISORY_ROUTES,
  ...HOTLINE_ROUTES,
  ...APPLICATION_ROUTES,
];

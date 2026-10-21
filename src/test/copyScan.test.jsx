import { readFileSync } from "node:fs";
import { act, cleanup, render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import AppProviders from "../app/providers/AppProviders.jsx";
import { appRoutes } from "../app/router.jsx";
import {
  createFakeAuthGateway,
  residentSession,
  responderSession,
} from "./fakeAuthGateway.js";

/*
 * REQ-028: no screen may talk about how the app is built.
 *
 * These are the strings the 2026-09-26 review (section 5.1) found on screens,
 * plus provider and table names that would only appear if a raw error leaked
 * through. Each route renders with its real page and no backend, so pages that
 * fail to load show their error states, which are scanned too.
 */
const DEVELOPER_LANGUAGE = [
  /Phase 1/i,
  /application shell|responder shell|new shell/i,
  /bootstrapping/i,
  /route error boundary/i,
  /project documentation/i,
  /is a real route/i,
  /sanitized/i,
  /resident route|responder route/i,
  /previous version/i,
  /append-only/i,
  /migration/i,
  /resident access/i,
  /noticeboard/i,
  /firebase|firestore|cloudinary/i,
  /permission denied|row-level security|violates|relation "|PGRST|JWT/i,
];

function routeCases(routes, parentPath = "") {
  return routes.flatMap((route) => {
    const path = route.index
      ? parentPath || "/"
      : route.path === "*"
        ? "/missing-route"
        : route.path.startsWith("/")
          ? route.path
          : `${parentPath}/${route.path}`.replace(/\/{2,}/g, "/");

    if (route.children?.length) {
      return routeCases(route.children, path);
    }

    if (route.handle?.redirectTo) {
      return [];
    }

    return [
      {
        path: path.replace(/:[^/]+/g, "sample"),
        session: path.startsWith("/app")
          ? residentSession()
          : path.startsWith("/responder")
            ? responderSession({ role: "reviewer" })
            : null,
      },
    ];
  });
}

describe("copy scan", () => {
  it("shows no developer language on any route", async () => {
    const findings = [];

    for (const { path, session } of routeCases(appRoutes)) {
      const router = createMemoryRouter(appRoutes, { initialEntries: [path] });

      render(
        <AppProviders authGateway={createFakeAuthGateway({ session })}>
          <RouterProvider router={router} />
        </AppProviders>,
      );

      await screen.findByRole("heading", { level: 1 });
      // Let lazy pages load and their data calls fail into error states.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const text = document.body.textContent;

      for (const pattern of DEVELOPER_LANGUAGE) {
        if (pattern.test(text)) {
          findings.push(`${path}: ${pattern}`);
        }
      }

      cleanup();
    }

    expect(findings).toEqual([]);
  }, 30_000);

  it("keeps developer language out of the page description", () => {
    const html = readFileSync("index.html", "utf8");

    for (const pattern of DEVELOPER_LANGUAGE) {
      expect(html).not.toMatch(pattern);
    }
  });
});

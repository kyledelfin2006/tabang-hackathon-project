import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import AppProviders from "../app/providers/AppProviders.jsx";
import { appRoutes } from "../app/router.jsx";
import {
  createFakeAuthGateway,
  residentSession,
  responderSession,
} from "./fakeAuthGateway.js";

function renderRoute(path, session = null, routes = appRoutes) {
  const gateway = createFakeAuthGateway({ session });
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  const rendered = render(
    <AppProviders authGateway={gateway}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  return { gateway, router, unmount: rendered.unmount };
}

function leafRoutes(routes) {
  return routes.flatMap((route) =>
    route.children?.length ? leafRoutes(route.children) : [route],
  );
}

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

    return [
      {
        path: path.replace(/:[^/]+/g, "sample"),
        title: route.handle?.title,
        session: path.startsWith("/app")
          ? residentSession()
          : path.startsWith("/responder")
            ? responderSession()
            : null,
      },
    ];
  });
}

function withEmptyPageElements(routes) {
  return routes.map((route) => ({
    ...route,
    element:
      route.path === "*" || route.children?.length ? route.element : <div />,
    ...(route.children?.length
      ? { children: withEmptyPageElements(route.children) }
      : {}),
  }));
}

describe("application shell routing", () => {
  it("renders the public landing route", async () => {
    renderRoute("/");
    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Report flooding and request help in Aklan",
    });

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(heading).toHaveFocus();
    await waitFor(() =>
      expect(document.title).toBe(
        "Report flooding and request help in Aklan | Tabang",
      ),
    );
  });

  it("renders the resident layout for a signed-in resident", async () => {
    renderRoute("/app", residentSession());
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Resident home",
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("What do you need right now?"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Primary route navigation" }),
    ).toBeInTheDocument();
  });

  it("renders the responder layout for a responder", async () => {
    renderRoute("/responder", responderSession());
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Responder dashboard",
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Operational summary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Primary route navigation" }),
    ).toBeInTheDocument();
  });

  it("renders the not-found route", async () => {
    renderRoute("/missing-route");
    // Same reason as above: match the heading, not the body copy. The old
    // assertion was on Phase 1 wording that spoke about migration scope, which
    // stopped being true once the migration finished.
    expect(
      await screen.findByRole("heading", { name: "That page does not exist" }),
    ).toBeInTheDocument();
    // The route must not fall through to a shell that implies a session.
    expect(
      screen.getByRole("link", { name: "Back to the home page" }),
    ).toBeInTheDocument();
  });
});

describe("page titles and headings", () => {
  it("defines a distinct title for every leaf route", () => {
    const titles = leafRoutes(appRoutes).map((route) => route.handle?.title);

    expect(titles.every(Boolean)).toBe(true);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("renders one focused main heading for every matched route", async () => {
    const routes = withEmptyPageElements(appRoutes);

    for (const { path, title, session } of routeCases(appRoutes)) {
      const { unmount } = renderRoute(path, session, routes);

      const heading = await screen.findByRole("heading", {
        level: 1,
        name: title === "Page not found" ? "That page does not exist" : title,
      });

      expect(screen.getByRole("main").querySelectorAll("h1")).toHaveLength(1);
      await waitFor(() => expect(heading).toHaveFocus());
      unmount();
      cleanup();
    }
  });
});

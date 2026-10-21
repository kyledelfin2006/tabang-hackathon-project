import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { API_ROUTES } from "../../server/routes/index.mjs";

// REQ-032: the published contract and the router must list the same routes,
// so a partner never reads about a route that does not exist or misses one
// that does.
const document = JSON.parse(readFileSync("docs/api/openapi.json", "utf8"));

function operationsFromDocument() {
  return Object.entries(document.paths)
    .flatMap(([path, operations]) =>
      Object.keys(operations).map((method) => `${method.toUpperCase()} ${path}`),
    )
    .sort();
}

test("every router route is documented and every documented route exists", () => {
  const fromRouter = API_ROUTES.map((route) => `${route.method} ${route.path}`).sort();

  assert.deepEqual(operationsFromDocument(), fromRouter);
});

test("every route is versioned and scoped routes declare the API key", () => {
  for (const route of API_ROUTES) {
    assert.match(route.path, /^\/api\/v1\//);

    const operation = document.paths[route.path][route.method.toLowerCase()];

    if (route.scope) {
      assert.deepEqual(operation.security, [{ apiKey: [route.scope] }], route.path);
    } else {
      assert.deepEqual(operation.security, [], route.path);
    }
  }
});

test("the error envelope lists exactly the documented codes", () => {
  assert.deepEqual(
    document.components.schemas.Error.properties.error.properties.code.enum.sort(),
    [
      "forbidden",
      "internal",
      "invalid_request",
      "method_not_allowed",
      "not_found",
      "not_implemented",
      "rate_limited",
      "unauthorized",
      "unavailable",
    ],
  );
});

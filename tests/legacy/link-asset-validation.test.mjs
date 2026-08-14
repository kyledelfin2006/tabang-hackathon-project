import test from "node:test";
import assert from "node:assert/strict";
import {
  collectBrokenLocalReferences,
  expectedMissingRefs,
  serializeBrokenRefs,
} from "./helpers/legacy_inventory.mjs";

test("legacy pages do not introduce unexpected broken local references", () => {
  const actual = serializeBrokenRefs(collectBrokenLocalReferences());
  const expected = serializeBrokenRefs(expectedMissingRefs);

  assert.deepEqual(
    actual,
    expected,
    `Unexpected baseline link/import failures detected.\nExpected: ${expected.join(", ") || "(none)"}\nActual: ${actual.join(", ") || "(none)"}`,
  );
});

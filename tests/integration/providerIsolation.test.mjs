import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const SOURCE = /\.(?:js|jsx|mjs)$/;

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return SOURCE.test(entry.name) ? [relative(".", path).split("\\").join("/")] : [];
  });
}

test("pg is imported only in server/db.mjs", () => {
  const offenders = [...sourceFiles("src"), ...sourceFiles("server")].filter(
    (file) =>
      file !== "server/db.mjs" &&
      /from\s+["']pg["']|import\(\s*["']pg["']|require\(\s*["']pg["']/.test(
        readFileSync(file, "utf8"),
      ),
  );
  assert.deepEqual(offenders, []);
});

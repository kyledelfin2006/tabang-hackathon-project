import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

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

describe("provider isolation", () => {
  it("imports pg only in server/db.mjs", () => {
    const offenders = [...sourceFiles("src"), ...sourceFiles("server")].filter(
      (file) =>
        file !== "server/db.mjs" &&
        /from\s+["']pg["']|import\(\s*["']pg["']|require\(\s*["']pg["']/.test(
          readFileSync(file, "utf8"),
        ),
    );

    expect(offenders).toEqual([]);
  });

  it("leaves no @supabase/* import behind", () => {
    const offenders = [...sourceFiles("src"), ...sourceFiles("server")].filter(
      (file) =>
        /from\s+["']@supabase\/|import\(\s*["']@supabase\//.test(
          readFileSync(file, "utf8"),
        ),
    );

    expect(offenders).toEqual([]);
  });

  it("leaves no Firebase or Cloudinary import behind", () => {
    const offenders = [...sourceFiles("src"), ...sourceFiles("server")].filter(
      (file) =>
        !file.startsWith("src/test/") &&
        /from\s+["'](?:firebase|@firebase)[/"']|cloudinary/i.test(readFileSync(file, "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});

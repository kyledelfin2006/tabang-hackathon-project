import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// REQ-040: the provider SDK may be imported in exactly these two files, so
// changing provider again means rewriting the adapters and nothing else.
const ALLOWED = new Set(["src/config/supabase.js", "server/supabaseAdmin.mjs"]);
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
  it("imports @supabase/supabase-js only in the two adapter files", () => {
    const offenders = [...sourceFiles("src"), ...sourceFiles("server")].filter(
      (file) =>
        !ALLOWED.has(file) &&
        /from\s+["']@supabase\/supabase-js["']|import\(\s*["']@supabase\/supabase-js["']/.test(
          readFileSync(file, "utf8"),
        ),
    );

    expect(offenders).toEqual([]);
  });

  it("leaves no Firebase or Cloudinary import behind", () => {
    const offenders = [...sourceFiles("src"), ...sourceFiles("server")].filter((file) =>
      /from\s+["'](?:firebase|@firebase)[/"']|cloudinary/i.test(readFileSync(file, "utf8")),
    );

    expect(offenders.filter((file) => file !== "src/test/providerIsolation.test.js")).toEqual([]);
  });
});

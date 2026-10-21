import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deleteEvidenceFolder,
  isSafeSegment,
  resolveFilePath,
  validateImageBytes,
  writeIdentityEvidence,
  writeReportPhoto,
} from "../../server/files.mjs";
import { PNG_BYTES } from "../integration/helpers/files.mjs";

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const WEBP_BYTES = Buffer.from(
  "RIFF\x20\x00\x00\x00WEBPVP8 \x14\x00\x00\x00\xb0\x01\x00\x9d\x01\x2a\x01\x00\x01\x00\x02\x00\x34\x25\xa4\x00\x03\x70\x00\xfe",
  "binary",
);

test("validateImageBytes accepts valid images and rejects wrong bytes", () => {
  assert.equal(validateImageBytes(PNG_BYTES, "image/png"), true);
  assert.equal(validateImageBytes(JPEG_BYTES, "image/jpeg"), true);
  assert.equal(validateImageBytes(WEBP_BYTES, "image/webp"), true);

  // Mismatched
  assert.equal(validateImageBytes(PNG_BYTES, "image/jpeg"), false);
  assert.equal(validateImageBytes(JPEG_BYTES, "image/png"), false);
  assert.equal(validateImageBytes(Buffer.from("not an image"), "image/png"), false);
  assert.equal(validateImageBytes(Buffer.from("%PDF-1.7"), "image/png"), false);
  assert.equal(validateImageBytes(Buffer.alloc(0), "image/png"), false);
  assert.equal(validateImageBytes(null, "image/png"), false);
});

test("isSafeSegment rejects traversal, dots, and path separators", () => {
  assert.equal(isSafeSegment("valid-id_123"), true);
  assert.equal(isSafeSegment("photo.png"), true);

  assert.equal(isSafeSegment(".."), false);
  assert.equal(isSafeSegment("."), false);
  assert.equal(isSafeSegment(".hidden"), false);
  assert.equal(isSafeSegment("a/b"), false);
  assert.equal(isSafeSegment("a\\b"), false);
  assert.equal(isSafeSegment("a\0b"), false);
  assert.equal(isSafeSegment("a%2eb"), false);
  assert.equal(isSafeSegment(""), false);
});

test("writeReportPhoto writes file and enforces size and type checks", (t) => {
  const uploadDir = mkdtempSync(join(tmpdir(), "tabang-files-test-"));
  t.after(() => rmSync(uploadDir, { recursive: true, force: true }));

  const env = { UPLOAD_DIR: uploadDir };

  // Valid write
  const written = writeReportPhoto({
    reporterId: "rep-1",
    reportId: "rpt-1",
    buffer: PNG_BYTES,
    contentType: "image/png",
    env,
  });
  assert.match(written.path, /^rep-1\/rpt-1\/[a-f0-9-]+\.png$/);

  // Resolve file path works
  const filename = written.path.split("/")[2];
  const resolved = resolveFilePath({
    kind: "report-photos",
    parts: ["rep-1", "rpt-1", filename],
    env,
  });
  assert.equal(resolved, written.fullPath);

  // Oversized > 5 MB is rejected
  assert.throws(
    () =>
      writeReportPhoto({
        reporterId: "rep-1",
        reportId: "rpt-1",
        buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
        contentType: "image/png",
        env,
      }),
    (err) => err.status === 413,
  );

  // Wrong bytes rejected
  assert.throws(
    () =>
      writeReportPhoto({
        reporterId: "rep-1",
        reportId: "rpt-1",
        buffer: Buffer.from("plain text"),
        contentType: "image/png",
        env,
      }),
    (err) => err.status === 400,
  );

  // Traversal rejected
  assert.throws(
    () =>
      writeReportPhoto({
        reporterId: "..",
        reportId: "rpt-1",
        buffer: PNG_BYTES,
        contentType: "image/png",
        env,
      }),
    (err) => err.status === 400,
  );
});

test("deleteEvidenceFolder removes applicant evidence directory", (t) => {
  const uploadDir = mkdtempSync(join(tmpdir(), "tabang-evidence-test-"));
  t.after(() => rmSync(uploadDir, { recursive: true, force: true }));

  const env = { UPLOAD_DIR: uploadDir };

  const written = writeIdentityEvidence({
    applicantId: "app-1",
    buffer: PNG_BYTES,
    contentType: "image/png",
    env,
  });
  assert.match(written.path, /^app-1\/[a-f0-9-]+\.png$/);

  const filename = written.path.split("/")[1];
  assert.ok(resolveFilePath({ kind: "identity-evidence", parts: ["app-1", filename], env }));

  const deleted = deleteEvidenceFolder("app-1", { env });
  assert.equal(deleted, true);

  assert.equal(
    resolveFilePath({ kind: "identity-evidence", parts: ["app-1", filename], env }),
    null,
  );
});

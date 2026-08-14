import { describe, expect, it, vi } from "vitest";
import {
  UPLOAD_LIMITS,
  describeCountRejection,
  describeDimensionRejection,
  describeFileRejection,
  sniffImageType,
} from "../services/uploads/imageValidation.js";
import {
  ALLOWED_UPLOAD_FORMATS,
  MAX_UPLOAD_BYTES,
  buildSignedUploadParams,
  signUploadParams,
  verifyFirebaseIdToken,
} from "../../scripts/uploads/cloudinarySignature.mjs";

function bytesOf(values) {
  const buffer = new Uint8Array(16);

  values.forEach((value, index) => {
    buffer[index] = value;
  });

  return buffer.buffer;
}

const JPEG = bytesOf([0xff, 0xd8, 0xff, 0xe0]);
const PNG = bytesOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = bytesOf([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const HTML = bytesOf([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

describe("image type sniffing", () => {
  it("recognizes the allowed formats by their bytes", () => {
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(WEBP)).toBe("image/webp");
  });

  it("returns null for content that is not an image", () => {
    expect(sniffImageType(HTML)).toBeNull();
  });
});

describe("upload validation", () => {
  it("rejects a disallowed declared type", () => {
    expect(
      describeFileRejection({
        name: "map.svg",
        size: 1024,
        type: "image/svg+xml",
        sniffedType: null,
      }),
    ).toMatch(/not a JPEG, PNG, or WebP/);
  });

  it("rejects a file whose bytes disagree with its declared type", () => {
    expect(
      describeFileRejection({
        name: "photo.jpg",
        size: 2048,
        type: "image/jpeg",
        sniffedType: "image/png",
      }),
    ).toMatch(/does not match its file type/);
  });

  it("rejects a file over the size cap", () => {
    expect(
      describeFileRejection({
        name: "huge.jpg",
        size: UPLOAD_LIMITS.maxBytes + 1,
        type: "image/jpeg",
        sniffedType: "image/jpeg",
      }),
    ).toMatch(/larger than 5 MB/);
  });

  it("accepts a valid file", () => {
    expect(
      describeFileRejection({
        name: "flood.jpg",
        size: 400_000,
        type: "image/jpeg",
        sniffedType: "image/jpeg",
      }),
    ).toBeNull();
  });

  it("enforces dimension bounds", () => {
    expect(
      describeDimensionRejection({ name: "tiny.jpg", width: 10, height: 10 }),
    ).toMatch(/too small/);
    expect(
      describeDimensionRejection({ name: "vast.jpg", width: 9000, height: 12 }),
    ).toMatch(/larger than 4096/);
    expect(
      describeDimensionRejection({ name: "ok.jpg", width: 1280, height: 720 }),
    ).toBeNull();
  });

  it("caps the number of attachments", () => {
    expect(describeCountRejection(2, 1)).toBeNull();
    expect(describeCountRejection(2, 2)).toMatch(/at most 3 images/);
  });
});

describe("cloudinary upload signing", () => {
  it("scopes the upload folder to the verified uid", () => {
    const params = buildSignedUploadParams({
      uid: "resident-1",
      timestampSeconds: 1_755_000_000,
    });

    expect(params.folder).toBe("tabang/reports/resident-1");
    expect(params.max_bytes).toBe(MAX_UPLOAD_BYTES);
    expect(params.allowed_formats).toBe(ALLOWED_UPLOAD_FORMATS.join(","));
    expect(params.overwrite).toBe("false");
  });

  it("refuses to sign without a verified uid", () => {
    expect(() => buildSignedUploadParams({ timestampSeconds: 1 })).toThrow(
      /verified uid/,
    );
  });

  it("signs the sorted parameter string and depends on the secret", () => {
    const params = buildSignedUploadParams({
      uid: "resident-1",
      timestampSeconds: 1_755_000_000,
    });
    const signature = signUploadParams(params, "secret-one");

    expect(signature).toMatch(/^[a-f0-9]{40}$/);
    expect(signUploadParams(params, "secret-two")).not.toBe(signature);
    // Key order must not change the signature.
    expect(
      signUploadParams(
        Object.fromEntries(Object.entries(params).reverse()),
        "secret-one",
      ),
    ).toBe(signature);
  });

  it("refuses to sign when the secret is missing", () => {
    expect(() => signUploadParams({ folder: "x" }, "")).toThrow(
      /CLOUDINARY_API_SECRET/,
    );
  });

  it("returns null for an unverifiable token instead of a uid", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false });

    await expect(
      verifyFirebaseIdToken({
        idToken: "forged",
        apiKey: "key",
        fetchImpl,
      }),
    ).resolves.toBeNull();
  });

  it("returns the uid for a valid token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ users: [{ localId: "resident-1" }] }),
    });

    await expect(
      verifyFirebaseIdToken({ idToken: "good", apiKey: "key", fetchImpl }),
    ).resolves.toEqual({ uid: "resident-1" });
  });

  it("does not call Google without an api key", async () => {
    await expect(
      verifyFirebaseIdToken({ idToken: "good", apiKey: "" }),
    ).rejects.toThrow(/FIREBASE_WEB_API_KEY/);
  });
});

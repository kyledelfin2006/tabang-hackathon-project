import { describe, expect, it, vi } from "vitest";
import {
  UPLOAD_LIMITS,
  describeCountRejection,
  describeDimensionRejection,
  describeFileRejection,
  sniffImageType,
} from "../services/uploads/imageValidation.js";
import { createStorageUploader } from "../services/uploads/storageUploader.js";

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
      describeDimensionRejection({ name: "vast.jpg", width: 9000, height: 9000 }),
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

describe("report photo upload", () => {
  function uploaderWith(error = null) {
    const uploads = [];
    const client = {
      storage: {
        from: (bucket) => ({
          upload: async (path, file, options) => (uploads.push({ bucket, path, options }), { error }),
        }),
      },
    };

    return { uploads, uploader: createStorageUploader({ client }) };
  }

  it("stores the photo privately under the reporter's report folder", async () => {
    const { uploads, uploader } = uploaderWith();
    const onProgress = vi.fn();
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });

    const result = await uploader.upload(file, {
      reporterId: "resident-1",
      reportId: "report-1",
      onProgress,
    });

    expect(uploads[0].bucket).toBe("report-photos");
    expect(uploads[0].path).toMatch(/^resident-1\/report-1\/[0-9a-f-]+\.jpg$/);
    expect(uploads[0].options).toEqual({ contentType: "image/jpeg" });
    expect(result).toEqual({ path: uploads[0].path });
    expect(onProgress).toHaveBeenCalledWith(100);
  });

  it("does not upload once cancelled", async () => {
    const { uploads, uploader } = uploaderWith();
    const controller = new AbortController();

    controller.abort();

    await expect(
      uploader.upload(new File(["x"], "a.jpg", { type: "image/jpeg" }), {
        reporterId: "r",
        reportId: "p",
        signal: controller.signal,
      }),
    ).rejects.toThrow(/cancelled/);
    expect(uploads).toEqual([]);
  });

  it("surfaces a refused upload without the provider's message", async () => {
    const { uploader } = uploaderWith({ statusCode: "413", message: "Payload too large" });

    await expect(
      uploader.upload(new File(["x"], "a.jpg", { type: "image/jpeg" }), {
        reporterId: "r",
        reportId: "p",
      }),
    ).rejects.not.toThrow(/Payload too large/);
  });
});

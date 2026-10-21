import { existsSync, mkdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { ApiError } from "./http.mjs";

export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_IMAGE_TYPES = Object.freeze({
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
});

export const EXT_TO_MIME = Object.freeze({
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
});

export function getUploadDir(env = process.env) {
  const dir = env.UPLOAD_DIR || resolve("uploads");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return realpathSync(dir);
}

export function validateImageBytes(buffer, contentType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return false;
  }

  const normalized = (contentType || "").toLowerCase().split(";")[0].trim();

  if (normalized === "image/jpeg" || normalized === "image/jpg") {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  if (normalized === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }

  if (normalized === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer[0] === 0x52 && // 'R'
      buffer[1] === 0x49 && // 'I'
      buffer[2] === 0x46 && // 'F'
      buffer[3] === 0x46 && // 'F'
      buffer[8] === 0x57 && // 'W'
      buffer[9] === 0x45 && // 'E'
      buffer[10] === 0x42 && // 'B'
      buffer[11] === 0x50 // 'P'
    );
  }

  return false;
}

export function isSafeSegment(segment) {
  if (typeof segment !== "string" || !segment) {
    return false;
  }
  if (segment === "." || segment === ".." || segment.startsWith(".")) {
    return false;
  }
  if (segment.includes("/") || segment.includes("\\") || segment.includes("\0") || segment.includes("%")) {
    return false;
  }
  return true;
}

function within(root, target) {
  return target === root || target.startsWith(root + sep);
}

export function resolveFilePath({ kind, parts = [], env = process.env }) {
  if (!["report-photos", "identity-evidence"].includes(kind)) {
    return null;
  }

  if (parts.length === 0 || !parts.every(isSafeSegment)) {
    return null;
  }

  try {
    const uploadDir = getUploadDir(env);
    const kindDir = join(uploadDir, kind);
    if (!existsSync(kindDir)) {
      return null;
    }
    const realKindDir = realpathSync(kindDir);
    const candidate = resolve(realKindDir, ...parts);

    if (!within(realKindDir, candidate) || !existsSync(candidate)) {
      return null;
    }

    const realCandidate = realpathSync(candidate);
    if (!within(realKindDir, realCandidate)) {
      return null;
    }

    const stat = statSync(realCandidate);
    if (!stat.isFile()) {
      return null;
    }

    return realCandidate;
  } catch {
    return null;
  }
}

export function writeReportPhoto({
  reporterId,
  reportId,
  buffer,
  contentType,
  env = process.env,
}) {
  if (!isSafeSegment(reporterId) || !isSafeSegment(reportId)) {
    throw new ApiError(400, "invalid_request", "Invalid path segments.");
  }

  if (!Buffer.isBuffer(buffer)) {
    throw new ApiError(400, "invalid_request", "File buffer required.");
  }

  if (buffer.length > MAX_FILE_BYTES) {
    throw new ApiError(413, "invalid_request", "File exceeds 5 MB limit.");
  }

  const normalized = (contentType || "").toLowerCase().split(";")[0].trim();
  const ext = ALLOWED_IMAGE_TYPES[normalized];
  if (!ext) {
    throw new ApiError(400, "invalid_request", "Unsupported image type.");
  }

  if (!validateImageBytes(buffer, normalized)) {
    throw new ApiError(400, "invalid_request", "Image bytes do not match content type.");
  }

  const filename = `${randomUUID()}.${ext}`;
  const uploadDir = getUploadDir(env);
  const kindDir = join(uploadDir, "report-photos");
  mkdirSync(kindDir, { recursive: true });
  const realKindDir = realpathSync(kindDir);

  const targetDir = resolve(realKindDir, reporterId, reportId);
  if (!within(realKindDir, targetDir)) {
    throw new ApiError(404, "not_found", "Invalid upload directory.");
  }

  mkdirSync(targetDir, { recursive: true });
  const fullPath = join(targetDir, filename);
  writeFileSync(fullPath, buffer);

  return {
    path: `${reporterId}/${reportId}/${filename}`,
    fullPath,
  };
}

export function writeIdentityEvidence({
  applicantId,
  buffer,
  contentType,
  env = process.env,
}) {
  if (!isSafeSegment(applicantId)) {
    throw new ApiError(400, "invalid_request", "Invalid applicant id.");
  }

  if (!Buffer.isBuffer(buffer)) {
    throw new ApiError(400, "invalid_request", "File buffer required.");
  }

  if (buffer.length > MAX_FILE_BYTES) {
    throw new ApiError(413, "invalid_request", "File exceeds 5 MB limit.");
  }

  const normalized = (contentType || "").toLowerCase().split(";")[0].trim();
  const ext = ALLOWED_IMAGE_TYPES[normalized];
  if (!ext) {
    throw new ApiError(400, "invalid_request", "Unsupported image type.");
  }

  if (!validateImageBytes(buffer, normalized)) {
    throw new ApiError(400, "invalid_request", "Image bytes do not match content type.");
  }

  const filename = `${randomUUID()}.${ext}`;
  const uploadDir = getUploadDir(env);
  const kindDir = join(uploadDir, "identity-evidence");
  mkdirSync(kindDir, { recursive: true });
  const realKindDir = realpathSync(kindDir);

  const targetDir = resolve(realKindDir, applicantId);
  if (!within(realKindDir, targetDir)) {
    throw new ApiError(404, "not_found", "Invalid upload directory.");
  }

  mkdirSync(targetDir, { recursive: true });
  const fullPath = join(targetDir, filename);
  writeFileSync(fullPath, buffer);

  return {
    path: `${applicantId}/${filename}`,
    fullPath,
  };
}

export function deleteEvidenceFolder(applicantId, { env = process.env } = {}) {
  if (!isSafeSegment(applicantId)) {
    return false;
  }

  try {
    const uploadDir = getUploadDir(env);
    const kindDir = join(uploadDir, "identity-evidence");
    if (!existsSync(kindDir)) {
      return true;
    }
    const realKindDir = realpathSync(kindDir);
    const targetDir = resolve(realKindDir, applicantId);

    if (!within(realKindDir, targetDir)) {
      return false;
    }

    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true });
    }
    return true;
  } catch {
    return false;
  }
}

export function deleteFiles(paths = [], { env = process.env } = {}) {
  const uploadDir = getUploadDir(env);
  let allDeleted = true;

  for (const relativePath of paths) {
    try {
      const parts = relativePath.split(/[/\\]/);
      if (!parts.every(isSafeSegment)) {
        allDeleted = false;
        continue;
      }
      const fullPath = resolve(uploadDir, ...parts);
      if (!within(uploadDir, fullPath)) {
        allDeleted = false;
        continue;
      }
      if (existsSync(fullPath)) {
        rmSync(fullPath, { force: true });
      }
    } catch {
      allDeleted = false;
    }
  }

  return allDeleted;
}

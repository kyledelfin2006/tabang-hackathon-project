export const UPLOAD_LIMITS = Object.freeze({
  maxFiles: 3,
  maxBytes: 5 * 1024 * 1024,
  maxDimension: 4096,
  minDimension: 64,
  allowedTypes: Object.freeze(["image/jpeg", "image/png", "image/webp"]),
});

/**
 * Magic-byte signatures. A declared MIME type is attacker-controlled, so the
 * real bytes are checked before anything is uploaded.
 */
const SIGNATURES = Object.freeze([
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
]);

function matchesSignature(view, bytes) {
  return bytes.every((byte, index) => view[index] === byte);
}

/**
 * WebP is RIFF....WEBP, so it needs both the container and the format tag.
 */
function isWebp(view) {
  const riff = [0x52, 0x49, 0x46, 0x46];
  const webp = [0x57, 0x45, 0x42, 0x50];

  return (
    matchesSignature(view, riff) &&
    webp.every((byte, index) => view[8 + index] === byte)
  );
}

export function sniffImageType(buffer) {
  const view = new Uint8Array(buffer);

  if (view.byteLength < 12) {
    return null;
  }

  for (const signature of SIGNATURES) {
    if (matchesSignature(view, signature.bytes)) {
      return signature.type;
    }
  }

  return isWebp(view) ? "image/webp" : null;
}

export function describeFileRejection({ name, size, type, sniffedType }) {
  if (!UPLOAD_LIMITS.allowedTypes.includes(type)) {
    return `${name} is not a JPEG, PNG, or WebP image.`;
  }

  if (size > UPLOAD_LIMITS.maxBytes) {
    return `${name} is larger than ${Math.round(UPLOAD_LIMITS.maxBytes / (1024 * 1024))} MB.`;
  }

  if (size === 0) {
    return `${name} is empty.`;
  }

  if (sniffedType === null) {
    return `${name} is not a readable image.`;
  }

  if (sniffedType !== type) {
    // A .jpg that is really something else, or a renamed executable.
    return `${name} does not match its file type and was rejected.`;
  }

  return null;
}

export function describeDimensionRejection({ name, width, height }) {
  if (width < UPLOAD_LIMITS.minDimension || height < UPLOAD_LIMITS.minDimension) {
    return `${name} is too small to be useful to responders.`;
  }

  if (width > UPLOAD_LIMITS.maxDimension || height > UPLOAD_LIMITS.maxDimension) {
    return `${name} is larger than ${UPLOAD_LIMITS.maxDimension} pixels on a side.`;
  }

  return null;
}

export function describeCountRejection(currentCount, incomingCount) {
  const total = currentCount + incomingCount;

  return total > UPLOAD_LIMITS.maxFiles
    ? `You can attach at most ${UPLOAD_LIMITS.maxFiles} images.`
    : null;
}

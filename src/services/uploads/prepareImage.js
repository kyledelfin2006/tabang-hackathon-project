import {
  UPLOAD_LIMITS,
  describeDimensionRejection,
  describeFileRejection,
  sniffImageType,
} from "./imageValidation.js";

const OUTPUT_TYPE = "image/jpeg";
const OUTPUT_QUALITY = 0.82;

function loadBitmap(blob) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(blob);
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The image could not be decoded."));
    };
    image.src = url;
  });
}

function toBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("The image could not be re-encoded.")),
      OUTPUT_TYPE,
      OUTPUT_QUALITY,
    );
  });
}

/**
 * Validates a user-selected image and returns a re-encoded copy.
 *
 * Redrawing through a canvas discards every metadata block, which is the point:
 * phone photos carry EXIF GPS coordinates, and a flood photo's embedded
 * location would defeat keeping precise locations in protected fields.
 *
 * Returns { ok: true, file, width, height } or { ok: false, reason }.
 */
export async function prepareImageForUpload(file) {
  const buffer = await file.slice(0, 16).arrayBuffer();
  const sniffedType = sniffImageType(buffer);
  const fileRejection = describeFileRejection({
    name: file.name,
    size: file.size,
    type: file.type,
    sniffedType,
  });

  if (fileRejection) {
    return { ok: false, reason: fileRejection };
  }

  let bitmap;

  try {
    bitmap = await loadBitmap(file);
  } catch {
    return { ok: false, reason: `${file.name} could not be opened as an image.` };
  }

  const width = bitmap.width;
  const height = bitmap.height;
  const dimensionRejection = describeDimensionRejection({
    name: file.name,
    width,
    height,
  });

  if (dimensionRejection) {
    bitmap.close?.();

    return { ok: false, reason: dimensionRejection };
  }

  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const stripped = await toBlob(canvas);

  if (stripped.size > UPLOAD_LIMITS.maxBytes) {
    return {
      ok: false,
      reason: `${file.name} is still too large after processing.`,
    };
  }

  return {
    ok: true,
    width,
    height,
    file: new File([stripped], `${crypto.randomUUID()}.jpg`, {
      type: OUTPUT_TYPE,
    }),
  };
}

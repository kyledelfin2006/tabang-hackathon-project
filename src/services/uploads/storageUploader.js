import { getSupabaseClient } from "../../config/supabase.js";
import { toDataError } from "../data/unwrap.js";

const REPORT_PHOTOS_BUCKET = "report-photos";

const EXTENSIONS = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
});

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new Error("The upload was cancelled.");
  }
}

/**
 * Stores one prepared image under {reporterId}/{reportId}/ in the private
 * report-photos bucket and returns its path, never a public link.
 *
 * Storage policies only accept a folder that starts with the signed-in user's
 * id, and the bucket refuses anything that is not a small image, so a
 * tampered client cannot write elsewhere. The client cannot report byte
 * progress, so `onProgress` is called with 100 once the file is stored.
 */
export function createStorageUploader({ client } = {}) {
  const supabase = () => client ?? getSupabaseClient();

  return {
    async upload(file, { reporterId, reportId, onProgress, signal } = {}) {
      throwIfAborted(signal);

      const extension = EXTENSIONS[file.type] ?? "jpg";
      const path = `${reporterId}/${reportId}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase()
        .storage.from(REPORT_PHOTOS_BUCKET)
        .upload(path, file, { contentType: file.type || "image/jpeg" });

      if (error) {
        throw toDataError(error);
      }

      throwIfAborted(signal);
      onProgress?.(100);

      return { path };
    },
  };
}

import { getApiClient } from "../http/apiClient.js";
import { toDataError } from "../data/unwrap.js";

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new Error("The upload was cancelled.");
  }
}

/**
 * Stores one prepared image under {reporterId}/{reportId}/ via the Tabang files API
 * and returns its path, never a public link.
 *
 * The client cannot report continuous byte progress over fetch, so `onProgress`
 * is called with 100 once the file is stored.
 */
export function createStorageUploader({ client } = {}) {
  const api = () => client ?? getApiClient();

  return {
    /* eslint-disable-next-line no-unused-vars */
    async upload(file, { reporterId, reportId, onProgress, signal } = {}) {
      throwIfAborted(signal);

      const contentType = file.type || "image/jpeg";
      try {
        const res = await api().post(
          `/api/app/files/report-photos/${reportId}`,
          file,
          {
            headers: { "Content-Type": contentType },
            signal,
          },
        );

        throwIfAborted(signal);
        onProgress?.(100);

        return { path: res.path };
      } catch (err) {
        throwIfAborted(signal);
        throw toDataError(err);
      }
    },
  };
}

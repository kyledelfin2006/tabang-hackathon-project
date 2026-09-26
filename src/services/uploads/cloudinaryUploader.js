import { getFirebaseAuth } from "../../config/firebase.js";

const SIGNATURE_ENDPOINT = "/api/uploads/cloudinary-signature";

async function requestSignature(auth) {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Sign in before uploading images.");
  }

  const response = await fetch(SIGNATURE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: await currentUser.getIdToken() }),
  });

  if (!response.ok) {
    throw new Error("Image uploads are unavailable right now.");
  }

  return response.json();
}

/**
 * Uploads one prepared image using a server-issued signature.
 *
 * The unsigned preset the legacy pages used is deliberately not supported: it
 * let anyone with the bundle write to the account. Progress and cancellation
 * need XHR, since fetch cannot report upload progress.
 */
export function createCloudinaryUploader({ auth = getFirebaseAuth() } = {}) {
  return {
    async upload(file, { onProgress, signal } = {}) {
      const { cloudName, apiKey, params, signature } =
        await requestSignature(auth);

      const form = new FormData();

      form.append("file", file);
      form.append("api_key", apiKey);
      form.append("signature", signature);

      for (const [key, value] of Object.entries(params)) {
        form.append(key, String(value));
      }

      return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();

        request.open(
          "POST",
          `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
        );

        request.upload.onprogress = (event) => {
          if (event.lengthComputable && onProgress) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        };

        request.onload = () => {
          if (request.status < 200 || request.status >= 300) {
            reject(new Error("The image upload was rejected."));

            return;
          }

          try {
            const payload = JSON.parse(request.responseText);

            resolve({
              publicId: payload.public_id,
              secureUrl: payload.secure_url,
              width: payload.width,
              height: payload.height,
            });
          } catch {
            reject(new Error("The upload response could not be read."));
          }
        };

        request.onerror = () =>
          reject(new Error("The image upload failed. Check your connection."));
        request.onabort = () => reject(new Error("The upload was cancelled."));

        signal?.addEventListener("abort", () => request.abort(), { once: true });

        request.send(form);
      });
    },
  };
}

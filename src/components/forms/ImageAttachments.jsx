import { useId, useState } from "react";
import {
  UPLOAD_LIMITS,
  describeCountRejection,
} from "../../services/uploads/imageValidation.js";
import { prepareImageForUpload } from "../../services/uploads/prepareImage.js";

/**
 * Collects and validates photos before submission.
 *
 * Every accepted file is already stripped of metadata and re-encoded, so the
 * caller receives upload-ready files and a preview URL.
 */
export default function ImageAttachments({ attachments, onChange, disabled }) {
  const inputId = useId();
  const [rejections, setRejections] = useState([]);
  const [busy, setBusy] = useState(false);

  async function handleFiles(event) {
    const selected = Array.from(event.target.files ?? []);

    event.target.value = "";

    if (selected.length === 0) {
      return;
    }

    const countRejection = describeCountRejection(
      attachments.length,
      selected.length,
    );

    if (countRejection) {
      setRejections([countRejection]);

      return;
    }

    setBusy(true);

    const accepted = [];
    const refused = [];

    for (const file of selected) {
      const result = await prepareImageForUpload(file);

      if (result.ok) {
        accepted.push({
          id: crypto.randomUUID(),
          file: result.file,
          previewUrl: URL.createObjectURL(result.file),
          originalName: file.name,
        });
      } else {
        refused.push(result.reason);
      }
    }

    setBusy(false);
    setRejections(refused);
    onChange([...attachments, ...accepted]);
  }

  function remove(id) {
    const target = attachments.find((attachment) => attachment.id === id);

    if (target) {
      URL.revokeObjectURL(target.previewUrl);
    }

    onChange(attachments.filter((attachment) => attachment.id !== id));
  }

  return (
    <fieldset className="form-fieldset">
      <legend>Photos (optional)</legend>
      <p className="form-field__hint" id={`${inputId}-hint`}>
        Up to {UPLOAD_LIMITS.maxFiles} photos, {UPLOAD_LIMITS.maxBytes /
          (1024 * 1024)}{" "}
        MB each. Location data embedded in your photos is removed before upload.
      </p>

      <input
        accept={UPLOAD_LIMITS.allowedTypes.join(",")}
        aria-describedby={`${inputId}-hint`}
        className="form-field__input"
        disabled={disabled || busy || attachments.length >= UPLOAD_LIMITS.maxFiles}
        id={inputId}
        multiple
        onChange={handleFiles}
        type="file"
      />

      <p aria-live="polite" className="form-field__hint">
        {busy ? "Checking your photos…" : ""}
      </p>

      {rejections.length > 0 ? (
        <ul className="form-field__error" role="alert">
          {rejections.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      {attachments.length > 0 ? (
        <ul className="attachment-list">
          {attachments.map((attachment) => (
            <li className="attachment-item" key={attachment.id}>
              <img alt="" height="64" src={attachment.previewUrl} width="64" />
              <span>{attachment.originalName}</span>
              <button
                className="action-button action-button--secondary"
                disabled={disabled}
                onClick={() => remove(attachment.id)}
                type="button"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </fieldset>
  );
}

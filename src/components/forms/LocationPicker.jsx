import { useState } from "react";

/**
 * Optionally attaches the phone's location to a report.
 *
 * Geolocation is offered but never required: it fails indoors, during power
 * cuts, and on older handsets, which is exactly when a flood report matters.
 * The municipality and barangay are what responders always get; typed
 * coordinates are not offered, because nobody can read them off a phone.
 */
export default function LocationPicker({
  id,
  latitude,
  longitude,
  onChange,
  error,
}) {
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(null);
  const errorId = `${id}-error`;
  const attached = latitude !== "" && longitude !== "";

  function locate() {
    if (!navigator.geolocation) {
      setLocateError(
        "This device cannot share its location. The barangay is enough.",
      );

      return;
    }

    setLocating(true);
    setLocateError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onChange({
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        });
      },
      () => {
        setLocating(false);
        setLocateError(
          "Location access was refused or timed out. The barangay is enough to send the report.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  return (
    <fieldset className="form-fieldset">
      <legend>Exact location (optional)</legend>
      <p className="form-field__hint">
        Shared only with responders handling your report. It is never shown
        publicly.
      </p>

      <p aria-live="polite" className="form-field__hint">
        {attached ? "Your current location is attached." : (locateError ?? "")}
      </p>

      <div className="button-row">
        <button
          aria-describedby={error ? errorId : undefined}
          className="action-button action-button--secondary"
          disabled={locating}
          id={id}
          onClick={locate}
          type="button"
        >
          {locating
            ? "Locating…"
            : attached
              ? "Update my location"
              : "Use my current location"}
        </button>
        {attached ? (
          <button
            className="action-button action-button--secondary"
            onClick={() => onChange({ latitude: "", longitude: "" })}
            type="button"
          >
            Remove location
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="form-field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

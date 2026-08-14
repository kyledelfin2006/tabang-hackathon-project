import { useId, useState } from "react";

/**
 * Collects coordinates without embedding a map yet.
 *
 * Geolocation is offered but never required: it fails indoors, during power
 * cuts, and on older handsets, which is exactly when a flood report matters.
 * Manual entry is always available.
 */
export default function LocationPicker({
  latitude,
  longitude,
  onChange,
  error,
}) {
  const latitudeId = useId();
  const longitudeId = useId();
  const errorId = `${latitudeId}-error`;
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(null);

  function locate() {
    if (!navigator.geolocation) {
      setLocateError("This device cannot share its location. Enter it below.");

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
          "Location access was refused or timed out. Enter the coordinates below.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  return (
    <fieldset className="form-fieldset">
      <legend>Location</legend>
      <p className="form-field__hint">
        Your exact coordinates are shared only with responders handling your
        report. They are never shown publicly.
      </p>

      <div className="button-row">
        <button
          className="action-button action-button--secondary"
          disabled={locating}
          onClick={locate}
          type="button"
        >
          {locating ? "Locating…" : "Use my current location"}
        </button>
      </div>

      <p aria-live="polite" className="form-field__hint">
        {locateError ?? ""}
      </p>

      <div className="form-grid">
        <div className="form-field">
          <label className="form-field__label" htmlFor={latitudeId}>
            Latitude
          </label>
          <input
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? "true" : undefined}
            className="form-field__input"
            id={latitudeId}
            inputMode="decimal"
            onChange={(event) =>
              onChange({ latitude: event.target.value, longitude })
            }
            value={latitude}
          />
        </div>

        <div className="form-field">
          <label className="form-field__label" htmlFor={longitudeId}>
            Longitude
          </label>
          <input
            aria-invalid={error ? "true" : undefined}
            className="form-field__input"
            id={longitudeId}
            inputMode="decimal"
            onChange={(event) =>
              onChange({ latitude, longitude: event.target.value })
            }
            value={longitude}
          />
        </div>
      </div>

      {error ? (
        <p className="form-field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

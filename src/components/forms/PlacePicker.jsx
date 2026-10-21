import { FormField } from "./FormField.jsx";
import {
  AKLAN_MUNICIPALITIES,
  barangaysFor,
} from "../../services/places/aklanPlaces.js";

function SelectField({ id, label, hint, error, value, onChange, children }) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <p className="form-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      <select
        aria-describedby={describedBy}
        aria-invalid={error ? "true" : undefined}
        className="form-field__input"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
      {error ? (
        <p className="form-field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Municipality, then barangay, then an optional landmark.
 *
 * The barangay is a list when one is loaded for the municipality and a text
 * field otherwise, so a missing list never blocks a report.
 */
export default function PlacePicker({ ids, values, errors, onChange }) {
  const barangays = barangaysFor(values.municipality);

  return (
    <>
      <SelectField
        error={errors.municipality}
        hint="The barangay and municipality may be shown publicly."
        id={ids.municipality}
        label="Municipality"
        onChange={(municipality) => onChange({ municipality, barangay: "" })}
        value={values.municipality}
      >
        <option value="">Choose a municipality</option>
        {AKLAN_MUNICIPALITIES.map((municipality) => (
          <option key={municipality} value={municipality}>
            {municipality}
          </option>
        ))}
      </SelectField>

      {barangays.length > 0 ? (
        <SelectField
          error={errors.barangay}
          id={ids.barangay}
          label="Barangay"
          onChange={(barangay) => onChange({ barangay })}
          value={values.barangay}
        >
          <option value="">Choose a barangay</option>
          {barangays.map((barangay) => (
            <option key={barangay} value={barangay}>
              {barangay}
            </option>
          ))}
        </SelectField>
      ) : (
        <FormField
          error={errors.barangay}
          id={ids.barangay}
          label="Barangay"
          name="barangay"
          onChange={(barangay) => onChange({ barangay })}
          value={values.barangay}
        />
      )}

      <FormField
        error={errors.landmark}
        hint="A nearby school, chapel, or street. Shared only with responders."
        id={ids.landmark}
        label="Landmark (optional)"
        name="landmark"
        onChange={(landmark) => onChange({ landmark })}
        required={false}
        value={values.landmark}
      />
    </>
  );
}

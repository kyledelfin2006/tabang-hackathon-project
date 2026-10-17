/**
 * Municipalities and barangays of Aklan for the report location picker.
 *
 * The source must be the PSA Philippine Standard Geographic Code publication.
 * The PSA site refused every download attempt on 2026-10-18 (HTTP 403), so the
 * barangay lists are empty until Len supplies the PSGC file; barangay names are
 * never typed in from memory. Until then the form asks for the barangay as
 * text. The 17 municipality names were cross-checked against a public PSGC
 * mirror on 2026-10-18 and are pending confirmation against the PSA file.
 */
export const PLACES_SOURCE = Object.freeze({
  name: "PSA Philippine Standard Geographic Code (pending: PSA download refused)",
  url: "https://psa.gov.ph/classification/psgc",
  retrievedAt: null,
});

export const AKLAN_MUNICIPALITIES = Object.freeze([
  "Altavas",
  "Balete",
  "Banga",
  "Batan",
  "Buruanga",
  "Ibajay",
  "Kalibo",
  "Lezo",
  "Libacao",
  "Madalag",
  "Makato",
  "Malay",
  "Malinao",
  "Nabas",
  "New Washington",
  "Numancia",
  "Tangalan",
]);

const BARANGAYS = Object.freeze(
  Object.fromEntries(
    AKLAN_MUNICIPALITIES.map((name) => [name, Object.freeze([])]),
  ),
);

export function barangaysFor(municipality) {
  return BARANGAYS[municipality] ?? Object.freeze([]);
}

/**
 * True for a listed municipality and, when that municipality has a barangay
 * list, a barangay on it. Without a list any barangay name is accepted.
 */
export function isKnownPlace(municipality, barangay) {
  if (!AKLAN_MUNICIPALITIES.includes(municipality)) {
    return false;
  }

  const barangays = barangaysFor(municipality);

  return (
    barangay === undefined ||
    barangays.length === 0 ||
    barangays.includes(barangay)
  );
}

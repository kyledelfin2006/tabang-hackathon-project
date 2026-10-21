-- Reports name a municipality and barangay (REQ-014).
--
-- The picker now requires both, so every new report carries them. The
-- municipality must be one of Aklan's 17, matching AKLAN_MUNICIPALITIES in
-- src/services/places/aklanPlaces.js. Barangays are checked by length only
-- until the PSA barangay list is loaded.

alter table public.reports
  alter column municipality set not null,
  alter column barangay set not null,
  add constraint reports_municipality_in_aklan check (
    municipality in (
      'Altavas', 'Balete', 'Banga', 'Batan', 'Buruanga', 'Ibajay', 'Kalibo',
      'Lezo', 'Libacao', 'Madalag', 'Makato', 'Malay', 'Malinao', 'Nabas',
      'New Washington', 'Numancia', 'Tangalan'
    )
  );

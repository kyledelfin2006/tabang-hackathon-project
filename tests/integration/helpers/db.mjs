import { randomUUID } from "node:crypto";
import { query } from "../../../server/db.mjs";

export async function resetDatabase() {
  await query(
    `truncate table
      public.report_events,
      public.reports,
      public.responder_applications,
      public.sessions,
      public.password_resets,
      public.role_assignments,
      public.hotline_reviews,
      public.public_feed,
      public.signals,
      public.profiles,
      public.users
    cascade;`,
  );
}

export async function createUser(role = "resident") {
  const id = randomUUID();
  const email = `user-${id}@example.com`;
  const passwordHash = "dummy_hash";

  await query("insert into public.users (id, email, password_hash) values ($1, $2, $3)", [
    id,
    email,
    passwordHash,
  ]);
  await query(
    "insert into public.profiles (id, display_name, email, phone, barangay) values ($1, $2, $3, $4, $5)",
    [id, `Test User ${id.slice(0, 6)}`, email, "09123456789", "Poblacion"],
  );

  if (role !== "resident") {
    await query("insert into public.role_assignments (user_id, role) values ($1, $2)", [id, role]);
  }

  return { id, email, role };
}

export async function fileReport(actor, overrides = {}) {
  const id = overrides.id || randomUUID();
  const report = {
    id,
    reporter_id: actor.id,
    kind: "flood",
    municipality: "Kalibo",
    barangay: "Poblacion",
    landmark: "Near plaza",
    public_location_label: "Poblacion, Kalibo",
    latitude: 11.7,
    longitude: 122.36,
    description: "Flood water rising steadily on the road.",
    contact_phone: "09123456789",
    severity: "knee",
    need: null,
    people_affected: null,
    image_paths: [],
    public_summary: "Flooding in Poblacion",
    ...overrides,
  };

  await query(
    `insert into public.reports (
      id, reporter_id, kind, municipality, barangay, landmark,
      public_location_label, latitude, longitude, description,
      contact_phone, severity, need, people_affected, image_paths,
      public_summary
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      report.id,
      report.reporter_id,
      report.kind,
      report.municipality,
      report.barangay,
      report.landmark,
      report.public_location_label,
      report.latitude,
      report.longitude,
      report.description,
      report.contact_phone,
      report.severity,
      report.need,
      report.people_affected,
      report.image_paths,
      report.public_summary,
    ],
  );

  return id;
}

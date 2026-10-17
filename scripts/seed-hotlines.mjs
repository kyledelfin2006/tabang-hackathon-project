/*
 * Loads docs/hotline-seed.json into the hotline directory.
 *
 *   npm run seed:hotlines
 *
 * Every record is inserted unverified, whatever the file says, because nobody
 * has confirmed these numbers are current. Hotlines that already exist are
 * left alone, so running this again never undoes a reviewer's verification
 * or edits. Needs SUPABASE_URL and SUPABASE_SECRET_KEY.
 */
import { readFileSync } from "node:fs";
import { createSupabaseAdmin } from "../server/supabaseAdmin.mjs";

const admin = createSupabaseAdmin(process.env);

if (!admin) {
  console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY first.");
  process.exit(1);
}

const { hotlines } = JSON.parse(readFileSync("docs/hotline-seed.json", "utf8"));
const rows = hotlines.map((hotline) => ({
  id: hotline.id,
  organization: hotline.organization,
  coverage_area: hotline.coverageArea ?? "",
  phone_numbers: hotline.phoneNumbers ?? [],
  verified: false,
  verified_at: null,
  verified_by: "",
}));

const { data, error } = await admin
  .from("hotlines")
  .upsert(rows, { onConflict: "id", ignoreDuplicates: true })
  .select("id");

if (error) {
  console.error(`Seeding failed: ${error.code ?? "unknown"}`);
  process.exit(1);
}

console.log(
  `Added ${data.length} of ${rows.length} hotlines, all unverified; ${rows.length - data.length} already existed and were left alone.`,
);

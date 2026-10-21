/*
 * Loads docs/hotline-seed.json into the hotline directory.
 *
 *   npm run seed:hotlines
 *
 * Every record is inserted unverified, whatever the file says, because nobody
 * has confirmed these numbers are current. Hotlines that already exist are
 * left alone, so running this again never undoes a reviewer's verification
 * or edits. Needs DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import { closePool, query } from "../server/db.mjs";

if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL first.");
  process.exit(1);
}

const { hotlines } = JSON.parse(readFileSync("docs/hotline-seed.json", "utf8"));
let added = 0;

try {
  for (const hotline of hotlines) {
    const res = await query(
      `insert into public.hotlines (
        id, organization, coverage_area, phone_numbers, verified, verified_at, verified_by
      ) values ($1, $2, $3, $4, false, null, null)
      on conflict (id) do nothing
      returning id`,
      [
        hotline.id,
        hotline.organization,
        hotline.coverageArea ?? "",
        hotline.phoneNumbers ?? [],
      ],
    );
    if (res.rowCount > 0) {
      added++;
    }
  }

  console.log(
    `Added ${added} of ${hotlines.length} hotlines, all unverified; ${hotlines.length - added} already existed and were left alone.`,
  );
} finally {
  await closePool();
}

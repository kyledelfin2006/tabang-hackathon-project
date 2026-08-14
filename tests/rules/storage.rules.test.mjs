import { after, before, beforeEach, describe, it } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { getBytes, ref, uploadString } from "firebase/storage";
import {
  cleanupRulesTestEnvironment,
  getRulesTestEnvironment,
  resetRulesTestEnvironment,
} from "./helpers/testEnvironment.mjs";

const applicationFilePath =
  "responderApplications/resident-1/identity/front-id.txt";

describe("Storage rules", () => {
  let testEnvironment;

  before(async () => {
    testEnvironment = await getRulesTestEnvironment();
  });

  beforeEach(async () => {
    await resetRulesTestEnvironment();
  });

  after(async () => {
    await cleanupRulesTestEnvironment();
  });

  it("lets applicants upload and read their own identity evidence", async () => {
    const applicantStorage = testEnvironment
      .authenticatedContext("resident-1", { role: "resident" })
      .storage();

    const applicantFile = ref(applicantStorage, applicationFilePath);

    await assertSucceeds(uploadString(applicantFile, "proof-of-identity"));
    await assertSucceeds(getBytes(applicantFile));
  });

  it("lets authorized reviewers read identity uploads", async () => {
    const applicantStorage = testEnvironment
      .authenticatedContext("resident-1", { role: "resident" })
      .storage();
    const reviewerStorage = testEnvironment
      .authenticatedContext("reviewer-1", { role: "reviewer" })
      .storage();

    await assertSucceeds(
      uploadString(
        ref(applicantStorage, applicationFilePath),
        "proof-of-identity",
      ),
    );

    await assertSucceeds(getBytes(ref(reviewerStorage, applicationFilePath)));
  });

  it("blocks other residents and signed-out users from reading identity uploads", async () => {
    const applicantStorage = testEnvironment
      .authenticatedContext("resident-1", { role: "resident" })
      .storage();
    const otherResidentStorage = testEnvironment
      .authenticatedContext("resident-2", { role: "resident" })
      .storage();
    const guestStorage = testEnvironment.unauthenticatedContext().storage();

    await assertSucceeds(
      uploadString(
        ref(applicantStorage, applicationFilePath),
        "proof-of-identity",
      ),
    );

    await assertFails(getBytes(ref(otherResidentStorage, applicationFilePath)));
    await assertFails(getBytes(ref(guestStorage, applicationFilePath)));
  });
});

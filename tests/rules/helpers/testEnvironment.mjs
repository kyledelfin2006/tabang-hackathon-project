import { readFileSync } from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";

const projectId = "demo-tabang-rules";

let testEnvironmentPromise;

export function getRulesTestEnvironment() {
  if (!testEnvironmentPromise) {
    testEnvironmentPromise = initializeTestEnvironment({
      projectId,
      firestore: {
        host: "127.0.0.1",
        port: 18085,
        rules: readFileSync("firebase/firestore.rules", "utf8"),
      },
      storage: {
        host: "127.0.0.1",
        port: 19195,
        rules: readFileSync("firebase/storage.rules", "utf8"),
      },
    });
  }

  return testEnvironmentPromise;
}

export async function resetRulesTestEnvironment() {
  const testEnvironment = await getRulesTestEnvironment();
  await testEnvironment.clearFirestore();
  await testEnvironment.clearStorage();
}

export async function cleanupRulesTestEnvironment() {
  if (!testEnvironmentPromise) {
    return;
  }

  const testEnvironment = await testEnvironmentPromise;
  await testEnvironment.cleanup();
  testEnvironmentPromise = undefined;
}

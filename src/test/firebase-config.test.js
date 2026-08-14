import { describe, expect, it } from "vitest";
import {
  REQUIRED_FIREBASE_ENV_KEYS,
  resolveFirebaseEmulatorConfig,
  resolveFirebaseRuntimeConfig,
} from "../config/env.js";

const validEnv = Object.freeze({
  VITE_FIREBASE_API_KEY: "demo-key",
  VITE_FIREBASE_AUTH_DOMAIN: "demo.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "demo-project",
  VITE_FIREBASE_STORAGE_BUCKET: "demo.firebasestorage.app",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "1234567890",
  VITE_FIREBASE_APP_ID: "1:1234567890:web:abcdef",
});

describe("resolveFirebaseRuntimeConfig", () => {
  it("maps the required Vite environment variables into a Firebase config", () => {
    expect(resolveFirebaseRuntimeConfig(validEnv)).toEqual({
      apiKey: "demo-key",
      authDomain: "demo.firebaseapp.com",
      projectId: "demo-project",
      storageBucket: "demo.firebasestorage.app",
      messagingSenderId: "1234567890",
      appId: "1:1234567890:web:abcdef",
    });
  });

  it("throws a helpful error when a required key is missing", () => {
    const envWithMissingKey = {
      ...validEnv,
      VITE_FIREBASE_APP_ID: "",
    };

    expect(() => resolveFirebaseRuntimeConfig(envWithMissingKey)).toThrow(
      "VITE_FIREBASE_APP_ID",
    );
  });

  it("tracks the required keys in one place", () => {
    expect(REQUIRED_FIREBASE_ENV_KEYS).toEqual([
      "VITE_FIREBASE_API_KEY",
      "VITE_FIREBASE_AUTH_DOMAIN",
      "VITE_FIREBASE_PROJECT_ID",
      "VITE_FIREBASE_STORAGE_BUCKET",
      "VITE_FIREBASE_MESSAGING_SENDER_ID",
      "VITE_FIREBASE_APP_ID",
    ]);
  });
});

describe("resolveFirebaseEmulatorConfig", () => {
  it("returns a disabled config when emulator usage is off", () => {
    expect(resolveFirebaseEmulatorConfig(validEnv)).toEqual({ enabled: false });
  });

  it("parses the local emulator settings when enabled", () => {
    expect(
      resolveFirebaseEmulatorConfig({
        ...validEnv,
        VITE_USE_FIREBASE_EMULATORS: "true",
        VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
        VITE_FIRESTORE_EMULATOR_HOST: "127.0.0.1",
        VITE_FIRESTORE_EMULATOR_PORT: "8081",
        VITE_STORAGE_EMULATOR_HOST: "127.0.0.1",
        VITE_STORAGE_EMULATOR_PORT: "9198",
      }),
    ).toEqual({
      enabled: true,
      auth: {
        url: "http://127.0.0.1:9099",
      },
      firestore: {
        host: "127.0.0.1",
        port: 8081,
      },
      storage: {
        host: "127.0.0.1",
        port: 9198,
      },
    });
  });

  it("rejects invalid boolean or port values", () => {
    expect(() =>
      resolveFirebaseEmulatorConfig({
        ...validEnv,
        VITE_USE_FIREBASE_EMULATORS: "sometimes",
      }),
    ).toThrow('VITE_USE_FIREBASE_EMULATORS must be "true" or "false"');

    expect(() =>
      resolveFirebaseEmulatorConfig({
        ...validEnv,
        VITE_USE_FIREBASE_EMULATORS: "true",
        VITE_FIRESTORE_EMULATOR_PORT: "abc",
      }),
    ).toThrow("VITE_FIRESTORE_EMULATOR_PORT");
  });
});

const REQUIRED_FIREBASE_ENV_KEYS = Object.freeze([
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
]);

const FIREBASE_CONFIG_KEY_MAP = Object.freeze({
  VITE_FIREBASE_API_KEY: "apiKey",
  VITE_FIREBASE_AUTH_DOMAIN: "authDomain",
  VITE_FIREBASE_PROJECT_ID: "projectId",
  VITE_FIREBASE_STORAGE_BUCKET: "storageBucket",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "messagingSenderId",
  VITE_FIREBASE_APP_ID: "appId",
});

const DEFAULT_EMULATOR_PORTS = Object.freeze({
  firestore: 18085,
  storage: 19195,
});

function readEnvValue(envSource, key) {
  const value = envSource?.[key];

  return typeof value === "string" ? value.trim() : "";
}

function parseBooleanFlag(envSource, key) {
  const rawValue = readEnvValue(envSource, key);

  if (rawValue === "") {
    return false;
  }

  if (rawValue === "true") {
    return true;
  }

  if (rawValue === "false") {
    return false;
  }

  throw new Error(
    `${key} must be "true" or "false" when provided. Received "${rawValue}".`,
  );
}

function parsePort(envSource, key, fallbackPort) {
  const rawValue = readEnvValue(envSource, key);

  if (rawValue === "") {
    return fallbackPort;
  }

  const parsedPort = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error(
      `${key} must be a whole number between 1 and 65535. Received "${rawValue}".`,
    );
  }

  return parsedPort;
}

export function resolveFirebaseRuntimeConfig(envSource = import.meta.env) {
  const config = {};
  const missingKeys = [];

  for (const envKey of REQUIRED_FIREBASE_ENV_KEYS) {
    const configKey = FIREBASE_CONFIG_KEY_MAP[envKey];
    const envValue = readEnvValue(envSource, envKey);

    if (!envValue) {
      missingKeys.push(envKey);
      continue;
    }

    config[configKey] = envValue;
  }

  if (missingKeys.length > 0) {
    throw new Error(
      `Missing Firebase environment variables: ${missingKeys.join(", ")}. Copy .env.example to .env and fill in the VITE_FIREBASE_* values before enabling Firebase-backed routes.`,
    );
  }

  return Object.freeze(config);
}

export function resolveFirebaseEmulatorConfig(envSource = import.meta.env) {
  const enabled = parseBooleanFlag(envSource, "VITE_USE_FIREBASE_EMULATORS");

  if (!enabled) {
    return Object.freeze({ enabled: false });
  }

  const authUrl =
    readEnvValue(envSource, "VITE_FIREBASE_AUTH_EMULATOR_URL") ||
    "http://127.0.0.1:9099";

  return Object.freeze({
    enabled: true,
    auth: Object.freeze({
      url: authUrl,
    }),
    firestore: Object.freeze({
      host:
        readEnvValue(envSource, "VITE_FIRESTORE_EMULATOR_HOST") || "127.0.0.1",
      port: parsePort(
        envSource,
        "VITE_FIRESTORE_EMULATOR_PORT",
        DEFAULT_EMULATOR_PORTS.firestore,
      ),
    }),
    storage: Object.freeze({
      host:
        readEnvValue(envSource, "VITE_STORAGE_EMULATOR_HOST") || "127.0.0.1",
      port: parsePort(
        envSource,
        "VITE_STORAGE_EMULATOR_PORT",
        DEFAULT_EMULATOR_PORTS.storage,
      ),
    }),
  });
}

export { REQUIRED_FIREBASE_ENV_KEYS };

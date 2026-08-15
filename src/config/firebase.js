import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import {
  resolveFirebaseEmulatorConfig,
  resolveFirebaseRuntimeConfig,
} from "./env.js";

const EMULATOR_SENTINEL = "__TABANG_FIREBASE_EMULATORS_CONNECTED__";

let cachedFirebaseServices;

function connectConfiguredEmulators(services, envSource) {
  const emulatorConfig = resolveFirebaseEmulatorConfig(envSource);

  if (!emulatorConfig.enabled || globalThis[EMULATOR_SENTINEL]) {
    return emulatorConfig;
  }

  connectAuthEmulator(services.auth, emulatorConfig.auth.url, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(
    services.db,
    emulatorConfig.firestore.host,
    emulatorConfig.firestore.port,
  );

  globalThis[EMULATOR_SENTINEL] = true;

  return emulatorConfig;
}

export function initializeTabangFirebase(envSource = import.meta.env) {
  if (cachedFirebaseServices) {
    return cachedFirebaseServices;
  }

  const app =
    getApps().length > 0
      ? getApp()
      : initializeApp(resolveFirebaseRuntimeConfig(envSource));

  const services = Object.freeze({
    app,
    auth: getAuth(app),
    db: getFirestore(app),
  });

  connectConfiguredEmulators(services, envSource);
  cachedFirebaseServices = services;

  return cachedFirebaseServices;
}

export function getFirebaseServices() {
  return initializeTabangFirebase();
}

export function getFirebaseApp() {
  return getFirebaseServices().app;
}

export function getFirebaseAuth() {
  return getFirebaseServices().auth;
}

export function getFirebaseDb() {
  return getFirebaseServices().db;
}

export function resetFirebaseServicesForTests() {
  cachedFirebaseServices = undefined;
  globalThis[EMULATOR_SENTINEL] = false;
}

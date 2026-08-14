import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "../../config/firebase.js";
import { normalizeProfileRecord } from "./profile.js";
import { ROLES, normalizeRole } from "./roles.js";

const USERS_COLLECTION = "users";
const ROLE_ASSIGNMENTS_COLLECTION = "roleAssignments";

function toSessionUser(firebaseUser) {
  return Object.freeze({
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? "",
    displayName: firebaseUser.displayName ?? "",
    emailVerified: Boolean(firebaseUser.emailVerified),
  });
}

/**
 * Resolves the trusted role for a signed-in user.
 *
 * The authoritative source is roleAssignments/{uid}, which security rules make
 * read-only for the account itself and writable only by a reviewer or admin.
 * A custom claim, when a trusted backend sets one, takes precedence.
 */
async function resolveRole(db, firebaseUser) {
  const tokenResult = await firebaseUser.getIdTokenResult();
  const claimRole = tokenResult?.claims?.role;

  if (typeof claimRole === "string" && claimRole in ROLES) {
    return normalizeRole(claimRole);
  }

  try {
    const assignment = await getDoc(
      doc(db, ROLE_ASSIGNMENTS_COLLECTION, firebaseUser.uid),
    );

    return assignment.exists()
      ? normalizeRole(assignment.data()?.role)
      : ROLES.resident;
  } catch {
    // A denied or unavailable read must never escalate access.
    return ROLES.resident;
  }
}

async function readProfile(db, uid) {
  try {
    const snapshot = await getDoc(doc(db, USERS_COLLECTION, uid));

    return snapshot.exists() ? normalizeProfileRecord(snapshot.data()) : null;
  } catch {
    return null;
  }
}

export function createFirebaseAuthGateway({
  auth = getFirebaseAuth(),
  db = getFirebaseDb(),
} = {}) {
  async function buildSession(firebaseUser) {
    const [role, profile] = await Promise.all([
      resolveRole(db, firebaseUser),
      readProfile(db, firebaseUser.uid),
    ]);

    return { user: toSessionUser(firebaseUser), role, profile };
  }

  return {
    observeSession(listener) {
      let cancelled = false;

      const emit = async (firebaseUser) => {
        if (!firebaseUser) {
          if (!cancelled) {
            listener(null);
          }

          return;
        }

        const session = await buildSession(firebaseUser);

        if (!cancelled) {
          listener(session);
        }
      };

      const unsubscribeAuth = onAuthStateChanged(auth, emit);
      // Claim changes (a later reviewer approval) must refresh the session.
      const unsubscribeToken = onIdTokenChanged(auth, emit);

      return () => {
        cancelled = true;
        unsubscribeAuth();
        unsubscribeToken();
      };
    },

    async signIn({ email, password }) {
      await signInWithEmailAndPassword(auth, email, password);
    },

    async register({ email, password, displayName, phone, barangay }) {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );

      await updateProfile(credential.user, { displayName });

      // Registration only ever writes a resident profile. The role field here
      // is descriptive; roleAssignments/{uid} is the authorization boundary and
      // no client can write it.
      await setDoc(doc(db, USERS_COLLECTION, credential.user.uid), {
        displayName,
        email,
        phone,
        barangay,
        role: ROLES.resident,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    },

    async updateOwnProfile(uid, { displayName, phone, barangay }) {
      await updateDoc(doc(db, USERS_COLLECTION, uid), {
        displayName,
        phone,
        barangay,
        updatedAt: serverTimestamp(),
      });
    },

    async sendPasswordReset(email) {
      await sendPasswordResetEmail(auth, email);
    },

    async signOut() {
      await signOut(auth);
    },
  };
}

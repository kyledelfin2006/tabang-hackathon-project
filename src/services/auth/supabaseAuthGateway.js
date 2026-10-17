import { getSupabaseClient } from "../../config/supabase.js";
import { normalizeProfileRecord } from "./profile.js";
import { ROLES, normalizeRole } from "./roles.js";

// Where the emailed reset link lands; the page there sets the new password.
export const PASSWORD_UPDATE_PATH = "/update-password";

function toSessionUser(user, profile) {
  return Object.freeze({
    uid: user.id,
    email: user.email ?? "",
    displayName: profile?.displayName || (user.user_metadata?.display_name ?? ""),
    emailVerified: Boolean(user.email_confirmed_at),
  });
}

/**
 * Resolves the trusted role for a signed-in user.
 *
 * role_assignments is the only role source, and no client can write it. A
 * missing row means resident, and so does a failed read: an error must never
 * escalate access.
 */
async function resolveRole(client, uid) {
  const { data, error } = await client
    .from("role_assignments")
    .select("role")
    .eq("user_id", uid)
    .maybeSingle();

  return error || !data ? ROLES.resident : normalizeRole(data.role);
}

async function readProfile(client, uid) {
  const { data, error } = await client
    .from("profiles")
    .select("display_name, email, phone, barangay")
    .eq("id", uid)
    .maybeSingle();

  return error || !data
    ? null
    : normalizeProfileRecord({
        displayName: data.display_name,
        email: data.email,
        phone: data.phone,
        barangay: data.barangay,
      });
}

export function createAuthGateway({ client } = {}) {
  const supabase = () => client ?? getSupabaseClient();

  async function buildSession(user) {
    const [role, profile] = await Promise.all([
      resolveRole(supabase(), user.id),
      readProfile(supabase(), user.id),
    ]);

    return { user: toSessionUser(user, profile), role, profile };
  }

  return {
    /**
     * Calls `listener` with each built session, or null when signed out.
     *
     * `onPending` fires when a different user signs in, before their session
     * is built, so the app can stay in its loading state instead of briefly
     * showing the sign-in form again. A sequence number drops any build that
     * finishes after a newer change, so a slow build can never overwrite a
     * sign-out.
     */
    observeSession(listener, { onPending } = {}) {
      let cancelled = false;
      let sequence = 0;
      let currentUserId;

      const {
        data: { subscription },
      } = supabase().auth.onAuthStateChange((_event, session) => {
        const user = session?.user ?? null;
        const ticket = ++sequence;

        if (user && user.id !== currentUserId) {
          onPending?.();
        }

        currentUserId = user?.id ?? null;

        // Supabase forbids awaiting other client calls inside this callback,
        // so the session is built on the next tick instead.
        setTimeout(async () => {
          const next = user ? await buildSession(user) : null;

          if (!cancelled && ticket === sequence) {
            listener(next);
          }
        }, 0);
      });

      return () => {
        cancelled = true;
        subscription.unsubscribe();
      };
    },

    async signIn({ email, password }) {
      const { error } = await supabase().auth.signInWithPassword({ email, password });

      if (error) {
        throw error;
      }
    },

    /**
     * Registration only ever creates a resident. The profile is written by a
     * database trigger from this metadata, in the same transaction as the
     * account, so closing the browser mid sign-up cannot leave an account
     * without one.
     */
    async register({ email, password, displayName, phone, barangay }) {
      const { error } = await supabase().auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName, phone, barangay } },
      });

      if (error) {
        throw error;
      }
    },

    async updateOwnProfile(uid, { displayName, phone, barangay }) {
      const { error } = await supabase()
        .from("profiles")
        .update({ display_name: displayName, phone, barangay })
        .eq("id", uid);

      if (error) {
        throw error;
      }
    },

    async sendPasswordReset(email) {
      const { error } = await supabase().auth.resetPasswordForEmail(email, {
        redirectTo:
          typeof window === "undefined"
            ? undefined
            : `${window.location.origin}${PASSWORD_UPDATE_PATH}`,
      });

      if (error) {
        throw error;
      }
    },

    async updatePassword(password) {
      const { error } = await supabase().auth.updateUser({ password });

      if (error) {
        throw error;
      }
    },

    async signOut() {
      const { error } = await supabase().auth.signOut();

      if (error) {
        throw error;
      }
    },
  };
}

import { randomUUID } from "node:crypto";
import { generateApiKey } from "../../server/auth.mjs";

function afterAscending(row, after, field) {
  return !after || row[field] > after.at || (row[field] === after.at && row.id > after.id);
}

function beforeDescending(row, after, field) {
  return !after || row[field] < after.at || (row[field] === after.at && row.id < after.id);
}

/**
 * The same functions as server/store.mjs, kept in memory, so route tests need
 * no database. Each test gets its own store.
 */
export function createMemoryStore() {
  const clients = new Map();
  // Incident rows may carry protected fields on purpose, to prove the route's
  // projection drops them.
  const incidents = [];
  const feed = [];
  const signals = new Map();
  const users = new Map();
  const profiles = new Map();
  const roles = new Map();
  const sessions = new Map();
  const passwordResets = new Map();

  return {
    clients,
    incidents,
    feed,
    signals,
    users,
    profiles,
    roles,
    sessions,
    passwordResets,

    // Users, profiles, sessions, and password resets
    async findUserByEmail(email) {
      const lower = String(email || "").trim().toLowerCase();
      const user = [...users.values()].find((u) => u.email === lower);
      if (!user) return null;
      const profile = profiles.get(user.id) || null;
      const role = roles.get(user.id)?.role || "resident";
      return {
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        role,
        profile,
      };
    },

    async findUserById(id) {
      const user = users.get(id);
      if (!user) return null;
      const profile = profiles.get(user.id) || null;
      const role = roles.get(user.id)?.role || "resident";
      return {
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        role,
        profile,
      };
    },

    async createUserWithProfile({ email, passwordHash, displayName, phone, barangay }) {
      const id = randomUUID();
      const lower = String(email || "").trim().toLowerCase();
      const user = { id, email: lower, passwordHash, createdAt: new Date().toISOString() };
      users.set(id, user);

      const profile = {
        displayName,
        email: lower,
        phone,
        barangay,
      };
      profiles.set(id, profile);
      roles.set(id, { userId: id, role: "resident" });

      return user;
    },

    async createSession({ userId, tokenHash, expiresAt }) {
      sessions.set(tokenHash, {
        tokenHash,
        userId,
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        expiresAt: expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt,
      });
    },

    async findSessionByTokenHash(tokenHash) {
      const s = sessions.get(tokenHash);
      if (!s) return null;
      if (Date.parse(s.expiresAt) <= Date.now()) {
        sessions.delete(tokenHash);
        return null;
      }
      const user = users.get(s.userId);
      if (!user) return null;
      const profile = profiles.get(s.userId) || null;
      const role = roles.get(s.userId)?.role || "resident";
      return {
        user: { id: user.id, email: user.email },
        role,
        profile,
      };
    },

    async deleteSession(tokenHash) {
      sessions.delete(tokenHash);
    },

    async deleteAllUserSessions(userId) {
      for (const [th, s] of sessions.entries()) {
        if (s.userId === userId) {
          sessions.delete(th);
        }
      }
    },

    async updateProfile(userId, { displayName, phone, barangay }) {
      const p = profiles.get(userId);
      if (p) {
        Object.assign(p, { displayName, phone, barangay });
      }
      return p;
    },

    async createPasswordReset({ userId, tokenHash, expiresAt }) {
      passwordResets.set(tokenHash, {
        tokenHash,
        userId,
        expiresAt: expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt,
        usedAt: null,
      });
    },

    async findPasswordReset(tokenHash) {
      const r = passwordResets.get(tokenHash);
      return r || null;
    },

    async usePasswordReset(tokenHash, newPasswordHash, userId) {
      const r = passwordResets.get(tokenHash);
      if (r) {
        r.usedAt = new Date().toISOString();
      }
      const u = users.get(userId);
      if (u) {
        u.passwordHash = newPasswordHash;
      }
      for (const [th, s] of sessions.entries()) {
        if (s.userId === userId) {
          sessions.delete(th);
        }
      }
    },

    async updateUserPassword(userId, newPasswordHash) {
      const u = users.get(userId);
      if (u) {
        u.passwordHash = newPasswordHash;
      }
    },

    async listPartnerIncidents({ statuses, kind, municipality, since, after, limit }) {
      return incidents
        .filter((row) => statuses.includes(row.incidentStatus))
        .filter((row) => !kind || row.kind === kind)
        .filter((row) => !municipality || row.municipality === municipality)
        .filter((row) => !since || Date.parse(row.updatedAt) >= Date.parse(since))
        .filter((row) => afterAscending(row, after, "updatedAt"))
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id))
        .slice(0, limit);
    },

    async getPartnerIncident(id) {
      return incidents.find((row) => row.id === id) ?? null;
    },

    async listPublicAdvisories({ after, limit, now = new Date() }) {
      return feed
        .filter((item) => item.published)
        .filter((item) => !item.expiresAt || Date.parse(item.expiresAt) > now.getTime())
        .filter((item) => beforeDescending(item, after, "createdAt"))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .slice(0, limit);
    },

    // Mirrors the ingest_signal database function.
    async ingestSignal(signal) {
      const key = `${signal.source}|${signal.externalId}`;
      const existing = signals.get(key);
      const id = existing?.id ?? randomUUID();
      const municipalities = new Set(signal.areas.map((area) => area.municipality));

      signals.set(key, { ...signal, id });

      const item = feed.find((entry) => entry.signalId === id);
      const fields = {
        kind: "advisory",
        summary: signal.headline.slice(0, 240),
        municipality: municipalities.size === 1 ? [...municipalities][0] : null,
        source: signal.source,
        expiresAt: signal.expiresAt,
        published: true,
      };

      if (item) {
        Object.assign(item, fields);
      } else {
        feed.push({
          id: randomUUID(),
          signalId: id,
          barangay: null,
          createdAt: new Date().toISOString(),
          ...fields,
        });
      }

      return { signalId: id, created: !existing };
    },

    async findApiClient(id) {
      return clients.get(id) ?? null;
    },

    async createApiClient({ id, name, scopes, keyHash }) {
      const client = { id, name, scopes, keyHash, status: "active" };

      clients.set(id, client);

      return client;
    },

    async listApiClients() {
      return [...clients.values()];
    },

    async revokeApiClient(id) {
      const client = clients.get(id);

      if (!client) {
        return false;
      }

      client.status = "revoked";

      return true;
    },

    /** Test helper: provisions a client and returns its one-time key. */
    async provision(scopes, name = "Test partner") {
      const { id, key, keyHash } = generateApiKey();

      await this.createApiClient({ id, name, scopes, keyHash });

      return { id, key };
    },
  };
}

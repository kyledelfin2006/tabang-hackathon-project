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

  return {
    clients,
    incidents,
    feed,
    signals,

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

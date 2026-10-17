import { generateApiKey } from "../../server/auth.mjs";

/**
 * The same functions as server/store.mjs, kept in memory, so route tests need
 * no database. Each test gets its own store.
 */
export function createMemoryStore() {
  const clients = new Map();

  return {
    clients,

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

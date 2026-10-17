/**
 * The database operations the server needs, as small functions.
 *
 * Routes depend on this shape rather than on the Supabase client, so their
 * tests use tests/server/memoryStore.mjs instead of a database.
 */
function check({ data, error }) {
  if (error) {
    throw new Error(`Store request failed: ${error.code ?? "unknown"}`);
  }

  return data;
}

function toClient(row) {
  return {
    id: row.id,
    name: row.name,
    keyHash: row.key_hash,
    scopes: row.scopes,
    status: row.status,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

export function createSupabaseStore(client) {
  return {
    async findApiClient(id) {
      const row = check(
        await client.from("api_clients").select("*").eq("id", id).maybeSingle(),
      );

      return row ? toClient(row) : null;
    },

    async createApiClient({ id, name, scopes, keyHash }) {
      return toClient(
        check(
          await client
            .from("api_clients")
            .insert({ id, name, scopes, key_hash: keyHash })
            .select("*")
            .single(),
        ),
      );
    },

    async listApiClients() {
      return check(
        await client.from("api_clients").select("*").order("created_at", { ascending: true }),
      ).map(toClient);
    },

    async revokeApiClient(id) {
      const rows = check(
        await client
          .from("api_clients")
          .update({ status: "revoked", revoked_at: new Date().toISOString() })
          .eq("id", id)
          .select("id"),
      );

      return rows.length === 1;
    },
  };
}

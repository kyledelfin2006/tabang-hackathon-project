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

// Only the columns the partner projection uses are read at all.
const PARTNER_INCIDENT_COLUMNS =
  "id, kind, incident_status, verification_status, severity, need, people_affected, municipality, barangay, created_at, updated_at, acknowledged_at, resolved_at";

function toIncidentRow(row) {
  return {
    id: row.id,
    kind: row.kind,
    incidentStatus: row.incident_status,
    verificationStatus: row.verification_status,
    severity: row.severity,
    need: row.need,
    peopleAffected: row.people_affected,
    municipality: row.municipality,
    barangay: row.barangay,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
  };
}

function toAdvisoryRow(row) {
  return {
    id: row.id,
    kind: row.kind,
    summary: row.summary,
    municipality: row.municipality,
    barangay: row.barangay,
    source: row.source,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
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

    /**
     * Incidents ordered by last change, then id. `after` comes from a cursor
     * whose values decodeCursor has already held to a timestamp and a UUID.
     */
    async listPartnerIncidents({ statuses, kind, municipality, since, after, limit }) {
      let query = client
        .from("reports")
        .select(PARTNER_INCIDENT_COLUMNS)
        .in("incident_status", statuses);

      if (kind) {
        query = query.eq("kind", kind);
      }

      if (municipality) {
        query = query.eq("municipality", municipality);
      }

      if (since) {
        query = query.gte("updated_at", since);
      }

      if (after) {
        query = query.or(
          `updated_at.gt."${after.at}",and(updated_at.eq."${after.at}",id.gt.${after.id})`,
        );
      }

      return check(
        await query
          .order("updated_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(limit),
      ).map(toIncidentRow);
    },

    async getPartnerIncident(id) {
      const row = check(
        await client
          .from("reports")
          .select(PARTNER_INCIDENT_COLUMNS)
          .eq("id", id)
          .maybeSingle(),
      );

      return row ? toIncidentRow(row) : null;
    },

    /**
     * Published, unexpired feed items, newest first. The secret key bypasses
     * row-level security, so expiry is filtered here explicitly. The two
     * either-or conditions (not expired, after the cursor) are expanded into
     * one filter because the query takes a single `or`.
     */
    async listPublicAdvisories({ after, limit, now = new Date() }) {
      const live = [`expires_at.is.null`, `expires_at.gt."${now.toISOString()}"`];
      const position = after
        ? [
            `created_at.lt."${after.at}"`,
            `and(created_at.eq."${after.at}",id.lt.${after.id})`,
          ]
        : [null];
      const branches = live.flatMap((condition) =>
        position.map((place) => (place ? `and(${condition},${place})` : condition)),
      );

      return check(
        await client
          .from("public_feed")
          .select("id, kind, summary, municipality, barangay, source, created_at, expires_at")
          .eq("published", true)
          .or(branches.join(","))
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(limit),
      ).map(toAdvisoryRow);
    },

    /** Upserts the signal and its advisory in one transaction. */
    async ingestSignal(signal) {
      const [row] = check(
        await client.rpc("ingest_signal", {
          source: signal.source,
          external_id: signal.externalId,
          type: signal.type,
          level: signal.level,
          headline: signal.headline,
          body: signal.body,
          areas: signal.areas,
          issued_at: signal.issuedAt,
          expires_at: signal.expiresAt,
          url: signal.url,
        }),
      );

      return { signalId: row.signal_id, created: row.created };
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

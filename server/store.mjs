import { query, withTransaction } from "./db.mjs";

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

export function createPostgresStore() {
  return {
    // -------------------------------------------------------------------------
    // Users, profiles, sessions, and password resets
    // -------------------------------------------------------------------------
    async findUserByEmail(email) {
      const { rows } = await query(
        `select u.id, u.email, u.password_hash,
                p.display_name, p.phone, p.barangay,
                coalesce(ra.role, 'resident') as role
         from public.users u
         left join public.profiles p on p.id = u.id
         left join public.role_assignments ra on ra.user_id = u.id
         where u.email = lower($1)`,
        [email],
      );

      if (rows.length === 0) {
        return null;
      }

      const r = rows[0];
      return {
        id: r.id,
        email: r.email,
        passwordHash: r.password_hash,
        role: r.role,
        profile: {
          displayName: r.display_name,
          email: r.email,
          phone: r.phone,
          barangay: r.barangay,
        },
      };
    },

    async findUserById(id) {
      const { rows } = await query(
        `select u.id, u.email, u.password_hash,
                p.display_name, p.phone, p.barangay,
                coalesce(ra.role, 'resident') as role
         from public.users u
         left join public.profiles p on p.id = u.id
         left join public.role_assignments ra on ra.user_id = u.id
         where u.id = $1`,
        [id],
      );

      if (rows.length === 0) {
        return null;
      }

      const r = rows[0];
      return {
        id: r.id,
        email: r.email,
        passwordHash: r.password_hash,
        role: r.role,
        profile: {
          displayName: r.display_name,
          email: r.email,
          phone: r.phone,
          barangay: r.barangay,
        },
      };
    },

    async createUserWithProfile({ email, passwordHash, displayName, phone, barangay }) {
      return withTransaction(async (client) => {
        const { rows: userRows } = await client.query(
          "insert into public.users (email, password_hash) values (lower($1), $2) returning id, email",
          [email, passwordHash],
        );
        const user = userRows[0];

        await client.query(
          "insert into public.profiles (id, display_name, email, phone, barangay) values ($1, $2, lower($3), $4, $5)",
          [user.id, displayName, email, phone, barangay],
        );

        return user;
      });
    },

    async createSession({ userId, tokenHash, expiresAt }) {
      await query(
        "insert into public.sessions (token_hash, user_id, expires_at) values ($1, $2, $3)",
        [tokenHash, userId, expiresAt],
      );
    },

    async findSessionByTokenHash(tokenHash) {
      const { rows } = await query(
        `select s.token_hash, s.user_id, s.expires_at,
                u.email,
                p.display_name, p.phone, p.barangay,
                coalesce(ra.role, 'resident') as role
         from public.sessions s
         join public.users u on u.id = s.user_id
         left join public.profiles p on p.id = u.id
         left join public.role_assignments ra on ra.user_id = u.id
         where s.token_hash = $1 and s.expires_at > now()`,
        [tokenHash],
      );

      if (rows.length === 0) {
        return null;
      }

      const r = rows[0];
      query("update public.sessions set last_seen_at = now() where token_hash = $1", [
        tokenHash,
      ]).catch(() => {});

      return {
        user: { id: r.user_id, email: r.email },
        role: r.role,
        profile: {
          displayName: r.display_name,
          email: r.email,
          phone: r.phone,
          barangay: r.barangay,
        },
      };
    },

    async deleteSession(tokenHash) {
      await query("delete from public.sessions where token_hash = $1", [tokenHash]);
    },

    async deleteAllUserSessions(userId) {
      await query("delete from public.sessions where user_id = $1", [userId]);
    },

    async updateProfile(userId, { displayName, phone, barangay }) {
      const { rows } = await query(
        `update public.profiles
         set display_name = $1, phone = $2, barangay = $3, updated_at = now()
         where id = $4
         returning display_name, phone, barangay`,
        [displayName, phone, barangay, userId],
      );

      if (rows.length === 0) {
        return null;
      }

      return {
        displayName: rows[0].display_name,
        phone: rows[0].phone,
        barangay: rows[0].barangay,
      };
    },

    async createPasswordReset({ userId, tokenHash, expiresAt }) {
      await query(
        "insert into public.password_resets (token_hash, user_id, expires_at) values ($1, $2, $3)",
        [tokenHash, userId, expiresAt],
      );
    },

    async findPasswordReset(tokenHash) {
      const { rows } = await query(
        `select token_hash, user_id, expires_at, used_at
         from public.password_resets
         where token_hash = $1 and used_at is null and expires_at > now()`,
        [tokenHash],
      );

      if (rows.length === 0) {
        return null;
      }

      return {
        tokenHash: rows[0].token_hash,
        userId: rows[0].user_id,
        expiresAt: rows[0].expires_at,
        usedAt: rows[0].used_at,
      };
    },

    async usePasswordReset(tokenHash, newPasswordHash, userId) {
      await withTransaction(async (client) => {
        await client.query(
          "update public.password_resets set used_at = now() where token_hash = $1",
          [tokenHash],
        );
        await client.query("update public.users set password_hash = $1 where id = $2", [
          newPasswordHash,
          userId,
        ]);
        await client.query("delete from public.sessions where user_id = $1", [userId]);
      });
    },

    async updateUserPassword(userId, newPasswordHash) {
      await query("update public.users set password_hash = $1 where id = $2", [
        newPasswordHash,
        userId,
      ]);
    },

    // -------------------------------------------------------------------------
    // Partner API
    // -------------------------------------------------------------------------
    async findApiClient(id) {
      const { rows } = await query("select * from public.api_clients where id = $1", [id]);
      return rows.length > 0 ? toClient(rows[0]) : null;
    },

    async createApiClient({ id, name, scopes, keyHash }) {
      const { rows } = await query(
        "insert into public.api_clients (id, name, scopes, key_hash) values ($1, $2, $3, $4) returning *",
        [id, name, scopes, keyHash],
      );
      return toClient(rows[0]);
    },

    async listApiClients() {
      const { rows } = await query(
        "select * from public.api_clients order by created_at asc",
      );
      return rows.map(toClient);
    },

    async revokeApiClient(id) {
      const { rows } = await query(
        "update public.api_clients set status = 'revoked', revoked_at = now() where id = $1 returning id",
        [id],
      );
      return rows.length === 1;
    },

    async listPartnerIncidents({ statuses, kind, municipality, since, after, limit }) {
      const conditions = ["incident_status = any($1)"];
      const params = [statuses];
      let paramIndex = 2;

      if (kind) {
        conditions.push(`kind = $${paramIndex++}`);
        params.push(kind);
      }

      if (municipality) {
        conditions.push(`municipality = $${paramIndex++}`);
        params.push(municipality);
      }

      if (since) {
        conditions.push(`updated_at >= $${paramIndex++}`);
        params.push(since);
      }

      if (after) {
        conditions.push(
          `(updated_at > $${paramIndex} or (updated_at = $${paramIndex} and id > $${paramIndex + 1}))`,
        );
        params.push(after.at, after.id);
        paramIndex += 2;
      }

      params.push(limit);
      const limitIndex = paramIndex;

      const sql = `
        select id, kind, incident_status, verification_status, severity, need,
               people_affected, municipality, barangay, created_at, updated_at,
               acknowledged_at, resolved_at
        from public.reports
        where ${conditions.join(" and ")}
        order by updated_at asc, id asc
        limit $${limitIndex}
      `;

      const { rows } = await query(sql, params);
      return rows.map(toIncidentRow);
    },

    async getPartnerIncident(id) {
      const { rows } = await query(
        `select id, kind, incident_status, verification_status, severity, need,
                people_affected, municipality, barangay, created_at, updated_at,
                acknowledged_at, resolved_at
         from public.reports
         where id = $1`,
        [id],
      );
      return rows.length > 0 ? toIncidentRow(rows[0]) : null;
    },

    async listPublicAdvisories({ after, limit, now = new Date() }) {
      const conditions = [
        "published = true",
        "(expires_at is null or expires_at > $1)",
      ];
      const params = [now.toISOString()];
      let paramIndex = 2;

      if (after) {
        conditions.push(
          `(created_at < $${paramIndex} or (created_at = $${paramIndex} and id < $${paramIndex + 1}))`,
        );
        params.push(after.at, after.id);
        paramIndex += 2;
      }

      params.push(limit);
      const limitIndex = paramIndex;

      const sql = `
        select id, kind, summary, municipality, barangay, source, created_at, expires_at
        from public.public_feed
        where ${conditions.join(" and ")}
        order by created_at desc, id desc
        limit $${limitIndex}
      `;

      const { rows } = await query(sql, params);
      return rows.map(toAdvisoryRow);
    },

    async ingestSignal(signal) {
      const { rows } = await query(
        `select signal_id, created
         from public.ingest_signal($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          signal.source,
          signal.externalId,
          signal.type,
          signal.level,
          signal.headline,
          signal.body,
          JSON.stringify(signal.areas || []),
          signal.issuedAt,
          signal.expiresAt,
          signal.url,
        ],
      );

      return { signalId: rows[0].signal_id, created: rows[0].created };
    },
  };
}

// Keep createSupabaseStore for backwards compatibility until Phase 5
export function createSupabaseStore(client) {
  function check({ data, error }) {
    if (error) {
      throw new Error(`Store request failed: ${error.code ?? "unknown"}`);
    }
    return data;
  }

  const PARTNER_INCIDENT_COLUMNS =
    "id, kind, incident_status, verification_status, severity, need, people_affected, municipality, barangay, created_at, updated_at, acknowledged_at, resolved_at";

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

    async listPartnerIncidents({ statuses, kind, municipality, since, after, limit }) {
      let q = client.from("reports").select(PARTNER_INCIDENT_COLUMNS).in("incident_status", statuses);
      if (kind) q = q.eq("kind", kind);
      if (municipality) q = q.eq("municipality", municipality);
      if (since) q = q.gte("updated_at", since);
      if (after) {
        q = q.or(
          `updated_at.gt."${after.at}",and(updated_at.eq."${after.at}",id.gt.${after.id})`,
        );
      }
      return check(
        await q.order("updated_at", { ascending: true }).order("id", { ascending: true }).limit(limit),
      ).map(toIncidentRow);
    },

    async getPartnerIncident(id) {
      const row = check(
        await client.from("reports").select(PARTNER_INCIDENT_COLUMNS).eq("id", id).maybeSingle(),
      );
      return row ? toIncidentRow(row) : null;
    },

    async listPublicAdvisories({ after, limit, now = new Date() }) {
      const live = [`expires_at.is.null`, `expires_at.gt."${now.toISOString()}"`];
      const position = after
        ? [`created_at.lt."${after.at}"`, `and(created_at.eq."${after.at}",id.lt.${after.id})`]
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

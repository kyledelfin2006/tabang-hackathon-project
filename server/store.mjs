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
    async ping() {
      await query("select 1");
      return true;
    },

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
    // Reports (Resident)
    // -------------------------------------------------------------------------
    async createReport({
      id,
      reporterId,
      kind,
      municipality,
      barangay,
      landmark,
      publicLocationLabel,
      publicSummary,
      latitude,
      longitude,
      description,
      contactPhone,
      severity,
      need,
      peopleAffected,
      imagePaths = [],
    }) {
      const sql = `
        insert into public.reports (
          id, reporter_id, kind, municipality, barangay, landmark,
          public_location_label, public_summary, latitude, longitude,
          description, contact_phone, severity, need, people_affected,
          image_paths
        ) values (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16
        )
        on conflict (id) do nothing
        returning id
      `;
      const params = [
        id,
        reporterId,
        kind,
        municipality,
        barangay,
        landmark || null,
        publicLocationLabel,
        publicSummary,
        latitude ?? null,
        longitude ?? null,
        description,
        contactPhone,
        severity ?? null,
        need ?? null,
        peopleAffected ?? null,
        imagePaths,
      ];
      const { rows } = await query(sql, params);
      return { reportId: rows.length > 0 ? rows[0].id : id };
    },

    async getReportReporterId(reportId) {
      const { rows } = await query(`select reporter_id from public.reports where id = $1`, [
        reportId,
      ]);
      return rows.length > 0 ? rows[0].reporter_id : null;
    },

    async listMyReports(reporterId, { cursor = null, limit = 10 } = {}) {
      const conditions = ["reporter_id = $1"];
      const params = [reporterId];
      let paramIdx = 2;

      if (cursor && cursor.createdAt && cursor.id) {
        conditions.push(
          `(created_at < $${paramIdx} or (created_at = $${paramIdx} and id < $${paramIdx + 1}))`,
        );
        params.push(cursor.createdAt, cursor.id);
        paramIdx += 2;
      }

      const sql = `
        select id, kind, municipality, barangay, landmark, public_location_label,
               description, severity, need, people_affected, verification_status,
               incident_status, created_at
        from public.reports
        where ${conditions.join(" and ")}
        order by created_at desc, id desc
        limit $${paramIdx}
      `;
      params.push(limit);

      const { rows } = await query(sql, params);
      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        municipality: r.municipality,
        barangay: r.barangay,
        landmark: r.landmark,
        publicLocationLabel: r.public_location_label,
        description: r.description,
        severity: r.severity,
        need: r.need,
        peopleAffected: r.people_affected,
        verificationStatus: r.verification_status,
        incidentStatus: r.incident_status,
        createdAt: r.created_at,
      }));
    },

    async cancelReport(actorId, reportId) {
      await query("select public.cancel_report($1, $2)", [actorId, reportId]);
      return { ok: true };
    },

    // -------------------------------------------------------------------------
    // Incidents (Responder)
    // -------------------------------------------------------------------------
    async listIncidents({ statuses, kind, cursor = null, limit = 25 } = {}) {
      const conditions = ["incident_status = any($1)"];
      const params = [statuses];
      let paramIdx = 2;

      if (kind && kind !== "all") {
        conditions.push(`kind = $${paramIdx}`);
        params.push(kind);
        paramIdx++;
      }

      if (cursor && cursor.createdAt && cursor.id) {
        conditions.push(
          `(created_at > $${paramIdx} or (created_at = $${paramIdx} and id > $${paramIdx + 1}))`,
        );
        params.push(cursor.createdAt, cursor.id);
        paramIdx += 2;
      }

      const sql = `
        select id, kind, incident_status, verification_status, priority,
               municipality, barangay, landmark, public_location_label,
               description, contact_phone, latitude, longitude, severity,
               need, people_affected, image_paths, assigned_responder_ids,
               created_at, acknowledged_at, reporter_id
        from public.reports
        where ${conditions.join(" and ")}
        order by created_at asc, id asc
        limit $${paramIdx}
      `;
      params.push(limit);

      const { rows } = await query(sql, params);
      return rows.map((r) => ({
        id: r.id,
        reporterId: r.reporter_id,
        kind: r.kind,
        incidentStatus: r.incident_status,
        verificationStatus: r.verification_status,
        priority: r.priority,
        municipality: r.municipality,
        barangay: r.barangay,
        landmark: r.landmark,
        publicLocationLabel: r.public_location_label,
        description: r.description,
        contactPhone: r.contact_phone,
        latitude: r.latitude,
        longitude: r.longitude,
        severity: r.severity,
        need: r.need,
        peopleAffected: r.people_affected,
        imagePaths: r.image_paths,
        assignedResponderIds: r.assigned_responder_ids,
        createdAt: r.created_at,
        acknowledgedAt: r.acknowledged_at,
      }));
    },

    async getIncident(id) {
      const sql = `
        select id, kind, incident_status, verification_status, priority,
               municipality, barangay, landmark, public_location_label,
               description, contact_phone, latitude, longitude, severity,
               need, people_affected, image_paths, assigned_responder_ids,
               created_at, acknowledged_at, reporter_id
        from public.reports
        where id = $1
      `;
      const { rows } = await query(sql, [id]);
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        reporterId: r.reporter_id,
        kind: r.kind,
        incidentStatus: r.incident_status,
        verificationStatus: r.verification_status,
        priority: r.priority,
        municipality: r.municipality,
        barangay: r.barangay,
        landmark: r.landmark,
        publicLocationLabel: r.public_location_label,
        description: r.description,
        contactPhone: r.contact_phone,
        latitude: r.latitude,
        longitude: r.longitude,
        severity: r.severity,
        need: r.need,
        peopleAffected: r.people_affected,
        imagePaths: r.image_paths,
        assignedResponderIds: r.assigned_responder_ids,
        createdAt: r.created_at,
        acknowledgedAt: r.acknowledged_at,
      };
    },

    async getIncidentCounts(actorId) {
      const { rows } = await query("select * from public.incident_counts($1)", [actorId]);
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        openIncidents: r.open_incidents,
        unclaimed: r.unclaimed,
        overdue: r.overdue,
        verified: r.verified,
        awaitingVerification: r.awaiting_verification,
        countedAt: r.counted_at,
      };
    },

    async listIncidentEvents(incidentId) {
      const sql = `
        select id, type, from_status, to_status, actor_id, actor_role, note, created_at
        from public.report_events
        where report_id = $1
        order by created_at asc, id asc
        limit 100
      `;
      const { rows } = await query(sql, [incidentId]);
      return rows.map((r) => ({
        id: String(r.id),
        type: r.type,
        fromStatus: r.from_status,
        toStatus: r.to_status,
        actorId: r.actor_id,
        actorRole: r.actor_role,
        note: r.note,
        createdAt: r.created_at,
      }));
    },

    async claimIncident(actorId, incidentId) {
      await query("select public.claim_incident($1, $2)", [actorId, incidentId]);
      return { ok: true };
    },

    async transitionIncident(actorId, incidentId, toStatus, note = "") {
      await query("select public.transition_incident($1, $2, $3, $4)", [
        actorId,
        incidentId,
        toStatus,
        note,
      ]);
      return { ok: true };
    },

    async verifyIncident(actorId, incidentId, verificationStatus) {
      await query("select public.verify_incident($1, $2, $3)", [
        actorId,
        incidentId,
        verificationStatus,
      ]);
      return { ok: true };
    },

    // -------------------------------------------------------------------------
    // Advisories (Public Feed)
    // -------------------------------------------------------------------------
    async listPublicFeed({ limit = 6 } = {}) {
      const sql = `
        select id, kind, summary, municipality, barangay, source, published, created_at, expires_at
        from public.public_feed
        where published = true and (expires_at is null or expires_at > now())
        order by created_at desc
        limit $1
      `;
      const { rows } = await query(sql, [limit]);
      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        summary: r.summary,
        municipality: r.municipality,
        barangay: r.barangay,
        source: r.source,
        published: r.published,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
      }));
    },

    async listOwnAdvisories(actorId, { limit = 20 } = {}) {
      const sql = `
        select id, kind, summary, municipality, barangay, source, published, created_at, expires_at
        from public.public_feed
        where created_by = $1
        order by created_at desc
        limit $2
      `;
      const { rows } = await query(sql, [actorId, limit]);
      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        summary: r.summary,
        municipality: r.municipality,
        barangay: r.barangay,
        source: r.source,
        published: r.published,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
      }));
    },

    async createAdvisory(actorId, { summary, municipality = null, barangay = null }) {
      const sql = `
        insert into public.public_feed (kind, summary, municipality, barangay, created_by, source, published)
        values ('advisory', $1, $2, $3, $4, 'tabang', true)
        returning id, created_at
      `;
      const { rows } = await query(sql, [summary, municipality || null, barangay || null, actorId]);
      return rows[0];
    },

    async unpublishAdvisory(actorId, id) {
      const sql = `
        update public.public_feed
        set published = false
        where id = $1 and (created_by = $2 or public.is_admin($2))
        returning id
      `;
      const { rows } = await query(sql, [id, actorId]);
      return rows.length > 0;
    },

    // -------------------------------------------------------------------------
    // Hotlines
    // -------------------------------------------------------------------------
    async listHotlines({ limit = 50 } = {}) {
      const sql = `
        select id, organization, coverage_area, phone_numbers, verified,
               verified_at, verified_by, rating_count, rating_total
        from public.hotline_directory
        order by organization asc
        limit $1
      `;
      const { rows } = await query(sql, [limit]);
      return rows.map((r) => ({
        id: r.id,
        organization: r.organization,
        coverageArea: r.coverage_area,
        phoneNumbers: r.phone_numbers,
        verified: r.verified,
        verifiedAt: r.verified_at,
        verifiedBy: r.verified_by,
        ratingCount: Number(r.rating_count || 0),
        ratingTotal: Number(r.rating_total || 0),
      }));
    },

    async getHotlineReview(hotlineId, userId) {
      const sql = `
        select rating, comment
        from public.hotline_reviews
        where hotline_id = $1 and reviewer_id = $2
      `;
      const { rows } = await query(sql, [hotlineId, userId]);
      if (rows.length === 0) return null;
      return { rating: rows[0].rating, comment: rows[0].comment || "" };
    },

    async upsertHotlineReview(userId, hotlineId, rating, comment = "") {
      const sql = `
        insert into public.hotline_reviews (hotline_id, reviewer_id, rating, comment)
        values ($1, $2, $3, $4)
        on conflict (hotline_id, reviewer_id) do update
        set rating = excluded.rating,
            comment = excluded.comment,
            updated_at = now()
        returning hotline_id
      `;
      await query(sql, [hotlineId, userId, rating, comment]);
      return { ok: true };
    },

    // -------------------------------------------------------------------------
    // Responder Applications & Review
    // -------------------------------------------------------------------------
    async getMyApplication(userId) {
      const sql = `
        select status, organization, badge_number, municipality, review_notes, submitted_at
        from public.responder_applications
        where applicant_id = $1
      `;
      const { rows } = await query(sql, [userId]);
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        status: r.status,
        organization: r.organization,
        badgeNumber: r.badge_number,
        municipality: r.municipality,
        reviewNotes: r.review_notes,
        submittedAt: r.submitted_at,
      };
    },

    async submitApplication(actorId, {
      organization,
      badgeNumber,
      municipality,
      identityDocumentPath,
      selfiePath,
      consentVersion,
    }) {
      await query(
        "select public.submit_application($1, $2, $3, $4, $5, $6, $7)",
        [
          actorId,
          organization,
          badgeNumber,
          municipality,
          identityDocumentPath,
          selfiePath,
          consentVersion,
        ],
      );
      return { ok: true };
    },

    async listPendingApplications({ limit = 20 } = {}) {
      const sql = `
        select a.applicant_id, a.organization, a.badge_number, a.municipality,
               a.consent_version, a.identity_document_path, a.selfie_path,
               a.submitted_at,
               p.display_name, p.email
        from public.responder_applications a
        left join public.profiles p on p.id = a.applicant_id
        where a.status = 'pending'
        order by a.submitted_at asc
        limit $1
      `;
      const { rows } = await query(sql, [limit]);
      return rows.map((r) => ({
        id: r.applicant_id,
        applicantId: r.applicant_id,
        applicantName: r.display_name || "",
        applicantEmail: r.email || "",
        organization: r.organization,
        badgeNumber: r.badge_number,
        municipality: r.municipality,
        consentVersion: r.consent_version,
        identityDocumentPath: r.identity_document_path,
        selfiePath: r.selfie_path,
        submittedAt: r.submitted_at,
      }));
    },

    async decideApplication(actorId, applicantId, approve, notes = "") {
      await query("select public.decide_application($1, $2, $3, $4)", [
        actorId,
        applicantId,
        approve,
        notes,
      ]);
      return { ok: true };
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
    async ping() {
      const row = check(
        await client.from("api_clients").select("id").limit(1),
      );
      return Boolean(row);
    },

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

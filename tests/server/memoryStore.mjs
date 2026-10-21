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
export function createMemoryStore(options = {}) {
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
  const events = [];
  const hotlines = [
    {
      id: "hotline-1",
      organization: "Aklan MDRRMO",
      coverageArea: "Province-wide",
      phoneNumbers: ["09123456789", "0361234567"],
      verified: true,
      verifiedAt: "2026-01-01T00:00:00Z",
      verifiedBy: "Admin",
      ratingCount: 1,
      ratingTotal: 5,
    },
  ];
  const hotlineReviews = new Map();
  const applications = new Map();

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
    events,
    hotlines,
    hotlineReviews,
    applications,
    options,

    async ping() {
      if (options.failPing) {
        throw new Error("database unavailable");
      }
      return true;
    },

    // -------------------------------------------------------------------------
    // Users, profiles, sessions, and password resets
    // -------------------------------------------------------------------------
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
      const lower = email.trim().toLowerCase();
      const user = { id, email: lower, passwordHash };
      users.set(id, user);
      profiles.set(id, {
        id,
        displayName,
        email: lower,
        phone,
        barangay,
      });
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

    // -------------------------------------------------------------------------
    // Reports
    // -------------------------------------------------------------------------
    async createReport(reportData) {
      const id = reportData.id || randomUUID();
      const existing = incidents.find((r) => r.id === id);
      if (existing) {
        return { reportId: id };
      }
      const row = {
        id,
        reporterId: reportData.reporterId,
        kind: reportData.kind,
        municipality: reportData.municipality,
        barangay: reportData.barangay,
        landmark: reportData.landmark || null,
        publicLocationLabel: reportData.publicLocationLabel,
        publicSummary: reportData.publicSummary,
        latitude: reportData.latitude ?? null,
        longitude: reportData.longitude ?? null,
        description: reportData.description,
        contactPhone: reportData.contactPhone,
        severity: reportData.severity ?? null,
        need: reportData.need ?? null,
        peopleAffected: reportData.peopleAffected ?? null,
        imagePaths: reportData.imagePaths || [],
        incidentStatus: "new",
        verificationStatus: "pending",
        priority: "medium",
        assignedResponderIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        acknowledgedAt: null,
      };
      incidents.push(row);
      return { reportId: id };
    },

    async getReportReporterId(reportId) {
      const row = incidents.find((r) => r.id === reportId);
      return row ? (row.reporterId || row.reporter_id || null) : null;
    },

    async listMyReports(reporterId, { cursor = null, limit = 10 } = {}) {
      return incidents
        .filter((r) => r.reporterId === reporterId)
        .filter((r) => {
          if (!cursor) return true;
          return (
            r.createdAt < cursor.createdAt ||
            (r.createdAt === cursor.createdAt && r.id < cursor.id)
          );
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .slice(0, limit);
    },

    async cancelReport(actorId, reportId) {
      const r = incidents.find((inc) => inc.id === reportId);
      if (!r || r.reporterId !== actorId) {
        throw new Error("not_found");
      }
      if (!["new", "acknowledged"].includes(r.incidentStatus)) {
        throw new Error("not_cancellable");
      }
      r.incidentStatus = "cancelled";
      r.updatedAt = new Date().toISOString();
      events.push({
        id: randomUUID(),
        reportId,
        type: "status-change",
        fromStatus: r.incidentStatus,
        toStatus: "cancelled",
        actorId,
        actorRole: roles.get(actorId)?.role || "resident",
        note: "",
        createdAt: new Date().toISOString(),
      });
      return { ok: true };
    },

    // -------------------------------------------------------------------------
    // Incidents
    // -------------------------------------------------------------------------
    async listIncidents({ statuses, kind, cursor = null, limit = 25 } = {}) {
      return incidents
        .filter((r) => statuses.includes(r.incidentStatus))
        .filter((r) => !kind || kind === "all" || r.kind === kind)
        .filter((r) => {
          if (!cursor) return true;
          return (
            r.createdAt > cursor.createdAt ||
            (r.createdAt === cursor.createdAt && r.id > cursor.id)
          );
        })
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .slice(0, limit);
    },

    async getIncident(id) {
      return incidents.find((r) => r.id === id) || null;
    },

    async getIncidentCounts() {
      const open = incidents.filter((r) =>
        ["new", "acknowledged", "dispatched", "on_scene"].includes(r.incidentStatus),
      );
      const unclaimed = open.filter((r) => (r.assignedResponderIds || []).length === 0);
      const verified = open.filter((r) => r.verificationStatus === "verified");
      const awaiting = open.filter((r) => r.verificationStatus === "pending");
      return {
        openIncidents: open.length,
        unclaimed: unclaimed.length,
        overdue: 0,
        verified: verified.length,
        awaitingVerification: awaiting.length,
        countedAt: new Date().toISOString(),
      };
    },

    async listIncidentEvents(incidentId) {
      return events.filter((e) => e.reportId === incidentId);
    },

    async claimIncident(actorId, incidentId) {
      const r = incidents.find((inc) => inc.id === incidentId);
      if (!r) throw new Error("not_found");
      if ((r.assignedResponderIds || []).length > 0) {
        if (r.assignedResponderIds.includes(actorId)) return { ok: true };
        throw new Error("already_claimed");
      }
      if (r.incidentStatus !== "new") throw new Error("invalid_transition");
      r.assignedResponderIds = [actorId];
      r.incidentStatus = "acknowledged";
      r.acknowledgedAt = new Date().toISOString();
      r.updatedAt = new Date().toISOString();
      events.push({
        id: randomUUID(),
        reportId: incidentId,
        type: "status-change",
        fromStatus: "new",
        toStatus: "acknowledged",
        actorId,
        actorRole: roles.get(actorId)?.role || "responder",
        note: "Claimed and acknowledged.",
        createdAt: new Date().toISOString(),
      });
      return { ok: true };
    },

    async transitionIncident(actorId, incidentId, toStatus, note = "") {
      const r = incidents.find((inc) => inc.id === incidentId);
      if (!r) throw new Error("not_found");
      if (r.incidentStatus === "new" && toStatus === "acknowledged") {
        return this.claimIncident(actorId, incidentId);
      }
      const role = roles.get(actorId)?.role || "resident";
      const isAssigned = (r.assignedResponderIds || []).includes(actorId);
      if (!isAssigned && role !== "reviewer" && role !== "admin") {
        throw new Error("forbidden");
      }
      r.incidentStatus = toStatus;
      r.updatedAt = new Date().toISOString();
      if (toStatus === "resolved") {
        r.resolvedAt = new Date().toISOString();
      }
      events.push({
        id: randomUUID(),
        reportId: incidentId,
        type: "status-change",
        fromStatus: r.incidentStatus,
        toStatus,
        actorId,
        actorRole: role,
        note,
        createdAt: new Date().toISOString(),
      });
      return { ok: true };
    },

    async verifyIncident(actorId, incidentId, verificationStatus) {
      const r = incidents.find((inc) => inc.id === incidentId);
      if (!r) throw new Error("not_found");
      const role = roles.get(actorId)?.role || "resident";
      const isAssigned = (r.assignedResponderIds || []).includes(actorId);
      if (!isAssigned && role !== "reviewer" && role !== "admin") {
        throw new Error("forbidden");
      }
      r.verificationStatus = verificationStatus;
      r.updatedAt = new Date().toISOString();
      events.push({
        id: randomUUID(),
        reportId: incidentId,
        type: "verification",
        fromStatus: r.verificationStatus,
        toStatus: verificationStatus,
        actorId,
        actorRole: role,
        note: "",
        createdAt: new Date().toISOString(),
      });
      return { ok: true };
    },

    // -------------------------------------------------------------------------
    // Advisories (Public Feed)
    // -------------------------------------------------------------------------
    async listPublicFeed({ limit = 6 } = {}) {
      const now = Date.now();
      return feed
        .filter((item) => item.published)
        .filter((item) => !item.expiresAt || Date.parse(item.expiresAt) > now)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .slice(0, limit);
    },

    async listOwnAdvisories(actorId, { limit = 20 } = {}) {
      return feed
        .filter((item) => item.createdBy === actorId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .slice(0, limit);
    },

    async createAdvisory(actorId, { summary, municipality = null, barangay = null }) {
      const item = {
        id: randomUUID(),
        kind: "advisory",
        summary,
        municipality: municipality || null,
        barangay: barangay || null,
        createdBy: actorId,
        source: "tabang",
        published: true,
        createdAt: new Date().toISOString(),
        expiresAt: null,
      };
      feed.push(item);
      return item;
    },

    async unpublishAdvisory(actorId, id) {
      const item = feed.find((e) => e.id === id);
      if (!item) return false;
      item.published = false;
      return true;
    },

    // -------------------------------------------------------------------------
    // Hotlines
    // -------------------------------------------------------------------------
    async listHotlines({ limit = 50 } = {}) {
      return hotlines.slice(0, limit);
    },

    async getHotlineReview(hotlineId, userId) {
      return hotlineReviews.get(`${hotlineId}:${userId}`) || null;
    },

    async upsertHotlineReview(userId, hotlineId, rating, comment = "") {
      hotlineReviews.set(`${hotlineId}:${userId}`, { rating, comment });
      return { ok: true };
    },

    // -------------------------------------------------------------------------
    // Applications
    // -------------------------------------------------------------------------
    async getMyApplication(userId) {
      return applications.get(userId) || null;
    },

    async submitApplication(actorId, appData) {
      const existing = applications.get(actorId);
      if (existing && ["pending", "approved"].includes(existing.status)) {
        throw new Error("invalid_transition");
      }
      applications.set(actorId, {
        applicantId: actorId,
        organization: appData.organization,
        badgeNumber: appData.badgeNumber,
        municipality: appData.municipality,
        identityDocumentPath: appData.identityDocumentPath,
        selfiePath: appData.selfiePath,
        consentVersion: appData.consentVersion,
        status: "pending",
        submittedAt: new Date().toISOString(),
        reviewNotes: "",
      });
      return { ok: true };
    },

    async listPendingApplications({ limit = 20 } = {}) {
      const list = [];
      for (const [id, app] of applications.entries()) {
        if (app.status === "pending") {
          const profile = profiles.get(id);
          list.push({
            id,
            applicantId: id,
            applicantName: profile?.displayName || "",
            applicantEmail: profile?.email || "",
            organization: app.organization,
            badgeNumber: app.badgeNumber,
            municipality: app.municipality,
            consentVersion: app.consentVersion,
            identityDocumentPath: app.identityDocumentPath,
            selfiePath: app.selfiePath,
            submittedAt: app.submittedAt,
          });
        }
      }
      return list.slice(0, limit);
    },

    async decideApplication(actorId, applicantId, approve, notes = "") {
      const app = applications.get(applicantId);
      if (!app) throw new Error("not_found");
      app.status = approve ? "approved" : "rejected";
      app.reviewedBy = actorId;
      app.reviewedAt = new Date().toISOString();
      app.reviewNotes = notes;
      if (approve) {
        roles.set(applicantId, { role: "responder", userId: applicantId });
      }
      return { ok: true };
    },

    // -------------------------------------------------------------------------
    // Partner API
    // -------------------------------------------------------------------------
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
      if (!client) return false;
      client.status = "revoked";
      return true;
    },

    async provision(scopes, name = "Test partner") {
      const { id, key, keyHash } = generateApiKey();
      await this.createApiClient({ id, name, scopes, keyHash });
      return { id, key };
    },
  };
}

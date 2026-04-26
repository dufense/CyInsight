import {
  tenants, tenantUsers, incidents, tickets, ticketComments,
  projects, tasks, reports, securityEvents,
  services, slaDefinitions, teamMembers, shiftRosters, documents,
  superadmins, licenses, ticketFeedback, ticketAttachments,
  securityIntegrations, assets, userAssets, reportSchedules,
  projectScope, projectActivities, projectRaci, projectRisks, activityLogs,
  ingestApiKeys, ingestBatches, aiInvestigations, eventDeadLetterQueue,
  aiAgentActivityLog, analystFeedback, cloudAppRiskAttributes, cloudAppRiskScores,
  dataRetentionPolicies, emailConfigurations, incidentNotifications,
  infrastructureLocations, riskScores, tenantSecurityTools,
  type Tenant, type InsertTenant,
  type TenantUser, type InsertTenantUser,
  type Incident, type InsertIncident,
  type Ticket, type InsertTicket,
  type TicketComment, type InsertTicketComment,
  type Project, type InsertProject,
  type Task, type InsertTask,
  type Report, type InsertReport,
  type SecurityEvent, type InsertSecurityEvent,
  type Service, type InsertService,
  type SlaDefinition, type InsertSlaDefinition,
  type TeamMember, type InsertTeamMember,
  type ShiftRoster, type InsertShiftRoster,
  type Document, type InsertDocument,
  type Superadmin, type InsertSuperadmin,
  type License, type InsertLicense,
  type TicketFeedback, type InsertTicketFeedback,
  type TicketAttachment, type InsertTicketAttachment,
  type SecurityIntegration, type InsertSecurityIntegration,
  type Asset, type InsertAsset,
  type UserAsset, type InsertUserAsset,
  type ReportSchedule, type InsertReportSchedule,
  type ProjectScope, type InsertProjectScope,
  type ProjectActivity, type InsertProjectActivity,
  type ProjectRaci, type InsertProjectRaci,
  type ProjectRisk, type InsertProjectRisk,
  type ActivityLog, type InsertActivityLog,
  type IngestApiKey, type InsertIngestApiKey,
  type IngestBatch, type InsertIngestBatch,
  type AiInvestigation, type InsertAiInvestigation,
  type EventDlqEntry, type InsertEventDlqEntry,
  orgStakeholders,
  type OrgStakeholder, type InsertOrgStakeholder,
  suppressionRules,
  type SuppressionRule, type InsertSuppressionRule,
  integrationAuditLog,
  type IntegrationAuditLog, type InsertIntegrationAuditLog,
  logSources, deviceFingerprints, sourceHealth,
  type LogSource, type InsertLogSource,
  type DeviceFingerprint, type InsertDeviceFingerprint,
  type SourceHealth, type InsertSourceHealth,
} from "@shared/schema";
import { db, pool } from "./db";
import { eq, desc, and, or, count, sql, gt, gte, lt, lte, inArray, isNull, isNotNull, getTableColumns } from "drizzle-orm";
import crypto from "crypto";
import { buildIntegrationGuardSql } from "./log-source-map";
import { formatChDateTime64, type IngestIncidentPayload } from "./clickhouse-client";

// Per-row EXISTS guards — enforce integration-aware filtering at query level.
// The guard checks whether each row's tenant currently has the connected
// integration that maps to that row's log_source / detection_source value,
// completely eliminating the multi-tenant union problem.
//
// IMPORTANT: These are functions (not consts) so that updates to
// LOG_SOURCE_TO_PLATFORM_KEY in log-source-map.ts are picked up without
// requiring a full server restart.
function eventIntegrationGuard() {
  return sql.raw(
    buildIntegrationGuardSql('"security_events"."tenant_id"', '"security_events"."log_source"'),
  );
}
function incidentIntegrationGuard() {
  return sql.raw(
    buildIntegrationGuardSql('"incidents"."tenant_id"', '"incidents"."detection_source"'),
  );
}

export function computeEventHash(data: Partial<InsertSecurityEvent>): string {
  const raw = data.rawPayload as any;
  const uniqueId =
    raw?._meta?.alertId ||
    raw?._meta?.eventId ||
    raw?._meta?.id ||
    raw?.alertId ||
    raw?.eventId ||
    raw?.id ||
    "";
  const parts = [
    String(data.tenantId || ""),
    data.logSource || "",
    data.eventType || "",
    data.threat || "",
    data.occurredAt ? new Date(data.occurredAt as any).toISOString() : "",
    data.attacker || "",
    data.target || "",
    data.asset || "",
    uniqueId,
  ].join("|");
  return crypto.createHash("sha256").update(parts).digest("hex");
}

export interface EventSearchParams {
  tenantIds: number[];
  eventType?: string;
  severity?: string | string[];
  pipelineStatus?: string;
  logSource?: string;
  threat?: string;
  attacker?: string;
  target?: string;
  country?: string;
  action?: string;
  mitreTactic?: string;
  mitreTechnique?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface EventSearchResult {
  events: SecurityEvent[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface EventPipelineStats {
  received: number;
  normalized: number;
  enriched: number;
  correlated: number;
  stored: number;
  total: number;
  dlqFailed: number;
  pending: number;
  byEventType: { eventType: string; count: number }[];
  bySeverity: { severity: string; count: number }[];
  byLogSource: { logSource: string; count: number }[];
}

export interface EventVolumePoint {
  timestamp: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
}

export interface IStorage {
  getTenants(): Promise<Tenant[]>;
  getTenant(id: number): Promise<Tenant | undefined>;
  getMSSPs(): Promise<Tenant[]>;
  getChildTenants(parentId: number): Promise<Tenant[]>;
  getMSSPWithChildren(msspId: number): Promise<{ mssp: Tenant; children: Tenant[] } | undefined>;
  createTenant(data: InsertTenant): Promise<Tenant>;

  getTenantUser(userId: string, tenantId: number): Promise<TenantUser | undefined>;
  getTenantUserByUserId(userId: string): Promise<TenantUser | undefined>;
  getAllTenantUsers(): Promise<TenantUser[]>;
  createTenantUser(data: InsertTenantUser): Promise<TenantUser>;

  getIncidents(tenantId: number): Promise<Incident[]>;
  getIncident(id: number): Promise<Incident | undefined>;
  getIncidentGuarded(id: number): Promise<Incident | undefined>;
  getIncidentsPaginated(tenantIds: number[], page: number, pageSize: number, filters?: { severity?: string | string[]; status?: string; classification?: string }): Promise<{ data: Incident[]; total: number }>;
  createIncident(data: InsertIncident): Promise<Incident>;
  updateIncident(id: number, data: Partial<InsertIncident>): Promise<Incident>;

  getTickets(tenantId: number): Promise<Ticket[]>;
  getTicket(id: number): Promise<Ticket | undefined>;
  createTicket(data: InsertTicket): Promise<Ticket>;
  updateTicket(id: number, data: Partial<InsertTicket>): Promise<Ticket>;

  getTicketComments(ticketId: number): Promise<TicketComment[]>;
  createTicketComment(data: InsertTicketComment): Promise<TicketComment>;

  getProjects(tenantId: number): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(data: InsertProject): Promise<Project>;
  updateProject(id: number, data: Partial<InsertProject>): Promise<Project>;

  getTasks(projectId: number): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(data: InsertTask): Promise<Task>;
  updateTask(id: number, data: Partial<InsertTask>): Promise<Task>;

  getReports(tenantId: number): Promise<Report[]>;
  getReport(id: number): Promise<Report | undefined>;
  createReport(data: InsertReport): Promise<Report>;
  updateReport(id: number, data: Partial<InsertReport>): Promise<Report>;
  deleteReport(id: number): Promise<void>;

  getSecurityEvents(tenantId: number, maxRows?: number): Promise<SecurityEvent[]>;
  getSecurityEventsByType(tenantId: number, eventType: string): Promise<SecurityEvent[]>;
  createSecurityEvent(data: InsertSecurityEvent): Promise<SecurityEvent>;
  createSecurityEvents(data: InsertSecurityEvent[]): Promise<SecurityEvent[]>;
  updateSecurityEvent(id: number, data: Partial<InsertSecurityEvent>): Promise<SecurityEvent>;
  searchSecurityEvents(params: EventSearchParams): Promise<EventSearchResult>;
  getEventPipelineStats(tenantId: number, tenantIds?: number[]): Promise<EventPipelineStats>;
  getEventPipelineCounters(tenantId: number, tenantIds?: number[]): Promise<{
    received: number; normalized: number; enriched: number;
    correlated: number; stored: number; total: number;
    dlqFailed: number; pending: number;
  }>;
  getEventVolumeTimeline(tenantId: number, tenantIds?: number[], interval?: string, dateFrom?: Date, dateTo?: Date): Promise<EventVolumePoint[]>;
  getSecurityEventById(id: number, tenantId: number): Promise<SecurityEvent | undefined>;

  getDashboardStats(tenantId: number): Promise<any>;
  getEnhancedDashboardStats(tenantId: number): Promise<any>;

  getServices(tenantId: number): Promise<Service[]>;
  getService(id: number): Promise<Service | undefined>;
  createService(data: InsertService): Promise<Service>;
  updateService(id: number, data: Partial<InsertService>): Promise<Service>;

  getSlaDefinitions(serviceId: number): Promise<SlaDefinition[]>;
  getSlaDefinition(id: number): Promise<SlaDefinition | undefined>;
  createSlaDefinition(data: InsertSlaDefinition): Promise<SlaDefinition>;
  updateSlaDefinition(id: number, data: Partial<InsertSlaDefinition>): Promise<SlaDefinition>;
  deleteSlaDefinition(id: number): Promise<void>;

  getTeamMembers(tenantId: number): Promise<TeamMember[]>;
  getTeamMembersByType(tenantId: number, teamType: string): Promise<TeamMember[]>;
  getTeamMember(id: number): Promise<TeamMember | undefined>;
  createTeamMember(data: InsertTeamMember): Promise<TeamMember>;
  updateTeamMember(id: number, data: Partial<InsertTeamMember>): Promise<TeamMember>;

  getShiftRosters(tenantId: number): Promise<ShiftRoster[]>;
  getShiftRostersByDate(tenantId: number, startDate: Date, endDate: Date): Promise<ShiftRoster[]>;
  createShiftRoster(data: InsertShiftRoster): Promise<ShiftRoster>;
  updateShiftRoster(id: number, data: Partial<InsertShiftRoster>): Promise<ShiftRoster>;
  deleteShiftRoster(id: number): Promise<void>;

  getDocuments(tenantId: number): Promise<Document[]>;
  getDocumentsByCategory(tenantId: number, category: string): Promise<Document[]>;
  getDocument(id: number): Promise<Document | undefined>;
  createDocument(data: InsertDocument): Promise<Document>;
  updateDocument(id: number, data: Partial<InsertDocument>): Promise<Document>;
  deleteDocument(id: number): Promise<void>;

  getSuperadminByUsername(username: string): Promise<Superadmin | undefined>;
  createSuperadmin(data: InsertSuperadmin): Promise<Superadmin>;
  updateSuperadminLastLogin(id: number): Promise<void>;
  updateSuperadminPassword(id: number, passwordHash: string): Promise<void>;

  getLicenses(): Promise<License[]>;
  getLicensesByTenant(tenantId: number): Promise<License[]>;
  getLicense(id: number): Promise<License | undefined>;
  createLicense(data: InsertLicense): Promise<License>;
  updateLicense(id: number, data: Partial<InsertLicense>): Promise<License>;
  deleteLicense(id: number): Promise<void>;

  updateTenant(id: number, data: Partial<InsertTenant>): Promise<Tenant>;
  deleteTenant(id: number): Promise<void>;
  getTenantUsersByTenant(tenantId: number): Promise<TenantUser[]>;
  updateTenantUser(id: number, data: Partial<InsertTenantUser>): Promise<TenantUser>;
  deleteTenantUser(id: number): Promise<void>;

  getTicketFeedback(ticketId: number): Promise<TicketFeedback[]>;
  getTicketFeedbackByUser(ticketId: number, userId: string): Promise<TicketFeedback | undefined>;
  createTicketFeedback(data: InsertTicketFeedback): Promise<TicketFeedback>;

  getTicketAttachments(ticketId: number): Promise<TicketAttachment[]>;
  createTicketAttachment(data: InsertTicketAttachment): Promise<TicketAttachment>;
  deleteTicketAttachment(id: number): Promise<void>;

  getSecurityIntegrations(tenantId: number): Promise<SecurityIntegration[]>;
  getAllSecurityIntegrations(): Promise<SecurityIntegration[]>;
  getDeletedSecurityIntegrations(tenantId: number): Promise<SecurityIntegration[]>;
  getSecurityIntegration(id: number): Promise<SecurityIntegration | undefined>;
  getDeletedSecurityIntegrationByPlatform(tenantId: number, platformKey: string): Promise<SecurityIntegration | undefined>;
  createSecurityIntegration(data: InsertSecurityIntegration): Promise<SecurityIntegration>;
  updateSecurityIntegration(id: number, data: Partial<SecurityIntegration>): Promise<SecurityIntegration>;
  updateAssetSyncStatus(id: number, status: string, message: string, syncedAt?: Date): Promise<void>;
  deleteSecurityIntegration(id: number): Promise<void>;
  restoreSecurityIntegration(id: number): Promise<SecurityIntegration>;
  logIntegrationAudit(data: InsertIntegrationAuditLog): Promise<void>;
  getIntegrationAuditLog(tenantId: number, integrationId?: number): Promise<IntegrationAuditLog[]>;

  getAssets(tenantId: number): Promise<Asset[]>;
  getAssetsLight(tenantId: number): Promise<any[]>;
  getAssetsSoftwareData(tenantId: number, limit?: number): Promise<any[]>;
  getAsset(id: number): Promise<Asset | undefined>;
  createAsset(data: InsertAsset): Promise<Asset>;
  createAssets(data: InsertAsset[]): Promise<Asset[]>;
  updateAsset(id: number, data: Partial<InsertAsset>): Promise<Asset>;
  getAssetsByHostnames(tenantId: number, hostnames: string[]): Promise<Asset[]>;
  getAssetsByHostnamesLight(tenantId: number, hostnames: string[]): Promise<any[]>;

  getUserAssets(tenantId: number): Promise<UserAsset[]>;
  getUserAsset(id: number): Promise<UserAsset | undefined>;
  getUserAssetByUsername(tenantId: number, userName: string): Promise<UserAsset | undefined>;
  createUserAsset(data: InsertUserAsset): Promise<UserAsset>;
  createUserAssets(data: InsertUserAsset[]): Promise<UserAsset[]>;
  updateUserAsset(id: number, data: Partial<InsertUserAsset>): Promise<UserAsset>;
  bulkUpdateUserAssets(updates: Array<{id: number, data: Partial<InsertUserAsset>}>): Promise<void>;
  deleteUserAsset(id: number): Promise<void>;

  getReportSchedules(tenantId: number): Promise<ReportSchedule[]>;
  getReportSchedule(id: number): Promise<ReportSchedule | undefined>;
  createReportSchedule(data: InsertReportSchedule): Promise<ReportSchedule>;
  updateReportSchedule(id: number, data: Partial<InsertReportSchedule>): Promise<ReportSchedule>;
  deleteReportSchedule(id: number): Promise<void>;
  getDueReportSchedules(): Promise<ReportSchedule[]>;

  getProjectScopes(projectId: number): Promise<ProjectScope[]>;
  createProjectScope(data: InsertProjectScope): Promise<ProjectScope>;
  updateProjectScope(id: number, data: Partial<InsertProjectScope>): Promise<ProjectScope>;
  deleteProjectScope(id: number): Promise<void>;

  getProjectActivities(projectId: number): Promise<ProjectActivity[]>;
  getProjectActivity(id: number): Promise<ProjectActivity | undefined>;
  createProjectActivity(data: InsertProjectActivity): Promise<ProjectActivity>;
  updateProjectActivity(id: number, data: Partial<InsertProjectActivity>): Promise<ProjectActivity>;
  deleteProjectActivity(id: number): Promise<void>;

  getProjectRaciByProject(projectId: number): Promise<ProjectRaci[]>;
  createProjectRaci(data: InsertProjectRaci): Promise<ProjectRaci>;
  deleteProjectRaci(id: number): Promise<void>;
  deleteProjectRaciByActivity(activityId: number, teamMemberId: number): Promise<void>;

  getProjectRisks(projectId: number): Promise<ProjectRisk[]>;
  createProjectRisk(data: InsertProjectRisk): Promise<ProjectRisk>;
  updateProjectRisk(id: number, data: Partial<InsertProjectRisk>): Promise<ProjectRisk>;
  deleteProjectRisk(id: number): Promise<void>;

  getActivityLogs(projectId: number): Promise<ActivityLog[]>;
  createActivityLog(data: InsertActivityLog): Promise<ActivityLog>;

  getIngestApiKeys(tenantId: number): Promise<IngestApiKey[]>;
  getIngestApiKey(id: number): Promise<IngestApiKey | undefined>;
  getIngestApiKeyByHash(keyHash: string): Promise<IngestApiKey | undefined>;
  createIngestApiKey(data: InsertIngestApiKey): Promise<IngestApiKey>;
  updateIngestApiKeyLastUsed(id: number): Promise<void>;
  deleteIngestApiKey(id: number): Promise<void>;

  getIngestBatches(tenantId: number): Promise<IngestBatch[]>;
  getIngestBatch(id: number): Promise<IngestBatch | undefined>;
  createIngestBatch(data: InsertIngestBatch): Promise<IngestBatch>;
  updateIngestBatch(id: number, data: Partial<InsertIngestBatch> & { completedAt?: Date }): Promise<IngestBatch>;
  claimIngestBatch(id: number, fromStatus: IngestBatch["status"], toStatus: IngestBatch["status"]): Promise<boolean>;

  getOrgStakeholders(tenantId: number, category?: string): Promise<OrgStakeholder[]>;
  getOrgStakeholder(id: number): Promise<OrgStakeholder | undefined>;
  createOrgStakeholder(data: InsertOrgStakeholder): Promise<OrgStakeholder>;
  updateOrgStakeholder(id: number, data: Partial<InsertOrgStakeholder>): Promise<OrgStakeholder>;
  deleteOrgStakeholder(id: number): Promise<void>;

  getSuppressionRules(tenantId: number): Promise<SuppressionRule[]>;
  createSuppressionRule(data: InsertSuppressionRule): Promise<SuppressionRule>;
  updateSuppressionRule(id: number, tenantId: number, data: Partial<InsertSuppressionRule>): Promise<SuppressionRule>;
  deleteSuppressionRule(id: number, tenantId: number): Promise<void>;

  getLogSources(tenantId: number): Promise<LogSource[]>;
  getLogSource(id: number, tenantId: number): Promise<LogSource | undefined>;
  createLogSource(data: InsertLogSource): Promise<LogSource>;
  updateLogSource(id: number, tenantId: number, data: Partial<InsertLogSource>): Promise<LogSource>;
  deleteLogSource(id: number, tenantId: number): Promise<void>;

  getDeviceFingerprint(tenantId: number, sourceIdentifier: string): Promise<DeviceFingerprint | undefined>;
  getDeviceFingerprintById(id: number): Promise<DeviceFingerprint | undefined>;
  createDeviceFingerprint(data: InsertDeviceFingerprint): Promise<DeviceFingerprint>;
  updateDeviceFingerprint(id: number, data: Partial<InsertDeviceFingerprint>): Promise<DeviceFingerprint>;

  getSourceHealth(sourceId: number, tenantId?: number): Promise<SourceHealth | undefined>;
  getSourceHealthByTenant(tenantId: number): Promise<SourceHealth[]>;
  upsertSourceHealth(sourceId: number, tenantId: number, data: Partial<InsertSourceHealth>): Promise<SourceHealth>;
  resolveTenantBySourceIp(ip: string): Promise<number | null>;
}

export class DatabaseStorage implements IStorage {
  async getTenants(): Promise<Tenant[]> {
    return db.select().from(tenants).orderBy(tenants.name);
  }

  async getTenant(id: number): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  async getMSSPs(): Promise<Tenant[]> {
    return db.select().from(tenants).where(eq(tenants.type, "mssp")).orderBy(tenants.name);
  }

  async getChildTenants(parentId: number): Promise<Tenant[]> {
    return db.select().from(tenants).where(eq(tenants.parentId, parentId)).orderBy(tenants.name);
  }

  async getMSSPWithChildren(msspId: number): Promise<{ mssp: Tenant; children: Tenant[] } | undefined> {
    const mssp = await this.getTenant(msspId);
    if (!mssp || mssp.type !== "mssp") return undefined;
    const children = await this.getChildTenants(msspId);
    return { mssp, children };
  }

  async createTenant(data: InsertTenant): Promise<Tenant> {
    const [tenant] = await db.insert(tenants).values(data).returning();
    return tenant;
  }

  async getTenantUser(userId: string, tenantId: number): Promise<TenantUser | undefined> {
    const [tu] = await db.select().from(tenantUsers)
      .where(and(eq(tenantUsers.userId, userId), eq(tenantUsers.tenantId, tenantId)));
    return tu;
  }

  async getTenantUserByUserId(userId: string): Promise<TenantUser | undefined> {
    const [tu] = await db.select().from(tenantUsers).where(eq(tenantUsers.userId, userId));
    return tu;
  }

  async getAllTenantUsers(): Promise<TenantUser[]> {
    return db.select().from(tenantUsers);
  }

  async createTenantUser(data: InsertTenantUser): Promise<TenantUser> {
    const [tu] = await db.insert(tenantUsers).values(data).returning();
    return tu;
  }

  async getIncidents(tenantId: number, includeNonSecurity = false, maxRows = 500): Promise<Incident[]> {
    if (!tenantId || isNaN(tenantId) || tenantId <= 0) return [];
    const conditions: any[] = [eq(incidents.tenantId, tenantId), incidentIntegrationGuard()];
    if (!includeNonSecurity) conditions.push(DatabaseStorage.nonSecurityFilter);
    return db.select().from(incidents)
      .where(and(...conditions))
      .orderBy(desc(incidents.createdAt))
      .limit(maxRows);
  }

  async getIncident(id: number): Promise<Incident | undefined> {
    const [inc] = await db.select().from(incidents).where(eq(incidents.id, id));
    return inc;
  }

  async getIncidentGuarded(id: number): Promise<Incident | undefined> {
    const [inc] = await db.select().from(incidents)
      .where(and(eq(incidents.id, id), incidentIntegrationGuard()));
    return inc;
  }

  async createIncident(data: InsertIncident): Promise<Incident> {
    const [inc] = await db.insert(incidents).values(data).returning();
    DatabaseStorage.chDualWriteIncidents([inc]);
    return inc;
  }

  // ── ClickHouse incidents mirroring ────────────────────────────────────────
  // Every storage-level create/update of an incident is streamed into the CH
  // `incidents_distributed` ReplacingMergeTree (keyed on tenant_id+id, version
  // = updated_at) so the MITRE coverage fast-path can count incidents (not
  // raw events) and stay numerically equivalent to the PostgreSQL path.
  // Failures on the live dual-write are non-fatal — PG remains authoritative,
  // and the periodic sweeper below catches anything missed (including writes
  // from raw-SQL paths that bypass storage entirely).
  //
  // Build the JSONEachRow payload for an array of Incident rows. Pure — no
  // I/O, no `any` casts. Used by both the live dual-write and the durable
  // sweep/backfill paths.
  private static toIncidentPayload(rows: Incident[]): IngestIncidentPayload[] {
    // ClickHouse self-hosted defaults to `date_time_input_format=basic`, which
    // only accepts `YYYY-MM-DD HH:MM:SS.sss` and rejects ISO-8601 `T`/`Z`.
    // We format explicitly to avoid Code: 27 JSONEachRow parse errors.
    const toChDateTime64 = (v: Date | string | null | undefined): string => {
      const d = v instanceof Date ? v
        : typeof v === "string" && v ? new Date(v)
        : new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const yyyy = d.getFullYear();
      const mm = pad(d.getMonth() + 1);
      const dd = pad(d.getDate());
      const hh = pad(d.getHours());
      const mi = pad(d.getMinutes());
      const ss = pad(d.getSeconds());
      const ms = String(d.getMilliseconds()).padStart(3, "0");
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}.${ms}`;
    };
    return rows
      .filter((r) => r && typeof r.id === "number" && typeof r.tenantId === "number")
      .map((r) => ({
        id:                  r.id,
        tenant_id:           r.tenantId,
        severity:            r.severity ? String(r.severity) : "",
        status:              r.status ? String(r.status) : "",
        source:              r.source ?? "",
        detection_source:    r.detectionSource ?? "",
        mitre_tactic:        r.mitreTactic ?? "",
        mitre_technique_id:  r.mitreTechniqueId ?? "",
        mitre_technique:     r.mitreTechnique ?? "",
        kill_chain_phase:    r.killChainPhase ?? "",
        confidence_score:    typeof r.confidenceScore === "number" ? r.confidenceScore : 0,
        classification:      r.classification ?? "",
        is_true_positive:    r.isTruePositive ? 1 : 0,
        created_at:          toChDateTime64(r.createdAt),
        updated_at:          toChDateTime64(r.updatedAt),
      }));
  }

  private static async getChClientForIncidents(): Promise<
    { insertIncidents: (rows: IngestIncidentPayload[]) => Promise<void> } | null
  > {
    try {
      const m = await import("./clickhouse-client");
      return m.getClickHouseClient();
    } catch { return null; }
  }

  // Live dual-write: fire-and-forget, non-fatal. Called from createIncident /
  // updateIncident on the hot path — we never want a CH outage to block a
  // storage call. Anything missed here will be picked up by the next sweep.
  static chDualWriteIncidents(rows: Incident[]): void {
    if (rows.length === 0) return;
    void DatabaseStorage.getChClientForIncidents().then(async (chClient) => {
      if (!chClient) return;
      const payload = DatabaseStorage.toIncidentPayload(rows);
      if (payload.length === 0) return;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await chClient.insertIncidents(payload);
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const transient =
            msg.includes("timeout") ||
            msg.includes("ECONNREFUSED") ||
            msg.includes("ECONNRESET") ||
            msg.includes("ETIMEDOUT") ||
            msg.includes("ENOTFOUND") ||
            /\b5\d\d\b/.test(msg);
          if (transient && attempt < 3) {
            const delay = 500 * attempt;
            console.warn(`[Storage] ClickHouse incident write error (attempt ${attempt}/3, retrying in ${delay}ms): ${msg}`);
            await new Promise((r) => setTimeout(r, delay));
          } else {
            console.warn(`[Storage] ClickHouse incident write error (non-fatal, giving up): ${msg}`);
            return;
          }
        }
      }
    });
  }

  // Awaitable variant: throws on insert failure. Used by the sweeper and
  // backfill so the cursor only advances after the rows are durably in CH.
  private static async chWriteIncidentsAwait(
    chClient: { insertIncidents: (rows: IngestIncidentPayload[]) => Promise<void> },
    rows: Incident[],
  ): Promise<void> {
    const payload = DatabaseStorage.toIncidentPayload(rows);
    if (payload.length === 0) return;
    await chClient.insertIncidents(payload);
  }

  // ── ClickHouse incidents one-time backfill ────────────────────────────────
  // Copies every existing PG incident into ClickHouse on startup so the MITRE
  // coverage fast-path has full historical coverage from the moment it goes
  // live, instead of slowly converging as new incidents arrive. Idempotent:
  // safe to re-run because the CH `incidents` table is a
  // ReplacingMergeTree(updated_at) keyed on (tenant_id, id) — re-emits
  // collapse to a single row. The backfill marks the sweeper's cursor on
  // completion so the periodic sweep takes over from the right point.
  private static incidentBackfillDone = false;
  private static incidentBackfillRunning = false;
  static isIncidentBackfillComplete(): boolean {
    return DatabaseStorage.incidentBackfillDone;
  }
  /**
   * True while a backfill walk is actively in flight (either the startup
   * retry loop or an operator-triggered re-run). Exposed so the admin
   * re-run endpoint can refuse to reset state out from under a concurrent
   * backfill — that would race the sweeper cursor anchoring at the end of
   * `backfillIncidentsToClickHouse`.
   */
  static isIncidentBackfillRunning(): boolean {
    return DatabaseStorage.incidentBackfillRunning;
  }
  /**
   * Operator-facing reset hook for the one-shot incident backfill. Clears
   * the in-process "done" guard so the next call to
   * `backfillIncidentsToClickHouse` re-walks PG and re-streams every row
   * into CH. Used by the admin re-run endpoint when an operator needs to
   * force a re-backfill (e.g. after a CH wipe/restore, schema rebuild, or
   * suspected drift). Idempotent on the CH side — the `incidents` table is
   * a ReplacingMergeTree(updated_at) keyed on (tenant_id, id), so re-emits
   * collapse to the latest version per row instead of duplicating.
   */
  static resetIncidentBackfillState(): void {
    DatabaseStorage.incidentBackfillDone = false;
  }
  static async backfillIncidentsToClickHouse(batchSize = 5000): Promise<number> {
    if (DatabaseStorage.incidentBackfillDone || DatabaseStorage.incidentBackfillRunning) return 0;
    DatabaseStorage.incidentBackfillRunning = true;
    let total = 0;
    try {
      const chClient = await DatabaseStorage.getChClientForIncidents();
      if (!chClient) {
        DatabaseStorage.incidentBackfillDone = true;
        return 0;
      }
      // Walk the table in (updated_at, id) order so a same-timestamp cluster
      // can never strand a row across a batch boundary.
      let lastUpdatedAt: Date | null = null;
      let lastId = 0;
      while (true) {
        const batch: Incident[] = lastUpdatedAt
          ? await db.select().from(incidents)
              .where(or(
                gt(incidents.updatedAt, lastUpdatedAt),
                and(eq(incidents.updatedAt, lastUpdatedAt), gt(incidents.id, lastId)),
              ))
              .orderBy(incidents.updatedAt, incidents.id)
              .limit(batchSize)
          : await db.select().from(incidents)
              .orderBy(incidents.updatedAt, incidents.id)
              .limit(batchSize);
        if (batch.length === 0) break;
        await DatabaseStorage.chWriteIncidentsAwait(chClient, batch);
        const tail: Incident = batch[batch.length - 1];
        const tailTs: Date = tail.updatedAt instanceof Date
          ? tail.updatedAt
          : new Date(tail.updatedAt as unknown as string | number);
        lastUpdatedAt = tailTs;
        lastId = tail.id;
        total += batch.length;
        if (batch.length < batchSize) break;
      }
      // Anchor the periodic sweeper just past the last backfilled row so it
      // doesn't re-ship the entire history on its first tick. If the table
      // was completely empty, anchor from the live DB MAX(updated_at, id)
      // instead of `now()` so any rows inserted concurrently with the
      // backfill scan still get caught by the next sweep tick.
      if (lastUpdatedAt) {
        DatabaseStorage.incidentSweepCursor = {
          ts: new Date(lastUpdatedAt.getTime()),
          id: lastId,
        };
      } else {
        const [maxRow] = await db.select({
          maxTs: sql<Date | null>`max(${incidents.updatedAt})`,
          maxId: sql<number | null>`max(${incidents.id})`,
        }).from(incidents);
        DatabaseStorage.incidentSweepCursor = {
          ts: maxRow?.maxTs ? new Date(maxRow.maxTs) : new Date(0),
          id: maxRow?.maxId ?? 0,
        };
      }
      DatabaseStorage.incidentBackfillDone = true;
      console.log(`[ClickHouse] Incident backfill complete: ${total} rows mirrored`);
      return total;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ClickHouse] Incident backfill error (will retry next startup): ${msg}`);
      return total;
    } finally {
      DatabaseStorage.incidentBackfillRunning = false;
    }
  }

  // ── ClickHouse incidents background sweeper ───────────────────────────────
  // Catches incidents written through any code path, including the legacy
  // raw-SQL paths in routes.ts and engines (Checkpoint email, UEBA
  // escalation, classification/triage/status/IOC updates, bulk updates) that
  // bypass storage.createIncident / storage.updateIncident. Polls PG for
  // rows whose (updated_at, id) tuple moved past the cursor, ships them to
  // CH, and only advances the cursor after the write succeeds, so a CH
  // outage never strands rows. Drains the full backlog each tick.
  private static incidentSweepCursor: { ts: Date; id: number } | null = null;
  private static incidentSweepRunning = false;
  static async sweepIncidentsToClickHouse(batchLimit = 1000): Promise<number> {
    if (DatabaseStorage.incidentSweepRunning) return 0;
    DatabaseStorage.incidentSweepRunning = true;
    let totalShipped = 0;
    try {
      const chClient = await DatabaseStorage.getChClientForIncidents();
      if (!chClient) return 0;

      // The sweeper depends on the backfill having succeeded — the backfill
      // is what anchors the cursor to the tail of the historical set. If the
      // cursor is still null (backfill never ran or failed), we MUST NOT
      // anchor it to "now" here, because doing so would skip all historical
      // incidents forever (until a successful restart). Instead, no-op and
      // let the bootstrap loop retry the backfill.
      if (!DatabaseStorage.incidentSweepCursor) return 0;

      // Drain loop: keep shipping batches until we get a short batch (no more
      // backlog). Cursor advances only after each batch is durably in CH.
      while (true) {
        const cursor: { ts: Date; id: number } = DatabaseStorage.incidentSweepCursor;
        const batch: Incident[] = await db.select().from(incidents)
          .where(or(
            gt(incidents.updatedAt, cursor.ts),
            and(eq(incidents.updatedAt, cursor.ts), gt(incidents.id, cursor.id)),
          ))
          .orderBy(incidents.updatedAt, incidents.id)
          .limit(batchLimit);
        if (batch.length === 0) break;
        try {
          await DatabaseStorage.chWriteIncidentsAwait(chClient, batch);
        } catch (err) {
          // Don't advance the cursor — next tick will retry the same window.
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[ClickHouse] Incident sweep insert failed (cursor held): ${msg}`);
          break;
        }
        const tail: Incident = batch[batch.length - 1];
        const tailTs: Date = tail.updatedAt instanceof Date
          ? tail.updatedAt
          : new Date(tail.updatedAt as unknown as string | number);
        DatabaseStorage.incidentSweepCursor = { ts: tailTs, id: tail.id };
        totalShipped += batch.length;
        if (batch.length < batchLimit) break;
      }
      return totalShipped;
    } finally {
      DatabaseStorage.incidentSweepRunning = false;
    }
  }

  // ── ClickHouse security_events background sweeper ─────────────────────────
  // Catches security_events written through any code path that bypasses the
  // live chDualWrite() (raw SQL inserts, CH outages during dual-write).  Walks
  // PG in id order, queries CH for existing event_ids, and inserts only the
  // missing rows.  Cursor advances only after each batch is durably in CH.
  private static securityEventSweepCursor: number | null = null;
  private static securityEventSweepRunning = false;
  static async sweepSecurityEventsToClickHouse(batchLimit = 1000): Promise<number> {
    if (DatabaseStorage.securityEventSweepRunning) return 0;
    DatabaseStorage.securityEventSweepRunning = true;
    let totalShipped = 0;
    try {
      const m = await import("./clickhouse-client");
      const chClient = m.getClickHouseClient();
      if (!chClient) return 0;

      // Anchor cursor on first run to the current max id so we don't re-ship
      // the entire history (live dual-write already handled historical rows).
      if (DatabaseStorage.securityEventSweepCursor === null) {
        const [maxRow] = await db.select({ maxId: sql<number | null>`max(${securityEvents.id})` }).from(securityEvents);
        DatabaseStorage.securityEventSweepCursor = maxRow?.maxId ?? 0;
      }

      const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
      const IPV6_RE = /^[0-9a-fA-F:]+$/;
      const validIp = (v: string | null | undefined) =>
        v && (IPV4_RE.test(v) || IPV6_RE.test(v)) ? v : undefined;

      while (true) {
        const cursor = DatabaseStorage.securityEventSweepCursor;
        const batch: SecurityEvent[] = await db.select().from(securityEvents)
          .where(gt(securityEvents.id, cursor))
          .orderBy(securityEvents.id)
          .limit(batchLimit);
        if (batch.length === 0) break;

        // Build payload using the same mapping as chDualWrite().
        const payload = batch.map((ev) => ({
          event_id:        ev.eventHash ?? String(ev.id),
          tenant_id:       ev.tenantId,
          event_type:      ev.eventType,
          source_type:     ev.sourceType ?? "",
          log_source:      ev.logSource ?? "",
          severity:        ev.severity,
          host:            ev.asset ?? "",
          src_ip:          validIp(ev.attacker),
          dst_ip:          validIp(ev.target),
          target:          ev.target ?? "",
          user_name:       ev.attacker && !validIp(ev.attacker) ? ev.attacker : "",
          mitre_tactic:    ev.mitreTactic ?? "",
          mitre_technique: ev.mitreTechnique ?? "",
          raw_event:       ev.rawPayload ? JSON.stringify(ev.rawPayload) : "",
          ingested_at:     formatChDateTime64(ev.occurredAt),
          threat:          ev.threat ?? "",
          action:          ev.action ?? "",
          recipient:       ev.recipient ?? "",
          description:     (ev.description ?? "").slice(0, 1000),
        }));

        // Query CH for existing event_ids in this batch.
        const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        const eventIdList = payload.map((p) => `'${esc(String(p.event_id))}'`).join(",");
        const database = process.env.CLICKHOUSE_DATABASE ?? "ccc";
        const existenceSql = `SELECT event_id FROM ${database}.security_events WHERE event_id IN (${eventIdList}) FORMAT JSONEachRow`;

        let existingIds: Set<string>;
        try {
          const raw = await chClient.exec(existenceSql);
          const rows = raw
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line: string) => JSON.parse(line) as { event_id: string });
          existingIds = new Set(rows.map((r) => r.event_id));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[ClickHouse] Security event sweep existence check failed (cursor held): ${msg}`);
          break;
        }

        const missing = payload.filter((p) => !existingIds.has(p.event_id));
        if (missing.length > 0) {
          try {
            await chClient.insertEvents(missing as any);
            totalShipped += missing.length;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[ClickHouse] Security event sweep insert failed (cursor held): ${msg}`);
            break;
          }
        }

        const tail = batch[batch.length - 1];
        DatabaseStorage.securityEventSweepCursor = tail.id;
        if (batch.length < batchLimit) break;
      }
      if (totalShipped > 0) {
        console.log(`[ClickHouse] Security event sweep shipped ${totalShipped} missing rows`);
      }
      return totalShipped;
    } finally {
      DatabaseStorage.securityEventSweepRunning = false;
    }
  }

  // ── ClickHouse security_events.target one-time backfill ──────────────────
  // The CH `target` column was added by the Task #202 ALTER migration, so
  // every event ingested *before* that migration has target='' in CH even
  // though the PG row carries a real hostname/FQDN. The threat-globe
  // fast-path uses target to match offices via hostname keywords / CIDR, so
  // any lookback window crossing the migration boundary lost office accuracy
  // for older events. This backfill walks PG security_events with non-empty
  // target and issues batched ALTER TABLE ... UPDATE statements against the
  // CH base table to populate `target` in place.
  //
  // Idempotent by construction: every UPDATE carries a `target = ''` guard
  // so already-populated rows (including those written by chDualWrite after
  // the migration) are never touched. Re-running the backfill on a fully
  // patched dataset is a no-op. Safe to invoke on every startup.
  private static eventTargetBackfillDone = false;
  private static eventTargetBackfillRunning = false;
  static isEventTargetBackfillComplete(): boolean {
    return DatabaseStorage.eventTargetBackfillDone;
  }
  static async backfillSecurityEventTargetsToClickHouse(
    batchSize = 1000,
  ): Promise<number> {
    if (DatabaseStorage.eventTargetBackfillDone || DatabaseStorage.eventTargetBackfillRunning) return 0;
    DatabaseStorage.eventTargetBackfillRunning = true;
    let totalProcessed = 0;
    try {
      const m = await import("./clickhouse-client");
      const chClient = m.getClickHouseClient();
      if (!chClient) {
        DatabaseStorage.eventTargetBackfillDone = true;
        return 0;
      }
      const database = process.env.CLICKHOUSE_DATABASE ?? "ccc";
      // Use the cluster flag set during schema init (clickhouse-client.ts).
      // This avoids the false-positive where _migrations exists because the
      // threat-flow backfill created it on a single-node deployment.
      const useCluster = m.clickHouseUsesCluster?.() ?? false;
      const onClusterClause = useCluster ? " ON CLUSTER ccc_cluster" : "";

      const escSql = (s: string) =>
        s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

      // Walk PG ordered by id. Only consider rows that have a real target
      // string AND a key the CH row was written under (event_hash if
      // present, otherwise id::text — see chDualWrite which uses
      // `ev.eventHash ?? String(ev.id)` as event_id).
      //
      // Tenant scoping is critical: event_hash collisions across tenants
      // are possible (different tenants can produce identical hashes for
      // structurally identical events), and the CH `event_id` column is
      // not globally unique. Mutating without a tenant_id predicate could
      // overwrite the wrong tenant's row. We group every batch by
      // tenant_id and emit one ALTER ... UPDATE per tenant scoped by
      // `tenant_id = X AND event_id IN (...) AND target = ''`.
      let lastId = 0;
      while (true) {
        const res = await pool.query<{
          id: number;
          tenant_id: number;
          event_hash: string | null;
          target: string;
        }>(
          `SELECT id, tenant_id, event_hash, target
             FROM security_events
            WHERE id > $1
              AND target IS NOT NULL
              AND target <> ''
            ORDER BY id
            LIMIT $2`,
          [lastId, batchSize],
        );
        const rows = res.rows;
        if (rows.length === 0) break;
        lastId = rows[rows.length - 1].id;

        // Group by tenant_id and dedupe on key within each tenant. When a
        // tenant has two rows sharing the same key with different targets
        // (extremely rare; should not happen because event_hash is unique
        // per tenant via the PG index, but we still defend against it),
        // we keep the row with the higher PG id — i.e. the most recently
        // ingested value — so the mutation is deterministic.
        const byTenant = new Map<number, Map<string, { id: number; target: string }>>();
        for (const r of rows) {
          if (!Number.isFinite(r.tenant_id)) continue;
          const key = r.event_hash && r.event_hash.length > 0 ? r.event_hash : String(r.id);
          if (!key || !r.target) continue;
          let bucket = byTenant.get(r.tenant_id);
          if (!bucket) {
            bucket = new Map();
            byTenant.set(r.tenant_id, bucket);
          }
          const existing = bucket.get(key);
          if (!existing || r.id > existing.id) {
            bucket.set(key, { id: r.id, target: r.target });
          }
        }

        let batchProcessed = 0;
        let batchFailed = false;
        for (const [tenantId, bucket] of Array.from(byTenant.entries())) {
          if (bucket.size === 0) continue;
          const entries = Array.from(bucket.entries());
          const idList = entries.map(([k]) => `'${escSql(k)}'`).join(",");
          const targetList = entries.map(([, v]) => `'${escSql(v.target)}'`).join(",");
          const safeTenantId = Math.floor(tenantId);

          // ALTER ... UPDATE on Distributed tables isn't supported in CH —
          // we mutate the local `security_events` MergeTree directly. The
          // transform() builds a per-event_id lookup; the WHERE clause
          // restricts to (tenant_id, event_id) pairs that still have
          // target='' so the mutation is bounded, tenant-scoped, and
          // idempotent. The leading tenant_id predicate also matches the
          // table's ORDER BY (tenant_id, ..., event_id), keeping the
          // mutation cheap.
          const buildSql = (withCluster: boolean) =>
            `ALTER TABLE ${database}.security_events${withCluster ? onClusterClause : ""} ` +
            `UPDATE target = transform(event_id, [${idList}], [${targetList}], target) ` +
            `WHERE tenant_id = ${safeTenantId} AND event_id IN (${idList}) AND target = ''`;

          try {
            await chClient.exec(buildSql(true));
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (useCluster && /cluster|distributed|on cluster/i.test(msg)) {
              try {
                await chClient.exec(buildSql(false));
              } catch (err2) {
                const msg2 = err2 instanceof Error ? err2.message : String(err2);
                console.warn(`[ClickHouse] target backfill batch failed (tenant=${safeTenantId}, will retry next startup): ${msg2.slice(0, 256)}`);
                batchFailed = true;
                break;
              }
            } else {
              console.warn(`[ClickHouse] target backfill batch failed (tenant=${safeTenantId}, will retry next startup): ${msg.slice(0, 256)}`);
              batchFailed = true;
              break;
            }
          }
          batchProcessed += bucket.size;
        }
        totalProcessed += batchProcessed;
        if (batchFailed) return totalProcessed;
        if (rows.length < batchSize) break;
      }
      DatabaseStorage.eventTargetBackfillDone = true;
      console.log(`[ClickHouse] security_events.target backfill complete: ${totalProcessed} rows queued for in-place mutation`);
      return totalProcessed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ClickHouse] target backfill error (will retry next startup): ${msg}`);
      return totalProcessed;
    } finally {
      DatabaseStorage.eventTargetBackfillRunning = false;
    }
  }

  async getExistingDedupHashes(tenantId: number): Promise<Set<string>> {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const rows = await db.select({ dedupHash: incidents.dedupHash })
      .from(incidents)
      .where(and(eq(incidents.tenantId, tenantId), sql`${incidents.dedupHash} IS NOT NULL`, gte(incidents.createdAt, cutoff)))
      .limit(10000);
    return new Set(rows.map(r => r.dedupHash!).filter(Boolean));
  }

  async updateIncident(id: number, data: Partial<InsertIncident>): Promise<Incident> {
    const [inc] = await db.update(incidents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(incidents.id, id))
      .returning();
    if (inc) DatabaseStorage.chDualWriteIncidents([inc]);
    return inc;
  }

  async getTickets(tenantId: number, maxRows = 500): Promise<Ticket[]> {
    return db.select().from(tickets)
      .where(eq(tickets.tenantId, tenantId))
      .orderBy(desc(tickets.createdAt))
      .limit(maxRows);
  }

  async getTicket(id: number): Promise<Ticket | undefined> {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id));
    return ticket;
  }

  async createTicket(data: InsertTicket): Promise<Ticket> {
    const [ticket] = await db.insert(tickets).values(data).returning();
    return ticket;
  }

  async updateTicket(id: number, data: Partial<InsertTicket>): Promise<Ticket> {
    const [ticket] = await db.update(tickets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tickets.id, id))
      .returning();
    return ticket;
  }

  async getTicketComments(ticketId: number): Promise<TicketComment[]> {
    return db.select().from(ticketComments)
      .where(eq(ticketComments.ticketId, ticketId))
      .orderBy(ticketComments.createdAt);
  }

  async createTicketComment(data: InsertTicketComment): Promise<TicketComment> {
    const [comment] = await db.insert(ticketComments).values(data).returning();
    return comment;
  }

  async getProjects(tenantId: number): Promise<Project[]> {
    return db.select().from(projects)
      .where(eq(projects.tenantId, tenantId))
      .orderBy(desc(projects.createdAt));
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(data: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values(data).returning();
    return project;
  }

  async updateProject(id: number, data: Partial<InsertProject>): Promise<Project> {
    const [project] = await db.update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return project;
  }

  async getTasks(projectId: number): Promise<Task[]> {
    return db.select().from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(tasks.createdAt);
  }

  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task;
  }

  async createTask(data: InsertTask): Promise<Task> {
    const [task] = await db.insert(tasks).values(data).returning();
    return task;
  }

  async updateTask(id: number, data: Partial<InsertTask>): Promise<Task> {
    const [task] = await db.update(tasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return task;
  }

  async getReports(tenantId: number): Promise<Report[]> {
    return db.select().from(reports)
      .where(eq(reports.tenantId, tenantId))
      .orderBy(desc(reports.createdAt));
  }

  async getReport(id: number): Promise<Report | undefined> {
    const [report] = await db.select().from(reports).where(eq(reports.id, id));
    return report;
  }

  async createReport(data: InsertReport): Promise<Report> {
    const [report] = await db.insert(reports).values(data).returning();
    return report;
  }

  async updateReport(id: number, data: Partial<InsertReport>): Promise<Report> {
    const [report] = await db.update(reports)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reports.id, id))
      .returning();
    return report;
  }

  async deleteReport(id: number): Promise<void> {
    await db.delete(reports).where(eq(reports.id, id));
  }

  async getSecurityEvents(tenantId: number, maxRows = 1000): Promise<SecurityEvent[]> {
    if (!tenantId || isNaN(tenantId) || tenantId <= 0) return [];
    return db.select().from(securityEvents)
      .where(and(
        eq(securityEvents.tenantId, tenantId),
        eventIntegrationGuard(),
      ))
      .orderBy(desc(securityEvents.occurredAt))
      .limit(maxRows);
  }

  async getSecurityEventsByType(tenantId: number, eventType: string, maxRows = 1000): Promise<SecurityEvent[]> {
    return db.select().from(securityEvents)
      .where(and(
        eq(securityEvents.tenantId, tenantId),
        eq(securityEvents.eventType, eventType as any),
        eventIntegrationGuard(),
      ))
      .orderBy(desc(securityEvents.occurredAt))
      .limit(maxRows);
  }

  // ── ClickHouse dual-write helper ──────────────────────────────────────────
  // Called after each successful PG insert so every storage path automatically
  // mirrors events to the hot tier without per-route wiring.
  private async chDualWrite(events: SecurityEvent[]): Promise<void> {
    if (events.length === 0) return;
    let chClient: { insertEvents: (rows: unknown[]) => Promise<void> } | null = null;
    try {
      const m = await import("./clickhouse-client") as {
        getClickHouseClient: () => { insertEvents: (rows: unknown[]) => Promise<void> } | null;
      };
      chClient = m.getClickHouseClient();
    } catch { return; }
    if (!chClient) return;

    const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
    const IPV6_RE = /^[0-9a-fA-F:]+$/;
    const validIp = (v: string | null | undefined) =>
      v && (IPV4_RE.test(v) || IPV6_RE.test(v)) ? v : undefined;

    const payload = events.map((ev) => ({
      event_id:        ev.eventHash ?? String(ev.id),
      tenant_id:       ev.tenantId,
      event_type:      ev.eventType,
      source_type:     ev.sourceType ?? "",
      // log_source carries the product-name identifier (e.g. "Cynet 360") used
      // by the integration-awareness guard. The CH read path enforces the same
      // guard against log_source, so PG and CH visibility stay in parity.
      log_source:      ev.logSource ?? "",
      severity:        ev.severity,
      host:            ev.asset ?? "",
      src_ip:          validIp(ev.attacker),
      dst_ip:          validIp(ev.target),
      // Mirror the raw target string (hostname or IP) so the threat-globe
      // fast-path can match offices the same way the PG path does. Without
      // this, multi-office tenants saw all CH-path arcs collapse to the
      // tenant's default office because dst_ip is empty for hostname targets.
      target:          ev.target ?? "",
      user_name:       ev.attacker && !validIp(ev.attacker) ? ev.attacker : "",
      mitre_tactic:    ev.mitreTactic ?? "",
      mitre_technique: ev.mitreTechnique ?? "",
      raw_event:       ev.rawPayload ? JSON.stringify(ev.rawPayload) : "",
      ingested_at:     formatChDateTime64(ev.occurredAt),
      // Task #203: mirror the PG security_events columns the threat-flow Sankey
      // depends on so the CH fast-path produces the same level of detail
      // (per-threat names, per-action labels, per-recipient grouping for email).
      threat:          ev.threat ?? "",
      action:          ev.action ?? "",
      recipient:       ev.recipient ?? "",
      // Trim long descriptions — the PG fast-path already LEFT(TRIM(description),200)s
      // the column for the Sankey, so capping here keeps payload size bounded.
      description:     (ev.description ?? "").slice(0, 1000),
    }));
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await chClient.insertEvents(payload);
        return;
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : String(err);
        const transient =
          msg.includes("timeout") ||
          msg.includes("ECONNREFUSED") ||
          msg.includes("ECONNRESET") ||
          msg.includes("ETIMEDOUT") ||
          msg.includes("ENOTFOUND") ||
          /\b5\d\d\b/.test(msg);
        if (transient && attempt < 3) {
          const delay = 500 * attempt;
          console.warn(`[Storage] ClickHouse write error (attempt ${attempt}/3, retrying in ${delay}ms): ${msg}`);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          console.warn(`[Storage] ClickHouse write error (non-fatal, giving up): ${msg}`);
          return;
        }
      }
    }
  }

  async createSecurityEvent(data: InsertSecurityEvent): Promise<SecurityEvent> {
    const hash = computeEventHash(data);
    const dataWithHash = { ...data, eventHash: hash };
    const result = await pool.query(
      `INSERT INTO security_events (tenant_id, event_type, severity, threat, target, attacker, asset, app, description, threat_vector, mitre_tactic, mitre_technique, action, source_type, log_source, sender, recipient, protocol, country, risk_score, raw_payload, pipeline_status, batch_id, normalized_at, enriched_at, correlated_at, stored_at, sigma_matches, event_hash, occurred_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
       ON CONFLICT (event_hash) WHERE event_hash IS NOT NULL DO NOTHING
       RETURNING *`,
      [
        dataWithHash.tenantId, dataWithHash.eventType, dataWithHash.severity || 'medium',
        dataWithHash.threat || null, dataWithHash.target || null, dataWithHash.attacker || null,
        dataWithHash.asset || null, dataWithHash.app || null, dataWithHash.description || null,
        dataWithHash.threatVector || null, dataWithHash.mitreTactic || null, dataWithHash.mitreTechnique || null,
        dataWithHash.action || null, dataWithHash.sourceType || null, dataWithHash.logSource || null,
        dataWithHash.sender || null, dataWithHash.recipient || null, dataWithHash.protocol || null,
        dataWithHash.country || null, dataWithHash.riskScore || null,
        dataWithHash.rawPayload ? JSON.stringify(dataWithHash.rawPayload) : '{}',
        dataWithHash.pipelineStatus || 'received', dataWithHash.batchId || null,
        dataWithHash.normalizedAt || null, dataWithHash.enrichedAt || null,
        dataWithHash.correlatedAt || null, dataWithHash.storedAt || null,
        dataWithHash.sigmaMatches ? JSON.stringify(dataWithHash.sigmaMatches) : null,
        hash, dataWithHash.occurredAt || new Date(), new Date(),
      ]
    );
    if (result.rows.length > 0) {
      this.chDualWrite([result.rows[0] as SecurityEvent]);
      return result.rows[0] as SecurityEvent;
    }
    const existing = await pool.query(
      `SELECT * FROM security_events WHERE event_hash = $1 LIMIT 1`, [hash]
    );
    return existing.rows[0] as SecurityEvent;
  }

  async createSecurityEvents(data: InsertSecurityEvent[]): Promise<SecurityEvent[]> {
    if (data.length === 0) return [];

    // Batch INSERT: one DB round-trip per 500 events (32 cols × 500 = 16 000 params, well within PG limit)
    const CHUNK = 500;
    const allStored: SecurityEvent[] = [];

    const buildRow = (d: InsertSecurityEvent, hash: string, base: number): [string, any[]] => {
      const params = [
        d.tenantId, d.eventType, d.severity || "medium",
        d.threat ?? null, d.target ?? null, d.attacker ?? null,
        d.asset ?? null, d.app ?? null, d.description ?? null,
        d.threatVector ?? null, d.mitreTactic ?? null, d.mitreTechnique ?? null,
        d.action ?? null, d.sourceType ?? null, d.logSource ?? null,
        d.sender ?? null, d.recipient ?? null, d.protocol ?? null,
        d.country ?? null, d.riskScore ?? null,
        d.rawPayload ? JSON.stringify(d.rawPayload) : "{}",
        d.pipelineStatus || "received", d.batchId ?? null,
        d.normalizedAt ?? null, d.enrichedAt ?? null,
        d.correlatedAt ?? null, d.storedAt ?? null,
        d.sigmaMatches ? JSON.stringify(d.sigmaMatches) : null,
        hash, d.occurredAt || new Date(), new Date(),
        d.enrichedDescription ?? null,
      ];
      const cols = params.length; // 32
      const ph = Array.from({ length: cols }, (_, j) => `$${base + j + 1}`).join(",");
      return [`(${ph})`, params];
    };

    const INSERT_COLS = `tenant_id, event_type, severity, threat, target, attacker, asset, app,
           description, threat_vector, mitre_tactic, mitre_technique, action, source_type,
           log_source, sender, recipient, protocol, country, risk_score, raw_payload,
           pipeline_status, batch_id, normalized_at, enriched_at, correlated_at, stored_at,
           sigma_matches, event_hash, occurred_at, created_at, enriched_description`;

    for (let start = 0; start < data.length; start += CHUNK) {
      const chunk = data.slice(start, start + CHUNK);
      const hashes = chunk.map(computeEventHash);
      const allParams: any[] = [];
      const placeholders: string[] = [];

      for (let i = 0; i < chunk.length; i++) {
        const [ph, rowParams] = buildRow(chunk[i], hashes[i], allParams.length);
        placeholders.push(ph);
        allParams.push(...rowParams);
      }

      try {
        const result = await pool.query(
          `INSERT INTO security_events (${INSERT_COLS})
           VALUES ${placeholders.join(",")}
           ON CONFLICT (event_hash) WHERE event_hash IS NOT NULL DO NOTHING
           RETURNING *`,
          allParams
        );
        allStored.push(...(result.rows as SecurityEvent[]));
      } catch (batchErr: any) {
        console.error(
          `[Storage] Batch insert failed (${chunk.length} events) — falling back to serial: ${batchErr.message}`
        );
        // Fallback: individual inserts so we lose as few events as possible
        for (let i = 0; i < chunk.length; i++) {
          const [ph, rowParams] = buildRow(chunk[i], hashes[i], 0);
          // ph is "(${base+1},...)" with base=0, meaning $1…$32
          try {
            const result = await pool.query(
              `INSERT INTO security_events (${INSERT_COLS})
               VALUES ${ph}
               ON CONFLICT (event_hash) WHERE event_hash IS NOT NULL DO NOTHING
               RETURNING *`,
              rowParams
            );
            if (result.rows.length > 0) allStored.push(result.rows[0] as SecurityEvent);
          } catch (err: any) {
            console.error(
              `[Storage] Event insert failed: ${err.message} — eventType=${chunk[i].eventType}, logSource=${chunk[i].logSource}`
            );
          }
        }
      }
    }

    this.chDualWrite(allStored);
    return allStored;
  }

  async updateSecurityEvent(id: number, data: Partial<InsertSecurityEvent>): Promise<SecurityEvent> {
    const [event] = await db.update(securityEvents).set(data).where(eq(securityEvents.id, id)).returning();
    return event;
  }

  async getSecurityEventById(id: number, tenantId: number): Promise<SecurityEvent | undefined> {
    const [event] = await db.select().from(securityEvents)
      .where(and(eq(securityEvents.id, id), eq(securityEvents.tenantId, tenantId), eventIntegrationGuard()));
    return event;
  }

  async searchSecurityEvents(params: EventSearchParams): Promise<EventSearchResult> {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(200, Math.max(1, params.pageSize || 50));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (params.tenantIds.length === 1) {
      conditions.push(`tenant_id = $${paramIdx++}`);
      values.push(params.tenantIds[0]);
    } else if (params.tenantIds.length > 1) {
      conditions.push(`tenant_id = ANY($${paramIdx++})`);
      values.push(params.tenantIds);
    }

    // Per-row integration guard: only surface events whose log_source maps to
    // a connected integration for that specific row's tenant.
    conditions.push(buildIntegrationGuardSql("security_events.tenant_id", "security_events.log_source"));

    if (params.eventType) {
      if (params.eventType.includes(",")) {
        const types = params.eventType.split(",").map(t => t.trim()).filter(Boolean);
        conditions.push(`event_type::text = ANY($${paramIdx++}::text[])`);
        values.push(types);
      } else {
        conditions.push(`event_type = $${paramIdx++}`);
        values.push(params.eventType);
      }
    }
    if (params.severity) {
      if (Array.isArray(params.severity)) {
        conditions.push(`severity = ANY($${paramIdx++})`);
        values.push(params.severity);
      } else {
        conditions.push(`severity = $${paramIdx++}`);
        values.push(params.severity);
      }
    }
    if (params.pipelineStatus) {
      conditions.push(`pipeline_status = $${paramIdx++}`);
      values.push(params.pipelineStatus);
    }
    if (params.logSource) {
      conditions.push(`log_source = $${paramIdx++}`);
      values.push(params.logSource);
    }
    if (params.threat) {
      conditions.push(`threat ILIKE $${paramIdx++}`);
      values.push(`%${params.threat}%`);
    }
    if (params.attacker) {
      conditions.push(`attacker ILIKE $${paramIdx++}`);
      values.push(`%${params.attacker}%`);
    }
    if (params.target) {
      conditions.push(`target ILIKE $${paramIdx++}`);
      values.push(`%${params.target}%`);
    }
    if (params.country) {
      conditions.push(`country = $${paramIdx++}`);
      values.push(params.country);
    }
    if (params.action) {
      conditions.push(`action = $${paramIdx++}`);
      values.push(params.action);
    }
    if (params.mitreTactic) {
      conditions.push(`mitre_tactic ILIKE $${paramIdx++}`);
      values.push(`%${params.mitreTactic}%`);
    }
    if (params.mitreTechnique) {
      conditions.push(`mitre_technique ILIKE $${paramIdx++}`);
      values.push(`%${params.mitreTechnique}%`);
    }
    if (params.dateFrom) {
      conditions.push(`occurred_at >= $${paramIdx++}`);
      values.push(params.dateFrom);
    }
    if (params.dateTo) {
      conditions.push(`occurred_at <= $${paramIdx++}`);
      values.push(params.dateTo);
    }
    if (params.search) {
      conditions.push(`(threat ILIKE $${paramIdx} OR target ILIKE $${paramIdx} OR attacker ILIKE $${paramIdx} OR description ILIKE $${paramIdx})`);
      values.push(`%${params.search}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const allowedSortColumns: Record<string, string> = {
      occurredAt: "occurred_at", createdAt: "created_at", severity: "severity",
      eventType: "event_type", threat: "threat", target: "target", attacker: "attacker",
      logSource: "log_source", riskScore: "risk_score", pipelineStatus: "pipeline_status",
    };
    const sortCol = allowedSortColumns[params.sortBy || "occurredAt"] || "occurred_at";
    const sortDir = params.sortOrder === "asc" ? "ASC" : "DESC";

    const countQuery = `SELECT COUNT(*) as total FROM security_events ${whereClause}`;
    const countResult = await pool.query(countQuery, values);
    const totalCount = parseInt(countResult.rows[0].total, 10);

    const dataQuery = `SELECT * FROM security_events ${whereClause} ORDER BY ${sortCol} ${sortDir}, id DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    const dataResult = await pool.query(dataQuery, [...values, pageSize, offset]);

    const events = dataResult.rows.map(this.mapRowToSecurityEvent);

    return {
      events,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  }

  private mapRowToSecurityEvent(row: any): SecurityEvent {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      eventType: row.event_type,
      severity: row.severity,
      threat: row.threat,
      target: row.target,
      attacker: row.attacker,
      asset: row.asset,
      app: row.app,
      description: row.description,
      threatVector: row.threat_vector,
      mitreTactic: row.mitre_tactic,
      mitreTechnique: row.mitre_technique,
      action: row.action,
      sourceType: row.source_type,
      logSource: row.log_source,
      sender: row.sender,
      recipient: row.recipient,
      protocol: row.protocol,
      country: row.country,
      riskScore: row.risk_score,
      rawPayload: row.raw_payload,
      pipelineStatus: row.pipeline_status,
      batchId: row.batch_id,
      normalizedAt: row.normalized_at,
      enrichedAt: row.enriched_at,
      correlatedAt: row.correlated_at,
      storedAt: row.stored_at,
      sigmaMatches: row.sigma_matches,
      occurredAt: row.occurred_at,
      createdAt: row.created_at,
    };
  }

  async getEventPipelineStats(tenantId: number, tenantIds?: number[]): Promise<EventPipelineStats> {
    const ids = tenantIds && tenantIds.length > 0 ? tenantIds : [tenantId];
    const tenantFilter = ids.length === 1 ? `tenant_id = $1` : `tenant_id = ANY($1)`;
    const tenantParam = ids.length === 1 ? ids[0] : ids;
    const baseParams = [tenantParam];
    const srcGuard = buildIntegrationGuardSql("security_events.tenant_id", "security_events.log_source");

    const [statusResult, typeResult, sevResult, sourceResult, dlqResult] = await Promise.all([
      pool.query(`SELECT pipeline_status, COUNT(*) as cnt FROM security_events WHERE ${tenantFilter} AND ${srcGuard} GROUP BY pipeline_status`, baseParams),
      pool.query(`SELECT event_type, COUNT(*) as cnt FROM security_events WHERE ${tenantFilter} AND ${srcGuard} GROUP BY event_type ORDER BY cnt DESC`, baseParams),
      pool.query(`SELECT severity, COUNT(*) as cnt FROM security_events WHERE ${tenantFilter} AND ${srcGuard} GROUP BY severity ORDER BY cnt DESC`, baseParams),
      pool.query(`SELECT COALESCE(log_source, 'Unknown') as log_source, COUNT(*) as cnt FROM security_events WHERE ${tenantFilter} AND ${srcGuard} GROUP BY log_source ORDER BY cnt DESC LIMIT 20`, baseParams),
      pool.query(`SELECT COUNT(*) as cnt FROM event_dead_letter_queue WHERE status = 'failed' AND ($1::int IS NULL OR tenant_id = $1)`, [tenantIds && tenantIds.length === 1 ? tenantIds[0] : tenantId]).catch(() => ({ rows: [{ cnt: 0 }] })),
    ]);

    const statusMap: Record<string, number> = {};
    let total = 0;
    for (const row of statusResult.rows) {
      const count = parseInt(row.cnt, 10);
      statusMap[row.pipeline_status || "stored"] = count;
      total += count;
    }

    const dlqFailed = parseInt(dlqResult.rows[0]?.cnt || "0", 10);
    const pipelineOrder = ["received", "normalized", "enriched", "correlated", "stored"];
    const cumulative: Record<string, number> = {};
    let runningTotal = 0;
    for (let i = pipelineOrder.length - 1; i >= 0; i--) {
      runningTotal += statusMap[pipelineOrder[i]] || 0;
      cumulative[pipelineOrder[i]] = runningTotal;
    }
    const received = total + dlqFailed;
    cumulative["received"] = received;
    const normalized = cumulative["normalized"] || 0;
    const pending = received - normalized - dlqFailed;

    return {
      received,
      normalized,
      enriched: cumulative["enriched"] || 0,
      correlated: cumulative["correlated"] || 0,
      stored: cumulative["stored"] || 0,
      total,
      dlqFailed,
      pending: pending > 0 ? pending : 0,
      byEventType: typeResult.rows.map(r => ({ eventType: r.event_type, count: parseInt(r.cnt, 10) })),
      bySeverity: sevResult.rows.map(r => ({ severity: r.severity, count: parseInt(r.cnt, 10) })),
      byLogSource: sourceResult.rows.map(r => ({ logSource: r.log_source, count: parseInt(r.cnt, 10) })),
    };
  }

  /**
   * Lightweight pipeline counters only (received/normalized/.../dlqFailed) —
   * skips the heavy GROUP BY queries (byEventType, bySeverity, byLogSource)
   * that the CH fast-path serves on its own. Used by the /stats route when
   * ClickHouse is available so PG is touched only for the small pipeline-state
   * data CH cannot represent.
   */
  async getEventPipelineCounters(tenantId: number, tenantIds?: number[]) {
    const ids = tenantIds && tenantIds.length > 0 ? tenantIds : [tenantId];
    const tenantFilter = ids.length === 1 ? `tenant_id = $1` : `tenant_id = ANY($1)`;
    const tenantParam = ids.length === 1 ? ids[0] : ids;
    const srcGuard = buildIntegrationGuardSql("security_events.tenant_id", "security_events.log_source");

    const [statusResult, dlqResult] = await Promise.all([
      pool.query(
        `SELECT pipeline_status, COUNT(*) as cnt FROM security_events WHERE ${tenantFilter} AND ${srcGuard} GROUP BY pipeline_status`,
        [tenantParam],
      ),
      pool.query(
        `SELECT COUNT(*) as cnt FROM event_dead_letter_queue WHERE status = 'failed' AND ($1::int IS NULL OR tenant_id = $1)`,
        [ids.length === 1 ? ids[0] : tenantId],
      ).catch(() => ({ rows: [{ cnt: 0 }] })),
    ]);

    const statusMap: Record<string, number> = {};
    let total = 0;
    for (const row of statusResult.rows) {
      const count = parseInt(row.cnt, 10);
      statusMap[row.pipeline_status || "stored"] = count;
      total += count;
    }
    const dlqFailed = parseInt(dlqResult.rows[0]?.cnt || "0", 10);
    const pipelineOrder = ["received", "normalized", "enriched", "correlated", "stored"];
    const cumulative: Record<string, number> = {};
    let runningTotal = 0;
    for (let i = pipelineOrder.length - 1; i >= 0; i--) {
      runningTotal += statusMap[pipelineOrder[i]] || 0;
      cumulative[pipelineOrder[i]] = runningTotal;
    }
    const received = total + dlqFailed;
    cumulative["received"] = received;
    const normalized = cumulative["normalized"] || 0;
    const pending = received - normalized - dlqFailed;
    return {
      received,
      normalized,
      enriched:    cumulative["enriched"]   || 0,
      correlated:  cumulative["correlated"] || 0,
      stored:      cumulative["stored"]     || 0,
      total,
      dlqFailed,
      pending: pending > 0 ? pending : 0,
    };
  }

  async getEventVolumeTimeline(
    tenantId: number,
    tenantIds?: number[],
    interval: string = "1h",
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<EventVolumePoint[]> {
    const ids = tenantIds && tenantIds.length > 0 ? tenantIds : [tenantId];
    const tenantFilter = ids.length === 1 ? `tenant_id = $1` : `tenant_id = ANY($1)`;
    const tenantParam = ids.length === 1 ? ids[0] : ids;
    const srcGuard = buildIntegrationGuardSql("security_events.tenant_id", "security_events.log_source");

    const bucketMap: Record<string, string> = {
      "1h": "15 minutes", "24h": "1 hour", "7d": "6 hours",
      "30d": "1 day", "90d": "1 week", "all": "1 week",
    };
    const bucket = bucketMap[interval] || "1 day";

    const conditions = [tenantFilter, srcGuard];
    const params: any[] = [tenantParam];
    let paramIdx = 2;

    if (dateFrom) {
      conditions.push(`occurred_at >= $${paramIdx++}`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`occurred_at <= $${paramIdx++}`);
      params.push(dateTo);
    }

    const whereClause = conditions.join(" AND ");

    const truncUnit = bucket === '1 week' ? 'week' : bucket === '1 day' ? 'day' : 'hour';

    let tsExpr: string;
    if (bucket === '15 minutes') {
      tsExpr = `date_trunc('hour', occurred_at) + INTERVAL '15 min' * FLOOR(EXTRACT(MINUTE FROM occurred_at) / 15)`;
    } else if (bucket === '6 hours') {
      tsExpr = `date_trunc('day', occurred_at) + INTERVAL '6 hours' * FLOOR(EXTRACT(HOUR FROM occurred_at) / 6)`;
    } else {
      tsExpr = `date_trunc('${truncUnit}', occurred_at)`;
    }

    const result = await pool.query(`
      SELECT 
        ${tsExpr} as ts,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical,
        COUNT(*) FILTER (WHERE severity = 'high') as high,
        COUNT(*) FILTER (WHERE severity = 'medium') as medium,
        COUNT(*) FILTER (WHERE severity = 'low') as low,
        COUNT(*) FILTER (WHERE severity = 'info') as info,
        COUNT(*) as total
      FROM security_events
      WHERE ${whereClause}
      GROUP BY ts
      ORDER BY ts ASC
    `, params);

    return result.rows.map(r => ({
      timestamp: r.ts?.toISOString() || "",
      critical: parseInt(r.critical, 10),
      high: parseInt(r.high, 10),
      medium: parseInt(r.medium, 10),
      low: parseInt(r.low, 10),
      info: parseInt(r.info, 10),
      total: parseInt(r.total, 10),
    }));
  }

  async getDashboardStats(tenantId: number): Promise<any> {
    const [countsResult, sevResult, catResult, recentRows, ticketCountResult] = await Promise.all([
      db.execute(sql`SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status IN ('open','investigating'))::int as open_count,
        COUNT(*) FILTER (WHERE status IN ('resolved','closed'))::int as resolved_count,
        COUNT(*) FILTER (WHERE severity = 'critical')::int as critical_count
        FROM incidents WHERE tenant_id = ${tenantId}
        AND title NOT LIKE 'Project:%' AND title NOT LIKE 'Task:%'`),
      db.execute(sql`SELECT severity as name, COUNT(*)::int as value FROM incidents
        WHERE tenant_id = ${tenantId} AND title NOT LIKE 'Project:%' AND title NOT LIKE 'Task:%'
        GROUP BY severity`),
      db.execute(sql`SELECT category, COUNT(*)::int as count FROM incidents
        WHERE tenant_id = ${tenantId} AND category IS NOT NULL
        AND title NOT LIKE 'Project:%' AND title NOT LIKE 'Task:%'
        GROUP BY category ORDER BY count DESC LIMIT 6`),
      db.select({ id: incidents.id, title: incidents.title, severity: incidents.severity, status: incidents.status, createdAt: incidents.createdAt })
        .from(incidents).where(eq(incidents.tenantId, tenantId)).orderBy(desc(incidents.createdAt)).limit(5),
      db.execute(sql`SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status IN ('open','in_progress'))::int as open_count
        FROM tickets WHERE tenant_id = ${tenantId}`),
    ]);

    const c = countsResult.rows[0] as any;
    const totalIncidents = c?.total || 0;
    const openIncidents = c?.open_count || 0;
    const resolvedIncidents = c?.resolved_count || 0;
    const criticalIncidents = c?.critical_count || 0;
    const tc = ticketCountResult.rows[0] as any;
    const totalTickets = tc?.total || 0;
    const openTickets = tc?.open_count || 0;

    const severityBreakdown = (sevResult.rows as any[]).map(r => ({ name: r.name, value: r.value }));
    const categoryBreakdown = (catResult.rows as any[]).map(r => ({ category: r.category, count: r.count }));

    const trendResult = await db.execute(sql`
      SELECT 
        TO_CHAR(created_at, 'Mon') as month,
        EXTRACT(MONTH FROM created_at) as month_num,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status IN ('resolved','closed'))::int as resolved
      FROM incidents 
      WHERE tenant_id = ${tenantId}
        AND title NOT LIKE 'Project:%' AND title NOT LIKE 'Task:%'
        AND created_at >= NOW() - INTERVAL '6 months'
      GROUP BY TO_CHAR(created_at, 'Mon'), EXTRACT(MONTH FROM created_at)
      ORDER BY EXTRACT(MONTH FROM created_at)
    `);
    const trendRows = trendResult.rows as any[];
    const incidentTrend = trendRows.length > 0
      ? trendRows.map(r => ({ month: r.month, incidents: r.total, resolved: r.resolved }))
      : [];

    const recentIncidents = recentRows.map(inc => ({
      id: inc.id,
      title: inc.title,
      severity: inc.severity,
      status: inc.status,
      createdAt: inc.createdAt.toISOString(),
    }));

    return {
      totalIncidents,
      openIncidents,
      resolvedIncidents,
      criticalIncidents,
      totalTickets,
      openTickets,
      incidentTrend,
      severityBreakdown,
      categoryBreakdown,
      recentIncidents,
    };
  }

  private static readonly NON_SECURITY_PATTERNS = [
    'No Scans In Group',
  ];

  private static readonly nonSecurityFilter = sql`title NOT ILIKE ANY(ARRAY[${sql.raw(
    DatabaseStorage.NON_SECURITY_PATTERNS.map(p => `'%${p}%'`).join(',')
  )}])`;

  async getIncidentsPaginated(tenantIds: number[], page: number, pageSize: number, filters?: { severity?: string | string[]; status?: string; classification?: string }): Promise<{ data: Incident[]; total: number }> {
    if (tenantIds.length === 0) return { data: [], total: 0 };
    const clampedPageSize = Math.min(pageSize, 100);
    const conditions: any[] = [inArray(incidents.tenantId, tenantIds), DatabaseStorage.nonSecurityFilter, incidentIntegrationGuard()];
    if (filters?.severity) {
      const sevList = Array.isArray(filters.severity) ? filters.severity : filters.severity.includes(",") ? filters.severity.split(",").map(s => s.trim()) : [filters.severity];
      conditions.push(sevList.length === 1 ? eq(incidents.severity, sevList[0] as any) : inArray(incidents.severity, sevList as any));
    }
    if (filters?.status) conditions.push(eq(incidents.status, filters.status as any));
    if (filters?.classification) {
      if (filters.classification === "tp") conditions.push(eq(incidents.isTruePositive, true));
      else if (filters.classification === "fp") conditions.push(eq(incidents.isTruePositive, false));
      else if (filters.classification === "unclassified") conditions.push(sql`${incidents.isTruePositive} IS NULL`);
    }

    const where = and(...conditions);
    const [countResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(incidents).where(where);
    const total = Number(countResult.count);

    const data = await db.select().from(incidents).where(where)
      .orderBy(desc(incidents.createdAt))
      .limit(clampedPageSize)
      .offset((page - 1) * clampedPageSize);

    return { data, total };
  }

  async getIncidentsForTenants(tenantIds: number[], timeRange: string = "all"): Promise<Incident[]> {
    if (tenantIds.length === 0) return [];
    const timeFilter = this.getTimeRangeDate(timeRange);
    const conditions: any[] = tenantIds.length === 1
      ? [eq(incidents.tenantId, tenantIds[0]), DatabaseStorage.nonSecurityFilter]
      : [inArray(incidents.tenantId, tenantIds), DatabaseStorage.nonSecurityFilter];
    conditions.push(incidentIntegrationGuard());
    if (timeFilter) conditions.push(gte(incidents.createdAt, timeFilter));
    return db.select().from(incidents)
      .where(and(...conditions))
      .orderBy(desc(incidents.createdAt))
      .limit(1000);
  }

  async getSecurityEventsForTenants(tenantIds: number[], maxRows = 1000): Promise<SecurityEvent[]> {
    if (tenantIds.length === 0) return [];
    const hardCap = Math.min(maxRows, 1000);
    if (tenantIds.length === 1) return this.getSecurityEvents(tenantIds[0], hardCap);
    return db.select().from(securityEvents)
      .where(and(
        inArray(securityEvents.tenantId, tenantIds),
        eventIntegrationGuard(),
      ))
      .orderBy(desc(securityEvents.occurredAt))
      .limit(hardCap);
  }

  async getSSEEventsWithPayloadForTenants(tenantIds: number[], maxRows?: number): Promise<any[]> {
    if (tenantIds.length === 0) return [];
    const rowLimit = Math.min(maxRows || 1000, 1000);
    const tenantCond = tenantIds.length === 1
      ? eq(securityEvents.tenantId, tenantIds[0])
      : inArray(securityEvents.tenantId, tenantIds);
    return db.select().from(securityEvents)
      .where(and(tenantCond, eq(securityEvents.eventType, "sse"), eventIntegrationGuard()))
      .orderBy(desc(securityEvents.occurredAt))
      .limit(rowLimit);
  }

  async getSecurityEventsLightForTenants(tenantIds: number[], maxRows?: number, timeRange: string = "all"): Promise<any[]> {
    if (tenantIds.length === 0) return [];
    const rowLimit = Math.min(maxRows || 1000, 1000);
    const timeFilter = this.getTimeRangeDate(timeRange);
    const cols = {
      id: securityEvents.id,
      tenantId: securityEvents.tenantId,
      eventType: securityEvents.eventType,
      severity: securityEvents.severity,
      threat: securityEvents.threat,
      target: securityEvents.target,
      attacker: securityEvents.attacker,
      asset: securityEvents.asset,
      app: securityEvents.app,
      threatVector: securityEvents.threatVector,
      mitreTactic: securityEvents.mitreTactic,
      mitreTechnique: securityEvents.mitreTechnique,
      action: securityEvents.action,
      sourceType: securityEvents.sourceType,
      logSource: securityEvents.logSource,
      sender: securityEvents.sender,
      recipient: securityEvents.recipient,
      protocol: securityEvents.protocol,
      country: securityEvents.country,
      riskScore: securityEvents.riskScore,
      occurredAt: securityEvents.occurredAt,
      createdAt: securityEvents.createdAt,
    };
    const conditions: any[] = tenantIds.length === 1
      ? [eq(securityEvents.tenantId, tenantIds[0])]
      : [inArray(securityEvents.tenantId, tenantIds)];
    conditions.push(eventIntegrationGuard());
    if (timeFilter) conditions.push(gte(securityEvents.occurredAt, timeFilter));
    return db.select(cols).from(securityEvents)
      .where(and(...conditions))
      .orderBy(desc(securityEvents.occurredAt))
      .limit(rowLimit);
  }

  async getTicketsForTenants(tenantIds: number[], timeRange: string = "all"): Promise<Ticket[]> {
    if (tenantIds.length === 0) return [];
    const timeFilter = this.getTimeRangeDate(timeRange);
    const conditions = tenantIds.length === 1
      ? [eq(tickets.tenantId, tenantIds[0])]
      : [inArray(tickets.tenantId, tenantIds)];
    if (timeFilter) conditions.push(gte(tickets.createdAt, timeFilter));
    return db.select().from(tickets)
      .where(and(...conditions))
      .orderBy(desc(tickets.createdAt))
      .limit(1000);
  }

  private getTimeRangeDate(timeRange: string): Date | null {
    const ms: Record<string, number> = {
      "1h": 3600000, "24h": 86400000, "7d": 604800000, "30d": 2592000000, "90d": 7776000000,
    };
    const offset = ms[timeRange];
    if (!offset) return null;
    return new Date(Date.now() - offset);
  }

  private getTimeRangeSQL(timeRange: string, dateCol: string): any {
    const intervals: Record<string, string> = {
      "1h": "1 hour", "24h": "24 hours", "7d": "7 days", "30d": "30 days", "90d": "90 days",
    };
    const interval = intervals[timeRange];
    if (!interval) return sql``;
    const allowedCols = ["occurred_at", "created_at", "updated_at", "resolved_at", "detected_at"];
    if (!allowedCols.includes(dateCol)) return sql``;
    return sql.raw(` AND ${dateCol} >= NOW() - INTERVAL '${interval}'`);
  }

  private async getDashboardAggregatesSQL(tenantIds: number[], timeRange: string = "all") {
    const emptyAgg = { incidentCounts: { total: 0, open: 0, resolved: 0, critical: 0 }, ticketCounts: { total: 0, open: 0 }, eventCounts: { total: 0, critical: 0 }, eventsBySeverity: [], eventsByType: [], incidentsBySeverity: [], incidentsByStatus: [], topThreats: [], topTargets: [], topAttackers: [], topApps: [], topCountries: [], avgRiskScore: 0, mttr: 0, mttd: 0, eventMonthlyTrend: [], incidentMonthlyTrend: [], emailThreatTypes: [], emailPhishingSubtypes: [], emailTopSenderDomains: [], emailAuthResults: [], emailTotal: 0, emailQuarantinedCount: 0, newAlerts: { today: 0, thisWeek: 0, thisMonth: 0, todayChange: 0, weekChange: 0, monthChange: 0 }, domainInsights: {}, eventsTimeline: [] };
    if (tenantIds.length === 0) return emptyAgg;
    const safeIds = tenantIds.filter(id => Number.isInteger(id) && id > 0);
    if (safeIds.length === 0) return emptyAgg;
    const tenantFilter = safeIds.length === 1
      ? sql`tenant_id = ${safeIds[0]}`
      : sql`tenant_id = ANY(ARRAY[${sql.join(safeIds.map(id => sql`${id}`), sql`, `)}])`;

    const evTimeFilter = this.getTimeRangeSQL(timeRange, "occurred_at");
    const incTimeFilter = this.getTimeRangeSQL(timeRange, "created_at");
    const ticketTimeFilter = this.getTimeRangeSQL(timeRange, "created_at");

    const emailFilter = sql`${tenantFilter} AND event_type = 'email'`;

    const incidentSecFilter = sql`${tenantFilter} AND title NOT ILIKE ANY(ARRAY[${sql.raw(
      DatabaseStorage.NON_SECURITY_PATTERNS.map(p => `'%${p}%'`).join(',')
    )}])`;

    const timelineBucket = (timeRange === "1h" || timeRange === "24h") ? "hour" :
      (timeRange === "90d" || timeRange === "all") ? "week" : "day";
    const timelineInterval = timeRange === "1h" ? "1 hour" : timeRange === "24h" ? "24 hours" :
      timeRange === "7d" ? "7 days" : timeRange === "30d" ? "30 days" : timeRange === "90d" ? "90 days" : "180 days";

    const [incStats, ticketStats, eventStats, evBySev, evByType, incBySev, topThreats, topTargets, topAttackers, topApps, topCountries, riskAvg, mttrResult, mttdResult, evMonthly, incMonthly, emailThreatTypesResult, emailPhishingSubtypesResult, emailSenderDomainsResult, emailAuthResult, emailQuarantineResult, alertTrends, domainInsightsResult, eventsTimelineResult] = await Promise.all([
      db.execute(sql`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status IN ('open','investigating')) as open_count, COUNT(*) FILTER (WHERE status IN ('resolved','closed')) as resolved_count, COUNT(*) FILTER (WHERE severity = 'critical') as critical_count FROM incidents WHERE ${incidentSecFilter}${incTimeFilter}`),
      db.execute(sql`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status IN ('open','in_progress')) as open_count, COUNT(*) FILTER (WHERE sla_breached = true AND status NOT IN ('resolved','closed')) as sla_breach_count FROM tickets WHERE ${tenantFilter}${ticketTimeFilter}`),
      db.execute(sql`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE severity = 'critical') as critical_count FROM security_events WHERE ${tenantFilter}${evTimeFilter}`),
      db.execute(sql`SELECT severity, COUNT(*)::int as cnt FROM security_events WHERE ${tenantFilter}${evTimeFilter} GROUP BY severity`),
      db.execute(sql`SELECT event_type, COUNT(*)::int as cnt FROM security_events WHERE ${tenantFilter}${evTimeFilter} GROUP BY event_type ORDER BY cnt DESC`),
      db.execute(sql`SELECT severity, COUNT(*)::int as cnt FROM incidents WHERE ${incidentSecFilter}${incTimeFilter} GROUP BY severity`),
      db.execute(sql`SELECT threat as name, COUNT(*)::int as count FROM security_events WHERE ${tenantFilter}${evTimeFilter} AND threat IS NOT NULL AND threat != '' GROUP BY threat ORDER BY count DESC LIMIT 10`),
      db.execute(sql`SELECT COALESCE(NULLIF(target, ''), NULLIF(recipient, '')) as name, COUNT(*)::int as count FROM security_events WHERE ${tenantFilter}${evTimeFilter} AND COALESCE(NULLIF(target, ''), NULLIF(recipient, '')) IS NOT NULL GROUP BY name ORDER BY count DESC LIMIT 10`),
      db.execute(sql`SELECT attacker as name, COUNT(*)::int as count FROM security_events WHERE ${tenantFilter}${evTimeFilter} AND attacker IS NOT NULL AND attacker != '' GROUP BY attacker ORDER BY count DESC LIMIT 10`),
      db.execute(sql`SELECT app as name, COUNT(*)::int as count FROM security_events WHERE ${tenantFilter}${evTimeFilter} AND app IS NOT NULL AND app != '' GROUP BY app ORDER BY count DESC LIMIT 10`),
      db.execute(sql`SELECT country as name, COUNT(*)::int as count FROM security_events WHERE ${tenantFilter}${evTimeFilter} AND country IS NOT NULL AND country != '' GROUP BY country ORDER BY count DESC LIMIT 10`),
      db.execute(sql`SELECT COALESCE(AVG(risk_score), 0)::int as avg FROM security_events WHERE ${tenantFilter}${evTimeFilter} AND risk_score IS NOT NULL`),
      db.execute(sql`SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600), 0)::int as hours FROM incidents WHERE ${incidentSecFilter}${incTimeFilter} AND status IN ('resolved','closed') AND resolved_at IS NOT NULL`),
      db.execute(sql`SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (created_at - occurred_at)) / 60), 0)::int as minutes FROM security_events WHERE ${tenantFilter}${evTimeFilter} AND occurred_at IS NOT NULL AND created_at IS NOT NULL`),
      db.execute(sql`SELECT EXTRACT(MONTH FROM occurred_at)::int as month_num, EXTRACT(YEAR FROM occurred_at)::int as yr, event_type, severity, COUNT(*)::int as cnt FROM security_events WHERE ${tenantFilter} AND occurred_at >= NOW() - INTERVAL '6 months' GROUP BY month_num, yr, event_type, severity`),
      db.execute(sql`SELECT EXTRACT(MONTH FROM created_at)::int as month_num, EXTRACT(YEAR FROM created_at)::int as yr, COUNT(*)::int as total, COUNT(*) FILTER (WHERE status IN ('resolved','closed'))::int as resolved FROM incidents WHERE ${incidentSecFilter} AND created_at >= NOW() - INTERVAL '6 months' GROUP BY month_num, yr`),
      db.execute(sql`SELECT COALESCE(
        NULLIF(raw_payload->>'emailThreatType', ''),
        NULLIF(raw_payload->>'threatType', ''),
        CASE
          WHEN LOWER(threat) LIKE 'malware%' THEN 'Malware'
          WHEN LOWER(threat) LIKE 'phishing%' THEN 'Phishing'
          WHEN LOWER(threat) LIKE 'bec%' OR LOWER(threat) LIKE 'business email compromise%' THEN 'BEC'
          WHEN LOWER(threat) LIKE 'spam%' THEN 'Spam'
          WHEN LOWER(threat) LIKE 'suspicious%' THEN 'Suspicious'
          WHEN LOWER(threat) LIKE 'graymail%' THEN 'Graymail'
          WHEN LOWER(threat) LIKE '%malware%' THEN 'Malware'
          WHEN LOWER(threat) LIKE '%phishing%' OR LOWER(threat) LIKE '%phish%' THEN 'Phishing'
          WHEN LOWER(threat) LIKE '%spam%' THEN 'Spam'
          WHEN LOWER(threat) LIKE '%suspicious%' THEN 'Suspicious'
          ELSE 'Unknown'
        END
      ) as threat_type, COUNT(*)::int as cnt FROM security_events WHERE ${emailFilter}${evTimeFilter} GROUP BY threat_type ORDER BY cnt DESC`),
      db.execute(sql`SELECT raw_payload->>'phishingSubtype' as subtype, COUNT(*)::int as cnt FROM security_events WHERE ${emailFilter}${evTimeFilter} AND raw_payload->>'phishingSubtype' IS NOT NULL AND raw_payload->>'phishingSubtype' != '' GROUP BY subtype ORDER BY cnt DESC`),
      db.execute(sql`SELECT COALESCE(
          NULLIF(raw_payload->>'senderDomain', ''),
          NULLIF(SPLIT_PART(sender, '@', 2), ''),
          NULLIF(SUBSTRING(threat FROM 'email from \S+@(\S+)\s+to'), '')
        ) as domain, COUNT(*)::int as cnt FROM security_events WHERE ${emailFilter}${evTimeFilter} AND COALESCE(
          NULLIF(raw_payload->>'senderDomain', ''),
          NULLIF(SPLIT_PART(sender, '@', 2), ''),
          NULLIF(SUBSTRING(threat FROM 'email from \S+@(\S+)\s+to'), '')
        ) IS NOT NULL GROUP BY domain ORDER BY cnt DESC LIMIT 10`),
      db.execute(sql`SELECT COUNT(*) FILTER (WHERE LOWER(raw_payload->>'spfResult') IN ('fail','softfail'))::int as spf_fail, COUNT(*) FILTER (WHERE LOWER(raw_payload->>'dkimResult') = 'fail')::int as dkim_fail, COUNT(*) FILTER (WHERE LOWER(raw_payload->>'dmarcResult') = 'fail')::int as dmarc_fail FROM security_events WHERE ${emailFilter}${evTimeFilter}`),
      db.execute(sql`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE LOWER(raw_payload->>'quarantined') IN ('true','t','1','yes') OR LOWER(action) IN ('quarantined','blocked','junked') OR threat LIKE '%[quarantined]' OR threat LIKE '%[junked]' OR threat LIKE '%[blocked]')::int as quarantined FROM security_events WHERE ${emailFilter}${evTimeFilter}`),
      db.execute(sql`
        SELECT
          -- Use created_at (ingestion time) for today/week so events polled today are counted
          -- even if their occurred_at is from an earlier detection timestamp in the source system
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int as today,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '1 day' AND created_at < CURRENT_DATE)::int as yesterday,
          COUNT(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE))::int as this_week,
          COUNT(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE) - INTERVAL '7 days' AND created_at < date_trunc('week', CURRENT_DATE))::int as last_week,
          -- Use occurred_at for monthly historical counts to reflect actual threat volume over time
          COUNT(*) FILTER (WHERE occurred_at >= date_trunc('month', CURRENT_DATE))::int as this_month,
          COUNT(*) FILTER (WHERE occurred_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' AND occurred_at < date_trunc('month', CURRENT_DATE))::int as last_month
        FROM security_events WHERE ${tenantFilter}
      `),
      Promise.all([
        db.execute(sql`SELECT event_type, threat as name, COUNT(*)::int as cnt FROM security_events WHERE ${tenantFilter}${evTimeFilter} AND threat IS NOT NULL AND threat != '' GROUP BY event_type, threat ORDER BY cnt DESC`),
        db.execute(sql`SELECT event_type, attacker as name, COUNT(*)::int as cnt FROM security_events WHERE ${tenantFilter}${evTimeFilter} AND attacker IS NOT NULL AND attacker != '' GROUP BY event_type, attacker ORDER BY cnt DESC`),
        db.execute(sql`SELECT event_type, target as name, COUNT(*)::int as cnt FROM security_events WHERE ${tenantFilter}${evTimeFilter} AND target IS NOT NULL AND target != '' GROUP BY event_type, target ORDER BY cnt DESC`),
      ]),
      db.execute(sql.raw(`
        SELECT date_trunc('${timelineBucket}', occurred_at) as bucket,
          severity, COUNT(*)::int as cnt
        FROM security_events
        WHERE ${safeIds.length === 1 ? `tenant_id = ${safeIds[0]}` : `tenant_id = ANY(ARRAY[${safeIds.join(",")}])`}
          AND occurred_at >= NOW() - INTERVAL '${timelineInterval}'
        GROUP BY bucket, severity
        ORDER BY bucket
      `)),
    ]);

    const r = (rows: any) => (rows as any).rows || [];
    const first = (rows: any) => r(rows)[0] || {};

    const alertTrendData = first(alertTrends);
    const todayCount = Number(alertTrendData.today) || 0;
    const yesterdayCount = Number(alertTrendData.yesterday) || 0;
    const thisWeekCount = Number(alertTrendData.this_week) || 0;
    const lastWeekCount = Number(alertTrendData.last_week) || 0;
    const thisMonthCount = Number(alertTrendData.this_month) || 0;
    const lastMonthCount = Number(alertTrendData.last_month) || 0;
    const pctChange = (current: number, previous: number) =>
      previous > 0 ? Math.round(((current - previous) / previous) * 100) : (current > 0 ? 100 : 0);

    const domainInsightsMap: Record<string, { topThreats: any[]; topAttackers: any[]; topTargets: any[] }> = {};
    const domainTypes = ["endpoint", "email", "network", "identity", "waf", "cloud", "dlp", "vulnerability", "casb", "sse"];
    domainTypes.forEach(dt => {
      domainInsightsMap[dt] = { topThreats: [], topAttackers: [], topTargets: [] };
    });
    const [threatRows, attackerRows, targetRows] = domainInsightsResult as any[];
    const buildDomainMap = (rows: any) => {
      const m: Record<string, Record<string, number>> = {};
      r(rows).forEach((row: any) => {
        const et = (row.event_type || "").toLowerCase();
        if (!m[et]) m[et] = {};
        m[et][row.name] = (m[et][row.name] || 0) + Number(row.cnt);
      });
      return m;
    };
    const threatsByDomain = buildDomainMap(threatRows);
    const attackersByDomain = buildDomainMap(attackerRows);
    const targetsByDomain = buildDomainMap(targetRows);
    const topNFromMap = (m: Record<string, number>, n = 10) =>
      Object.entries(m).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, n);
    domainTypes.forEach(dt => {
      domainInsightsMap[dt] = {
        topThreats: topNFromMap(threatsByDomain[dt] || {}),
        topAttackers: topNFromMap(attackersByDomain[dt] || {}),
        topTargets: topNFromMap(targetsByDomain[dt] || {}),
      };
    });

    const timelineBuckets: Record<string, Record<string, number>> = {};
    r(eventsTimelineResult).forEach((row: any) => {
      const bucketKey = row.bucket instanceof Date ? row.bucket.toISOString() : String(row.bucket);
      if (!timelineBuckets[bucketKey]) timelineBuckets[bucketKey] = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
      const sev = (row.severity || "info").toLowerCase();
      timelineBuckets[bucketKey][sev] = (timelineBuckets[bucketKey][sev] || 0) + Number(row.cnt);
    });
    const eventsTimeline = Object.entries(timelineBuckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, sevs]) => ({ time, ...sevs, total: Object.values(sevs).reduce((s, v) => s + v, 0) }));

    return {
      incidentCounts: { total: Number(first(incStats).total), open: Number(first(incStats).open_count), resolved: Number(first(incStats).resolved_count), critical: Number(first(incStats).critical_count) },
      ticketCounts: { total: Number(first(ticketStats).total), open: Number(first(ticketStats).open_count), slaBreached: Number(first(ticketStats).sla_breach_count || 0) },
      eventCounts: { total: Number(first(eventStats).total), critical: Number(first(eventStats).critical_count) },
      eventsBySeverity: r(evBySev).map((row: any) => ({ name: row.severity, value: Number(row.cnt) })),
      eventsByType: r(evByType).map((row: any) => ({ type: row.event_type, count: Number(row.cnt) })),
      incidentsBySeverity: r(incBySev).map((row: any) => ({ name: row.severity, value: Number(row.cnt) })),
      topThreats: r(topThreats).map((row: any) => ({ name: row.name, count: Number(row.count) })),
      topTargets: r(topTargets).map((row: any) => ({ name: row.name, count: Number(row.count) })),
      topAttackers: r(topAttackers).map((row: any) => ({ name: row.name, count: Number(row.count) })),
      topApps: r(topApps).map((row: any) => ({ name: row.name, count: Number(row.count) })),
      topCountries: r(topCountries).map((row: any) => ({ name: row.name, count: Number(row.count) })),
      avgRiskScore: Number(first(riskAvg).avg) || 0,
      mttr: Number(first(mttrResult).hours) || 0,
      mttd: Number(first(mttdResult).minutes) || 0,
      eventMonthlyTrend: r(evMonthly),
      incidentMonthlyTrend: r(incMonthly),
      emailThreatTypes: r(emailThreatTypesResult).map((row: any) => ({ name: row.threat_type, value: Number(row.cnt) })),
      emailPhishingSubtypes: r(emailPhishingSubtypesResult).map((row: any) => ({ name: row.subtype, value: Number(row.cnt) })),
      emailTopSenderDomains: r(emailSenderDomainsResult).map((row: any) => ({ name: row.domain, count: Number(row.cnt) })),
      emailAuthResults: (() => {
        const auth = first(emailAuthResult);
        return [
          { name: "SPF Fail", value: Number(auth.spf_fail) || 0 },
          { name: "DKIM Fail", value: Number(auth.dkim_fail) || 0 },
          { name: "DMARC Fail", value: Number(auth.dmarc_fail) || 0 },
        ].filter(d => d.value > 0);
      })(),
      emailTotal: Number(first(emailQuarantineResult).total) || 0,
      emailQuarantinedCount: Number(first(emailQuarantineResult).quarantined) || 0,
      newAlerts: {
        today: todayCount, thisWeek: thisWeekCount, thisMonth: thisMonthCount,
        todayChange: pctChange(todayCount, yesterdayCount),
        weekChange: pctChange(thisWeekCount, lastWeekCount),
        monthChange: pctChange(thisMonthCount, lastMonthCount),
      },
      domainInsights: domainInsightsMap,
      eventsTimeline,
    };
  }

  async getEnhancedDashboardStats(tenantId: number, timeRange: string = "all"): Promise<any> {
    const emailAddrRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const tenant = await this.getTenant(tenantId);
    let tenantIds = [tenantId];
    if (tenant && tenant.type === "mssp") {
      const children = await this.getChildTenants(tenantId);
      if (children.length > 0) {
        tenantIds = [tenantId, ...children.map(c => c.id)];
      }
    }

    const [sqlAgg, allEvents, allIncidents, allTickets] = await Promise.all([
      this.getDashboardAggregatesSQL(tenantIds, timeRange),
      this.getSecurityEventsLightForTenants(tenantIds, undefined, timeRange),
      this.getIncidentsForTenants(tenantIds, timeRange),
      this.getTicketsForTenants(tenantIds, timeRange),
    ]);

    const totalIncidents = sqlAgg.incidentCounts.total;
    const openIncidents = sqlAgg.incidentCounts.open;
    const resolvedIncidents = sqlAgg.incidentCounts.resolved;
    const criticalIncidents = sqlAgg.incidentCounts.critical;
    const totalTickets = sqlAgg.ticketCounts.total;
    const openTickets = sqlAgg.ticketCounts.open;
    const slaBreachCount = sqlAgg.ticketCounts.slaBreached ?? 0;
    const totalEvents = sqlAgg.eventCounts.total;

    const topN = (map: Record<string, number>, n = 10) =>
      Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, n);

    const cleanSingleTactic = (raw: string): string => {
      let t = raw.replace(/^\[?'?/, "").replace(/'?\]?$/, "").trim();
      t = t.replace(/^TA\d{4}\s*-\s*/, "");
      t = t.replace(/^T\d{4}(\.\d+)?\s*-\s*/, "");
      t = t.replace(/['\[\]]/g, "").trim();
      if (t.length > 35) t = t.substring(0, 35);
      return t;
    };

    const splitAndClean = (raw: string): string[] => {
      if (!raw) return [];
      const parts = raw.replace(/^\[/, "").replace(/\]$/, "").split(/[,']/).map(p => p.trim()).filter(p => p.length > 2);
      const cleaned: string[] = [];
      for (const p of parts) {
        const c = cleanSingleTactic(p);
        if (c.length > 2 && !c.match(/^TA\d{4}$/) && !c.match(/^T\d{4}/)) cleaned.push(c);
      }
      return cleaned.length > 0 ? cleaned : [cleanSingleTactic(raw)].filter(c => c.length > 2);
    };

    const countBy = (items: any[], key: string) => {
      const m: Record<string, number> = {};
      items.forEach(i => { const v = i[key]; if (v) m[v] = (m[v] || 0) + 1; });
      return m;
    };

    const countByCleanSplit = (items: any[], key: string) => {
      const m: Record<string, number> = {};
      items.forEach(i => {
        const v = i[key];
        if (!v) return;
        const labels = splitAndClean(v);
        labels.forEach(l => { m[l] = (m[l] || 0) + 1; });
      });
      return m;
    };

    const severityBreakdown = sqlAgg.incidentsBySeverity;
    const categoryBreakdown = topN(countByCleanSplit(allIncidents, "category"), 10).map(({ name, count }) => ({ category: name, count }));

    const incidentTypeMap: Record<string, number> = {};
    allIncidents.forEach(inc => {
      const t = (inc as any).incidentType;
      if (t && typeof t === "string" && t.trim()) {
        const key = t.trim();
        incidentTypeMap[key] = (incidentTypeMap[key] || 0) + 1;
      }
    });
    const incidentByType = Object.entries(incidentTypeMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, count]) => ({ name, count }));

    const evTimeFilterSec = this.getTimeRangeSQL(timeRange, "occurred_at");

    const eventsByTypeArr: { type: string; count: number }[] = [];
    const sseSubCounts = tenantIds.length > 0 ? await db.execute(sql`
      SELECT
        CASE
          WHEN raw_payload->>'dataType' IN ('web_user_activity','web_traffic') THEN 'Web'
          ELSE 'Cloud Apps'
        END as sub_type,
        COUNT(*)::int as cnt
      FROM security_events
      WHERE tenant_id = ANY(${sql.raw(`ARRAY[${tenantIds.join(",")}]`)}) AND event_type = 'sse'${evTimeFilterSec}
      GROUP BY sub_type
    `) : { rows: [] };
    const sseSubMap: Record<string, number> = {};
    (sseSubCounts as any).rows?.forEach((r: any) => { sseSubMap[r.sub_type] = Number(r.cnt); });
    sqlAgg.eventsByType.forEach(({ type: etype, count }: { type: string; count: number }) => {
      if (etype === "sse") {
        if (sseSubMap["Cloud Apps"]) eventsByTypeArr.push({ type: "Cloud Apps", count: sseSubMap["Cloud Apps"] });
        if (sseSubMap["Web"]) eventsByTypeArr.push({ type: "Web", count: sseSubMap["Web"] });
        if (!sseSubMap["Cloud Apps"] && !sseSubMap["Web"]) {
          eventsByTypeArr.push({ type: "Cloud Apps", count });
        }
      } else {
        const label = etype.charAt(0).toUpperCase() + etype.slice(1);
        eventsByTypeArr.push({ type: label, count });
      }
    });
    const eventsByType = eventsByTypeArr;
    const eventsBySeverity = sqlAgg.eventsBySeverity;

    const topThreats = sqlAgg.topThreats;
    const topTargets = sqlAgg.topTargets;
    const topAttackers = sqlAgg.topAttackers;
    const topVulnerableApps = sqlAgg.topApps;

    function extractRecipientFromDesc(desc: string | null | undefined): string | null {
      if (!desc) return null;
      const mailboxMatch = desc.match(/\(([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})'s\s+mailbox\)/i);
      if (mailboxMatch) return mailboxMatch[1];
      const toMatch = desc.match(/\bto\s+([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
      if (toMatch) return toMatch[1];
      const recipMatch = desc.match(/\brecipient[:\s]+([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
      if (recipMatch) return recipMatch[1];
      return null;
    }

    const endpointTargetMap: Record<string, number> = {};
    const emailTargetMap: Record<string, number> = {};
    allEvents.forEach(ev => {
      if (ev.eventType === "endpoint") {
        const t = ev.target;
        if (t) endpointTargetMap[t] = (endpointTargetMap[t] || 0) + 1;
      } else if (ev.eventType === "email") {
        let t = ev.target || ev.recipient;
        if (!t) {
          t = extractRecipientFromDesc(ev.description) || null;
        }
        if (t) emailTargetMap[t] = (emailTargetMap[t] || 0) + 1;
      }
    });
    const topTargetsEndpoint = topN(endpointTargetMap);
    const topTargetsEmail = topN(emailTargetMap);

    const webUrlMap: Record<string, number> = {};
    const webCategoryMap: Record<string, number> = {};
    const webSseEvents = await db.execute(sql`
      SELECT raw_payload->>'dataType' as dtype,
             raw_payload->'topSites' as top_sites,
             raw_payload->'allSites' as all_sites,
             raw_payload->>'urlCategories' as url_cats
      FROM security_events
      WHERE tenant_id = ANY(${sql.raw(`ARRAY[${tenantIds.join(",")}]`)}) AND event_type = 'sse'
        AND raw_payload->>'dataType' IN ('web_user_activity','web_traffic')${evTimeFilterSec}
      LIMIT 500
    `);
    ((webSseEvents as any).rows || []).forEach((r: any) => {
      const sites = r.top_sites || r.all_sites || [];
      if (Array.isArray(sites)) {
        sites.forEach((s: string) => { if (s) webUrlMap[s] = (webUrlMap[s] || 0) + 1; });
      }
      const cats = r.url_cats;
      if (typeof cats === "string") {
        const cleaned = cats.replace(/^\[|\]$/g, "").split(",").map((c: string) => c.trim()).filter(Boolean);
        cleaned.forEach((c: string) => { webCategoryMap[c] = (webCategoryMap[c] || 0) + 1; });
      }
    });
    const topWebUrls = topN(webUrlMap);
    const topWebCategories = topN(webCategoryMap);

    const now = new Date();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(monthNames[d.getMonth()]);
    }

    const sseDataTypeRows = tenantIds.length > 0 ? await db.execute(sql`
      SELECT id, raw_payload->>'dataType' as data_type
      FROM security_events
      WHERE tenant_id = ANY(${sql.raw(`ARRAY[${tenantIds.join(",")}]`)}) AND event_type = 'sse'${evTimeFilterSec}
    `) : { rows: [] };
    const sseDataTypeMap = new Map<number, string>();
    ((sseDataTypeRows as any).rows || []).forEach((r: any) => {
      sseDataTypeMap.set(Number(r.id), (r.data_type || "").toLowerCase());
    });

    const classifySecurityDomain = (ev: any): string => {
      const etype = (ev.eventType || "").toLowerCase();
      const threat = ((ev as any).threatVector || (ev as any).threat || "").toLowerCase();
      const dataType = sseDataTypeMap.get(ev.id) || "";
      const desc = ((ev as any).description || "").toLowerCase();

      if (etype === "dlp" || dataType === "dlp") return "Data";
      if (etype === "waf" || etype === "web_ddos" || etype === "bot") return "Web App";
      if (etype === "email" || threat.includes("phish") || threat.includes("spam") || threat.includes("bec")) return "Email";
      if (etype === "identity" || threat.includes("credential") || threat.includes("brute") || threat.includes("login") || desc.includes("authentication")) return "Identity";
      if (etype === "sse") {
        if (dataType === "web_traffic" || dataType === "web_user_activity") return "Web";
        if (dataType === "cloud_activity") return "Cloud";
        return "Cloud";
      }
      if (etype === "casb" || etype === "cloud") return "Cloud";
      if (etype === "network" || etype === "firewall" || etype === "ids" || etype === "ips") return "Network";
      if (etype === "endpoint" || etype === "vulnerability") return "Endpoint";
      if (threat.includes("malware") || threat.includes("ransomware") || threat.includes("rootkit") || threat.includes("trojan")) return "Endpoint";
      if (threat.includes("exfiltration") || threat.includes("data_loss")) return "Data";
      return "Endpoint";
    };

    const classifyIncidentDomain = (inc: Incident): string => {
      const src = (inc.source || "").toLowerCase();
      const iType = (inc.incidentType || "").toLowerCase();
      const cat = (inc.category || "").toLowerCase();
      const title = (inc.title || "").toLowerCase();
      const threat = ((inc as any).threatVector || (inc as any).threat || "").toLowerCase();

      const SOURCE_MAP: Record<string, string> = {
        "checkpoint harmony email": "Email",
        "email security gateway": "Email",
        "endpoint detection & response": "Endpoint",
        "vulnerability scanner": "Endpoint",
        "cloud security": "Cloud",
        "network detection": "Network",
        "identity & access management": "Identity",
        "web application firewall": "Web App",
      };
      const exactSource = SOURCE_MAP[src];
      if (exactSource) return exactSource;

      if (src.includes("email") || cat.includes("email")) return "Email";
      if (src.includes("waf") || src.includes("web application firewall") || src.includes("bot manager") || src.includes("ddos")) return "Web App";
      if (src.includes("endpoint") || src.includes("edr") || src.includes("vulnerability") || src.includes("antivirus") || src.includes("anti-malware")) return "Endpoint";
      if (src.includes("dlp") || src.includes("data loss")) return "DLP";
      if (src.includes("identity") || src.includes("iam") || src.includes("access management")) return "Identity";
      if (src.includes("cloud") || src.includes("casb") || src.includes("saas") || src.includes("sase")) return "Cloud";
      if (src.includes("network") || src.includes("firewall") || src.includes("ids") || src.includes("ips") || src.includes("ndr")) return "Network";
      if (src.includes("database") || src.includes("sql") || src.includes("dam")) return "Database";

      if (iType.includes("malware") || iType.includes("rootkit") || iType.includes("fileless") || iType.includes("dll") || iType.includes("process injection") || iType.includes("suspicious process") || iType.includes("local threat") || iType.includes("device control") || iType.includes("masquerad") || iType.includes("credential abuse")) return "Endpoint";
      if (iType.includes("webshell")) return "Web App";
      if (iType.includes("port scan") || iType.includes("network scan") || iType.includes("lateral movement") || iType.includes("remote code execution") || iType.includes("large data upload")) return "Network";
      if (iType.includes("cloud") || iType.includes("api call")) return "Cloud";
      if (iType.includes("ntlm") || iType.includes("credential") || iType.includes("brute")) return "Identity";
      if (iType.includes("phish") || iType.includes("spam") || iType.includes("bec")) return "Email";
      if (iType.includes("exfiltration") || iType.includes("data loss")) return "DLP";

      if (title.includes("phishing") || title.includes("spam") || title.includes("bec")) return "Email";
      if (title.includes("malware") || title.includes("ransomware") || title.includes("trojan") || title.includes("rootkit")) return "Endpoint";
      if (title.includes("port scan") || title.includes("network") || title.includes("intrusion") || title.includes("firewall")) return "Network";
      if (title.includes("webshell") || title.includes("sql injection") || title.includes("xss") || title.includes("web attack")) return "Web App";
      if (title.includes("dlp") || title.includes("data loss") || title.includes("exfiltration")) return "DLP";
      if (title.includes("credential") || title.includes("brute force") || title.includes("unauthorized access") || title.includes("authentication")) return "Identity";
      if (title.includes("cloud") || title.includes("saas") || title.includes("api")) return "Cloud";
      if (title.includes("database")) return "Database";

      if (threat.includes("malware") || threat.includes("ransomware") || threat.includes("rootkit")) return "Endpoint";
      if (threat.includes("phish") || threat.includes("spam") || threat.includes("bec")) return "Email";
      if (threat.includes("exfiltration") || threat.includes("data_loss")) return "DLP";
      if (threat.includes("credential") || threat.includes("brute")) return "Identity";

      if (title.includes("email") || title.includes("high-risk email")) return "Email";

      return "Endpoint";
    };

    const incidentTypeByDomain: Record<string, Record<string, number>> = {};
    allIncidents.forEach(inc => {
      const t = (inc as any).incidentType;
      if (t && typeof t === "string" && t.trim()) {
        const key = t.trim();
        const domain = classifyIncidentDomain(inc);
        if (!incidentTypeByDomain[domain]) incidentTypeByDomain[domain] = {};
        incidentTypeByDomain[domain][key] = (incidentTypeByDomain[domain][key] || 0) + 1;
      }
    });
    const buildDomainIncidentTypes = (domain: string) =>
      Object.entries(incidentTypeByDomain[domain] || {})
        .sort((a, b) => b[1] - a[1]).slice(0, 15)
        .map(([name, count]) => ({ name, count }));
    const endpointIncidentByType = buildDomainIncidentTypes("Endpoint");
    const emailIncidentByType = buildDomainIncidentTypes("Email");
    const networkIncidentByType = buildDomainIncidentTypes("Network");
    const identityIncidentByType = buildDomainIncidentTypes("Identity");
    const cloudIncidentByType = buildDomainIncidentTypes("Cloud");
    const webAppIncidentByType = buildDomainIncidentTypes("Web App");
    const dlpIncidentByType = buildDomainIncidentTypes("DLP");

    const overviewSevByControl: Record<string, Record<string, number>> = {};
    const overviewActionByControl: Record<string, Record<string, number>> = {};
    const overviewSevTrendMap: Record<string, Record<string, number>> = {};
    const vulnAssetMap: Record<string, { total: number; critical: number; high: number }> = {};
    const riskBuckets: Record<string, number> = { "0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0 };
    const tenantArraySQL = sql.raw(`ARRAY[${tenantIds.join(",")}]`);
    const nonSecThreatFilter = sql`AND threat NOT ILIKE '%No Scans%' AND threat NOT ILIKE '%scan error%'`;

    const [eventsByDomainSQL, incidentsByDomainSQL] = tenantIds.length > 0 ? await Promise.all([
      db.execute(sql`
        SELECT event_type, COUNT(*)::int as cnt FROM security_events
        WHERE tenant_id = ANY(${tenantArraySQL})${evTimeFilterSec}
        GROUP BY event_type
      `),
      db.execute(sql`
        SELECT event_type, COUNT(*)::int as cnt FROM security_events
        WHERE tenant_id = ANY(${tenantArraySQL}) ${nonSecThreatFilter}${evTimeFilterSec}
        GROUP BY event_type
      `),
    ]) : [{ rows: [] }, { rows: [] }];

    const mapEventTypeToDomain = (rows: any): Record<string, number> => {
      const domain: Record<string, number> = { Endpoint: 0, DLP: 0, Email: 0, Web: 0, "Web App": 0, Identity: 0, Database: 0, Network: 0 };
      ((rows as any).rows || []).forEach((r: any) => {
        const etype = (r.event_type || "").toLowerCase();
        const cnt = Number(r.cnt) || 0;
        if (etype === "endpoint" || etype === "vulnerability") domain["Endpoint"] += cnt;
        else if (etype === "dlp") domain["DLP"] += cnt;
        else if (etype === "email") domain["Email"] += cnt;
        else if (etype === "sse" || etype === "casb" || etype === "cloud") domain["Web"] += cnt;
        else if (etype === "waf" || etype === "web_ddos" || etype === "bot") domain["Web App"] += cnt;
        else if (etype === "identity") domain["Identity"] += cnt;
        else if (etype === "network" || etype === "firewall" || etype === "ids" || etype === "ips") domain["Network"] += cnt;
        else domain["Endpoint"] += cnt;
      });
      return domain;
    };

    const eventsByDomain = mapEventTypeToDomain(eventsByDomainSQL);
    const incidentsByDomain = mapEventTypeToDomain(incidentsByDomainSQL);
    incidentsByDomain["Web"] = 0;

    allEvents.forEach(ev => {
      const sev = ev.severity || "info";
      const etype = ev.eventType;
      const label = classifySecurityDomain(ev);
      if (!overviewSevByControl[label]) overviewSevByControl[label] = {};
      overviewSevByControl[label][sev] = (overviewSevByControl[label][sev] || 0) + 1;

      const action = (ev.action || "Unknown").toLowerCase();
      const actionLabel = action.includes("block") ? "Blocked" :
        action.includes("quarantin") ? "Quarantined" :
        action.includes("isolat") ? "Isolated" :
        action.includes("remediat") ? "Remediated" :
        action.includes("monitor") || action.includes("alert") ? "Monitored" :
        action.includes("allow") ? "Allowed" :
        action.includes("drop") ? "Dropped" :
        action === "unknown" || action === "no action" ? "No Action" : "Other";
      if (!overviewActionByControl[label]) overviewActionByControl[label] = {};
      overviewActionByControl[label][actionLabel] = (overviewActionByControl[label][actionLabel] || 0) + 1;

      const t = ev.target;
      if (t && (etype === "endpoint" || etype === "vulnerability")) {
        if (!vulnAssetMap[t]) vulnAssetMap[t] = { total: 0, critical: 0, high: 0 };
        vulnAssetMap[t].total++;
        if (sev === "critical") vulnAssetMap[t].critical++;
        if (sev === "high") vulnAssetMap[t].high++;
      }

      const m = monthNames[ev.occurredAt.getMonth()];
      if (!overviewSevTrendMap[m]) overviewSevTrendMap[m] = {};
      overviewSevTrendMap[m][sev] = (overviewSevTrendMap[m][sev] || 0) + 1;

      const rs = (ev as any).riskScore;
      if (typeof rs === "number") {
        if (rs <= 20) riskBuckets["0-20"]++;
        else if (rs <= 40) riskBuckets["21-40"]++;
        else if (rs <= 60) riskBuckets["41-60"]++;
        else if (rs <= 80) riskBuckets["61-80"]++;
        else riskBuckets["81-100"]++;
      }
    });

    allIncidents.forEach(inc => {
      const sev = inc.severity || "medium";
      const label = classifyIncidentDomain(inc);
      if (!overviewSevByControl[label]) overviewSevByControl[label] = {};
      overviewSevByControl[label][sev] = (overviewSevByControl[label][sev] || 0) + 1;

      const action = (inc.status || "open").toLowerCase();
      const actionLabel = action === "resolved" || action === "closed" ? "Remediated" :
        action === "investigating" ? "Monitored" : "Monitored";
      if (!overviewActionByControl[label]) overviewActionByControl[label] = {};
      overviewActionByControl[label][actionLabel] = (overviewActionByControl[label][actionLabel] || 0) + 1;
    });
    const totalIncidentsByDomain = Object.values(incidentsByDomain).reduce((a, b) => a + b, 0);

    const domainOrder = ["Endpoint", "Email", "Network", "Web", "Cloud", "Identity", "Data", "Web App"];
    domainOrder.forEach(d => {
      if (!overviewSevByControl[d]) overviewSevByControl[d] = {};
      if (!overviewActionByControl[d]) overviewActionByControl[d] = {};
    });
    const sevHeatmapByControl = domainOrder.map(type => {
      const sevs = overviewSevByControl[type] || {};
      return {
        type,
        critical: sevs.critical || 0,
        high: sevs.high || 0,
        medium: sevs.medium || 0,
        low: sevs.low || 0,
        info: sevs.info || 0,
      };
    });

    const actionHeatmapByControl = domainOrder.map(type => ({
      type,
      ...(overviewActionByControl[type] || {}),
    }));

    const overviewSevTrend = months.map(m => ({
      month: m,
      critical: overviewSevTrendMap[m]?.critical || 0,
      high: overviewSevTrendMap[m]?.high || 0,
      medium: overviewSevTrendMap[m]?.medium || 0,
      low: overviewSevTrendMap[m]?.low || 0,
    }));

    const topVulnAssets = Object.entries(vulnAssetMap)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10)
      .map(([name, v]) => ({ name, ...v }));

    const riskDistribution = Object.entries(riskBuckets).map(([range, count]) => ({ name: range, value: count }));

    const eventTrendMap: Record<string, Record<string, number>> = {};
    months.forEach(m => { eventTrendMap[m] = { email: 0, endpoint: 0, vulnerability: 0, casb: 0, waf: 0, dlp: 0, "Cloud Apps": 0, "Web": 0, network: 0, identity: 0, cloud: 0 }; });
    const sseTrendRows = tenantIds.length > 0 ? await db.execute(sql`
      SELECT EXTRACT(MONTH FROM occurred_at)::int as month_num,
             CASE WHEN raw_payload->>'dataType' IN ('web_user_activity','web_traffic') THEN 'Web' ELSE 'Cloud Apps' END as sub_type,
             COUNT(*) as cnt
      FROM security_events
      WHERE tenant_id = ANY(${sql.raw(`ARRAY[${tenantIds.join(",")}]`)}) AND event_type = 'sse'${evTimeFilterSec}
      GROUP BY month_num, sub_type
    `) : { rows: [] };
    const sseMonthMap: Record<string, Record<string, number>> = {};
    ((sseTrendRows as any).rows || []).forEach((r: any) => {
      const mName = monthNames[Number(r.month_num) - 1];
      if (!sseMonthMap[mName]) sseMonthMap[mName] = {};
      sseMonthMap[mName][r.sub_type] = Number(r.cnt);
    });
    allEvents.forEach(ev => {
      const m = monthNames[ev.occurredAt.getMonth()];
      if (eventTrendMap[m]) {
        if (ev.eventType === "sse") {
          // handled by SQL below
        } else {
          eventTrendMap[m][ev.eventType] = (eventTrendMap[m][ev.eventType] || 0) + 1;
        }
      }
    });
    months.forEach(m => {
      if (sseMonthMap[m]) {
        eventTrendMap[m]["Cloud Apps"] = (eventTrendMap[m]["Cloud Apps"] || 0) + (sseMonthMap[m]["Cloud Apps"] || 0);
        eventTrendMap[m]["Web"] = (eventTrendMap[m]["Web"] || 0) + (sseMonthMap[m]["Web"] || 0);
      }
    });
    const eventTrend = months.map(month => {
      const c = eventTrendMap[month];
      return { month, ...c, total: Object.values(c).reduce((s, v) => s + v, 0) };
    });

    const incidentTrendMap: Record<string, { incidents: number; resolved: number }> = {};
    months.forEach(m => { incidentTrendMap[m] = { incidents: 0, resolved: 0 }; });
    allIncidents.forEach(inc => {
      const m = monthNames[inc.createdAt.getMonth()];
      if (incidentTrendMap[m]) {
        incidentTrendMap[m].incidents++;
        if (inc.status === "resolved" || inc.status === "closed") {
          incidentTrendMap[m].resolved++;
        }
      }
    });
    const incidentTrend = months.map(month => ({
      month,
      incidents: incidentTrendMap[month].incidents,
      resolved: incidentTrendMap[month].resolved,
    }));

    const recentIncidents = allIncidents.slice(0, 5).map(inc => ({
      id: inc.id, title: inc.title, severity: inc.severity, status: inc.status, createdAt: inc.createdAt.toISOString(),
    }));

    const vulnEvents = allEvents.filter(e => e.eventType === "vulnerability");
    const vulnerabilitySeverity = Object.entries(countBy(vulnEvents, "severity")).map(([name, value]) => ({ name, value }));

    const avgRiskScore = sqlAgg.avgRiskScore;
    const criticalEvents = sqlAgg.eventCounts.critical;
    const blockedEvents = allEvents.filter(e => {
      const a = (e.action || "").toLowerCase();
      if (a.includes("no auto-remediation") || a.includes("no remediation") || a === "no action") return false;
      return a.includes("remediat") || a.includes("blocked") || a.includes("quarantin") || a.includes("isolat") || a.includes("dropped");
    }).length;

    const mttrHours = sqlAgg.mttr;
    const mttdMinutes = sqlAgg.mttd;

    const threatVectorMap = countBy(allEvents, "threatVector");
    const incidentsByThreatVector = topN(threatVectorMap, 12);

    const mitreMap = countByCleanSplit(allEvents, "mitreTactic");
    const mitreTactics = Object.entries(mitreMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    const mitreTechMap = countByCleanSplit(allEvents, "mitreTechnique");
    const topMitreTechniques = topN(mitreTechMap, 10);

    const incMitreMap = countByCleanSplit(allIncidents, "mitreTactic");
    const mitreTacticsDistribution = Object.entries(incMitreMap)
      .map(([name, value]) => ({ name: name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), value }))
      .sort((a, b) => b.value - a.value);

    const mitreAllTactics = [
      "Initial Access", "Execution", "Persistence", "Privilege Escalation",
      "Defense Evasion", "Credential Access", "Discovery", "Lateral Movement",
      "Collection", "Command And Control", "Exfiltration", "Impact",
    ];

    const normalizeTactic = (raw: string): string => {
      const cleaned = raw.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()).trim();
      const mapped: Record<string, string> = {
        "Command And Control": "Command And Control", "Command & Control": "Command And Control",
        "C2": "Command And Control", "Actions On Objectives": "Impact",
        "Data Exfiltration": "Exfiltration", "Detection": "Discovery",
        "Reconnaissance": "Discovery",
      };
      return mapped[cleaned] || mitreAllTactics.find(t => t.toLowerCase() === cleaned.toLowerCase()) || cleaned;
    };

    const techniquesByTactic: Record<string, Record<string, number>> = {};
    mitreAllTactics.forEach(t => { techniquesByTactic[t] = {}; });

    const addTechniqueToTactic = (tactic: string | null, technique: string | null) => {
      if (!tactic || !technique) return;
      const tactics = splitAndClean(tactic);
      const techniques = splitAndClean(technique);
      tactics.forEach(t => {
        const normalized = normalizeTactic(t);
        if (!techniquesByTactic[normalized]) techniquesByTactic[normalized] = {};
        techniques.forEach(tech => {
          const cleanTech = tech.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
          techniquesByTactic[normalized][cleanTech] = (techniquesByTactic[normalized][cleanTech] || 0) + 1;
        });
      });
    };

    allIncidents.forEach(inc => addTechniqueToTactic((inc as any).mitreTactic, (inc as any).mitreTechnique));

    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const isCurrentMonth = (d: Date) => d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    const isPrevMonth = (d: Date) => d.getMonth() === prevMonth && d.getFullYear() === prevYear;

    const tacticCurrentMonth: Record<string, number> = {};
    const tacticPrevMonth: Record<string, number> = {};
    allIncidents.forEach(inc => {
      if (!(inc as any).mitreTactic) return;
      const tactics = splitAndClean((inc as any).mitreTactic);
      tactics.forEach(t => {
        const normalized = normalizeTactic(t);
        if (isCurrentMonth(inc.createdAt)) tacticCurrentMonth[normalized] = (tacticCurrentMonth[normalized] || 0) + 1;
        if (isPrevMonth(inc.createdAt)) tacticPrevMonth[normalized] = (tacticPrevMonth[normalized] || 0) + 1;
      });
    });

    const mitreMatrix = mitreAllTactics.map(tactic => {
      const totalCount = mitreTacticsDistribution.find(d => d.name === tactic)?.value || 0;
      const current = tacticCurrentMonth[tactic] || 0;
      const previous = tacticPrevMonth[tactic] || 0;
      const change = current - previous;
      const changePct = previous > 0 ? Math.round((change / previous) * 100) : (current > 0 ? 100 : 0);
      const techniques = Object.entries(techniquesByTactic[tactic] || {})
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      return { tactic, totalCount, currentMonth: current, previousMonth: previous, change, changePct, techniques };
    });

    const parseRawPayload = (rp: any) => {
      if (!rp) return null;
      try { return typeof rp === "string" ? JSON.parse(rp) : rp; } catch { return null; }
    };

    const killChainMap: Record<string, number> = {};
    const killChainCurrentMonth: Record<string, number> = {};
    const killChainPrevMonth: Record<string, number> = {};
    const killChainOrder = ["reconnaissance", "weaponization", "delivery", "exploitation", "installation", "command_and_control", "actions_on_objectives"];
    const killChainLabels: Record<string, string> = {
      reconnaissance: "Reconnaissance", weaponization: "Weaponization", delivery: "Delivery",
      exploitation: "Exploitation", installation: "Installation",
      command_and_control: "Command & Control", actions_on_objectives: "Actions on Objectives",
    };
    allIncidents.forEach(inc => {
      const phase = (inc as any).killChainPhase;
      if (phase) {
        const key = phase.toLowerCase().replace(/\s+/g, "_");
        killChainMap[key] = (killChainMap[key] || 0) + 1;
        if (isCurrentMonth(inc.createdAt)) killChainCurrentMonth[key] = (killChainCurrentMonth[key] || 0) + 1;
        if (isPrevMonth(inc.createdAt)) killChainPrevMonth[key] = (killChainPrevMonth[key] || 0) + 1;
      }
    });
    allEvents.forEach(ev => {
      const rp = parseRawPayload((ev as any).rawPayload);
      if (rp?.killChainPhase) {
        const key = rp.killChainPhase.toLowerCase().replace(/\s+/g, "_");
        killChainMap[key] = (killChainMap[key] || 0) + 1;
        if (isCurrentMonth(ev.occurredAt)) killChainCurrentMonth[key] = (killChainCurrentMonth[key] || 0) + 1;
        if (isPrevMonth(ev.occurredAt)) killChainPrevMonth[key] = (killChainPrevMonth[key] || 0) + 1;
      }
    });
    const killChainDistribution = killChainOrder.map(phase => ({
      name: killChainLabels[phase] || phase,
      value: killChainMap[phase] || 0,
      currentMonth: killChainCurrentMonth[phase] || 0,
      previousMonth: killChainPrevMonth[phase] || 0,
      change: (killChainCurrentMonth[phase] || 0) - (killChainPrevMonth[phase] || 0),
    }));
    const killChainFull = killChainOrder.map(phase => ({
      name: killChainLabels[phase] || phase,
      key: phase,
      value: killChainMap[phase] || 0,
      currentMonth: killChainCurrentMonth[phase] || 0,
      previousMonth: killChainPrevMonth[phase] || 0,
      change: (killChainCurrentMonth[phase] || 0) - (killChainPrevMonth[phase] || 0),
    }));

    const attackVectorMap: Record<string, number> = {
      "Email Threats": 0, "Endpoint Threats": 0, "Network Attacks": 0,
      "Web Application": 0, "Data Exfiltration": 0, "Identity Attacks": 0,
      "Cloud Security": 0, "Vulnerability": 0,
    };
    allEvents.forEach(ev => {
      const et = ev.eventType;
      if (et === "email") attackVectorMap["Email Threats"]++;
      else if (et === "endpoint") attackVectorMap["Endpoint Threats"]++;
      else if (et === "network") attackVectorMap["Network Attacks"]++;
      else if (et === "waf") attackVectorMap["Web Application"]++;
      else if (et === "dlp") attackVectorMap["Data Exfiltration"]++;
      else if (et === "identity") attackVectorMap["Identity Attacks"]++;
      else if (et === "cloud" || et === "casb" || et === "sse") attackVectorMap["Cloud Security"]++;
      else if (et === "vulnerability") attackVectorMap["Vulnerability"]++;
    });
    allIncidents.forEach(inc => {
      const tactic = ((inc as any).mitreTactic || "").toLowerCase();
      const title = (inc.title || "").toLowerCase();
      if (tactic.includes("exfiltration") || title.includes("exfiltration") || title.includes("dlp")) attackVectorMap["Data Exfiltration"]++;
      else if (tactic.includes("initial_access") && (title.includes("phish") || title.includes("email") || title.includes("bec"))) attackVectorMap["Email Threats"]++;
      else if (tactic.includes("lateral") || title.includes("lateral")) attackVectorMap["Network Attacks"]++;
      else if (title.includes("web") || title.includes("waf") || title.includes("owasp") || title.includes("sql inject") || title.includes("xss")) attackVectorMap["Web Application"]++;
      else if (tactic.includes("credential") || tactic.includes("privilege") || title.includes("brute") || title.includes("unauthorized")) attackVectorMap["Identity Attacks"]++;
      else if (title.includes("vuln") || title.includes("cve")) attackVectorMap["Vulnerability"]++;
      else attackVectorMap["Endpoint Threats"]++;
    });
    const attackVectorDistribution = Object.entries(attackVectorMap)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const actionMap = countBy(allEvents, "action");
    const incidentsByAction = Object.entries(actionMap).map(([name, value]) => ({ name, value }));

    const emailEvents = allEvents.filter(e => e.eventType === "email");
    const threatEmailRegex = /email\s+from\s+(\S+)\s+to\s+(\S+?):/i;
    for (const ev of emailEvents) {
      if (!ev.sender || !ev.recipient) {
        const m = (ev.threat || "").match(threatEmailRegex);
        if (m) {
          if (!ev.sender && m[1]) (ev as any).sender = m[1];
          if (!ev.recipient && m[2]) (ev as any).recipient = m[2].replace(/:$/, "");
        }
      }
      if (!ev.recipient) {
        const extracted = extractRecipientFromDesc(ev.description);
        if (extracted) (ev as any).recipient = extracted;
      }
    }
    const emailByThreat = topN(countBy(emailEvents, "threat"), 10);
    const topSenders = topN(countBy(emailEvents, "sender"), 10);
    const topRecipients = topN(countBy(emailEvents, "recipient"), 10);

    const ACTION_SIMPLIFY: Record<string, string> = {
      "add_spam_header": "Add Spam Header",
      "quarantine_email": "Quarantine",
      "quarantine": "Quarantine",
      "send_email_to_admin_email_phishing": "Notify Admin",
      "send_email_to_admin_email_malware": "Notify Admin",
      "send_email_to_admin_email_ma": "Notify Admin",
      "send_email_to_admin": "Notify Admin",
      "send_to_admin": "Notify Admin",
      "add_graymail_header": "Flag as Graymail",
      "add_smart_banner": "Add Warning Banner",
      "move_to_spam": "Move to Spam",
      "phishing_found_event": "Phishing Detected",
      "block": "Block",
      "blocked": "Block",
      "allow": "Allow",
      "allowed": "Allow",
      "detected": "Detected",
      "drop": "Drop",
      "dropped": "Drop",
      "reject": "Reject",
      "deny": "Deny",
      "clean": "Clean",
      "delete": "Delete",
      "redirect": "Redirect",
      "encrypt": "Encrypt",
      "log": "Log",
      "alert": "Alert",
      "isolate": "Isolate",
      "contain": "Contain",
      "remediate": "Remediate",
    };
    const ACTION_PRIO = [
      "quarantine", "block", "isolate", "contain", "delete", "drop", "reject", "deny",
      "move to spam", "clean", "remediate", "encrypt", "redirect",
      "notify admin", "phishing detected", "flag as graymail", "add warning banner", "add spam header",
      "alert", "log", "detected", "allow",
    ];
    function simplifyActionLabel(raw: string): string {
      const lower = raw.toLowerCase().trim();
      if (ACTION_SIMPLIFY[lower]) return ACTION_SIMPLIFY[lower];
      if (lower.includes(",")) {
        const parts = lower.split(/,\s*/).map(p => p.trim()).filter(Boolean);
        const mapped = parts.map(p => ACTION_SIMPLIFY[p] || p.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()).trim());
        const unique = [...new Set(mapped)];
        for (const prio of ACTION_PRIO) {
          const m = unique.find(u => u.toLowerCase() === prio);
          if (m) return m;
        }
        return unique[0] || "Detected";
      }
      return raw.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()).trim();
    }

    const emailActionMap: Record<string, number> = {};
    emailEvents.forEach(ev => {
      const simplified = simplifyActionLabel(ev.action || "Detected");
      emailActionMap[simplified] = (emailActionMap[simplified] || 0) + 1;
    });
    const emailActions = Object.entries(emailActionMap).map(([name, value]) => ({ name, value }));
    const emailSeverity = Object.entries(countBy(emailEvents, "severity")).map(([name, value]) => ({ name, value }));
    const emailThreatVectors = topN(countBy(emailEvents, "threatVector"), 6);

    const cleanLogSource = (items: any[]) => {
      const m: Record<string, number> = {};
      items.forEach(i => {
        let v = i.logSource;
        if (!v) return;
        if (v.startsWith("[{") || v.startsWith("['{") || v.startsWith("[{'")) {
          const tagMatch = v.match(/tag_name['"]\s*:\s*['"]([^'"]+)/);
          v = tagMatch ? tagMatch[1].replace(/^(DS|DT|DOM|EG):/, "").trim() : "Unknown Source";
        }
        if (v.length > 40) v = v.substring(0, 40);
        m[v] = (m[v] || 0) + 1;
      });
      return m;
    };

    const endpointEvents = allEvents.filter(e => e.eventType === "endpoint");
    const endpointByThreat = topN(countBy(endpointEvents, "threat"), 10);
    const endpointActions = Object.entries(countBy(endpointEvents, "action")).map(([name, value]) => ({ name, value }));
    const endpointHostMap: Record<string, number> = {};
    for (const ev of endpointEvents) {
      const t = ev.target?.trim();
      if (t && !emailAddrRegex.test(t)) { endpointHostMap[t] = (endpointHostMap[t] || 0) + 1; }
      const a = ev.asset?.trim();
      if (a && a !== t && !emailAddrRegex.test(a)) { endpointHostMap[a] = (endpointHostMap[a] || 0) + 1; }
    }
    const topInfectedHosts = topN(endpointHostMap, 10);
    const endpointLogSources = topN(cleanLogSource(endpointEvents), 6);
    const endpointThreatVectors = topN(countBy(endpointEvents, "threatVector"), 8);

    const classifyAction = (action: string | null | undefined): "auto" | "manual" | "none" => {
      if (!action) return "none";
      const al = action.toLowerCase().trim();
      if (al === "no action" || al === "active" || al === "no auto-remediation" || al === "no remediation") return "none";
      if (al === "monitored" || al === "allowed" || al === "logged" || al === "alerted" || al === "detected") return "none";
      if (al === "auto-remediation applied" || al.includes("auto remediat") || al.includes("auto-remediat")) return "auto";
      if (al === "blocked" || al === "quarantined" || al === "isolated" || al === "dropped" || al === "prevented" || al === "denied" || al === "terminated" || al === "sandboxed") return "auto";
      if (al.includes("block") || al.includes("quarantin") || al.includes("isolat") || al.includes("drop") || al.includes("prevent") || al.includes("denied") || al.includes("terminat")) return "auto";
      if (al === "investigated" || al === "escalated" || al === "patched" || al === "ejected" || al === "cleaned" || al === "removed") return "manual";
      if (al.includes("investigat") || al.includes("escalat") || al.includes("patch") || al.includes("eject") || al.includes("clean") || al.includes("remov") || al.includes("manual")) return "manual";
      if (al.includes("remediat")) return "manual";
      return "none";
    };

    const computeRemediationStats = (events: any[]) => {
      let auto = 0, manual = 0, none = 0;
      events.forEach(e => {
        const cls = classifyAction(e.action);
        if (cls === "auto") auto++;
        else if (cls === "manual") manual++;
        else none++;
      });
      const remediated = auto + manual;
      const total = events.length;
      const rate = total > 0 ? Math.round((remediated / total) * 100) : 0;
      const autoPct = remediated > 0 ? Math.round((auto / remediated) * 100) : 0;
      return { total, remediated, auto, manual, none, rate, autoPct };
    };

    const computeIncidentRemediationStats = (incidents: any[]) => {
      let auto = 0, manual = 0, none = 0;
      incidents.forEach(i => {
        const cls = classifyAction(i.actionTaken);
        if (cls === "auto") auto++;
        else if (cls === "manual") manual++;
        else none++;
      });
      const remediated = auto + manual;
      const total = incidents.length;
      const rate = total > 0 ? Math.round((remediated / total) * 100) : 0;
      const autoPct = remediated > 0 ? Math.round((auto / remediated) * 100) : 0;
      return { total, remediated, auto, manual, none, rate, autoPct };
    };

    const globalIncidentRemediation = computeIncidentRemediationStats(allIncidents);
    const remediatedCount = globalIncidentRemediation.remediated;
    const autoRemediatedCount = globalIncidentRemediation.auto;
    const manualRemediatedCount = globalIncidentRemediation.manual;
    const noRemediationCount = globalIncidentRemediation.none;
    const autoRemediationPct = globalIncidentRemediation.autoPct;

    const endpointRemediation = computeRemediationStats(endpointEvents);

    const casbEvents = allEvents.filter(e => e.eventType === "casb");
    const wafEvents = allEvents.filter(e => e.eventType === "waf");
    const dlpEvents = allEvents.filter(e => e.eventType === "dlp");
    const sseEvents = allEvents.filter(e => e.eventType === "sse");
    const networkEvents = allEvents.filter(e => e.eventType === "network");
    const identityEvents = allEvents.filter(e => e.eventType === "identity");
    const cloudEvents = allEvents.filter(e => e.eventType === "cloud");

    const sseRemediation = computeRemediationStats(sseEvents);
    const emailRemediation = computeRemediationStats(emailEvents);
    const networkRemediation = computeRemediationStats(networkEvents);
    const dlpRemediation = computeRemediationStats(dlpEvents);
    const vulnRemediation = computeRemediationStats(vulnEvents);
    const allEventRemediation = computeRemediationStats(allEvents);

    const casbApps = topN(countBy(casbEvents, "app"), 10);
    const casbActions = Object.entries(countBy(casbEvents, "action")).map(([name, value]) => ({ name, value }));

    const wafAttackTypes = topN(countBy(wafEvents, "threat"), 10);
    const wafActions = Object.entries(countBy(wafEvents, "action")).map(([name, value]) => ({ name, value }));
    const wafTargets = topN(countBy(wafEvents, "target"), 6);

    const dlpByThreat = topN(countBy(dlpEvents, "threat"), 6);
    const dlpActions = Object.entries(countBy(dlpEvents, "action")).map(([name, value]) => ({ name, value }));

    const networkByThreat = topN(countBy(networkEvents, "threat"), 10);
    const networkProtocols = Object.entries(countBy(networkEvents, "protocol")).map(([name, value]) => ({ name, value }));

    const identityByThreat = topN(countBy(identityEvents, "threat"), 10);
    const identityActions = Object.entries(countBy(identityEvents, "action")).map(([name, value]) => ({ name, value }));

    const cloudByThreat = topN(countBy(cloudEvents, "threat"), 10);
    const cloudApps = topN(countBy(cloudEvents, "app"), 6);

    const logSourceMap = cleanLogSource(allEvents);
    const topLogSources = topN(logSourceMap, 15);
    const sourceTypeMap = countBy(allEvents, "sourceType");
    const sourceTypes = Object.entries(sourceTypeMap).map(([name, value]) => ({ name, value }));

    const logTrendMap: Record<string, number> = {};
    months.forEach(m => { logTrendMap[m] = 0; });
    allEvents.forEach(ev => {
      const m = monthNames[ev.occurredAt.getMonth()];
      if (logTrendMap[m] !== undefined) logTrendMap[m]++;
    });
    const logIngestionTrend = months.map(month => ({ month, events: logTrendMap[month] }));

    const topCountries = sqlAgg.topCountries;

    const parsePayload = (rp: any) => {
      if (!rp) return null;
      if (typeof rp === "object") return rp;
      try { return JSON.parse(rp); } catch { return null; }
    };

    const dlpPolicyDist: Record<string, number> = {};
    const dlpClassificationDist: Record<string, number> = {};
    const dlpServiceDist: Record<string, number> = {};
    const dlpDestinationDist: Record<string, number> = {};
    const dlpIncidentTypeDist: Record<string, number> = {};
    const dlpUserViolations: Record<string, number> = {};
    let dlpTotalMatchCount = 0;
    for (const ev of dlpEvents) {
      const rp = parsePayload(ev.rawPayload);
      if (rp?.policyName) dlpPolicyDist[rp.policyName] = (dlpPolicyDist[rp.policyName] || 0) + 1;
      if (rp?.classificationTags && Array.isArray(rp.classificationTags)) {
        for (const tag of rp.classificationTags) { dlpClassificationDist[tag] = (dlpClassificationDist[tag] || 0) + 1; }
      } else if (rp?.dataClassification) {
        dlpClassificationDist[rp.dataClassification] = (dlpClassificationDist[rp.dataClassification] || 0) + 1;
      }
      if (rp?.serviceName) dlpServiceDist[rp.serviceName] = (dlpServiceDist[rp.serviceName] || 0) + 1;
      if (rp?.destination) dlpDestinationDist[rp.destination] = (dlpDestinationDist[rp.destination] || 0) + 1;
      if (rp?.incidentType) dlpIncidentTypeDist[rp.incidentType] = (dlpIncidentTypeDist[rp.incidentType] || 0) + 1;
      if (rp?.user) dlpUserViolations[rp.user] = (dlpUserViolations[rp.user] || 0) + 1;
      dlpTotalMatchCount += rp?.matchCount || 0;
    }
    const dlpTopPolicies = topN(dlpPolicyDist, 10);
    const dlpClassifications = Object.entries(dlpClassificationDist).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const dlpTopServices = topN(dlpServiceDist, 10);
    const dlpTopDestinations = topN(dlpDestinationDist, 10);
    const dlpIncidentTypes = Object.entries(dlpIncidentTypeDist).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const dlpTopUsers = topN(dlpUserViolations, 10);
    const dlpUniquePolicies = Object.keys(dlpPolicyDist).length;
    const dlpTopPolicy = dlpTopPolicies.length > 0 ? dlpTopPolicies[0].name : "N/A";
    const dlpBlockedCount = dlpActions.find(a => a.name === "blocked")?.value || 0;
    const dlpMonitoredCount = dlpActions.find(a => a.name === "monitored")?.value || 0;
    const dlpEncryptedCount = dlpActions.find(a => a.name === "encrypted")?.value || 0;

    const vulnByProduct: Record<string, number> = {};
    const vulnBySeverity: Record<string, number> = {};
    const vulnByEndpoint: Record<string, number> = {};
    const vulnByPublisher: Record<string, number> = {};
    const cvssScores: number[] = [];
    const exploitScores: number[] = [];
    let kevCount = 0;
    let patchAvailCount = 0;
    let noPatchCount = 0;
    const uniqueCves = new Set<string>();
    const vulnAgingBuckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };

    vulnEvents.forEach(e => {
      const rp = parsePayload(e.rawPayload);
      const product = rp?.product || e.app || "Unknown";
      const endpoint = rp?.endpoint || e.asset || e.target || "Unknown";
      const publisher = rp?.publisher || "Unknown";
      const sev = rp?.cveSeverity || e.severity || "medium";
      const cvss = rp?.cvss3Score || e.riskScore ? (e.riskScore! / 10) : 0;
      const exploit = rp?.exploitabilityScore || 0;
      const isKev = rp?.inCisaKev === true;
      const hasPatch = rp?.hasPatch === true;
      const cve = rp?.cveName || "";
      const daysOld = rp?.daysSinceDetected || 0;

      vulnByProduct[product] = (vulnByProduct[product] || 0) + 1;
      vulnBySeverity[sev.toLowerCase()] = (vulnBySeverity[sev.toLowerCase()] || 0) + 1;
      vulnByEndpoint[endpoint] = (vulnByEndpoint[endpoint] || 0) + 1;
      vulnByPublisher[publisher] = (vulnByPublisher[publisher] || 0) + 1;
      if (cvss > 0) cvssScores.push(cvss);
      if (exploit > 0) exploitScores.push(exploit);
      if (isKev) kevCount++;
      if (hasPatch) patchAvailCount++;
      else noPatchCount++;
      if (cve) uniqueCves.add(cve);
      if (daysOld <= 30) vulnAgingBuckets["0-30"]++;
      else if (daysOld <= 60) vulnAgingBuckets["31-60"]++;
      else if (daysOld <= 90) vulnAgingBuckets["61-90"]++;
      else vulnAgingBuckets["90+"]++;
    });

    const vulnTopProducts = topN(vulnByProduct, 10);
    const vulnTopEndpoints = topN(vulnByEndpoint, 10);
    const vulnTopPublishers = topN(vulnByPublisher, 10);
    const vulnSeverityDist = Object.entries(vulnBySeverity).map(([name, value]) => ({ name, value }));
    const vulnCvssDistribution = [
      { name: "Critical (9-10)", value: cvssScores.filter(s => s >= 9).length },
      { name: "High (7-8.9)", value: cvssScores.filter(s => s >= 7 && s < 9).length },
      { name: "Medium (4-6.9)", value: cvssScores.filter(s => s >= 4 && s < 7).length },
      { name: "Low (0-3.9)", value: cvssScores.filter(s => s > 0 && s < 4).length },
    ].filter(d => d.value > 0);
    const vulnPatchStatus = [
      { name: "Patch Available", value: patchAvailCount },
      { name: "No Patch", value: noPatchCount },
    ].filter(d => d.value > 0);
    const vulnAging = Object.entries(vulnAgingBuckets).map(([name, value]) => ({ name: name + " days", value })).filter(d => d.value > 0);
    const avgCvss = cvssScores.length > 0 ? (cvssScores.reduce((a, b) => a + b, 0) / cvssScores.length).toFixed(1) : "0";
    const avgExploit = exploitScores.length > 0 ? (exploitScores.reduce((a, b) => a + b, 0) / exploitScores.length).toFixed(1) : "0";

    const emailThreatTypes = sqlAgg.emailThreatTypes || [];
    const emailPhishingSubtypes = sqlAgg.emailPhishingSubtypes || [];
    const emailTopSenderDomains = sqlAgg.emailTopSenderDomains || [];
    const emailAuthResults = sqlAgg.emailAuthResults || [];
    const emailQuarantinedCount = sqlAgg.emailQuarantinedCount || 0;
    const sqlEmailTotal = sqlAgg.emailTotal || 0;
    const emailDeliveredCount = sqlEmailTotal - emailQuarantinedCount;
    const emailQuarantineRate = sqlEmailTotal > 0 ? Math.round((emailQuarantinedCount / sqlEmailTotal) * 100) : 0;

    const emailUserRiskMap: Record<string, { email: string; total: number; spam: number; phishing: number; malware: number; bec: number; suspicious: number; clean: number; riskScore: number }> = {};
    for (const e of emailEvents) {
      const recipient = (e as any).recipient || e.target;
      if (!recipient || typeof recipient !== "string") continue;
      const key = recipient.toLowerCase().trim();
      if (!emailAddrRegex.test(key)) continue;
      if (!emailUserRiskMap[key]) {
        emailUserRiskMap[key] = { email: key, total: 0, spam: 0, phishing: 0, malware: 0, bec: 0, suspicious: 0, clean: 0, riskScore: 0 };
      }
      const u = emailUserRiskMap[key];
      u.total++;
      const threatType = (e.threat || "").toLowerCase();
      if (threatType.includes("spam")) u.spam++;
      else if (threatType.includes("phish") || threatType.includes("credential") || threatType.includes("spear") || threatType.includes("whal") || threatType.includes("clone") || threatType.includes("link-based") || threatType.includes("attachment-based") || threatType.includes("account suspension") || threatType.includes("invoice")) u.phishing++;
      else if (threatType.includes("malware")) u.malware++;
      else if (threatType.includes("bec") || threatType.includes("business email") || threatType.includes("impersonat")) u.bec++;
      else if (threatType.includes("suspicious") || threatType.includes("graymail")) u.suspicious++;
      else if (e.severity === "critical" || e.severity === "high") u.suspicious++;
      else u.clean++;
    }
    const emailUserRiskList = Object.values(emailUserRiskMap).map(u => {
      const threatCount = u.spam + u.phishing + u.malware + u.bec + u.suspicious;
      u.riskScore = u.total > 0 ? Math.min(100, Math.round(
        (u.malware * 25 + u.phishing * 20 + u.bec * 18 + u.suspicious * 10 + u.spam * 3) / Math.max(u.total, 1) * 10
      )) : 0;
      return { ...u, threatCount };
    }).sort((a, b) => b.riskScore - a.riskScore).slice(0, 100);

    let complianceScore = 0;
    if (totalIncidents === 0 && totalEvents === 0) {
      complianceScore = 0;
    } else {
      const resolutionRate = totalIncidents > 0 ? (resolvedIncidents / totalIncidents) * 100 : 50;
      const criticalPenalty = totalIncidents > 0 ? Math.min(30, (criticalIncidents / totalIncidents) * 100) : 0;
      const openPenalty = totalIncidents > 0 ? Math.min(20, (openIncidents / totalIncidents) * 60) : 0;
      const eventSeverityPenalty = totalEvents > 0 ? Math.min(15, (criticalEvents / totalEvents) * 50) : 0;
      complianceScore = Math.round(Math.max(0, Math.min(100,
        resolutionRate * 0.5 + 50 - criticalPenalty - openPenalty - eventSeverityPenalty
      )));
    }

    return {
      totalIncidents, openIncidents, resolvedIncidents, criticalIncidents,
      totalTickets, openTickets, slaBreachCount, totalEvents, avgRiskScore, criticalEvents, blockedEvents,
      mttrHours, mttdMinutes, complianceScore,
      incidentTrend, severityBreakdown, categoryBreakdown, incidentByType, recentIncidents,
      endpointIncidentByType, emailIncidentByType, networkIncidentByType, identityIncidentByType, cloudIncidentByType, webAppIncidentByType, dlpIncidentByType,
      eventsByType, eventsBySeverity, eventTrend,
      topThreats, topTargets, topAttackers, topVulnerableApps, vulnerabilitySeverity,
      topWebUrls, topWebCategories, topTargetsEndpoint, topTargetsEmail,
      incidentsByDomain, eventsByDomain,
      sevHeatmapByControl, actionHeatmapByControl, overviewSevTrend, topVulnAssets, riskDistribution,
      incidentsByThreatVector, mitreTactics, topMitreTechniques, incidentsByAction,
      mitreTacticsDistribution, killChainDistribution, attackVectorDistribution, mitreMatrix, killChainFull,
      emailByThreat, topSenders, topRecipients, emailActions, emailSeverity, emailThreatVectors, emailTotal: sqlEmailTotal,
      emailThreatTypes, emailPhishingSubtypes, emailTopSenderDomains, emailAuthResults, emailQuarantinedCount, emailDeliveredCount, emailQuarantineRate,
      emailUserRiskList,
      endpointByThreat, endpointActions, topInfectedHosts, endpointLogSources, endpointThreatVectors, endpointTotal: endpointEvents.length,
      remediatedCount, noRemediationCount, autoRemediatedCount, manualRemediatedCount, autoRemediationPct,
      endpointRemediation, sseRemediation, emailRemediation, networkRemediation, dlpRemediation, vulnRemediation, allEventRemediation,
      casbApps, casbActions, casbTotal: casbEvents.length,
      wafAttackTypes, wafActions, wafTargets, wafTotal: wafEvents.length,
      dlpByThreat, dlpActions, dlpTotal: dlpEvents.length,
      dlpTopPolicies, dlpClassifications, dlpTopServices, dlpTopDestinations, dlpIncidentTypes,
      dlpTopUsers, dlpUniquePolicies, dlpTopPolicy, dlpBlockedCount, dlpMonitoredCount, dlpEncryptedCount, dlpTotalMatchCount,
      sseTotal: sseEvents.length,
      networkByThreat, networkProtocols, networkTotal: networkEvents.length,
      identityByThreat, identityActions, identityTotal: identityEvents.length,
      cloudByThreat, cloudApps, cloudTotal: cloudEvents.length,
      topLogSources, sourceTypes, logIngestionTrend, topCountries,
      vulnTotal: vulnEvents.length, vulnUniqueCves: uniqueCves.size, vulnKevCount: kevCount,
      vulnTopProducts, vulnTopEndpoints, vulnTopPublishers, vulnSeverityDist, vulnCvssDistribution,
      vulnPatchStatus, vulnAging, vulnAvgCvss: avgCvss, vulnAvgExploit: avgExploit,
      vulnPatchAvailCount: patchAvailCount, vulnNoPatchCount: noPatchCount,
      newAlerts: sqlAgg.newAlerts,
      domainInsights: sqlAgg.domainInsights,
      eventsTimeline: sqlAgg.eventsTimeline,
    };
  }

  async getDataSecurityStats(tenantId: number) {
    const tenant = await this.getTenant(tenantId);
    let allEvents: SecurityEvent[];
    if (tenant && tenant.type === "mssp") {
      const children = await this.getChildTenants(tenantId);
      const tenantIds = [tenantId, ...children.map(c => c.id)];
      allEvents = await db.select().from(securityEvents)
        .where(inArray(securityEvents.tenantId, tenantIds))
        .orderBy(desc(securityEvents.occurredAt))
        .limit(1000);
    } else {
      allEvents = await db.select().from(securityEvents)
        .where(eq(securityEvents.tenantId, tenantId))
        .orderBy(desc(securityEvents.occurredAt))
        .limit(1000);
    }

    const allIncidents = tenant && tenant.type === "mssp"
      ? await db.select().from(incidents).where(inArray(incidents.tenantId, [tenantId, ...(await this.getChildTenants(tenantId)).map(c => c.id)])).orderBy(desc(incidents.createdAt)).limit(1000)
      : await db.select().from(incidents).where(eq(incidents.tenantId, tenantId)).orderBy(desc(incidents.createdAt)).limit(1000);

    const parsePayload = (rp: any) => {
      if (!rp) return null;
      if (typeof rp === "object") return rp;
      try { return JSON.parse(rp); } catch { return null; }
    };

    const topN = (map: Record<string, number>, n = 10) =>
      Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, n);

    const dlpEvents = allEvents.filter(e => e.eventType === "dlp");
    const emailDlpEvents = allEvents.filter(e => e.eventType === "email" && ((e.threat || "").toLowerCase().includes("dlp") || (e.action || "").toLowerCase().includes("block")));
    const casbDlpEvents = allEvents.filter(e => e.eventType === "casb" || e.eventType === "sse");
    const endpointDlpEvents = allEvents.filter(e => e.eventType === "endpoint" && ((e.threat || "").toLowerCase().includes("data") || (e.action || "").toLowerCase().includes("block")));

    const channelMap: Record<string, number> = { "Web DLP": 0, "Email DLP": 0, "Endpoint DLP": 0, "CASB/SWG": 0 };
    channelMap["Web DLP"] = dlpEvents.filter(e => {
      const rp = parsePayload(e.rawPayload);
      return rp?.channel === "web" || rp?.serviceName?.toLowerCase().includes("web") || !rp?.channel;
    }).length;
    channelMap["Email DLP"] = dlpEvents.filter(e => {
      const rp = parsePayload(e.rawPayload);
      return rp?.channel === "email" || rp?.serviceName?.toLowerCase().includes("email") || rp?.serviceName?.toLowerCase().includes("mail");
    }).length + emailDlpEvents.length;
    channelMap["Endpoint DLP"] = dlpEvents.filter(e => {
      const rp = parsePayload(e.rawPayload);
      return rp?.channel === "endpoint" || rp?.serviceName?.toLowerCase().includes("endpoint");
    }).length + endpointDlpEvents.length;
    channelMap["CASB/SWG"] = dlpEvents.filter(e => {
      const rp = parsePayload(e.rawPayload);
      return rp?.channel === "casb" || rp?.channel === "swg" || rp?.serviceName?.toLowerCase().includes("casb");
    }).length;
    if (channelMap["Web DLP"] === 0 && dlpEvents.length > 0) {
      channelMap["Web DLP"] = dlpEvents.length - channelMap["Email DLP"] - channelMap["Endpoint DLP"] - channelMap["CASB/SWG"];
      if (channelMap["Web DLP"] < 0) channelMap["Web DLP"] = 0;
    }

    const stateMap: Record<string, number> = { "In Motion": 0, "At Rest": 0, "In Use": 0, "In Cloud": 0 };
    dlpEvents.forEach(e => {
      const rp = parsePayload(e.rawPayload);
      const inc = rp?.incidentType?.toLowerCase() || "";
      const dest = (rp?.destination || "").toLowerCase();
      const svc = (rp?.serviceName || "").toLowerCase();
      if (inc.includes("upload") || inc.includes("transfer") || inc.includes("send") || dest.includes("external")) stateMap["In Motion"]++;
      else if (inc.includes("storage") || inc.includes("file") || dest.includes("share") || dest.includes("drive")) stateMap["At Rest"]++;
      else if (svc.includes("cloud") || svc.includes("saas") || dest.includes("cloud")) stateMap["In Cloud"]++;
      else stateMap["In Use"]++;
    });

    const policyMap: Record<string, number> = {};
    const userMap: Record<string, number> = {};
    const classMap: Record<string, number> = {};
    const sevMap: Record<string, number> = {};
    const serviceMap: Record<string, number> = {};
    const destMap: Record<string, number> = {};
    const actionMap: Record<string, number> = {};
    let totalMatches = 0;

    dlpEvents.forEach(e => {
      const rp = parsePayload(e.rawPayload);
      if (rp?.policyName) policyMap[rp.policyName] = (policyMap[rp.policyName] || 0) + 1;
      if (rp?.user) userMap[rp.user] = (userMap[rp.user] || 0) + 1;
      if (rp?.classificationTags && Array.isArray(rp.classificationTags)) {
        rp.classificationTags.forEach((t: string) => { classMap[t] = (classMap[t] || 0) + 1; });
      } else if (rp?.dataClassification) {
        classMap[rp.dataClassification] = (classMap[rp.dataClassification] || 0) + 1;
      }
      const sev = e.severity || "medium";
      sevMap[sev] = (sevMap[sev] || 0) + 1;
      if (rp?.serviceName) serviceMap[rp.serviceName] = (serviceMap[rp.serviceName] || 0) + 1;
      if (rp?.destination) destMap[rp.destination] = (destMap[rp.destination] || 0) + 1;
      const a = (e.action || "unknown").toLowerCase();
      const aLabel = a.includes("block") ? "Blocked" : a.includes("encrypt") ? "Encrypted" :
        a.includes("quarantin") ? "Quarantined" : a.includes("monitor") || a.includes("alert") ? "Monitored" :
        a.includes("allow") ? "Allowed" : "Other";
      actionMap[aLabel] = (actionMap[aLabel] || 0) + 1;
      totalMatches += rp?.matchCount || 0;
    });

    const dlpIncidents = allIncidents.filter(i => {
      const cat = (i.category || "").toLowerCase();
      const title = (i.title || "").toLowerCase();
      return cat.includes("dlp") || cat.includes("data") || cat.includes("exfiltration") || title.includes("dlp") || title.includes("data loss");
    });

    const now = new Date();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(monthNames[d.getMonth()]);
    }
    const trendMap: Record<string, Record<string, number>> = {};
    months.forEach(m => { trendMap[m] = { critical: 0, high: 0, medium: 0, low: 0 }; });
    dlpEvents.forEach(e => {
      const m = monthNames[e.occurredAt.getMonth()];
      if (trendMap[m]) {
        const sev = e.severity || "medium";
        trendMap[m][sev] = (trendMap[m][sev] || 0) + 1;
      }
    });
    const dlpTrend = months.map(m => ({ month: m, ...trendMap[m] }));

    return {
      totalDlpEvents: dlpEvents.length,
      totalDlpIncidents: dlpIncidents.length,
      totalDataMatches: totalMatches,
      channelBreakdown: Object.entries(channelMap).map(([name, value]) => ({ name, value })).filter(d => d.value > 0),
      stateBreakdown: Object.entries(stateMap).map(([name, value]) => ({ name, value })).filter(d => d.value > 0),
      topOffenders: topN(userMap, 10),
      topPolicies: topN(policyMap, 10),
      topServices: topN(serviceMap, 10),
      topDestinations: topN(destMap, 10),
      classifications: Object.entries(classMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      severityBreakdown: Object.entries(sevMap).map(([name, value]) => ({ name, value })),
      actionBreakdown: Object.entries(actionMap).map(([name, value]) => ({ name, value })),
      dlpTrend,
      recentIncidents: dlpIncidents.slice(0, 10).map(i => ({
        id: i.id, title: i.title, severity: i.severity, status: i.status, createdAt: i.createdAt.toISOString(),
      })),
    };
  }

  async getServices(tenantId: number): Promise<Service[]> {
    return db.select().from(services)
      .where(eq(services.tenantId, tenantId))
      .orderBy(desc(services.createdAt))
      .limit(1000);
  }

  async getService(id: number): Promise<Service | undefined> {
    const [service] = await db.select().from(services).where(eq(services.id, id));
    return service;
  }

  async createService(data: InsertService): Promise<Service> {
    const [service] = await db.insert(services).values(data).returning();
    return service;
  }

  async updateService(id: number, data: Partial<InsertService>): Promise<Service> {
    const [service] = await db.update(services)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(services.id, id))
      .returning();
    return service;
  }

  async getSlaDefinitions(serviceId: number): Promise<SlaDefinition[]> {
    return db.select().from(slaDefinitions)
      .where(eq(slaDefinitions.serviceId, serviceId))
      .orderBy(slaDefinitions.priority);
  }

  async getSlaDefinition(id: number): Promise<SlaDefinition | undefined> {
    const [sla] = await db.select().from(slaDefinitions).where(eq(slaDefinitions.id, id));
    return sla;
  }

  async createSlaDefinition(data: InsertSlaDefinition): Promise<SlaDefinition> {
    const [sla] = await db.insert(slaDefinitions).values(data).returning();
    return sla;
  }

  async updateSlaDefinition(id: number, data: Partial<InsertSlaDefinition>): Promise<SlaDefinition> {
    const [sla] = await db.update(slaDefinitions)
      .set(data)
      .where(eq(slaDefinitions.id, id))
      .returning();
    return sla;
  }

  async deleteSlaDefinition(id: number): Promise<void> {
    await db.delete(slaDefinitions).where(eq(slaDefinitions.id, id));
  }

  async getTeamMembers(tenantId: number): Promise<TeamMember[]> {
    return db.select().from(teamMembers)
      .where(eq(teamMembers.tenantId, tenantId))
      .orderBy(teamMembers.name);
  }

  async getTeamMembersByType(tenantId: number, teamType: string): Promise<TeamMember[]> {
    return db.select().from(teamMembers)
      .where(and(eq(teamMembers.tenantId, tenantId), eq(teamMembers.teamType, teamType as any)))
      .orderBy(teamMembers.name);
  }

  async getTeamMember(id: number): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.id, id));
    return member;
  }

  async createTeamMember(data: InsertTeamMember): Promise<TeamMember> {
    const [member] = await db.insert(teamMembers).values(data).returning();
    return member;
  }

  async updateTeamMember(id: number, data: Partial<InsertTeamMember>): Promise<TeamMember> {
    const [member] = await db.update(teamMembers)
      .set(data)
      .where(eq(teamMembers.id, id))
      .returning();
    return member;
  }

  async getShiftRosters(tenantId: number): Promise<ShiftRoster[]> {
    return db.select().from(shiftRosters)
      .where(eq(shiftRosters.tenantId, tenantId))
      .orderBy(desc(shiftRosters.shiftDate));
  }

  async getShiftRostersByDate(tenantId: number, startDate: Date, endDate: Date): Promise<ShiftRoster[]> {
    return db.select().from(shiftRosters)
      .where(and(
        eq(shiftRosters.tenantId, tenantId),
        gte(shiftRosters.shiftDate, startDate),
        lte(shiftRosters.shiftDate, endDate)
      ))
      .orderBy(shiftRosters.shiftDate);
  }

  async createShiftRoster(data: InsertShiftRoster): Promise<ShiftRoster> {
    const [shift] = await db.insert(shiftRosters).values(data).returning();
    return shift;
  }

  async updateShiftRoster(id: number, data: Partial<InsertShiftRoster>): Promise<ShiftRoster> {
    const [shift] = await db.update(shiftRosters)
      .set(data)
      .where(eq(shiftRosters.id, id))
      .returning();
    return shift;
  }

  async deleteShiftRoster(id: number): Promise<void> {
    await db.delete(shiftRosters).where(eq(shiftRosters.id, id));
  }

  async getDocuments(tenantId: number): Promise<Document[]> {
    return db.select().from(documents)
      .where(eq(documents.tenantId, tenantId))
      .orderBy(desc(documents.updatedAt))
      .limit(1000);
  }

  async getDocumentsByCategory(tenantId: number, category: string): Promise<Document[]> {
    return db.select().from(documents)
      .where(and(eq(documents.tenantId, tenantId), eq(documents.category, category as any)))
      .orderBy(desc(documents.updatedAt))
      .limit(500);
  }

  async getDocument(id: number): Promise<Document | undefined> {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    return doc;
  }

  async createDocument(data: InsertDocument): Promise<Document> {
    const [doc] = await db.insert(documents).values(data).returning();
    return doc;
  }

  async updateDocument(id: number, data: Partial<InsertDocument>): Promise<Document> {
    const [doc] = await db.update(documents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    return doc;
  }

  async deleteDocument(id: number): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  async getSuperadminByUsername(username: string): Promise<Superadmin | undefined> {
    const [admin] = await db.select().from(superadmins).where(eq(superadmins.username, username));
    return admin;
  }

  async createSuperadmin(data: InsertSuperadmin): Promise<Superadmin> {
    const [admin] = await db.insert(superadmins).values(data).returning();
    return admin;
  }

  async updateSuperadminLastLogin(id: number): Promise<void> {
    await db.update(superadmins).set({ lastLoginAt: new Date() }).where(eq(superadmins.id, id));
  }

  async updateSuperadminPassword(id: number, passwordHash: string): Promise<void> {
    await db.update(superadmins).set({ passwordHash }).where(eq(superadmins.id, id));
  }

  async getLicenses(): Promise<License[]> {
    return db.select().from(licenses).orderBy(desc(licenses.createdAt));
  }

  async getLicensesByTenant(tenantId: number): Promise<License[]> {
    return db.select().from(licenses).where(eq(licenses.tenantId, tenantId)).orderBy(desc(licenses.createdAt));
  }

  async getLicense(id: number): Promise<License | undefined> {
    const [license] = await db.select().from(licenses).where(eq(licenses.id, id));
    return license;
  }

  async createLicense(data: InsertLicense): Promise<License> {
    const [license] = await db.insert(licenses).values(data).returning();
    return license;
  }

  async updateLicense(id: number, data: Partial<InsertLicense>): Promise<License> {
    const [license] = await db.update(licenses)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(licenses.id, id))
      .returning();
    return license;
  }

  async deleteLicense(id: number): Promise<void> {
    await db.delete(licenses).where(eq(licenses.id, id));
  }

  async updateTenant(id: number, data: Partial<InsertTenant>): Promise<Tenant> {
    const [tenant] = await db.update(tenants)
      .set(data)
      .where(eq(tenants.id, id))
      .returning();
    return tenant;
  }

  async deleteTenant(id: number): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query("UPDATE tenants SET parent_id = NULL WHERE parent_id = $1", [id]);

      const projectRes = await client.query("SELECT id FROM projects WHERE tenant_id = $1", [id]);
      const projectIds = projectRes.rows.map((r: any) => r.id);
      if (projectIds.length > 0) {
        for (const pid of projectIds) {
          await client.query("DELETE FROM activity_logs WHERE project_id = $1", [pid]);
          await client.query("DELETE FROM project_activities WHERE project_id = $1", [pid]);
          await client.query("DELETE FROM project_raci WHERE project_id = $1", [pid]);
          await client.query("DELETE FROM project_risks WHERE project_id = $1", [pid]);
          await client.query("DELETE FROM project_scope WHERE project_id = $1", [pid]);
          await client.query("DELETE FROM tasks WHERE project_id = $1", [pid]);
        }
        await client.query("DELETE FROM projects WHERE tenant_id = $1", [id]);
      }

      const ticketRes = await client.query("SELECT id FROM tickets WHERE tenant_id = $1", [id]);
      const ticketIds = ticketRes.rows.map((r: any) => r.id);
      if (ticketIds.length > 0) {
        for (const tkid of ticketIds) {
          await client.query("DELETE FROM ticket_attachments WHERE ticket_id = $1", [tkid]);
          await client.query("DELETE FROM ticket_comments WHERE ticket_id = $1", [tkid]);
          await client.query("DELETE FROM ticket_feedback WHERE ticket_id = $1", [tkid]);
        }
        await client.query("DELETE FROM tickets WHERE tenant_id = $1", [id]);
      }

      const serviceRes = await client.query("SELECT id FROM services WHERE tenant_id = $1", [id]);
      if (serviceRes.rows.length > 0) {
        for (const svc of serviceRes.rows) {
          await client.query("DELETE FROM sla_definitions WHERE service_id = $1", [svc.id]);
        }
        await client.query("DELETE FROM services WHERE tenant_id = $1", [id]);
      }

      await client.query("DELETE FROM shift_rosters WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM ai_agent_activity_logs WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM project_raci WHERE team_member_id IN (SELECT id FROM team_members WHERE tenant_id = $1)", [id]);
      await client.query("DELETE FROM team_members WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM incidents WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM security_events WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM assets WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM user_assets WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM reports WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM report_schedules WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM documents WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM security_integrations WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM licenses WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM tenant_users WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM ai_investigations WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM analyst_feedback WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM cloud_app_risk_attributes WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM data_retention_policies WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM email_configurations WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM incident_notifications WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM infrastructure_locations WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM ingest_api_keys WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM ingest_batches WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM risk_scores WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM tenant_security_tools WHERE tenant_id = $1", [id]);
      await client.query("DELETE FROM tenants WHERE id = $1", [id]);

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

    const projectList = await db.select({ id: projects.id }).from(projects).where(eq(projects.tenantId, id));
    const projectIds = projectList.map(p => p.id);
    if (projectIds.length > 0) {
      for (const pid of projectIds) {
        await db.delete(activityLogs).where(eq(activityLogs.projectId, pid));
        await db.delete(projectActivities).where(eq(projectActivities.projectId, pid));
        await db.delete(projectRaci).where(eq(projectRaci.projectId, pid));
        await db.delete(projectRisks).where(eq(projectRisks.projectId, pid));
        await db.delete(projectScope).where(eq(projectScope.projectId, pid));
        await db.delete(tasks).where(eq(tasks.projectId, pid));
      }
      await db.delete(projects).where(eq(projects.tenantId, id));
    }

    const ticketList = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.tenantId, id));
    const ticketIds = ticketList.map(t => t.id);
    if (ticketIds.length > 0) {
      for (const tkid of ticketIds) {
        await db.delete(ticketAttachments).where(eq(ticketAttachments.ticketId, tkid));
        await db.delete(ticketComments).where(eq(ticketComments.ticketId, tkid));
        await db.delete(ticketFeedback).where(eq(ticketFeedback.ticketId, tkid));
      }
      await db.delete(tickets).where(eq(tickets.tenantId, id));
    }

    const serviceList = await db.select({ id: services.id }).from(services).where(eq(services.tenantId, id));
    if (serviceList.length > 0) {
      for (const svc of serviceList) {
        await db.delete(slaDefinitions).where(eq(slaDefinitions.serviceId, svc.id));
      }
      await db.delete(services).where(eq(services.tenantId, id));
    }

    await db.delete(shiftRosters).where(eq(shiftRosters.tenantId, id));
    await db.delete(aiAgentActivityLog).where(eq(aiAgentActivityLog.tenantId, id));
    await db.delete(projectRaci).where(sql`${projectRaci.teamMemberId} IN (SELECT id FROM team_members WHERE tenant_id = ${id})`);
    await db.delete(teamMembers).where(eq(teamMembers.tenantId, id));

    await db.delete(incidents).where(eq(incidents.tenantId, id));
    await db.delete(securityEvents).where(eq(securityEvents.tenantId, id));
    await db.delete(assets).where(eq(assets.tenantId, id));
    await db.delete(userAssets).where(eq(userAssets.tenantId, id));
    await db.delete(reports).where(eq(reports.tenantId, id));
    await db.delete(reportSchedules).where(eq(reportSchedules.tenantId, id));
    await db.delete(documents).where(eq(documents.tenantId, id));
    await db.delete(securityIntegrations).where(eq(securityIntegrations.tenantId, id));
    await db.delete(licenses).where(eq(licenses.tenantId, id));
    await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, id));
    await db.delete(aiInvestigations).where(eq(aiInvestigations.tenantId, id));
    await db.delete(analystFeedback).where(eq(analystFeedback.tenantId, id));
    await db.delete(cloudAppRiskAttributes).where(eq(cloudAppRiskAttributes.tenantId, id));
    await db.delete(dataRetentionPolicies).where(eq(dataRetentionPolicies.tenantId, id));
    await db.delete(emailConfigurations).where(eq(emailConfigurations.tenantId, id));
    await db.delete(incidentNotifications).where(eq(incidentNotifications.tenantId, id));
    await db.delete(infrastructureLocations).where(eq(infrastructureLocations.tenantId, id));
    await db.delete(ingestApiKeys).where(eq(ingestApiKeys.tenantId, id));
    await db.delete(ingestBatches).where(eq(ingestBatches.tenantId, id));
    await db.delete(riskScores).where(eq(riskScores.tenantId, id));
    await db.delete(tenantSecurityTools).where(eq(tenantSecurityTools.tenantId, id));

    await db.delete(tenants).where(eq(tenants.id, id));
  }

  async getTenantUsersByTenant(tenantId: number): Promise<TenantUser[]> {
    return db.select().from(tenantUsers).where(eq(tenantUsers.tenantId, tenantId)).orderBy(tenantUsers.createdAt);
  }

  async updateTenantUser(id: number, data: Partial<InsertTenantUser>): Promise<TenantUser> {
    const [tu] = await db.update(tenantUsers)
      .set(data)
      .where(eq(tenantUsers.id, id))
      .returning();
    return tu;
  }

  async deleteTenantUser(id: number): Promise<void> {
    await db.delete(tenantUsers).where(eq(tenantUsers.id, id));
  }

  async getTicketFeedback(ticketId: number): Promise<TicketFeedback[]> {
    return db.select().from(ticketFeedback).where(eq(ticketFeedback.ticketId, ticketId)).orderBy(desc(ticketFeedback.createdAt));
  }

  async getTicketFeedbackByUser(ticketId: number, userId: string): Promise<TicketFeedback | undefined> {
    const [fb] = await db.select().from(ticketFeedback).where(and(eq(ticketFeedback.ticketId, ticketId), eq(ticketFeedback.userId, userId)));
    return fb;
  }

  async createTicketFeedback(data: InsertTicketFeedback): Promise<TicketFeedback> {
    const [fb] = await db.insert(ticketFeedback).values(data).returning();
    return fb;
  }

  async getTicketAttachments(ticketId: number): Promise<TicketAttachment[]> {
    return db.select().from(ticketAttachments).where(eq(ticketAttachments.ticketId, ticketId)).orderBy(desc(ticketAttachments.createdAt));
  }

  async createTicketAttachment(data: InsertTicketAttachment): Promise<TicketAttachment> {
    const [att] = await db.insert(ticketAttachments).values(data).returning();
    return att;
  }

  async deleteTicketAttachment(id: number): Promise<void> {
    await db.delete(ticketAttachments).where(eq(ticketAttachments.id, id));
  }

  async getSecurityIntegrations(tenantId: number): Promise<SecurityIntegration[]> {
    return db.select().from(securityIntegrations)
      .where(and(eq(securityIntegrations.tenantId, tenantId), isNull(securityIntegrations.deletedAt)))
      .orderBy(securityIntegrations.platformName)
      .limit(500);
  }

  async getDeletedSecurityIntegrations(tenantId: number): Promise<SecurityIntegration[]> {
    return db.select().from(securityIntegrations)
      .where(and(eq(securityIntegrations.tenantId, tenantId), isNotNull(securityIntegrations.deletedAt)))
      .orderBy(desc(securityIntegrations.deletedAt))
      .limit(200);
  }

  async getSecurityIntegration(id: number): Promise<SecurityIntegration | undefined> {
    const [integration] = await db.select().from(securityIntegrations).where(eq(securityIntegrations.id, id));
    return integration;
  }

  async getAllSecurityIntegrations(): Promise<SecurityIntegration[]> {
    return db.select().from(securityIntegrations).where(isNull(securityIntegrations.deletedAt));
  }

  async getDeletedSecurityIntegrationByPlatform(tenantId: number, platformKey: string): Promise<SecurityIntegration | undefined> {
    const [integration] = await db.select().from(securityIntegrations)
      .where(and(
        eq(securityIntegrations.tenantId, tenantId),
        eq(securityIntegrations.platformKey, platformKey),
        isNotNull(securityIntegrations.deletedAt)
      ));
    return integration;
  }

  async createSecurityIntegration(data: InsertSecurityIntegration): Promise<SecurityIntegration> {
    const [integration] = await db.insert(securityIntegrations).values(data).returning();
    return integration;
  }

  async updateSecurityIntegration(id: number, data: Partial<SecurityIntegration>): Promise<SecurityIntegration> {
    const [integration] = await db.update(securityIntegrations).set({ ...data, updatedAt: new Date() }).where(eq(securityIntegrations.id, id)).returning();
    return integration;
  }

  async updateAssetSyncStatus(id: number, status: string, message: string, syncedAt?: Date): Promise<void> {
    await db.update(securityIntegrations)
      .set({
        assetSyncStatus: status,
        assetSyncMessage: message,
        ...(syncedAt ? { lastAssetSyncAt: syncedAt } : {}),
        updatedAt: new Date(),
      })
      .where(eq(securityIntegrations.id, id));
  }

  async deleteSecurityIntegration(id: number): Promise<void> {
    await db.update(securityIntegrations)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(securityIntegrations.id, id));
  }

  async restoreSecurityIntegration(id: number): Promise<SecurityIntegration> {
    const [integration] = await db.update(securityIntegrations)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(securityIntegrations.id, id))
      .returning();
    return integration;
  }

  async logIntegrationAudit(data: InsertIntegrationAuditLog): Promise<void> {
    try {
      await db.insert(integrationAuditLog).values(data);
    } catch (e: any) {
      console.error("[AuditLog] Failed to write integration audit entry:", e.message?.substring(0, 120));
    }
  }

  async getIntegrationAuditLog(tenantId: number, integrationId?: number): Promise<IntegrationAuditLog[]> {
    const conditions = integrationId
      ? and(eq(integrationAuditLog.tenantId, tenantId), eq(integrationAuditLog.integrationId, integrationId))
      : eq(integrationAuditLog.tenantId, tenantId);
    return db.select().from(integrationAuditLog)
      .where(conditions)
      .orderBy(desc(integrationAuditLog.createdAt))
      .limit(200);
  }

  async getAssets(tenantId: number): Promise<Asset[]> {
    if (!tenantId || isNaN(tenantId) || tenantId <= 0) return [];
    return db.select().from(assets).where(eq(assets.tenantId, tenantId)).orderBy(assets.hostname).limit(1000);
  }

  async getAssetsLight(tenantId: number): Promise<any[]> {
    if (!tenantId || isNaN(tenantId) || tenantId <= 0) return [];
    const { softwareInventory, enrichmentData, eolFindings, ...lightCols } = getTableColumns(assets);
    return db.select(lightCols).from(assets).where(eq(assets.tenantId, tenantId)).orderBy(assets.hostname).limit(1000);
  }

  async getAssetsSoftwareData(tenantId: number, limit = 500): Promise<any[]> {
    if (!tenantId || isNaN(tenantId) || tenantId <= 0) return [];
    const r = await pool.query(
      `SELECT id, tenant_id as "tenantId", hostname, operating_system as "operatingSystem",
              status, risk_level as "riskLevel", risk_score as "riskScore",
              endpoint_type as "endpointType", source, last_seen as "lastSeen",
              software_inventory as "softwareInventory"
       FROM assets WHERE tenant_id = $1 ORDER BY hostname LIMIT $2`,
      [tenantId, limit]
    );
    return r.rows;
  }

  async getAsset(id: number): Promise<Asset | undefined> {
    const [asset] = await db.select().from(assets).where(eq(assets.id, id));
    return asset;
  }

  async createAsset(data: InsertAsset): Promise<Asset> {
    const [asset] = await db.insert(assets).values(data).returning();
    return asset;
  }

  async createAssets(data: InsertAsset[]): Promise<Asset[]> {
    if (data.length === 0) return [];
    const batchSize = 500;
    const results: Asset[] = [];
    for (let i = 0; i < data.length; i += batchSize) {
      const chunk = data.slice(i, i + batchSize);
      const inserted = await db.insert(assets).values(chunk).returning();
      results.push(...inserted);
    }
    return results;
  }

  async updateAsset(id: number, data: Partial<InsertAsset>): Promise<Asset> {
    const [asset] = await db.update(assets).set({ ...data, updatedAt: new Date() }).where(eq(assets.id, id)).returning();
    return asset;
  }

  async getAssetsByHostnames(tenantId: number, hostnames: string[]): Promise<Asset[]> {
    if (hostnames.length === 0) return [];
    const lowerHostnames = hostnames.map(h => h.toLowerCase());
    return db.select().from(assets).where(and(eq(assets.tenantId, tenantId), inArray(sql`LOWER(${assets.hostname})`, lowerHostnames))).limit(1000);
  }

  async getAssetsByHostnamesLight(tenantId: number, hostnames: string[]): Promise<any[]> {
    if (hostnames.length === 0) return [];
    const lowerHostnames = hostnames.map(h => h.toLowerCase());
    const { eolFindings, ...lightCols } = getTableColumns(assets);

    // Chunk into groups of 100 to avoid massive IN-clause plan regressions
    const CHUNK = 100;
    const results: any[] = [];
    for (let i = 0; i < lowerHostnames.length; i += CHUNK) {
      const chunk = lowerHostnames.slice(i, i + CHUNK);
      const rows = await db.select(lightCols).from(assets).where(
        and(eq(assets.tenantId, tenantId), inArray(sql`LOWER(${assets.hostname})`, chunk))
      ).limit(1000);
      results.push(...rows);
    }
    return results;
  }

  async getUserAssets(tenantId: number): Promise<UserAsset[]> {
    return db.select().from(userAssets).where(eq(userAssets.tenantId, tenantId)).orderBy(userAssets.userName).limit(1000);
  }

  async getUserAsset(id: number): Promise<UserAsset | undefined> {
    const [ua] = await db.select().from(userAssets).where(eq(userAssets.id, id));
    return ua;
  }

  async getUserAssetByUsername(tenantId: number, userName: string): Promise<UserAsset | undefined> {
    const [ua] = await db.select().from(userAssets).where(and(eq(userAssets.tenantId, tenantId), eq(userAssets.userName, userName)));
    return ua;
  }

  async createUserAsset(data: InsertUserAsset): Promise<UserAsset> {
    const [ua] = await db.insert(userAssets).values(data).returning();
    return ua;
  }

  async createUserAssets(data: InsertUserAsset[]): Promise<UserAsset[]> {
    if (data.length === 0) return [];
    const batchSize = 500;
    const results: UserAsset[] = [];
    for (let i = 0; i < data.length; i += batchSize) {
      const chunk = data.slice(i, i + batchSize);
      const inserted = await db.insert(userAssets).values(chunk).returning();
      results.push(...inserted);
    }
    return results;
  }

  async updateUserAsset(id: number, data: Partial<InsertUserAsset>): Promise<UserAsset> {
    const [ua] = await db.update(userAssets).set({ ...data, updatedAt: new Date() }).where(eq(userAssets.id, id)).returning();
    return ua;
  }

  async bulkUpdateUserAssets(updates: Array<{id: number, data: Partial<InsertUserAsset>}>): Promise<void> {
    if (updates.length === 0) return;
    const now = new Date();
    const batchSize = 20;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      await Promise.all(batch.map(({ id, data }) =>
        db.update(userAssets).set({ ...data, updatedAt: now }).where(eq(userAssets.id, id))
      ));
    }
  }

  async deleteUserAsset(id: number): Promise<void> {
    await db.delete(userAssets).where(eq(userAssets.id, id));
  }

  async getReportSchedules(tenantId: number): Promise<ReportSchedule[]> {
    return db.select().from(reportSchedules).where(eq(reportSchedules.tenantId, tenantId)).orderBy(desc(reportSchedules.createdAt));
  }

  async getReportSchedule(id: number): Promise<ReportSchedule | undefined> {
    const [s] = await db.select().from(reportSchedules).where(eq(reportSchedules.id, id));
    return s;
  }

  async createReportSchedule(data: InsertReportSchedule): Promise<ReportSchedule> {
    const [s] = await db.insert(reportSchedules).values(data).returning();
    return s;
  }

  async updateReportSchedule(id: number, data: Partial<InsertReportSchedule>): Promise<ReportSchedule> {
    const [s] = await db.update(reportSchedules).set({ ...data, updatedAt: new Date() }).where(eq(reportSchedules.id, id)).returning();
    return s;
  }

  async deleteReportSchedule(id: number): Promise<void> {
    await db.delete(reportSchedules).where(eq(reportSchedules.id, id));
  }

  async getDueReportSchedules(): Promise<ReportSchedule[]> {
    return db.select().from(reportSchedules).where(
      and(
        eq(reportSchedules.enabled, true),
        lte(reportSchedules.nextRunAt, new Date())
      )
    );
  }

  async getProjectScopes(projectId: number): Promise<ProjectScope[]> {
    return db.select().from(projectScope).where(eq(projectScope.projectId, projectId)).orderBy(projectScope.sortOrder);
  }
  async createProjectScope(data: InsertProjectScope): Promise<ProjectScope> {
    const [s] = await db.insert(projectScope).values(data).returning();
    return s;
  }
  async updateProjectScope(id: number, data: Partial<InsertProjectScope>): Promise<ProjectScope> {
    const [s] = await db.update(projectScope).set(data).where(eq(projectScope.id, id)).returning();
    return s;
  }
  async deleteProjectScope(id: number): Promise<void> {
    await db.delete(projectScope).where(eq(projectScope.id, id));
  }

  async getProjectActivities(projectId: number): Promise<ProjectActivity[]> {
    return db.select().from(projectActivities).where(eq(projectActivities.projectId, projectId)).orderBy(projectActivities.sortOrder);
  }
  async getProjectActivity(id: number): Promise<ProjectActivity | undefined> {
    const [a] = await db.select().from(projectActivities).where(eq(projectActivities.id, id));
    return a;
  }
  async createProjectActivity(data: InsertProjectActivity): Promise<ProjectActivity> {
    const [a] = await db.insert(projectActivities).values(data).returning();
    return a;
  }
  async updateProjectActivity(id: number, data: Partial<InsertProjectActivity>): Promise<ProjectActivity> {
    const [a] = await db.update(projectActivities).set({ ...data, updatedAt: new Date() }).where(eq(projectActivities.id, id)).returning();
    return a;
  }
  async deleteProjectActivity(id: number): Promise<void> {
    await db.delete(projectRaci).where(eq(projectRaci.activityId, id));
    await db.delete(projectActivities).where(eq(projectActivities.id, id));
  }

  async getProjectRaciByProject(projectId: number): Promise<ProjectRaci[]> {
    return db.select().from(projectRaci).where(eq(projectRaci.projectId, projectId));
  }
  async createProjectRaci(data: InsertProjectRaci): Promise<ProjectRaci> {
    const [r] = await db.insert(projectRaci).values(data).returning();
    return r;
  }
  async deleteProjectRaci(id: number): Promise<void> {
    await db.delete(projectRaci).where(eq(projectRaci.id, id));
  }
  async deleteProjectRaciByActivity(activityId: number, teamMemberId: number): Promise<void> {
    await db.delete(projectRaci).where(and(eq(projectRaci.activityId, activityId), eq(projectRaci.teamMemberId, teamMemberId)));
  }

  async getProjectRisks(projectId: number): Promise<ProjectRisk[]> {
    return db.select().from(projectRisks).where(eq(projectRisks.projectId, projectId)).orderBy(desc(projectRisks.riskScore));
  }
  async createProjectRisk(data: InsertProjectRisk): Promise<ProjectRisk> {
    const [r] = await db.insert(projectRisks).values(data).returning();
    return r;
  }
  async updateProjectRisk(id: number, data: Partial<InsertProjectRisk>): Promise<ProjectRisk> {
    const [r] = await db.update(projectRisks).set({ ...data, updatedAt: new Date() }).where(eq(projectRisks.id, id)).returning();
    return r;
  }
  async deleteProjectRisk(id: number): Promise<void> {
    await db.delete(projectRisks).where(eq(projectRisks.id, id));
  }

  async getActivityLogs(projectId: number): Promise<ActivityLog[]> {
    return db.select().from(activityLogs).where(eq(activityLogs.projectId, projectId)).orderBy(desc(activityLogs.createdAt)).limit(500);
  }
  async createActivityLog(data: InsertActivityLog): Promise<ActivityLog> {
    const [l] = await db.insert(activityLogs).values(data).returning();
    return l;
  }

  async getIngestApiKeys(tenantId: number): Promise<IngestApiKey[]> {
    return db.select().from(ingestApiKeys)
      .where(eq(ingestApiKeys.tenantId, tenantId))
      .orderBy(desc(ingestApiKeys.createdAt));
  }

  async getIngestApiKey(id: number): Promise<IngestApiKey | undefined> {
    const [key] = await db.select().from(ingestApiKeys).where(eq(ingestApiKeys.id, id));
    return key;
  }

  async getIngestApiKeyByHash(keyHash: string): Promise<IngestApiKey | undefined> {
    const [key] = await db.select().from(ingestApiKeys)
      .where(and(eq(ingestApiKeys.keyHash, keyHash), eq(ingestApiKeys.isActive, true)));
    return key;
  }

  async createIngestApiKey(data: InsertIngestApiKey): Promise<IngestApiKey> {
    const [key] = await db.insert(ingestApiKeys).values(data).returning();
    return key;
  }

  async updateIngestApiKeyLastUsed(id: number): Promise<void> {
    await db.update(ingestApiKeys).set({ lastUsedAt: new Date() }).where(eq(ingestApiKeys.id, id));
  }

  async deleteIngestApiKey(id: number): Promise<void> {
    await db.update(ingestApiKeys).set({ isActive: false }).where(eq(ingestApiKeys.id, id));
  }

  async getIngestBatches(tenantId: number): Promise<IngestBatch[]> {
    return db.select().from(ingestBatches)
      .where(eq(ingestBatches.tenantId, tenantId))
      .orderBy(desc(ingestBatches.startedAt))
      .limit(100);
  }

  async getIngestBatch(id: number): Promise<IngestBatch | undefined> {
    const [batch] = await db.select().from(ingestBatches).where(eq(ingestBatches.id, id));
    return batch;
  }

  async createIngestBatch(data: InsertIngestBatch): Promise<IngestBatch> {
    const [batch] = await db.insert(ingestBatches).values(data).returning();
    return batch;
  }

  async updateIngestBatch(id: number, data: Partial<InsertIngestBatch> & { completedAt?: Date }): Promise<IngestBatch> {
    const [batch] = await db.update(ingestBatches).set(data as any).where(eq(ingestBatches.id, id)).returning();
    return batch;
  }

  async claimIngestBatch(id: number, fromStatus: IngestBatch["status"], toStatus: IngestBatch["status"]): Promise<boolean> {
    const result = await db
      .update(ingestBatches)
      .set({ status: toStatus })
      .where(and(eq(ingestBatches.id, id), eq(ingestBatches.status, fromStatus)))
      .returning({ id: ingestBatches.id });
    return result.length === 1;
  }

  async getInvestigations(tenantId: number): Promise<AiInvestigation[]> {
    return db.select().from(aiInvestigations)
      .where(eq(aiInvestigations.tenantId, tenantId))
      .orderBy(desc(aiInvestigations.createdAt))
      .limit(100);
  }

  async getInvestigation(id: number, tenantId: number): Promise<AiInvestigation | undefined> {
    const [inv] = await db.select().from(aiInvestigations)
      .where(and(eq(aiInvestigations.id, id), eq(aiInvestigations.tenantId, tenantId)));
    return inv;
  }

  async getInvestigationByIncident(incidentId: number, tenantId: number): Promise<AiInvestigation | undefined> {
    const [inv] = await db.select().from(aiInvestigations)
      .where(and(eq(aiInvestigations.incidentId, incidentId), eq(aiInvestigations.tenantId, tenantId)))
      .orderBy(desc(aiInvestigations.createdAt))
      .limit(1);
    return inv;
  }

  async getDlqEntries(tenantId?: number): Promise<EventDlqEntry[]> {
    if (tenantId) {
      return db.select().from(eventDeadLetterQueue)
        .where(eq(eventDeadLetterQueue.tenantId, tenantId))
        .orderBy(desc(eventDeadLetterQueue.createdAt))
        .limit(100);
    }
    return db.select().from(eventDeadLetterQueue)
      .orderBy(desc(eventDeadLetterQueue.createdAt))
      .limit(100);
  }

  async getDlqStats(): Promise<{ failed: number; retrying: number; recovered: number; abandoned: number; total: number }> {
    const result = await pool.query(
      `SELECT status, COUNT(*) as cnt FROM event_dead_letter_queue GROUP BY status`
    );
    const stats = { failed: 0, retrying: 0, recovered: 0, abandoned: 0, total: 0 };
    for (const row of result.rows) {
      const count = parseInt(row.cnt, 10);
      (stats as any)[row.status] = count;
      stats.total += count;
    }
    return stats;
  }

  async createDlqEntry(data: InsertEventDlqEntry): Promise<EventDlqEntry> {
    const [entry] = await db.insert(eventDeadLetterQueue).values(data).returning();
    return entry;
  }

  async updateDlqEntry(id: number, data: Partial<EventDlqEntry>): Promise<EventDlqEntry> {
    const [entry] = await db.update(eventDeadLetterQueue).set(data as any).where(eq(eventDeadLetterQueue.id, id)).returning();
    return entry;
  }

  /**
   * Returns DLQ entries eligible for automatic retry:
   * status='failed', retry_count < max_retries, and not retried in the last 5 minutes.
   */
  async getRetryableDlqEntries(limit = 20): Promise<EventDlqEntry[]> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return db.select().from(eventDeadLetterQueue)
      .where(
        and(
          eq(eventDeadLetterQueue.status, "failed"),
          lt(eventDeadLetterQueue.retryCount, eventDeadLetterQueue.maxRetries),
          or(
            isNull(eventDeadLetterQueue.lastRetryAt),
            lte(eventDeadLetterQueue.lastRetryAt, fiveMinutesAgo)
          )
        )
      )
      .orderBy(eventDeadLetterQueue.createdAt)
      .limit(limit);
  }

  async getOrgStakeholders(tenantId: number, category?: string): Promise<OrgStakeholder[]> {
    if (category) {
      return db.select().from(orgStakeholders).where(and(eq(orgStakeholders.tenantId, tenantId), eq(orgStakeholders.category, category))).orderBy(orgStakeholders.category, orgStakeholders.subcategory);
    }
    return db.select().from(orgStakeholders).where(eq(orgStakeholders.tenantId, tenantId)).orderBy(orgStakeholders.category, orgStakeholders.subcategory);
  }

  async getOrgStakeholder(id: number): Promise<OrgStakeholder | undefined> {
    const [s] = await db.select().from(orgStakeholders).where(eq(orgStakeholders.id, id));
    return s;
  }

  async createOrgStakeholder(data: InsertOrgStakeholder): Promise<OrgStakeholder> {
    const [s] = await db.insert(orgStakeholders).values(data).returning();
    return s;
  }

  async updateOrgStakeholder(id: number, data: Partial<InsertOrgStakeholder>): Promise<OrgStakeholder> {
    const [s] = await db.update(orgStakeholders).set({ ...data, updatedAt: new Date() } as any).where(eq(orgStakeholders.id, id)).returning();
    return s;
  }

  async deleteOrgStakeholder(id: number): Promise<void> {
    await db.delete(orgStakeholders).where(eq(orgStakeholders.id, id));
  }

  async getSuppressionRules(tenantId: number): Promise<SuppressionRule[]> {
    return db.select().from(suppressionRules).where(eq(suppressionRules.tenantId, tenantId)).orderBy(suppressionRules.createdAt);
  }

  async createSuppressionRule(data: InsertSuppressionRule): Promise<SuppressionRule> {
    const [r] = await db.insert(suppressionRules).values(data).returning();
    return r;
  }

  async updateSuppressionRule(id: number, tenantId: number, data: Partial<InsertSuppressionRule> & { isActive?: boolean }): Promise<SuppressionRule> {
    const payload: Partial<typeof suppressionRules.$inferInsert> & { updatedAt: Date } = {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.field !== undefined && { field: data.field }),
      ...(data.operator !== undefined && { operator: data.operator }),
      ...(data.value !== undefined && { value: data.value }),
      ...(data.action !== undefined && { action: data.action }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      updatedAt: new Date(),
    };
    const [r] = await db.update(suppressionRules).set(payload).where(and(eq(suppressionRules.id, id), eq(suppressionRules.tenantId, tenantId))).returning();
    return r;
  }

  async deleteSuppressionRule(id: number, tenantId: number): Promise<void> {
    await db.delete(suppressionRules).where(and(eq(suppressionRules.id, id), eq(suppressionRules.tenantId, tenantId)));
  }

  async getLogSources(tenantId: number): Promise<LogSource[]> {
    return db.select().from(logSources).where(eq(logSources.tenantId, tenantId)).orderBy(logSources.createdAt);
  }

  async getLogSource(id: number, tenantId: number): Promise<LogSource | undefined> {
    const [s] = await db.select().from(logSources).where(and(eq(logSources.id, id), eq(logSources.tenantId, tenantId)));
    return s;
  }

  async createLogSource(data: InsertLogSource): Promise<LogSource> {
    const [s] = await db.insert(logSources).values(data).returning();
    return s;
  }

  async updateLogSource(id: number, tenantId: number, data: Partial<InsertLogSource>): Promise<LogSource> {
    const updateData: Partial<InsertLogSource> & { updatedAt: Date } = { ...data, updatedAt: new Date() };
    const [s] = await db.update(logSources).set(updateData).where(and(eq(logSources.id, id), eq(logSources.tenantId, tenantId))).returning();
    return s;
  }

  async deleteLogSource(id: number, tenantId: number): Promise<void> {
    await db.delete(logSources).where(and(eq(logSources.id, id), eq(logSources.tenantId, tenantId)));
  }

  async getDeviceFingerprint(tenantId: number, sourceIdentifier: string): Promise<DeviceFingerprint | undefined> {
    const [fp] = await db.select().from(deviceFingerprints)
      .where(and(eq(deviceFingerprints.tenantId, tenantId), eq(deviceFingerprints.sourceIdentifier, sourceIdentifier)));
    return fp;
  }

  async getDeviceFingerprintById(id: number): Promise<DeviceFingerprint | undefined> {
    const [fp] = await db.select().from(deviceFingerprints).where(eq(deviceFingerprints.id, id));
    return fp;
  }

  async createDeviceFingerprint(data: InsertDeviceFingerprint): Promise<DeviceFingerprint> {
    const [fp] = await db.insert(deviceFingerprints).values(data).returning();
    return fp;
  }

  async updateDeviceFingerprint(id: number, data: Partial<InsertDeviceFingerprint>): Promise<DeviceFingerprint> {
    const updateData: Partial<InsertDeviceFingerprint> & { updatedAt: Date } = { ...data, updatedAt: new Date() };
    const [fp] = await db.update(deviceFingerprints).set(updateData).where(eq(deviceFingerprints.id, id)).returning();
    return fp;
  }

  async getSourceHealth(sourceId: number, tenantId?: number): Promise<SourceHealth | undefined> {
    const conditions = tenantId !== undefined
      ? and(eq(sourceHealth.sourceId, sourceId), eq(sourceHealth.tenantId, tenantId))
      : eq(sourceHealth.sourceId, sourceId);
    const [h] = await db.select().from(sourceHealth).where(conditions);
    return h;
  }

  async getSourceHealthByTenant(tenantId: number): Promise<SourceHealth[]> {
    return db.select().from(sourceHealth).where(eq(sourceHealth.tenantId, tenantId)).orderBy(desc(sourceHealth.updatedAt));
  }

  async upsertSourceHealth(sourceId: number, tenantId: number, data: Partial<InsertSourceHealth>): Promise<SourceHealth> {
    const existing = await this.getSourceHealth(sourceId);

    if (existing) {
      const now = new Date();
      const prevSeen = existing.lastSeen ? new Date(existing.lastSeen) : now;
      const elapsedMinutes = Math.max((now.getTime() - prevSeen.getTime()) / 60000, 0.01667);
      const incomingEvents = data.totalEventsToday !== undefined ? data.totalEventsToday - (existing.totalEventsToday ?? 0) : 0;
      const computedEventsPerMin = incomingEvents > 0 ? Math.round((incomingEvents / elapsedMinutes) * 100) / 100 : existing.eventsPerMin ?? 0;

      const successRate = data.parseSuccessRate !== undefined ? data.parseSuccessRate : existing.parseSuccessRate ?? 100;
      const computedErrorRate = Math.max(0, Math.round((100 - successRate) * 100) / 100);

      const updateData: Partial<InsertSourceHealth> & { eventsPerMin: number; errorRate: number; updatedAt: Date } = {
        ...data,
        eventsPerMin: computedEventsPerMin,
        errorRate: computedErrorRate,
        updatedAt: now,
      };
      const [h] = await db.update(sourceHealth)
        .set(updateData)
        .where(eq(sourceHealth.sourceId, sourceId))
        .returning();
      return h;
    }

    const [h] = await db.insert(sourceHealth).values({
      sourceId,
      tenantId,
      eventsPerMin: data.eventsPerMin ?? 0,
      parseSuccessRate: data.parseSuccessRate ?? 100,
      lastSeen: data.lastSeen ?? new Date(),
      errorRate: data.errorRate ?? 0,
      totalEventsToday: data.totalEventsToday ?? 0,
    }).returning();
    return h;
  }

  async resolveTenantBySourceIp(ip: string): Promise<number | null> {
    const rows = await db
      .select({ tenantId: logSources.tenantId })
      .from(logSources)
      .where(and(eq(logSources.host, ip), eq(logSources.isActive, true)))
      .limit(1);
    return rows[0]?.tenantId ?? null;
  }
}

export const storage = new DatabaseStorage();

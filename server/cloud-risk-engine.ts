import { db } from "./db";
import { securityEvents, cloudAppRiskScores, userAssets } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

interface AppAggregation {
  appName: string;
  sanctionStatus: string;
  serviceCategory: string;
  isAI: boolean;
  isShadowIT: boolean;
  users: Set<string>;
  countries: Set<string>;
  sourceIps: Set<string>;
  totalActivities: number;
  uploads: number;
  downloads: number;
  activityTypes: Record<string, number>;
  riskScores: number[];
  activityTimes: Date[];
  reputation: string;
}

const ENTERPRISE_APPS = new Set([
  "microsoft 365", "google workspace", "salesforce", "servicenow", "workday",
  "sap", "oracle", "adobe creative cloud", "slack", "zoom", "cisco webex",
  "jira", "confluence", "github", "gitlab", "azure devops", "aws",
  "microsoft azure", "google cloud", "okta", "onelogin", "duo security",
  "crowdstrike", "palo alto", "fortinet", "checkpoint", "splunk",
  "datadog", "snowflake", "tableau", "power bi", "box", "dropbox business",
  "docusign", "hubspot", "zendesk", "freshdesk", "monday.com", "asana",
  "trello", "notion", "airtable", "miro", "figma", "canva",
  "microsoft teams", "onedrive", "sharepoint", "exchange online",
]);

const HIGH_RISK_CATEGORIES = new Set([
  "generative ai", "file sharing", "peer to peer", "anonymous proxy",
  "personal storage", "social media", "gaming", "streaming media",
  "cryptocurrency", "remote access", "hacking tools",
]);

const MODERATE_RISK_CATEGORIES = new Set([
  "messaging", "webmail", "marketing", "advertising",
  "developer tools", "education", "news",
]);

const LOW_RISK_CATEGORIES = new Set([
  "document/productivity", "general saas", "crm", "erp",
  "security", "identity management", "business intelligence",
  "collaboration", "project management", "hr management",
]);

const HIGH_RISK_COUNTRIES = new Set([
  "CN", "RU", "KP", "IR", "SY", "CU", "VE", "BY", "MM",
]);

const MODERATE_RISK_COUNTRIES = new Set([
  "UA", "PK", "BD", "NG", "VN", "TH", "PH", "ID", "EG",
]);

const PRIVACY_COMPLIANT_CATEGORIES = new Set([
  "document/productivity", "general saas", "crm", "erp", "security",
  "identity management", "collaboration", "project management",
  "business intelligence", "hr management",
]);

const AUDITABLE_INDICATORS = new Set([
  "microsoft", "google", "amazon", "salesforce", "oracle", "sap",
  "cisco", "ibm", "vmware", "adobe", "atlassian", "okta",
  "crowdstrike", "palo alto", "splunk", "servicenow", "workday",
  "box", "dropbox", "docusign", "zendesk", "hubspot",
]);

const KNOWN_MALICIOUS_PATTERNS = [
  "torrent", "crack", "keygen", "hack", "exploit", "darkweb",
  "proxy", "vpn free", "anonymizer",
];

interface FactorResult {
  score: number;
  weight: number;
  details: string;
  indicators: string[];
}

function computeShadowITRisk(app: AppAggregation): FactorResult {
  const indicators: string[] = [];
  let score = 100;

  if (app.sanctionStatus === "Unsanctioned") {
    score -= 60;
    indicators.push("Unsanctioned application");
  }
  if (app.isShadowIT) {
    score -= 30;
    indicators.push("Detected as Shadow IT");
  }
  if (app.sanctionStatus === "Sanctioned") {
    indicators.push("IT-approved application");
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    weight: 12,
    details: app.sanctionStatus === "Sanctioned" ? "Sanctioned by IT" : "Not sanctioned - Shadow IT risk",
    indicators,
  };
}

function computePrivacyCompliance(app: AppAggregation): FactorResult {
  const indicators: string[] = [];
  let score = 50;
  const catLower = (app.serviceCategory || "").toLowerCase();

  if (PRIVACY_COMPLIANT_CATEGORIES.has(catLower)) {
    score += 30;
    indicators.push("Category typically GDPR/privacy compliant");
  }

  const nameLower = app.appName.toLowerCase();
  const isEnterprise = [...ENTERPRISE_APPS].some(e => nameLower.includes(e));
  if (isEnterprise) {
    score += 20;
    indicators.push("Enterprise vendor with privacy certifications");
  }

  if (app.isAI) {
    score -= 25;
    indicators.push("AI service may process/retain user data");
  }

  if (app.uploads > app.downloads * 2 && app.uploads > 100) {
    score -= 15;
    indicators.push("High upload volume - data exposure risk");
  }

  if (HIGH_RISK_CATEGORIES.has(catLower)) {
    score -= 20;
    indicators.push(`High-risk category: ${app.serviceCategory}`);
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    weight: 10,
    details: score >= 70 ? "Likely privacy compliant" : score >= 40 ? "Partial privacy compliance" : "Privacy compliance concerns",
    indicators,
  };
}

function computeDataResidency(app: AppAggregation): FactorResult {
  const indicators: string[] = [];
  let score = 80;

  const countries = [...app.countries];
  const highRiskCountries = countries.filter(c => HIGH_RISK_COUNTRIES.has(c.toUpperCase()));
  const moderateRiskCountries = countries.filter(c => MODERATE_RISK_COUNTRIES.has(c.toUpperCase()));

  if (highRiskCountries.length > 0) {
    score -= 40;
    indicators.push(`Data accessed from high-risk regions: ${highRiskCountries.join(", ")}`);
  }
  if (moderateRiskCountries.length > 0) {
    score -= 15;
    indicators.push(`Data accessed from moderate-risk regions: ${moderateRiskCountries.join(", ")}`);
  }
  if (countries.length > 5) {
    score -= 10;
    indicators.push(`Data accessed from ${countries.length} countries - dispersed geo footprint`);
  }
  if (countries.length <= 2 && highRiskCountries.length === 0) {
    score += 10;
    indicators.push("Limited geographic exposure");
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    weight: 8,
    details: `Accessed from ${countries.length} countries${highRiskCountries.length > 0 ? " (includes high-risk)" : ""}`,
    indicators,
  };
}

function computeAuditability(app: AppAggregation): FactorResult {
  const indicators: string[] = [];
  let score = 30;

  const nameLower = app.appName.toLowerCase();
  const hasAuditCapability = [...AUDITABLE_INDICATORS].some(vendor => nameLower.includes(vendor));

  if (hasAuditCapability) {
    score += 40;
    indicators.push("Vendor supports audit logging and SSO/MFA");
  }

  if (app.sanctionStatus === "Sanctioned") {
    score += 20;
    indicators.push("Sanctioned apps typically have audit trails configured");
  }

  const isEnterprise = [...ENTERPRISE_APPS].some(e => nameLower.includes(e));
  if (isEnterprise) {
    score += 10;
    indicators.push("Enterprise-grade with compliance certifications");
  }

  if (app.isAI && !hasAuditCapability) {
    score -= 15;
    indicators.push("AI service without established audit controls");
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    weight: 8,
    details: score >= 60 ? "Auditable with logging support" : "Limited audit capabilities",
    indicators,
  };
}

function computeBlacklistReputation(app: AppAggregation): FactorResult {
  const indicators: string[] = [];
  let score = 85;

  const nameLower = app.appName.toLowerCase();
  const isMaliciousPattern = KNOWN_MALICIOUS_PATTERNS.some(p => nameLower.includes(p));
  if (isMaliciousPattern) {
    score -= 70;
    indicators.push("Matches known malicious/suspicious pattern");
  }

  if (app.reputation && app.reputation.toLowerCase().includes("high risk")) {
    score -= 50;
    indicators.push(`High-risk reputation: ${app.reputation}`);
  } else if (app.reputation && app.reputation.toLowerCase().includes("unverified")) {
    score -= 20;
    indicators.push("Unverified reputation");
  } else if (app.reputation && app.reputation.toLowerCase().includes("minimal risk")) {
    score += 10;
    indicators.push("Minimal risk reputation");
  }

  const avgRisk = app.riskScores.length > 0
    ? app.riskScores.reduce((a, b) => a + b, 0) / app.riskScores.length
    : 50;
  if (avgRisk >= 70) {
    score -= 25;
    indicators.push(`High average risk score: ${avgRisk.toFixed(0)}`);
  } else if (avgRisk <= 30) {
    score += 10;
    indicators.push(`Low average risk score: ${avgRisk.toFixed(0)}`);
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    weight: 12,
    details: score >= 70 ? "Clean reputation" : score >= 40 ? "Some reputation concerns" : "Blacklisted or malicious",
    indicators,
  };
}

function computeEnterpriseReadiness(app: AppAggregation): FactorResult {
  const indicators: string[] = [];
  let score = 30;

  const nameLower = app.appName.toLowerCase();
  const isEnterprise = [...ENTERPRISE_APPS].some(e => nameLower.includes(e));

  if (isEnterprise) {
    score += 50;
    indicators.push("Recognized enterprise application");
  }

  if (app.sanctionStatus === "Sanctioned") {
    score += 15;
    indicators.push("IT-sanctioned for enterprise use");
  }

  const catLower = (app.serviceCategory || "").toLowerCase();
  if (LOW_RISK_CATEGORIES.has(catLower)) {
    score += 10;
    indicators.push(`Enterprise category: ${app.serviceCategory}`);
  }

  if (app.users.size >= 5) {
    score += 5;
    indicators.push(`Widely adopted (${app.users.size} users)`);
  }

  if (HIGH_RISK_CATEGORIES.has(catLower) && !isEnterprise) {
    score -= 20;
    indicators.push("High-risk category without enterprise credentials");
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    weight: 8,
    details: isEnterprise ? "Enterprise-grade application" : "Consumer or unverified application",
    indicators,
  };
}

function computeDataExfiltrationRisk(app: AppAggregation): FactorResult {
  const indicators: string[] = [];
  let score = 80;

  const uploadRatio = app.downloads > 0 ? app.uploads / app.downloads : (app.uploads > 0 ? 10 : 0);

  if (uploadRatio > 5) {
    score -= 40;
    indicators.push(`Extreme upload/download ratio: ${uploadRatio.toFixed(1)}x`);
  } else if (uploadRatio > 2) {
    score -= 20;
    indicators.push(`High upload/download ratio: ${uploadRatio.toFixed(1)}x`);
  }

  if (app.uploads > 1000) {
    score -= 20;
    indicators.push(`Very high upload count: ${app.uploads}`);
  } else if (app.uploads > 500) {
    score -= 10;
    indicators.push(`Elevated upload count: ${app.uploads}`);
  }

  if (app.sanctionStatus === "Unsanctioned" && app.uploads > 100) {
    score -= 15;
    indicators.push("Data uploads to unsanctioned service");
  }

  if (app.isAI && app.uploads > 50) {
    score -= 10;
    indicators.push("Data being fed to AI service");
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    weight: 10,
    details: score >= 70 ? "Low exfiltration risk" : score >= 40 ? "Moderate exfiltration indicators" : "High exfiltration risk",
    indicators,
  };
}

function computeUserBehaviorAnomalies(app: AppAggregation): FactorResult {
  const indicators: string[] = [];
  let score = 80;

  if (app.countries.size > 5) {
    score -= 15;
    indicators.push(`Accessed from ${app.countries.size} countries - possible credential sharing`);
  }

  if (app.sourceIps.size > 20) {
    score -= 10;
    indicators.push(`${app.sourceIps.size} unique source IPs - unusual access pattern`);
  }

  if (app.activityTimes.length > 0) {
    const hours = app.activityTimes.map(t => t.getHours());
    const offHoursCount = hours.filter(h => h < 6 || h > 22).length;
    const offHoursRatio = offHoursCount / hours.length;
    if (offHoursRatio > 0.3) {
      score -= 15;
      indicators.push(`${(offHoursRatio * 100).toFixed(0)}% off-hours activity`);
    }
  }

  const activityPerUser = app.users.size > 0 ? app.totalActivities / app.users.size : 0;
  if (activityPerUser > 500) {
    score -= 15;
    indicators.push(`High per-user activity: ${activityPerUser.toFixed(0)} actions/user`);
  }

  if (app.activityTypes["delete"] > 10) {
    score -= 10;
    indicators.push(`${app.activityTypes["delete"]} delete operations detected`);
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    weight: 8,
    details: score >= 70 ? "Normal behavior patterns" : "Behavioral anomalies detected",
    indicators,
  };
}

function computeAIGenAIRisk(app: AppAggregation): FactorResult {
  const indicators: string[] = [];
  let score = 80;

  if (!app.isAI) {
    return { score: 90, weight: 8, details: "Not an AI/GenAI service", indicators: ["Non-AI service"] };
  }

  score -= 20;
  indicators.push("AI/GenAI service detected");

  const catLower = (app.serviceCategory || "").toLowerCase();
  if (catLower.includes("generative ai")) {
    score -= 15;
    indicators.push("Generative AI - may train on uploaded data");
  }

  if (app.uploads > 100) {
    score -= 15;
    indicators.push(`${app.uploads} data uploads to AI service`);
  }

  if (app.sanctionStatus === "Unsanctioned") {
    score -= 20;
    indicators.push("Unsanctioned AI service - data governance risk");
  }

  if (app.users.size > 10) {
    score -= 5;
    indicators.push(`${app.users.size} users sending data to AI`);
  }

  const nameLower = app.appName.toLowerCase();
  const isEnterprise = [...ENTERPRISE_APPS].some(e => nameLower.includes(e));
  if (isEnterprise) {
    score += 15;
    indicators.push("Enterprise AI with data protection policies");
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    weight: 8,
    details: score >= 60 ? "Managed AI risk" : "Significant AI data exposure risk",
    indicators,
  };
}

function computeAccessConcentration(app: AppAggregation): FactorResult {
  const indicators: string[] = [];
  let score = 70;
  const userCount = app.users.size;

  if (userCount === 1) {
    score -= 20;
    indicators.push("Single-user dependency - bus factor risk");
  } else if (userCount === 2) {
    score -= 10;
    indicators.push("Very few users (2) - limited oversight");
  } else if (userCount >= 10) {
    score += 15;
    indicators.push(`Broad adoption (${userCount} users) - good oversight`);
  } else if (userCount >= 5) {
    score += 10;
    indicators.push(`Moderate adoption (${userCount} users)`);
  }

  if (userCount === 1 && app.uploads > 50) {
    score -= 10;
    indicators.push("Single user uploading significant data");
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    weight: 6,
    details: `${userCount} user${userCount !== 1 ? "s" : ""} accessing this service`,
    indicators,
  };
}

function computeActivityVolumeRisk(app: AppAggregation, allAppsAvgActivity: number): FactorResult {
  const indicators: string[] = [];
  let score = 80;

  const deviation = allAppsAvgActivity > 0 ? app.totalActivities / allAppsAvgActivity : 1;

  if (deviation > 10) {
    score -= 35;
    indicators.push(`Activity ${deviation.toFixed(1)}x above average - extreme outlier`);
  } else if (deviation > 5) {
    score -= 20;
    indicators.push(`Activity ${deviation.toFixed(1)}x above average - significant outlier`);
  } else if (deviation > 2) {
    score -= 10;
    indicators.push(`Activity ${deviation.toFixed(1)}x above average`);
  }

  if (app.totalActivities > 5000) {
    score -= 10;
    indicators.push(`Very high total activity: ${app.totalActivities}`);
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    weight: 6,
    details: `${app.totalActivities} total activities (${deviation.toFixed(1)}x avg)`,
    indicators,
  };
}

function computeCategoryRisk(app: AppAggregation): FactorResult {
  const indicators: string[] = [];
  let score = 60;
  const catLower = (app.serviceCategory || "unknown").toLowerCase();

  if (HIGH_RISK_CATEGORIES.has(catLower)) {
    score -= 30;
    indicators.push(`High-risk category: ${app.serviceCategory}`);
  } else if (MODERATE_RISK_CATEGORIES.has(catLower)) {
    score -= 10;
    indicators.push(`Moderate-risk category: ${app.serviceCategory}`);
  } else if (LOW_RISK_CATEGORIES.has(catLower)) {
    score += 30;
    indicators.push(`Low-risk category: ${app.serviceCategory}`);
  } else {
    indicators.push(`Unclassified category: ${app.serviceCategory || "Unknown"}`);
  }

  if (app.sanctionStatus === "Sanctioned") {
    score += 10;
    indicators.push("Sanctioned mitigates category risk");
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    weight: 4,
    details: `Category: ${app.serviceCategory || "Unknown"}`,
    indicators,
  };
}

function computeConfidenceIndex(app: AppAggregation, avgActivity: number): {
  confidenceIndex: number;
  riskClassification: string;
  factorScores: Record<string, { score: number; weight: number; details: string }>;
  factorDetails: Record<string, { indicators: string[] }>;
} {
  const factors: Record<string, FactorResult> = {
    shadowIT: computeShadowITRisk(app),
    privacyCompliance: computePrivacyCompliance(app),
    dataResidency: computeDataResidency(app),
    auditability: computeAuditability(app),
    blacklistReputation: computeBlacklistReputation(app),
    enterpriseReadiness: computeEnterpriseReadiness(app),
    dataExfiltration: computeDataExfiltrationRisk(app),
    userBehavior: computeUserBehaviorAnomalies(app),
    aiGenAIRisk: computeAIGenAIRisk(app),
    accessConcentration: computeAccessConcentration(app),
    activityVolume: computeActivityVolumeRisk(app, avgActivity),
    categoryRisk: computeCategoryRisk(app),
  };

  let totalWeight = 0;
  let weightedSum = 0;
  for (const f of Object.values(factors)) {
    totalWeight += f.weight;
    weightedSum += f.score * f.weight;
  }

  const confidenceIndex = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;

  let riskClassification: string;
  if (confidenceIndex >= 75) riskClassification = "trusted";
  else if (confidenceIndex >= 50) riskClassification = "moderate";
  else if (confidenceIndex >= 25) riskClassification = "risky";
  else riskClassification = "critical";

  const factorScores: Record<string, { score: number; weight: number; details: string }> = {};
  const factorDetails: Record<string, { indicators: string[] }> = {};
  for (const [key, f] of Object.entries(factors)) {
    factorScores[key] = { score: f.score, weight: f.weight, details: f.details };
    factorDetails[key] = { indicators: f.indicators };
  }

  return { confidenceIndex, riskClassification, factorScores, factorDetails };
}

export async function calculateCloudAppRiskScores(tenantId: number) {
  const events = await db.select().from(securityEvents).where(
    and(
      eq(securityEvents.tenantId, tenantId),
      sql`${securityEvents.eventType} IN ('sse', 'cloud')`
    )
  );

  const appMap = new Map<string, AppAggregation>();

  for (const ev of events) {
    const payload = (ev.rawPayload || {}) as Record<string, any>;
    const dataType = payload.dataType as string;

    if (dataType === "cloud_activity") {
      const appName = payload.serviceName || ev.app || "";
      if (!appName) continue;

      if (!appMap.has(appName)) {
        appMap.set(appName, {
          appName,
          sanctionStatus: payload.sanctionStatus || "Unknown",
          serviceCategory: payload.serviceCategory || "",
          isAI: !!payload.isAI,
          isShadowIT: !!payload.isShadowIT,
          users: new Set(),
          countries: new Set(),
          sourceIps: new Set(),
          totalActivities: 0,
          uploads: 0,
          downloads: 0,
          activityTypes: {},
          riskScores: [],
          activityTimes: [],
          reputation: "",
        });
      }

      const agg = appMap.get(appName)!;
      if (payload.userName) agg.users.add(payload.userName);
      if (payload.country) agg.countries.add(payload.country);
      if (payload.sourceIp) {
        const ips = (payload.sourceIp as string).split(",").map((s: string) => s.trim());
        ips.forEach((ip: string) => agg.sourceIps.add(ip));
      }

      const count = Number(payload.activityCount) || 1;
      agg.totalActivities += count;

      const actType = (payload.activityType || "").toLowerCase();
      agg.activityTypes[actType] = (agg.activityTypes[actType] || 0) + count;
      if (actType === "upload" || actType === "upload-photo") agg.uploads += count;
      if (actType === "download") agg.downloads += count;

      if (ev.riskScore) agg.riskScores.push(ev.riskScore);
      if (ev.occurredAt) agg.activityTimes.push(new Date(ev.occurredAt));

      if (payload.sanctionStatus) agg.sanctionStatus = payload.sanctionStatus;
      if (payload.serviceCategory) agg.serviceCategory = payload.serviceCategory;
      if (payload.isAI) agg.isAI = true;
      if (payload.isShadowIT) agg.isShadowIT = true;
    }

    if (dataType === "web_user_activity") {
      const appNames = payload.applicationNames
        ? (payload.applicationNames as string).split(",").map((s: string) => s.trim()).filter(Boolean)
        : [];

      for (const name of appNames) {
        if (!appMap.has(name)) {
          appMap.set(name, {
            appName: name,
            sanctionStatus: "Unknown",
            serviceCategory: "",
            isAI: false,
            isShadowIT: false,
            users: new Set(),
            countries: new Set(),
            sourceIps: new Set(),
            totalActivities: 0,
            uploads: 0,
            downloads: 0,
            activityTypes: {},
            riskScores: [],
            activityTimes: [],
            reputation: payload.reputation || "",
          });
        }
        const agg = appMap.get(name)!;
        if (payload.userName) agg.users.add(payload.userName);
        agg.totalActivities += Math.round((Number(payload.totalRequests) || 0) / Math.max(appNames.length, 1));
        agg.uploads += Math.round((Number(payload.uploadedBytesMB) || 0) / Math.max(appNames.length, 1));
        agg.downloads += Math.round((Number(payload.downloadedBytesMB) || 0) / Math.max(appNames.length, 1));
        if (payload.reputation) agg.reputation = payload.reputation;
        if (ev.riskScore) agg.riskScores.push(ev.riskScore);
      }
    }
  }

  if (appMap.size === 0) {
    return { appsProcessed: 0, message: "No cloud/web app data found" };
  }

  const allApps = [...appMap.values()];
  const avgActivity = allApps.reduce((s, a) => s + a.totalActivities, 0) / allApps.length;

  await db.delete(cloudAppRiskScores).where(eq(cloudAppRiskScores.tenantId, tenantId));

  let appsProcessed = 0;
  for (const app of allApps) {
    const { confidenceIndex, riskClassification, factorScores, factorDetails } = computeConfidenceIndex(app, avgActivity);
    const nameLower = app.appName.toLowerCase();
    const isEnterprise = [...ENTERPRISE_APPS].some(e => nameLower.includes(e));

    await db.insert(cloudAppRiskScores).values({
      tenantId,
      appName: app.appName,
      confidenceIndex,
      riskClassification,
      sanctionStatus: app.sanctionStatus,
      serviceCategory: app.serviceCategory || "Unknown",
      isAIService: app.isAI,
      isShadowIT: app.isShadowIT,
      isEnterprise,
      totalUsers: app.users.size,
      totalActivities: app.totalActivities,
      totalUploads: app.uploads,
      totalDownloads: app.downloads,
      countries: [...app.countries],
      factorScores,
      factorDetails,
      calculatedAt: new Date(),
    });
    appsProcessed++;
  }

  return { appsProcessed };
}

export async function getCloudAppRiskScores(
  tenantId: number,
  classification?: string,
  _sortBy?: string,
  limit = 100,
  offset = 0,
  search?: string,
) {
  const conditions = [eq(cloudAppRiskScores.tenantId, tenantId)];
  if (classification) {
    conditions.push(eq(cloudAppRiskScores.riskClassification, classification));
  }
  if (search) {
    conditions.push(sql`${cloudAppRiskScores.appName} ILIKE ${'%' + search + '%'}`);
  }
  const whereCondition = and(...conditions);

  const [countResult, allScores] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(cloudAppRiskScores).where(whereCondition),
    db.select().from(cloudAppRiskScores)
      .where(whereCondition)
      .orderBy(sql`confidence_index ASC`)
      .limit(Math.min(limit, 200))
      .offset(offset),
  ]);

  return { scores: allScores, total: Number(countResult[0]?.count || 0) };
}

export async function getCloudAppRiskDashboard(tenantId: number) {
  const allScores = await db.select().from(cloudAppRiskScores)
    .where(eq(cloudAppRiskScores.tenantId, tenantId));

  if (allScores.length === 0) {
    const eventCountResult = await db.select({ count: sql<number>`count(*)` }).from(securityEvents)
      .where(and(
        eq(securityEvents.tenantId, tenantId),
        sql`${securityEvents.eventType} IN ('sse', 'cloud')`
      ));
    const hasCloudData = Number(eventCountResult[0]?.count || 0) > 0;
    return {
      totalApps: 0,
      assessed: false,
      hasCloudData,
      distribution: { trusted: 0, moderate: 0, risky: 0, critical: 0 },
      avgConfidence: 0,
      topRiskyApps: [],
      byCategory: [],
      shadowITCount: 0,
      aiServiceCount: 0,
      enterpriseCount: 0,
      unsanctionedCount: 0,
    };
  }

  const distribution = { trusted: 0, moderate: 0, risky: 0, critical: 0 };
  let totalConfidence = 0;
  let shadowITCount = 0;
  let aiServiceCount = 0;
  let enterpriseCount = 0;
  let unsanctionedCount = 0;
  const sourceCounts: Record<string, number> = {};
  const categoryMap = new Map<string, { count: number; totalConfidence: number; apps: string[] }>();

  for (const s of allScores) {
    const cls = s.riskClassification as keyof typeof distribution;
    if (distribution[cls] !== undefined) distribution[cls]++;
    totalConfidence += s.confidenceIndex;
    if (s.isShadowIT) shadowITCount++;
    if (s.isAIService) aiServiceCount++;
    if (s.isEnterprise) enterpriseCount++;
    if (s.sanctionStatus === "Unsanctioned") unsanctionedCount++;
    const src = (s as any).source || "platform";
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;

    const cat = s.serviceCategory || "Unknown";
    if (!categoryMap.has(cat)) categoryMap.set(cat, { count: 0, totalConfidence: 0, apps: [] });
    const c = categoryMap.get(cat)!;
    c.count++;
    c.totalConfidence += s.confidenceIndex;
    c.apps.push(s.appName);
  }

  const topRiskyApps = [...allScores]
    .sort((a, b) => a.confidenceIndex - b.confidenceIndex)
    .slice(0, 10);

  const byCategory = [...categoryMap.entries()]
    .map(([category, data]) => ({
      category,
      count: data.count,
      avgConfidence: Math.round(data.totalConfidence / data.count),
      apps: data.apps.slice(0, 5),
    }))
    .sort((a, b) => a.avgConfidence - b.avgConfidence);

  return {
    totalApps: allScores.length,
    assessed: true,
    distribution,
    avgConfidence: Math.round(totalConfidence / allScores.length),
    topRiskyApps,
    byCategory,
    shadowITCount,
    aiServiceCount,
    enterpriseCount,
    unsanctionedCount,
    sourceCounts,
  };
}

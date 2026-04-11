import { db } from "./db";
import { assets, incidents, securityEvents, userAssets, riskScores } from "@shared/schema";
import { eq, and, sql, count, avg, desc } from "drizzle-orm";
import { lookupEOL } from "./eol-database";

const SECURITY_TOOL_CATEGORIES = [
  "endpoint", "web", "nac", "vpn", "firewall", "dlp",
  "email", "identity", "backup", "siem", "vuln_scanner",
  "encryption", "patch_mgmt",
] as const;

const PILLAR_WEIGHTS = {
  asset: {
    securityToolCoverage: 0.25,
    vulnerabilityPatch: 0.25,
    incidentHistory: 0.20,
    compliancePosture: 0.15,
    contextualFactors: 0.15,
  },
  user: {
    emailThreatExposure: 0.30,
    webBrowsingRisk: 0.25,
    incidentInvolvement: 0.20,
    behavioralRisk: 0.15,
    contextualFactors: 0.10,
  },
  ip: {
    reputationSignals: 0.30,
    incidentAssociation: 0.30,
    eventFrequency: 0.20,
    geographicRisk: 0.20,
  },
};

function scoreToLevel(score: number): string {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  if (score >= 20) return "low";
  return "minimal";
}

function clamp(val: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, val));
}

interface AssetRiskResult {
  overallScore: number;
  riskLevel: string;
  pillarScores: Record<string, number>;
  riskBreakdown: Record<string, any>;
  contextualFactors: Record<string, any>;
  compoundRiskAlerts: string[];
}

export async function calculateAssetRisk(
  tenantId: number,
  asset: any,
  tenantIncidents: any[],
  tenantEvents: any[]
): Promise<AssetRiskResult> {
  const pillarScores: Record<string, number> = {};
  const riskBreakdown: Record<string, any> = {};
  const compoundAlerts: string[] = [];

  const enrichment = (asset.enrichmentData || {}) as Record<string, any>;
  const agents: string[] = enrichment.agents || [];
  const softwareInv: any[] = Array.isArray(asset.softwareInventory) ? asset.softwareInventory : [];

  const assetContextFields: string[] = [
    ...(agents || []),
    asset.agentVersion || '',
    asset.preventionPolicy || '',
    asset.source || '',
    asset.endpointGroup || '',
    asset.deploymentType || '',
    asset.contentVersion || '',
    ...softwareInv.map((s: any) => s.name || ''),
  ].filter(Boolean);

  const coveredCategories = new Set<string>();
  const contextLower = assetContextFields.map((s: string) => s.toLowerCase());

  for (const cat of SECURITY_TOOL_CATEGORIES) {
    const catMatchers: Record<string, string[]> = {
      endpoint: ["crowdstrike", "falcon", "cortex", "cynet", "sentinel", "defender", "sophos", "eset", "trellix", "deceptive bytes", "carbon black", "symantec", "endpoint_protection", "endpoint protection"],
      web: ["zscaler", "netskope", "skyhigh", "forcepoint swg", "umbrella", "web gateway", "proxy"],
      nac: ["nac", "ise", "forescout", "clearpass", "packetfence"],
      vpn: ["vpn", "globalprotect", "anyconnect", "fortivpn", "pulse"],
      firewall: ["firewall", "palo alto", "fortinet", "checkpoint", "sophos xg"],
      dlp: ["dlp", "forcepoint dlp", "trellix dlp", "digital guardian"],
      email: ["email security", "proofpoint", "mimecast", "barracuda", "harmony email"],
      identity: ["okta", "azure ad", "active directory", "cyberark", "beyond trust"],
      backup: ["backup", "veeam", "acronis", "commvault", "carbonite"],
      siem: ["siem", "splunk", "sentinel", "qradar", "logrhythm", "elastic"],
      vuln_scanner: ["qualys", "tenable", "nessus", "rapid7", "nexpose"],
      encryption: ["bitlocker", "encryption", "veracrypt", "filevault"],
      patch_mgmt: ["wsus", "sccm", "intune", "patch", "ivanti", "manageengine"],
    };
    const matchers = catMatchers[cat] || [];
    if (contextLower.some(ctx => matchers.some(m => ctx.includes(m)))) {
      coveredCategories.add(cat);
    }
  }

  const coverageRatio = coveredCategories.size / SECURITY_TOOL_CATEGORIES.length;
  const coverageScore = clamp((1 - coverageRatio) * 100);
  pillarScores.securityToolCoverage = coverageScore;
  riskBreakdown.securityTools = {
    totalCategories: SECURITY_TOOL_CATEGORIES.length,
    coveredCategories: coveredCategories.size,
    uncoveredCategories: SECURITY_TOOL_CATEGORIES.length - coveredCategories.size,
    coverage: Array.from(coveredCategories),
    agents,
    detectedContext: assetContextFields,
  };

  let eolCount = 0;
  let eosApproachingCount = 0;
  let vulnAppCount = 0;
  const os = asset.operatingSystem || "";

  if (os) {
    const eolResult = lookupEOL(os, "");
    if (eolResult && eolResult.eolStatus === "ended") {
      eolCount++;
    } else if (eolResult && eolResult.eolStatus === "approaching") {
      eosApproachingCount++;
    }
  }

  for (const sw of softwareInv) {
    const swName = sw.name || sw.productName || "";
    const swVersion = sw.version || "";
    if (swName) {
      const eolResult = lookupEOL(swName, swVersion);
      if (eolResult && eolResult.eolStatus === "ended") eolCount++;
      else if (eolResult && eolResult.eolStatus === "approaching") eosApproachingCount++;
    }
  }

  const vulnScore = clamp(
    (eolCount * 15) + (eosApproachingCount * 8) + (vulnAppCount * 10) +
    ((asset.vulnerabilityCount || 0) * 3)
  );
  pillarScores.vulnerabilityPatch = vulnScore;
  const osEol = os ? lookupEOL(os, "") : null;
  riskBreakdown.vulnerability = {
    eolSoftwareCount: eolCount,
    eosApproachingCount,
    vulnerabilityCount: asset.vulnerabilityCount || 0,
    osEolStatus: osEol ? osEol.eolStatus : "unknown",
  };

  const assetHostname = (asset.hostname || "").toLowerCase();
  const assetIp = (asset.ipAddress || "").toLowerCase();
  const assetIncidents = tenantIncidents.filter(inc => {
    const affected = (inc.affectedAssets || inc.affected_assets || "").toLowerCase();
    const src = (inc.source || "").toLowerCase();
    const srcIp = (inc.sourceIp || inc.source_ip || "").toLowerCase();
    const dstIp = (inc.destinationIp || inc.destination_ip || "").toLowerCase();
    return affected.includes(assetHostname) ||
      src.includes(assetHostname) ||
      (assetIp && (srcIp === assetIp || dstIp === assetIp));
  });

  const criticalIncidents = assetIncidents.filter(i => i.severity === "critical").length;
  const highIncidents = assetIncidents.filter(i => i.severity === "high").length;
  const mediumIncidents = assetIncidents.filter(i => i.severity === "medium").length;
  const incidentScore = clamp(
    (criticalIncidents * 20) + (highIncidents * 10) + (mediumIncidents * 3)
  );
  pillarScores.incidentHistory = incidentScore;
  riskBreakdown.incidents = {
    total: assetIncidents.length,
    critical: criticalIncidents,
    high: highIncidents,
    medium: mediumIncidents,
    low: assetIncidents.length - criticalIncidents - highIncidents - mediumIncidents,
  };

  const complianceFactors: string[] = [];
  if (coverageRatio >= 0.8) complianceFactors.push("strong_tool_coverage");
  if (asset.preventionPolicy) complianceFactors.push("prevention_policy_active");
  if (asset.deviceHealth === "Healthy" || asset.deviceHealth === "Good") complianceFactors.push("healthy_device");
  if (asset.status === "active") complianceFactors.push("active_status");

  const complianceScore = clamp(100 - (complianceFactors.length * 20));
  pillarScores.compliancePosture = complianceScore;
  riskBreakdown.compliance = {
    factors: complianceFactors,
    score: complianceScore,
  };

  const contextFactors: Record<string, any> = {};
  let contextScore = 50;

  if (asset.lastSeen) {
    const daysSince = Math.floor((Date.now() - new Date(asset.lastSeen).getTime()) / (86400000));
    if (daysSince > 30) {
      contextScore += 20;
      contextFactors.staleAsset = true;
      contextFactors.daysSinceLastSeen = daysSince;
    } else if (daysSince > 7) {
      contextScore += 10;
      contextFactors.inactiveAsset = true;
      contextFactors.daysSinceLastSeen = daysSince;
    }
  }

  if (asset.deploymentType === "Cloud" || asset.cloudProvider) {
    contextScore += 5;
    contextFactors.cloudExposed = true;
  }

  const isServer = (asset.endpointType || "").toLowerCase().includes("server") ||
    assetHostname.includes("server") || assetHostname.includes("srv") || assetHostname.includes("-dc");
  if (isServer) {
    contextScore += 10;
    contextFactors.isServer = true;
  }

  pillarScores.contextualFactors = clamp(contextScore);
  riskBreakdown.contextual = contextFactors;

  if (eolCount > 0 && coveredCategories.size < 5) {
    compoundAlerts.push("EOL software on poorly protected endpoint — high exploitation risk");
  }
  if (criticalIncidents > 0 && coverageRatio < 0.5) {
    compoundAlerts.push("Critical incidents on endpoint with low security tool coverage");
  }
  if (isServer && eolCount > 0) {
    compoundAlerts.push("Server running End-of-Life software — priority remediation required");
  }
  if (criticalIncidents >= 3) {
    compoundAlerts.push("Repeated critical incidents — possible persistent compromise");
  }
  if (complianceScore > 60 && incidentScore > 50) {
    compoundAlerts.push("Poor compliance posture correlating with elevated incidents");
  }

  const weights = PILLAR_WEIGHTS.asset;
  const overallScore = clamp(
    (pillarScores.securityToolCoverage * weights.securityToolCoverage) +
    (pillarScores.vulnerabilityPatch * weights.vulnerabilityPatch) +
    (pillarScores.incidentHistory * weights.incidentHistory) +
    (pillarScores.compliancePosture * weights.compliancePosture) +
    (pillarScores.contextualFactors * weights.contextualFactors)
  );

  return {
    overallScore: Math.round(overallScore * 10) / 10,
    riskLevel: scoreToLevel(overallScore),
    pillarScores,
    riskBreakdown,
    contextualFactors: contextFactors,
    compoundRiskAlerts: compoundAlerts,
  };
}

interface UserRiskResult {
  overallScore: number;
  riskLevel: string;
  pillarScores: Record<string, number>;
  riskBreakdown: Record<string, any>;
  contextualFactors: Record<string, any>;
  compoundRiskAlerts: string[];
}

interface MergedUserProfile {
  id: number;
  userName: string;
  email: string;
  source: string;
  emailData: any | null;
  sseData: any | null;
  linkedAssetIds: number[];
  lastActivity: string | null;
  reputation: string | null;
}

function mergeUserAssets(allUsers: any[]): MergedUserProfile[] {
  const emailUsers = allUsers.filter(u => u.source === "Checkpoint Harmony Email");
  const sseUsers = allUsers.filter(u => u.source === "Skyhigh Security SSE");
  const otherUsers = allUsers.filter(u => u.source !== "Checkpoint Harmony Email" && u.source !== "Skyhigh Security SSE");

  const sseByUsername = new Map<string, any>();
  for (const u of sseUsers) {
    if (u.userName) sseByUsername.set(u.userName.toLowerCase(), u);
  }

  const merged = new Map<string, MergedUserProfile>();

  for (const eu of emailUsers) {
    const emailPrefix = (eu.email || "").split("@")[0]?.toLowerCase() || "";
    const matchedSSE = sseByUsername.get(emailPrefix);
    const key = emailPrefix || eu.email?.toLowerCase() || `email-${eu.id}`;

    merged.set(key, {
      id: eu.id,
      userName: eu.userName || emailPrefix,
      email: eu.email || "",
      source: matchedSSE ? "Email + Web/Cloud" : "Email Only",
      emailData: {
        phishingCount: eu.activityData?.phishingCount || 0,
        malwareCount: eu.activityData?.malwareCount || 0,
        spamCount: eu.activityData?.spamCount || 0,
        totalEmails: eu.activityData?.totalEmails || 0,
        threatsReceived: eu.activityData?.threatsReceived || 0,
        quarantinedCount: eu.activityData?.quarantinedCount || 0,
        topThreatSenders: eu.activityData?.topThreatSenders || [],
        riskScore: eu.riskScore || 0,
      },
      sseData: matchedSSE ? {
        totalRequests: matchedSSE.totalRequests || 0,
        deniedRequests: matchedSSE.deniedRequests || 0,
        isolatedRequests: matchedSSE.isolatedRequests || 0,
        uploadedBytesMB: matchedSSE.uploadedBytesMB || 0,
        downloadedBytesMB: matchedSSE.downloadedBytesMB || 0,
        totalBytesMB: matchedSSE.totalBytesMB || 0,
        sitesVisited: matchedSSE.sitesVisited || 0,
        applicationNames: matchedSSE.applicationNames || "",
        riskLevel: matchedSSE.riskLevel || "low",
        reputation: matchedSSE.reputation || "",
        urlCategories: matchedSSE.urlCategories || "",
      } : null,
      linkedAssetIds: Array.isArray(eu.linkedAssetIds) ? eu.linkedAssetIds : (matchedSSE && Array.isArray(matchedSSE.linkedAssetIds) ? matchedSSE.linkedAssetIds : []),
      lastActivity: eu.lastActivity || matchedSSE?.lastActivity || null,
      reputation: matchedSSE?.reputation || eu.reputation || null,
    });

    if (matchedSSE) sseByUsername.delete(emailPrefix);
  }

  for (const [username, su] of sseByUsername) {
    merged.set(username, {
      id: su.id,
      userName: su.userName || username,
      email: su.email || "",
      source: "Web/Cloud Only",
      emailData: null,
      sseData: {
        totalRequests: su.totalRequests || 0,
        deniedRequests: su.deniedRequests || 0,
        isolatedRequests: su.isolatedRequests || 0,
        uploadedBytesMB: su.uploadedBytesMB || 0,
        downloadedBytesMB: su.downloadedBytesMB || 0,
        totalBytesMB: su.totalBytesMB || 0,
        sitesVisited: su.sitesVisited || 0,
        applicationNames: su.applicationNames || "",
        riskLevel: su.riskLevel || "low",
        reputation: su.reputation || "",
        urlCategories: su.urlCategories || "",
      },
      linkedAssetIds: Array.isArray(su.linkedAssetIds) ? su.linkedAssetIds : [],
      lastActivity: su.lastActivity || null,
      reputation: su.reputation || null,
    });
  }

  for (const ou of otherUsers) {
    const key = (ou.userName || ou.email || `other-${ou.id}`).toLowerCase();
    if (!merged.has(key)) {
      merged.set(key, {
        id: ou.id,
        userName: ou.userName || "",
        email: ou.email || "",
        source: ou.source || "Unknown",
        emailData: null,
        sseData: null,
        linkedAssetIds: Array.isArray(ou.linkedAssetIds) ? ou.linkedAssetIds : [],
        lastActivity: ou.lastActivity || null,
        reputation: ou.reputation || null,
      });
    }
  }

  return Array.from(merged.values());
}

async function calculateUserRisk(
  tenantId: number,
  user: MergedUserProfile,
  tenantIncidents: any[],
  tenantAssets: any[],
  assetRiskMap: Map<number, number>
): Promise<UserRiskResult> {
  const pillarScores: Record<string, number> = {};
  const riskBreakdown: Record<string, any> = {};
  const compoundAlerts: string[] = [];

  const userName = (user.userName || "").toLowerCase();
  const userEmail = (user.email || "").toLowerCase();

  let emailThreatScore = 0;
  const ed = user.emailData;
  if (ed) {
    if (ed.malwareCount > 0) emailThreatScore += 40;
    if (ed.phishingCount > 0) emailThreatScore += Math.min(40, ed.phishingCount * 4);
    if (ed.spamCount > 0) emailThreatScore += Math.min(15, ed.spamCount * 0.3);

    const deliveredThreats = ed.threatsReceived - (ed.quarantinedCount || 0);
    if (deliveredThreats > 10) emailThreatScore += 15;
    else if (deliveredThreats > 0) emailThreatScore += 5;

    if (ed.totalEmails > 0) {
      const threatRatio = (ed.phishingCount + ed.malwareCount) / ed.totalEmails;
      if (threatRatio > 0.3) emailThreatScore += 10;
    }
  }
  pillarScores.emailThreatExposure = clamp(emailThreatScore);
  riskBreakdown.email = ed ? {
    phishingCount: ed.phishingCount,
    malwareCount: ed.malwareCount,
    spamCount: ed.spamCount,
    totalEmails: ed.totalEmails,
    threatsReceived: ed.threatsReceived,
    quarantinedCount: ed.quarantinedCount,
    topThreatSenders: (ed.topThreatSenders || []).slice(0, 5),
  } : { noData: true };

  let webScore = 0;
  const sd = user.sseData;
  if (sd) {
    const deniedRatio = sd.totalRequests > 0 ? sd.deniedRequests / sd.totalRequests : 0;
    if (deniedRatio > 0.3) webScore += 35;
    else if (deniedRatio > 0.15) webScore += 20;
    else if (deniedRatio > 0.05) webScore += 10;

    if (sd.isolatedRequests > 10) webScore += 15;
    else if (sd.isolatedRequests > 0) webScore += 5;

    const appNames = (sd.applicationNames || "").toLowerCase();
    const shadowItApps = ["wetransfer", "dropbox personal", "mega.nz", "mediafire", "anonymous", "torrent"];
    const hasShadowIt = shadowItApps.some(app => appNames.includes(app));
    if (hasShadowIt) webScore += 20;

    const uploadRatio = sd.totalBytesMB > 0 ? sd.uploadedBytesMB / sd.totalBytesMB : 0;
    if (uploadRatio > 0.6 && sd.uploadedBytesMB > 500) webScore += 15;
    else if (uploadRatio > 0.4 && sd.uploadedBytesMB > 200) webScore += 8;

    if (sd.riskLevel === "critical") webScore += 15;
    else if (sd.riskLevel === "high") webScore += 10;

    riskBreakdown.web = {
      totalRequests: sd.totalRequests,
      deniedRequests: sd.deniedRequests,
      deniedRatio: Math.round(deniedRatio * 100),
      isolatedRequests: sd.isolatedRequests,
      hasShadowIt,
      uploadedMB: Math.round(sd.uploadedBytesMB || 0),
      downloadedMB: Math.round(sd.downloadedBytesMB || 0),
      sitesVisited: sd.sitesVisited,
    };
  } else {
    riskBreakdown.web = { noData: true };
  }
  pillarScores.webBrowsingRisk = clamp(webScore);

  const userIncidents = tenantIncidents.filter(inc => {
    const affected = (inc.affectedAssets || inc.affected_assets || "").toLowerCase();
    const dst = (inc.destinationIp || inc.destination_ip || "").toLowerCase();
    const src = (inc.sourceIp || inc.source_ip || "").toLowerCase();
    return affected.includes(userName) || affected.includes(userEmail) ||
           dst.includes(userEmail) || src.includes(userEmail);
  });

  const criticalInc = userIncidents.filter(i => i.severity === "critical").length;
  const highInc = userIncidents.filter(i => i.severity === "high").length;
  const incScore = clamp((criticalInc * 25) + (highInc * 12) + (userIncidents.length * 2));
  pillarScores.incidentInvolvement = incScore;
  riskBreakdown.incidents = {
    total: userIncidents.length,
    critical: criticalInc,
    high: highInc,
  };

  let behavioralScore = 0;
  if (ed && ed.phishingCount > 5 && sd && sd.deniedRequests > 10) {
    behavioralScore += 25;
  }
  if (ed && ed.malwareCount > 0 && sd && sd.isolatedRequests > 0) {
    behavioralScore += 20;
  }
  if (sd) {
    const appNames = (sd.applicationNames || "").toLowerCase();
    if (appNames.includes("wetransfer") || appNames.includes("mega.nz")) {
      if (sd.uploadedBytesMB > 200) behavioralScore += 20;
    }
  }
  if (ed && ed.threatsReceived > 50) behavioralScore += 15;
  pillarScores.behavioralRisk = clamp(behavioralScore);
  riskBreakdown.behavioral = {
    crossSignalRisk: (ed && sd) ? true : false,
    dataSources: user.source,
  };

  let contextScore = 0;
  if (!user.lastActivity || (Date.now() - new Date(user.lastActivity).getTime()) > 30 * 86400000) {
    contextScore += 10;
  }
  if (user.reputation === "Unverified" || user.reputation === "Suspicious") {
    contextScore += 20;
  }
  if (user.source === "Email + Web/Cloud") contextScore += 0;
  else if (user.source === "Email Only") contextScore += 5;
  pillarScores.contextualFactors = clamp(contextScore);

  if (emailThreatScore > 50 && webScore > 30) {
    compoundAlerts.push("High email threat exposure combined with risky web browsing — elevated compromise risk");
  }
  if (ed && ed.malwareCount > 0 && sd && sd.deniedRequests > 20) {
    compoundAlerts.push("Malware exposure via email + high web policy violations — potential active compromise");
  }
  if (ed && ed.phishingCount > 10 && incScore > 30) {
    compoundAlerts.push("Heavy phishing targeting with significant incident involvement");
  }
  if (sd) {
    const appNames = (sd.applicationNames || "").toLowerCase();
    const hasShadowIt = ["wetransfer", "dropbox personal", "mega.nz", "mediafire"].some(a => appNames.includes(a));
    const uploadRatio = sd.totalBytesMB > 0 ? sd.uploadedBytesMB / sd.totalBytesMB : 0;
    if (hasShadowIt && uploadRatio > 0.5) {
      compoundAlerts.push("Shadow IT usage with high data upload — potential data exfiltration");
    }
  }

  const weights = PILLAR_WEIGHTS.user;
  const overallScore = clamp(
    (pillarScores.emailThreatExposure * weights.emailThreatExposure) +
    (pillarScores.webBrowsingRisk * weights.webBrowsingRisk) +
    (pillarScores.incidentInvolvement * weights.incidentInvolvement) +
    (pillarScores.behavioralRisk * weights.behavioralRisk) +
    (pillarScores.contextualFactors * weights.contextualFactors)
  );

  return {
    overallScore: Math.round(overallScore * 10) / 10,
    riskLevel: scoreToLevel(overallScore),
    pillarScores,
    riskBreakdown,
    contextualFactors: {
      reputation: user.reputation,
      lastActivity: user.lastActivity,
      dataSources: user.source,
      email: user.email,
    },
    compoundRiskAlerts: compoundAlerts,
  };
}

interface IpRiskResult {
  overallScore: number;
  riskLevel: string;
  pillarScores: Record<string, number>;
  riskBreakdown: Record<string, any>;
  contextualFactors: Record<string, any>;
  compoundRiskAlerts: string[];
}

function calculateIpRisk(
  ip: string,
  tenantIncidents: any[],
  tenantEvents: any[]
): IpRiskResult {
  const pillarScores: Record<string, number> = {};
  const riskBreakdown: Record<string, any> = {};
  const compoundAlerts: string[] = [];

  const relatedIncidents = tenantIncidents.filter(inc => {
    const srcIp = inc.sourceIp || inc.source_ip || "";
    const dstIp = inc.destinationIp || inc.destination_ip || "";
    return srcIp === ip || dstIp === ip;
  });

  const tpIncidents = relatedIncidents.filter(i =>
    i.classification === "true_positive" || i.classification === "TP"
  );
  const maliciousAssociation = tpIncidents.length;
  const reputationScore = clamp(maliciousAssociation * 25 + (relatedIncidents.length * 5));
  pillarScores.reputationSignals = reputationScore;
  riskBreakdown.reputation = {
    totalIncidentAssociations: relatedIncidents.length,
    confirmedMalicious: maliciousAssociation,
  };

  const criticalInc = relatedIncidents.filter(i => i.severity === "critical").length;
  const highInc = relatedIncidents.filter(i => i.severity === "high").length;
  const incidentScore = clamp((criticalInc * 20) + (highInc * 10) + (relatedIncidents.length * 3));
  pillarScores.incidentAssociation = incidentScore;
  riskBreakdown.incidents = {
    critical: criticalInc,
    high: highInc,
    total: relatedIncidents.length,
  };

  const relatedEvents = tenantEvents.filter(ev => {
    const attacker = (ev.attacker || "").toLowerCase();
    const target = (ev.target || "").toLowerCase();
    return attacker.includes(ip) || target.includes(ip);
  });

  const eventScore = clamp(relatedEvents.length * 2);
  pillarScores.eventFrequency = eventScore;
  riskBreakdown.events = {
    totalEvents: relatedEvents.length,
    eventTypes: Array.from(new Set(relatedEvents.map(e => e.eventType))),
  };

  const highRiskCountries = ["north korea", "iran", "russia", "china"];
  const countries = relatedEvents.map(e => (e.country || "").toLowerCase()).filter(Boolean);
  const hasHighRiskGeo = countries.some(c => highRiskCountries.some(hr => c.includes(hr)));
  const geoScore = hasHighRiskGeo ? 60 : (countries.length > 5 ? 30 : 10);
  pillarScores.geographicRisk = geoScore;
  riskBreakdown.geographic = {
    uniqueCountries: Array.from(new Set(countries)),
    hasHighRiskOrigin: hasHighRiskGeo,
  };

  if (maliciousAssociation > 0 && relatedEvents.length > 10) {
    compoundAlerts.push("Confirmed malicious IP with high event frequency");
  }
  if (hasHighRiskGeo && criticalInc > 0) {
    compoundAlerts.push("High-risk geographic origin with critical incident association");
  }

  const weights = PILLAR_WEIGHTS.ip;
  const overallScore = clamp(
    (pillarScores.reputationSignals * weights.reputationSignals) +
    (pillarScores.incidentAssociation * weights.incidentAssociation) +
    (pillarScores.eventFrequency * weights.eventFrequency) +
    (pillarScores.geographicRisk * weights.geographicRisk)
  );

  return {
    overallScore: Math.round(overallScore * 10) / 10,
    riskLevel: scoreToLevel(overallScore),
    pillarScores,
    riskBreakdown,
    contextualFactors: { countries: Array.from(new Set(countries)) },
    compoundRiskAlerts: compoundAlerts,
  };
}

export async function calculateTenantRiskScores(tenantId: number): Promise<{
  assetsProcessed: number;
  usersProcessed: number;
  ipsProcessed: number;
  totalAlerts: number;
}> {
  const [tenantAssets, tenantIncidents, tenantEvents, tenantUsers] = await Promise.all([
    db.select().from(assets).where(eq(assets.tenantId, tenantId)),
    db.select().from(incidents).where(eq(incidents.tenantId, tenantId)),
    db.select().from(securityEvents).where(eq(securityEvents.tenantId, tenantId)),
    db.select().from(userAssets).where(eq(userAssets.tenantId, tenantId)),
  ]);

  const existingScores = await db.select().from(riskScores).where(eq(riskScores.tenantId, tenantId));
  const existingMap = new Map<string, any>();
  for (const s of existingScores) {
    const key = `${s.entityType}:${s.entityId || s.entityIdentifier}`;
    existingMap.set(key, s);
  }

  const assetRiskMap = new Map<number, number>();
  let totalAlerts = 0;

  const assetUpserts: any[] = [];
  for (const asset of tenantAssets) {
    const result = await calculateAssetRisk(tenantId, asset, tenantIncidents, tenantEvents);
    assetRiskMap.set(asset.id, result.overallScore);
    totalAlerts += result.compoundRiskAlerts.length;

    const existingKey = `asset:${asset.id}`;
    const existing = existingMap.get(existingKey);

    assetUpserts.push({
      tenantId,
      entityType: "asset" as const,
      entityId: asset.id,
      entityIdentifier: asset.hostname,
      overallScore: result.overallScore,
      riskLevel: result.riskLevel,
      pillarScores: result.pillarScores,
      contextualFactors: result.contextualFactors,
      riskBreakdown: result.riskBreakdown,
      compoundRiskAlerts: result.compoundRiskAlerts,
      previousScore: existing?.overallScore ?? null,
      scoreDelta: existing ? result.overallScore - existing.overallScore : null,
      calculatedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const mergedUsers = mergeUserAssets(tenantUsers);

  const userUpserts: any[] = [];
  for (const user of mergedUsers) {
    const result = await calculateUserRisk(tenantId, user, tenantIncidents, tenantAssets, assetRiskMap);
    totalAlerts += result.compoundRiskAlerts.length;

    const existingKey = `user:${user.id}`;
    const existing = existingMap.get(existingKey);

    const identifier = user.email || user.userName;

    userUpserts.push({
      tenantId,
      entityType: "user" as const,
      entityId: user.id,
      entityIdentifier: identifier,
      overallScore: result.overallScore,
      riskLevel: result.riskLevel,
      pillarScores: result.pillarScores,
      contextualFactors: result.contextualFactors,
      riskBreakdown: result.riskBreakdown,
      compoundRiskAlerts: result.compoundRiskAlerts,
      previousScore: existing?.overallScore ?? null,
      scoreDelta: existing ? result.overallScore - existing.overallScore : null,
      calculatedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const ipSet = new Set<string>();
  for (const inc of tenantIncidents) {
    const srcIp = inc.sourceIp || (inc as any).source_ip;
    const dstIp = inc.destinationIp || (inc as any).destination_ip;
    if (srcIp && /^\d+\.\d+\.\d+\.\d+$/.test(srcIp)) ipSet.add(srcIp);
    if (dstIp && /^\d+\.\d+\.\d+\.\d+$/.test(dstIp)) ipSet.add(dstIp);
  }
  for (const ev of tenantEvents) {
    const attacker = ev.attacker || "";
    const target = ev.target || "";
    if (/^\d+\.\d+\.\d+\.\d+$/.test(attacker)) ipSet.add(attacker);
    if (/^\d+\.\d+\.\d+\.\d+$/.test(target)) ipSet.add(target);
  }

  const ipUpserts: any[] = [];
  for (const ip of Array.from(ipSet)) {
    const result = calculateIpRisk(ip, tenantIncidents, tenantEvents);
    if (result.overallScore > 5) {
      totalAlerts += result.compoundRiskAlerts.length;

      const existingKey = `ip:${ip}`;
      const existing = existingMap.get(existingKey);

      ipUpserts.push({
        tenantId,
        entityType: "ip" as const,
        entityId: null,
        entityIdentifier: ip,
        overallScore: result.overallScore,
        riskLevel: result.riskLevel,
        pillarScores: result.pillarScores,
        contextualFactors: result.contextualFactors,
        riskBreakdown: result.riskBreakdown,
        compoundRiskAlerts: result.compoundRiskAlerts,
        previousScore: existing?.overallScore ?? null,
        scoreDelta: existing ? result.overallScore - existing.overallScore : null,
        calculatedAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  await db.delete(riskScores).where(eq(riskScores.tenantId, tenantId));

  const allUpserts = [...assetUpserts, ...userUpserts, ...ipUpserts];
  if (allUpserts.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < allUpserts.length; i += batchSize) {
      const batch = allUpserts.slice(i, i + batchSize);
      await db.insert(riskScores).values(batch);
    }
  }

  return {
    assetsProcessed: assetUpserts.length,
    usersProcessed: userUpserts.length,
    ipsProcessed: ipUpserts.length,
    totalAlerts,
  };
}

export async function getRiskDashboardStats(tenantId: number) {
  const scores = await db.select().from(riskScores).where(eq(riskScores.tenantId, tenantId));

  const assetScores = scores.filter(s => s.entityType === "asset");
  const userScores = scores.filter(s => s.entityType === "user");
  const ipScores = scores.filter(s => s.entityType === "ip");

  const distribution = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const s of scores) {
    const lvl = s.riskLevel as keyof typeof distribution;
    if (lvl in distribution) distribution[lvl]++;
  }

  const avgScore = scores.length > 0
    ? Math.round((scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length) * 10) / 10
    : 0;

  const allAlerts: Array<{ type: string; severity: string; message: string; entity: string; entityType: string }> = [];
  for (const s of scores) {
    const alerts = (s.compoundRiskAlerts || []) as string[];
    const sev = s.riskLevel === "critical" ? "critical" : s.riskLevel === "high" ? "high" : "medium";
    for (const alert of alerts) {
      allAlerts.push({
        type: alert.split("—")[0]?.trim() || "Risk Alert",
        severity: sev,
        message: alert,
        entity: s.entityIdentifier || `ID:${s.entityId}`,
        entityType: s.entityType,
      });
    }
  }

  const topRiskyAssets = assetScores
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, 10)
    .map(s => ({
      id: s.entityId,
      identifier: s.entityIdentifier,
      score: s.overallScore,
      level: s.riskLevel,
      delta: s.scoreDelta,
      pillars: s.pillarScores,
      alerts: s.compoundRiskAlerts,
    }));

  const topRiskyUsers = userScores
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, 10)
    .map(s => ({
      id: s.entityId,
      identifier: s.entityIdentifier,
      score: s.overallScore,
      level: s.riskLevel,
      delta: s.scoreDelta,
      pillars: s.pillarScores,
      alerts: s.compoundRiskAlerts,
      breakdown: s.riskBreakdown,
      dataSources: (s.contextualFactors as any)?.dataSources || "Unknown",
    }));

  const topRiskyIps = ipScores
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, 10)
    .map(s => ({
      identifier: s.entityIdentifier,
      score: s.overallScore,
      level: s.riskLevel,
      delta: s.scoreDelta,
      pillars: s.pillarScores,
      alerts: s.compoundRiskAlerts,
    }));

  const byEntityType = {
    asset: {
      count: assetScores.length,
      avgScore: assetScores.length > 0
        ? Math.round((assetScores.reduce((s, a) => s + a.overallScore, 0) / assetScores.length) * 10) / 10
        : 0,
      critical: assetScores.filter(s => s.riskLevel === "critical").length,
      high: assetScores.filter(s => s.riskLevel === "high").length,
      medium: assetScores.filter(s => s.riskLevel === "medium").length,
      low: assetScores.filter(s => s.riskLevel === "low").length,
    },
    user: {
      count: userScores.length,
      avgScore: userScores.length > 0
        ? Math.round((userScores.reduce((s, a) => s + a.overallScore, 0) / userScores.length) * 10) / 10
        : 0,
      critical: userScores.filter(s => s.riskLevel === "critical").length,
      high: userScores.filter(s => s.riskLevel === "high").length,
      medium: userScores.filter(s => s.riskLevel === "medium").length,
      low: userScores.filter(s => s.riskLevel === "low").length,
    },
    ip: {
      count: ipScores.length,
      avgScore: ipScores.length > 0
        ? Math.round((ipScores.reduce((s, a) => s + a.overallScore, 0) / ipScores.length) * 10) / 10
        : 0,
      critical: ipScores.filter(s => s.riskLevel === "critical").length,
      high: ipScores.filter(s => s.riskLevel === "high").length,
      medium: ipScores.filter(s => s.riskLevel === "medium").length,
      low: ipScores.filter(s => s.riskLevel === "low").length,
    },
  };

  const lastCalculated = scores.length > 0
    ? scores.reduce((max, s) => s.calculatedAt > max ? s.calculatedAt : max, scores[0].calculatedAt)
    : null;

  return {
    totalEntities: scores.length,
    averageRiskScore: avgScore,
    overallRiskLevel: scoreToLevel(avgScore),
    distribution,
    byEntityType,
    topRiskyAssets,
    topRiskyUsers,
    topRiskyIps,
    compoundAlerts: allAlerts.slice(0, 20),
    lastCalculated,
  };
}

export async function getRiskScores(
  tenantId: number,
  entityType?: string,
  riskLevel?: string,
  limit = 50,
  offset = 0,
  search?: string,
) {
  const conditions = [eq(riskScores.tenantId, tenantId)];
  if (entityType) {
    conditions.push(eq(riskScores.entityType, entityType as any));
  }
  if (riskLevel) {
    conditions.push(eq(riskScores.riskLevel, riskLevel));
  }
  if (search) {
    conditions.push(sql`${riskScores.entityIdentifier} ILIKE ${'%' + search + '%'}`);
  }

  const whereClause = and(...conditions);

  const [countResult, scores] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(riskScores).where(whereClause),
    db.select().from(riskScores)
      .where(whereClause)
      .orderBy(desc(riskScores.overallScore))
      .limit(Math.min(limit, 200))
      .offset(offset),
  ]);

  return {
    total: Number(countResult[0]?.count || 0),
    scores,
  };
}

export async function getRiskScoreForEntity(
  tenantId: number,
  entityType: string,
  entityId: number
) {
  const results = await db.select().from(riskScores).where(
    and(
      eq(riskScores.tenantId, tenantId),
      eq(riskScores.entityType, entityType as any),
      eq(riskScores.entityId, entityId)
    )
  );
  return results[0] || null;
}

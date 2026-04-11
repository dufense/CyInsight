import { db } from "./db";
import { securityEvents, cloudAppRiskScores } from "@shared/schema";
import { eq, sql, and, isNotNull } from "drizzle-orm";

export interface DetectedProduct {
  id: string;
  name: string;
  vendor: string;
  category: string;
  detectedFrom: string;
  eventCount: number;
  officialUrls: string[];
  docTypes: { id: string; label: string; description: string }[];
}

const DOC_TYPES = [
  { id: "overview", label: "Product Overview", description: "Comprehensive overview of product capabilities, architecture, and deployment" },
  { id: "configuration", label: "Configuration Best Practices", description: "Recommended configuration settings, hardening guidelines, and security baselines" },
  { id: "incident_response", label: "Incident Response Guide", description: "How to investigate and respond to alerts from this product" },
  { id: "tuning", label: "Tuning & Optimization", description: "Alert tuning, false positive reduction, and performance optimization" },
  { id: "integration", label: "Integration Guide", description: "How to integrate with SIEM, SOAR, and other security tools" },
];

export const PRODUCT_DEFINITIONS: Record<string, Omit<DetectedProduct, 'eventCount' | 'detectedFrom'>> = {
  "checkpoint_harmony_email": {
    id: "checkpoint_harmony_email",
    name: "Checkpoint Harmony Email & Collaboration",
    vendor: "Check Point Software",
    category: "Email Security",
    officialUrls: [
      "https://www.checkpoint.com/harmony/email-security/",
      "https://sc1.checkpoint.com/documents/Harmony_Email_Collaboration_Admin_Guide/",
      "https://support.checkpoint.com/results/sk/sk163120",
    ],
    docTypes: DOC_TYPES,
  },
  "skyhigh_sse": {
    id: "skyhigh_sse",
    name: "Skyhigh Security SSE (CASB / SWG / RBI)",
    vendor: "Skyhigh Security",
    category: "Cloud Security",
    officialUrls: [
      "https://www.skyhighsecurity.com/products/security-service-edge.html",
      "https://success.skyhighsecurity.com/",
      "https://docs.skyhighsecurity.com/",
    ],
    docTypes: DOC_TYPES,
  },
  "palo_alto_cortex_xdr": {
    id: "palo_alto_cortex_xdr",
    name: "Palo Alto Cortex XDR",
    vendor: "Palo Alto Networks",
    category: "Extended Detection & Response (XDR)",
    officialUrls: [
      "https://docs-cortex.paloaltonetworks.com/r/Cortex-XDR",
      "https://www.paloaltonetworks.com/cortex/cortex-xdr",
      "https://cortex.paloaltonetworks.com/",
    ],
    docTypes: DOC_TYPES,
  },
  "trellix_edr": {
    id: "trellix_edr",
    name: "Trellix EDR (Endpoint Detection & Response)",
    vendor: "Trellix (formerly McAfee/FireEye)",
    category: "Endpoint Security",
    officialUrls: [
      "https://www.trellix.com/products/edr/",
      "https://docs.trellix.com/",
      "https://kcm.trellix.com/",
    ],
    docTypes: DOC_TYPES,
  },
  "cynet_360": {
    id: "cynet_360",
    name: "Cynet 360 AutoXDR",
    vendor: "Cynet",
    category: "Autonomous Breach Protection",
    officialUrls: [
      "https://www.cynet.com/platform/",
      "https://www.cynet.com/knowledge-center/",
    ],
    docTypes: DOC_TYPES,
  },
  "skyhigh_dlp": {
    id: "skyhigh_dlp",
    name: "Skyhigh Security DLP",
    vendor: "Skyhigh Security",
    category: "Data Loss Prevention",
    officialUrls: [
      "https://www.skyhighsecurity.com/products/data-loss-prevention.html",
      "https://docs.skyhighsecurity.com/",
    ],
    docTypes: DOC_TYPES,
  },
  "vicarius_vrx": {
    id: "vicarius_vrx",
    name: "Vicarius vRx (Vulnerability Remediation)",
    vendor: "Vicarius",
    category: "Vulnerability Management",
    officialUrls: [
      "https://www.vicarius.io/vrx",
      "https://docs.vicarius.io/",
    ],
    docTypes: DOC_TYPES,
  },
  "aws_security": {
    id: "aws_security",
    name: "AWS Security Services (GuardDuty / CloudTrail / SecurityHub)",
    vendor: "Amazon Web Services",
    category: "Cloud Security Monitoring",
    officialUrls: [
      "https://docs.aws.amazon.com/guardduty/",
      "https://docs.aws.amazon.com/securityhub/",
      "https://aws.amazon.com/security/",
    ],
    docTypes: DOC_TYPES,
  },
};

export const LOG_SOURCE_PATTERNS: Array<{ pattern: RegExp; productId: string }> = [
  { pattern: /checkpoint\s*harmony\s*email/i, productId: "checkpoint_harmony_email" },
  { pattern: /skyhigh\s*security\s*sse/i, productId: "skyhigh_sse" },
  { pattern: /skyhigh\s*sse\s*dlp/i, productId: "skyhigh_dlp" },
  { pattern: /trellix\s*edr/i, productId: "trellix_edr" },
  { pattern: /vicarius\s*vrx/i, productId: "vicarius_vrx" },
  { pattern: /cynet/i, productId: "cynet_360" },
  { pattern: /DS:PANW\/XDR/i, productId: "palo_alto_cortex_xdr" },
  { pattern: /cortex/i, productId: "palo_alto_cortex_xdr" },
  { pattern: /DS:Amazon\/AWS/i, productId: "aws_security" },
  { pattern: /aws\s*windows\s*servers/i, productId: "aws_security" },
];

export async function detectTenantProducts(tenantId: number): Promise<DetectedProduct[]> {
  const logSources = await db
    .select({
      logSource: securityEvents.logSource,
      sourceType: securityEvents.sourceType,
      count: sql<number>`count(*)::int`,
    })
    .from(securityEvents)
    .where(
      and(
        eq(securityEvents.tenantId, tenantId),
        isNotNull(securityEvents.logSource)
      )
    )
    .groupBy(securityEvents.logSource, securityEvents.sourceType);

  const detectedMap = new Map<string, { count: number; from: string }>();

  for (const row of logSources) {
    const logSource = row.logSource || "";
    const sourceType = row.sourceType || "";
    const combined = `${logSource} ${sourceType}`;

    for (const mapping of LOG_SOURCE_PATTERNS) {
      if (mapping.pattern.test(combined)) {
        const existing = detectedMap.get(mapping.productId);
        if (existing) {
          existing.count += row.count;
        } else {
          detectedMap.set(mapping.productId, {
            count: row.count,
            from: logSource.startsWith("[{") ? "Security Events (XDR Tags)" : `Security Events (${logSource})`,
          });
        }
      }
    }
  }

  const cloudApps = await db
    .select({
      source: cloudAppRiskScores.source,
      count: sql<number>`count(*)::int`,
    })
    .from(cloudAppRiskScores)
    .where(eq(cloudAppRiskScores.tenantId, tenantId))
    .groupBy(cloudAppRiskScores.source);

  for (const app of cloudApps) {
    if (app.source === "skyhigh") {
      const existing = detectedMap.get("skyhigh_sse");
      if (existing) {
        existing.count += app.count;
      } else {
        detectedMap.set("skyhigh_sse", { count: app.count, from: "Cloud App Risk Registry (Skyhigh Import)" });
      }
    }
  }

  const results: DetectedProduct[] = [];
  detectedMap.forEach((data, productId) => {
    const def = PRODUCT_DEFINITIONS[productId];
    if (def) {
      results.push({
        ...def,
        eventCount: data.count,
        detectedFrom: data.from,
      });
    }
  });

  return results.sort((a, b) => b.eventCount - a.eventCount);
}

export function getProductDefinition(productId: string) {
  return PRODUCT_DEFINITIONS[productId] || null;
}

export function getAllProductDefinitions() {
  return PRODUCT_DEFINITIONS;
}

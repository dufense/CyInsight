export type EventType = "email" | "endpoint" | "vulnerability" | "casb" | "waf" | "dlp" | "sse" | "network" | "identity" | "cloud" | "web" | "database" | "ot_iot";

export interface VendorSignature {
  id: string;
  vendor: string;
  sourceType: EventType;
  fields: string[];
  priority: number;
}

export interface VendorDetectionResult {
  vendor: string;
  sourceType: EventType;
  confidence: number;
  signatureId: string;
}

const VENDOR_SIGNATURES: VendorSignature[] = [
  {
    id: "crowdstrike",
    fields: ["detection_id", "behaviors", "device", "max_severity_displayname", "hostinfo"],
    vendor: "CrowdStrike Falcon",
    sourceType: "endpoint",
    priority: 10,
  },
  {
    id: "sentinelone",
    fields: ["agentDetectedAt", "threatInfo", "agentRealtimeInfo", "mitigationStatus"],
    vendor: "SentinelOne",
    sourceType: "endpoint",
    priority: 10,
  },
  {
    id: "cortex_xdr",
    fields: ["alert_id", "endpoint_id", "detection_timestamp", "action_pretty", "actor_process_image_name"],
    vendor: "Palo Alto Cortex XDR",
    sourceType: "endpoint",
    priority: 10,
  },
  {
    id: "palo_alto_firewall",
    fields: ["TimeGenerated", "SourceZone", "DestinationZone", "Action", "Rule", "Application"],
    vendor: "Palo Alto Firewall",
    sourceType: "network",
    priority: 10,
  },
  {
    id: "checkpoint",
    fields: ["smartdefense_profile", "blade_name", "protection_type", "product"],
    vendor: "Check Point",
    sourceType: "network",
    priority: 10,
  },
  {
    id: "checkpoint_harmony",
    fields: ["emailThreatType", "effectiveAction", "phishingSubCategory", "senderDomain"],
    vendor: "Checkpoint Harmony Email",
    sourceType: "email",
    priority: 10,
  },
  {
    id: "microsoft_defender",
    fields: ["alertId", "incidentId", "serviceSource", "detectionSource", "category"],
    vendor: "Microsoft Defender",
    sourceType: "endpoint",
    priority: 10,
  },
  {
    id: "azure_sentinel",
    fields: ["AlertSeverity", "ProviderName", "CompromisedEntity", "AlertLink", "Tactics"],
    vendor: "Microsoft Sentinel",
    sourceType: "endpoint",
    priority: 10,
  },
  {
    id: "qualys",
    fields: ["QID", "SEVERITY", "CVSS_SCORE", "SOLUTION", "RESULTS"],
    vendor: "Qualys",
    sourceType: "vulnerability",
    priority: 10,
  },
  {
    id: "tenable",
    fields: ["plugin_id", "plugin_name", "risk_factor", "cvss_base_score", "see_also"],
    vendor: "Tenable Nessus",
    sourceType: "vulnerability",
    priority: 10,
  },
  {
    id: "rapid7",
    fields: ["vulnerability_id", "asset_id", "solution_fix", "risk_score", "exploit_count"],
    vendor: "Rapid7 InsightVM",
    sourceType: "vulnerability",
    priority: 10,
  },
  {
    id: "skyhigh_sse",
    fields: ["userName", "applicationName", "webAction", "Upload (Bytes)", "Download (Bytes)", "urlCategory"],
    vendor: "Skyhigh Security SSE",
    sourceType: "sse",
    priority: 10,
  },
  {
    id: "skyhigh_casb",
    fields: ["Service", "User", "Activity", "Object Type", "Threat Category"],
    vendor: "Skyhigh Security CASB",
    sourceType: "casb",
    priority: 10,
  },
  {
    id: "zscaler",
    fields: ["datetime", "user", "url", "action", "urlclass", "department"],
    vendor: "Zscaler",
    sourceType: "sse",
    priority: 10,
  },
  {
    id: "forcepoint_dlp",
    fields: ["policyName", "channel", "sourceInfo", "destinationInfo", "actionTaken", "matchedRule"],
    vendor: "Forcepoint DLP",
    sourceType: "dlp",
    priority: 10,
  },
  {
    id: "cynet",
    fields: ["alertType", "hostName", "riskScore", "processActionType", "remediationAction"],
    vendor: "Cynet",
    sourceType: "endpoint",
    priority: 10,
  },
  {
    id: "sophos",
    fields: ["managedAgent", "threat", "cleanedUp", "whenDetected", "location"],
    vendor: "Sophos",
    sourceType: "endpoint",
    priority: 10,
  },
  {
    id: "proofpoint",
    fields: ["threatsInfoMap", "messageParts", "senderIP", "fromAddress", "recipient"],
    vendor: "Proofpoint",
    sourceType: "email",
    priority: 10,
  },
  {
    id: "mimecast",
    fields: ["senderAddress", "recipientAddress", "subject", "route", "spamScore"],
    vendor: "Mimecast",
    sourceType: "email",
    priority: 10,
  },
  {
    id: "okta",
    fields: ["actor", "client", "outcome", "target", "eventType", "debugContext"],
    vendor: "Okta",
    sourceType: "identity",
    priority: 10,
  },
  {
    id: "azure_ad",
    fields: ["userPrincipalName", "appDisplayName", "conditionalAccessStatus", "riskDetail", "riskLevelDuringSignIn"],
    vendor: "Microsoft Entra ID",
    sourceType: "identity",
    priority: 10,
  },
  {
    id: "aws_cloudtrail",
    fields: ["eventSource", "eventName", "userIdentity", "awsRegion", "sourceIPAddress", "requestParameters"],
    vendor: "AWS CloudTrail",
    sourceType: "cloud",
    priority: 10,
  },
  {
    id: "aws_guardduty",
    fields: ["schemaVersion", "accountId", "region", "type", "resource", "service", "severity"],
    vendor: "AWS GuardDuty",
    sourceType: "cloud",
    priority: 10,
  },
  {
    id: "waf_generic",
    fields: ["ruleId", "ruleGroupId", "action", "httpRequest", "terminatingRuleId"],
    vendor: "AWS WAF",
    sourceType: "waf",
    priority: 10,
  },
  {
    id: "vicarius",
    fields: ["patchId", "patchName", "cveId", "exploitAvailable", "vulnerabilitySeverity", "assetName"],
    vendor: "Vicarius vRx",
    sourceType: "vulnerability",
    priority: 10,
  },
];

export class VendorRegistry {
  private signatures: VendorSignature[];

  constructor() {
    this.signatures = [...VENDOR_SIGNATURES].sort((a, b) => b.priority - a.priority);
  }

  detect(data: Record<string, any>): VendorDetectionResult | null {
    const keys = new Set(Object.keys(data));
    const nestedKeys = new Set<string>();

    for (const [, v] of Object.entries(data)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const nk of Object.keys(v)) {
          nestedKeys.add(nk);
        }
      }
    }

    const allKeys = new Set([...keys, ...nestedKeys]);

    let bestMatch: VendorDetectionResult | null = null;
    let bestScore = 0;

    for (const sig of this.signatures) {
      const matched = sig.fields.filter((f) => allKeys.has(f)).length;
      const score = matched / sig.fields.length;

      if (score > bestScore && score >= 0.4) {
        bestScore = score;
        bestMatch = {
          vendor: sig.vendor,
          sourceType: sig.sourceType,
          confidence: Math.round(score * 100),
          signatureId: sig.id,
        };
      }
    }

    return bestMatch;
  }

  register(signature: VendorSignature): void {
    this.signatures.push(signature);
    this.signatures.sort((a, b) => b.priority - a.priority);
  }

  getSignatures(): VendorSignature[] {
    return [...this.signatures];
  }

  getSignatureCount(): number {
    return this.signatures.length;
  }
}

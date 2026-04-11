import type { IOCIndicator } from "./ioc-scorer";

export interface ConfidenceFactors {
  sourceReliability: number;
  mitrePresence: number;
  iocScore: number;
  entityRichness: number;
  severityWeight: number;
  threatIntelMatch: number;
  total: number;
}

const SOURCE_RELIABILITY: Record<string, number> = {
  "CrowdStrike Falcon": 20,
  "Palo Alto Firewall": 18,
  "Palo Alto Cortex XDR": 18,
  "Microsoft Defender": 18,
  "Microsoft Sentinel": 18,
  "SentinelOne": 18,
  "Cynet": 15,
  "Checkpoint Harmony Email": 15,
  "Check Point": 15,
  "AWS GuardDuty": 18,
  "AWS CloudTrail": 15,
  "Okta": 15,
  "Microsoft Entra ID": 15,
  "Qualys": 15,
  "Tenable Nessus": 15,
  "Rapid7 InsightVM": 15,
  "Skyhigh Security SSE": 12,
  "Skyhigh Security CASB": 12,
  "Zscaler": 12,
  "Sophos": 14,
  "Proofpoint": 16,
  "Mimecast": 14,
  "AWS WAF": 14,
  "Forcepoint DLP": 12,
};

const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 15,
  high: 10,
  medium: 5,
  low: 2,
  informational: 0,
  info: 0,
};

export class ConfidenceCalculator {
  calculate(event: Record<string, any>, iocs: IOCIndicator[]): number {
    const factors = this.getFactors(event, iocs);
    return factors.total;
  }

  getFactors(event: Record<string, any>, iocs: IOCIndicator[]): ConfidenceFactors {
    let total = 30;

    const sourceName = event.logSource || event.sourceType || event.vendor || "";
    const sourceReliability = SOURCE_RELIABILITY[sourceName] || 5;
    total += sourceReliability;

    let mitrePresence = 0;
    if (event.mitreTactic || event.mitre_tactic) mitrePresence += 10;
    if (event.mitreTechnique || event.mitre_technique) mitrePresence += 5;
    total += mitrePresence;

    const maliciousIocs = iocs.filter((i) => i.reputation === "malicious").length;
    const suspiciousIocs = iocs.filter((i) => i.reputation === "suspicious").length;
    const iocScore = maliciousIocs * 5 + suspiciousIocs * 2;
    total += iocScore;

    let entityRichness = 0;
    if (event.asset || event.hostname) entityRichness += 3;
    if (event.user || event.userName) entityRichness += 3;
    if (event.threat && String(event.threat).length > 5) entityRichness += 5;
    if (iocs.some((i) => i.type === "ip")) entityRichness += 2;
    if (iocs.some((i) => i.type === "hash")) entityRichness += 3;
    total += entityRichness;

    const severity = (event.severity || "medium").toLowerCase();
    const severityWeight = SEVERITY_WEIGHTS[severity] || 3;
    total += severityWeight;

    let threatIntelMatch = 0;
    const highConfIocs = iocs.filter((i) => i.confidence >= 70);
    threatIntelMatch += highConfIocs.length * 3;
    total += threatIntelMatch;

    total = Math.min(100, Math.max(0, total));

    return {
      sourceReliability,
      mitrePresence,
      iocScore,
      entityRichness,
      severityWeight,
      threatIntelMatch,
      total,
    };
  }
}

import { pool } from "../db";
import type { AgentInput, AgentOutput } from "./types";

export async function executeThreatIntelAgent(input: AgentInput): Promise<AgentOutput> {
  const startTime = Date.now();
  const evidenceRefs: string[] = [];

  try {
    const { incident, relatedEvents } = input;
    const contextData = input.previousAgentOutputs?.["Context Agent"]?.data || {};
    const entities = contextData.entities || [];
    const iocData = contextData.iocData || {};

    const iocs: { type: string; value: string; reputation: string; context: string; sources: number }[] = [];

    if (iocData.indicators && Array.isArray(iocData.indicators)) {
      for (const indicator of iocData.indicators) {
        iocs.push({
          type: indicator.type || "unknown",
          value: indicator.value || "",
          reputation: indicator.reputation || "suspicious",
          context: indicator.context || "From incident IOC data",
          sources: 1,
        });
      }
    }

    const ipPattern = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
    const hashPattern = /\b[a-f0-9]{32,64}\b/gi;
    const domainPattern = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|xyz|info|biz|ru|cn|tk|top|club)\b/gi;
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

    const allText = [
      incident.description || "",
      incident.enriched_description || "",
      incident.threat_narrative || "",
      ...relatedEvents.slice(0, 20).map((e: any) => `${e.threat || ""} ${e.attacker || ""} ${e.target || ""}`),
    ].join(" ");

    const extractedEmails = Array.from(new Set((allText.match(emailPattern) || [])));
    const emailValues = new Set(extractedEmails.map(e => e.toLowerCase()));

    const extractedIPs = Array.from(new Set((allText.match(ipPattern) || [])));
    const extractedHashes = Array.from(new Set((allText.match(hashPattern) || [])));
    const rawDomains = Array.from(new Set((allText.match(domainPattern) || [])));
    const extractedDomains = rawDomains.filter(d => !emailValues.has(d.toLowerCase()) && !Array.from(emailValues).some(e => e.endsWith(`@${d.toLowerCase()}`)));

    for (const email of extractedEmails.slice(0, 10)) {
      if (!iocs.find(i => i.value === email)) {
        iocs.push({
          type: "email",
          value: email,
          reputation: "suspicious",
          context: "Email address extracted from event data",
          sources: 1,
        });
      }
    }

    for (const ip of extractedIPs.slice(0, 10)) {
      if (!iocs.find(i => i.value === ip)) {
        if (emailValues.has(ip)) continue;
        const isPrivate = ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("127.") || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
        iocs.push({
          type: "ip",
          value: ip,
          reputation: isPrivate ? "clean" : "suspicious",
          context: isPrivate ? "Internal/private IP" : "Extracted from event data",
          sources: 1,
        });
      }
    }

    for (const hash of extractedHashes.slice(0, 10)) {
      if (!iocs.find(i => i.value === hash)) {
        iocs.push({
          type: hash.length === 32 ? "md5" : hash.length === 40 ? "sha1" : "sha256",
          value: hash,
          reputation: "suspicious",
          context: "Hash extracted from event data",
          sources: 1,
        });
      }
    }

    for (const domain of extractedDomains.slice(0, 10)) {
      if (!iocs.find(i => i.value === domain)) {
        iocs.push({
          type: "domain",
          value: domain,
          reputation: "suspicious",
          context: "Domain extracted from event data",
          sources: 1,
        });
      }
    }

    for (const ioc of iocs) {
      if (ioc.type === "ip" && ioc.value.includes("@")) {
        ioc.type = "email";
        ioc.context = ioc.context.replace(/IP/gi, "Email sender").replace(/ip/g, "email");
      }
    }

    let crossSourceCount = 0;
    for (const ioc of iocs) {
      if (ioc.reputation === "clean") continue;
      try {
        const crossCheck = await pool.query(
          `SELECT DISTINCT event_type FROM security_events 
           WHERE tenant_id = $1 AND (attacker ILIKE $2 OR target ILIKE $2 OR description ILIKE $2)
           LIMIT 5`,
          [input.tenantId, `%${ioc.value}%`]
        );
        ioc.sources = crossCheck.rows.length;
        if (crossCheck.rows.length >= 2) {
          crossSourceCount++;
          ioc.reputation = "malicious";
          ioc.context += ` (seen across ${crossCheck.rows.length} event types: ${crossCheck.rows.map((r: any) => r.event_type).join(", ")})`;
          evidenceRefs.push(`IOC ${ioc.value} seen in ${crossCheck.rows.length} event types`);
        }
      } catch (err: any) {
        console.error(`[Threat Intel Agent] Cross-source check failed for IOC ${ioc.value}: ${err.message}`);
      }
    }

    const riskIntelligence = input.previousAgentOutputs?.["Context Agent"]?.data?.riskIntelligence || {};
    const contextDomainAuth: Record<string, { spfPass: boolean; dkimPass: boolean; dmarcPass: boolean }> = {};
    for (const da of riskIntelligence.domainAuthStatus || []) {
      contextDomainAuth[da.domain?.toLowerCase()] = da;
    }
    const contextEntityRisks: Record<string, { score: number; level: string }> = {};
    for (const er of riskIntelligence.entityRiskScores || []) {
      contextEntityRisks[er.entity?.toLowerCase()] = { score: er.score, level: er.level };
    }

    try {
      for (const ioc of iocs.slice(0, 10)) {
        if (ioc.type === "domain" || (ioc.type === "email" && ioc.value.includes("@"))) {
          const domainValue = ioc.type === "email" ? ioc.value.split("@")[1] : ioc.value;
          if (domainValue) {
            const cached = contextDomainAuth[domainValue.toLowerCase()];
            if (cached) {
              const authContext = [`SPF: ${cached.spfPass ? "pass" : "FAIL"}`, `DKIM: ${cached.dkimPass ? "pass" : "FAIL"}`, `DMARC: ${cached.dmarcPass ? "pass" : "FAIL"}`].join(", ");
              ioc.context += ` | Email auth: ${authContext}`;
              if (!cached.dmarcPass || !cached.spfPass) {
                ioc.context += " (FAILING — auth checks fail)";
                if (ioc.reputation === "unknown") ioc.reputation = "suspicious";
              }
              evidenceRefs.push(`Domain ${domainValue} email auth (cached): ${authContext}`);
              continue;
            }
            const dmarcResult = await pool.query(
              `SELECT 
                COUNT(*) FILTER (WHERE raw_payload->>'spfResult' IS NOT NULL) as spf_total,
                COUNT(*) FILTER (WHERE raw_payload->>'spfResult' = 'pass') as spf_pass,
                COUNT(*) FILTER (WHERE raw_payload->>'dkimResult' IS NOT NULL) as dkim_total,
                COUNT(*) FILTER (WHERE raw_payload->>'dkimResult' = 'pass') as dkim_pass,
                COUNT(*) FILTER (WHERE raw_payload->>'dmarcResult' IS NOT NULL) as dmarc_total,
                COUNT(*) FILTER (WHERE raw_payload->>'dmarcResult' = 'pass') as dmarc_pass
              FROM security_events 
              WHERE tenant_id = $1 AND (raw_payload->>'senderDomain' ILIKE $2 OR raw_payload->>'sender' ILIKE $3)
              LIMIT 500`,
              [input.tenantId, domainValue, `%@${domainValue}`]
            );
            const d = dmarcResult.rows[0];
            if (d && (parseInt(d.spf_total) > 0 || parseInt(d.dkim_total) > 0 || parseInt(d.dmarc_total) > 0)) {
              const spfStatus = parseInt(d.spf_total) > 0 ? `SPF: ${parseInt(d.spf_pass)}/${parseInt(d.spf_total)} pass` : "";
              const dkimStatus = parseInt(d.dkim_total) > 0 ? `DKIM: ${parseInt(d.dkim_pass)}/${parseInt(d.dkim_total)} pass` : "";
              const dmarcStatus = parseInt(d.dmarc_total) > 0 ? `DMARC: ${parseInt(d.dmarc_pass)}/${parseInt(d.dmarc_total)} pass` : "";
              const authContext = [spfStatus, dkimStatus, dmarcStatus].filter(Boolean).join(", ");
              ioc.context += ` | Email auth: ${authContext}`;
              const totalChecks = parseInt(d.spf_total) + parseInt(d.dkim_total) + parseInt(d.dmarc_total);
              const totalPass = parseInt(d.spf_pass) + parseInt(d.dkim_pass) + parseInt(d.dmarc_pass);
              if (totalChecks > 0 && (totalPass / totalChecks) < 0.5) {
                ioc.context += " (FAILING — majority of auth checks fail)";
                if (ioc.reputation === "unknown") ioc.reputation = "suspicious";
              }
              evidenceRefs.push(`Domain ${domainValue} email auth: ${authContext}`);
            }
          }
        }

        if (ioc.type === "ip") {
          const assetMatch = await pool.query(
            `SELECT hostname, risk_score, incident_count, enrichment_data, status
             FROM assets WHERE tenant_id = $1 AND ip_address = $2 LIMIT 1`,
            [input.tenantId, ioc.value]
          );
          if (assetMatch.rows.length > 0) {
            const asset = assetMatch.rows[0];
            const riskInfo = asset.risk_score ? `Risk Score: ${asset.risk_score}/100` : "";
            const incInfo = asset.incident_count ? `${asset.incident_count} prior incidents` : "";
            const hostInfo = asset.hostname ? `Host: ${asset.hostname}` : "";
            const details = [hostInfo, riskInfo, incInfo, asset.status ? `Status: ${asset.status}` : ""].filter(Boolean).join(", ");
            if (details) {
              ioc.context += ` | Asset intel: ${details}`;
              evidenceRefs.push(`IP ${ioc.value} matched asset: ${details}`);
            }
          }
        }

        if (ioc.type === "email" || ioc.type === "domain") {
          const cachedRisk = contextEntityRisks[ioc.value.toLowerCase()];
          if (cachedRisk) {
            ioc.context += ` | Platform risk: ${cachedRisk.score}/100 (${cachedRisk.level})`;
            evidenceRefs.push(`${ioc.type} ${ioc.value} platform risk (cached): ${cachedRisk.score}/100`);
          } else {
            const riskMatch = await pool.query(
              `SELECT overall_score, risk_level, entity_type FROM risk_scores 
               WHERE tenant_id = $1 AND entity_identifier ILIKE $2
               ORDER BY calculated_at DESC LIMIT 1`,
              [input.tenantId, `%${ioc.value}%`]
            );
            if (riskMatch.rows.length > 0) {
              const risk = riskMatch.rows[0];
              ioc.context += ` | Platform risk: ${Math.round(risk.overall_score)}/100 (${risk.risk_level})`;
              evidenceRefs.push(`${ioc.type} ${ioc.value} platform risk score: ${Math.round(risk.overall_score)}/100`);
            }
          }
        }
      }
    } catch (err: any) {
      console.error(`[Threat Intel Agent] Risk intelligence enrichment error: ${err.message}`);
    }

    let knownCampaign: string | null = null;
    let cveCorrelations: string[] = [];
    const cvePattern = /CVE-\d{4}-\d{4,}/gi;
    const cves = Array.from(new Set((allText.match(cvePattern) || [])));
    if (cves.length > 0) {
      cveCorrelations = cves;
      evidenceRefs.push(`${cves.length} CVE references found: ${cves.join(", ")}`);
    }

    const campaignPatterns = [
      { pattern: /cobalt.?strike|beacon/i, name: "Cobalt Strike Campaign" },
      { pattern: /emotet/i, name: "Emotet Campaign" },
      { pattern: /lockbit/i, name: "LockBit Ransomware Campaign" },
      { pattern: /blackcat|alphv/i, name: "BlackCat/ALPHV Campaign" },
      { pattern: /clop/i, name: "Clop Ransomware Campaign" },
      { pattern: /log4j|log4shell/i, name: "Log4Shell Exploitation" },
      { pattern: /sunburst|solarwinds/i, name: "SolarWinds Supply Chain" },
    ];

    for (const cp of campaignPatterns) {
      if (cp.pattern.test(allText)) {
        knownCampaign = cp.name;
        evidenceRefs.push(`Known campaign match: ${cp.name}`);
        break;
      }
    }

    const maliciousCount = iocs.filter(i => i.reputation === "malicious").length;
    const suspiciousCount = iocs.filter(i => i.reputation === "suspicious").length;
    const threatLevel = maliciousCount >= 3 ? "critical" : maliciousCount >= 1 ? "high" : suspiciousCount >= 3 ? "medium" : "low";

    const confidence = Math.min(100,
      (iocs.length > 0 ? 30 : 10) +
      (maliciousCount > 0 ? 30 : 0) +
      (crossSourceCount > 0 ? 20 : 0) +
      (knownCampaign ? 15 : 0) +
      (cveCorrelations.length > 0 ? 10 : 0)
    );

    evidenceRefs.push(`${iocs.length} total IOCs (${maliciousCount} malicious, ${suspiciousCount} suspicious)`);

    return {
      agentName: "Threat Intel Agent",
      status: "completed",
      duration: Date.now() - startTime,
      confidence,
      reasoning: `Analyzed ${iocs.length} indicators of compromise. ${maliciousCount} rated malicious, ${suspiciousCount} suspicious. ${crossSourceCount} IOCs appeared across multiple data sources. ${knownCampaign ? `Linked to known campaign: ${knownCampaign}.` : "No known campaign match."} ${cveCorrelations.length > 0 ? `CVE correlations: ${cveCorrelations.join(", ")}.` : ""} Threat level: ${threatLevel}.`,
      evidenceRefs,
      data: {
        iocs,
        maliciousCount,
        suspiciousCount,
        crossSourceCount,
        knownCampaign,
        cveCorrelations,
        threatLevel,
      },
    };
  } catch (error: any) {
    return {
      agentName: "Threat Intel Agent",
      status: "failed",
      duration: Date.now() - startTime,
      confidence: 0,
      reasoning: `Threat intelligence analysis failed: ${error.message}`,
      evidenceRefs,
      data: {},
    };
  }
}

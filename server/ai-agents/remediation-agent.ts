import type { AgentInput, AgentOutput } from "./types";

const ACTION_STATES = {
  REMEDIATED: ["blocked", "quarantined", "isolated", "remediated"],
  PARTIAL: ["investigated", "monitored", "detected", "ai analysis complete"],
  NONE: ["no action", "active", "partially delivered", ""],
};

function classifyActionState(actionTaken: string | null | undefined): "remediated" | "partial" | "none" {
  const action = (actionTaken || "").toLowerCase().trim();
  if (ACTION_STATES.REMEDIATED.some(a => action.includes(a))) return "remediated";
  if (ACTION_STATES.PARTIAL.some(a => action.includes(a))) return "partial";
  return "none";
}

function classifyDomain(incident: any): string {
  const source = (incident.source || "").toLowerCase();
  const category = (incident.category || "").toLowerCase();
  const type = (incident.incident_type || "").toLowerCase();
  const title = (incident.title || "").toLowerCase();

  if (source.includes("email") || source.includes("harmony email") || category.includes("email") || type.includes("phish") || type.includes("spam") || type.includes("bec") || title.includes("phishing") || title.includes("spam")) return "email";
  if (source.includes("endpoint") || source.includes("edr") || source.includes("cynet") || category.includes("endpoint") || type.includes("malware") || type.includes("ransomware") || title.includes("endpoint")) return "endpoint";
  if (source.includes("network") || source.includes("firewall") || source.includes("ids") || source.includes("ips") || category.includes("network") || type.includes("intrusion") || type.includes("ddos")) return "network";
  if (source.includes("waf") || source.includes("web") || category.includes("web") || type.includes("injection") || type.includes("xss") || type.includes("csrf")) return "web_app";
  if (source.includes("cloud") || source.includes("aws") || source.includes("azure") || source.includes("gcp") || source.includes("casb") || source.includes("sse") || category.includes("cloud") || category.includes("casb")) return "cloud";
  if (source.includes("identity") || source.includes("iam") || source.includes("active directory") || source.includes("ldap") || category.includes("identity") || type.includes("credential") || type.includes("brute") || type.includes("unauthorized")) return "identity";
  return "endpoint";
}

interface ContainmentAction {
  action: string;
  priority: string;
  urgency: string;
  riskExplanation: string;
  soarReady: boolean;
  alreadyApplied?: boolean;
}

interface RemediationStep {
  step: string;
  owner: string;
  timeline: string;
  details: string;
}

interface SignalIntelligenceItem {
  type: "ip" | "domain" | "hash" | "user" | "host" | "email" | "url";
  value: string;
  risk: "critical" | "high" | "medium" | "low";
  context: string;
  recommendation: string;
}

export async function executeRemediationAgent(input: AgentInput): Promise<AgentOutput> {
  const startTime = Date.now();
  const evidenceRefs: string[] = [];

  try {
    const { incident } = input;
    const contextData = input.previousAgentOutputs?.["Context Agent"]?.data || {};
    const threatIntelData = input.previousAgentOutputs?.["Threat Intel Agent"]?.data || {};
    const behaviorData = input.previousAgentOutputs?.["Behavior Agent"]?.data || {};
    const correlationData = input.previousAgentOutputs?.["Correlation Agent"]?.data || {};
    const riskData = input.previousAgentOutputs?.["Risk Scoring Agent"]?.data || {};
    const decisionMetrics = riskData.decisionMetrics || {};
    const riskScore = decisionMetrics.riskScore || 50;

    const actionTaken = incident.action_taken || "";
    const actionState = classifyActionState(actionTaken);
    const incidentStatus = (incident.status || "open").toLowerCase();
    const domain = classifyDomain(incident);
    const attackType = (incident.incident_type || "").toLowerCase();
    const severity = (incident.severity || "medium").toLowerCase();

    const riskIntelligence = contextData.riskIntelligence || { entityRiskScores: [], cloudAppRisks: [], domainAuthStatus: [] };
    const maliciousIOCs = threatIntelData.iocs?.filter((i: any) => i.reputation === "malicious") || [];
    const suspiciousIOCs = threatIntelData.iocs?.filter((i: any) => i.reputation === "suspicious") || [];
    const hasLateralMovement = correlationData.hasLateralMovement || behaviorData.lateralMovementIndicators > 0;
    const hasExfiltration = behaviorData.dataExfiltrationRisk || false;
    const hasPrivilegeEscalation = behaviorData.privilegeEscalation || false;

    const containmentActions: ContainmentAction[] = [];
    const remediationSteps: RemediationStep[] = [];
    const preventionMeasures: string[] = [];
    const signalIntelligence: SignalIntelligenceItem[] = [];

    const isRemediated = actionState === "remediated";
    const isContained = incidentStatus === "contained" || incidentStatus === "resolved" || incidentStatus === "closed";

    evidenceRefs.push(`Action taken: "${actionTaken || "None"}" (state: ${actionState})`);
    evidenceRefs.push(`Security domain: ${domain}`);

    // ═══════════════════════════════════════════════════
    // SIGNAL INTELLIGENCE — Extract IOC signals
    // ═══════════════════════════════════════════════════
    if (maliciousIOCs.length > 0) {
      for (const ioc of maliciousIOCs.slice(0, 10)) {
        const iocType = ioc.type || "unknown";
        let recommendation = "";
        if (iocType === "ip") recommendation = "Block at perimeter firewall and add to threat intelligence feed";
        else if (iocType === "domain") recommendation = "Sinkhole at DNS and block at web proxy";
        else if (["md5", "sha1", "sha256"].includes(iocType)) recommendation = "Add to EDR block list and scan all endpoints";
        else if (iocType === "url") recommendation = "Block at web proxy and URL filter";
        else if (iocType === "email") recommendation = "Block sender and report to anti-phishing services";
        else recommendation = "Investigate and add to block list";

        signalIntelligence.push({
          type: iocType as any,
          value: ioc.value || "Unknown",
          risk: "critical",
          context: ioc.context || `Malicious ${iocType} detected in incident`,
          recommendation,
        });
      }
    }

    if (suspiciousIOCs.length > 0) {
      for (const ioc of suspiciousIOCs.slice(0, 5)) {
        signalIntelligence.push({
          type: (ioc.type || "unknown") as any,
          value: ioc.value || "Unknown",
          risk: "medium",
          context: ioc.context || `Suspicious ${ioc.type} requires monitoring`,
          recommendation: "Monitor closely and investigate for additional context",
        });
      }
    }

    const compromisedUsers = behaviorData.anomalies?.filter((a: any) => a.entityType === "user" && a.significance === "critical") || [];
    for (const user of compromisedUsers.slice(0, 5)) {
      signalIntelligence.push({
        type: "user",
        value: user.entity || "Unknown user",
        risk: "high",
        context: `${user.anomalyType || "Anomalous behavior"}: ${user.details || "Deviation from baseline"}`,
        recommendation: "Review account activity, reset credentials, and enforce MFA",
      });
    }

    const compromisedHosts = behaviorData.anomalies?.filter((a: any) => a.entityType === "host" && (a.significance === "critical" || a.significance === "high")) || [];
    for (const host of compromisedHosts.slice(0, 5)) {
      signalIntelligence.push({
        type: "host",
        value: host.entity || "Unknown host",
        risk: "high",
        context: `${host.anomalyType || "Abnormal activity"}: ${host.details || "Requires investigation"}`,
        recommendation: "Isolate host, run full EDR scan, and review recent activity logs",
      });
    }

    if (incident.source_ip && maliciousIOCs.some((i: any) => i.value === incident.source_ip)) {
      const isEmail = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(incident.source_ip);
      const isValidIP = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(incident.source_ip);
      if (isEmail) {
        signalIntelligence.push({
          type: "email",
          value: incident.source_ip,
          risk: "critical",
          context: "Malicious sender email confirmed — active phishing/spam source",
          recommendation: "Block sender address, quarantine all pending emails from this sender, and report to anti-phishing services",
        });
      } else if (isValidIP) {
        signalIntelligence.push({
          type: "ip",
          value: incident.source_ip,
          risk: "critical",
          context: "Source IP confirmed malicious — active threat source",
          recommendation: "Immediate firewall block and investigate all connections from this IP in last 72 hours",
        });
      } else {
        signalIntelligence.push({
          type: "domain",
          value: incident.source_ip,
          risk: "critical",
          context: "Malicious source confirmed — active threat indicator",
          recommendation: "Block at DNS/proxy and investigate all related activity",
        });
      }
    }

    for (const domainAuth of riskIntelligence.domainAuthStatus || []) {
      const authStatus = [
        `SPF: ${domainAuth.spfPass ? "pass" : "FAIL"}`,
        `DKIM: ${domainAuth.dkimPass ? "pass" : "FAIL"}`,
        `DMARC: ${domainAuth.dmarcPass ? "pass" : "FAIL"}`,
      ].join(", ");
      const anyFailing = !domainAuth.spfPass || !domainAuth.dkimPass || !domainAuth.dmarcPass;
      if (anyFailing) {
        signalIntelligence.push({
          type: "domain",
          value: domainAuth.domain,
          risk: !domainAuth.dmarcPass ? "high" : "medium",
          context: `Email authentication: ${authStatus}`,
          recommendation: !domainAuth.dmarcPass 
            ? "Domain DMARC is failing — block sender domain and quarantine all pending emails from this domain"
            : "Monitor domain email authentication and consider tightening DMARC policy",
        });
      }
    }

    for (const entityRisk of riskIntelligence.entityRiskScores || []) {
      if (entityRisk.score >= 60) {
        const existing = signalIntelligence.find(s => s.value === entityRisk.entity);
        if (existing) {
          existing.context += ` | Platform Risk: ${entityRisk.score}/100 (${entityRisk.level})`;
        } else {
          signalIntelligence.push({
            type: entityRisk.type === "host" ? "host" : entityRisk.type === "user" ? "user" : "domain",
            value: entityRisk.entity,
            risk: entityRisk.score >= 80 ? "critical" : "high",
            context: `Platform Risk Score: ${entityRisk.score}/100 (${entityRisk.level}). Entity type: ${entityRisk.type}`,
            recommendation: entityRisk.score >= 80 
              ? "Severe risk — immediate isolation and investigation required"
              : "High risk entity — prioritize for investigation and monitoring",
          });
        }
      }
    }

    for (const cloudApp of riskIntelligence.cloudAppRisks || []) {
      const ci = cloudApp.confidenceIndex ?? 100;
      const classification = (cloudApp.classification || "").toLowerCase();
      // Only flag genuinely risky cloud apps: Shadow IT, or unclassified/unknown low-trust apps
      // HIGH confidence (trusted, sanctioned) apps must be excluded — they are not threats
      const isTrusted = ci >= 70 && (classification.includes("trusted") || classification.includes("sanctioned") || classification.includes("approved"));
      if (isTrusted && !cloudApp.isShadowIT) continue;

      const isUnknown = ci < 40 || classification.includes("unknown") || classification.includes("unclassified");
      const appName = cloudApp.appName || "Unknown App";
      const appCategory = cloudApp.category || cloudApp.appCategory || "cloud application";

      let specificRec = "";
      if (cloudApp.isShadowIT) {
        specificRec = `Block ${appName} — unauthorized shadow IT detected with no approved business justification. Enforce data-transfer restrictions and redirect users to sanctioned ${appCategory} alternatives.`;
      } else if (isUnknown) {
        specificRec = `Review ${appName} usage (trust score: ${ci}/100) — unclassified application. Verify business justification, apply DLP monitoring, and consider restricting until formally assessed by IT.`;
      } else if (cloudApp.isAIService) {
        specificRec = `Audit AI service ${appName} — verify no sensitive or regulated data (PII, PHI, IP) is being uploaded. Enforce AI usage policy and apply data-loss-prevention controls for this service.`;
      } else {
        specificRec = `Monitor ${appName} (confidence: ${ci}/100) — apply session controls via CASB and enforce data-upload policies to prevent accidental data exposure through this application.`;
      }

      signalIntelligence.push({
        type: "domain",
        value: appName,
        risk: cloudApp.isShadowIT ? "high" : isUnknown ? "high" : "medium",
        context: `Cloud App — Confidence Index: ${ci}/100 (${cloudApp.classification || "unclassified"})${cloudApp.isShadowIT ? " · Shadow IT" : ""}${cloudApp.isAIService ? " · AI Service" : ""}`,
        recommendation: specificRec,
      });
    }

    // ═══════════════════════════════════════════════════
    // CONTAINMENT ACTIONS — Action-state aware
    // ═══════════════════════════════════════════════════
    if (isRemediated || isContained) {
      if (actionTaken) {
        containmentActions.push({
          action: `Security control action already applied: ${actionTaken}`,
          priority: "info" as any,
          urgency: "completed",
          riskExplanation: "Automated or manual response has already addressed the immediate threat",
          soarReady: false,
          alreadyApplied: true,
        });
      }

      if (maliciousIOCs.length > 0) {
        const unresolvedIPs = maliciousIOCs.filter((i: any) => i.type === "ip");
        const unresolvedDomains = maliciousIOCs.filter((i: any) => i.type === "domain");
        if (unresolvedIPs.length > 0) {
          containmentActions.push({
            action: `Verify ${unresolvedIPs.length} malicious IP(s) are blocked across all perimeter controls: ${unresolvedIPs.map((i: any) => i.value).join(", ")}`,
            priority: "high",
            urgency: "within_4h",
            riskExplanation: "Ensure comprehensive blocking — threat may bypass single control point",
            soarReady: true,
          });
        }
        if (unresolvedDomains.length > 0) {
          containmentActions.push({
            action: `Confirm DNS/proxy blocking for ${unresolvedDomains.length} malicious domain(s): ${unresolvedDomains.map((i: any) => i.value).join(", ")}`,
            priority: "high",
            urgency: "within_4h",
            riskExplanation: "Validate domain-level blocking is enforced across all DNS resolvers",
            soarReady: true,
          });
        }
      }

      if (hasLateralMovement) {
        containmentActions.push({
          action: "Verify lateral movement has been fully contained — scan adjacent network segments for compromise indicators",
          priority: "high",
          urgency: "within_4h",
          riskExplanation: "Even with containment applied, lateral movement may have reached additional systems before isolation",
          soarReady: false,
        });
      }

    } else {
      // NO REMEDIATION YET — recommend immediate actions
      if (maliciousIOCs.length > 0) {
        const ips = maliciousIOCs.filter((i: any) => i.type === "ip");
        const domains = maliciousIOCs.filter((i: any) => i.type === "domain");
        const hashes = maliciousIOCs.filter((i: any) => ["md5", "sha1", "sha256"].includes(i.type));

        if (ips.length > 0) {
          containmentActions.push({
            action: `IMMEDIATE: Block ${ips.length} malicious IP(s) at firewall: ${ips.map((i: any) => i.value).join(", ")}`,
            priority: "critical",
            urgency: "immediate",
            riskExplanation: "Blocking malicious IPs prevents ongoing C2 communication and data exfiltration",
            soarReady: true,
          });
        }
        if (domains.length > 0) {
          containmentActions.push({
            action: `IMMEDIATE: Block ${domains.length} malicious domain(s) at DNS/proxy: ${domains.map((i: any) => i.value).join(", ")}`,
            priority: "critical",
            urgency: "immediate",
            riskExplanation: "DNS blocking prevents phishing link access and C2 domain resolution",
            soarReady: true,
          });
        }
        if (hashes.length > 0) {
          containmentActions.push({
            action: `Add ${hashes.length} malicious hash(es) to EDR block list for endpoint-wide protection`,
            priority: "high",
            urgency: "within_1h",
            riskExplanation: "Hash blocking prevents execution of known malicious files across the environment",
            soarReady: true,
          });
        }
      }

      if (hasLateralMovement) {
        containmentActions.push({
          action: "CRITICAL: Isolate affected hosts from the network immediately to prevent further lateral movement",
          priority: "critical",
          urgency: "immediate",
          riskExplanation: "Active lateral movement detected — network isolation is the highest priority to stop spread",
          soarReady: true,
        });
      }

      if (hasPrivilegeEscalation) {
        containmentActions.push({
          action: "CRITICAL: Disable or reset credentials for compromised accounts with elevated privileges",
          priority: "critical",
          urgency: "immediate",
          riskExplanation: "Compromised privileged accounts can cause maximum damage — immediate credential reset required",
          soarReady: true,
        });
      }

      if (hasExfiltration) {
        containmentActions.push({
          action: "Block outbound data transfers on affected hosts and review DLP alerts immediately",
          priority: "critical",
          urgency: "immediate",
          riskExplanation: "Active data exfiltration requires immediate egress filtering — check for sensitive data exposure",
          soarReady: false,
        });
      }

      const affectedAssets = (incident.affected_assets || "").split(",").filter(Boolean);
      if (affectedAssets.length > 0 && riskScore > 60) {
        containmentActions.push({
          action: `Isolate affected asset(s): ${affectedAssets.slice(0, 5).join(", ")}`,
          priority: riskScore > 80 ? "critical" : "high",
          urgency: riskScore > 80 ? "immediate" : "within_1h",
          riskExplanation: `Asset isolation prevents threat spread. Impact: ${affectedAssets.length} asset(s) will be temporarily offline`,
          soarReady: true,
        });
      }

      if (riskScore < 30 && containmentActions.length === 0) {
        containmentActions.push({
          action: "Monitor and log — no immediate containment required for low-risk incident",
          priority: "low",
          urgency: "within_week",
          riskExplanation: "Low risk score indicates minimal threat. Continued monitoring is sufficient",
          soarReady: false,
        });
      }
    }

    // ═══════════════════════════════════════════════════
    // DOMAIN-SPECIFIC REMEDIATION & PREVENTION
    // ═══════════════════════════════════════════════════
    if (domain === "email") {
      if (isRemediated) {
        remediationSteps.push(
          { step: "Verify all instances of the malicious email have been purged from all mailboxes", owner: "SOC", timeline: "2 hours", details: "Use email gateway search to confirm no copies remain in any user inbox, sent, or draft folders" },
          { step: "Review mail flow rules and transport policies for bypass gaps", owner: "IT", timeline: "4 hours", details: "Check if any mail flow rules could allow similar emails to bypass filtering" },
          { step: "Conduct targeted phishing awareness training for affected users", owner: "Management", timeline: "1 week", details: "Schedule training session focused on the specific attack vector — simulate similar phishing attempts" },
          { step: "Report phishing indicators to industry sharing groups and anti-phishing services", owner: "SOC", timeline: "24 hours", details: "Submit IOCs to PhishTank, VirusTotal, and relevant ISACs for community defense" },
        );
        preventionMeasures.push(
          "Strengthen DMARC policy to p=reject for all organizational domains",
          "Enable advanced URL detonation and time-of-click rewriting for email links",
          "Deploy user-reported phishing button with automated triage workflow",
          "Review and tighten anti-spoofing policies (DKIM alignment, SPF -all)",
          "Conduct organization-wide phishing simulation exercise within 30 days",
        );
      } else {
        remediationSteps.push(
          { step: "Quarantine the phishing/malicious email across all inboxes immediately", owner: "SOC", timeline: "1 hour", details: "Use email gateway to search-and-destroy all instances of the email across the organization" },
          { step: "Reset passwords for all users who interacted with the email (clicked links or opened attachments)", owner: "IT", timeline: "2 hours", details: "Identify users who clicked links, opened attachments, or replied — force password resets and revoke sessions" },
          { step: "Check for credential harvesting — review authentication logs for compromised accounts", owner: "SOC", timeline: "4 hours", details: "Search for logins from unusual locations/IPs for users who interacted with the phishing email" },
          { step: "Report malicious sender domain and URLs to email security vendor for global blocking", owner: "SOC", timeline: "4 hours", details: "Submit indicators to email gateway vendor and anti-phishing databases" },
        );
        preventionMeasures.push(
          "Implement DMARC/DKIM/SPF policies with enforcement",
          "Deploy URL rewriting and time-of-click sandboxing for email links",
          "Enable multi-factor authentication for all email accounts",
          "Configure attachment sandboxing for executable and macro-enabled files",
        );
      }
    } else if (domain === "endpoint") {
      if (isRemediated) {
        remediationSteps.push(
          { step: "Verify malware removal is complete — run full deep scan on affected endpoints", owner: "SOC", timeline: "2 hours", details: "Confirm EDR shows clean state, check for persistence mechanisms (registry, scheduled tasks, services)" },
          { step: "Review endpoint telemetry for any residual compromise indicators", owner: "SOC", timeline: "4 hours", details: "Check process trees, file modifications, and network connections for signs of incomplete remediation" },
          { step: "Patch the vulnerability or close the initial access vector that was exploited", owner: "IT", timeline: "24 hours", details: "Apply security patches for the exploited vulnerability or reconfigure the misconfiguration" },
          { step: "Create or update EDR detection rules based on observed attack TTPs", owner: "SOC", timeline: "1 week", details: "Add behavioral detection rules for the specific attack patterns observed in this incident" },
        );
        preventionMeasures.push(
          "Deploy application whitelisting on high-value endpoints",
          "Enable EDR behavioral detection and response rules for observed TTPs",
          "Implement network segmentation to limit endpoint-to-endpoint lateral movement",
          "Review and harden endpoint security baselines (disable unnecessary services, restrict PowerShell)",
          "Schedule regular vulnerability scans on all endpoints",
        );
      } else {
        remediationSteps.push(
          { step: "Run full antimalware and EDR scan on all affected endpoints immediately", owner: "SOC", timeline: "2 hours", details: "Use EDR to perform deep scan, kill malicious processes, and remove identified malware" },
          { step: "Isolate affected hosts if not already done — prevent lateral spread", owner: "SOC", timeline: "immediate", details: "Network-level or EDR-level isolation until full cleanup is confirmed" },
          { step: "Restore affected systems from last known clean backup if needed", owner: "IT", timeline: "4 hours", details: "Verify backup integrity before restoration — check backup timestamps against initial compromise date" },
          { step: "Patch vulnerabilities exploited for initial access", owner: "IT", timeline: "24 hours", details: "Apply security patches to prevent re-infection through the same vector" },
        );
        preventionMeasures.push(
          "Deploy application whitelisting on critical endpoints",
          "Enable EDR behavioral detection rules",
          "Implement network segmentation to limit blast radius",
          "Harden endpoint configurations (disable macros, restrict PowerShell execution policy)",
        );
      }
    } else if (domain === "network") {
      if (isRemediated) {
        remediationSteps.push(
          { step: "Review and validate all firewall rule changes made during incident response", owner: "SOC", timeline: "4 hours", details: "Ensure blocking rules are permanent, not temporary — verify no overly broad rules were created" },
          { step: "Analyze network traffic logs for any additional C2 channels or exfiltration paths", owner: "SOC", timeline: "8 hours", details: "Deep packet inspection for encrypted tunnels, DNS tunneling, or other covert channels" },
          { step: "Update IDS/IPS signatures based on observed network attack patterns", owner: "SOC", timeline: "24 hours", details: "Create custom detection signatures for the specific network-level TTPs observed" },
          { step: "Conduct network architecture review for segmentation gaps", owner: "IT", timeline: "1 week", details: "Identify areas where lateral movement was possible and implement micro-segmentation" },
        );
        preventionMeasures.push(
          "Implement network micro-segmentation with zero-trust principles",
          "Deploy DNS security (sinkholing, DNS-over-HTTPS inspection, threat feeds)",
          "Enable NetFlow/IPFIX collection for network traffic analytics",
          "Review and tighten firewall rules — remove overly permissive rules",
          "Deploy network detection and response (NDR) for encrypted traffic analysis",
        );
      } else {
        remediationSteps.push(
          { step: "Block malicious network indicators at all perimeter firewalls immediately", owner: "SOC", timeline: "immediate", details: "Block source IPs, destination IPs, and any identified C2 addresses at firewall and web proxy" },
          { step: "Implement DNS sinkholing for identified malicious domains", owner: "SOC", timeline: "1 hour", details: "Redirect DNS queries for malicious domains to sinkhole server for monitoring and blocking" },
          { step: "Review affected network segments for lateral movement indicators", owner: "SOC", timeline: "4 hours", details: "Analyze east-west traffic for unusual connections between internal hosts" },
          { step: "Update IDS/IPS rule sets with new indicators of compromise", owner: "SOC", timeline: "4 hours", details: "Deploy custom signatures for observed network attack patterns" },
        );
        preventionMeasures.push(
          "Implement network segmentation and micro-segmentation",
          "Deploy DNS security (threat feed integration, sinkholing)",
          "Enable advanced IDS/IPS with behavioral analytics",
          "Review and tighten firewall rules — apply least-privilege network access",
        );
      }
    } else if (domain === "web_app") {
      if (isRemediated) {
        remediationSteps.push(
          { step: "Review WAF logs and validate that the attack vector is fully blocked", owner: "SOC", timeline: "2 hours", details: "Confirm WAF rules are blocking the specific attack patterns — check for bypass techniques" },
          { step: "Conduct security code review of the affected application components", owner: "Development", timeline: "1 week", details: "Review input validation, authentication, authorization, and session management in affected code" },
          { step: "Schedule penetration test for the affected web application", owner: "Security", timeline: "2 weeks", details: "Engage security testing team to validate the fix and check for related vulnerabilities" },
          { step: "Review application logs for other exploitation attempts of the same vulnerability", owner: "SOC", timeline: "4 hours", details: "Search for similar attack patterns from other source IPs — may indicate wider campaign" },
        );
        preventionMeasures.push(
          "Implement WAF virtual patching for identified vulnerability classes",
          "Deploy runtime application self-protection (RASP) on critical applications",
          "Integrate SAST/DAST into CI/CD pipeline for early vulnerability detection",
          "Implement rate limiting and bot protection for web-facing applications",
          "Enable Content Security Policy (CSP) headers and other security headers",
        );
      } else {
        remediationSteps.push(
          { step: "Deploy WAF emergency rule to block the specific attack pattern immediately", owner: "SOC", timeline: "immediate", details: "Create targeted WAF rule for the observed injection/exploit pattern" },
          { step: "Patch or apply virtual patch for the exploited web application vulnerability", owner: "Development", timeline: "4 hours", details: "Apply security patch or WAF virtual patch while code fix is developed" },
          { step: "Review application for data compromise — check for unauthorized data access", owner: "SOC", timeline: "4 hours", details: "Analyze database query logs and application logs for successful data extraction" },
          { step: "Implement input validation fixes and security hardening", owner: "Development", timeline: "24 hours", details: "Fix root cause vulnerability with proper input sanitization and parameterized queries" },
        );
        preventionMeasures.push(
          "Deploy WAF with OWASP Core Rule Set and custom rules",
          "Implement input validation and output encoding across all application endpoints",
          "Enable rate limiting and bot protection",
          "Deploy security headers (CSP, X-Frame-Options, X-Content-Type-Options)",
        );
      }
    } else if (domain === "cloud") {
      if (isRemediated) {
        remediationSteps.push(
          { step: "Audit all IAM policy changes made during incident — verify no backdoor access remains", owner: "SOC", timeline: "4 hours", details: "Review CloudTrail/Activity Log for policy modifications, new roles, or permission escalations" },
          { step: "Rotate all API keys and access tokens for affected cloud services", owner: "IT", timeline: "4 hours", details: "Regenerate credentials for any service that may have been compromised" },
          { step: "Run cloud security posture management (CSPM) scan", owner: "SOC", timeline: "8 hours", details: "Identify and remediate any misconfigurations introduced during or before the incident" },
          { step: "Review cloud resource provisioning for unauthorized resources", owner: "IT", timeline: "24 hours", details: "Check for rogue instances, storage buckets, or Lambda functions created by attacker" },
        );
        preventionMeasures.push(
          "Enforce least-privilege IAM policies with regular access reviews",
          "Enable cloud-native security monitoring (GuardDuty, Security Center, SCC)",
          "Implement service control policies (SCPs) to restrict high-risk actions",
          "Deploy cloud workload protection platform (CWPP) for runtime security",
          "Enable MFA for all cloud console access and API operations",
        );
      } else {
        remediationSteps.push(
          { step: "Revoke compromised cloud credentials and API keys immediately", owner: "SOC", timeline: "immediate", details: "Disable affected IAM users/roles and rotate all associated access keys" },
          { step: "Review CloudTrail/Activity logs for unauthorized actions", owner: "SOC", timeline: "2 hours", details: "Search for resource modifications, data access, privilege escalation attempts" },
          { step: "Lock down affected cloud resources — restrict security groups and IAM", owner: "IT", timeline: "1 hour", details: "Apply restrictive security groups and remove any over-permissive IAM policies" },
          { step: "Scan for unauthorized cloud resources created by attacker", owner: "IT", timeline: "4 hours", details: "Check for rogue VMs, storage, functions, or networking changes across all regions" },
        );
        preventionMeasures.push(
          "Enforce least-privilege IAM with automated policy analysis",
          "Enable cloud security posture management (CSPM)",
          "Implement guardrails via service control policies",
          "Require MFA for all cloud administrative operations",
        );
      }
    } else if (domain === "identity") {
      if (isRemediated) {
        remediationSteps.push(
          { step: "Verify all compromised accounts have been secured — confirm password resets and MFA enrollment", owner: "IT", timeline: "2 hours", details: "Check that all affected accounts have new credentials and active MFA — revoke any lingering sessions" },
          { step: "Review authentication logs for any successful unauthorized access before lockout", owner: "SOC", timeline: "4 hours", details: "Determine what data or systems the attacker accessed with compromised credentials" },
          { step: "Audit privileged access — review all admin and service accounts", owner: "IT", timeline: "1 week", details: "Check for dormant admin accounts, shared credentials, and over-privileged service accounts" },
          { step: "Implement enhanced monitoring for the compromised accounts", owner: "SOC", timeline: "24 hours", details: "Set up alerts for unusual login patterns, impossible travel, and off-hours access" },
        );
        preventionMeasures.push(
          "Enforce MFA on all accounts — prioritize privileged and external-facing accounts",
          "Deploy adaptive authentication with risk-based step-up",
          "Implement credential monitoring service (dark web, paste sites)",
          "Enable account lockout policies with progressive delays",
          "Conduct regular privileged access reviews and certification campaigns",
        );
      } else {
        remediationSteps.push(
          { step: "Reset all compromised account passwords immediately and revoke active sessions", owner: "IT", timeline: "immediate", details: "Force password change, terminate all sessions, and disable accounts if actively exploited" },
          { step: "Review authentication logs for successful unauthorized logins", owner: "SOC", timeline: "2 hours", details: "Check for successful logins from attack source, unusual geolocations, or off-hours access" },
          { step: "Enable MFA on all affected accounts if not already active", owner: "IT", timeline: "4 hours", details: "Deploy MFA with hardware tokens or authenticator apps — disable SMS-based MFA" },
          { step: "Implement account lockout policies to prevent further brute force", owner: "IT", timeline: "24 hours", details: "Configure progressive lockout: 5 attempts → 15 min lock, 10 attempts → 1 hour lock" },
        );
        preventionMeasures.push(
          "Enforce MFA on all accounts organization-wide",
          "Implement adaptive/risk-based authentication",
          "Deploy credential monitoring service",
          "Enable account lockout with progressive delays",
        );
      }
    } else {
      if (isRemediated) {
        remediationSteps.push(
          { step: "Verify remediation completeness — confirm all attack vectors are closed", owner: "SOC", timeline: "4 hours", details: "Review all actions taken and validate no residual threat remains" },
          { step: "Conduct post-incident review and document lessons learned", owner: "SOC", timeline: "1 week", details: "Document timeline, root cause, response effectiveness, and improvement areas" },
          { step: "Update incident response playbooks based on this incident", owner: "SOC", timeline: "2 weeks", details: "Incorporate new detection patterns and response procedures" },
        );
        preventionMeasures.push(
          "Conduct tabletop exercise simulating this attack scenario",
          "Update detection rules based on observed TTPs",
          "Review and harden security controls across the attack surface",
          "Schedule security awareness training focused on this attack type",
        );
      } else {
        remediationSteps.push(
          { step: "Investigate root cause and determine the full scope of the incident", owner: "SOC", timeline: "4 hours", details: "Identify initial access vector, affected systems, and data at risk" },
          { step: "Apply targeted containment and remediation based on investigation findings", owner: "IT", timeline: "24 hours", details: "Address specific vulnerabilities, misconfigurations, or compromised accounts found" },
          { step: "Document incident timeline and update response playbooks", owner: "SOC", timeline: "1 week", details: "Create comprehensive incident report for stakeholders" },
        );
        preventionMeasures.push(
          "Review and harden security controls",
          "Update detection rules based on incident TTPs",
          "Conduct tabletop exercise for similar scenarios",
        );
      }
    }

    // ═══════════════════════════════════════════════════
    // PROACTIVE MEASURES (when already remediated)
    // ═══════════════════════════════════════════════════
    if (isRemediated) {
      preventionMeasures.push(
        "Conduct threat hunting for similar attack patterns across the organization",
        "Share anonymized IOCs with industry peers and threat intelligence sharing communities",
      );

      if (correlationData.relatedIncidents?.length > 2) {
        preventionMeasures.push("Multiple related incidents detected — investigate for coordinated campaign or persistent threat actor");
      }
    }

    evidenceRefs.push(`${containmentActions.length} containment actions, ${remediationSteps.length} remediation steps, ${preventionMeasures.length} prevention measures, ${signalIntelligence.length} signals`);

    const confidence = Math.min(100,
      (containmentActions.length > 0 ? 25 : 10) +
      (maliciousIOCs.length > 0 ? 20 : 5) +
      (remediationSteps.length > 0 ? 20 : 10) +
      (signalIntelligence.length > 0 ? 15 : 5) +
      (riskScore > 0 ? 10 : 5) +
      (contextData.assetContext?.length > 0 ? 10 : 5)
    );

    const actionStateLabel = isRemediated ? "REMEDIATED — Proactive focus" : actionState === "partial" ? "PARTIALLY ADDRESSED — Verify & strengthen" : "NO ACTION TAKEN — Immediate response required";

    return {
      agentName: "Remediation Agent",
      status: "completed",
      duration: Date.now() - startTime,
      confidence,
      reasoning: `[${domain.toUpperCase()}] ${actionStateLabel}. Generated ${containmentActions.length} containment actions (${containmentActions.filter(a => a.soarReady).length} SOAR-ready), ${remediationSteps.length} ${isRemediated ? "verification/proactive" : "remediation"} steps, ${preventionMeasures.length} prevention measures, and ${signalIntelligence.length} IOC signals. ${hasLateralMovement ? "Lateral movement response included. " : ""}${hasExfiltration ? "Data exfiltration response included. " : ""}${hasPrivilegeEscalation ? "Privilege escalation response included. " : ""}${isRemediated ? `Security control "${actionTaken}" already applied — recommendations focus on verification, proactive defense, and awareness.` : ""}`,
      evidenceRefs,
      data: {
        containmentActions,
        remediationSteps,
        preventionMeasures,
        signalIntelligence,
        actionState,
        actionTaken: actionTaken || "None",
        securityDomain: domain,
        soarReadyCount: containmentActions.filter(a => a.soarReady).length,
        immediateActions: containmentActions.filter(a => a.urgency === "immediate").length,
        isRemediated,
        recommendationFocus: isRemediated ? "proactive" : "reactive",
      },
    };
  } catch (error: any) {
    console.error(`[Remediation Agent] Failed: ${error.message}`);
    return {
      agentName: "Remediation Agent",
      status: "failed",
      duration: Date.now() - startTime,
      confidence: 0,
      reasoning: `Remediation planning failed: ${error.message}`,
      evidenceRefs,
      data: {},
    };
  }
}

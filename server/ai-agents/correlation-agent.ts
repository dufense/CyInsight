import { pool } from "../db";
import type { AgentInput, AgentOutput } from "./types";

export async function executeCorrelationAgent(input: AgentInput): Promise<AgentOutput> {
  const startTime = Date.now();
  const evidenceRefs: string[] = [];

  try {
    const { incident, relatedEvents, relatedIncidents } = input;
    const contextData = input.previousAgentOutputs?.["Context Agent"]?.data || {};
    const threatIntelData = input.previousAgentOutputs?.["Threat Intel Agent"]?.data || {};
    const behaviorData = input.previousAgentOutputs?.["Behavior Agent"]?.data || {};
    const entities = contextData.entities || [];

    const timeline: { timestamp: string; event: string; severity: string; source: string; entity?: string }[] = [];

    timeline.push({
      timestamp: incident.created_at || new Date().toISOString(),
      event: `Incident created: ${incident.title}`,
      severity: incident.severity || "medium",
      source: incident.source || "detection",
    });

    for (const event of relatedEvents.slice(0, 50)) {
      timeline.push({
        timestamp: event.occurred_at || event.created_at || new Date().toISOString(),
        event: `${event.event_type}: ${event.threat || event.description || "Event detected"}`,
        severity: event.severity || "medium",
        source: event.log_source || event.event_type || "unknown",
        entity: event.target || event.attacker || event.asset,
      });
    }

    timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const attackStages: { stage: string; events: any[]; confidence: number }[] = [];
    const stagePatterns = [
      { stage: "Reconnaissance", patterns: /scan|probe|enum|discovery|recon/i },
      { stage: "Initial Access", patterns: /phish|exploit|brute.?force|credential|login|auth/i },
      { stage: "Execution", patterns: /execute|powershell|cmd|script|payload|malware|trojan/i },
      { stage: "Persistence", patterns: /persist|schedule|registry|startup|backdoor|implant/i },
      { stage: "Privilege Escalation", patterns: /privilege|escalat|admin|root|sudo|elevation/i },
      { stage: "Defense Evasion", patterns: /evasion|obfuscat|encode|bypass|disable|tamper/i },
      { stage: "Lateral Movement", patterns: /lateral|pivot|rdp|smb|psexec|wmi|remote/i },
      { stage: "Collection", patterns: /collect|harvest|keylog|screen|capture|clipboard/i },
      { stage: "Command & Control", patterns: /c2|c&c|beacon|callback|command.?control/i },
      { stage: "Exfiltration", patterns: /exfiltrat|upload|transfer|steal|leak|extract/i },
      { stage: "Impact", patterns: /encrypt|ransom|destroy|wipe|denial|disrupt/i },
    ];

    for (const entry of timeline) {
      const eventText = `${entry.event} ${entry.source}`.toLowerCase();
      for (const sp of stagePatterns) {
        if (sp.patterns.test(eventText)) {
          let stage = attackStages.find(s => s.stage === sp.stage);
          if (!stage) {
            stage = { stage: sp.stage, events: [], confidence: 0 };
            attackStages.push(stage);
          }
          stage.events.push(entry);
          stage.confidence = Math.min(100, stage.confidence + 15);
        }
      }
    }

    if (attackStages.length > 0) {
      evidenceRefs.push(`${attackStages.length} attack stages identified: ${attackStages.map(s => s.stage).join(", ")}`);
    }

    const crossSourceCorrelation: { ioc: string; sources: string[]; eventCount: number }[] = [];
    const maliciousIOCs = (threatIntelData.iocs || []).filter((i: any) => i.reputation === "malicious" || i.sources >= 2);

    for (const ioc of maliciousIOCs.slice(0, 10)) {
      const sourceTypes = new Set<string>();
      let eventCount = 0;

      for (const event of relatedEvents) {
        const eventText = `${event.target || ""} ${event.attacker || ""} ${event.asset || ""} ${event.description || ""}`;
        if (eventText.includes(ioc.value)) {
          sourceTypes.add(event.event_type || "unknown");
          eventCount++;
        }
      }

      if (sourceTypes.size >= 2) {
        crossSourceCorrelation.push({
          ioc: ioc.value,
          sources: Array.from(sourceTypes),
          eventCount,
        });
        evidenceRefs.push(`IOC ${ioc.value} correlated across ${sourceTypes.size} sources`);
      }
    }

    const relatedIncidentCorrelation = relatedIncidents.map((ri: any) => {
      const sharedIOCs = maliciousIOCs.filter((ioc: any) =>
        (ri.source_ip === ioc.value) || (ri.destination_ip === ioc.value) ||
        (ri.affected_assets || "").includes(ioc.value)
      ).length;

      return {
        incidentId: ri.id,
        title: ri.title,
        severity: ri.severity,
        sharedIOCs,
        sameMITRE: ri.mitre_tactic === incident.mitre_tactic,
        sameSource: ri.source_ip === incident.source_ip,
        createdAt: ri.created_at,
      };
    }).filter((ri: any) => ri.sharedIOCs > 0 || ri.sameMITRE || ri.sameSource);

    if (relatedIncidentCorrelation.length > 0) {
      evidenceRefs.push(`${relatedIncidentCorrelation.length} incidents correlated with current investigation`);
    }

    const isMultiStage = attackStages.length >= 3;
    const isCampaign = relatedIncidentCorrelation.length >= 3;
    const hasLateralMovement = attackStages.some(s => s.stage === "Lateral Movement") || (behaviorData.lateralMovementIndicators || 0) > 0;

    const confidence = Math.min(100,
      (timeline.length > 5 ? 25 : 10) +
      (attackStages.length > 0 ? attackStages.length * 10 : 5) +
      (crossSourceCorrelation.length > 0 ? 20 : 0) +
      (relatedIncidentCorrelation.length > 0 ? 15 : 0) +
      (isMultiStage ? 15 : 0)
    );

    return {
      agentName: "Correlation Agent",
      status: "completed",
      duration: Date.now() - startTime,
      confidence,
      reasoning: `Reconstructed timeline with ${timeline.length} events. Identified ${attackStages.length} attack stages. ${crossSourceCorrelation.length} IOCs correlated across multiple data sources. ${relatedIncidentCorrelation.length} related incidents linked. ${isMultiStage ? "Multi-stage attack pattern detected." : "Single-stage event."} ${isCampaign ? "Possible campaign activity." : ""} ${hasLateralMovement ? "Lateral movement confirmed." : ""}`,
      evidenceRefs,
      data: {
        timeline: timeline.slice(0, 100),
        attackStages,
        crossSourceCorrelation,
        relatedIncidentCorrelation,
        isMultiStage,
        isCampaign,
        hasLateralMovement,
      },
    };
  } catch (error: any) {
    return {
      agentName: "Correlation Agent",
      status: "failed",
      duration: Date.now() - startTime,
      confidence: 0,
      reasoning: `Log correlation failed: ${error.message}`,
      evidenceRefs,
      data: {},
    };
  }
}

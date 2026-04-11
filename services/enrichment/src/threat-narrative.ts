import type { IOCIndicator } from "./ioc-scorer";
import type { CorrelationResult } from "./correlation";

const TACTIC_NARRATIVES: Record<string, string> = {
  "Initial Access": "The attacker is attempting to gain entry into the network through external-facing services, phishing, or exploiting public-facing applications.",
  "Execution": "Malicious code is being executed on the target system, potentially through scripts, scheduled tasks, or exploitation of application vulnerabilities.",
  "Persistence": "The adversary is establishing mechanisms to maintain their foothold in the environment across system restarts and credential changes.",
  "Privilege Escalation": "An attempt to gain higher-level permissions is detected, potentially escalating from user to administrator access.",
  "Defense Evasion": "The adversary is employing techniques to avoid detection by security tools and monitoring systems.",
  "Credential Access": "Credential theft or brute force activity has been detected, targeting authentication systems or stored credentials.",
  "Discovery": "The adversary is gathering information about the environment to inform their next actions.",
  "Lateral Movement": "Movement between systems within the network has been detected, indicating the adversary is expanding their reach.",
  "Collection": "Data gathering activity has been detected, potentially in preparation for exfiltration.",
  "Exfiltration": "Data is being moved outside the network perimeter to adversary-controlled infrastructure.",
  "Impact": "Destructive activity is detected, potentially including data encryption, service disruption, or system manipulation.",
  "Command and Control": "Communication with external infrastructure has been detected, indicating potential adversary command channels.",
  "Reconnaissance": "The adversary is scanning and probing the environment to identify targets and vulnerabilities.",
  "Resource Development": "The adversary is building or acquiring tools and infrastructure to support their operation.",
};

export class ThreatNarrativeGenerator {
  generate(
    event: Record<string, any>,
    iocs: IOCIndicator[],
    correlations: CorrelationResult[]
  ): string {
    const title = event.threat || event.title || event.description || "Unknown Incident";
    const severity = (event.severity || "medium").toUpperCase();
    const source = event.logSource || event.sourceType || event.source || "Unknown";
    const mitreTactic = event.mitreTactic || event.mitre_tactic || "Unknown";
    const mitreTechnique = event.mitreTechnique || event.mitre_technique || "Unknown";

    let narrative = `## Threat Narrative: ${title}\n\n`;
    narrative += `**Severity:** ${severity} | **Source:** ${source}\n`;
    narrative += `**MITRE ATT&CK:** ${mitreTactic} / ${mitreTechnique}\n\n`;

    narrative += `### Detection Summary\n`;
    narrative += `This incident was detected through ${source} and classified as ${severity} severity. `;

    const sigmaMatches = event.sigmaMatches || event.sigma_matches;
    if (sigmaMatches && Array.isArray(sigmaMatches) && sigmaMatches.length > 0) {
      narrative += `${sigmaMatches.length} Sigma detection rule(s) matched this activity:\n`;
      for (const match of sigmaMatches.slice(0, 5)) {
        narrative += `- **${match.ruleTitle || match.ruleId}** (${match.severity || "medium"}): ${match.description || "Detection rule match"}\n`;
      }
      narrative += "\n";
    }

    const maliciousIOCs = iocs.filter((i) => i.reputation === "malicious");
    const suspiciousIOCs = iocs.filter((i) => i.reputation === "suspicious");
    if (maliciousIOCs.length > 0 || suspiciousIOCs.length > 0) {
      narrative += `### Indicators of Compromise\n`;
      if (maliciousIOCs.length > 0) {
        narrative += `**Malicious indicators (${maliciousIOCs.length}):**\n`;
        for (const ioc of maliciousIOCs.slice(0, 5)) {
          narrative += `- ${ioc.type}: \`${ioc.value}\` (confidence: ${ioc.confidence}%, source: ${ioc.source})\n`;
        }
      }
      if (suspiciousIOCs.length > 0) {
        narrative += `**Suspicious indicators (${suspiciousIOCs.length}):**\n`;
        for (const ioc of suspiciousIOCs.slice(0, 5)) {
          narrative += `- ${ioc.type}: \`${ioc.value}\` (confidence: ${ioc.confidence}%, source: ${ioc.source})\n`;
        }
      }
      narrative += "\n";
    }

    if (correlations.length > 0) {
      narrative += `### Cross-Source Correlations\n`;
      narrative += `This event correlates with activity from ${correlations.length} other source(s):\n`;
      for (const corr of correlations.slice(0, 5)) {
        narrative += `- **${corr.entityType}** \`${corr.entityValue}\` seen in ${corr.sourceCount} sources: ${corr.sources.join(", ")}\n`;
      }
      narrative += "\n";
    }

    narrative += `### Attack Chain Analysis\n`;
    narrative += `Based on MITRE ATT&CK mapping, this activity falls under the **${mitreTactic}** tactic. `;
    narrative += TACTIC_NARRATIVES[mitreTactic] || "Further analysis is needed to determine the full scope of this activity.";
    narrative += "\n\n";

    narrative += `### Recommended Response\n`;
    if (severity === "CRITICAL") {
      narrative += `1. **Immediate containment:** Isolate affected systems from the network\n`;
      narrative += `2. **Preserve evidence:** Capture memory dumps and disk images before remediation\n`;
      narrative += `3. **Escalate:** Notify SOC leadership and initiate incident response procedures\n`;
      narrative += `4. **Hunt:** Search for related indicators across all monitored systems\n`;
    } else if (severity === "HIGH") {
      narrative += `1. **Investigate:** Review all related events and correlated data within the next 2 hours\n`;
      narrative += `2. **Contain:** Consider isolating affected systems if compromise is confirmed\n`;
      narrative += `3. **Document:** Record all findings in the incident timeline\n`;
      narrative += `4. **Monitor:** Increase monitoring on affected assets for 48 hours\n`;
    } else {
      narrative += `1. **Monitor:** Track this activity for escalation patterns\n`;
      narrative += `2. **Correlate:** Check for related events from other sources\n`;
      narrative += `3. **Baseline:** Compare against normal activity patterns for this entity\n`;
    }

    return narrative;
  }
}

import { pool } from "../db";
import type { AgentInput, AgentOutput, BehavioralAnomaly } from "./types";

export async function executeBehaviorAgent(input: AgentInput): Promise<AgentOutput> {
  const startTime = Date.now();
  const evidenceRefs: string[] = [];
  const anomalies: BehavioralAnomaly[] = [];

  try {
    const { incident, relatedEvents, entityHistory } = input;
    const contextData = input.previousAgentOutputs?.["Context Agent"]?.data || {};
    const entities = contextData.entities || [];

    for (const entity of entities.slice(0, 8)) {
      try {
        const baselineResult = await pool.query(
          `SELECT 
            event_type,
            COUNT(*) as event_count,
            COUNT(DISTINCT DATE(occurred_at)) as active_days,
            MIN(occurred_at) as first_seen,
            MAX(occurred_at) as last_seen,
            array_agg(DISTINCT severity) as severities
           FROM security_events 
           WHERE tenant_id = $1 
             AND (target ILIKE $2 OR attacker ILIKE $2 OR asset ILIKE $2)
             AND occurred_at >= NOW() - INTERVAL '30 days'
           GROUP BY event_type
           ORDER BY event_count DESC`,
          [input.tenantId, `%${entity}%`]
        );

        if (baselineResult.rows.length === 0) continue;

        const totalEvents = baselineResult.rows.reduce((sum: number, r: any) => sum + parseInt(r.event_count), 0);
        const activeDays = Math.max(...baselineResult.rows.map((r: any) => parseInt(r.active_days)));
        const avgEventsPerDay = activeDays > 0 ? totalEvents / activeDays : totalEvents;
        const eventTypes = baselineResult.rows.map((r: any) => r.event_type);

        const recentResult = await pool.query(
          `SELECT 
            event_type,
            COUNT(*) as event_count,
            array_agg(DISTINCT severity) as severities
           FROM security_events 
           WHERE tenant_id = $1 
             AND (target ILIKE $2 OR attacker ILIKE $2 OR asset ILIKE $2)
             AND occurred_at >= NOW() - INTERVAL '24 hours'
           GROUP BY event_type`,
          [input.tenantId, `%${entity}%`]
        );

        const recentTotal = recentResult.rows.reduce((sum: number, r: any) => sum + parseInt(r.event_count), 0);
        const recentTypes = recentResult.rows.map((r: any) => r.event_type);
        const newEventTypes = recentTypes.filter((t: string) => !eventTypes.includes(t));

        const baselineMetrics = {
          avgEventsPerDay: Math.round(avgEventsPerDay * 100) / 100,
          totalEvents30d: totalEvents,
          activeDays,
          normalEventTypes: eventTypes,
        };

        const currentActivity = {
          eventsLast24h: recentTotal,
          eventTypes: recentTypes,
          newEventTypes,
        };

        const volumeDeviation = avgEventsPerDay > 0 ? (recentTotal / avgEventsPerDay) : recentTotal;

        if (volumeDeviation > 3) {
          const deviation = Math.min(100, Math.round(volumeDeviation * 15));
          anomalies.push({
            entity,
            entityType: entity.includes("@") ? "user" : entity.match(/^\d+\.\d+\.\d+\.\d+$/) ? "ip" : "host",
            baselineMetrics,
            currentActivity,
            deviationScore: deviation,
            anomalyType: "volume_spike",
            significance: deviation > 80 ? "critical" : deviation > 60 ? "high" : deviation > 40 ? "medium" : "low",
            details: `Activity volume ${Math.round(volumeDeviation)}x higher than 30-day average (${recentTotal} events in 24h vs avg ${Math.round(avgEventsPerDay)}/day)`,
          });
          evidenceRefs.push(`Volume anomaly: ${entity} at ${Math.round(volumeDeviation)}x baseline`);
        }

        if (newEventTypes.length > 0) {
          anomalies.push({
            entity,
            entityType: entity.includes("@") ? "user" : entity.match(/^\d+\.\d+\.\d+\.\d+$/) ? "ip" : "host",
            baselineMetrics,
            currentActivity,
            deviationScore: Math.min(100, newEventTypes.length * 30),
            anomalyType: "new_activity_type",
            significance: newEventTypes.length >= 3 ? "high" : "medium",
            details: `${newEventTypes.length} new event types not seen in 30-day baseline: ${newEventTypes.join(", ")}`,
          });
          evidenceRefs.push(`New activity types for ${entity}: ${newEventTypes.join(", ")}`);
        }
      } catch (err: any) {
        console.error(`[Behavior Agent] Entity baseline query failed for ${entity}: ${err.message}`);
      }
    }

    let lateralMovementIndicators = 0;
    let privilegeEscalation = false;
    let dataExfiltrationRisk = false;
    let offHoursActivity = false;

    const sourceIPs = new Set<string>();
    const destIPs = new Set<string>();
    for (const event of relatedEvents) {
      if (event.attacker) sourceIPs.add(event.attacker);
      if (event.target) destIPs.add(event.target);

      const desc = (event.description || "").toLowerCase();
      if (desc.includes("admin") || desc.includes("privilege") || desc.includes("elevation") || desc.includes("sudo")) {
        privilegeEscalation = true;
      }
      if (desc.includes("exfiltrat") || desc.includes("upload") || desc.includes("outbound") || desc.includes("data transfer")) {
        dataExfiltrationRisk = true;
      }
    }

    if (sourceIPs.size > 3 || destIPs.size > 5) {
      lateralMovementIndicators = Math.max(sourceIPs.size, destIPs.size);
      evidenceRefs.push(`Lateral movement: ${sourceIPs.size} source IPs, ${destIPs.size} destination IPs`);
    }

    if (privilegeEscalation) {
      anomalies.push({
        entity: incident.affected_assets || incident.source_ip || "unknown",
        entityType: "host",
        baselineMetrics: {},
        currentActivity: { privilegeEscalation: true },
        deviationScore: 85,
        anomalyType: "privilege_escalation",
        significance: "critical",
        details: "Privilege escalation indicators detected in event data",
      });
      evidenceRefs.push("Privilege escalation indicators detected");
    }

    if (dataExfiltrationRisk) {
      anomalies.push({
        entity: incident.affected_assets || incident.destination_ip || "unknown",
        entityType: "host",
        baselineMetrics: {},
        currentActivity: { dataExfiltrationRisk: true },
        deviationScore: 80,
        anomalyType: "data_exfiltration",
        significance: "high",
        details: "Data exfiltration risk indicators found in event patterns",
      });
      evidenceRefs.push("Data exfiltration risk indicators found");
    }

    const maxDeviation = anomalies.length > 0 ? Math.max(...anomalies.map(a => a.deviationScore)) : 0;
    const criticalAnomalies = anomalies.filter(a => a.significance === "critical").length;
    const highAnomalies = anomalies.filter(a => a.significance === "high").length;

    const confidence = Math.min(100,
      (anomalies.length > 0 ? 40 : 20) +
      (criticalAnomalies > 0 ? 30 : 0) +
      (highAnomalies > 0 ? 15 : 0) +
      (lateralMovementIndicators > 0 ? 10 : 0) +
      (entities.length > 0 ? 10 : 0)
    );

    return {
      agentName: "Behavior Agent",
      status: "completed",
      duration: Date.now() - startTime,
      confidence,
      reasoning: `Behavioral analysis of ${entities.length} entities detected ${anomalies.length} anomalies (${criticalAnomalies} critical, ${highAnomalies} high). ${lateralMovementIndicators > 0 ? `Lateral movement indicators: ${lateralMovementIndicators} unique IPs communicating.` : "No lateral movement detected."} ${privilegeEscalation ? "Privilege escalation detected." : ""} ${dataExfiltrationRisk ? "Data exfiltration risk identified." : ""} Max deviation score: ${maxDeviation}/100.`,
      evidenceRefs,
      data: {
        anomalies,
        lateralMovementIndicators,
        privilegeEscalation,
        dataExfiltrationRisk,
        offHoursActivity,
        maxDeviation,
        entitiesAnalyzed: entities.length,
      },
    };
  } catch (error: any) {
    return {
      agentName: "Behavior Agent",
      status: "failed",
      duration: Date.now() - startTime,
      confidence: 0,
      reasoning: `Behavioral analysis failed: ${error.message}`,
      evidenceRefs,
      data: { anomalies },
    };
  }
}

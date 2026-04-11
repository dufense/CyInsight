import { db } from "./db";
import { incidents } from "@shared/schema";
import { eq, and, isNull, gte, sql } from "drizzle-orm";
import { createAIClient, getDefaultModel } from "./ai-provider";

export interface AlertCluster {
  id: string;
  name: string;
  description: string;
  incidentIds: number[];
  severity: string;
  topTactic: string | null;
  firstSeen: Date;
  lastSeen: Date;
  reason: "same_source_ip" | "same_technique" | "time_window" | "same_target";
}

function getSubnet(ip: string): string {
  const parts = ip.split(".");
  return parts.slice(0, 3).join(".");
}

function clusterKey(type: string, value: string): string {
  return `${type}::${value}`;
}

export async function computeClusters(tenantId: number, days = 7): Promise<AlertCluster[]> {
  const since = new Date(Date.now() - days * 86400000);

  const rows = await db
    .select({
      id: incidents.id,
      title: incidents.title,
      severity: incidents.severity,
      sourceIp: incidents.sourceIp,
      destinationIp: incidents.destinationIp,
      mitreTechniqueId: incidents.mitreTechniqueId,
      mitreTactic: incidents.mitreTactic,
      createdAt: incidents.createdAt,
      status: incidents.status,
    })
    .from(incidents)
    .where(and(
      eq(incidents.tenantId, tenantId),
      gte(incidents.createdAt, since),
      eq(incidents.status, "open")
    ))
    .limit(200);

  const clusterMap = new Map<string, {
    ids: Set<number>;
    severity: string;
    tactic: string | null;
    firstSeen: Date;
    lastSeen: Date;
    reason: AlertCluster["reason"];
    label: string;
  }>();

  function addToCluster(key: string, incident: typeof rows[0], reason: AlertCluster["reason"], label: string) {
    if (!clusterMap.has(key)) {
      clusterMap.set(key, {
        ids: new Set(),
        severity: incident.severity,
        tactic: incident.mitreTactic,
        firstSeen: incident.createdAt,
        lastSeen: incident.createdAt,
        reason,
        label,
      });
    }
    const c = clusterMap.get(key)!;
    c.ids.add(incident.id);
    const sevOrder = ["info", "low", "medium", "high", "critical"];
    if (sevOrder.indexOf(incident.severity) > sevOrder.indexOf(c.severity)) c.severity = incident.severity;
    if (incident.createdAt < c.firstSeen) c.firstSeen = incident.createdAt;
    if (incident.createdAt > c.lastSeen) c.lastSeen = incident.createdAt;
  }

  for (const inc of rows) {
    if (inc.sourceIp) {
      addToCluster(clusterKey("ip", inc.sourceIp), inc, "same_source_ip", `Source IP ${inc.sourceIp}`);
    }
    if (inc.mitreTechniqueId) {
      addToCluster(clusterKey("technique", inc.mitreTechniqueId), inc, "same_technique", `Technique ${inc.mitreTechniqueId}`);
    }
    if (inc.destinationIp) {
      const subnet = getSubnet(inc.destinationIp);
      addToCluster(clusterKey("subnet", subnet), inc, "same_target", `Target subnet ${subnet}.0/24`);
    }
  }

  const validClusters: AlertCluster[] = [];
  let idx = 0;

  for (const [key, c] of clusterMap.entries()) {
    if (c.ids.size < 2) continue;

    const name = generateClusterName(c.reason, c.label, c.tactic, Array.from(c.ids).length);

    validClusters.push({
      id: `cluster-${idx++}`,
      name,
      description: `${c.ids.size} related incidents grouped by ${c.reason.replace(/_/g, " ")} (${c.label})`,
      incidentIds: Array.from(c.ids),
      severity: c.severity,
      topTactic: c.tactic,
      firstSeen: c.firstSeen,
      lastSeen: c.lastSeen,
      reason: c.reason,
    });
  }

  return validClusters.sort((a, b) => b.incidentIds.length - a.incidentIds.length).slice(0, 20);
}

function generateClusterName(reason: AlertCluster["reason"], label: string, tactic: string | null, count: number): string {
  const tacticPart = tactic ? ` [${tactic}]` : "";
  switch (reason) {
    case "same_source_ip": return `Coordinated Attack${tacticPart} — ${label}`;
    case "same_technique": return `Technique Cluster${tacticPart} — ${count} incidents`;
    case "same_target": return `Targeted Campaign${tacticPart} — ${label}`;
    case "time_window": return `Burst Activity${tacticPart} — ${count} incidents`;
    default: return `Incident Cluster — ${count} incidents`;
  }
}

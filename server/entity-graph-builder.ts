import { Pool } from "pg";

export type EntityNodeType = "host" | "user" | "ip" | "domain" | "hash" | "process" | "email" | "application";
export type NodeRisk = "malicious" | "suspicious" | "enriched" | "clean" | "unknown";
export type EdgeRelation =
  | "connected_from"
  | "authenticated_to"
  | "spawned_process"
  | "accessed_file"
  | "received_traffic"
  | "sent_traffic"
  | "lateral_movement"
  | "credential_access"
  | "dns_query"
  | "email_sent"
  | "email_received"
  | "exploited"
  | "command_control";

export interface GraphNode {
  id: string;
  label: string;
  type: EntityNodeType;
  risk: NodeRisk;
  riskScore: number;
  degree: number; // number of connections (set after building)
  isInitialAccess: boolean;
  isHighImpact: boolean;
  firstSeen: string | null;
  lastSeen: string | null;
  killChainPhase: string | null;
  mitreTactic: string | null;
  mitreTechnique: string | null;
  country: string | null;
  metadata: Record<string, any>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: EdgeRelation;
  killChainPhase: string | null;
  mitreTactic: string | null;
  timestamp: string | null;
  severity: string | null;
  eventType: string | null;
  weight: number; // 1-5: higher = more significant
}

export interface AttackPathStep {
  nodeId: string;
  nodeLabel: string;
  nodeType: EntityNodeType;
  edgeRelation: EdgeRelation | null;
  killChainPhase: string | null;
  mitreTactic: string | null;
  timestamp: string | null;
}

export interface BlastRadius {
  affectedUsers: number;
  affectedHosts: number;
  affectedApplications: number;
  affectedIPs: number;
  totalEntities: number;
}

export interface EntityGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  attackPath: AttackPathStep[];
  initialAccessNodeId: string | null;
  highImpactNodeId: string | null;
  blastRadius: BlastRadius;
  builtAt: string;
}

// Kill chain phases in order
const KC_ORDER = [
  "Reconnaissance",
  "Weaponization",
  "Delivery",
  "Exploitation",
  "Installation",
  "Command & Control",
  "Actions on Objectives",
];

const MITRE_TACTIC_TO_KC: Record<string, string> = {
  reconnaissance: "Reconnaissance",
  "resource-development": "Weaponization",
  "initial-access": "Delivery",
  execution: "Exploitation",
  persistence: "Installation",
  "privilege-escalation": "Installation",
  "defense-evasion": "Installation",
  "credential-access": "Actions on Objectives",
  discovery: "Actions on Objectives",
  "lateral-movement": "Actions on Objectives",
  collection: "Actions on Objectives",
  "command-and-control": "Command & Control",
  exfiltration: "Actions on Objectives",
  impact: "Actions on Objectives",
};

function mitreTacticToKC(tactic: string | null | undefined): string | null {
  if (!tactic) return null;
  const key = tactic.toLowerCase().replace(/\s+/g, "-");
  return MITRE_TACTIC_TO_KC[key] || null;
}

function eventTypeToRelation(eventType: string, severity: string): EdgeRelation {
  const et = (eventType || "").toLowerCase();
  if (et.includes("email")) return "email_sent";
  if (et.includes("lateral") || et.includes("rdp") || et.includes("smb")) return "lateral_movement";
  if (et.includes("auth") || et.includes("login") || et.includes("credential") || et.includes("identity")) return "credential_access";
  if (et.includes("process") || et.includes("exec")) return "spawned_process";
  if (et.includes("dns")) return "dns_query";
  if (et.includes("c2") || et.includes("command") || et.includes("beacon")) return "command_control";
  if (et.includes("exploit")) return "exploited";
  if (et.includes("access") || et.includes("file") || et.includes("dlp")) return "accessed_file";
  if (et.includes("network") || et.includes("endpoint") || et.includes("waf")) return "received_traffic";
  if (severity === "critical" || severity === "high") return "connected_from";
  return "received_traffic";
}

function classifyValue(value: string): EntityNodeType {
  if (!value) return "host";
  const v = value.trim();
  // Email address — must come before domain check
  if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v)) return "email";
  // IPv4 address
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(v)) return "ip";
  // Cryptographic hash (MD5/SHA1/SHA256)
  if (/^[a-f0-9]{32}$|^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test(v)) return "hash";
  // Executable / script files
  if (/\.(exe|dll|sys|ps1|bat|cmd|sh|py|js|vbs|jar|msi)$/i.test(v)) return "process";
  // Process-style values: name(pid), path-like with slashes
  if (/^[a-zA-Z0-9_-]+\(\d+\)$/.test(v)) return "process"; // e.g. svchost(1234)
  if (/^(\\\\|\/)(windows|system32|usr|bin|tmp|proc)/i.test(v)) return "process";
  // User account patterns: DOMAIN\user, user@domain, plain usernames with common prefixes
  if (/^[A-Za-z0-9_-]+\\[A-Za-z0-9_.-]+$/.test(v)) return "user"; // DOMAIN\username
  if (/^(svc_|svc-|sa_|sa-|adm_|adm-|usr_)[a-zA-Z0-9_-]+$/i.test(v)) return "user"; // service/admin accounts
  // Application / service names: common app patterns and well-known service names
  if (/^(apache|nginx|iis|tomcat|jboss|jenkins|gitlab|github|splunk|elastic|kafka|redis|rabbitmq|mongodb|postgres|mysql|oracle|mssql|sharepoint|exchange|salesforce|okta|workday)[-_ ]?/i.test(v)) return "application";
  if (/^[a-z][a-z0-9_-]*-(svc|service|app|api|web|portal|backend|frontend)$/i.test(v)) return "application"; // e.g. auth-service, data-api
  // External domains
  if (/\.(com|net|org|io|ru|cn|tk|xyz|info|edu|gov|mil|biz|co)$/i.test(v) && !v.includes(" ")) return "domain";
  // Well-known host prefixes — named servers, workstations, infrastructure
  if (/^(srv|svr|ws|wks|pc|lap|dc|db|app|web|vpn|dns|mail|smtp|k8s|prod|uat|dev|stg|nas|fw|gw|lb)\d*[-_.]/i.test(v)) return "host";
  if (/\.(internal|compute|local|corp|lan|intranet|ad)$/i.test(v)) return "host";
  // Windows computer account (ends with $)
  if (/^[A-Z][A-Z0-9-]{0,14}\$$/.test(v)) return "host";
  return "host";
}

function classifyRisk(ev: any, iocValues: Set<string>): NodeRisk {
  const sev = (ev.severity || "").toLowerCase();
  const threat = (ev.threat || "").toLowerCase();
  const val = ev.value || "";
  if (iocValues.has(val.toLowerCase())) return "malicious";
  if (sev === "critical") return "malicious";
  if (sev === "high" || threat.includes("malicious")) return "suspicious";
  if (sev === "medium") return "enriched";
  if (sev === "low" || sev === "info") return "clean";
  return "unknown";
}

function riskScore(risk: NodeRisk): number {
  const map: Record<NodeRisk, number> = {
    malicious: 90,
    suspicious: 70,
    enriched: 50,
    clean: 20,
    unknown: 30,
  };
  return map[risk];
}

function makeNodeId(label: string, type: EntityNodeType): string {
  return `${type}::${label.toLowerCase().trim()}`;
}

function makeEdgeId(src: string, tgt: string, rel: string, ts: string | null): string {
  return `${src}->${tgt}::${rel}::${ts || "0"}`;
}

export async function buildIncidentEntityGraph(pool: Pool, incidentId: number, tenantId: number): Promise<EntityGraph> {
  // 1. Fetch the incident
  const incRes = await pool.query(
    `SELECT id, title, source_ip, destination_ip, affected_assets, ioc_data, mitre_tactic, mitre_technique_id, incident_type, severity, created_at
     FROM incidents WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [incidentId, tenantId]
  );
  if (!incRes.rows.length) throw new Error("Incident not found");
  const incident = incRes.rows[0];

  // 2. Fetch related security events (±8h window for richer graph)
  const timeStart = new Date(incident.created_at);
  timeStart.setHours(timeStart.getHours() - 8);
  const timeEnd = new Date(incident.created_at);
  timeEnd.setHours(timeEnd.getHours() + 4);

  const eventsRes = await pool.query(
    `SELECT event_type, severity, threat, target, attacker, asset, description,
            threat_vector, mitre_tactic, mitre_technique, action, source_type, occurred_at, country
     FROM security_events
     WHERE tenant_id = $1 AND occurred_at BETWEEN $2 AND $3
       AND (
         ($4::text IS NOT NULL AND (attacker ILIKE $4 OR target ILIKE $4))
         OR ($5::text IS NOT NULL AND (attacker ILIKE $5 OR target ILIKE $5))
         OR ($6::text IS NOT NULL AND asset ILIKE $6)
       )
     ORDER BY occurred_at ASC LIMIT 200`,
    [
      tenantId,
      timeStart.toISOString(),
      timeEnd.toISOString(),
      incident.source_ip ? `%${incident.source_ip}%` : null,
      incident.destination_ip ? `%${incident.destination_ip}%` : null,
      incident.affected_assets ? `%${incident.affected_assets}%` : null,
    ]
  );

  // 3. Extract IOC set from incident ioc_data
  const iocValues = new Set<string>();
  try {
    const iocData = typeof incident.ioc_data === "string" ? JSON.parse(incident.ioc_data) : incident.ioc_data;
    if (Array.isArray(iocData)) {
      for (const ioc of iocData) {
        const v = ioc.value || ioc.indicator || ioc.ioc || "";
        if (v) iocValues.add(v.toLowerCase());
      }
    }
  } catch (_) {}

  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();

  function upsertNode(label: string, type: EntityNodeType, risk: NodeRisk, ev: any): string {
    const id = makeNodeId(label, type);
    const existing = nodeMap.get(id);
    const rs = riskScore(risk);
    const ts = ev.occurred_at ? new Date(ev.occurred_at).toISOString() : null;
    const kc = mitreTacticToKC(ev.mitre_tactic);
    if (existing) {
      // Escalate risk if higher
      if (rs > existing.riskScore) {
        existing.risk = risk;
        existing.riskScore = rs;
      }
      if (ts && (!existing.firstSeen || ts < existing.firstSeen)) existing.firstSeen = ts;
      if (ts && (!existing.lastSeen || ts > existing.lastSeen)) existing.lastSeen = ts;
      if (!existing.killChainPhase && kc) {
        existing.killChainPhase = kc;
        existing.mitreTactic = ev.mitre_tactic || null;
        existing.mitreTechnique = ev.mitre_technique || null;
      }
    } else {
      nodeMap.set(id, {
        id,
        label,
        type,
        risk,
        riskScore: rs,
        degree: 0,
        isInitialAccess: false,
        isHighImpact: false,
        firstSeen: ts,
        lastSeen: ts,
        killChainPhase: kc,
        mitreTactic: ev.mitre_tactic || null,
        mitreTechnique: ev.mitre_technique || null,
        country: ev.country || null,
        metadata: {},
      });
    }
    return id;
  }

  function addEdge(srcId: string, tgtId: string, relation: EdgeRelation, ev: any) {
    const ts = ev.occurred_at ? new Date(ev.occurred_at).toISOString() : null;
    const eid = makeEdgeId(srcId, tgtId, relation, ts);
    if (!edgeMap.has(eid)) {
      const sev = (ev.severity || "medium").toLowerCase();
      const weight = sev === "critical" ? 5 : sev === "high" ? 4 : sev === "medium" ? 3 : sev === "low" ? 2 : 1;
      edgeMap.set(eid, {
        id: eid,
        source: srcId,
        target: tgtId,
        relation,
        killChainPhase: mitreTacticToKC(ev.mitre_tactic),
        mitreTactic: ev.mitre_tactic || null,
        timestamp: ts,
        severity: ev.severity || null,
        eventType: ev.event_type || null,
        weight,
      });
    }
  }

  // 4. Seed initial nodes from incident itself
  if (incident.source_ip) {
    const srcType = classifyValue(incident.source_ip);
    const risk = iocValues.has(incident.source_ip.toLowerCase()) ? "malicious" : "suspicious";
    const srcId = upsertNode(incident.source_ip, srcType, risk, incident);
    const src = nodeMap.get(srcId);
    if (src) { src.isInitialAccess = true; src.killChainPhase = "Delivery"; }
  }
  if (incident.destination_ip) {
    const dstType = classifyValue(incident.destination_ip);
    const dstId = upsertNode(incident.destination_ip, dstType, "clean", incident);
    const dst = nodeMap.get(dstId);
    if (dst) dst.isHighImpact = true;
  }
  if (incident.affected_assets) {
    const assetType = classifyValue(incident.affected_assets);
    const assetId = upsertNode(incident.affected_assets, assetType, "enriched", incident);
    const asset = nodeMap.get(assetId);
    if (asset) asset.isHighImpact = true;
  }

  // 5. Process each event → extract attacker/target nodes + edge
  for (const ev of eventsRes.rows) {
    const attackerVal = ev.attacker;
    const targetVal = ev.target;
    const assetVal = ev.asset;

    if (!attackerVal && !targetVal && !assetVal) continue;

    const relation = eventTypeToRelation(ev.event_type || "", ev.severity || "");

    if (attackerVal) {
      const aType = classifyValue(attackerVal);
      const aRisk = iocValues.has(attackerVal.toLowerCase()) ? "malicious" : classifyRisk(ev, iocValues);
      const aId = upsertNode(attackerVal, aType, aRisk, ev);

      if (targetVal) {
        const tType = classifyValue(targetVal);
        const tRisk = classifyRisk({ ...ev, severity: "low" }, iocValues);
        const tId = upsertNode(targetVal, tType, tRisk, ev);
        addEdge(aId, tId, relation, ev);
      }
      if (assetVal && assetVal !== targetVal) {
        const asType = classifyValue(assetVal);
        const asId = upsertNode(assetVal, asType, "enriched", ev);
        addEdge(aId, asId, "received_traffic", ev);
      }
    } else if (targetVal && assetVal && assetVal !== targetVal) {
      const tType = classifyValue(targetVal);
      const tId = upsertNode(targetVal, tType, "enriched", ev);
      const asType = classifyValue(assetVal);
      const asId = upsertNode(assetVal, asType, "enriched", ev);
      addEdge(tId, asId, relation, ev);
    } else if (targetVal) {
      const tType = classifyValue(targetVal);
      upsertNode(targetVal, tType, "enriched", ev);
    }
  }

  // 6. Compute degree for each node
  for (const edge of edgeMap.values()) {
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    if (src) src.degree++;
    if (tgt) tgt.degree++;
  }

  // 7. If no events, ensure at least source/dest nodes exist from incident
  const nodesArr = Array.from(nodeMap.values());
  const edgesArr = Array.from(edgeMap.values()).sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));

  // 8. Find initial access node (explicitly marked, or node with earliest timestamp + malicious/suspicious)
  let initialAccessNodeId = nodesArr.find(n => n.isInitialAccess)?.id ?? null;
  if (!initialAccessNodeId) {
    const maliciousNodes = nodesArr.filter(n => n.risk === "malicious" || n.risk === "suspicious");
    initialAccessNodeId = maliciousNodes.sort((a, b) => (a.firstSeen || "").localeCompare(b.firstSeen || ""))[0]?.id ?? null;
  }

  // 9. Find highest impact node (explicitly marked, or highest degree among hosts/users)
  let highImpactNodeId = nodesArr.find(n => n.isHighImpact)?.id ?? null;
  if (!highImpactNodeId) {
    const candidates = nodesArr.filter(n => n.type === "host" || n.type === "user");
    highImpactNodeId = candidates.sort((a, b) => b.degree - a.degree)[0]?.id ?? null;
  }

  // 10. Compute attack path (BFS from initial access → high impact)
  const attackPath = computeAttackPath(nodesArr, edgesArr, initialAccessNodeId, highImpactNodeId);

  // 11. Blast radius
  const blastRadius: BlastRadius = {
    affectedUsers: nodesArr.filter(n => n.type === "user" || n.type === "email").length,
    affectedHosts: nodesArr.filter(n => n.type === "host").length,
    affectedApplications: nodesArr.filter(n => n.type === "application" || n.type === "process").length,
    affectedIPs: nodesArr.filter(n => n.type === "ip").length,
    totalEntities: nodesArr.length,
  };

  return {
    nodes: nodesArr,
    edges: edgesArr,
    attackPath,
    initialAccessNodeId,
    highImpactNodeId,
    blastRadius,
    builtAt: new Date().toISOString(),
  };
}

function computeAttackPath(
  nodes: GraphNode[],
  edges: GraphEdge[],
  startId: string | null,
  endId: string | null
): AttackPathStep[] {
  if (!startId || !endId || startId === endId) {
    if (startId) {
      const n = nodes.find(n => n.id === startId);
      if (n) return [{ nodeId: n.id, nodeLabel: n.label, nodeType: n.type, edgeRelation: null, killChainPhase: n.killChainPhase, mitreTactic: n.mitreTactic, timestamp: n.firstSeen }];
    }
    return [];
  }

  // Build directed adjacency map — edges are traversed in their declared direction only
  // (source → target) to accurately model attack propagation path.
  const adj = new Map<string, Array<{ to: string; edge: GraphEdge }>>();
  for (const edge of edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, []);
    adj.get(edge.source)!.push({ to: edge.target, edge });
  }

  // BFS to find shortest path
  const visited = new Set<string>();
  const queue: Array<{ nodeId: string; path: Array<{ nodeId: string; edge: GraphEdge | null }> }> = [
    { nodeId: startId, path: [{ nodeId: startId, edge: null }] },
  ];

  while (queue.length > 0) {
    const { nodeId, path } = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    if (nodeId === endId) {
      // Build attack path steps from the found path
      return path.map(step => {
        const n = nodes.find(n => n.id === step.nodeId);
        return {
          nodeId: step.nodeId,
          nodeLabel: n?.label ?? step.nodeId,
          nodeType: n?.type ?? "host",
          edgeRelation: step.edge?.relation ?? null,
          killChainPhase: step.edge?.killChainPhase ?? n?.killChainPhase ?? null,
          mitreTactic: step.edge?.mitreTactic ?? n?.mitreTactic ?? null,
          timestamp: step.edge?.timestamp ?? n?.firstSeen ?? null,
        };
      });
    }

    const neighbors = adj.get(nodeId) || [];
    for (const { to, edge } of neighbors) {
      if (!visited.has(to)) {
        queue.push({ nodeId: to, path: [...path, { nodeId: to, edge }] });
      }
    }
  }

  // No path found — just return initial node
  const startNode = nodes.find(n => n.id === startId);
  if (startNode) {
    return [{ nodeId: startNode.id, nodeLabel: startNode.label, nodeType: startNode.type, edgeRelation: null, killChainPhase: startNode.killChainPhase, mitreTactic: startNode.mitreTactic, timestamp: startNode.firstSeen }];
  }
  return [];
}

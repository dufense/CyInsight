import { Pool } from "pg";

export interface AttackNode {
  id: string;
  label: string;
  type: "device" | "user" | "service" | "network" | "crown_jewel";
  riskScore: number;
  ip?: string;
  os?: string;
  department?: string;
  isCrownJewel?: boolean;
  crownJewelLabel?: string;
}

export interface AttackEdge {
  source: string;
  target: string;
  type: string;
  weight: number;
  technique?: string;
  mitreTechnique?: string;
}

export interface AttackPath {
  nodes: string[];
  totalWeight: number;
  hops: number;
  techniques: string[];
}

export interface GraphData {
  nodes: AttackNode[];
  edges: AttackEdge[];
  crownJewelIds: Set<string>;
  builtAt: number;
}

const graphCache = new Map<number, { data: GraphData; builtAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function invalidateGraphCache(tenantId: number) {
  graphCache.delete(tenantId);
}

function generateRichEdges(assets: any[], events: any[]): AttackEdge[] {
  const edges: AttackEdge[] = [];
  const assetMap = new Map(assets.map(a => [a.id?.toString(), a]));

  // --- Edges from security events (lateral movement, login, network) ---
  const eventEdgeSet = new Set<string>();
  for (const ev of events) {
    const src = ev.source_ip || ev.attacker;
    const tgt = ev.destination_ip || ev.target;
    if (!src || !tgt || src === tgt) continue;

    const key = `${src}:${tgt}`;
    if (eventEdgeSet.has(key)) continue;
    eventEdgeSet.add(key);

    const eventType = ev.event_type || ev.type || "";
    let connectionType = "network";
    let technique = "Network Access";
    let mitre = "T1021";

    if (eventType.includes("lateral") || eventType.includes("rdp") || eventType.includes("smb")) {
      connectionType = "lateral_movement";
      technique = "Lateral Movement";
      mitre = "T1021.001";
    } else if (eventType.includes("login") || eventType.includes("auth") || eventType.includes("credential")) {
      connectionType = "credential_access";
      technique = "Credential Access";
      mitre = "T1078";
    } else if (eventType.includes("admin") || eventType.includes("privilege")) {
      connectionType = "privilege_escalation";
      technique = "Privilege Escalation";
      mitre = "T1068";
    }

    edges.push({
      source: src,
      target: tgt,
      type: connectionType,
      weight: 1,
      technique,
      mitreTechnique: mitre,
    });
  }

  // --- Edges from asset network segment proximity ---
  const segmentMap = new Map<string, string[]>();
  for (const asset of assets) {
    const segment = asset.network_segment || asset.location || asset.department || "default";
    const id = asset.id?.toString() || asset.ip_address || asset.hostname;
    if (!id) continue;
    if (!segmentMap.has(segment)) segmentMap.set(segment, []);
    segmentMap.get(segment)!.push(id);
  }

  for (const [, members] of segmentMap) {
    if (members.length < 2) continue;
    // Connect pairs within segment (limited to avoid O(n^2) explosion)
    for (let i = 0; i < Math.min(members.length, 8); i++) {
      for (let j = i + 1; j < Math.min(members.length, 8); j++) {
        const key = `${members[i]}:${members[j]}`;
        if (eventEdgeSet.has(key)) continue;
        eventEdgeSet.add(key);
        edges.push({
          source: members[i],
          target: members[j],
          type: "network",
          weight: 2,
          technique: "Network Traversal",
          mitreTechnique: "T1021",
        });
      }
    }
  }

  // --- Shared-credential edges (same OS + admin accounts) ---
  const windowsDevices = assets.filter(a => (a.os || "").toLowerCase().includes("windows")).map(a => a.id?.toString() || a.ip_address);
  if (windowsDevices.length > 1) {
    for (let i = 0; i < Math.min(windowsDevices.length, 6); i++) {
      for (let j = i + 1; j < Math.min(windowsDevices.length, 6); j++) {
        if (!windowsDevices[i] || !windowsDevices[j]) continue;
        const key = `${windowsDevices[i]}:${windowsDevices[j]}:cred`;
        if (eventEdgeSet.has(key)) continue;
        eventEdgeSet.add(key);
        edges.push({
          source: windowsDevices[i],
          target: windowsDevices[j],
          type: "shared_credentials",
          weight: 3,
          technique: "Pass-the-Hash / Shared Admin",
          mitreTechnique: "T1550.002",
        });
      }
    }
  }

  return edges;
}

export async function buildAttackGraph(pool: Pool, tenantId: number): Promise<GraphData> {
  const cached = graphCache.get(tenantId);
  if (cached && Date.now() - cached.builtAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const [assetsRes, eventsRes, crownJewelsRes] = await Promise.all([
    pool.query(
      `SELECT id, hostname, ip_address, os, asset_type, risk_level, risk_score, network_segment, department, location
       FROM assets WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY risk_score DESC NULLS LAST LIMIT 120`,
      [tenantId],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT source_ip, destination_ip, event_type, attacker, target, mitre_technique
       FROM security_events WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '7 days'
       ORDER BY created_at DESC LIMIT 500`,
      [tenantId],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT asset_id, asset_name, criticality, label FROM crown_jewel_assets WHERE tenant_id = $1`,
      [tenantId],
    ).catch(() => ({ rows: [] })),
  ]);

  const crownJewelIds = new Set<string>(crownJewelsRes.rows.map((r: any) => r.asset_id));
  const crownJewelMap = new Map(crownJewelsRes.rows.map((r: any) => [r.asset_id, r]));

  const nodes: AttackNode[] = assetsRes.rows.map((a: any) => {
    const id = a.id?.toString();
    const isCrownJewel = crownJewelIds.has(id) || crownJewelIds.has(a.hostname) || crownJewelIds.has(a.ip_address);
    const cjInfo = crownJewelMap.get(id) || crownJewelMap.get(a.hostname) || crownJewelMap.get(a.ip_address);
    return {
      id,
      label: a.hostname || a.ip_address || `Asset-${id}`,
      type: isCrownJewel ? "crown_jewel" : (a.asset_type === "user" ? "user" : a.asset_type === "server" ? "service" : "device"),
      riskScore: a.risk_score || 0,
      ip: a.ip_address,
      os: a.os,
      department: a.department,
      isCrownJewel,
      crownJewelLabel: cjInfo?.label,
    };
  });

  // Also include IP-based nodes from events
  const knownIds = new Set(nodes.map(n => n.id));
  const eventIps = new Set<string>();
  for (const ev of eventsRes.rows) {
    if (ev.source_ip && !knownIds.has(ev.source_ip)) eventIps.add(ev.source_ip);
    if (ev.destination_ip && !knownIds.has(ev.destination_ip)) eventIps.add(ev.destination_ip);
  }
  for (const ip of [...eventIps].slice(0, 30)) {
    const isCrownJewel = crownJewelIds.has(ip);
    nodes.push({
      id: ip,
      label: ip,
      type: isCrownJewel ? "crown_jewel" : "device",
      riskScore: 30,
      ip,
      isCrownJewel,
    });
  }

  const edges = generateRichEdges(assetsRes.rows, eventsRes.rows);
  const graphData: GraphData = { nodes, edges, crownJewelIds, builtAt: Date.now() };
  graphCache.set(tenantId, { data: graphData, builtAt: Date.now() });
  return graphData;
}

// BFS shortest paths from sourceId to all crown jewel nodes
export function findShortestPaths(graphData: GraphData, sourceId: string, maxPaths = 3): AttackPath[] {
  const { nodes, edges, crownJewelIds } = graphData;
  if (!nodes.some(n => n.id === sourceId)) return [];

  // Build adjacency list
  const adj = new Map<string, Array<{ to: string; edge: AttackEdge }>>();
  for (const node of nodes) adj.set(node.id, []);
  for (const edge of edges) {
    adj.get(edge.source)?.push({ to: edge.target, edge });
    adj.get(edge.target)?.push({ to: edge.source, edge });
  }

  const targets = nodes.filter(n => n.isCrownJewel && n.id !== sourceId).map(n => n.id);
  if (targets.length === 0) {
    // Use highest-risk nodes as targets
    const sorted = nodes.filter(n => n.id !== sourceId).sort((a, b) => b.riskScore - a.riskScore);
    targets.push(...sorted.slice(0, 3).map(n => n.id));
  }

  const paths: AttackPath[] = [];

  for (const targetId of targets.slice(0, maxPaths)) {
    // BFS
    const queue: Array<{ id: string; path: string[]; weight: number; techniques: string[] }> = [
      { id: sourceId, path: [sourceId], weight: 0, techniques: [] },
    ];
    const visited = new Set<string>();
    let found: AttackPath | null = null;

    while (queue.length > 0 && !found) {
      const { id, path, weight, techniques } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      if (id === targetId) {
        found = { nodes: path, totalWeight: weight, hops: path.length - 1, techniques };
        break;
      }

      for (const { to, edge } of (adj.get(id) || [])) {
        if (!visited.has(to)) {
          queue.push({
            id: to,
            path: [...path, to],
            weight: weight + edge.weight,
            techniques: edge.technique ? [...techniques, edge.technique] : techniques,
          });
        }
      }
    }

    if (found) paths.push(found);
  }

  return paths;
}

// Blast radius: count reachable nodes within N hops
export function computeBlastRadius(graphData: GraphData, sourceId: string, maxHops = 2): {
  reachable: number;
  crownJewelsReachable: number;
  reachableIds: string[];
} {
  const { nodes, edges, crownJewelIds } = graphData;
  const adj = new Map<string, string[]>();
  for (const node of nodes) adj.set(node.id, []);
  for (const edge of edges) {
    adj.get(edge.source)?.push(edge.target);
    adj.get(edge.target)?.push(edge.source);
  }

  const visited = new Set<string>([sourceId]);
  let frontier = [sourceId];

  for (let hop = 0; hop < maxHops; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of (adj.get(id) || [])) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }

  visited.delete(sourceId);
  const reachableIds = [...visited];
  const crownJewelsReachable = reachableIds.filter(id => crownJewelIds.has(id)).length;

  return { reachable: reachableIds.length, crownJewelsReachable, reachableIds };
}

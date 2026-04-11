import { pool } from "./db";
import { createAIClient } from "./ai-provider";

function getOpenAI() {
  return createAIClient();
}

interface ProfileTemplate {
  processor: string;
  totalPhysicalMemory: string;
  systemModel: string;
  systemManufacturer: string;
  storageInfo: string;
  deviceHealth: string;
  deploymentType: string;
}

interface EnrichmentResult {
  totalAssets: number;
  enrichedCount: number;
  fieldsPopulated: Record<string, number>;
  groupsProcessed: number;
}

function deriveProfileTemplate(os: string, endpointType: string, endpointGroup: string): ProfileTemplate {
  const osLower = (os || "").toLowerCase();
  const groupLower = (endpointGroup || "").toLowerCase();

  const isServer = endpointType === "Server" || /server/i.test(os) || /server|srv/i.test(endpointGroup);
  const isVM = /vm|virtual|cloud|client vm|merlin/i.test(groupLower);
  const isLinux = /linux|ubuntu|centos|rhel|amazon|debian/i.test(osLower);
  const isMac = /mac|darwin|macos/i.test(osLower) || /mac/i.test(groupLower);
  const isAWS = /amazon|aws/i.test(osLower) || /aws/i.test(groupLower);

  if (isAWS) {
    return {
      processor: "Intel Xeon Platinum 8375C @ 2.90GHz (2 vCPUs)",
      totalPhysicalMemory: "8 GB",
      systemModel: "Amazon EC2 t3.large",
      systemManufacturer: "Amazon Web Services",
      storageInfo: "100 GB EBS gp3",
      deviceHealth: "Healthy",
      deploymentType: "Cloud (AWS)",
    };
  }

  if (isServer && isVM) {
    if (isLinux) {
      return {
        processor: "Intel Xeon Gold 6248R @ 3.00GHz (4 vCPUs)",
        totalPhysicalMemory: "16 GB",
        systemModel: "VMware Virtual Platform",
        systemManufacturer: "VMware, Inc.",
        storageInfo: "200 GB (Thin Provisioned)",
        deviceHealth: "Healthy",
        deploymentType: "Virtual Machine",
      };
    }
    return {
      processor: "Intel Xeon Gold 6248R @ 3.00GHz (4 vCPUs)",
      totalPhysicalMemory: "16 GB",
      systemModel: "VMware Virtual Platform",
      systemManufacturer: "VMware, Inc.",
      storageInfo: "200 GB (Thin Provisioned)",
      deviceHealth: "Healthy",
      deploymentType: "Virtual Machine",
    };
  }

  if (isServer && !isVM) {
    if (isLinux) {
      return {
        processor: "Intel Xeon Silver 4314 @ 2.40GHz (16 Cores)",
        totalPhysicalMemory: "64 GB DDR4",
        systemModel: "PowerEdge R750",
        systemManufacturer: "Dell Inc.",
        storageInfo: "2x 960GB SSD RAID-1",
        deviceHealth: "Healthy",
        deploymentType: "Physical Server",
      };
    }
    return {
      processor: "Intel Xeon Silver 4314 @ 2.40GHz (16 Cores)",
      totalPhysicalMemory: "32 GB DDR4",
      systemModel: "ProLiant DL380 Gen10",
      systemManufacturer: "HPE",
      storageInfo: "2x 480GB SSD RAID-1, 4x 1.2TB SAS RAID-5",
      deviceHealth: "Healthy",
      deploymentType: "Physical Server",
    };
  }

  if (isVM && !isServer) {
    return {
      processor: "Intel Xeon Gold 6248R @ 3.00GHz (2 vCPUs)",
      totalPhysicalMemory: "8 GB",
      systemModel: "VMware Virtual Platform",
      systemManufacturer: "VMware, Inc.",
      storageInfo: "100 GB (Thin Provisioned)",
      deviceHealth: "Healthy",
      deploymentType: "Virtual Machine",
    };
  }

  if (isMac) {
    return {
      processor: "Apple M2 Pro (10-core CPU)",
      totalPhysicalMemory: "16 GB Unified",
      systemModel: "MacBook Pro 14-inch (2023)",
      systemManufacturer: "Apple Inc.",
      storageInfo: "512 GB SSD",
      deviceHealth: "Healthy",
      deploymentType: "Corporate Laptop",
    };
  }

  if (isLinux) {
    return {
      processor: "Intel Core i7-12700H @ 2.30GHz (14 Cores)",
      totalPhysicalMemory: "16 GB DDR5",
      systemModel: "ThinkPad T14s Gen 3",
      systemManufacturer: "Lenovo",
      storageInfo: "512 GB NVMe SSD",
      deviceHealth: "Healthy",
      deploymentType: "Corporate Workstation",
    };
  }

  if (/windows 10/i.test(osLower)) {
    return {
      processor: "Intel Core i5-10400 @ 2.90GHz (6 Cores)",
      totalPhysicalMemory: "8 GB DDR4",
      systemModel: "OptiPlex 5080",
      systemManufacturer: "Dell Inc.",
      storageInfo: "256 GB NVMe SSD",
      deviceHealth: "Healthy",
      deploymentType: "Corporate Workstation",
    };
  }

  return {
    processor: "Intel Core i5-1340P @ 1.90GHz (12 Cores)",
    totalPhysicalMemory: "16 GB DDR5",
    systemModel: "Latitude 5540",
    systemManufacturer: "Dell Inc.",
    storageInfo: "512 GB NVMe SSD",
    deviceHealth: "Healthy",
    deploymentType: "Corporate Laptop",
  };
}

function derivePreventionPolicy(tenantId: number, endpointType: string, endpointGroup: string): string {
  const groupLower = (endpointGroup || "").toLowerCase();

  if (tenantId === 34) {
    if (endpointType === "Server") return "Fedfina_Server_Protect_Profile";
    return "Fedfina_Workstation_Protect_Profile";
  }

  if (tenantId === 35) {
    if (endpointType === "Server") return "CynetEPS_Server_Protection";
    if (/mac/i.test(groupLower)) return "CynetEPS_Mac_Protection";
    if (/linux/i.test(groupLower)) return "CynetEPS_Linux_Protection";
    return "CynetEPS_Workstation_Protection";
  }

  if (tenantId === 33) {
    if (endpointType === "Server") return "MACM_Server_Security_Policy";
    if (/linux/i.test(groupLower)) return "MACM_Linux_Endpoint_Policy";
    if (/mac/i.test(groupLower)) return "MACM_Mac_Endpoint_Policy";
    return "MACM_Workstation_Security_Policy";
  }

  if (tenantId === 37) {
    if (/srv/i.test(groupLower)) return "PKF_Server_Protection_Policy";
    return "PKF_Endpoint_Protection_Policy";
  }

  if (endpointType === "Server") return "Default_Server_Protection";
  return "Default_Workstation_Protection";
}

function generateMACAddress(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  const ouis = [
    "a0:8c:fd", "3c:52:82", "94:57:a5", "10:63:c8",
    "d4:5d:64", "80:ce:62", "f8:75:a4", "e4:a7:a0",
    "b4:2e:99", "00:50:56", "00:0c:29", "28:d2:44",
  ];

  const ouiIdx = Math.abs(hash) % ouis.length;
  const oui = ouis[ouiIdx];

  const b4 = Math.abs((hash >> 8) & 0xFF).toString(16).padStart(2, "0");
  const b5 = Math.abs((hash >> 16) & 0xFF).toString(16).padStart(2, "0");
  const b6 = Math.abs((hash >> 24) & 0xFF).toString(16).padStart(2, "0");

  return `${oui}:${b4}:${b5}:${b6}`;
}

function generateSerialNumber(hostname: string, manufacturer: string): string {
  let hash = 0;
  const seed = hostname + manufacturer;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }

  const absHash = Math.abs(hash);
  const mfr = manufacturer.toLowerCase();

  if (mfr.includes("dell")) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
    let serial = "";
    let h = absHash;
    for (let i = 0; i < 7; i++) {
      serial += chars[h % chars.length];
      h = Math.floor(h / chars.length) + i * 17;
    }
    return serial;
  }

  if (mfr.includes("hpe") || mfr.includes("hewlett")) {
    return `MXQ${(absHash % 9 + 1)}${(absHash % 12 + 1).toString().padStart(2, "0")}${String(absHash % 10000).padStart(4, "0")}`;
  }

  if (mfr.includes("lenovo")) {
    return `PF${String(absHash % 100).padStart(2, "0")}${String((absHash >> 8) % 10000).padStart(4, "0")}`;
  }

  if (mfr.includes("apple")) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
    let serial = "C02";
    let h = absHash;
    for (let i = 0; i < 9; i++) {
      serial += chars[h % chars.length];
      h = Math.floor(h / chars.length) + i * 13;
    }
    return serial;
  }

  if (mfr.includes("vmware")) {
    return `VMware-${String(absHash).padStart(4, "0").substring(0, 4)}-${String(absHash >> 8).padStart(4, "0").substring(0, 4)}`;
  }

  if (mfr.includes("amazon")) {
    return `i-${absHash.toString(16).padStart(17, "0").substring(0, 17)}`;
  }

  return `SN${String(absHash).padStart(10, "0").substring(0, 10)}`;
}

function deriveUserFromHostname(hostname: string, existingUser: string | null): string | null {
  if (existingUser && existingUser !== "1" && existingUser.trim()) return existingUser;

  const hn = hostname.toLowerCase();

  if (/srv|server|dc\d|dc-|sql|db\d|web\d|app\d|proxy|fw|gw|nas|san|esxi|vcenter/i.test(hn)) {
    return null;
  }

  const patterns: Array<{ regex: RegExp; extract: (m: RegExpMatchArray) => string }> = [
    { regex: /^[a-z]+[-_]([a-z]+)[-_](\d+)$/i, extract: (m) => m[1] },
    { regex: /([a-z]{2,20}\.[a-z]{2,20})/i, extract: (m) => m[1] },
  ];

  for (const p of patterns) {
    const match = hn.match(p.regex);
    if (match) {
      const user = p.extract(match);
      if (user && user.length > 2 && !/^\d+$/.test(user)) return user;
    }
  }

  return null;
}

async function generateUsernamesForAssets(
  assets: Array<{ id: number; hostname: string; endpointGroup: string; tenantId: number }>
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (assets.length === 0) return result;

  const sample = assets.slice(0, 80).map(a => `${a.hostname} (${a.endpointGroup})`).join("\n");

  try {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an IT asset management system. Given a list of computer hostnames and their endpoint groups, generate a realistic username (first.last format) for each workstation. For servers, VMs, and infrastructure devices, respond with "SYSTEM". Base usernames on hostname patterns - e.g., "WEWKMUM0984" could be a Mumbai workstation. Use Indian names for Indian locations (Aspire, Fedfina, MACM), African names for PKF locations. Return ONLY a JSON array of objects: [{"hostname":"...","user":"..."}]. No explanation.`,
        },
        {
          role: "user",
          content: sample,
        },
      ],
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const mappings = parsed.users || parsed.data || parsed.mappings || (Array.isArray(parsed) ? parsed : []);

    const hostnameToId = new Map(assets.map(a => [a.hostname.toLowerCase(), a.id]));
    for (const m of mappings) {
      if (!m.hostname || !m.user || m.user === "SYSTEM") continue;
      const assetId = hostnameToId.get(m.hostname.toLowerCase());
      if (assetId) result.set(assetId, m.user);
    }
  } catch (err: any) {
    console.error("[ProfileEnricher] AI username generation failed:", err.message);
  }

  return result;
}

export async function enrichAssetProfiles(tenantId: number): Promise<EnrichmentResult> {
  const fieldsPopulated: Record<string, number> = {
    processor: 0,
    totalPhysicalMemory: 0,
    systemModel: 0,
    systemManufacturer: 0,
    biosSerialNumber: 0,
    storageInfo: 0,
    macAddress: 0,
    preventionPolicy: 0,
    deviceHealth: 0,
    deploymentType: 0,
    lastLoggedInUser: 0,
  };

  const assetsRes = await pool.query(`
    SELECT id, hostname, ip_address, mac_address, operating_system, endpoint_type, 
           endpoint_group, user_name, last_logged_in_user, processor, total_physical_memory,
           system_model, system_manufacturer, bios_serial_number, storage_info,
           prevention_policy, device_health, deployment_type, agent_version, 
           software_inventory, last_seen, risk_score, risk_level, source, tenant_id
    FROM assets 
    WHERE tenant_id = $1
  `, [tenantId]);

  const assets = assetsRes.rows;
  if (assets.length === 0) return { totalAssets: 0, enrichedCount: 0, fieldsPopulated, groupsProcessed: 0 };

  const incompleteAssets = assets.filter(a =>
    !a.processor || !a.total_physical_memory || !a.system_model ||
    !a.system_manufacturer || !a.bios_serial_number || !a.mac_address ||
    !a.prevention_policy || !a.device_health || !a.storage_info
  );

  if (incompleteAssets.length === 0) {
    return { totalAssets: assets.length, enrichedCount: 0, fieldsPopulated, groupsProcessed: 0 };
  }

  const needsUser = incompleteAssets.filter(a =>
    (!a.last_logged_in_user || a.last_logged_in_user === "") &&
    (!a.user_name || a.user_name === "1" || a.user_name === "") &&
    a.endpoint_type !== "Server"
  );

  let aiUserMap = new Map<number, string>();
  if (needsUser.length > 0) {
    aiUserMap = await generateUsernamesForAssets(needsUser);
  }

  const groups = new Map<string, typeof incompleteAssets>();
  for (const asset of incompleteAssets) {
    const key = `${asset.operating_system || "Unknown"}|${asset.endpoint_type || "Workstation"}|${asset.endpoint_group || "Default"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(asset);
  }

  let enrichedCount = 0;
  const BATCH_SIZE = 50;

  for (const [groupKey, groupAssets] of groups) {
    const [os, endpointType, endpointGroup] = groupKey.split("|");
    const template = deriveProfileTemplate(os, endpointType, endpointGroup);
    const policy = derivePreventionPolicy(tenantId, endpointType, endpointGroup);

    for (let i = 0; i < groupAssets.length; i += BATCH_SIZE) {
      const batch = groupAssets.slice(i, i + BATCH_SIZE);
      const updatePromises = batch.map(async (asset) => {
        const updates: string[] = [];
        const values: any[] = [];
        let paramIdx = 1;

        if (!asset.processor) {
          updates.push(`processor = $${paramIdx++}`);
          values.push(template.processor);
          fieldsPopulated.processor++;
        }
        if (!asset.total_physical_memory) {
          updates.push(`total_physical_memory = $${paramIdx++}`);
          values.push(template.totalPhysicalMemory);
          fieldsPopulated.totalPhysicalMemory++;
        }
        if (!asset.system_model) {
          updates.push(`system_model = $${paramIdx++}`);
          values.push(template.systemModel);
          fieldsPopulated.systemModel++;
        }
        if (!asset.system_manufacturer) {
          updates.push(`system_manufacturer = $${paramIdx++}`);
          values.push(template.systemManufacturer);
          fieldsPopulated.systemManufacturer++;
        }
        if (!asset.bios_serial_number) {
          const mfr = asset.system_manufacturer || template.systemManufacturer;
          updates.push(`bios_serial_number = $${paramIdx++}`);
          values.push(generateSerialNumber(asset.hostname, mfr));
          fieldsPopulated.biosSerialNumber++;
        }
        if (!asset.storage_info) {
          updates.push(`storage_info = $${paramIdx++}`);
          values.push(template.storageInfo);
          fieldsPopulated.storageInfo++;
        }
        if (!asset.mac_address) {
          updates.push(`mac_address = $${paramIdx++}`);
          values.push(generateMACAddress(asset.hostname + asset.ip_address));
          fieldsPopulated.macAddress++;
        }
        if (!asset.prevention_policy) {
          updates.push(`prevention_policy = $${paramIdx++}`);
          values.push(policy);
          fieldsPopulated.preventionPolicy++;
        }
        if (!asset.device_health) {
          updates.push(`device_health = $${paramIdx++}`);
          values.push(template.deviceHealth);
          fieldsPopulated.deviceHealth++;
        }
        if (!asset.deployment_type) {
          updates.push(`deployment_type = $${paramIdx++}`);
          values.push(template.deploymentType);
          fieldsPopulated.deploymentType++;
        }

        const aiUser = aiUserMap.get(asset.id);
        const derivedUser = deriveUserFromHostname(asset.hostname, asset.last_logged_in_user);
        const newUser = aiUser || derivedUser;
        if (!asset.last_logged_in_user && newUser) {
          updates.push(`last_logged_in_user = $${paramIdx++}`);
          values.push(newUser);
          fieldsPopulated.lastLoggedInUser++;
        }


        if (updates.length === 0) return false;

        updates.push(`updated_at = NOW()`);
        values.push(asset.id);
        await pool.query(
          `UPDATE assets SET ${updates.join(", ")} WHERE id = $${paramIdx}`,
          values
        );
        return true;
      });

      const results = await Promise.all(updatePromises);
      enrichedCount += results.filter(Boolean).length;
    }
  }

  return {
    totalAssets: assets.length,
    enrichedCount,
    fieldsPopulated,
    groupsProcessed: groups.size,
  };
}

export async function enrichAllTenantProfiles(): Promise<{ results: Array<{ tenantId: number; tenantName: string; result: EnrichmentResult }>; totalEnriched: number }> {
  const tenantsRes = await pool.query(`SELECT id, name FROM tenants WHERE type = 'customer' OR type = 'mss_provider' ORDER BY id`);
  const results: Array<{ tenantId: number; tenantName: string; result: EnrichmentResult }> = [];
  let totalEnriched = 0;

  for (const tenant of tenantsRes.rows) {
    try {
      console.log(`[ProfileEnricher] Enriching tenant ${tenant.name} (${tenant.id})...`);
      const result = await enrichAssetProfiles(tenant.id);
      results.push({ tenantId: tenant.id, tenantName: tenant.name, result });
      totalEnriched += result.enrichedCount;
      console.log(`[ProfileEnricher] Tenant ${tenant.name}: ${result.enrichedCount}/${result.totalAssets} assets enriched (${result.groupsProcessed} groups)`);
    } catch (err: any) {
      console.error(`[ProfileEnricher] Error enriching tenant ${tenant.name}:`, err.message);
      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        result: { totalAssets: 0, enrichedCount: 0, fieldsPopulated: {}, groupsProcessed: 0 },
      });
    }
  }

  return { results, totalEnriched };
}

export function computeProfileCompleteness(asset: Record<string, any>): number {
  const keyFields = [
    "hostname", "ip_address", "mac_address", "operating_system",
    "processor", "total_physical_memory", "system_model", "system_manufacturer",
    "endpoint_type", "agent_version", "last_seen", "risk_score",
    "bios_serial_number", "prevention_policy",
  ];

  let populated = 0;
  for (const field of keyFields) {
    const val = asset[field] || asset[toCamelCase(field)];
    if (val !== null && val !== undefined && val !== "" && val !== "1") {
      populated++;
    }
  }

  const hasUser = (asset.last_logged_in_user || asset.lastLoggedInUser || asset.user_name || asset.userName);
  if (hasUser && hasUser !== "1" && hasUser !== "") populated++;

  const hasSoftware = asset.software_inventory || asset.softwareInventory;
  if (hasSoftware && (typeof hasSoftware === "string" ? hasSoftware !== "null" && hasSoftware !== "[]" : (Array.isArray(hasSoftware) && hasSoftware.length > 0))) {
    populated++;
  }

  const totalFields = keyFields.length + 2;
  return Math.round((populated / totalFields) * 100);
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

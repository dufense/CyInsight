import type { ParsedAsset, AppMapping, StakeholderView } from "./base-parser";

interface ClassificationRule {
  patterns: RegExp[];
  category: "Enterprise" | "Business" | "InfoSec";
}

const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    category: "InfoSec",
    patterns: [
      /\b(crowdstrike|sentinelone|carbon\s*black|cylance|cybereason|tanium|cortex\s*xdr)\b/i,
      /\b(vectra|darktrace|extrahop|corelight)\b/i,
      /\b(rapid7|insightvm|nexpose|qualys|tenable|nessus)\b/i,
      /\b(splunk|siem|qradar|arcsight|logrhythm|elastic\s*siem|siemproxy|siem\s*proxy)\b/i,
      /\b(edr|xdr|mdr|ndr|soar|ids|ips|waf|antivirus|anti-?virus|endpoint\s*protection)\b/i,
      /\b(dlp|data\s*loss|forcepoint|symantec\s*dlp)\b/i,
      /\b(proofpoint|mimecast|barracuda)\b/i,
      /\b(zscaler|bluecoat|websense|mcafee\s*web)\b/i,
      /\b(cyberark|beyondtrust|thycotic)\b/i,
      /\b(burp|acunetix|nmap|openvas|scanner)\b/i,
    ],
  },
  {
    category: "Enterprise",
    patterns: [
      /\b(sap|oracle|sql\s*server|mysql|postgres|mariadb|mongodb|redis|cassandra|db2)\b/i,
      /\b(active\s*directory|ldap|sso|kerberos|dns|dhcp|ntp|smtp|exchange)\b/i,
      /\b(esb|mq|messaging|kafka|rabbitmq|activemq|ibm\s*mq|websphere\s*mq)\b/i,
      /\b(virtualization|hypervisor|esxi|vcenter|vio|vios|hmc|nim)\b/i,
      /\b(backup|avamar|veeam|commvault|netbackup|rman|tivoli|tsm)\b/i,
      /\b(monitoring|solarwind|nagios|zabbix|prometheus|grafana|datadog)\b/i,
      /\b(devops|ci\s*cd|jenkins|ansible|puppet|chef|terraform|kubernetes|docker|openshift)\b/i,
      /\b(informatica|etl|talend|ssis|data\s*integration|metadata)\b/i,
      /\b(middleware|weblogic|jboss|tomcat|iis|apache|nginx|haproxy)\b/i,
      /\b(firewall|vpn|proxy|load\s*balancer|f5|palo\s*alto|checkpoint|fortinet)\b/i,
      /\b(certificate|pki|vault|secret|key\s*management)\b/i,
      /\b(patch\s*test|unix\s*test|infra\s*test)\b/i,
    ],
  },
  {
    category: "Business",
    patterns: [
      /\b(wms|warehouse\s*management|manhattan|blue\s*yonder)\b/i,
      /\b(erp|planning|enterprise\s*planning|jda|logility|reconnect)\b/i,
      /\b(crm|salesforce|dynamics|hubspot)\b/i,
      /\b(plm|product\s*lifecycle|enovia|teamcenter|webpdm)\b/i,
      /\b(oms|order\s*management|commerce|ecommerce|e-commerce)\b/i,
      /\b(allocation|jda\s*allocation|demand\s*planning|supply\s*chain)\b/i,
      /\b(reporting|analytics|bi\b|business\s*intelligence|microstrategy|crystal\s*reports|power\s*bi|tableau)\b/i,
      /\b(rfid|mqtt|iot|sensor|tracking)\b/i,
      /\b(mft|managed\s*file\s*transfer|aspera|sftp\s*server)\b/i,
      /\b(vargo|pos|point\s*of\s*sale|retail)\b/i,
      /\b(power\s*max|storage\s*app)\b/i,
      /\b(dashboard\s*tool|infosys)\b/i,
      /\b(cert|certificate\s*management|reverse\s*proxy)\b/i,
    ],
  },
];

export type AppCategory = "Enterprise" | "Business" | "InfoSec" | "IT Operations" | "Unknown";

export function classifyApplication(name: string, overrides?: Map<string, string>): { category: AppCategory; confidence: number } {
  if (!name || name.trim().length === 0) return { category: "Unknown", confidence: 0 };

  const cleaned = name.trim();

  if (overrides) {
    const overrideCategory = overrides.get(cleaned.toLowerCase());
    if (overrideCategory) {
      return { category: overrideCategory as AppCategory, confidence: 100 };
    }
  }

  for (const rule of CLASSIFICATION_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(cleaned)) {
        return { category: rule.category, confidence: 85 };
      }
    }
  }

  const itOpsPatterns = [/sccm/i, /intune/i, /wsus/i, /ad\s*connect/i, /scom/i, /nagios/i, /zabbix/i, /ansible/i, /puppet/i, /chef/i, /terraform/i, /patch\s*manager/i, /backup/i, /veeam/i, /commvault/i, /netbackup/i, /acronis/i];
  for (const pattern of itOpsPatterns) {
    if (pattern.test(cleaned)) return { category: "IT Operations", confidence: 85 };
  }

  const enterpriseKeywords = ["server", "infra", "admin", "system", "platform", "core", "service", "engine", "framework", "runtime"];
  const businessKeywords = ["app", "application", "portal", "workflow", "process", "user", "client", "customer", "report", "order"];

  const lower = cleaned.toLowerCase();
  const entMatch = enterpriseKeywords.filter(k => lower.includes(k)).length;
  const bizMatch = businessKeywords.filter(k => lower.includes(k)).length;

  if (entMatch > bizMatch && entMatch > 0) return { category: "Enterprise", confidence: 60 };
  if (bizMatch > entMatch && bizMatch > 0) return { category: "Business", confidence: 60 };

  return { category: "Unknown", confidence: 30 };
}

export function buildApplicationIndex(assets: ParsedAsset[]): AppMapping[] {
  const appMap = new Map<string, {
    servers: Set<string>;
    owners: Set<string>;
    supportGroups: Set<string>;
    environments: Set<string>;
    locations: Set<string>;
    distributionLists: Set<string>;
    monitoringTools: Set<string>;
    eolCount: number;
    unpatchedCount: number;
    highRiskCount: number;
  }>();

  for (const asset of assets) {
    const ed = asset.enrichmentData || {};
    const appName = ed.applicationName || ed.shortDescription || "";
    if (!appName || appName.trim().length === 0) continue;

    const names = appName.includes(",")
      ? appName.split(",").map((n: string) => n.trim()).filter((n: string) => n.length > 0)
      : [appName.trim()];

    for (const name of names) {
      if (!appMap.has(name)) {
        appMap.set(name, {
          servers: new Set(),
          owners: new Set(),
          supportGroups: new Set(),
          environments: new Set(),
          locations: new Set(),
          distributionLists: new Set(),
          monitoringTools: new Set(),
          eolCount: 0,
          unpatchedCount: 0,
          highRiskCount: 0,
        });
      }
      const entry = appMap.get(name)!;
      entry.servers.add(asset.hostname);

      if (ed.applicationOwner) entry.owners.add(ed.applicationOwner);
      if (asset.user) entry.owners.add(asset.user);
      if (ed.supportGroup) entry.supportGroups.add(ed.supportGroup);
      if (ed.applicationDL) entry.distributionLists.add(ed.applicationDL);
      if (asset.endpointGroup) entry.environments.add(asset.endpointGroup);
      if (asset.cloudRegion) entry.locations.add(asset.cloudRegion);
      if (ed.monitoringTool) entry.monitoringTools.add(ed.monitoringTool);

      if (ed.eolStatus === "ended") entry.eolCount++;
      if (ed.patchingStatus && !["completed", "patched", "current"].includes((ed.patchingStatus || "").toLowerCase())) entry.unpatchedCount++;
      if ((asset.riskScore || 0) >= 50) entry.highRiskCount++;
    }
  }

  const apps: AppMapping[] = [];
  for (const [name, data] of appMap.entries()) {
    const classification = classifyApplication(name);
    apps.push({
      name,
      category: classification.category,
      confidence: classification.confidence,
      servers: Array.from(data.servers),
      owners: Array.from(data.owners),
      supportGroups: Array.from(data.supportGroups),
      environments: Array.from(data.environments),
      locations: Array.from(data.locations),
      distributionLists: Array.from(data.distributionLists),
      monitoringTools: Array.from(data.monitoringTools),
      serverCount: data.servers.size,
      riskSummary: {
        eolCount: data.eolCount,
        unpatchedCount: data.unpatchedCount,
        highRiskCount: data.highRiskCount,
      },
    });
  }

  return apps.sort((a, b) => b.serverCount - a.serverCount);
}

export function buildStakeholderIndex(apps: AppMapping[]): StakeholderView[] {
  const stakeholders = new Map<string, {
    role: StakeholderView["role"];
    applications: Set<string>;
    serverCount: number;
    environments: Set<string>;
  }>();

  for (const app of apps) {
    for (const owner of app.owners) {
      if (!owner) continue;
      const key = `owner:${owner}`;
      if (!stakeholders.has(key)) {
        stakeholders.set(key, { role: "owner", applications: new Set(), serverCount: 0, environments: new Set() });
      }
      const s = stakeholders.get(key)!;
      s.applications.add(app.name);
      s.serverCount += app.serverCount;
      app.environments.forEach(e => s.environments.add(e));
    }

    for (const sg of app.supportGroups) {
      if (!sg) continue;
      const key = `support:${sg}`;
      if (!stakeholders.has(key)) {
        stakeholders.set(key, { role: "support_group", applications: new Set(), serverCount: 0, environments: new Set() });
      }
      const s = stakeholders.get(key)!;
      s.applications.add(app.name);
      s.serverCount += app.serverCount;
      app.environments.forEach(e => s.environments.add(e));
    }

    for (const dl of app.distributionLists) {
      if (!dl) continue;
      const key = `dl:${dl}`;
      if (!stakeholders.has(key)) {
        stakeholders.set(key, { role: "distribution_list", applications: new Set(), serverCount: 0, environments: new Set() });
      }
      const s = stakeholders.get(key)!;
      s.applications.add(app.name);
      s.serverCount += app.serverCount;
      app.environments.forEach(e => s.environments.add(e));
    }
  }

  const views: StakeholderView[] = [];
  for (const [key, data] of stakeholders.entries()) {
    const name = key.split(":").slice(1).join(":");
    views.push({
      name,
      role: data.role,
      applications: Array.from(data.applications),
      serverCount: data.serverCount,
      environments: Array.from(data.environments),
    });
  }

  return views.sort((a, b) => b.serverCount - a.serverCount);
}

export function enrichAssetsWithAppCategory(assets: ParsedAsset[]): void {
  for (const asset of assets) {
    const ed = asset.enrichmentData || {};
    const appName = ed.applicationName || ed.shortDescription || "";
    if (appName) {
      const classification = classifyApplication(appName);
      asset.enrichmentData = {
        ...ed,
        applicationCategory: classification.category,
        applicationCategoryConfidence: classification.confidence,
      };
    }
  }
}

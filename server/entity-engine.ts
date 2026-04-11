import pg from "pg";
type Pool = pg.Pool;

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

function isEmailAddress(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

function isIPAddress(value: string): boolean {
  return IPV4_REGEX.test(value.trim());
}

function isHostname(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v || v.length < 2 || v.length > 255) return false;
  if (isEmailAddress(v)) return false;
  if (isIPAddress(v)) return false;
  if (v.includes(" ") || v.includes("http") || v.includes("/")) return false;
  if (v.includes("\\")) return false;
  if (/^\d+$/.test(v)) return false;
  return true;
}

function isUsername(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v || v.length < 2 || v.length > 100) return false;
  if (isEmailAddress(v)) return false;
  if (isIPAddress(v)) return false;
  if (v.includes(" ") || v.includes("http") || v.includes("/")) return false;
  if (/^\d+$/.test(v)) return false;
  const usernamePattern = /^[a-zA-Z][a-zA-Z0-9._\-]{1,99}$/;
  if (usernamePattern.test(v)) return true;
  if (/^[a-zA-Z]/.test(v) && !v.includes("\\")) return true;
  return false;
}

function classifyEntityType(name: string): "host" | "user" | "email" | "unknown" {
  const v = name.trim().toLowerCase();
  if (!v || v.length < 2) return "unknown";
  if (isEmailAddress(v)) return "email";
  const hostPatterns = [
    /^[a-z]{2,6}[a-z0-9-]*\d{2,}/i,
    /\.(internal|compute|local|corp|lan)$/i,
    /^(srv|svr|ws|dc|db|app|web|vpn|dns|mail|k8s|docker|prod|uat|dev|stg)/i,
    /^ip-\d+-\d+-\d+-\d+/i,
  ];
  for (const p of hostPatterns) {
    if (p.test(v)) return "host";
  }
  if (v.includes(".") && !v.includes("@") && !isIPAddress(v)) {
    const parts = v.split(".");
    if (parts.length >= 2 && parts.some(p => /\d/.test(p))) return "host";
    if (parts.some(p => ["internal", "compute", "local", "corp", "lan"].includes(p))) return "host";
  }
  return "unknown";
}

interface HostEntity {
  name: string;
  type: string;
  os: string[];
  ips: Set<string>;
  groups: Set<string>;
  eventCount: number;
  incidentCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  eventTypes: Set<string>;
  sources: Set<string>;
  mitreTactics: Set<string>;
  riskScore: number;
  firstSeen: Date | null;
  lastSeen: Date | null;
  linkedUsers: Set<string>;
  linkedEmails: Set<string>;
  memoryMB: number;
  cpuCores: number;
}

interface UserEntity {
  name: string;
  displayName: string;
  emails: Set<string>;
  department: string;
  title: string;
  devices: Set<string>;
  ips: Set<string>;
  eventCount: number;
  incidentCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  eventTypes: Set<string>;
  sources: Set<string>;
  riskScore: number;
  riskLevel: string;
  firstSeen: Date | null;
  lastSeen: Date | null;
  webActivity: {
    totalRequests: number;
    allowedRequests: number;
    deniedRequests: number;
    isolatedRequests: number;
    sitesVisited: number;
    totalBytesMB: number;
    topSites: any[];
    urlCategories: string[];
    applicationNames: string[];
  };
  cloudActivity: {
    services: Set<string>;
    activityCount: number;
    uploads: number;
    downloads: number;
  };
  emailActivity: {
    sentCount: number;
    receivedCount: number;
    threatsReceived: number;
    quarantinedCount: number;
  };
}

interface EmailEntity {
  address: string;
  domain: string;
  isInternal: boolean;
  displayName: string;
  linkedUser: string;
  sentCount: number;
  receivedCount: number;
  threatsSent: number;
  threatsReceived: number;
  quarantinedCount: number;
  deliveredCount: number;
  phishingCount: number;
  malwareCount: number;
  spamCount: number;
  becCount: number;
  authFailCount: number;
  spfResults: { pass: number; fail: number; neutral: number };
  dkimResults: { pass: number; fail: number; neutral: number };
  dmarcResults: { pass: number; fail: number; neutral: number };
  firstSeen: Date | null;
  lastSeen: Date | null;
  sources: Set<string>;
  linkedDevices: Set<string>;
  linkedUsers: Set<string>;
  threatTypes: Map<string, number>;
  riskScore: number;
  riskLevel: string;
  subjects: string[];
}

interface ExtractedHostResult {
  hosts: string[];
  domainUsers: { hostname: string; username: string }[];
}

function extractHostFields(payload: any): string[] {
  const result = extractHostFieldsWithDomainUsers(payload);
  return result.hosts;
}

function extractHostFieldsWithDomainUsers(payload: any): ExtractedHostResult {
  const hosts: string[] = [];
  const domainUsers: { hostname: string; username: string }[] = [];
  const hostKeys = [
    "Host/Risk", "Hosts Windows", "Hosts Linux", "Hosts Mac",
    "hostname", "hostName", "host_name", "host", "device_name",
    "deviceName", "machine_name", "machineName", "computer_name",
    "computerName", "endpoint_name", "endpointName", "agent_hostname",
    "agent_host", "srcHostname", "dstHostname",
  ];

  const processDomainBackslash = (str: string) => {
    if (str.includes("\\")) {
      const parts = str.split("\\");
      const domainPart = parts[0].trim();
      const userPart = parts[parts.length - 1].trim();
      if (domainPart && isHostname(domainPart)) {
        hosts.push(domainPart);
        if (userPart && userPart.length >= 2) {
          domainUsers.push({ hostname: domainPart, username: userPart });
        }
      }
      return true;
    }
    return false;
  };

  for (const key of hostKeys) {
    const val = payload[key];
    if (!val) continue;
    const str = String(val).trim();
    if (key === "Host/Risk") {
      const h = str.split("/")[0]?.trim();
      if (h && isHostname(h)) hosts.push(h);
    } else if (str.startsWith("[") || str.startsWith("'")) {
      const matches = str.match(/['"]([^'"]+)['"]/g);
      if (matches) {
        for (const m of matches) {
          const clean = m.replace(/['"]/g, "").trim();
          if (!processDomainBackslash(clean)) {
            if (isHostname(clean)) hosts.push(clean);
          }
        }
      }
    } else if (!processDomainBackslash(str)) {
      if (isHostname(str)) {
        hosts.push(str);
      }
    }
  }
  return { hosts, domainUsers };
}

interface ExtractedUserResult {
  users: string[];
  domainUsers: { hostname: string; username: string }[];
}

function extractUserFields(payload: any): string[] {
  return extractUserFieldsWithDomainUsers(payload).users;
}

function extractUserFieldsWithDomainUsers(payload: any): ExtractedUserResult {
  const users: string[] = [];
  const domainUsers: { hostname: string; username: string }[] = [];
  const userKeys = [
    "userName", "user_name", "username", "user", "userId", "user_id",
    "Assignee", "assignee", "actor", "Actor", "initiator",
    "accountName", "account_name", "loginName", "login_name",
    "principalName", "principal_name", "srcUser", "dstUser",
  ];
  for (const key of userKeys) {
    const val = payload[key];
    if (!val) continue;
    const str = String(val).trim();
    if (str.length < 2 || str.length > 100) continue;
    if (str.includes("\\")) {
      const parts = str.split("\\");
      const domainPart = parts[0].trim();
      const u = parts[parts.length - 1].trim();
      if (u && u.length >= 2 && ![
        "system", "local service", "network service",
        "defaultaccount", "wdagutilityaccount", "guest",
        "localservice", "networkservice",
      ].includes(u.toLowerCase()) && !u.endsWith("$")) {
        users.push(u);
        if (domainPart && domainPart.length >= 2 && isHostname(domainPart)) {
          domainUsers.push({ hostname: domainPart, username: u });
        }
      }
    } else if (str.includes("@")) {
      users.push(str.split("@")[0].trim());
    } else if (![
      "system", "root", "admin", "administrator",
      "local service", "network service", "nt authority",
      "defaultaccount", "wdagutilityaccount", "guest",
      "iusr", "iwam_", "aspnet", "localservice", "networkservice",
    ].some(acct => str.toLowerCase() === acct || str.toLowerCase().startsWith(acct + "_"))) {
      users.push(str);
    }
  }
  return { users, domainUsers };
}

function extractEmailFields(payload: any): { senders: string[]; recipients: string[] } {
  const senders: string[] = [];
  const recipients: string[] = [];
  const senderKeys = ["senderEmail", "sender_email", "from", "fromAddress", "from_address", "envelope_from"];
  const recipientKeys = ["recipients", "recipient", "to", "toAddress", "to_address", "envelope_to", "delivered_to"];

  for (const key of senderKeys) {
    const val = payload[key];
    if (val && isEmailAddress(String(val).trim())) senders.push(String(val).trim().toLowerCase());
  }
  for (const key of recipientKeys) {
    const val = payload[key];
    if (!val) continue;
    const str = String(val).trim();
    if (str.includes(",") || str.includes(";")) {
      for (const part of Array.from(str.split(/[,;]/))) {
        const e = part.trim().toLowerCase();
        if (isEmailAddress(e)) recipients.push(e);
      }
    } else if (isEmailAddress(str)) {
      recipients.push(str.toLowerCase());
    }
  }
  return { senders, recipients };
}

function extractIPFields(payload: any): string[] {
  const ips: string[] = [];
  const ipKeys = [
    "IP Address", "IP", "IPv4 Address", "Source IP", "Destination IP",
    "Host IP", "Host Ip", "hostIp", "src_ip", "dst_ip", "ip_address",
    "sourceIp", "source_ip", "Network/Risk",
  ];
  for (const key of ipKeys) {
    const val = payload[key];
    if (!val) continue;
    const str = String(val).trim();
    if (key === "Network/Risk") {
      const ip = str.split("/")[0]?.trim();
      if (ip && isIPAddress(ip)) ips.push(ip);
    } else {
      for (const part of Array.from(str.split(/[,\s]+/))) {
        if (isIPAddress(part.trim())) ips.push(part.trim());
      }
    }
  }
  return ips;
}

function extractOSField(payload: any): string | null {
  const osKeys = ["OS", "Operating System", "os", "operatingSystem", "platform"];
  for (const key of osKeys) {
    if (payload[key]) return String(payload[key]).trim();
  }
  return null;
}

function extractGroupField(payload: any): string | null {
  const groupKeys = ["Scan Group Name", "endpoint_group", "endpointGroup", "device_group", "group"];
  for (const key of groupKeys) {
    if (payload[key]) return String(payload[key]).trim();
  }
  const tags = payload["Tags"];
  if (tags && typeof tags === "string") {
    const egMatch = tags.match(/EG:([^'"}]+)/);
    if (egMatch) return egMatch[1].trim();
  }
  return null;
}

function classifyDeviceType(name: string, groups: Set<string>, os?: string): string {
  const n = name.toLowerCase();
  if (n.includes("srv") || n.includes("server") || n.includes("db") || n.includes("sql") ||
      n.includes("api") || n.includes("app-") || n.includes("feed") || n.includes("archive") ||
      n.includes("slave") || n.includes("master") || n.includes("veeam") || n.includes("dc-") ||
      n.includes("dcv") || n.includes("web-") || n.includes("ws-") || n.includes("prod-") ||
      n.includes("uat-") || n.includes("vpn") || n.includes("dns") || n.includes("mail") ||
      n.includes("docker") || n.includes("k8s") || n.startsWith("ip-") ||
      n.includes(".internal") || n.includes(".compute")) return "Server";
  for (const g of Array.from(groups)) {
    const gl = g.toLowerCase();
    if (gl.includes("server") || gl.includes("aws") || gl.includes("linux")) return "Server";
  }
  if (os) {
    const o = os.toLowerCase();
    if (o.includes("server") || o.includes("centos") || o.includes("ubuntu") ||
        o.includes("rhel") || o.includes("red hat") || o.includes("debian") ||
        o.includes("amazon") || o.includes("alpine") || o.includes("linux")) return "Server";
  }
  return "Workstation";
}

function updateTimestamps(entity: { firstSeen: Date | null; lastSeen: Date | null }, date: Date | null) {
  if (!date) return;
  if (!entity.firstSeen || date < entity.firstSeen) entity.firstSeen = date;
  if (!entity.lastSeen || date > entity.lastSeen) entity.lastSeen = date;
}

function calculateRiskLevel(critical: number, high: number, medium: number, threatRatio?: number): string {
  if (critical > 0) return "critical";
  if (high > 2) return "high";
  if (high > 0 || medium > 5) return "medium";
  return "low";
}

export async function buildEntityInventory(pool: Pool, tenantId: number, childTenantIds?: number[]) {
  const allTenantIds = childTenantIds ? [tenantId, ...childTenantIds] : [tenantId];
  const placeholders = allTenantIds.map((_, i) => `$${i + 1}`).join(",");

  const evtResult = await pool.query(
    `SELECT id, tenant_id, event_type, severity, threat, target, attacker, asset, 
            sender, recipient, action, mitre_tactic, log_source, risk_score, 
            raw_payload, occurred_at
     FROM security_events WHERE tenant_id IN (${placeholders})`,
    allTenantIds
  );

  const hosts = new Map<string, HostEntity>();
  const users = new Map<string, UserEntity>();
  const emails = new Map<string, EmailEntity>();
  const deviceUserLinks = new Map<string, Set<string>>();
  const userEmailLinks = new Map<string, Set<string>>();
  const userDeviceLinks = new Map<string, Set<string>>();

  const getOrCreateHost = (name: string): HostEntity => {
    const key = name.toLowerCase().trim();
    if (!hosts.has(key)) {
      hosts.set(key, {
        name, type: "Workstation", os: [], ips: new Set(), groups: new Set(),
        eventCount: 0, incidentCount: 0, criticalCount: 0, highCount: 0,
        mediumCount: 0, lowCount: 0, eventTypes: new Set(), sources: new Set(),
        mitreTactics: new Set(), riskScore: 0, firstSeen: null, lastSeen: null,
        linkedUsers: new Set(), linkedEmails: new Set(), memoryMB: 0, cpuCores: 0,
      });
    }
    return hosts.get(key)!;
  };

  const getOrCreateUser = (name: string): UserEntity => {
    const key = name.toLowerCase().trim();
    if (!users.has(key)) {
      users.set(key, {
        name, displayName: name, emails: new Set(), department: "", title: "",
        devices: new Set(), ips: new Set(), eventCount: 0, incidentCount: 0,
        criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0,
        eventTypes: new Set(), sources: new Set(), riskScore: 0, riskLevel: "low",
        firstSeen: null, lastSeen: null,
        webActivity: { totalRequests: 0, allowedRequests: 0, deniedRequests: 0, isolatedRequests: 0, sitesVisited: 0, totalBytesMB: 0, topSites: [], urlCategories: [], applicationNames: [] },
        cloudActivity: { services: new Set(), activityCount: 0, uploads: 0, downloads: 0 },
        emailActivity: { sentCount: 0, receivedCount: 0, threatsReceived: 0, quarantinedCount: 0 },
      });
    }
    return users.get(key)!;
  };

  const getOrCreateEmail = (address: string): EmailEntity => {
    const key = address.toLowerCase().trim();
    if (!emails.has(key)) {
      const domain = key.split("@")[1] || "";
      emails.set(key, {
        address: key, domain, isInternal: false, displayName: key.split("@")[0],
        linkedUser: "", sentCount: 0, receivedCount: 0, threatsSent: 0,
        threatsReceived: 0, quarantinedCount: 0, deliveredCount: 0,
        phishingCount: 0, malwareCount: 0, spamCount: 0, becCount: 0, authFailCount: 0,
        spfResults: { pass: 0, fail: 0, neutral: 0 },
        dkimResults: { pass: 0, fail: 0, neutral: 0 },
        dmarcResults: { pass: 0, fail: 0, neutral: 0 },
        firstSeen: null, lastSeen: null, sources: new Set(),
        linkedDevices: new Set(), linkedUsers: new Set(),
        threatTypes: new Map(), riskScore: 0, riskLevel: "low", subjects: [],
      });
    }
    return emails.get(key)!;
  };

  const addSeverity = (entity: { criticalCount: number; highCount: number; mediumCount: number; lowCount: number }, severity: string) => {
    if (severity === "critical") entity.criticalCount++;
    else if (severity === "high") entity.highCount++;
    else if (severity === "medium") entity.mediumCount++;
    else entity.lowCount++;
  };

  const linkDeviceUser = (device: string, user: string) => {
    const dk = device.toLowerCase().trim();
    const uk = user.toLowerCase().trim();
    if (!dk || !uk) return;
    if (!deviceUserLinks.has(dk)) deviceUserLinks.set(dk, new Set());
    deviceUserLinks.get(dk)!.add(uk);
    if (!userDeviceLinks.has(uk)) userDeviceLinks.set(uk, new Set());
    userDeviceLinks.get(uk)!.add(dk);
  };

  const linkUserEmail = (user: string, email: string) => {
    const uk = user.toLowerCase().trim();
    const ek = email.toLowerCase().trim();
    if (!uk || !ek) return;
    if (!userEmailLinks.has(uk)) userEmailLinks.set(uk, new Set());
    userEmailLinks.get(uk)!.add(ek);
  };

  for (const evt of evtResult.rows) {
    const payload = (evt.raw_payload && typeof evt.raw_payload === "object") ? evt.raw_payload : {};
    const eventType = evt.event_type;
    const severity = evt.severity || "low";
    const occurredAt = evt.occurred_at ? new Date(evt.occurred_at) : null;
    const source = payload.source || payload.dataType || evt.log_source || eventType;

    if (eventType === "endpoint" || eventType === "network" || eventType === "identity") {
      const hostNames: string[] = [];
      const domainUserPairs: { hostname: string; username: string }[] = [];

      const handleDomainBackslashValue = (val: string) => {
        if (val.includes("\\")) {
          const parts = val.split("\\");
          const domainPart = parts[0].trim();
          const userPart = parts[parts.length - 1].trim();
          if (domainPart && isHostname(domainPart)) {
            if (!hostNames.some(existing => existing.toLowerCase() === domainPart.toLowerCase())) {
              hostNames.push(domainPart);
            }
            if (userPart && userPart.length >= 2) {
              domainUserPairs.push({ hostname: domainPart, username: userPart });
            }
          }
          return true;
        }
        return false;
      };

      if (evt.asset) {
        if (!handleDomainBackslashValue(evt.asset) && isHostname(evt.asset)) {
          hostNames.push(evt.asset);
        }
      }
      if (evt.target && evt.target !== evt.asset) {
        if (!handleDomainBackslashValue(evt.target) && isHostname(evt.target)) {
          hostNames.push(evt.target);
        }
      }

      const payloadHostResult = extractHostFieldsWithDomainUsers(payload);
      for (const h of payloadHostResult.hosts) {
        if (!hostNames.some(existing => existing.toLowerCase() === h.toLowerCase())) hostNames.push(h);
      }
      for (const du of payloadHostResult.domainUsers) {
        domainUserPairs.push(du);
      }

      const extractedIps = extractIPFields(payload);
      const userResult = extractUserFieldsWithDomainUsers(payload);
      const extractedUsers = userResult.users;
      for (const du of userResult.domainUsers) {
        if (!domainUserPairs.some(p => p.hostname.toLowerCase() === du.hostname.toLowerCase() && p.username.toLowerCase() === du.username.toLowerCase())) {
          domainUserPairs.push(du);
        }
        if (!hostNames.some(h => h.toLowerCase() === du.hostname.toLowerCase())) {
          hostNames.push(du.hostname);
        }
      }
      const os = extractOSField(payload);
      const group = extractGroupField(payload);
      const mem = payload["Memory"] ? parseInt(payload["Memory"]) : 0;
      const cpu = payload["CPU"] || payload["Processors"] ? parseInt(payload["CPU"] || payload["Processors"]) : 0;

      for (const hostName of hostNames) {
        if (!isHostname(hostName)) continue;
        const host = getOrCreateHost(hostName);
        host.eventCount++;
        addSeverity(host, severity);
        host.eventTypes.add(eventType);
        host.sources.add(source);
        if (evt.mitre_tactic) host.mitreTactics.add(evt.mitre_tactic.split(",")[0]?.trim());
        if (evt.risk_score && evt.risk_score > host.riskScore) host.riskScore = evt.risk_score;
        updateTimestamps(host, occurredAt);
        for (const ip of extractedIps) host.ips.add(ip);
        if (os && !host.os.includes(os)) host.os.push(os);
        if (group) host.groups.add(group);
        if (mem > host.memoryMB) host.memoryMB = mem;
        if (cpu > host.cpuCores) host.cpuCores = cpu;

        for (const userName of extractedUsers) {
          linkDeviceUser(hostName, userName);
          host.linkedUsers.add(userName.toLowerCase());
          const user = getOrCreateUser(userName);
          user.devices.add(hostName.toLowerCase());
          user.eventCount++;
          addSeverity(user, severity);
          user.eventTypes.add(eventType);
          user.sources.add(source);
          updateTimestamps(user, occurredAt);
        }
      }

      for (const du of domainUserPairs) {
        const hostName = du.hostname;
        const userName = du.username;
        if (!extractedUsers.some(u => u.toLowerCase() === userName.toLowerCase())) {
          const host = getOrCreateHost(hostName);
          linkDeviceUser(hostName, userName);
          host.linkedUsers.add(userName.toLowerCase());
          const user = getOrCreateUser(userName);
          user.devices.add(hostName.toLowerCase());
          user.eventCount++;
          addSeverity(user, severity);
          user.eventTypes.add(eventType);
          user.sources.add(source);
          updateTimestamps(user, occurredAt);
        }
      }

      if (hostNames.length === 0 && extractedUsers.length > 0) {
        for (const userName of extractedUsers) {
          const user = getOrCreateUser(userName);
          user.eventCount++;
          addSeverity(user, severity);
          user.eventTypes.add(eventType);
          user.sources.add(source);
          updateTimestamps(user, occurredAt);
        }
      }
    }

    if (eventType === "email") {
      const emailData = extractEmailFields(payload);
      const senderAddr = (evt.sender || "").trim().toLowerCase();
      const recipientStr = (evt.recipient || "").trim().toLowerCase();
      const threatType = payload.emailThreatType || payload.threatType || "Clean";
      const isThreat = threatType !== "Clean" && threatType !== "Graymail";
      const isQuarantined = payload.quarantined === true || payload.quarantined === "true" ||
                           payload.effectiveAction === "quarantined" || payload.effectiveAction === "blocked";

      if (senderAddr && isEmailAddress(senderAddr)) {
        const emailEnt = getOrCreateEmail(senderAddr);
        emailEnt.sentCount++;
        if (isThreat) {
          emailEnt.threatsSent++;
          emailEnt.threatTypes.set(threatType, (emailEnt.threatTypes.get(threatType) || 0) + 1);
          if (threatType === "Phishing") emailEnt.phishingCount++;
          else if (threatType === "Malware") emailEnt.malwareCount++;
          else if (threatType === "Spam") emailEnt.spamCount++;
          else if (threatType === "BEC") emailEnt.becCount++;
        }
        if (isQuarantined) emailEnt.quarantinedCount++;
        else emailEnt.deliveredCount++;
        emailEnt.sources.add(source);
        updateTimestamps(emailEnt, occurredAt);

        const spf = (payload.spfResult || "").toLowerCase();
        if (spf === "pass") emailEnt.spfResults.pass++;
        else if (spf === "fail" || spf === "softfail") emailEnt.spfResults.fail++;
        else emailEnt.spfResults.neutral++;

        const dkim = (payload.dkimResult || "").toLowerCase();
        if (dkim === "pass") emailEnt.dkimResults.pass++;
        else if (dkim === "fail") emailEnt.dkimResults.fail++;
        else emailEnt.dkimResults.neutral++;

        const dmarc = (payload.dmarcResult || "").toLowerCase();
        if (dmarc === "pass") emailEnt.dmarcResults.pass++;
        else if (dmarc === "fail") emailEnt.dmarcResults.fail++;
        else emailEnt.dmarcResults.neutral++;

        if (payload.subject && emailEnt.subjects.length < 10) {
          emailEnt.subjects.push(String(payload.subject).substring(0, 150));
        }

        const senderUser = senderAddr.split("@")[0];
        linkUserEmail(senderUser, senderAddr);
      }

      const recipientAddrs = recipientStr.split(/[,;]/).map((r: string) => r.trim()).filter(isEmailAddress);
      for (const recipAddr of recipientAddrs) {
        const recipEmail = getOrCreateEmail(recipAddr);
        recipEmail.receivedCount++;
        if (isThreat) recipEmail.threatsReceived++;
        if (isQuarantined) recipEmail.quarantinedCount++;
        recipEmail.sources.add(source);
        updateTimestamps(recipEmail, occurredAt);

        const recipUser = recipAddr.split("@")[0];
        linkUserEmail(recipUser, recipAddr);
      }
    }

    if (eventType === "sse") {
      const userName = payload.userName || payload.user_name || payload.username;
      if (userName && typeof userName === "string" && userName.length >= 2) {
        const user = getOrCreateUser(userName);
        user.eventCount++;
        addSeverity(user, severity);
        user.eventTypes.add(eventType);
        user.sources.add(source);
        updateTimestamps(user, occurredAt);

        const sourceIps = payload.sourceIp || payload.source_ip || "";
        for (const ip of String(sourceIps).split(/[,\s]+/)) {
          if (isIPAddress(ip.trim())) user.ips.add(ip.trim());
        }

        const dataType = payload.dataType || "";
        if (dataType === "cloud_activity") {
          const svcName = payload.serviceName || "";
          if (svcName) user.cloudActivity.services.add(svcName);
          user.cloudActivity.activityCount += (payload.activityCount || 0);
          if (payload.activityType === "upload") user.cloudActivity.uploads += (payload.activityCount || 0);
          if (payload.activityType === "download") user.cloudActivity.downloads += (payload.activityCount || 0);
        } else if (dataType === "web_user_activity") {
          user.webActivity.totalRequests += (payload.totalRequests || 0);
          user.webActivity.allowedRequests += (payload.allowedRequests || 0);
          user.webActivity.deniedRequests += (payload.deniedRequests || 0);
          user.webActivity.isolatedRequests += (payload.isolatedRequests || 0);
          user.webActivity.sitesVisited += (payload.siteCount || payload.sitesVisited || 0);
          user.webActivity.totalBytesMB += (payload.totalBytesMB || 0);
          if (payload.topSites && Array.isArray(payload.topSites)) {
            user.webActivity.topSites.push(...payload.topSites.slice(0, 10));
          }
          if (payload.urlCategories) {
            const cats = String(payload.urlCategories).split(",").map((c: string) => c.trim()).filter(Boolean);
            for (const c of cats) {
              if (!user.webActivity.urlCategories.includes(c)) user.webActivity.urlCategories.push(c);
            }
          }
          if (payload.applicationNames) {
            const apps = String(payload.applicationNames).split(",").map((a: string) => a.trim()).filter(Boolean);
            for (const a of apps) {
              if (!user.webActivity.applicationNames.includes(a)) user.webActivity.applicationNames.push(a);
            }
          }
        }
      }
    }
  }

  const userAssetsResult = await pool.query(
    `SELECT * FROM user_assets WHERE tenant_id IN (${placeholders})`,
    allTenantIds
  );
  for (const ua of userAssetsResult.rows) {
    const userName = ua.user_name?.toLowerCase()?.trim();
    if (!userName) continue;
    const user = getOrCreateUser(ua.user_name);
    if (ua.email) {
      user.emails.add(ua.email.toLowerCase());
      linkUserEmail(userName, ua.email.toLowerCase());
    }
    if (ua.department) user.department = ua.department;
    if (ua.title) user.title = ua.title;
    if (ua.risk_score && ua.risk_score > user.riskScore) user.riskScore = ua.risk_score;
    if (ua.risk_level) user.riskLevel = ua.risk_level;
    user.sources.add(ua.source || "import");
    if (ua.last_activity) updateTimestamps(user, new Date(ua.last_activity));
    if (ua.linked_asset_ids && Array.isArray(ua.linked_asset_ids)) {
      for (const assetId of ua.linked_asset_ids) {
        if (typeof assetId === "string") {
          user.devices.add(assetId.toLowerCase());
          linkDeviceUser(assetId, userName);
        }
      }
    }
  }

  const inventoryResult = await pool.query(
    `SELECT * FROM assets WHERE tenant_id IN (${placeholders})`,
    allTenantIds
  );
  for (const inv of inventoryResult.rows) {
    const hostName = inv.hostname?.trim();
    if (!hostName || !isHostname(hostName)) continue;
    const host = getOrCreateHost(hostName);
    if (inv.ip_address) host.ips.add(inv.ip_address);
    if (inv.ipv6_address) host.ips.add(inv.ipv6_address);
    if (inv.endpoint_group) host.groups.add(inv.endpoint_group);
    if (inv.operating_system && !host.os.includes(inv.operating_system)) host.os.push(inv.operating_system);
    if (inv.endpoint_type) host.type = inv.endpoint_type === "Server" ? "Server" : "Workstation";
    if (inv.last_seen) updateTimestamps(host, new Date(inv.last_seen));
    if (inv.prevention_policy) host.sources.add(inv.prevention_policy);
    if (inv.risk_score && inv.risk_score > host.riskScore) host.riskScore = inv.risk_score;
  }

  const incidentResult = await pool.query(
    `SELECT id, severity, title, category, source, affected_assets, created_at, source_ip, destination_ip
     FROM incidents WHERE tenant_id IN (${placeholders})`,
    allTenantIds
  );
  for (const inc of incidentResult.rows) {
    if (inc.affected_assets) {
      for (const assetName of inc.affected_assets.split(",")) {
        const name = assetName.trim();
        if (!name) continue;
        if (isHostname(name) && hosts.has(name.toLowerCase())) {
          const host = hosts.get(name.toLowerCase())!;
          host.incidentCount++;
          addSeverity(host, inc.severity);
        }
      }
    }
  }

  const internalDomains = new Set<string>();
  const recipientDomainCounts = new Map<string, number>();
  for (const [, emailEnt] of Array.from(emails.entries())) {
    if (emailEnt.receivedCount > 0) {
      recipientDomainCounts.set(emailEnt.domain, (recipientDomainCounts.get(emailEnt.domain) || 0) + emailEnt.receivedCount);
    }
  }
  const sortedDomains = Array.from(recipientDomainCounts.entries()).sort((a, b) => b[1] - a[1]);
  for (const [domain] of sortedDomains.slice(0, 5)) {
    internalDomains.add(domain);
  }
  for (const [, emailEnt] of Array.from(emails.entries())) {
    if (internalDomains.has(emailEnt.domain)) emailEnt.isInternal = true;
  }

  for (const [hostKey, host] of Array.from(hosts.entries())) {
    host.type = classifyDeviceType(host.name, host.groups, host.os[0]);
    const linkedUserSet = deviceUserLinks.get(hostKey);
    if (linkedUserSet) {
      for (const uk of Array.from(linkedUserSet)) {
        host.linkedUsers.add(uk);
        const userEmails = userEmailLinks.get(uk);
        if (userEmails) {
          for (const email of Array.from(userEmails)) host.linkedEmails.add(email);
        }
      }
    }
  }

  for (const [userKey, user] of Array.from(users.entries())) {
    const linkedDeviceSet = userDeviceLinks.get(userKey);
    if (linkedDeviceSet) {
      for (const dk of Array.from(linkedDeviceSet)) user.devices.add(dk);
    }
    const linkedEmailSet = userEmailLinks.get(userKey);
    if (linkedEmailSet) {
      for (const ek of Array.from(linkedEmailSet)) user.emails.add(ek);
    }
    user.riskLevel = calculateRiskLevel(user.criticalCount, user.highCount, user.mediumCount);
  }

  for (const [emailKey, emailEnt] of Array.from(emails.entries())) {
    const userName = emailKey.split("@")[0];
    if (users.has(userName)) {
      emailEnt.linkedUser = userName;
      emailEnt.linkedUsers.add(userName);
      const user = users.get(userName)!;
      for (const dk of Array.from(user.devices)) emailEnt.linkedDevices.add(dk);
    }
    for (const [uk, emailSet] of Array.from(userEmailLinks.entries())) {
      if (emailSet.has(emailKey)) {
        emailEnt.linkedUsers.add(uk);
        const user = users.get(uk);
        if (user) {
          for (const dk of Array.from(user.devices)) emailEnt.linkedDevices.add(dk);
        }
      }
    }

    const total = emailEnt.sentCount || 1;
    const threatRatio = (emailEnt.threatsSent + emailEnt.threatsReceived) / total;
    let score = 100;
    score -= threatRatio * 40;
    score -= (emailEnt.spfResults.fail / total) * 15;
    score -= (emailEnt.dkimResults.fail / total) * 10;
    score -= (emailEnt.dmarcResults.fail / total) * 15;
    score -= ((emailEnt.phishingCount + emailEnt.malwareCount + emailEnt.becCount) / total) * 20;
    const healthScore = Math.max(0, Math.min(100, Math.round(score)));
    emailEnt.riskScore = 100 - healthScore;
    emailEnt.riskLevel = emailEnt.riskScore >= 81 ? "severe" : emailEnt.riskScore >= 61 ? "critical" : emailEnt.riskScore >= 41 ? "high" : emailEnt.riskScore >= 21 ? "moderate" : "low";
  }

  return {
    hosts: serializeHosts(hosts),
    users: serializeUsers(users),
    emails: serializeEmails(emails),
    summary: {
      totalHosts: hosts.size,
      totalUsers: users.size,
      totalEmails: emails.size,
      internalDomains: Array.from(internalDomains),
      hostsByType: {
        server: Array.from(hosts.values()).filter(h => h.type === "Server").length,
        workstation: Array.from(hosts.values()).filter(h => h.type === "Workstation").length,
      },
      hostsByRisk: {
        critical: Array.from(hosts.values()).filter(h => calculateRiskLevel(h.criticalCount, h.highCount, h.mediumCount) === "critical").length,
        high: Array.from(hosts.values()).filter(h => calculateRiskLevel(h.criticalCount, h.highCount, h.mediumCount) === "high").length,
        medium: Array.from(hosts.values()).filter(h => calculateRiskLevel(h.criticalCount, h.highCount, h.mediumCount) === "medium").length,
        low: Array.from(hosts.values()).filter(h => calculateRiskLevel(h.criticalCount, h.highCount, h.mediumCount) === "low").length,
      },
      usersByRisk: {
        critical: Array.from(users.values()).filter(u => u.riskLevel === "critical").length,
        high: Array.from(users.values()).filter(u => u.riskLevel === "high").length,
        medium: Array.from(users.values()).filter(u => u.riskLevel === "medium").length,
        low: Array.from(users.values()).filter(u => u.riskLevel === "low").length,
      },
      emailsByRisk: {
        severe: Array.from(emails.values()).filter(e => e.riskLevel === "severe").length,
        critical: Array.from(emails.values()).filter(e => e.riskLevel === "critical").length,
        high: Array.from(emails.values()).filter(e => e.riskLevel === "high").length,
        moderate: Array.from(emails.values()).filter(e => e.riskLevel === "moderate").length,
        low: Array.from(emails.values()).filter(e => e.riskLevel === "low").length,
      },
    },
  };
}

function serializeHosts(hosts: Map<string, HostEntity>) {
  return Array.from(hosts.values()).map(h => ({
    name: h.name,
    type: h.type,
    os: h.os,
    ips: Array.from(h.ips),
    groups: Array.from(h.groups),
    eventCount: h.eventCount,
    incidentCount: h.incidentCount,
    totalEvents: h.eventCount + h.incidentCount,
    criticalCount: h.criticalCount,
    highCount: h.highCount,
    mediumCount: h.mediumCount,
    lowCount: h.lowCount,
    riskLevel: calculateRiskLevel(h.criticalCount, h.highCount, h.mediumCount),
    riskScore: h.riskScore,
    eventTypes: Array.from(h.eventTypes),
    sources: Array.from(h.sources),
    mitreTactics: Array.from(h.mitreTactics),
    firstSeen: h.firstSeen,
    lastSeen: h.lastSeen,
    linkedUsers: Array.from(h.linkedUsers),
    linkedEmails: Array.from(h.linkedEmails),
    memoryMB: h.memoryMB,
    cpuCores: h.cpuCores,
  })).sort((a, b) => b.totalEvents - a.totalEvents);
}

function serializeUsers(users: Map<string, UserEntity>) {
  return Array.from(users.values()).map(u => ({
    name: u.name,
    displayName: u.displayName,
    emails: Array.from(u.emails),
    department: u.department,
    title: u.title,
    devices: Array.from(u.devices),
    ips: Array.from(u.ips),
    eventCount: u.eventCount,
    incidentCount: u.incidentCount,
    totalEvents: u.eventCount + u.incidentCount,
    criticalCount: u.criticalCount,
    highCount: u.highCount,
    mediumCount: u.mediumCount,
    lowCount: u.lowCount,
    riskLevel: u.riskLevel,
    riskScore: u.riskScore,
    eventTypes: Array.from(u.eventTypes),
    sources: Array.from(u.sources),
    firstSeen: u.firstSeen,
    lastSeen: u.lastSeen,
    webActivity: {
      ...u.webActivity,
      topSites: u.webActivity.topSites.slice(0, 10),
    },
    cloudActivity: {
      services: Array.from(u.cloudActivity.services),
      activityCount: u.cloudActivity.activityCount,
      uploads: u.cloudActivity.uploads,
      downloads: u.cloudActivity.downloads,
    },
    emailActivity: u.emailActivity,
  })).sort((a, b) => b.totalEvents - a.totalEvents);
}

function serializeEmails(emails: Map<string, EmailEntity>) {
  return Array.from(emails.values()).map(e => ({
    address: e.address,
    domain: e.domain,
    isInternal: e.isInternal,
    displayName: e.displayName,
    linkedUser: e.linkedUser,
    sentCount: e.sentCount,
    receivedCount: e.receivedCount,
    totalEmails: e.sentCount + e.receivedCount,
    threatsSent: e.threatsSent,
    threatsReceived: e.threatsReceived,
    quarantinedCount: e.quarantinedCount,
    deliveredCount: e.deliveredCount,
    phishingCount: e.phishingCount,
    malwareCount: e.malwareCount,
    spamCount: e.spamCount,
    becCount: e.becCount,
    authFailCount: e.authFailCount,
    spfResults: e.spfResults,
    dkimResults: e.dkimResults,
    dmarcResults: e.dmarcResults,
    firstSeen: e.firstSeen,
    lastSeen: e.lastSeen,
    sources: Array.from(e.sources),
    linkedDevices: Array.from(e.linkedDevices),
    linkedUsers: Array.from(e.linkedUsers),
    threatTypes: Array.from(e.threatTypes.entries()).map(([k, v]) => ({ name: k, count: v })),
    riskScore: e.riskScore,
    riskLevel: e.riskLevel,
    subjects: e.subjects,
  })).sort((a, b) => b.totalEmails - a.totalEmails);
}

export async function getEntityProfile(pool: Pool, tenantId: number, entityType: string, entityName: string, childTenantIds?: number[]) {
  const allTenantIds = childTenantIds ? [tenantId, ...childTenantIds] : [tenantId];
  const placeholders = allTenantIds.map((_, i) => `$${i + 1}`).join(",");
  const nameParam = `$${allTenantIds.length + 1}`;
  const nameLower = entityName.toLowerCase().trim();

  let events: any[] = [];
  let incidents: any[] = [];

  if (entityType === "host") {
    const evtRes = await pool.query(
      `SELECT * FROM security_events 
       WHERE tenant_id IN (${placeholders}) 
       AND (LOWER(asset) = ${nameParam} OR LOWER(target) = ${nameParam})
       ORDER BY occurred_at DESC LIMIT 200`,
      [...allTenantIds, nameLower]
    );
    events = evtRes.rows;

    const incRes = await pool.query(
      `SELECT * FROM incidents 
       WHERE tenant_id IN (${placeholders}) 
       AND (LOWER(affected_assets) LIKE '%' || ${nameParam} || '%' OR LOWER(source) = ${nameParam})
       ORDER BY created_at DESC LIMIT 50`,
      [...allTenantIds, nameLower]
    );
    incidents = incRes.rows;
  } else if (entityType === "user") {
    const evtRes = await pool.query(
      `SELECT * FROM security_events 
       WHERE tenant_id IN (${placeholders}) 
       AND (raw_payload->>'userName' ILIKE ${nameParam} 
            OR raw_payload->>'user_name' ILIKE ${nameParam}
            OR LOWER(sender) LIKE '%' || ${nameParam} || '%'
            OR LOWER(recipient) LIKE '%' || ${nameParam} || '%')
       ORDER BY occurred_at DESC LIMIT 200`,
      [...allTenantIds, nameLower]
    );
    events = evtRes.rows;
  } else if (entityType === "email") {
    const evtRes = await pool.query(
      `SELECT * FROM security_events 
       WHERE tenant_id IN (${placeholders}) 
       AND (LOWER(sender) = ${nameParam} OR LOWER(recipient) LIKE '%' || ${nameParam} || '%')
       ORDER BY occurred_at DESC LIMIT 200`,
      [...allTenantIds, nameLower]
    );
    events = evtRes.rows;
  } else if (entityType === "application") {
    const evtRes = await pool.query(
      `SELECT * FROM security_events 
       WHERE tenant_id IN (${placeholders}) 
       AND (
         raw_payload->>'applicationName' ILIKE ${nameParam}
         OR raw_payload->>'applicationNames' ILIKE '%' || ${nameParam} || '%'
         OR raw_payload->>'service' ILIKE ${nameParam}
         OR raw_payload->>'Service Name' ILIKE ${nameParam}
         OR raw_payload->>'app_name' ILIKE ${nameParam}
         OR raw_payload->>'Application' ILIKE ${nameParam}
         OR raw_payload->>'Cloud Provider' ILIKE ${nameParam}
       )
       ORDER BY occurred_at DESC LIMIT 200`,
      [...allTenantIds, nameLower]
    );
    events = evtRes.rows;
  }

  const severityDist: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const eventTypeDist: Record<string, number> = {};
  const timeline: { date: string; count: number }[] = [];
  const timelineMap = new Map<string, number>();

  for (const evt of events) {
    severityDist[evt.severity] = (severityDist[evt.severity] || 0) + 1;
    const et = evt.event_type || "unknown";
    eventTypeDist[et] = (eventTypeDist[et] || 0) + 1;
    if (evt.occurred_at) {
      const day = new Date(evt.occurred_at).toISOString().split("T")[0];
      timelineMap.set(day, (timelineMap.get(day) || 0) + 1);
    }
  }
  for (const [date, count] of Array.from(timelineMap.entries()).sort()) {
    timeline.push({ date, count });
  }

  const userMap = new Map<string, number>();
  if (entityType === "application") {
    for (const evt of events) {
      const payload = evt.raw_payload || {};
      const uFields = extractUserFields(payload);
      const emailFields = extractEmailFields(payload);
      const allUsers = [...uFields, ...emailFields.senders, ...emailFields.recipients];
      for (const u of allUsers) {
        if (u && u.length > 1) userMap.set(u, (userMap.get(u) || 0) + 1);
      }
    }
  }

  return {
    entityType,
    entityName,
    events: events.slice(0, 100).map(e => ({
      id: e.id,
      eventType: e.event_type,
      severity: e.severity,
      threat: e.threat,
      description: e.description,
      action: e.action,
      mitreTactic: e.mitre_tactic,
      mitreTechnique: e.mitre_technique,
      occurredAt: e.occurred_at,
      rawPayload: e.raw_payload,
    })),
    incidents: incidents.map(i => ({
      id: i.id,
      title: i.title,
      severity: i.severity,
      status: i.status,
      category: i.category,
      createdAt: i.created_at,
    })),
    analytics: {
      totalEvents: events.length,
      totalIncidents: incidents.length,
      severityDistribution: severityDist,
      eventTypeDistribution: eventTypeDist,
      timeline,
      ...(entityType === "application" ? {
        activeUsers: Array.from(userMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 50)
          .map(([user, count]) => ({ user, eventCount: count })),
      } : {}),
    },
  };
}

export async function getApplicationProfile(pool: Pool, tenantId: number, appName: string, childTenantIds?: number[]) {
  const allTenantIds = childTenantIds ? [tenantId, ...childTenantIds] : [tenantId];
  const placeholders = allTenantIds.map((_, i) => `$${i + 1}`).join(",");
  const nameParam = `$${allTenantIds.length + 1}`;
  const appNameLower = appName.toLowerCase().trim();

  const evtRes = await pool.query(
    `SELECT event_type, severity, action, occurred_at, sender, recipient,
            raw_payload->>'userName' as user_name,
            raw_payload->>'user_name' as user_name2,
            raw_payload->>'applicationName' as app_name_field,
            raw_payload->>'service' as service_field,
            raw_payload->>'Service Name' as service_name_field,
            raw_payload->>'Upload (Bytes)' as upload_bytes,
            raw_payload->>'Download (Bytes)' as download_bytes,
            raw_payload->>'category' as category_field,
            raw_payload->>'Cloud Provider' as cloud_provider,
            log_source, source_type
     FROM security_events 
     WHERE tenant_id IN (${placeholders}) 
     AND (
       raw_payload->>'applicationName' ILIKE ${nameParam}
       OR raw_payload->>'applicationNames' ILIKE '%' || ${nameParam} || '%'
       OR raw_payload->>'service' ILIKE ${nameParam}
       OR raw_payload->>'Service Name' ILIKE ${nameParam}
       OR raw_payload->>'app_name' ILIKE ${nameParam}
       OR raw_payload->>'Application' ILIKE ${nameParam}
       OR raw_payload->>'Cloud Provider' ILIKE ${nameParam}
     )
     ORDER BY occurred_at DESC LIMIT 500`,
    [...allTenantIds, appNameLower]
  );
  const events = evtRes.rows;

  const users = new Map<string, number>();
  const eventTypes = new Map<string, number>();
  const sources = new Set<string>();
  const categories = new Set<string>();
  let totalUploads = 0;
  let totalDownloads = 0;
  const severityDist: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const timelineMap = new Map<string, number>();
  const actionDist: Record<string, number> = {};
  let firstSeen: Date | null = null;
  let lastSeen: Date | null = null;

  for (const evt of events) {
    const userName = evt.user_name || evt.user_name2 || evt.sender || "";
    if (userName && userName.length > 1) {
      users.set(userName, (users.get(userName) || 0) + 1);
    }
    const et = evt.event_type || "unknown";
    eventTypes.set(et, (eventTypes.get(et) || 0) + 1);
    if (evt.log_source) sources.add(evt.log_source);
    if (evt.category_field) categories.add(evt.category_field);
    if (evt.upload_bytes) totalUploads += parseInt(evt.upload_bytes) || 0;
    if (evt.download_bytes) totalDownloads += parseInt(evt.download_bytes) || 0;
    if (evt.severity) severityDist[evt.severity] = (severityDist[evt.severity] || 0) + 1;
    if (evt.action) actionDist[evt.action] = (actionDist[evt.action] || 0) + 1;
    if (evt.occurred_at) {
      const d = new Date(evt.occurred_at);
      if (!firstSeen || d < firstSeen) firstSeen = d;
      if (!lastSeen || d > lastSeen) lastSeen = d;
      const day = d.toISOString().split("T")[0];
      timelineMap.set(day, (timelineMap.get(day) || 0) + 1);
    }
  }

  const timeline = Array.from(timelineMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  let cloudRiskData: any = null;
  try {
    const riskRes = await pool.query(
      `SELECT * FROM cloud_app_risk_scores WHERE tenant_id IN (${placeholders}) AND LOWER(app_name) = ${nameParam} LIMIT 1`,
      [...allTenantIds, appNameLower]
    );
    if (riskRes.rows.length > 0) {
      const r = riskRes.rows[0];
      cloudRiskData = {
        confidenceIndex: r.confidence_index,
        riskClassification: r.risk_classification,
        serviceCategory: r.service_category,
        source: r.source,
        factorScores: r.factor_scores,
      };
    }
  } catch {}

  return {
    appName,
    totalEvents: events.length,
    uniqueUsers: users.size,
    categories: Array.from(categories),
    sources: Array.from(sources),
    totalUploadsMB: Math.round(totalUploads / (1024 * 1024) * 100) / 100,
    totalDownloadsMB: Math.round(totalDownloads / (1024 * 1024) * 100) / 100,
    firstSeen,
    lastSeen,
    severityDistribution: severityDist,
    eventTypeDistribution: Object.fromEntries(eventTypes),
    actionDistribution: actionDist,
    timeline,
    cloudRiskData,
    topUsers: Array.from(users.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([user, count]) => ({ user, eventCount: count })),
    recentEvents: events.slice(0, 50).map(e => ({
      eventType: e.event_type,
      severity: e.severity,
      action: e.action,
      timestamp: e.occurred_at,
      user: e.user_name || e.user_name2 || e.sender || "",
      source: e.log_source || e.source_type || "",
    })),
  };
}

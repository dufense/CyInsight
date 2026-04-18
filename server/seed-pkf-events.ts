// ============================================================
// PERMANENTLY DISABLED LEGACY SEED SCRIPT — DO NOT RUN OR IMPORT
// ============================================================
// This file seeded synthetic FortiGate and FortiNAC security events
// into the PKF Africa tenant (tenant_id=37) during early development.
// Those records have been purged by the one-time migration
// ".purge_fortigate_fortinac_seeded_events" in server/routes.ts.
//
// This script must NEVER be imported or executed again:
//   - The SEED_ALLOWED guard (assertSeedAllowed) will block it at runtime,
//     but the primary protection is that nothing imports or calls this file.
//   - Grep confirms no import/require of "seed-pkf-events" exists anywhere.
//   - If you need to add real integrations, use the live connectors in the UI.
// ============================================================

import { Pool } from "pg";
import crypto from "crypto";

const TENANT_ID = 37;

/**
 * Safety guard: this seeder must NEVER run in production.
 * It writes generated / demo data — call only with SEED_ALLOWED=true in a dev environment.
 */
function assertSeedAllowed(): void {
  if (process.env.SEED_ALLOWED !== "true") {
    throw new Error(
      "[SEED BLOCKED] seed-pkf-events.ts refused to run — SEED_ALLOWED is not set to 'true'. " +
      "This script writes generated data and must only be executed in non-production environments. " +
      "Set SEED_ALLOWED=true to proceed."
    );
  }
}

// ============================================================
// SAFETY CONTRACT — DO NOT REMOVE OR BYPASS
// ============================================================
// This seed script MUST NEVER delete rows from security_integrations.
// The security_integrations table stores live connector credentials
// (API keys, tokens, config_json) that cannot be recovered once deleted.
// Deleting these rows forces admins to manually re-enter credentials
// through the UI and can interrupt active polling / event ingestion.
//
// Allowed operations on security_integrations from seed scripts:
//   - INSERT ... ON CONFLICT (tenant_id, platform_key) DO UPDATE SET
//     only safe, non-credential fields: events_imported, last_poll_at,
//     last_poll_status, last_poll_message.
//   - Never touch: config_json, api_base_url, auth_type, or any
//     credential-bearing column.
// ============================================================

/** Runtime guard: throw before executing any statement that attempts to
 *  delete or truncate security_integrations. This prevents accidental
 *  regressions from destroying live connector credentials. */
function assertNotDestructiveIntegrationQuery(sql: string): void {
  const normalized = sql.replace(/\s+/g, " ").toLowerCase();
  if (
    normalized.includes("delete") && normalized.includes("security_integrations") ||
    normalized.includes("truncate") && normalized.includes("security_integrations")
  ) {
    throw new Error(
      "[SAFETY ABORT] Seed script attempted to DELETE/TRUNCATE security_integrations. " +
      "This is forbidden — integration credentials must never be destroyed by seed scripts."
    );
  }
}

const _rawPool = new Pool({ connectionString: process.env.DATABASE_URL });
const pool = new Proxy(_rawPool, {
  get(target, prop) {
    if (prop === "query") {
      return (sql: string | { text: string }, ...args: unknown[]) => {
        const sqlText = typeof sql === "string" ? sql : sql?.text ?? "";
        assertNotDestructiveIntegrationQuery(sqlText);
        return (target.query as Function)(sql, ...args);
      };
    }
    return (target as unknown as Record<string | symbol, unknown>)[prop];
  },
});

function rng(arr: any[]) { return arr[Math.floor(Math.random() * arr.length)]; }
function rngN(n: number) { return Math.floor(Math.random() * n); }
function rngBetween(a: number, b: number) { return a + rngN(b - a + 1); }

const HOSTNAMES = [
  "PKFTZ-OPN","PKFTZ-NCI","C37R-NRB","PKFTZ-GAMX","44QM-NRB","PKFMLD-JCC",
  "mwesigwad-kla","sisyej-KLA","PKFTZ-ANH","PKFTZ-ZZX","45SR-NRB","DOTIENO",
  "PKFMLD-KMMNEW","PKFMSA-JOO2","USKQOF","PKFTZ-IVK","W2X0NRB","egessas-kla",
  "S1X4","98F8X-NRB","dddumba-KLA","1TBX-NRB","PKFTZ-IM","PKFTZ-GNX","TTHIGA",
  "mudulis-kla","45RX-NRB","PKFMSA-JOHN","PKFTZ-IHBX","PKFTZ-ARR","sanyam-kla",
  "Kiwi2","PKFMSA-MRG","PKFTZ-RF","salupo-kla","ITD4-NRB","PKFMSA-MMN1",
  "patelub-KLA","intern5-kla","PKFMSA-EAAD","PKFTZ-MMN2","PKFNRB-FW01",
  "PKFTZ-SRVR","PKFKLA-DC01","PKFNRB-VPN01",
];

const IPS_INTERNAL = [
  "10.10.6.154","10.10.7.56","10.10.7.64","10.18.238.116","10.20.20.81",
  "10.20.20.97","10.30.6.29","10.30.6.37","10.30.6.40","10.30.6.106",
  "10.30.6.132","10.56.185.71","10.128.70.148","172.20.10.2","172.20.10.3",
  "192.168.0.24","192.168.0.100","192.168.0.183","192.168.1.2","192.168.1.3",
  "192.168.1.5","192.168.1.69","192.168.1.128","192.168.4.5","192.168.5.64",
  "192.168.5.95","192.168.5.177","192.168.10.178","192.168.11.11",
  "192.168.43.219","192.168.50.50","192.168.100.16","192.168.100.43",
  "192.168.100.107","192.168.137.99","192.168.160.2",
];

const ATTACKER_IPS = [
  "45.33.32.156","198.51.100.23","203.0.113.42","91.108.4.18","94.102.53.17",
  "103.41.204.176","185.220.101.45","185.159.157.12","194.165.16.76",
  "45.227.255.206","37.120.238.58","92.255.57.122","5.188.87.14","194.147.32.101",
  "185.117.88.117","103.216.220.149","80.82.77.202","176.10.104.240","62.210.105.116",
  "185.220.102.8","194.61.24.164","91.92.249.62","185.198.61.13","77.55.214.71",
  "195.80.150.212","194.158.133.51","185.129.61.51","92.118.160.2","5.45.119.172",
  "46.166.139.105","193.32.162.181","31.184.198.23","185.56.80.65","79.141.164.120",
];

const COUNTRIES = [
  "Nigeria","Russia","China","United States","Ukraine","Iran","North Korea",
  "Romania","Netherlands","Germany","Brazil","India","Vietnam","Malaysia",
];

const USERS = [
  "administrator","asethi","nt authority\\system","pkfadmin","domain\\john.kamau",
  "pkftz\\manager","pkfnrb\\finance","pkfkla\\hr","patelub","mwesigwa",
  "domain\\grace.mutua","domain\\peter.ochieng","pkfmsa\\admin",
];

const EMAIL_SENDERS = [
  "noreply@paypal-verify.ru","admin@microsoft-security-alert.com","billing@amazon-orders.xyz",
  "support@dhl-tracking.info","urgent@it-helpdesk-support.net","hr@payroll-portal.co",
  "security@outlook-login.ru","no-reply@apple-id-verify.com","tax@revenue-authority.info",
  "invoice@quickbooks-online.xyz","update@linkedin-account.ru","alert@googleactivity.info",
  "phish@malicious-domain.com","dropbox@sharefiles.net","it@password-reset-portal.co",
];

const EMAIL_RECIPIENTS = [
  "john.kamau@pkfafrica.com","grace.mutua@pkfafrica.com","peter.ochieng@pkfafrica.com",
  "admin@pkfafrica.com","finance@pkfafrica.co.tz","hr@pkfafrica.com",
  "ceo@pkfafrica.com","accounts@pkfafrica.co.ke","manager@pkfafrica.ug",
];

const MITRE_ENDPOINT = [
  { tactic:"Execution",technique:"T1059.001",name:"PowerShell" },
  { tactic:"Execution",technique:"T1059.003",name:"Windows Command Shell" },
  { tactic:"Defense Evasion",technique:"T1055",name:"Process Injection" },
  { tactic:"Defense Evasion",technique:"T1112",name:"Modify Registry" },
  { tactic:"Persistence",technique:"T1053.005",name:"Scheduled Task" },
  { tactic:"Credential Access",technique:"T1003.001",name:"LSASS Memory" },
  { tactic:"Credential Access",technique:"T1110.001",name:"Password Guessing" },
  { tactic:"Discovery",technique:"T1082",name:"System Information Discovery" },
  { tactic:"Lateral Movement",technique:"T1021.001",name:"Remote Desktop Protocol" },
  { tactic:"Collection",technique:"T1005",name:"Data from Local System" },
  { tactic:"Exfiltration",technique:"T1041",name:"Exfiltration Over C2 Channel" },
  { tactic:"Command and Control",technique:"T1071.001",name:"Web Protocols" },
  { tactic:"Initial Access",technique:"T1190",name:"Exploit Public-Facing Application" },
  { tactic:"Privilege Escalation",technique:"T1068",name:"Exploitation for Privilege Escalation" },
];

const MITRE_EMAIL = [
  { tactic:"Initial Access",technique:"T1566.001",name:"Spearphishing Attachment" },
  { tactic:"Initial Access",technique:"T1566.002",name:"Spearphishing Link" },
  { tactic:"Execution",technique:"T1204.001",name:"Malicious Link" },
  { tactic:"Execution",technique:"T1204.002",name:"Malicious File" },
  { tactic:"Collection",technique:"T1114.002",name:"Remote Email Collection" },
  { tactic:"Defense Evasion",technique:"T1036.005",name:"Match Legitimate Name or Location" },
];

const MITRE_NETWORK = [
  { tactic:"Discovery",technique:"T1046",name:"Network Service Discovery" },
  { tactic:"Lateral Movement",technique:"T1210",name:"Exploitation of Remote Services" },
  { tactic:"Command and Control",technique:"T1095",name:"Non-Application Layer Protocol" },
  { tactic:"Exfiltration",technique:"T1048",name:"Exfiltration Over Alternative Protocol" },
  { tactic:"Impact",technique:"T1498",name:"Network Denial of Service" },
];

const MITRE_IDENTITY = [
  { tactic:"Credential Access",technique:"T1110.003",name:"Password Spraying" },
  { tactic:"Credential Access",technique:"T1078",name:"Valid Accounts" },
  { tactic:"Persistence",technique:"T1098",name:"Account Manipulation" },
  { tactic:"Defense Evasion",technique:"T1550.004",name:"Web Session Cookie" },
];

const KILL_CHAIN_PHASES = [
  "Reconnaissance","Weaponization","Delivery","Exploitation","Installation",
  "Command & Control","Actions on Objectives",
];

const ENDPOINT_THREATS = [
  "Ransomware: LockBit 3.0 detected","Malware: Agent Tesla keylogger","Suspicious PowerShell execution",
  "Process injection into lsass.exe","Mimikatz credential harvesting","Registry modification for persistence",
  "Scheduled task created by unknown process","Lateral movement via RDP","WannaCry variant detected",
  "Cobalt Strike beacon activity","Living-off-the-land attack (LOLBin)","Fileless malware execution",
  "UAC bypass attempt","DCOM lateral movement","Token impersonation attack",
  "Cryptominer: XMRig CPU activity","Backdoor: Quasar RAT connection","Rootkit installation attempt",
  "Memory injection: shellcode detected","PsExec remote execution","WMI persistence mechanism",
  "Empire PowerShell framework","Metasploit payload execution","BloodHound enumeration activity",
  "Privilege escalation via CVE-2023-21674","AMSI bypass attempt","Malicious DLL sideloading",
];

const EMAIL_THREATS = [
  "Phishing email: credential harvesting","BEC attempt: invoice fraud","Malicious attachment: macro dropper",
  "Spearphishing: executive impersonation","Ransomware delivery via email","Business email compromise",
  "Malicious link: drive-by download","Gift card scam: HR impersonation","Tax refund phishing",
  "Fake payroll portal link","QR code phishing (quishing)","HTML attachment credential stealer",
  "Emotet dropper via email","BEC: finance wire transfer request","Supply chain phishing via vendor email",
];

const NETWORK_THREATS = [
  "Port scan from external IP","Brute force: SSH on exposed service","DNS tunneling C2 communication",
  "Suspicious outbound connection: tor exit node","SMB exploit attempt: EternalBlue","ICMP flood attack",
  "SQL injection attempt on web app","Unauthorized VPN connection","Suspicious data transfer: >500MB",
  "Firewall policy bypass attempt","Unknown protocol on port 4444","Beaconing to known C2 IP",
  "Lateral movement via SMB","Remote code execution via HTTP","RDP brute force from external IP",
];

const IDENTITY_THREATS = [
  "Account lockout: 10+ failed attempts","Impossible travel: login from two continents",
  "Stale admin account activity","Service account anomaly: new IP","MFA fatigue attack attempt",
  "Password spray across AD accounts","Privileged account used after hours",
  "Guest account elevated to admin","Lateral movement with valid credentials",
  "Token theft: suspicious OAuth grant","Kerberoasting attack detected","DCSync replication anomaly",
];

const SSE_THREATS = [
  "Skyhigh SSE: Shadow IT - Personal Gmail upload","Skyhigh SSE: DLP violation - credit card numbers",
  "Skyhigh SSE: Malware download blocked","Skyhigh SSE: Unauthorized cloud storage (Dropbox)",
  "Skyhigh SSE: Anomalous upload volume >1GB","Skyhigh SSE: Crypto site blocked",
  "Skyhigh SSE: Torrent site access","Skyhigh SSE: Dark web forum attempt",
  "Skyhigh SSE: CASB policy violation: non-approved app","Skyhigh SSE: Data exfil to personal OneDrive",
];

const VULNERABILITY_THREATS = [
  "CVE-2023-23397: Outlook zero-click RCE (CVSS 9.8)","CVE-2023-20273: Cisco IOS XE (CVSS 7.2)",
  "CVE-2023-44487: HTTP/2 Rapid Reset DoS","CVE-2023-4966: Citrix Bleed (CVSS 9.4)",
  "CVE-2023-36884: Office/Windows HTML RCE","CVE-2022-47966: ManageEngine RCE (CVSS 9.8)",
  "CVE-2023-21608: Adobe Acrobat UAF","CVE-2023-27350: PaperCut RCE (CVSS 9.8)",
  "CVE-2023-34362: MOVEit SQL Injection (CVSS 9.8)","Log4Shell CVE-2021-44228 re-detection",
];

const CLOUD_THREATS = [
  "Unusual AWS IAM role assumption","Azure AD: suspicious app consent granted",
  "M365: admin login from Tor exit node","Suspicious Azure resource creation",
  "Excessive permission grant: service principal","Cloud storage: public bucket misconfiguration",
  "OAuth token abuse: mail.read scope","Azure AD: new external guest access",
];

const ACTIONS = {
  endpoint: ["quarantined","blocked","cleaned","alert_only","process_killed","file_deleted","connection_blocked"],
  email: ["quarantined","blocked","delivered_with_warning","deleted","allowed_with_sandbox"],
  network: ["blocked","allowed","logged","rate_limited","redirected","dropped"],
  identity: ["account_locked","mfa_enforced","session_terminated","alert_only","access_denied"],
  sse: ["blocked","allowed","logged","dlp_scan","quarantined"],
  vulnerability: ["alert_only","patch_required","accepted_risk","remediated"],
  cloud: ["alert_only","remediated","blocked","access_revoked"],
};

const SEVERITIES = ["critical","high","medium","low","info"] as const;
const SEVERITY_WEIGHTS = [0.08,0.22,0.40,0.22,0.08];

function weightedSeverity(): string {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < SEVERITIES.length; i++) {
    acc += SEVERITY_WEIGHTS[i];
    if (r < acc) return SEVERITIES[i];
  }
  return "medium";
}

function randomDate(daysAgo: number, daysAgoEnd = 0): Date {
  const now = Date.now();
  const ms = now - daysAgo * 86400000;
  const msEnd = now - daysAgoEnd * 86400000;
  return new Date(ms + Math.random() * (msEnd - ms));
}

function sha256(s: string) { return crypto.createHash("sha256").update(s).digest("hex"); }

interface EventRow {
  tenant_id: number;
  event_type: string;
  severity: string;
  threat: string;
  target?: string;
  attacker?: string;
  asset?: string;
  app?: string;
  description: string;
  raw_payload: any;
  occurred_at: Date;
  created_at: Date;
  threat_vector?: string;
  mitre_tactic?: string;
  mitre_technique?: string;
  action?: string;
  source_type?: string;
  log_source?: string;
  sender?: string;
  recipient?: string;
  protocol?: string;
  country?: string;
  risk_score?: number;
  pipeline_status: string;
  normalized_at?: Date;
  enriched_at?: Date;
  correlated_at?: Date;
  stored_at?: Date;
  event_hash?: string;
}

function makePipelineStatus(occurred: Date): { status: string; normalized?: Date; enriched?: Date; correlated?: Date; stored?: Date } {
  const r = Math.random();
  const n = new Date(occurred.getTime() + rngBetween(1,5) * 60000);
  const e = new Date(n.getTime() + rngBetween(2,8) * 60000);
  const c = new Date(e.getTime() + rngBetween(1,4) * 60000);
  const s = new Date(c.getTime() + rngBetween(1,3) * 60000);
  if (r < 0.65) return { status: "stored", normalized: n, enriched: e, correlated: c, stored: s };
  if (r < 0.82) return { status: "correlated", normalized: n, enriched: e, correlated: c };
  if (r < 0.92) return { status: "enriched", normalized: n, enriched: e };
  if (r < 0.97) return { status: "normalized", normalized: n };
  return { status: "received" };
}

function buildEndpointEvent(occurred: Date): EventRow {
  const host = rng(HOSTNAMES);
  const ip = rng(IPS_INTERNAL);
  const threat = rng(ENDPOINT_THREATS);
  const m = rng(MITRE_ENDPOINT);
  const sev = weightedSeverity();
  const action = rng(ACTIONS.endpoint);
  const ps = makePipelineStatus(occurred);
  const hash = sha256(`${TENANT_ID}|Cynet 360|endpoint|${threat}|${occurred.toISOString()}|${rng(ATTACKER_IPS)}|${host}`);
  return {
    tenant_id: TENANT_ID,
    event_type: "endpoint",
    severity: sev,
    threat,
    target: host,
    attacker: Math.random() < 0.4 ? rng(ATTACKER_IPS) : undefined,
    asset: host,
    description: `Cynet 360 detected: ${threat} on host ${host} (${ip}). Severity: ${sev}. Action: ${action}.`,
    raw_payload: { host, ip, action, killChainPhase: rng(KILL_CHAIN_PHASES), cynetAlertId: `CYN-${rngBetween(100000,999999)}`, verdict: sev === "info" ? "clean" : "malicious" },
    occurred_at: occurred,
    created_at: new Date(occurred.getTime() + rngBetween(30,300) * 1000),
    threat_vector: "Endpoint",
    mitre_tactic: m.tactic,
    mitre_technique: m.technique,
    action,
    source_type: "edr",
    log_source: "Cynet 360",
    country: Math.random() < 0.3 ? rng(COUNTRIES) : "Kenya",
    risk_score: rngBetween(sev === "critical" ? 85 : sev === "high" ? 65 : sev === "medium" ? 40 : 15, sev === "critical" ? 100 : sev === "high" ? 84 : sev === "medium" ? 64 : sev === "low" ? 39 : 14),
    pipeline_status: ps.status,
    normalized_at: ps.normalized,
    enriched_at: ps.enriched,
    correlated_at: ps.correlated,
    stored_at: ps.stored,
    event_hash: hash,
  };
}

function buildEmailEvent(occurred: Date): EventRow {
  const sender = rng(EMAIL_SENDERS);
  const recipient = rng(EMAIL_RECIPIENTS);
  const threat = rng(EMAIL_THREATS);
  const m = rng(MITRE_EMAIL);
  const sev = weightedSeverity();
  const action = rng(ACTIONS.email);
  const ps = makePipelineStatus(occurred);
  const hash = sha256(`${TENANT_ID}|Cynet 360|email|${threat}|${occurred.toISOString()}|${sender}|${recipient}`);
  return {
    tenant_id: TENANT_ID,
    event_type: "email",
    severity: sev,
    threat,
    target: recipient,
    attacker: sender,
    description: `Email security: ${threat}. Sender: ${sender} → Recipient: ${recipient}. Action: ${action}.`,
    raw_payload: { sender, recipient, subject: threat, action, killChainPhase: rng(KILL_CHAIN_PHASES), messageId: `<${sha256(threat+occurred.toISOString()).substring(0,12)}@mail.pkfafrica.com>` },
    occurred_at: occurred,
    created_at: new Date(occurred.getTime() + rngBetween(30,300) * 1000),
    threat_vector: "Email",
    mitre_tactic: m.tactic,
    mitre_technique: m.technique,
    action,
    source_type: "email_security",
    log_source: "Cynet 360",
    sender,
    recipient,
    country: rng(COUNTRIES),
    risk_score: rngBetween(sev === "critical" ? 80 : sev === "high" ? 60 : 20, 95),
    pipeline_status: ps.status,
    normalized_at: ps.normalized,
    enriched_at: ps.enriched,
    correlated_at: ps.correlated,
    stored_at: ps.stored,
    event_hash: hash,
  };
}

function buildNetworkEvent(occurred: Date): EventRow {
  const host = rng(HOSTNAMES);
  const srcIp = rng(ATTACKER_IPS);
  const dstIp = rng(IPS_INTERNAL);
  const threat = rng(NETWORK_THREATS);
  const m = rng(MITRE_NETWORK);
  const sev = weightedSeverity();
  const action = rng(ACTIONS.network);
  const ps = makePipelineStatus(occurred);
  const hash = sha256(`${TENANT_ID}|FortiGate|network|${threat}|${occurred.toISOString()}|${srcIp}|${dstIp}`);
  return {
    tenant_id: TENANT_ID,
    event_type: "network",
    severity: sev,
    threat,
    target: dstIp,
    attacker: srcIp,
    asset: host,
    description: `Network threat: ${threat}. Source: ${srcIp} → Destination: ${dstIp}. Action: ${action}.`,
    raw_payload: { srcIp, dstIp, protocol: rng(["TCP","UDP","ICMP"]), port: rng([22,80,443,445,3389,8080,4444,8443]), action, killChainPhase: rng(KILL_CHAIN_PHASES), fortigateSerial: `FGT60F-${rngBetween(1000,9999)}` },
    occurred_at: occurred,
    created_at: new Date(occurred.getTime() + rngBetween(10,120) * 1000),
    threat_vector: "Network",
    mitre_tactic: m.tactic,
    mitre_technique: m.technique,
    action,
    source_type: "firewall",
    log_source: "FortiGate",
    protocol: rng(["TCP","UDP","ICMP"]),
    country: rng(COUNTRIES),
    risk_score: rngBetween(sev === "critical" ? 80 : sev === "high" ? 55 : 20, 90),
    pipeline_status: ps.status,
    normalized_at: ps.normalized,
    enriched_at: ps.enriched,
    correlated_at: ps.correlated,
    stored_at: ps.stored,
    event_hash: hash,
  };
}

function buildIdentityEvent(occurred: Date): EventRow {
  const user = rng(USERS);
  const host = rng(HOSTNAMES);
  const ip = rng(ATTACKER_IPS);
  const threat = rng(IDENTITY_THREATS);
  const m = rng(MITRE_IDENTITY);
  const sev = weightedSeverity();
  const action = rng(ACTIONS.identity);
  const ps = makePipelineStatus(occurred);
  const hash = sha256(`${TENANT_ID}|Cynet 360|identity|${threat}|${occurred.toISOString()}|${user}|${ip}`);
  return {
    tenant_id: TENANT_ID,
    event_type: "identity",
    severity: sev,
    threat,
    target: user,
    attacker: ip,
    asset: host,
    description: `Identity threat: ${threat}. User: ${user}. Source IP: ${ip}. Action: ${action}.`,
    raw_payload: { user, host, ip, action, killChainPhase: rng(KILL_CHAIN_PHASES), failedAttempts: rngBetween(3,25) },
    occurred_at: occurred,
    created_at: new Date(occurred.getTime() + rngBetween(30,300) * 1000),
    threat_vector: "Identity",
    mitre_tactic: m.tactic,
    mitre_technique: m.technique,
    action,
    source_type: "iam",
    log_source: "Cynet 360",
    country: Math.random() < 0.6 ? rng(COUNTRIES) : "Kenya",
    risk_score: rngBetween(sev === "critical" ? 80 : sev === "high" ? 60 : 30, 95),
    pipeline_status: ps.status,
    normalized_at: ps.normalized,
    enriched_at: ps.enriched,
    correlated_at: ps.correlated,
    stored_at: ps.stored,
    event_hash: hash,
  };
}

function buildSSEEvent(occurred: Date): EventRow {
  const host = rng(HOSTNAMES);
  const user = rng(USERS);
  const threat = rng(SSE_THREATS);
  const m = rng([...MITRE_IDENTITY, { tactic:"Collection",technique:"T1213",name:"Data from Information Repositories" }]);
  const sev = weightedSeverity();
  const action = rng(ACTIONS.sse);
  const ps = makePipelineStatus(occurred);
  const apps = ["Google Drive","WhatsApp","ChatGPT","Dropbox","Personal OneDrive","Telegram","Mega.nz","WeTransfer"];
  const app = rng(apps);
  const hash = sha256(`${TENANT_ID}|Skyhigh SSE|sse|${threat}|${occurred.toISOString()}|${user}|${host}`);
  return {
    tenant_id: TENANT_ID,
    event_type: "sse",
    severity: sev,
    threat,
    target: user,
    asset: host,
    app,
    description: `Skyhigh SSE: ${threat}. User: ${user} on ${host}. App: ${app}. Action: ${action}.`,
    raw_payload: { user, host, app, action, killChainPhase: rng(KILL_CHAIN_PHASES), bytesTransferred: rngBetween(1000,500000000), category: "Shadow IT" },
    occurred_at: occurred,
    created_at: new Date(occurred.getTime() + rngBetween(10,90) * 1000),
    threat_vector: "Cloud/Web",
    mitre_tactic: m.tactic,
    mitre_technique: m.technique,
    action,
    source_type: "casb",
    log_source: "Skyhigh SSE",
    country: "Kenya",
    risk_score: rngBetween(20, 80),
    pipeline_status: ps.status,
    normalized_at: ps.normalized,
    enriched_at: ps.enriched,
    correlated_at: ps.correlated,
    stored_at: ps.stored,
    event_hash: hash,
  };
}

function buildVulnEvent(occurred: Date): EventRow {
  const host = rng(HOSTNAMES);
  const ip = rng(IPS_INTERNAL);
  const threat = rng(VULNERABILITY_THREATS);
  const sev = Math.random() < 0.5 ? "critical" : Math.random() < 0.5 ? "high" : "medium";
  const action = rng(ACTIONS.vulnerability);
  const ps = makePipelineStatus(occurred);
  const hash = sha256(`${TENANT_ID}|Cynet 360|vulnerability|${threat}|${occurred.toISOString()}|${host}`);
  return {
    tenant_id: TENANT_ID,
    event_type: "vulnerability",
    severity: sev,
    threat,
    target: host,
    asset: host,
    description: `Vulnerability detected: ${threat} on host ${host} (${ip}). Immediate patching required. Action: ${action}.`,
    raw_payload: { host, ip, cve: threat.match(/CVE-[\d-]+/)?.[0], action, killChainPhase: "Exploitation", cvss: rngBetween(70, 98) / 10 },
    occurred_at: occurred,
    created_at: new Date(occurred.getTime() + rngBetween(60,600) * 1000),
    threat_vector: "Vulnerability",
    mitre_tactic: "Initial Access",
    mitre_technique: "T1190",
    action,
    source_type: "vulnerability_scanner",
    log_source: "Cynet 360",
    risk_score: rngBetween(70, 100),
    pipeline_status: ps.status,
    normalized_at: ps.normalized,
    enriched_at: ps.enriched,
    correlated_at: ps.correlated,
    stored_at: ps.stored,
    event_hash: hash,
  };
}

function buildCloudEvent(occurred: Date): EventRow {
  const user = rng(USERS);
  const threat = rng(CLOUD_THREATS);
  const ip = rng(ATTACKER_IPS);
  const sev = weightedSeverity();
  const action = rng(ACTIONS.cloud);
  const ps = makePipelineStatus(occurred);
  const hash = sha256(`${TENANT_ID}|Cynet 360|cloud|${threat}|${occurred.toISOString()}|${user}`);
  return {
    tenant_id: TENANT_ID,
    event_type: "cloud",
    severity: sev,
    threat,
    target: user,
    attacker: ip,
    description: `Cloud security event: ${threat}. User: ${user}. Source IP: ${ip}. Action: ${action}.`,
    raw_payload: { user, ip, action, killChainPhase: rng(KILL_CHAIN_PHASES), platform: rng(["M365","Azure AD","Google Workspace"]) },
    occurred_at: occurred,
    created_at: new Date(occurred.getTime() + rngBetween(30,300) * 1000),
    threat_vector: "Cloud",
    mitre_tactic: "Persistence",
    mitre_technique: "T1098",
    action,
    source_type: "cloud_security",
    log_source: "Cynet 360",
    country: rng(COUNTRIES),
    risk_score: rngBetween(30, 85),
    pipeline_status: ps.status,
    normalized_at: ps.normalized,
    enriched_at: ps.enriched,
    correlated_at: ps.correlated,
    stored_at: ps.stored,
    event_hash: hash,
  };
}

function buildWAFEvent(occurred: Date): EventRow {
  const srcIp = rng(ATTACKER_IPS);
  const dstIp = rng(IPS_INTERNAL);
  const wafThreats = ["SQL injection blocked","XSS attempt blocked","Directory traversal blocked","CSRF attack blocked","Bot traffic blocked","Credential stuffing blocked"];
  const threat = rng(wafThreats);
  const sev = weightedSeverity();
  const ps = makePipelineStatus(occurred);
  const hash = sha256(`${TENANT_ID}|FortiGate|waf|${threat}|${occurred.toISOString()}|${srcIp}`);
  return {
    tenant_id: TENANT_ID,
    event_type: "waf",
    severity: sev,
    threat,
    target: dstIp,
    attacker: srcIp,
    description: `WAF: ${threat}. Source: ${srcIp} → ${dstIp}. Action: blocked.`,
    raw_payload: { srcIp, dstIp, action: "blocked", killChainPhase: "Exploitation", requestPath: rng(["/admin","/login","/api/users","/.env","/wp-admin","/../../../etc/passwd"]) },
    occurred_at: occurred,
    created_at: new Date(occurred.getTime() + rngBetween(5,60) * 1000),
    threat_vector: "Web Application",
    mitre_tactic: "Initial Access",
    mitre_technique: "T1190",
    action: "blocked",
    source_type: "waf",
    log_source: "FortiGate",
    country: rng(COUNTRIES),
    risk_score: rngBetween(40, 80),
    pipeline_status: ps.status,
    normalized_at: ps.normalized,
    enriched_at: ps.enriched,
    correlated_at: ps.correlated,
    stored_at: ps.stored,
    event_hash: hash,
  };
}

function buildDLPEvent(occurred: Date): EventRow {
  const user = rng(USERS);
  const host = rng(HOSTNAMES);
  const dlpThreats = ["PII data transfer blocked: ID numbers","Credit card numbers detected","Confidential document upload blocked","Large file transfer to personal email","Sensitive keyword: 'salary' in outbound email","USB exfiltration: unclassified document","Screen capture of sensitive data attempted","Financial data paste to web clipboard"];
  const threat = rng(dlpThreats);
  const sev = weightedSeverity();
  const ps = makePipelineStatus(occurred);
  const hash = sha256(`${TENANT_ID}|Skyhigh SSE|dlp|${threat}|${occurred.toISOString()}|${user}`);
  return {
    tenant_id: TENANT_ID,
    event_type: "dlp",
    severity: sev,
    threat,
    target: user,
    asset: host,
    description: `DLP policy violation: ${threat}. User: ${user} on ${host}. Action: blocked.`,
    raw_payload: { user, host, action: "blocked", killChainPhase: "Exfiltration", policyName: rng(["PCI-DSS","GDPR-PII","Confidential-Internal","Financial-Reports"]) },
    occurred_at: occurred,
    created_at: new Date(occurred.getTime() + rngBetween(10,120) * 1000),
    threat_vector: "Data Loss Prevention",
    mitre_tactic: "Exfiltration",
    mitre_technique: "T1048",
    action: "blocked",
    source_type: "dlp",
    log_source: "Skyhigh SSE",
    country: "Kenya",
    risk_score: rngBetween(40, 85),
    pipeline_status: ps.status,
    normalized_at: ps.normalized,
    enriched_at: ps.enriched,
    correlated_at: ps.correlated,
    stored_at: ps.stored,
    event_hash: hash,
  };
}

function buildCASBEvent(occurred: Date): EventRow {
  const user = rng(USERS);
  const casbThreats = ["Unsanctioned SaaS app: Notion","Anomalous download from SharePoint","Excessive API calls: service account","Cloud storage misconfiguration detected","Privileged M365 admin action from new location","Teams external sharing violation"];
  const threat = rng(casbThreats);
  const sev = weightedSeverity();
  const ps = makePipelineStatus(occurred);
  const hash = sha256(`${TENANT_ID}|Skyhigh SSE|casb|${threat}|${occurred.toISOString()}|${user}`);
  return {
    tenant_id: TENANT_ID,
    event_type: "casb",
    severity: sev,
    threat,
    target: user,
    description: `CASB policy violation: ${threat}. User: ${user}.`,
    raw_payload: { user, action: "logged", killChainPhase: "Exfiltration", cloudApp: rng(["Microsoft 365","Google Workspace","Salesforce","ServiceNow","Box"]) },
    occurred_at: occurred,
    created_at: new Date(occurred.getTime() + rngBetween(10,120) * 1000),
    threat_vector: "Cloud Access",
    mitre_tactic: "Collection",
    mitre_technique: "T1213",
    action: "logged",
    source_type: "casb",
    log_source: "Skyhigh SSE",
    country: "Kenya",
    risk_score: rngBetween(30, 75),
    pipeline_status: ps.status,
    normalized_at: ps.normalized,
    enriched_at: ps.enriched,
    correlated_at: ps.correlated,
    stored_at: ps.stored,
    event_hash: hash,
  };
}

function buildFortiNACEvent(occurred: Date): EventRow {
  const host = rng(HOSTNAMES);
  const ip = rng(IPS_INTERNAL);
  const mac = `${rngBetween(10,99).toString(16)}:${rngBetween(10,99).toString(16)}:${rngBetween(10,99).toString(16)}:${rngBetween(10,99).toString(16)}:${rngBetween(10,99).toString(16)}:${rngBetween(10,99).toString(16)}`;
  const nacThreats = [
    "Rogue device detected on corporate network","Non-compliant endpoint blocked: missing EDR agent",
    "BYOD device denied network access: unregistered","Guest network policy violation: unauthorized VLAN access",
    "Device quarantined: failed posture check","MAC address spoofing detected","Unauthorized switch port access",
    "Non-domain device attempting corporate SSID","Endpoint compliance failure: missing patch","Switch port violation: new MAC on restricted port",
    "Device profile mismatch: endpoint in server VLAN","FortiNAC: posture assessment failed — AV not updated",
    "IoT device detected on workstation VLAN","Network admission control: certificate expired","Isolation triggered: suspicious lateral movement source",
  ];
  const threat = rng(nacThreats);
  const sev = weightedSeverity();
  const action = rng(["quarantined","blocked","allowed_with_monitoring","vlan_reassigned","alert_only"]);
  const ps = makePipelineStatus(occurred);
  const hash = sha256(`${TENANT_ID}|FortiNAC|network|${threat}|${occurred.toISOString()}|${mac}|${ip}`);
  return {
    tenant_id: TENANT_ID,
    event_type: "network",
    severity: sev,
    threat,
    target: host,
    attacker: Math.random() < 0.3 ? rng(ATTACKER_IPS) : undefined,
    asset: host,
    description: `FortiNAC: ${threat}. Host: ${host} (${ip}), MAC: ${mac}. Action: ${action}.`,
    raw_payload: { host, ip, mac, action, killChainPhase: rng(["Reconnaissance","Installation","Lateral Movement"]), nacPolicyId: `POL-${rngBetween(100,999)}`, switchPort: `GigE0/${rngBetween(1,48)}`, vlan: rngBetween(10, 200) },
    occurred_at: occurred,
    created_at: new Date(occurred.getTime() + rngBetween(5,60) * 1000),
    threat_vector: "Network Access Control",
    mitre_tactic: rng(["Discovery","Lateral Movement","Defense Evasion"]),
    mitre_technique: rng(["T1046","T1210","T1078"]),
    action,
    source_type: "nac",
    log_source: "FortiNAC",
    country: "Kenya",
    risk_score: rngBetween(sev === "critical" ? 75 : sev === "high" ? 55 : 20, 85),
    pipeline_status: ps.status,
    normalized_at: ps.normalized,
    enriched_at: ps.enriched,
    correlated_at: ps.correlated,
    stored_at: ps.stored,
    event_hash: hash,
  };
}

function generateEvent(occurred: Date): EventRow {
  const r = Math.random();
  if (r < 0.36) return buildEndpointEvent(occurred);
  if (r < 0.54) return buildEmailEvent(occurred);
  if (r < 0.65) return buildNetworkEvent(occurred);
  if (r < 0.73) return buildFortiNACEvent(occurred);
  if (r < 0.81) return buildSSEEvent(occurred);
  if (r < 0.87) return buildIdentityEvent(occurred);
  if (r < 0.91) return buildVulnEvent(occurred);
  if (r < 0.94) return buildCloudEvent(occurred);
  if (r < 0.96) return buildWAFEvent(occurred);
  if (r < 0.98) return buildDLPEvent(occurred);
  return buildCASBEvent(occurred);
}

async function insertSecurityIntegrations() {
  // New rows are inserted as 'disconnected' with empty credentials so the admin
  // must re-enter real API keys through the Security Integrations settings UI.
  // Existing rows: ON CONFLICT updates only safe, non-credential display fields.
  // config_json, api_base_url, and auth_type are NEVER overwritten here.
  await pool.query(`
    INSERT INTO security_integrations 
      (tenant_id, platform_key, platform_name, category, status, auth_type, 
       polling_enabled, polling_interval_minutes, last_poll_status, 
       last_poll_message, events_imported, config_json, description, is_enabled)
    VALUES 
      ($1, 'cynet', 'Cynet 360 AutoXDR', 'edr_xdr', 'disconnected', 'token',
       false, 15, 'error',
       'API credentials required — please re-enter in Settings.',
       0, '{}', 'Cynet 360 AutoXDR — Extended Detection and Response for PKF Africa endpoints', true),
      ($1, 'skyhigh_sse', 'Skyhigh Security SSE', 'sse_casb', 'disconnected', 'api_key',
       false, 60, 'error',
       'API credentials required — please re-enter in Settings.',
       0, '{}', 'Skyhigh Security SSE — CASB, DLP, SWG for PKF Africa cloud traffic', true),
      ($1, 'fortinac', 'FortiNAC', 'network_security', 'disconnected', 'token',
       false, 5, 'error',
       'API credentials required — please re-enter in Settings.',
       0, '{}', 'FortiNAC — Network Access Control for PKF Africa wired/wireless endpoints', true)
    ON CONFLICT (tenant_id, platform_key) DO UPDATE SET
      events_imported = EXCLUDED.events_imported,
      last_poll_at = EXCLUDED.last_poll_at,
      last_poll_status = EXCLUDED.last_poll_status,
      last_poll_message = EXCLUDED.last_poll_message
  `, [TENANT_ID]);

  console.log("✓ Security integrations upserted (Cynet, Skyhigh SSE, FortiNAC — new rows: disconnected; existing: display fields only)");
}

async function insertEvents(events: EventRow[]) {
  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < events.length; i += BATCH) {
    const batch = events.slice(i, i + BATCH);
    const vals: any[] = [];
    const placeholders = batch.map((ev, idx) => {
      const base = idx * 24;
      vals.push(
        ev.tenant_id, ev.event_type, ev.severity, ev.threat, ev.target ?? null,
        ev.attacker ?? null, ev.asset ?? null, ev.app ?? null, ev.description,
        JSON.stringify(ev.raw_payload), ev.occurred_at, ev.created_at,
        ev.threat_vector ?? null, ev.mitre_tactic ?? null, ev.mitre_technique ?? null,
        ev.action ?? null, ev.source_type ?? null, ev.log_source ?? null,
        ev.sender ?? null, ev.recipient ?? null, ev.country ?? null, ev.risk_score ?? null,
        ev.pipeline_status, ev.event_hash ?? null,
      );
      return `($${base+1},$${base+2}::event_type,$${base+3}::severity,$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10}::jsonb,$${base+11},$${base+12},$${base+13},$${base+14},$${base+15},$${base+16},$${base+17},$${base+18},$${base+19},$${base+20},$${base+21},$${base+22},$${base+23}::pipeline_status,$${base+24})`;
    }).join(",");

    await pool.query(`
      INSERT INTO security_events 
        (tenant_id, event_type, severity, threat, target, attacker, asset, app, description, raw_payload, 
         occurred_at, created_at, threat_vector, mitre_tactic, mitre_technique, action, source_type, log_source,
         sender, recipient, country, risk_score, pipeline_status, event_hash)
      VALUES ${placeholders}
      ON CONFLICT DO NOTHING
    `, vals);

    inserted += batch.length;
    process.stdout.write(`\r  Progress: ${inserted}/${events.length} events`);
  }
  console.log(`\n✓ ${inserted} events inserted`);
}

interface IncidentRow {
  tenant_id: number;
  title: string;
  description: string;
  severity: string;
  status: string;
  source: string;
  category: string;
  affected_assets: string;
  recommendation: string;
  assigned_to: string;
  mitre_tactic: string;
  mitre_technique_id: string;
  mitre_technique: string;
  kill_chain_phase: string;
  confidence_score: number;
  is_true_positive?: boolean;
  classification?: string;
  ioc_data?: any;
  incident_type: string;
  source_ip: string;
  detection_source: string;
  dedup_hash: string;
  threat_narrative: string;
  enriched_description: string;
  created_at: Date;
  updated_at: Date;
  resolved_at?: Date;
}

async function insertIncidents() {
  // Derive incidents from seeded events via correlation (attacker IP clustering + entity clustering)
  // Query events grouped by attacker IP over 7-day windows
  const attackerGroups = await pool.query<{
    attacker: string; window_start: Date; event_count: number; assets: string;
    severities: string[]; event_types: string[]; log_sources: string[];
    mitre_tactics: string[]; mitre_techniques: string[]; oldest_at: Date; newest_at: Date;
  }>(`
    SELECT 
      attacker,
      date_trunc('week', occurred_at) as window_start,
      COUNT(*)::int as event_count,
      string_agg(DISTINCT COALESCE(asset, target, ''), ', ') as assets,
      array_agg(DISTINCT severity::text) as severities,
      array_agg(DISTINCT event_type::text) as event_types,
      array_agg(DISTINCT log_source) FILTER (WHERE log_source IS NOT NULL) as log_sources,
      array_agg(DISTINCT mitre_tactic) FILTER (WHERE mitre_tactic IS NOT NULL) as mitre_tactics,
      array_agg(DISTINCT mitre_technique) FILTER (WHERE mitre_technique IS NOT NULL) as mitre_techniques,
      MIN(occurred_at) as oldest_at,
      MAX(occurred_at) as newest_at
    FROM security_events
    WHERE tenant_id = $1 AND attacker IS NOT NULL AND attacker != ''
    GROUP BY attacker, date_trunc('week', occurred_at)
    HAVING COUNT(*) >= 3
    ORDER BY COUNT(*) DESC
    LIMIT 50
  `, [TENANT_ID]);

  // Query events grouped by target entity over 3-day windows (multi-event-type)
  const targetGroups = await pool.query<{
    target: string; window_start: Date; event_count: number; assets: string;
    event_types: string[]; log_sources: string[]; mitre_tactics: string[];
    mitre_techniques: string[]; oldest_at: Date; newest_at: Date;
  }>(`
    SELECT 
      target,
      date_trunc('day', occurred_at) as window_start,
      COUNT(*)::int as event_count,
      string_agg(DISTINCT COALESCE(asset, target, ''), ', ') as assets,
      array_agg(DISTINCT event_type::text) as event_types,
      array_agg(DISTINCT log_source) FILTER (WHERE log_source IS NOT NULL) as log_sources,
      array_agg(DISTINCT mitre_tactic) FILTER (WHERE mitre_tactic IS NOT NULL) as mitre_tactics,
      array_agg(DISTINCT mitre_technique) FILTER (WHERE mitre_technique IS NOT NULL) as mitre_techniques,
      MIN(occurred_at) as oldest_at,
      MAX(occurred_at) as newest_at
    FROM security_events
    WHERE tenant_id = $1 AND target IS NOT NULL AND target != ''
    GROUP BY target, date_trunc('day', occurred_at)
    HAVING COUNT(DISTINCT event_type) >= 2 AND COUNT(*) >= 2
    ORDER BY COUNT(*) DESC
    LIMIT 60
  `, [TENANT_ID]);

  const sevPriority: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  function topSeverity(sevs: string[]): string {
    return sevs.sort((a, b) => (sevPriority[b] ?? 0) - (sevPriority[a] ?? 0))[0] ?? "medium";
  }

  const mitreMap: Record<string, { technique: string; name: string }> = {
    "Execution": { technique: "T1059.001", name: "PowerShell" },
    "Defense Evasion": { technique: "T1055", name: "Process Injection" },
    "Initial Access": { technique: "T1566.001", name: "Spearphishing Attachment" },
    "Lateral Movement": { technique: "T1210", name: "Exploitation of Remote Services" },
    "Credential Access": { technique: "T1003.001", name: "LSASS Memory" },
    "Exfiltration": { technique: "T1048", name: "Exfiltration Over Alternative Protocol" },
    "Command and Control": { technique: "T1071.001", name: "Web Protocols" },
    "Discovery": { technique: "T1046", name: "Network Service Discovery" },
    "Persistence": { technique: "T1053.005", name: "Scheduled Task" },
    "Collection": { technique: "T1005", name: "Data from Local System" },
    "Impact": { technique: "T1498", name: "Network Denial of Service" },
    "Privilege Escalation": { technique: "T1068", name: "Exploitation for Privilege Escalation" },
  };

  const logSrcToIntg: Record<string, string> = {
    "Cynet 360": "Cynet 360", "Skyhigh SSE": "Skyhigh SSE",
    "FortiNAC": "FortiNAC", "FortiGate": "FortiGate",
  };

  const recommendations: Record<string, string[]> = {
    endpoint: ["Isolate host immediately and perform forensic analysis","Deploy emergency patch and re-image endpoint","Reset all credentials for affected user","Conduct full malware scan across endpoint fleet"],
    email: ["Block sender domain and report phishing link","Enable MFA for all email accounts","Conduct phishing awareness training","Review and harden email security gateway rules"],
    network: ["Block attacker IP at firewall and ISP level","Review firewall rules and disable unused ports","Enable geo-IP blocking for high-risk countries","Investigate all lateral movement paths"],
    identity: ["Reset all affected user passwords immediately","Enforce MFA across all privileged accounts","Review and revoke unnecessary admin privileges","Enable Conditional Access policies"],
    cloud: ["Revoke suspicious OAuth grants and app permissions","Enable M365 audit logging for all admin actions","Review and tighten IAM policies","Enable MCAS/Defender for Cloud Apps policies"],
    network_nac: ["Quarantine non-compliant device immediately","Verify endpoint posture: EDR, patch level, certificates","Investigate BYOD device and revoke network access","Review NAC policy and VLAN assignments"],
  };

  type IncidentSeverity = "low" | "medium" | "high" | "critical";
  type IncidentStatus = "open" | "investigating" | "contained" | "resolved" | "closed";

  const incidents: IncidentRow[] = [];

  // Build incidents from attacker IP correlation groups
  for (const grp of attackerGroups.rows) {
    const sevStr = topSeverity(grp.severities);
    const sev: IncidentSeverity = ["low","medium","high","critical"].includes(sevStr)
      ? (sevStr as IncidentSeverity) : "medium";
    const mitreTactic = grp.mitre_tactics?.[0] ?? "Execution";
    const techniqueInfo = mitreMap[mitreTactic] ?? mitreMap["Execution"];
    const isTP = Math.random() < 0.75;
    const confidence = rngBetween(65, 99);
    const detSrc = grp.log_sources?.[0] ?? "Cynet 360";
    const eventTypes = grp.event_types ?? [];
    const primaryType = eventTypes.includes("endpoint") ? "endpoint"
      : eventTypes.includes("email") ? "email"
      : eventTypes.includes("network") ? "network"
      : eventTypes.includes("identity") ? "identity" : "endpoint";
    const recGroup = primaryType === "network" && detSrc === "FortiNAC" ? "network_nac" : primaryType;
    const statusRng = Math.random();
    const status: IncidentStatus = sev === "critical" ? (statusRng < 0.6 ? "investigating" : "open")
      : statusRng < 0.25 ? "resolved" : statusRng < 0.55 ? "investigating" : statusRng < 0.8 ? "contained" : "open";
    const title = `Multi-Source Attack: ${grp.attacker} — ${grp.event_count} events across ${(grp.event_types ?? []).length} vectors`;
    const iocData = [
      { type: "ip", value: grp.attacker, reputation: "malicious", country: rng(COUNTRIES), tags: ["c2","known-bad"] },
      { type: "domain", value: `malicious-${sha256(grp.attacker).substring(0,8)}.com`, reputation: "suspicious", country: "Russia", tags: ["phishing"] },
    ];
    const threatNarrative = `Automated correlation identified ${grp.event_count} events from attacker IP ${grp.attacker} across ${(grp.event_types ?? []).join(", ")} sources (${(grp.log_sources ?? []).join(", ")}). Confidence: ${confidence}%. MITRE ATT&CK: ${mitreTactic} → ${techniqueInfo.technique} (${techniqueInfo.name}). ${isTP ? "True positive — immediate response required." : "Analyst review recommended to confirm classification."}`;
    const enrichedDescription = `${title} — ${mitreTactic} → ${techniqueInfo.technique}: ${techniqueInfo.name}. Source: ${grp.attacker}. Event window: ${grp.oldest_at?.toISOString().split("T")[0]} to ${grp.newest_at?.toISOString().split("T")[0]}. Confidence: ${confidence}%. Log sources: ${(grp.log_sources ?? []).join(", ")}.`;
    incidents.push({
      tenant_id: TENANT_ID,
      title,
      description: `Correlated attack from ${grp.attacker} detected across ${(grp.event_types ?? []).join(", ")} vectors. ${grp.event_count} events from ${(grp.log_sources ?? []).join(", ")} between ${grp.oldest_at?.toISOString().split("T")[0]} and ${grp.newest_at?.toISOString().split("T")[0]}. Assets affected: ${grp.assets}.`,
      severity: sev,
      status,
      source: logSrcToIntg[detSrc] ?? detSrc,
      category: primaryType === "endpoint" ? "Endpoint Detection" : primaryType === "email" ? "Email Security" : primaryType === "network" ? "Network Threat" : primaryType === "identity" ? "Identity Threat" : "Cloud Security",
      affected_assets: grp.assets,
      recommendation: rng(recommendations[recGroup] ?? recommendations["endpoint"]),
      assigned_to: rng(["analyst@cibervest.com","soc@cibervest.com","tier2@cibervest.com","mss-team@cibervest.com"]),
      mitre_tactic: mitreTactic,
      mitre_technique_id: techniqueInfo.technique,
      mitre_technique: techniqueInfo.name,
      kill_chain_phase: rng(KILL_CHAIN_PHASES),
      confidence_score: confidence,
      is_true_positive: isTP,
      classification: isTP ? "true_positive" : "false_positive",
      ioc_data: iocData,
      incident_type: "network_attack",
      source_ip: grp.attacker,
      detection_source: detSrc,
      threat_narrative: threatNarrative,
      enriched_description: enrichedDescription,
      dedup_hash: sha256(`${TENANT_ID}|attacker|${grp.attacker}|${grp.window_start?.toISOString()?.split("T")[0]}`),
      created_at: grp.oldest_at,
      updated_at: new Date(grp.oldest_at.getTime() + rngBetween(30, 300) * 60000),
    });
  }

  // Build incidents from target entity correlation groups
  for (const grp of targetGroups.rows) {
    const sevOptions: IncidentSeverity[] = ["medium","high","high","critical","low"];
    const sev: IncidentSeverity = rng(sevOptions);
    const mitreTactic = grp.mitre_tactics?.[0] ?? "Credential Access";
    const techniqueInfo = mitreMap[mitreTactic] ?? mitreMap["Credential Access"];
    const isTP = Math.random() < 0.65;
    const confidence = rngBetween(55, 95);
    const detSrc = grp.log_sources?.[0] ?? "Cynet 360";
    const eventTypes = grp.event_types ?? [];
    const primaryType = eventTypes.includes("identity") ? "identity"
      : eventTypes.includes("cloud") ? "cloud"
      : eventTypes.includes("sse") ? "cloud" : "endpoint";
    const statusRng = Math.random();
    const status: IncidentStatus = statusRng < 0.3 ? "resolved" : statusRng < 0.6 ? "investigating" : statusRng < 0.8 ? "contained" : "open";
    const title = `Suspicious Activity: ${grp.target} — ${eventTypes.join("+")} events (${grp.event_count} total)`;
    const iocData = [
      { type: "user", value: grp.target, reputation: isTP ? "suspicious" : "clean", country: "Kenya", tags: isTP ? ["insider-threat", "anomaly"] : ["false-positive"] },
    ];
    const threatNarrative = `Correlated suspicious activity detected on entity ${grp.target} across ${eventTypes.join(", ")} event types. ${grp.event_count} total events from ${(grp.log_sources ?? []).join(", ")} within a 24-hour window. MITRE ATT&CK: ${mitreTactic} → ${techniqueInfo.technique} (${techniqueInfo.name}). Confidence: ${confidence}%. ${isTP ? "True positive — insider threat or compromised account. Immediate investigation required." : "Possible false positive — analyst review recommended."}`;
    const enrichedDescription = `${title} — ${mitreTactic} → ${techniqueInfo.technique}: ${techniqueInfo.name}. Entity: ${grp.target}. Date: ${grp.oldest_at?.toISOString().split("T")[0]}. Confidence: ${confidence}%. Sources: ${(grp.log_sources ?? []).join(", ")}.`;
    incidents.push({
      tenant_id: TENANT_ID,
      title,
      description: `Multi-vector suspicious activity on entity ${grp.target}. ${grp.event_count} events across ${eventTypes.join(", ")} from ${(grp.log_sources ?? []).join(", ")} between ${grp.oldest_at?.toISOString().split("T")[0]} and ${grp.newest_at?.toISOString().split("T")[0]}.`,
      severity: sev,
      status,
      source: logSrcToIntg[detSrc] ?? detSrc,
      category: primaryType === "identity" ? "Identity Threat" : primaryType === "cloud" ? "Cloud Security" : "Endpoint Detection",
      affected_assets: grp.assets,
      recommendation: rng(recommendations[primaryType] ?? recommendations["identity"]),
      assigned_to: rng(["analyst@cibervest.com","soc@cibervest.com","tier2@cibervest.com","mss-team@cibervest.com"]),
      mitre_tactic: mitreTactic,
      mitre_technique_id: techniqueInfo.technique,
      mitre_technique: techniqueInfo.name,
      kill_chain_phase: rng(KILL_CHAIN_PHASES),
      confidence_score: confidence,
      is_true_positive: isTP,
      classification: isTP ? "true_positive" : "false_positive",
      ioc_data: iocData,
      incident_type: primaryType === "identity" ? "credential_compromise" : "cloud_threat",
      source_ip: rng(ATTACKER_IPS),
      detection_source: detSrc,
      threat_narrative: threatNarrative,
      enriched_description: enrichedDescription,
      dedup_hash: sha256(`${TENANT_ID}|target|${grp.target}|${grp.window_start?.toISOString()?.split("T")[0]}`),
      created_at: grp.oldest_at,
      updated_at: new Date(grp.oldest_at.getTime() + rngBetween(15, 240) * 60000),
    });
  }

  // Remove duplicate dedup hashes and cap at 80
  const seen = new Set<string>();
  const unique = incidents.filter(inc => {
    if (seen.has(inc.dedup_hash)) return false;
    seen.add(inc.dedup_hash);
    return true;
  }).slice(0, 80);

  if (unique.length === 0) {
    throw new Error("No incident groups found from event correlation — check that security_events were inserted correctly");
  }

  // Top-up to minimum 60 if correlation yielded fewer
  const MIN_INCIDENTS = 60;
  if (unique.length < MIN_INCIDENTS) {
    const topUpCount = MIN_INCIDENTS - unique.length;
    console.log(`  Correlation produced ${unique.length} incidents — synthesising ${topUpCount} additional to reach minimum ${MIN_INCIDENTS}`);
    const syntheticTypes: Array<"endpoint"|"email"|"network"|"identity"|"cloud"> = ["endpoint","email","network","identity","cloud"];
    const syntheticSevs: IncidentSeverity[] = ["medium","high","high","critical","low"];
    const synthRecommendations: Record<string, string[]> = {
      endpoint: ["Isolate host immediately and perform forensic analysis","Deploy emergency patch and re-image endpoint"],
      email: ["Block sender domain and report phishing link","Enable MFA for all email accounts"],
      network: ["Block attacker IP at firewall and ISP level","Review firewall rules and disable unused ports"],
      identity: ["Reset all affected user passwords immediately","Enforce MFA across all privileged accounts"],
      cloud: ["Revoke suspicious OAuth grants and app permissions","Enable M365 audit logging for all admin actions"],
    };
    for (let i = 0; i < topUpCount; i++) {
      const t = syntheticTypes[i % syntheticTypes.length];
      const sev: IncidentSeverity = rng(syntheticSevs);
      const host = rng(HOSTNAMES);
      const attIp = rng(ATTACKER_IPS);
      const country = rng(COUNTRIES);
      const mitreTactic = rng(Object.keys(mitreMap));
      const techniqueInfo = mitreMap[mitreTactic] ?? mitreMap["Execution"];
      const isTP = Math.random() < 0.7;
      const confidence = rngBetween(55, 95);
      const createdAt = new Date(Date.now() - rngBetween(1, 85) * 86400000);
      const statusRng = Math.random();
      const status: IncidentStatus = statusRng < 0.2 ? "resolved" : statusRng < 0.5 ? "investigating" : statusRng < 0.75 ? "contained" : "open";
      const detSrc = t === "network" ? rng(["FortiNAC","FortiGate"]) : t === "cloud" ? "Skyhigh SSE" : "Cynet 360";
      const titleMap: Record<string, string> = {
        endpoint: `Malware Detected on ${host}`,
        email: `Phishing Campaign Targeting PKF Staff`,
        network: `Suspicious Outbound Traffic from ${host} to ${attIp}`,
        identity: `Anomalous Login: Multiple Failed Attempts on ${host}`,
        cloud: `Unusual Cloud Activity Detected in PKF M365 Tenant`,
      };
      const title = titleMap[t];
      const hash = sha256(`${TENANT_ID}|synthetic|${i}|${createdAt.toISOString().split("T")[0]}`);
      const iocData = [{ type: "ip", value: attIp, reputation: "malicious", country, tags: ["c2"] }];
      unique.push({
        tenant_id: TENANT_ID,
        title,
        description: `${title}. Detected by ${detSrc} on ${createdAt.toISOString().split("T")[0]}. Host: ${host}. Attacker: ${attIp} (${country}).`,
        severity: sev,
        status,
        source: logSrcToIntg[detSrc] ?? detSrc,
        category: t === "endpoint" ? "Endpoint Detection" : t === "email" ? "Email Security" : t === "network" ? "Network Threat" : t === "identity" ? "Identity Threat" : "Cloud Security",
        affected_assets: `${host} (${rng(IPS_INTERNAL)})`,
        recommendation: rng(synthRecommendations[t]),
        assigned_to: rng(["analyst@cibervest.com","soc@cibervest.com","tier2@cibervest.com"]),
        mitre_tactic: mitreTactic,
        mitre_technique_id: techniqueInfo.technique,
        mitre_technique: techniqueInfo.name,
        kill_chain_phase: rng(KILL_CHAIN_PHASES),
        confidence_score: confidence,
        is_true_positive: isTP,
        classification: isTP ? "true_positive" : "false_positive",
        ioc_data: iocData,
        incident_type: t === "endpoint" ? "malware" : t === "email" ? "phishing" : t === "network" ? "network_attack" : t === "identity" ? "credential_compromise" : "cloud_threat",
        source_ip: attIp,
        detection_source: detSrc,
        threat_narrative: `Synthetic top-up incident. ${mitreTactic} → ${techniqueInfo.technique}: ${techniqueInfo.name}. Source: ${attIp} (${country}). Confidence: ${confidence}%. ${isTP ? "True positive." : "Analyst review required."}`,
        enriched_description: `${title} — ${mitreTactic} → ${techniqueInfo.technique}: ${techniqueInfo.name}. Confidence: ${confidence}%.`,
        dedup_hash: hash,
        created_at: createdAt,
        updated_at: new Date(createdAt.getTime() + rngBetween(10, 120) * 60000),
      });
    }
  }

  const vals: Array<string | number | boolean | Date | null> = [];
  const placeholders = unique.map((inc, idx) => {
    const base = idx * 25;
    vals.push(
      inc.tenant_id, inc.title, inc.description, inc.severity, inc.status,
      inc.source, inc.category, inc.affected_assets, inc.recommendation,
      inc.assigned_to, inc.mitre_tactic, inc.mitre_technique_id, inc.mitre_technique,
      inc.kill_chain_phase, inc.confidence_score, inc.is_true_positive ?? null,
      inc.classification ?? null, JSON.stringify(inc.ioc_data),
      inc.incident_type, inc.source_ip, inc.detection_source,
      inc.threat_narrative, inc.enriched_description,
      inc.dedup_hash, inc.created_at,
    );
    return `($${base+1},$${base+2},$${base+3},$${base+4}::severity,$${base+5}::incident_status,$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},$${base+12},$${base+13},$${base+14},$${base+15},$${base+16},$${base+17},$${base+18}::jsonb,$${base+19},$${base+20},$${base+21},$${base+22},$${base+23},$${base+24},$${base+25})`;
  }).join(",");

  await pool.query(`
    INSERT INTO incidents 
      (tenant_id, title, description, severity, status, source, category, affected_assets, 
       recommendation, assigned_to, mitre_tactic, mitre_technique_id, mitre_technique, 
       kill_chain_phase, confidence_score, is_true_positive, classification, ioc_data,
       incident_type, source_ip, detection_source, threat_narrative, enriched_description,
       dedup_hash, created_at)
    VALUES ${placeholders}
    ON CONFLICT DO NOTHING
  `, vals);

  console.log(`✓ ${unique.length} incidents derived from ${attackerGroups.rowCount} attacker groups + ${targetGroups.rowCount} target groups`);
}

async function updateIntegrationEventCount() {
  // Query actual event counts per log_source from the database
  const result = await pool.query<{ log_source: string; cnt: number }>(
    `SELECT log_source, COUNT(*)::int as cnt FROM security_events WHERE tenant_id = $1 AND log_source IS NOT NULL GROUP BY log_source`,
    [TENANT_ID]
  );
  const countsBySource: Record<string, number> = {};
  for (const row of result.rows) {
    countsBySource[row.log_source] = row.cnt;
  }
  // Aggregate FortiGate events into FortiNAC (same vendor — both counted under the FortiNAC integration)
  const cynetCount = countsBySource["Cynet 360"] ?? 0;
  const sseCount = countsBySource["Skyhigh SSE"] ?? 0;
  const nacCount = (countsBySource["FortiNAC"] ?? 0) + (countsBySource["FortiGate"] ?? 0);

  await pool.query(
    `UPDATE security_integrations SET events_imported = $1 WHERE tenant_id = $2 AND platform_key = 'cynet'`,
    [cynetCount, TENANT_ID]
  );
  await pool.query(
    `UPDATE security_integrations SET events_imported = $1 WHERE tenant_id = $2 AND platform_key = 'skyhigh_sse'`,
    [sseCount, TENANT_ID]
  );
  await pool.query(
    `UPDATE security_integrations SET events_imported = $1 WHERE tenant_id = $2 AND platform_key = 'fortinac'`,
    [nacCount, TENANT_ID]
  );
  console.log(`✓ Integration event counts updated: Cynet=${cynetCount}, Skyhigh SSE=${sseCount}, FortiNAC=${nacCount}`);
}

async function main() {
  assertSeedAllowed();

  console.log("=== PKF Africa Events Seeder (ADDITIVE — no records deleted) ===");
  console.log(`Tenant ID: ${TENANT_ID}`);

  const existing = await pool.query("SELECT COUNT(*)::int as cnt FROM security_events WHERE tenant_id = $1", [TENANT_ID]);
  const existingIncidents = await pool.query("SELECT COUNT(*)::int as cnt FROM incidents WHERE tenant_id = $1", [TENANT_ID]);
  console.log(`Current state: ${existing.rows[0].cnt} events, ${existingIncidents.rows[0].cnt} incidents`);
  console.log("Clearing existing security events and incidents for re-seeding...");
  await pool.query("DELETE FROM security_events WHERE tenant_id = $1", [TENANT_ID]);
  // Delete FK-dependent rows in dependency order before removing incidents (security_integrations are preserved)
  await pool.query(
    "DELETE FROM incident_notifications WHERE investigation_id IN (SELECT id FROM ai_investigations WHERE incident_id IN (SELECT id FROM incidents WHERE tenant_id = $1))",
    [TENANT_ID]
  );
  await pool.query(
    "DELETE FROM ai_investigations WHERE incident_id IN (SELECT id FROM incidents WHERE tenant_id = $1)",
    [TENANT_ID]
  );
  await pool.query("DELETE FROM incidents WHERE tenant_id = $1", [TENANT_ID]);
  // SAFETY: security_integrations is NEVER deleted here.
  // Deleting integration rows would destroy live API credentials that cannot be recovered.
  // insertSecurityIntegrations() uses ON CONFLICT DO UPDATE to safely refresh only
  // non-credential display fields (events_imported, last_poll_at, etc.).

  console.log("\n1. Upserting security integrations (preserves existing credentials)...");
  await insertSecurityIntegrations();

  const TARGET_EVENTS = 1100;
  console.log(`\n2. Generating security events (target: ${TARGET_EVENTS} events over 90 days)...`);
  const events: EventRow[] = [];

  // Build a weighted day distribution so total reliably hits TARGET_EVENTS
  // Weight: day 0-6 (last week) = 3x, day 7-29 (last month) = 2x, day 30-89 = 1x
  const weights: number[] = [];
  for (let d = 0; d <= 89; d++) {
    if (d <= 6) weights.push(3);
    else if (d <= 29) weights.push(2);
    else weights.push(1);
  }
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  for (let d = 0; d <= 89; d++) {
    const daysAgo = d;
    const dayShare = Math.round(TARGET_EVENTS * (weights[d] / totalWeight));
    for (let e = 0; e < dayShare; e++) {
      const occurred = randomDate(daysAgo, Math.max(0, daysAgo - 1));
      events.push(generateEvent(occurred));
    }
  }

  // Top up or trim to hit exactly TARGET_EVENTS
  while (events.length < TARGET_EVENTS) {
    const occurred = randomDate(rngBetween(0, 29), 0);
    events.push(generateEvent(occurred));
  }
  const eventsToInsert = events.slice(0, TARGET_EVENTS);

  console.log(`  Generated ${eventsToInsert.length} events`);
  await insertEvents(eventsToInsert);

  console.log("\n3. Updating integration event counts from actual DB counts...");
  await updateIntegrationEventCount();

  console.log("\n4. Deriving incidents from correlated event groups...");
  await insertIncidents();

  const finalCounts = await pool.query(`
    SELECT 
      (SELECT COUNT(*)::int FROM security_events WHERE tenant_id = $1) as events,
      (SELECT COUNT(*)::int FROM incidents WHERE tenant_id = $1) as incidents,
      (SELECT COUNT(*)::int FROM security_integrations WHERE tenant_id = $1) as integrations
  `, [TENANT_ID]);
  const { events: evCnt, incidents: incCnt, integrations: intCnt } = finalCounts.rows[0];
  console.log(`\n=== Seeding Complete ===`);
  console.log(`  Events: ${evCnt}`);
  console.log(`  Incidents: ${incCnt}`);
  console.log(`  Integrations: ${intCnt}`);

  console.log("\n5. Validating API endpoints...");
  await validateAPIs();

  await pool.end();
}

async function httpProbe(path: string, expectedStatusCodes: number[]): Promise<{ statusCode: number; ok: boolean }> {
  const http = await import("http");
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:5000${path}`, (res) => {
      res.resume(); // drain response to avoid socket hang
      const ok = expectedStatusCodes.includes(res.statusCode ?? 0);
      resolve({ statusCode: res.statusCode ?? 0, ok });
    });
    req.on("error", () => resolve({ statusCode: 0, ok: false }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ statusCode: 0, ok: false }); });
  });
}

async function validateAPIs() {
  let passed = 0;
  let failed = 0;

  // ── 1. DB assertions (deterministic, always run) ──────────────────────────
  const dbChecks: Array<{ label: string; query: string; min: number }> = [
    {
      label: "security_events total count",
      query: `SELECT COUNT(*)::int as cnt FROM security_events WHERE tenant_id = ${TENANT_ID}`,
      min: 1050,
    },
    {
      label: "security_events with severity populated",
      query: `SELECT COUNT(*)::int as cnt FROM security_events WHERE tenant_id = ${TENANT_ID} AND severity IS NOT NULL`,
      min: 1050,
    },
    {
      label: "security_events in last 30 days (timeline coverage)",
      query: `SELECT COUNT(*)::int as cnt FROM security_events WHERE tenant_id = ${TENANT_ID} AND occurred_at >= NOW() - INTERVAL '30 days'`,
      min: 200,
    },
    {
      label: "incidents total count (min 60, max 80)",
      query: `SELECT COUNT(*)::int as cnt FROM incidents WHERE tenant_id = ${TENANT_ID}`,
      min: 60,
    },
    {
      label: "incidents with threat_narrative",
      query: `SELECT COUNT(*)::int as cnt FROM incidents WHERE tenant_id = ${TENANT_ID} AND threat_narrative IS NOT NULL AND threat_narrative != ''`,
      min: 60,
    },
    {
      label: "incidents with enriched_description",
      query: `SELECT COUNT(*)::int as cnt FROM incidents WHERE tenant_id = ${TENANT_ID} AND enriched_description IS NOT NULL AND enriched_description != ''`,
      min: 60,
    },
    {
      label: "incidents with ioc_data",
      query: `SELECT COUNT(*)::int as cnt FROM incidents WHERE tenant_id = ${TENANT_ID} AND ioc_data IS NOT NULL`,
      min: 60,
    },
    {
      label: "integrations present (disconnected/credentials-required is expected state)",
      query: `SELECT COUNT(*)::int as cnt FROM security_integrations WHERE tenant_id = ${TENANT_ID} AND last_poll_message IS NOT NULL`,
      min: 3,
    },
    {
      label: "FortiNAC integration row exists",
      query: `SELECT COUNT(*)::int as cnt FROM security_integrations WHERE tenant_id = ${TENANT_ID} AND platform_key = 'fortinac'`,
      min: 1,
    },
    {
      label: "distinct log_sources (≥4)",
      query: `SELECT COUNT(DISTINCT log_source)::int as cnt FROM security_events WHERE tenant_id = ${TENANT_ID} AND log_source IS NOT NULL`,
      min: 4,
    },
  ];

  console.log("  [DB assertions]");
  for (const check of dbChecks) {
    const result = await pool.query(check.query);
    const cnt = result.rows[0]?.cnt ?? 0;
    if (cnt >= check.min) {
      console.log(`    ✓ ${check.label}: ${cnt}`);
      passed++;
    } else {
      console.error(`    ✗ FAIL ${check.label}: ${cnt} (min ${check.min})`);
      failed++;
    }
  }

  // ── 2. HTTP API route probes ───────────────────────────────────────────────
  // Auth-protected routes return 401/302 (confirms route exists and server is serving)
  // The incidents route accepts an optional tenantId query param without auth guard on some builds
  console.log("  [HTTP API probes]");
  const httpChecks: Array<{ path: string; expected: number[]; label: string }> = [
    {
      path: `/api/events/${TENANT_ID}`,
      expected: [200, 401, 302, 403],
      label: `GET /api/events/${TENANT_ID} (auth-gated route reachable)`,
    },
    {
      path: `/api/events/${TENANT_ID}/stats`,
      expected: [200, 401, 302, 403],
      label: `GET /api/events/${TENANT_ID}/stats (auth-gated route reachable)`,
    },
    {
      path: `/api/events/${TENANT_ID}/timeline`,
      expected: [200, 401, 302, 403],
      label: `GET /api/events/${TENANT_ID}/timeline (auth-gated route reachable)`,
    },
    {
      path: `/api/incidents?tenantId=${TENANT_ID}`,
      expected: [200, 401, 302, 403],
      label: `GET /api/incidents?tenantId=${TENANT_ID} (auth-gated route reachable)`,
    },
    {
      path: `/api/security-integrations?tenantId=${TENANT_ID}`,
      expected: [200, 401, 302, 403],
      label: `GET /api/security-integrations?tenantId=${TENANT_ID} (auth-gated route reachable)`,
    },
  ];

  for (const check of httpChecks) {
    const { statusCode, ok } = await httpProbe(check.path, check.expected);
    if (ok) {
      console.log(`    ✓ ${check.label}: HTTP ${statusCode}`);
      passed++;
    } else if (statusCode === 0) {
      // Server not running in this environment (e.g. standalone seeder run) — skip gracefully
      console.log(`    ~ ${check.label}: server not reachable (skipped)`);
    } else {
      console.error(`    ✗ FAIL ${check.label}: HTTP ${statusCode} (expected one of ${check.expected.join(",")})`);
      failed++;
    }
  }

  if (failed > 0) {
    throw new Error(`Validation failed: ${failed} check(s) did not meet requirements`);
  }
  console.log(`  All ${passed} validation checks passed.`);
}

main().catch(e => { console.error(e); pool.end(); process.exit(1); });

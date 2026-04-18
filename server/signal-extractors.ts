import type { AttackCategory } from "@shared/schema";

export interface SignalResult {
  name: string;
  matched: boolean;
  weight: number;
  value?: string;
}

export interface ExtractorResult {
  category: AttackCategory;
  signalScore: number;
  signals: SignalResult[];
  entities: {
    ips: string[];
    users: string[];
    hosts: string[];
    hashes: string[];
    domains: string[];
  };
  subTypeHints: string[];
}

function flatten(event: Record<string, any>): string {
  try {
    return JSON.stringify(event).toLowerCase();
  } catch {
    return "";
  }
}

function matchKeywords(text: string, keywords: string[]): string[] {
  return keywords.filter(k => text.includes(k.toLowerCase()));
}

function extractIPs(event: Record<string, any>): string[] {
  const ipFields = ["sourceIp", "source_ip", "attacker", "destinationIp", "destination_ip", "target", "clientIp"];
  const IPV4 = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g;
  const results: string[] = [];
  const text = JSON.stringify(event);
  const matches = text.match(IPV4) || [];
  const PRIVATE = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.)/;
  for (const ip of matches) {
    if (!PRIVATE.test(ip) && !results.includes(ip)) results.push(ip);
  }
  return results.slice(0, 10);
}

function extractHashes(event: Record<string, any>): string[] {
  const hashFields = ["md5", "sha1", "sha256", "hash", "fileHash", "file_hash", "processHash"];
  const results: string[] = [];
  const text = JSON.stringify(event);
  const md5 = text.match(/\b[a-f0-9]{32}\b/gi) || [];
  const sha256 = text.match(/\b[a-f0-9]{64}\b/gi) || [];
  for (const h of [...md5, ...sha256]) {
    if (!results.includes(h.toLowerCase())) results.push(h.toLowerCase());
  }
  return results.slice(0, 5);
}

function extractUsers(event: Record<string, any>): string[] {
  const userFields = ["userName", "user_name", "user", "userId", "accountName", "actor", "principal"];
  const results: string[] = [];
  for (const f of userFields) {
    const v = event[f] || event.raw_payload?.[f];
    if (v && typeof v === "string" && v.length > 1 && v.length < 100) {
      const clean = v.split("\\").pop()?.split("@")[0]?.trim() || "";
      if (clean && !["system", "root", "admin", "local service"].includes(clean.toLowerCase()) && !results.includes(clean)) {
        results.push(clean);
      }
    }
  }
  return results.slice(0, 5);
}

function extractHosts(event: Record<string, any>): string[] {
  const hostFields = ["hostname", "host", "asset", "device", "computer", "endpoint", "machine"];
  const results: string[] = [];
  for (const f of hostFields) {
    const v = event[f] || event.raw_payload?.[f];
    if (v && typeof v === "string" && v.length > 1 && v.length < 100 && !v.includes(" ")) {
      if (!results.includes(v)) results.push(v);
    }
  }
  if (event.asset && !results.includes(event.asset)) results.push(event.asset);
  return results.slice(0, 5);
}

function extractDomains(event: Record<string, any>): string[] {
  const DOMAIN_RE = /\b([a-z0-9][a-z0-9-]{0,61}[a-z0-9]?\.[a-z]{2,})\b/gi;
  const SAFE = new Set(["microsoft.com", "google.com", "amazon.com", "cloudflare.com", "windows.com"]);
  const text = JSON.stringify(event);
  const matches = text.match(DOMAIN_RE) || [];
  const results: string[] = [];
  for (const d of matches) {
    const lower = d.toLowerCase();
    if (!SAFE.has(lower) && !results.includes(lower)) results.push(lower);
  }
  return results.slice(0, 5);
}

function scoreSignals(signals: SignalResult[]): number {
  const matched = signals.filter(s => s.matched);
  if (matched.length === 0) return 0;
  const total = matched.reduce((s, sig) => s + sig.weight, 0);
  return Math.min(100, Math.round(total));
}

export function extractMalwareRansomwareSignals(event: Record<string, any>): ExtractorResult {
  const text = flatten(event);
  const signals: SignalResult[] = [
    { name: "file_hash_ioc", matched: extractHashes(event).length > 0, weight: 25 },
    { name: "mass_file_rename", matched: matchKeywords(text, ["mass file", "bulk rename", "file rename", "file extension changed"]).length > 0, weight: 30 },
    { name: "shadow_copy_deletion", matched: matchKeywords(text, ["vssadmin", "shadow copy", "shadowcopy", "delete shadows"]).length > 0, weight: 35 },
    { name: "encryption_entropy", matched: matchKeywords(text, ["encrypt", "ransomware", "ransom", ".locked", ".crypt", ".enc", ".wncry"]).length > 0, weight: 40 },
    { name: "c2_beacon", matched: matchKeywords(text, ["beacon", "c2", "command and control", "callback", "cobalt strike", "cobaltstrike"]).length > 0, weight: 30 },
    { name: "dropper_behavior", matched: matchKeywords(text, ["dropper", "downloader", "payload", "stageless", "stager"]).length > 0, weight: 20 },
    { name: "known_ransomware_family", matched: matchKeywords(text, ["wannacry", "ryuk", "conti", "lockbit", "blackcat", "revil", "emotet", "trickbot", "ryuk", "maze"]).length > 0, weight: 50 },
  ];
  const subTypeHints: string[] = [];
  if (signals[2].matched || signals[3].matched) subTypeHints.push("ransomware");
  if (signals[4].matched) subTypeHints.push("c2_malware");
  if (signals[5].matched) subTypeHints.push("dropper");
  return { category: "malware_ransomware", signalScore: scoreSignals(signals), signals, entities: { ips: extractIPs(event), users: extractUsers(event), hosts: extractHosts(event), hashes: extractHashes(event), domains: extractDomains(event) }, subTypeHints };
}

export function extractAPTSignals(event: Record<string, any>): ExtractorResult {
  const text = flatten(event);
  const signals: SignalResult[] = [
    { name: "low_and_slow", matched: matchKeywords(text, ["low and slow", "prolonged", "persistent", "long dwell", "dwell time"]).length > 0, weight: 30 },
    { name: "living_off_land", matched: matchKeywords(text, ["lotl", "living off the land", "lolbin", "certutil", "regsvr32", "mshta", "wmic", "bitsadmin"]).length > 0, weight: 35 },
    { name: "custom_implant", matched: matchKeywords(text, ["implant", "backdoor", "rat ", "remote access tool", "custom malware"]).length > 0, weight: 40 },
    { name: "multi_stage_killchain", matched: matchKeywords(text, ["lateral movement", "privilege escalation", "credential dump", "data collection"]).length > 0, weight: 30 },
    { name: "apt_group_mentioned", matched: matchKeywords(text, ["apt28", "apt29", "apt41", "fancy bear", "cozy bear", "lazarus", "equation group", "carbanak"]).length > 0, weight: 50 },
  ];
  const subTypeHints: string[] = ["apt"];
  if (signals[1].matched) subTypeHints.push("lotl");
  if (signals[4].matched) subTypeHints.push("known_apt_group");
  return { category: "apt_targeted", signalScore: scoreSignals(signals), signals, entities: { ips: extractIPs(event), users: extractUsers(event), hosts: extractHosts(event), hashes: extractHashes(event), domains: extractDomains(event) }, subTypeHints };
}

export function extractPhishingSignals(event: Record<string, any>): ExtractorResult {
  const text = flatten(event);
  const signals: SignalResult[] = [
    { name: "suspicious_sender_domain", matched: matchKeywords(text, ["phishing", "spearphish", "spear-phish", "lookalike", "typosquat"]).length > 0, weight: 35 },
    { name: "credential_harvesting_url", matched: matchKeywords(text, ["credential harvest", "login page", "fake login", "credential theft", "credential capture"]).length > 0, weight: 40 },
    { name: "bec_pattern", matched: matchKeywords(text, ["bec", "business email compromise", "wire transfer", "invoice fraud", "ceo fraud"]).length > 0, weight: 45 },
    { name: "attachment_malicious", matched: matchKeywords(text, ["malicious attachment", "weaponized", "macro", "office macro", "xlsm", "docm"]).length > 0, weight: 35 },
    { name: "spearphishing_indicator", matched: matchKeywords(text, ["targeted email", "personalized lure", "pretexting", "impersonation"]).length > 0, weight: 30 },
    { name: "email_auth_failure", matched: matchKeywords(text, ["dkim fail", "spf fail", "dmarc fail", "spf=fail", "dkim=fail"]).length > 0, weight: 25 },
  ];
  const subTypeHints: string[] = [];
  if (signals[2].matched) subTypeHints.push("bec");
  if (signals[3].matched) subTypeHints.push("malicious_attachment");
  if (signals[4].matched) subTypeHints.push("spearphishing");
  return { category: "phishing_social_engineering", signalScore: scoreSignals(signals), signals, entities: { ips: extractIPs(event), users: extractUsers(event), hosts: extractHosts(event), hashes: extractHashes(event), domains: extractDomains(event) }, subTypeHints };
}

export function extractSpamSignals(event: Record<string, any>): ExtractorResult {
  const text = flatten(event);
  const signals: SignalResult[] = [
    { name: "volume_anomaly", matched: matchKeywords(text, ["bulk email", "mass email", "spam campaign", "high volume"]).length > 0, weight: 30 },
    { name: "header_anomaly", matched: matchKeywords(text, ["x-spam", "bulk header", "precedence: bulk", "list-unsubscribe"]).length > 0, weight: 20 },
    { name: "auth_failure_combined", matched: matchKeywords(text, ["spf=fail", "dkim=fail", "dmarc=fail"]).length > 0 && matchKeywords(text, ["spam", "unsolicited"]).length > 0, weight: 35 },
    { name: "spam_classification", matched: matchKeywords(text, ["spam", "unsolicited", "junk mail", "graymail"]).length > 0, weight: 25 },
  ];
  return { category: "spam_bulk_email", signalScore: scoreSignals(signals), signals, entities: { ips: extractIPs(event), users: extractUsers(event), hosts: extractHosts(event), hashes: extractHashes(event), domains: extractDomains(event) }, subTypeHints: ["spam"] };
}

export function extractWebAppAttackSignals(event: Record<string, any>): ExtractorResult {
  const text = flatten(event);
  const signals: SignalResult[] = [
    { name: "sqli_pattern", matched: matchKeywords(text, ["sql injection", "sqli", "union select", "or 1=1", "drop table", "' or '", "xp_cmdshell"]).length > 0, weight: 45 },
    { name: "xss_pattern", matched: matchKeywords(text, ["xss", "cross-site scripting", "<script>", "onerror=", "javascript:", "alert(", "document.cookie"]).length > 0, weight: 40 },
    { name: "ssrf_pattern", matched: matchKeywords(text, ["ssrf", "server-side request forgery", "169.254.169.254", "metadata.internal", "localhost:80"]).length > 0, weight: 45 },
    { name: "path_traversal", matched: matchKeywords(text, ["path traversal", "directory traversal", "../", "..\\", "%2e%2e%2f", "etc/passwd"]).length > 0, weight: 40 },
    { name: "command_injection", matched: matchKeywords(text, ["command injection", "cmd injection", "; cat ", "| nc ", "$(", "${", "`rm -rf"]).length > 0, weight: 45 },
    { name: "rfi_lfi", matched: matchKeywords(text, ["rfi", "lfi", "remote file inclusion", "local file inclusion", "include("]).length > 0, weight: 35 },
    { name: "owasp_top10", matched: matchKeywords(text, ["owasp", "waf block", "waf alert", "web attack", "api abuse", "deserialization"]).length > 0, weight: 25 },
    { name: "idor_pattern", matched: matchKeywords(text, ["idor", "insecure direct object", "object reference"]).length > 0, weight: 30 },
  ];
  const subTypeHints: string[] = [];
  if (signals[0].matched) subTypeHints.push("sqli");
  if (signals[1].matched) subTypeHints.push("xss");
  if (signals[2].matched) subTypeHints.push("ssrf");
  if (signals[4].matched) subTypeHints.push("command_injection");
  return { category: "web_application_attack", signalScore: scoreSignals(signals), signals, entities: { ips: extractIPs(event), users: extractUsers(event), hosts: extractHosts(event), hashes: extractHashes(event), domains: extractDomains(event) }, subTypeHints };
}

export function extractNetworkIntrusionSignals(event: Record<string, any>): ExtractorResult {
  const text = flatten(event);
  const signals: SignalResult[] = [
    { name: "port_scan", matched: matchKeywords(text, ["port scan", "portscan", "nmap", "masscan", "syn scan", "udp scan"]).length > 0, weight: 35 },
    { name: "service_enumeration", matched: matchKeywords(text, ["service enumeration", "banner grab", "fingerprint", "version scan"]).length > 0, weight: 30 },
    { name: "exploit_traffic", matched: matchKeywords(text, ["exploit", "cve-", "vulnerability exploit", "buffer overflow", "shellcode"]).length > 0, weight: 45 },
    { name: "dns_tunneling", matched: matchKeywords(text, ["dns tunnel", "dns exfil", "iodine", "dns2tcp", "dnscat"]).length > 0, weight: 45 },
    { name: "covert_channel", matched: matchKeywords(text, ["covert channel", "icmp tunnel", "steganography", "hidden channel"]).length > 0, weight: 40 },
    { name: "network_anomaly", matched: matchKeywords(text, ["network intrusion", "ids alert", "ips block", "snort alert", "suricata"]).length > 0, weight: 25 },
  ];
  const subTypeHints: string[] = [];
  if (signals[0].matched) subTypeHints.push("port_scan");
  if (signals[2].matched) subTypeHints.push("exploit");
  if (signals[3].matched) subTypeHints.push("dns_tunneling");
  return { category: "network_intrusion", signalScore: scoreSignals(signals), signals, entities: { ips: extractIPs(event), users: extractUsers(event), hosts: extractHosts(event), hashes: extractHashes(event), domains: extractDomains(event) }, subTypeHints };
}

export function extractBotSignals(event: Record<string, any>): ExtractorResult {
  const text = flatten(event);
  const signals: SignalResult[] = [
    { name: "credential_stuffing", matched: matchKeywords(text, ["credential stuffing", "credential spray", "password spray", "account takeover", "ato"]).length > 0, weight: 40 },
    { name: "brute_force", matched: matchKeywords(text, ["brute force", "bruteforce", "dictionary attack", "login attempt", "failed login"]).length > 0, weight: 35 },
    { name: "scraping_pattern", matched: matchKeywords(text, ["scraping", "web scraper", "data harvest", "automated crawler", "bot traffic"]).length > 0, weight: 30 },
    { name: "headless_browser", matched: matchKeywords(text, ["headless", "phantom", "puppeteer", "selenium", "webdriver"]).length > 0, weight: 35 },
    { name: "rate_anomaly", matched: matchKeywords(text, ["rate limit", "rate exceeded", "too many requests", "429", "throttle"]).length > 0, weight: 25 },
    { name: "distributed_scanner", matched: matchKeywords(text, ["distributed scan", "botnet scan", "scanner", "shodan"]).length > 0, weight: 30 },
  ];
  const subTypeHints: string[] = [];
  if (signals[0].matched) subTypeHints.push("credential_stuffing");
  if (signals[1].matched) subTypeHints.push("brute_force");
  if (signals[2].matched) subTypeHints.push("scraping");
  return { category: "bot_automated", signalScore: scoreSignals(signals), signals, entities: { ips: extractIPs(event), users: extractUsers(event), hosts: extractHosts(event), hashes: extractHashes(event), domains: extractDomains(event) }, subTypeHints };
}

export function extractAIGenerativeSignals(event: Record<string, any>): ExtractorResult {
  const text = flatten(event);
  const signals: SignalResult[] = [
    { name: "prompt_injection", matched: matchKeywords(text, ["prompt injection", "prompt attack", "jailbreak", "ignore previous instructions", "system prompt"]).length > 0, weight: 50 },
    { name: "llm_abuse", matched: matchKeywords(text, ["llm", "gpt", "chatgpt", "claude", "language model", "ai model abuse"]).length > 0 && matchKeywords(text, ["abuse", "misuse", "attack", "exploit", "bypass"]).length > 0, weight: 40 },
    { name: "model_exfiltration", matched: matchKeywords(text, ["model theft", "model extraction", "model inversion", "training data"]).length > 0, weight: 45 },
    { name: "synthetic_content", matched: matchKeywords(text, ["synthetic content", "deepfake", "ai-generated", "generative ai"]).length > 0 && matchKeywords(text, ["attack", "fraud", "scam", "phishing"]).length > 0, weight: 35 },
    { name: "automated_social_engineering", matched: matchKeywords(text, ["automated phishing", "ai phishing", "personalized attack at scale"]).length > 0, weight: 40 },
  ];
  return { category: "ai_generative", signalScore: scoreSignals(signals), signals, entities: { ips: extractIPs(event), users: extractUsers(event), hosts: extractHosts(event), hashes: extractHashes(event), domains: extractDomains(event) }, subTypeHints: ["ai_attack"] };
}

export function extractDatabaseAttackSignals(event: Record<string, any>): ExtractorResult {
  const text = flatten(event);
  const signals: SignalResult[] = [
    { name: "unusual_query", matched: matchKeywords(text, ["unusual query", "suspicious query", "bulk select", "select *", "dump table", "database dump"]).length > 0, weight: 35 },
    { name: "privilege_escalation_db", matched: matchKeywords(text, ["db privilege", "database privilege", "dba privilege", "grant all", "sysadmin"]).length > 0, weight: 40 },
    { name: "mass_extraction", matched: matchKeywords(text, ["mass extraction", "bulk extract", "large data export", "dump", "exfiltration from db"]).length > 0, weight: 45 },
    { name: "stored_proc_abuse", matched: matchKeywords(text, ["stored procedure", "xp_cmdshell", "sp_oacreate", "openrowset"]).length > 0, weight: 40 },
    { name: "db_auth_anomaly", matched: matchKeywords(text, ["database authentication", "db login fail", "mssql", "mysql", "postgresql", "db port", "1433", "3306", "5432"]).length > 0 && matchKeywords(text, ["fail", "unusual", "anomaly", "attack"]).length > 0, weight: 30 },
  ];
  return { category: "database_attack", signalScore: scoreSignals(signals), signals, entities: { ips: extractIPs(event), users: extractUsers(event), hosts: extractHosts(event), hashes: extractHashes(event), domains: extractDomains(event) }, subTypeHints: ["database"] };
}

export function extractFilelessSignals(event: Record<string, any>): ExtractorResult {
  const text = flatten(event);
  const signals: SignalResult[] = [
    { name: "powershell_abuse", matched: matchKeywords(text, ["powershell", "powershell -enc", "encoded command", "-nop -exec bypass", "invoke-expression", "iex "]).length > 0, weight: 40 },
    { name: "process_injection", matched: matchKeywords(text, ["process injection", "dll injection", "shellcode injection", "process hollowing", "createremotethread"]).length > 0, weight: 45 },
    { name: "lotl_tool_abuse", matched: matchKeywords(text, ["certutil", "regsvr32", "mshta", "rundll32", "wscript", "cscript", "wmic", "bitsadmin", "msiexec"]).length > 0, weight: 35 },
    { name: "reflective_dll", matched: matchKeywords(text, ["reflective dll", "reflective loading", "in-memory", "memorymodule", "pe injection"]).length > 0, weight: 45 },
    { name: "suspicious_parent_child", matched: matchKeywords(text, ["suspicious parent", "unusual parent", "word spawning", "excel spawning", "office spawning cmd"]).length > 0, weight: 40 },
    { name: "script_interpreter", matched: matchKeywords(text, ["wscript", "cscript", "jscript", "vbscript", "mshta.exe"]).length > 0 && matchKeywords(text, ["suspicious", "unusual", "malicious", "alert"]).length > 0, weight: 30 },
  ];
  const subTypeHints: string[] = [];
  if (signals[0].matched) subTypeHints.push("powershell");
  if (signals[1].matched) subTypeHints.push("process_injection");
  if (signals[2].matched) subTypeHints.push("lotl");
  if (signals[3].matched) subTypeHints.push("reflective_dll");
  return { category: "fileless_inmemory", signalScore: scoreSignals(signals), signals, entities: { ips: extractIPs(event), users: extractUsers(event), hosts: extractHosts(event), hashes: extractHashes(event), domains: extractDomains(event) }, subTypeHints };
}

export function extractLateralMovementSignals(event: Record<string, any>): ExtractorResult {
  const text = flatten(event);
  const signals: SignalResult[] = [
    { name: "psexec_wmi", matched: matchKeywords(text, ["psexec", "psremoting", "wmi execution", "wmiexec", "impacket"]).length > 0, weight: 45 },
    { name: "smb_spread", matched: matchKeywords(text, ["smb spread", "smb lateral", "admin share", "ipc$", "c$", "lateral smb"]).length > 0, weight: 40 },
    { name: "pass_the_hash", matched: matchKeywords(text, ["pass the hash", "pth", "pass-the-hash", "ntlm relay", "pass the ticket", "ptt", "kerberoast"]).length > 0, weight: 50 },
    { name: "rdp_ssh_hop", matched: matchKeywords(text, ["rdp lateral", "ssh hop", "rdp hop", "jump host", "bastion hop"]).length > 0, weight: 35 },
    { name: "service_creation", matched: matchKeywords(text, ["service creation", "sc create", "new service", "scheduled task lateral"]).length > 0, weight: 35 },
    { name: "internal_scan", matched: matchKeywords(text, ["internal scan", "internal recon", "lateral scan", "arp scan"]).length > 0, weight: 30 },
  ];
  const subTypeHints: string[] = [];
  if (signals[2].matched) subTypeHints.push("pass_the_hash");
  if (signals[0].matched) subTypeHints.push("psexec");
  return { category: "lateral_movement", signalScore: scoreSignals(signals), signals, entities: { ips: extractIPs(event), users: extractUsers(event), hosts: extractHosts(event), hashes: extractHashes(event), domains: extractDomains(event) }, subTypeHints };
}

export function extractUEBASignals(event: Record<string, any>): ExtractorResult {
  const text = flatten(event);
  const signals: SignalResult[] = [
    { name: "impossible_travel", matched: matchKeywords(text, ["impossible travel", "geo anomaly", "impossible location", "location anomaly"]).length > 0, weight: 50 },
    { name: "off_hours_access", matched: matchKeywords(text, ["off hours", "after hours", "unusual time", "weekend access", "midnight access"]).length > 0, weight: 30 },
    { name: "sensitive_resource_access", matched: matchKeywords(text, ["sensitive data", "privileged resource", "unusual access", "out of scope", "new resource"]).length > 0, weight: 35 },
    { name: "privilege_creep", matched: matchKeywords(text, ["privilege creep", "excessive permission", "over-privileged", "role escalation"]).length > 0, weight: 35 },
    { name: "bulk_download", matched: matchKeywords(text, ["bulk download", "large download", "mass download", "data hoarding"]).length > 0, weight: 40 },
    { name: "account_sharing", matched: matchKeywords(text, ["shared account", "account sharing", "multiple logins", "concurrent session", "simultaneous login"]).length > 0, weight: 35 },
    { name: "ueba_alert", matched: matchKeywords(text, ["ueba", "user behavior", "behavioral anomaly", "insider threat"]).length > 0, weight: 25 },
  ];
  const subTypeHints: string[] = [];
  if (signals[0].matched) subTypeHints.push("impossible_travel");
  if (signals[4].matched) subTypeHints.push("bulk_download");
  if (signals[6].matched) subTypeHints.push("insider_threat");
  return { category: "suspicious_user_behavior", signalScore: scoreSignals(signals), signals, entities: { ips: extractIPs(event), users: extractUsers(event), hosts: extractHosts(event), hashes: extractHashes(event), domains: extractDomains(event) }, subTypeHints };
}

export function extractNetworkBehaviorSignals(event: Record<string, any>): ExtractorResult {
  const text = flatten(event);
  const signals: SignalResult[] = [
    { name: "beaconing", matched: matchKeywords(text, ["beacon", "beaconing", "periodic connection", "c2 beacon", "heartbeat"]).length > 0, weight: 45 },
    { name: "exfiltration_volume", matched: matchKeywords(text, ["data exfil", "large outbound", "volume spike", "high bandwidth outbound", "data leak"]).length > 0, weight: 40 },
    { name: "non_standard_port", matched: matchKeywords(text, ["non-standard port", "unusual port", "uncommon port", "high port"]).length > 0, weight: 30 },
    { name: "tor_vpn_exit", matched: matchKeywords(text, ["tor exit", "tor node", "vpn exit", "anonymizer", "tor browser"]).length > 0, weight: 45 },
    { name: "long_duration", matched: matchKeywords(text, ["long connection", "persistent connection", "long session", "connection duration"]).length > 0, weight: 30 },
    { name: "unusual_outbound", matched: matchKeywords(text, ["unusual outbound", "suspicious outbound", "unexpected destination"]).length > 0, weight: 35 },
  ];
  const subTypeHints: string[] = [];
  if (signals[0].matched) subTypeHints.push("beaconing");
  if (signals[1].matched) subTypeHints.push("data_exfiltration");
  if (signals[3].matched) subTypeHints.push("tor_vpn");
  return { category: "suspicious_network_activity", signalScore: scoreSignals(signals), signals, entities: { ips: extractIPs(event), users: extractUsers(event), hosts: extractHosts(event), hashes: extractHashes(event), domains: extractDomains(event) }, subTypeHints };
}

export function extractCloudSignals(event: Record<string, any>): ExtractorResult {
  const text = flatten(event);
  const signals: SignalResult[] = [
    { name: "misconfiguration_exploit", matched: matchKeywords(text, ["misconfiguration", "cloud misconfiguration", "open bucket", "public s3", "exposed storage"]).length > 0, weight: 40 },
    { name: "api_key_abuse", matched: matchKeywords(text, ["api key abuse", "api key leak", "stolen api key", "unauthorized api", "api credential"]).length > 0, weight: 45 },
    { name: "iam_escalation", matched: matchKeywords(text, ["iam privilege", "iam escalation", "role assumption", "privilege escalation aws", "iam role abuse"]).length > 0, weight: 45 },
    { name: "crypto_mining", matched: matchKeywords(text, ["crypto mining", "cryptomining", "monero", "xmrig", "resource hijack", "mining pool"]).length > 0, weight: 40 },
    { name: "metadata_ssrf", matched: matchKeywords(text, ["metadata service", "169.254.169.254", "imds", "ec2 metadata", "gcp metadata"]).length > 0, weight: 50 },
    { name: "cloud_log_tampering", matched: matchKeywords(text, ["cloudtrail disabled", "log tampering", "audit log delete", "disable logging"]).length > 0, weight: 40 },
  ];
  const subTypeHints: string[] = [];
  if (signals[2].matched) subTypeHints.push("iam_escalation");
  if (signals[3].matched) subTypeHints.push("crypto_mining");
  if (signals[4].matched) subTypeHints.push("metadata_ssrf");
  return { category: "cloud_infrastructure", signalScore: scoreSignals(signals), signals, entities: { ips: extractIPs(event), users: extractUsers(event), hosts: extractHosts(event), hashes: extractHashes(event), domains: extractDomains(event) }, subTypeHints };
}

export function extractOTIoTSignals(event: Record<string, any>): ExtractorResult {
  const text = flatten(event);
  const signals: SignalResult[] = [
    { name: "ot_protocol_anomaly", matched: matchKeywords(text, ["modbus", "dnp3", "bacnet", "iec 61850", "profinet", "ethercat", "scada"]).length > 0 && matchKeywords(text, ["anomaly", "unusual", "attack", "alert"]).length > 0, weight: 50 },
    { name: "firmware_anomaly", matched: matchKeywords(text, ["firmware update", "firmware anomaly", "unauthorized firmware", "firmware tampering"]).length > 0, weight: 45 },
    { name: "iot_device_anomaly", matched: matchKeywords(text, ["iot device", "smart device", "embedded device", "connected device", "iot attack"]).length > 0, weight: 35 },
    { name: "physical_cyber", matched: matchKeywords(text, ["physical access", "physical-cyber", "sensor manipulation", "plc attack", "hmi attack"]).length > 0, weight: 45 },
  ];
  return { category: "ot_iot", signalScore: scoreSignals(signals), signals, entities: { ips: extractIPs(event), users: extractUsers(event), hosts: extractHosts(event), hashes: extractHashes(event), domains: extractDomains(event) }, subTypeHints: ["ot_iot"] };
}

const ALL_EXTRACTORS: Array<(event: Record<string, any>) => ExtractorResult> = [
  extractMalwareRansomwareSignals,
  extractAPTSignals,
  extractPhishingSignals,
  extractSpamSignals,
  extractWebAppAttackSignals,
  extractNetworkIntrusionSignals,
  extractBotSignals,
  extractAIGenerativeSignals,
  extractDatabaseAttackSignals,
  extractFilelessSignals,
  extractLateralMovementSignals,
  extractUEBASignals,
  extractNetworkBehaviorSignals,
  extractCloudSignals,
  extractOTIoTSignals,
];

export function runAllExtractors(event: Record<string, any>): ExtractorResult[] {
  return ALL_EXTRACTORS.map(extractor => {
    try {
      return extractor(event);
    } catch (e) {
      return {
        category: "malware_ransomware" as AttackCategory,
        signalScore: 0,
        signals: [],
        entities: { ips: [], users: [], hosts: [], hashes: [], domains: [] },
        subTypeHints: [],
      };
    }
  }).sort((a, b) => b.signalScore - a.signalScore);
}

export function mergeEntities(results: ExtractorResult[]): ExtractorResult["entities"] {
  const merged: ExtractorResult["entities"] = { ips: [], users: [], hosts: [], hashes: [], domains: [] };
  for (const r of results) {
    for (const ip of r.entities.ips) { if (!merged.ips.includes(ip)) merged.ips.push(ip); }
    for (const u of r.entities.users) { if (!merged.users.includes(u)) merged.users.push(u); }
    for (const h of r.entities.hosts) { if (!merged.hosts.includes(h)) merged.hosts.push(h); }
    for (const h of r.entities.hashes) { if (!merged.hashes.includes(h)) merged.hashes.push(h); }
    for (const d of r.entities.domains) { if (!merged.domains.includes(d)) merged.domains.push(d); }
  }
  return merged;
}

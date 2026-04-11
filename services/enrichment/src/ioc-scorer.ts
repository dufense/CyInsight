export interface IOCIndicator {
  type: "ip" | "domain" | "hash" | "url" | "email";
  value: string;
  reputation: "malicious" | "suspicious" | "clean" | "unknown";
  source: string;
  confidence: number;
  firstSeen?: string;
  lastSeen?: string;
  tags?: string[];
}

export interface IOCScorerConfig {
  redisTTL: number;
  redisUrl?: string;
}

interface CacheEntry {
  reputation: IOCIndicator["reputation"];
  confidence: number;
  tags: string[];
  cachedAt: number;
}

const PRIVATE_IP_REGEX = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.|169\.254\.|::1|fe80:)/;
const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
const IPV6_REGEX = /^([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$/i;
const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const MD5_REGEX = /^[a-f0-9]{32}$/i;
const SHA1_REGEX = /^[a-f0-9]{40}$/i;
const SHA256_REGEX = /^[a-f0-9]{64}$/i;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

const KNOWN_MALICIOUS_PATTERNS = [
  /cobalt\s*strike/i,
  /mimikatz/i,
  /metasploit/i,
  /empire/i,
  /c2\s*server/i,
  /command.*control/i,
  /ransomware/i,
  /cryptolocker/i,
  /wannacry/i,
  /emotet/i,
  /trickbot/i,
  /ryuk/i,
  /conti/i,
  /lockbit/i,
];

const SAFE_DOMAINS = new Set([
  "google.com", "microsoft.com", "apple.com", "amazon.com", "cloudflare.com",
  "amazonaws.com", "azure.com", "office365.com", "office.com", "live.com",
  "outlook.com", "github.com", "gitlab.com", "stackoverflow.com",
  "wikipedia.org", "mozilla.org", "ubuntu.com", "debian.org",
  "windowsupdate.com", "windows.com", "bing.com", "akamai.net",
  "cloudfront.net", "fastly.net", "cdn.jsdelivr.net",
]);

export class IOCScorer {
  private cache: Map<string, CacheEntry> = new Map();
  private config: IOCScorerConfig;
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(config: IOCScorerConfig) {
    this.config = config;
    setInterval(() => this.cleanExpiredCache(), 60000);
  }

  extractAndScore(event: Record<string, any>): IOCIndicator[] {
    const indicators: IOCIndicator[] = [];
    const seen = new Set<string>();

    const ips = this.extractIPs(event);
    const domains = this.extractDomains(event);
    const hashes = this.extractHashes(event);
    const emails = this.extractEmails(event);
    const urls = this.extractURLs(event);

    const severity = (event.severity || "medium").toLowerCase();
    const isMalicious = severity === "critical" || severity === "high";
    const isSuspicious = severity === "medium";

    for (const ip of ips) {
      if (seen.has(`ip:${ip}`)) continue;
      seen.add(`ip:${ip}`);

      if (PRIVATE_IP_REGEX.test(ip)) continue;

      const cached = this.getCached("ip", ip);
      const isAttacker = event.attacker === ip || event.sourceIp === ip;

      indicators.push({
        type: "ip",
        value: ip,
        reputation: cached?.reputation ||
          (isAttacker && isMalicious ? "malicious" : isAttacker && isSuspicious ? "suspicious" : "unknown"),
        confidence: cached?.confidence || (isAttacker && isMalicious ? 80 : isAttacker ? 50 : 20),
        source: event.logSource || event.sourceType || "unknown",
        tags: cached?.tags || [],
        lastSeen: new Date().toISOString(),
      });
    }

    for (const domain of domains) {
      if (seen.has(`domain:${domain}`)) continue;
      seen.add(`domain:${domain}`);

      const rootDomain = domain.split(".").slice(-2).join(".");
      if (SAFE_DOMAINS.has(rootDomain) || SAFE_DOMAINS.has(domain)) continue;

      const cached = this.getCached("domain", domain);

      indicators.push({
        type: "domain",
        value: domain,
        reputation: cached?.reputation || (isMalicious ? "suspicious" : "unknown"),
        confidence: cached?.confidence || (isMalicious ? 60 : 20),
        source: event.logSource || event.sourceType || "unknown",
        tags: cached?.tags || [],
        lastSeen: new Date().toISOString(),
      });
    }

    for (const hash of hashes) {
      if (seen.has(`hash:${hash}`)) continue;
      seen.add(`hash:${hash}`);

      const cached = this.getCached("hash", hash);

      indicators.push({
        type: "hash",
        value: hash,
        reputation: cached?.reputation ||
          (isMalicious ? "malicious" : isSuspicious ? "suspicious" : "unknown"),
        confidence: cached?.confidence || (isMalicious ? 75 : isSuspicious ? 50 : 20),
        source: event.logSource || event.sourceType || "unknown",
        tags: cached?.tags || [],
        lastSeen: new Date().toISOString(),
      });
    }

    for (const email of emails) {
      if (seen.has(`email:${email}`)) continue;
      seen.add(`email:${email}`);

      const isSender = event.sender === email || event.from === email;
      if (!isSender || !isMalicious) continue;

      const cached = this.getCached("email", email);

      indicators.push({
        type: "email",
        value: email,
        reputation: cached?.reputation || "suspicious",
        confidence: cached?.confidence || 50,
        source: event.logSource || event.sourceType || "unknown",
        tags: cached?.tags || [],
        lastSeen: new Date().toISOString(),
      });
    }

    for (const url of urls) {
      if (seen.has(`url:${url}`)) continue;
      seen.add(`url:${url}`);

      const cached = this.getCached("url", url);
      const hasMaliciousPattern = KNOWN_MALICIOUS_PATTERNS.some((p) => p.test(url));

      indicators.push({
        type: "url",
        value: url,
        reputation: cached?.reputation ||
          (hasMaliciousPattern ? "malicious" : isMalicious ? "suspicious" : "unknown"),
        confidence: cached?.confidence || (hasMaliciousPattern ? 90 : 30),
        source: event.logSource || event.sourceType || "unknown",
        tags: cached?.tags || [],
        lastSeen: new Date().toISOString(),
      });
    }

    return indicators;
  }

  checkReputation(type: string, value: string): { reputation: string; confidence: number; cached: boolean } {
    const cached = this.getCached(type, value);
    if (cached) {
      return { reputation: cached.reputation, confidence: cached.confidence, cached: true };
    }
    return { reputation: "unknown", confidence: 0, cached: false };
  }

  updateReputation(type: string, value: string, reputation: IOCIndicator["reputation"], confidence: number, tags: string[] = []): void {
    const key = `${type}:${value}`;
    this.cache.set(key, {
      reputation,
      confidence,
      tags,
      cachedAt: Date.now(),
    });
  }

  getCacheStats(): { size: number; hits: number; misses: number; hitRate: string } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      size: this.cache.size,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? (this.cacheHits / total * 100).toFixed(1) + "%" : "0%",
    };
  }

  private getCached(type: string, value: string): CacheEntry | null {
    const key = `${type}:${value}`;
    const entry = this.cache.get(key);
    if (!entry) {
      this.cacheMisses++;
      return null;
    }
    if (Date.now() - entry.cachedAt > this.config.redisTTL * 1000) {
      this.cache.delete(key);
      this.cacheMisses++;
      return null;
    }
    this.cacheHits++;
    return entry;
  }

  private cleanExpiredCache(): void {
    const now = Date.now();
    const ttlMs = this.config.redisTTL * 1000;
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.cachedAt > ttlMs) {
        this.cache.delete(key);
      }
    }
  }

  private extractIPs(event: Record<string, any>): string[] {
    const ips: string[] = [];
    const ipFields = [
      "sourceIp", "source_ip", "srcIp", "src_ip", "attacker",
      "destinationIp", "destination_ip", "destIp", "dest_ip", "target",
      "clientIp", "client_ip", "serverIp", "server_ip",
      "senderIP", "sender_ip", "remoteAddr", "remote_addr",
    ];

    for (const field of ipFields) {
      const val = this.getNestedValue(event, field);
      if (typeof val === "string" && (IPV4_REGEX.test(val) || IPV6_REGEX.test(val))) {
        ips.push(val);
      }
    }

    const text = JSON.stringify(event);
    const ipMatches = text.match(/\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g);
    if (ipMatches) {
      for (const ip of ipMatches) {
        if (!ips.includes(ip)) ips.push(ip);
      }
    }

    return ips;
  }

  private extractDomains(event: Record<string, any>): string[] {
    const domains: string[] = [];
    const domainFields = [
      "domain", "senderDomain", "sender_domain", "hostname",
      "host", "fqdn", "serverName", "server_name",
      "destinationDomain", "destination_domain",
    ];

    for (const field of domainFields) {
      const val = this.getNestedValue(event, field);
      if (typeof val === "string" && DOMAIN_REGEX.test(val)) {
        domains.push(val.toLowerCase());
      }
    }

    return domains;
  }

  private extractHashes(event: Record<string, any>): string[] {
    const hashes: string[] = [];
    const hashFields = [
      "md5", "sha1", "sha256", "hash", "fileHash", "file_hash",
      "processHash", "process_hash", "sha256Hash",
    ];

    for (const field of hashFields) {
      const val = this.getNestedValue(event, field);
      if (typeof val === "string") {
        if (MD5_REGEX.test(val) || SHA1_REGEX.test(val) || SHA256_REGEX.test(val)) {
          hashes.push(val.toLowerCase());
        }
      }
    }

    return hashes;
  }

  private extractEmails(event: Record<string, any>): string[] {
    const emails: string[] = [];
    const emailFields = [
      "sender", "from", "fromAddress", "from_address",
      "recipient", "to", "toAddress", "to_address",
      "email", "userEmail", "user_email",
    ];

    for (const field of emailFields) {
      const val = this.getNestedValue(event, field);
      if (typeof val === "string" && EMAIL_REGEX.test(val)) {
        emails.push(val.toLowerCase());
      }
    }

    return emails;
  }

  private extractURLs(event: Record<string, any>): string[] {
    const urls: string[] = [];
    const urlFields = ["url", "requestUrl", "request_url", "targetUrl", "target_url", "link"];

    for (const field of urlFields) {
      const val = this.getNestedValue(event, field);
      if (typeof val === "string" && URL_REGEX.test(val)) {
        urls.push(val);
      }
    }

    return urls;
  }

  private getNestedValue(obj: Record<string, any>, field: string): any {
    if (obj[field] !== undefined) return obj[field];

    if (obj.payload && obj.payload[field] !== undefined) return obj.payload[field];
    if (obj.rawPayload && obj.rawPayload[field] !== undefined) return obj.rawPayload[field];

    return undefined;
  }
}

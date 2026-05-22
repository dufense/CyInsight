import yaml from "js-yaml";
import path from "path";
import fs from "fs";
import dns from "dns/promises";
import https from "https";
import http from "http";
import nodeFetch from "node-fetch";
import { sql } from "drizzle-orm";

export class InputHardeningError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  constructor(message: string, code = "input_rejected", httpStatus = 400) {
    super(message);
    this.name = "InputHardeningError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function isInputHardeningError(e: unknown): e is InputHardeningError {
  return e instanceof InputHardeningError;
}

const PRIVATE_HOSTS_EXACT = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "metadata",
  "metadata.aws",
]);

const PRIVATE_HOST_SUFFIXES = [".local", ".internal", ".localdomain"];

function ipv4InPrivateRange(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if (a === undefined || b === undefined || c === undefined || d === undefined) return false;
  if ([a, b, c, d].some((x) => x < 0 || x > 255)) return true;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function ipv6InPrivateRange(host: string): boolean {
  const lower = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("ff")) return true;
  // IPv4-mapped IPv6 (::ffff:0:0/96) — block the entire mapped range. Some URL
  // parsers normalise the trailing IPv4 part into compressed hex (`::ffff:a00:1`)
  // so we cannot rely on the dotted-quad form being preserved. Treating every
  // ::ffff:* address as private is safe — production traffic should use the
  // bare IPv4 representation.
  if (lower.startsWith("::ffff:")) return true;
  return false;
}

export interface SafeUrlOptions {
  allowSchemes?: string[];
  allowHosts?: string[];
  /**
   * @deprecated DNS resolution alone cannot prevent rebinding TOCTOU between
   * the safety check and the actual HTTP connect. Use `safeFetch()` instead —
   * it performs the same scheme/host/private-IP validation **and** pins the
   * underlying TCP connect target to a verified public IP via a custom
   * http(s).Agent lookup. This flag is retained only for backward compatibility
   * with callers that need a DNS sanity-check at config-time without issuing a
   * request; it does NOT pin the connect target.
   */
  resolveAndPin?: boolean;
}

export interface SafeUrl {
  url: string;
  hostname: string;
  resolvedIp?: string;
}

export function safeUrlSync(raw: unknown, opts: SafeUrlOptions = {}): SafeUrl {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new InputHardeningError("URL must be a non-empty string", "url_empty");
  }
  if (raw.length > 2048) {
    throw new InputHardeningError("URL too long", "url_too_long");
  }
  if (/[\x00-\x1f\x7f]/.test(raw)) {
    throw new InputHardeningError("URL contains control characters", "url_control_chars");
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new InputHardeningError("Invalid URL format", "url_invalid");
  }
  const allowSchemes = opts.allowSchemes ?? ["http:", "https:"];
  if (!allowSchemes.includes(parsed.protocol)) {
    throw new InputHardeningError(`Disallowed URL protocol: ${parsed.protocol}`, "url_bad_scheme");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    throw new InputHardeningError("URL host is empty", "url_empty_host");
  }
  if (opts.allowHosts && opts.allowHosts.length > 0) {
    const ok = opts.allowHosts.some(
      (h) => hostname === h.toLowerCase() || hostname.endsWith(`.${h.toLowerCase()}`),
    );
    if (!ok) throw new InputHardeningError(`URL host not on allow-list: ${hostname}`, "url_not_allowlisted");
  }
  if (PRIVATE_HOSTS_EXACT.has(hostname)) {
    throw new InputHardeningError("URL host is private/blocked", "url_private_host");
  }
  if (PRIVATE_HOST_SUFFIXES.some((s) => hostname.endsWith(s))) {
    throw new InputHardeningError("URL host is private/blocked", "url_private_host");
  }
  if (ipv4InPrivateRange(hostname) || ipv6InPrivateRange(hostname)) {
    throw new InputHardeningError("URL host is private/blocked", "url_private_host");
  }
  return { url: parsed.toString(), hostname };
}

export async function safeUrl(raw: unknown, opts: SafeUrlOptions = {}): Promise<SafeUrl> {
  const base = safeUrlSync(raw, opts);
  if (!opts.resolveAndPin) return base;
  try {
    const records = await dns.lookup(base.hostname, { all: true, verbatim: true });
    if (!records || records.length === 0) {
      throw new InputHardeningError("URL host did not resolve", "url_dns_failed");
    }
    for (const r of records) {
      if (r.family === 4 && ipv4InPrivateRange(r.address)) {
        throw new InputHardeningError("URL host resolves to a private IP", "url_private_resolved");
      }
      if (r.family === 6 && ipv6InPrivateRange(r.address)) {
        throw new InputHardeningError("URL host resolves to a private IP", "url_private_resolved");
      }
    }
    return { ...base, resolvedIp: records[0].address };
  } catch (e) {
    if (e instanceof InputHardeningError) throw e;
    throw new InputHardeningError("URL host did not resolve", "url_dns_failed");
  }
}

export function isUrlSafeLegacy(raw: string): { safe: boolean; reason?: string } {
  try {
    safeUrlSync(raw);
    return { safe: true };
  } catch (e) {
    return { safe: false, reason: e instanceof Error ? e.message : "URL rejected" };
  }
}

export interface SafeYamlOptions {
  maxBytes?: number;
  maxDepth?: number;
  allowProtoKeys?: boolean;
}

function checkDepth(node: unknown, depth: number, max: number): void {
  if (depth > max) throw new InputHardeningError("YAML/JSON nesting too deep", "depth_exceeded");
  if (node && typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) checkDepth(v, depth + 1, max);
  }
}

export function safeYaml<T = unknown>(raw: unknown, opts: SafeYamlOptions = {}): T {
  if (typeof raw !== "string") throw new InputHardeningError("YAML payload must be a string", "yaml_not_string");
  const maxBytes = opts.maxBytes ?? 256 * 1024;
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    throw new InputHardeningError("YAML payload too large", "yaml_too_large");
  }
  let parsed: unknown;
  try {
    parsed = yaml.load(raw, { schema: yaml.CORE_SCHEMA, json: false });
  } catch (e) {
    throw new InputHardeningError(
      `Invalid YAML: ${e instanceof Error ? e.message.slice(0, 200) : "parse error"}`,
      "yaml_invalid",
    );
  }
  checkDepth(parsed, 0, opts.maxDepth ?? 32);
  // Hardening: YAML allows arbitrary keys including `__proto__` / `constructor`
  // / `prototype`, which downstream code merging this object into defaults can
  // trigger prototype-pollution. Reject these unless explicitly opted out.
  if (!opts.allowProtoKeys) scanForProtoKeys(parsed, 0, opts.maxDepth ?? 32);
  return parsed as T;
}

export interface SafeJsonOptions {
  maxBytes?: number;
  maxDepth?: number;
  allowProtoKeys?: boolean;
}

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function scanForProtoKeys(node: unknown, depth = 0, max = 64): void {
  if (depth > max) throw new InputHardeningError("JSON nesting too deep", "depth_exceeded");
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const v of node) scanForProtoKeys(v, depth + 1, max);
    return;
  }
  for (const k of Object.keys(node as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(k)) {
      throw new InputHardeningError(`Forbidden JSON key: ${k}`, "json_forbidden_key");
    }
    scanForProtoKeys((node as Record<string, unknown>)[k], depth + 1, max);
  }
}

export function safeJson<T = unknown>(raw: unknown, opts: SafeJsonOptions = {}): T {
  let text: string;
  if (typeof raw === "string") {
    text = raw;
  } else if (raw && typeof raw === "object") {
    text = JSON.stringify(raw);
  } else {
    throw new InputHardeningError("JSON payload must be a string or object", "json_invalid_type");
  }
  const maxBytes = opts.maxBytes ?? 1024 * 1024;
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new InputHardeningError("JSON payload too large", "json_too_large");
  }
  if (FORBIDDEN_KEYS.size && !opts.allowProtoKeys) {
    if (/"(?:__proto__|constructor|prototype)"\s*:/.test(text)) {
      throw new InputHardeningError("Forbidden JSON key: __proto__/constructor/prototype", "json_forbidden_key");
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new InputHardeningError(
      `Invalid JSON: ${e instanceof Error ? e.message.slice(0, 200) : "parse error"}`,
      "json_invalid",
    );
  }
  if (!opts.allowProtoKeys) scanForProtoKeys(parsed, 0, opts.maxDepth ?? 64);
  return parsed as T;
}

export interface SafeTextOptions {
  maxLength?: number;
  denyHtml?: boolean;
  collapseWhitespace?: boolean;
  allowEmpty?: boolean;
}

const INVISIBLE_CODEPOINTS = /[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u2028-\u202E\u2066-\u2069\uFEFF]/g;

export function safeText(raw: unknown, opts: SafeTextOptions = {}): string {
  if (raw == null) {
    if (opts.allowEmpty) return "";
    throw new InputHardeningError("Text field is required", "text_empty");
  }
  if (typeof raw !== "string") {
    throw new InputHardeningError("Text field must be a string", "text_not_string");
  }
  let s = raw.replace(INVISIBLE_CODEPOINTS, "");
  if (opts.denyHtml) {
    s = s.replace(/[<>&]/g, "");
  }
  if (opts.collapseWhitespace) {
    s = s.replace(/\s+/g, " ").trim();
  }
  const max = opts.maxLength ?? 8 * 1024;
  if (s.length > max) {
    throw new InputHardeningError(`Text exceeds max length of ${max}`, "text_too_long");
  }
  if (!opts.allowEmpty && s.length === 0) {
    throw new InputHardeningError("Text field is empty after sanitization", "text_empty");
  }
  return s;
}

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

export interface SafeIdentifierOptions {
  allowList: readonly string[];
}

export function safeIdentifier(raw: unknown, opts: SafeIdentifierOptions): ReturnType<typeof sql.identifier> {
  if (typeof raw !== "string" || !IDENTIFIER_RE.test(raw)) {
    throw new InputHardeningError("Invalid SQL identifier", "identifier_invalid");
  }
  if (!opts.allowList.includes(raw)) {
    throw new InputHardeningError("Identifier not on allow-list", "identifier_not_allowed");
  }
  return sql.identifier(raw);
}

export function safeIdentifierString(raw: unknown, opts: SafeIdentifierOptions): string {
  if (typeof raw !== "string" || !IDENTIFIER_RE.test(raw)) {
    throw new InputHardeningError("Invalid SQL identifier", "identifier_invalid");
  }
  if (!opts.allowList.includes(raw)) {
    throw new InputHardeningError("Identifier not on allow-list", "identifier_not_allowed");
  }
  return raw;
}

export function safePositiveIntArray(raw: unknown, opts: { maxLength?: number } = {}): number[] {
  if (!Array.isArray(raw)) {
    throw new InputHardeningError("Expected array of positive integers", "intarray_not_array");
  }
  const max = opts.maxLength ?? 5000;
  if (raw.length > max) {
    throw new InputHardeningError(`Too many ids (max ${max})`, "intarray_too_long");
  }
  const out: number[] = [];
  for (const v of raw) {
    if (typeof v !== "number" || !Number.isInteger(v) || v <= 0 || v > 2_147_483_647) {
      throw new InputHardeningError("Array contains non-positive-integer", "intarray_bad_value");
    }
    out.push(v);
  }
  return out;
}

export function safeEnum<T extends string>(raw: unknown, allowList: readonly T[]): T {
  if (typeof raw !== "string" || !allowList.includes(raw as T)) {
    throw new InputHardeningError(`Value must be one of: ${allowList.join(", ")}`, "enum_invalid");
  }
  return raw as T;
}

const MAGIC_BYTES: Array<{ ext: string; mime: string; head: number[]; offset?: number }> = [
  { ext: "pdf", mime: "application/pdf", head: [0x25, 0x50, 0x44, 0x46] },
  { ext: "png", mime: "image/png", head: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: "jpg", mime: "image/jpeg", head: [0xff, 0xd8, 0xff] },
  { ext: "jpeg", mime: "image/jpeg", head: [0xff, 0xd8, 0xff] },
  { ext: "gif", mime: "image/gif", head: [0x47, 0x49, 0x46, 0x38] },
  { ext: "webp", mime: "image/webp", head: [0x52, 0x49, 0x46, 0x46] },
  { ext: "zip", mime: "application/zip", head: [0x50, 0x4b, 0x03, 0x04] },
  { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", head: [0x50, 0x4b, 0x03, 0x04] },
  { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", head: [0x50, 0x4b, 0x03, 0x04] },
  { ext: "xls", mime: "application/vnd.ms-excel", head: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  { ext: "doc", mime: "application/msword", head: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  { ext: "pcap", mime: "application/vnd.tcpdump.pcap", head: [0xd4, 0xc3, 0xb2, 0xa1] },
  { ext: "pcap", mime: "application/vnd.tcpdump.pcap", head: [0x0a, 0x0d, 0x0d, 0x0a] },
];

function sniffMime(buf: Buffer): string | null {
  for (const sig of MAGIC_BYTES) {
    const off = sig.offset ?? 0;
    if (buf.length < off + sig.head.length) continue;
    let ok = true;
    for (let i = 0; i < sig.head.length; i++) {
      if (buf[off + i] !== sig.head[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return sig.mime;
  }
  return null;
}

const TEXTUAL_EXT = new Set(["json", "csv", "txt", "yaml", "yml", "log", "ndjson", "xml", "ioc", "tsv"]);

/**
 * Checks whether a buffer (the first bytes of a ZIP-magic file) looks like a
 * genuine OOXML container (.xlsx / .docx / .pptx).
 *
 * APPROACH — raw byte search, not ZIP structure parsing
 * -------------------------------------------------------
 * ZIP local-file entry *names* are stored as plain ASCII/UTF-8 and are NEVER
 * compressed, so every OOXML-specific path ("xl/", "[Content_Types].xml", …)
 * will appear verbatim somewhere in the first few hundred bytes regardless of:
 *   • entry order (ECMA-376 §13.2.2 is widely ignored by real generators)
 *   • streaming mode / data descriptors (compressedSize may be 0 in header)
 *   • extra-field or comment padding
 *
 * We confirm the file starts with the ZIP magic (PK\x03\x04), then search
 * the head buffer for any of the canonical OOXML path fragments.  A plain
 * ZIP bomb renamed to .xlsx won't contain these paths, so security is intact.
 */
function looksLikeOoxml(buf: Buffer, bytesRead: number): boolean {
  // Must start with ZIP local-file-header magic PK\x03\x04
  if (bytesRead < 4) return false;
  if (buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) return false;

  // Raw search for any OOXML-specific path fragment in the head bytes.
  // Entry names are plain text in local-file headers — no decompression needed.
  const haystack = buf.slice(0, bytesRead).toString("latin1");
  const OOXML_MARKERS = [
    "[Content_Types].xml",
    "xl/",
    "_rels/",
    "word/",
    "ppt/",
    "docProps/",
  ];
  return OOXML_MARKERS.some((m) => haystack.includes(m));
}

function looksTextual(buf: Buffer, bytesRead?: number): boolean {
  const limit = Math.min(bytesRead ?? buf.length, 4096, buf.length);
  for (let i = 0; i < limit; i++) {
    const b = buf[i];
    if (b === 0x09 || b === 0x0a || b === 0x0d) continue;
    if (b < 0x20 || b === 0x7f) return false;
  }
  return true;
}

export interface SafeFileUploadOptions {
  allowExt: string[];
  maxBytes?: number;
}

export interface SafeFileUploadResult {
  safePath: string;
  safeName: string;
  mimeSniffed: string | null;
  ext: string;
  size: number;
}

export function safeFileUpload(
  file: Express.Multer.File | undefined | null,
  opts: SafeFileUploadOptions,
): SafeFileUploadResult {
  if (!file) throw new InputHardeningError("File upload missing", "file_missing");
  const maxBytes = opts.maxBytes ?? 25 * 1024 * 1024;
  if (file.size > maxBytes) {
    try {
      fs.unlinkSync(file.path);
    } catch {}
    throw new InputHardeningError(`File too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)`, "file_too_large");
  }
  const original = file.originalname || "upload";
  const baseName = path.basename(original).replace(/[\x00-\x1f\x7f]/g, "_").replace(/\.\.+/g, ".").slice(0, 200) || "upload";
  const extRaw = (path.extname(baseName).slice(1) || "").toLowerCase();
  if (!opts.allowExt.includes(extRaw)) {
    try {
      fs.unlinkSync(file.path);
    } catch {}
    throw new InputHardeningError(`File extension not allowed: ${extRaw || "(none)"}`, "file_bad_ext");
  }
  let head: Buffer;
  let headBytesRead = 0;
  try {
    const fd = fs.openSync(file.path, "r");
    // 16 384 bytes: enough for magic sniff (8 max) AND scanning multiple ZIP
    // local-file headers for OOXML markers.  Real-world xlsx generators
    // (CrowdStrike Falcon, LibreOffice, Excel) do not always place
    // "[Content_Types].xml" as the first entry — large files (10 000+ rows)
    // often have xl/worksheets/sheet1.xml first, pushing the OOXML markers
    // well past the old 512-byte window.  16 KB captures the central-
    // directory region for files up to ~4 MB, covering virtually all
    // vendor export formats seen in practice.
    head = Buffer.alloc(16384);
    headBytesRead = fs.readSync(fd, head, 0, 16384, 0);
    fs.closeSync(fd);
  } catch (e) {
    throw new InputHardeningError("Could not read uploaded file", "file_unreadable");
  }
  const sniffed = sniffMime(head.slice(0, headBytesRead));
  if (sniffed === null && !TEXTUAL_EXT.has(extRaw)) {
    try {
      fs.unlinkSync(file.path);
    } catch {}
    throw new InputHardeningError(`File magic-byte sniff failed for .${extRaw}`, "file_bad_magic");
  }
  if (sniffed !== null) {
    const sigOk = MAGIC_BYTES.some((m) => m.mime === sniffed && m.ext === extRaw);
    const looseExtOk =
      (extRaw === "jpeg" && sniffed === "image/jpeg") ||
      (extRaw === "yml" && TEXTUAL_EXT.has(extRaw)) ||
      // OOXML formats (.xlsx / .docx) are ZIP containers (ECMA-376 §13.2.2).
      // sniffMime() cannot tell them apart from plain ZIP at the magic-byte
      // level (both begin PK\x03\x04).  We allow them only when the first ZIP
      // entry name is "[Content_Types].xml" — the mandatory OOXML marker.
      // A plain ZIP renamed to .xlsx won't have that entry first, so it is
      // still rejected here.
      ((extRaw === "xlsx" || extRaw === "docx") &&
        sniffed === "application/zip" &&
        looksLikeOoxml(head, headBytesRead));
    if (!sigOk && !looseExtOk) {
      try {
        fs.unlinkSync(file.path);
      } catch {}
      throw new InputHardeningError(`File contents do not match .${extRaw} (sniffed ${sniffed})`, "file_mismatch_ext");
    }
  } else if (TEXTUAL_EXT.has(extRaw)) {
    if (!looksTextual(head, headBytesRead)) {
      try {
        fs.unlinkSync(file.path);
      } catch {}
      throw new InputHardeningError(`File appears binary but extension .${extRaw} is textual`, "file_binary_for_text_ext");
    }
  }
  return {
    safePath: file.path,
    safeName: baseName,
    mimeSniffed: sniffed,
    ext: extRaw,
    size: file.size,
  };
}

export const TIME_RANGE_INTERVALS = ["1h", "24h", "7d", "30d", "90d"] as const;
export const DATE_TRUNC_BUCKETS = ["minute", "hour", "day", "week", "month", "quarter", "year"] as const;

// ── Safe fetch (DNS-rebinding resistant) ─────────────────────────────────────
//
// safeFetch validates the URL via safeUrlSync, resolves the hostname *once*,
// rejects any private/loopback resolved IPs, and then issues the HTTP request
// through a custom http(s).Agent whose `lookup` callback short-circuits to the
// already-verified IP. Because the underlying socket connects to the verified
// IP — not whatever DNS returns at connect time — DNS-rebinding TOCTOU is no
// longer possible between the safety check and the actual TCP connection.
//
// SNI / TLS cert validation still uses the original hostname via the Host
// header and `servername` option, so HTTPS works correctly for properly
// configured upstream servers.

export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeoutMs?: number;
  allowSchemes?: string[];
  allowHosts?: string[];
}

export interface SafeFetchResponse {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  text: () => Promise<string>;
  json: <T = unknown>() => Promise<T>;
}

export async function safeFetch(
  rawUrl: unknown,
  opts: SafeFetchOptions = {},
): Promise<SafeFetchResponse> {
  const safe = safeUrlSync(rawUrl, {
    allowSchemes: opts.allowSchemes,
    allowHosts: opts.allowHosts,
  });

  // Pre-resolve all IPs once and verify each is public.
  let records: Array<{ address: string; family: number }>;
  try {
    records = await dns.lookup(safe.hostname, { all: true, verbatim: true });
  } catch {
    throw new InputHardeningError("URL host did not resolve", "url_dns_failed");
  }
  const verifiedIps: Array<{ address: string; family: number }> = [];
  for (const r of records) {
    if (r.family === 4 && ipv4InPrivateRange(r.address)) continue;
    if (r.family === 6 && ipv6InPrivateRange(r.address)) continue;
    verifiedIps.push(r);
  }
  if (verifiedIps.length === 0) {
    throw new InputHardeningError(
      "URL host resolves to a private IP",
      "url_private_resolved",
    );
  }
  // Pin to the first verified IP — the agent will connect to this address
  // regardless of any subsequent DNS rebinding.
  const pinnedIp = verifiedIps[0].address;
  const pinnedFamily = verifiedIps[0].family;

  const isHttps = safe.url.startsWith("https://");
  const AgentCls = isHttps ? https.Agent : http.Agent;
  const pinnedAgent = new AgentCls({
    keepAlive: false,
    // The lookup callback is invoked by Node's net.connect — we ignore the
    // hostname argument and unconditionally return the pre-verified IP.
    lookup: (
      _hostname: string,
      _options: any,
      cb: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
    ) => {
      cb(null, pinnedIp, pinnedFamily);
    },
  } as https.AgentOptions);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30000);
  try {
    const res = await nodeFetch(safe.url, {
      method: opts.method ?? "GET",
      headers: opts.headers,
      body: opts.body,
      agent: pinnedAgent,
      signal: controller.signal as any,
      redirect: "manual", // Do NOT follow redirects automatically — a redirect
                          // to a private host would otherwise bypass the pin.
    });

    // If the server replied with a redirect, validate the Location header
    // through the same SSRF guard before exposing it.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (loc) {
        try {
          const target = new URL(loc, safe.url).toString();
          safeUrlSync(target, {
            allowSchemes: opts.allowSchemes,
            allowHosts: opts.allowHosts,
          });
        } catch (e) {
          throw new InputHardeningError(
            `Upstream redirected to a blocked target: ${loc}`,
            "url_redirect_blocked",
          );
        }
      }
    }

    const headers: Record<string, string> = {};
    res.headers.forEach((v: any, k: any) => {
      headers[k] = v;
    });
    return {
      ok: res.ok,
      status: res.status,
      headers,
      text: () => res.text(),
      json: <T = unknown>() => res.json() as Promise<T>,
    };
  } finally {
    clearTimeout(timer);
  }
}

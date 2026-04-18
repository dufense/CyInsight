import { createAIClient, getDefaultModel } from "./ai-provider";
import { storage } from "./storage";
import type { InsertDeviceFingerprint } from "@shared/schema";

const openai = createAIClient();

export interface FingerprintResult {
  vendor: string | null;
  product: string | null;
  logFormat: string | null;
  eventCategory: string | null;
  detectedFields: string[];
  aiConfidence: number;
  aiReasoning: string;
}

const FINGERPRINT_PROMPT = `You are a security device fingerprinting expert. Analyze the provided log lines from an unknown security source and determine:

1. vendor: The company/vendor name (e.g., "Cisco", "Palo Alto Networks", "Microsoft", "CrowdStrike", "Fortinet", etc.)
2. product: The specific product name (e.g., "ASA Firewall", "PAN-OS", "Windows Event Log", "Falcon EDR", "FortiGate", etc.)
3. logFormat: The log format/protocol (one of: syslog, CEF, LEEF, JSON, W3C, XML, key-value, custom, plaintext, NCSA, GELF, RFC3164, RFC5424)
4. eventCategory: The primary security category (one of: firewall, ids_ips, waf, proxy, edr, email_gateway, database_monitor, casb, cloud, ot_iot, network_tap, siem, identity, vulnerability_scanner, custom)
5. detectedFields: Array of key field names found in the logs (up to 15 most significant)
6. aiConfidence: Your confidence score 0-100 in this fingerprint
7. aiReasoning: A concise explanation (2-3 sentences) of how you identified this device

Common device signatures to look for:
- Cisco ASA: %ASA- prefix, keywords like "Deny tcp", "Built inbound", "access-group"
- Palo Alto: CEF with "Palo Alto Networks|PAN-OS", or fields like SourceZone, DestinationZone, Rule
- Fortinet FortiGate: date= time= type= subtype= eventtype=
- Check Point: smartdefense_profile, blade_name, product
- Snort/Suricata: [GID:SID:REV] or [Priority:], or EVT_ prefixes
- Windows Event Log: EventID=, SubjectUserName=, or <Event><System> XML tags
- Sysmon: EventID 1-25 with Process, CommandLine, ParentCommandLine
- Linux auditd: type=SYSCALL, type=EXECVE, uid=, pid=, comm=
- Apache/Nginx: Combined log format "IP - - [timestamp] METHOD path protocol status bytes"
- AWS CloudTrail: eventSource, eventName, userIdentity.type, awsRegion
- Azure Activity: operationName, resourceType, subscriptionId, callerIpAddress
- GCP Audit: protoPayload, @type, methodName, resourceName
- CrowdStrike: detection_id, behaviors, device, max_severity_displayname
- Proofpoint: threatsInfoMap, messageParts, senderIP
- OT/SCADA: Modbus, DNP3, BACnet, protocol keywords

Respond ONLY with valid JSON, no markdown.`;

export async function fingerprintDevice(
  tenantId: number,
  sourceIdentifier: string,
  sampleLogs: string[]
): Promise<FingerprintResult> {
  const samples = sampleLogs.slice(0, 10).map((l) => l.substring(0, 500));

  const logsText = samples.map((l, i) => `Line ${i + 1}: ${l}`).join("\n");

  let result: FingerprintResult = {
    vendor: null,
    product: null,
    logFormat: null,
    eventCategory: null,
    detectedFields: [],
    aiConfidence: 0,
    aiReasoning: "AI unavailable — fingerprint not determined",
  };

  try {
    const model = getDefaultModel();
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: FINGERPRINT_PROMPT },
        {
          role: "user",
          content: `Fingerprint this unknown security device based on the following log samples:\n\n${logsText}\n\nRespond with JSON only.`,
        },
      ],
      temperature: 0.1,
      max_tokens: 600,
    });

    const content = response.choices[0]?.message?.content?.trim() || "";
    const clean = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(clean);

    result = {
      vendor: parsed.vendor || null,
      product: parsed.product || null,
      logFormat: parsed.logFormat || null,
      eventCategory: parsed.eventCategory || null,
      detectedFields: Array.isArray(parsed.detectedFields) ? parsed.detectedFields.slice(0, 20) : [],
      aiConfidence: typeof parsed.aiConfidence === "number" ? parsed.aiConfidence : 50,
      aiReasoning: parsed.aiReasoning || "AI fingerprinting completed",
    };
  } catch (err: unknown) {
    console.warn(`[DeviceFingerprinter] AI fingerprint failed: ${err instanceof Error ? err.message : String(err)}`);
    result = regexFingerprintFallback(samples);
  }

  return result;
}

function regexFingerprintFallback(samples: string[]): FingerprintResult {
  const allText = samples.join("\n").toLowerCase();

  if (allText.includes("%asa-") || allText.includes("cisco asa")) {
    return { vendor: "Cisco", product: "ASA Firewall", logFormat: "syslog", eventCategory: "firewall", detectedFields: [], aiConfidence: 80, aiReasoning: "Matched Cisco ASA syslog signature" };
  }
  if (allText.includes("palo alto") || allText.includes("pan-os") || allText.includes("panorama")) {
    return { vendor: "Palo Alto Networks", product: "PAN-OS", logFormat: "CEF", eventCategory: "firewall", detectedFields: [], aiConfidence: 80, aiReasoning: "Matched Palo Alto Networks signature" };
  }
  if (allText.includes("fortigate") || (allText.includes("date=") && allText.includes("type=") && allText.includes("subtype="))) {
    return { vendor: "Fortinet", product: "FortiGate", logFormat: "key-value", eventCategory: "firewall", detectedFields: [], aiConfidence: 75, aiReasoning: "Matched Fortinet FortiGate log format" };
  }
  if (allText.includes("snort") || allText.includes("[gid:") || allText.includes("[priority:")) {
    return { vendor: "Cisco", product: "Snort IDS", logFormat: "Snort alert", eventCategory: "ids_ips", detectedFields: [], aiConfidence: 78, aiReasoning: "Matched Snort IDS alert format" };
  }
  if (allText.includes("eventid=") || allText.includes("subjectusernam") || allText.includes("windows event")) {
    return { vendor: "Microsoft", product: "Windows Event Log", logFormat: "WEF", eventCategory: "edr", detectedFields: [], aiConfidence: 75, aiReasoning: "Matched Windows Event Log format" };
  }
  if (allText.includes("eventsource") && allText.includes("awsregion")) {
    return { vendor: "Amazon", product: "AWS CloudTrail", logFormat: "JSON", eventCategory: "cloud", detectedFields: [], aiConfidence: 85, aiReasoning: "Matched AWS CloudTrail JSON format" };
  }
  if (samples[0]?.startsWith("CEF:") || allText.includes(" cef:")) {
    return { vendor: null, product: null, logFormat: "CEF", eventCategory: "firewall", detectedFields: [], aiConfidence: 60, aiReasoning: "Detected CEF log format" };
  }
  if (samples[0]?.startsWith("LEEF:")) {
    return { vendor: "IBM", product: "QRadar", logFormat: "LEEF", eventCategory: "siem", detectedFields: [], aiConfidence: 65, aiReasoning: "Detected LEEF log format (IBM QRadar)" };
  }

  const firstSample = samples[0]?.trim() || "";
  if (firstSample.startsWith("{") || firstSample.startsWith("[")) {
    return { vendor: null, product: null, logFormat: "JSON", eventCategory: "custom", detectedFields: [], aiConfidence: 40, aiReasoning: "Detected JSON log format, vendor unknown" };
  }

  return { vendor: null, product: null, logFormat: "plaintext", eventCategory: "custom", detectedFields: [], aiConfidence: 20, aiReasoning: "Unable to fingerprint — unknown format" };
}

export async function getOrCreateFingerprint(
  tenantId: number,
  sourceIdentifier: string,
  sampleLogs: string[]
): Promise<{ fingerprint: FingerprintResult; fingerprintId: number | null }> {
  try {
    const existing = await storage.getDeviceFingerprint(tenantId, sourceIdentifier);
    if (existing) {
      return {
        fingerprint: {
          vendor: existing.vendor,
          product: existing.product,
          logFormat: existing.logFormat,
          eventCategory: existing.eventCategory,
          detectedFields: (existing.detectedFields as string[]) || [],
          aiConfidence: existing.aiConfidence || 0,
          aiReasoning: existing.aiReasoning || "",
        },
        fingerprintId: existing.id,
      };
    }
  } catch (lookupErr: unknown) {
    console.warn(`[DeviceFingerprinter] Cache lookup failed: ${lookupErr instanceof Error ? lookupErr.message : String(lookupErr)}`);
  }

  const fingerprint = await fingerprintDevice(tenantId, sourceIdentifier, sampleLogs);

  let fingerprintId: number | null = null;
  try {
    const insertData: InsertDeviceFingerprint = {
      tenantId,
      sourceIdentifier,
      vendor: fingerprint.vendor,
      product: fingerprint.product,
      logFormat: fingerprint.logFormat,
      eventCategory: fingerprint.eventCategory,
      detectedFields: fingerprint.detectedFields,
      sampleLogLines: sampleLogs.slice(0, 5).map((l) => l.substring(0, 300)),
      aiConfidence: fingerprint.aiConfidence,
      aiReasoning: fingerprint.aiReasoning,
    };
    const saved = await storage.createDeviceFingerprint(insertData);
    fingerprintId = saved.id;
  } catch (saveErr: unknown) {
    console.warn(`[DeviceFingerprinter] Could not persist fingerprint: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`);
  }

  return { fingerprint, fingerprintId };
}

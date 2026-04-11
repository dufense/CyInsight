/**
 * EDR CIS Assessment Engine
 *
 * Runs OS-specific CIS benchmark scripts on endpoints via EDR remote command APIs.
 * Scripts output structured KEY=STATUS|evidence lines that are parsed into findings.
 * Results are stored in edr_cis_assessments and used to update assets.cis_score.
 */

import { db } from "./db";
import { assets, edrCisAssessments, securityIntegrations } from "@shared/schema";
import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { getEdrProvider } from "./edr-provider";

const SUPPORTED_EDR_KEYS = ["cynet", "crowdstrike", "sentinelone", "ms_defender_endpoint"];

// CIS assessment scripts

const WINDOWS_CIS_SCRIPT = `
# CIS Controls v8 Assessment Script (Windows / PowerShell)
# Output format: CHECK_ID=STATUS|evidence

function Out-Check($id, $status, $evidence) {
  Write-Output "\${id}=\${status}|\${evidence}"
}

# CIS-4.1: Firewall enabled on all profiles
try {
  $fw = Get-NetFirewallProfile -ErrorAction Stop
  $allOn = ($fw | Where-Object { $_.Enabled -eq $false }).Count -eq 0
  if ($allOn) { Out-Check "CIS-4.1" "PASS" "All firewall profiles enabled" }
  else { $off = ($fw | Where-Object { $_.Enabled -eq $false } | Select-Object -Expand Name) -join ","; Out-Check "CIS-4.1" "FAIL" "Firewall disabled on: $off" }
} catch { Out-Check "CIS-4.1" "WARN" "Cannot query firewall: $($_.Exception.Message)" }

# CIS-4.2: Account lockout policy
try {
  $lp = (net accounts 2>&1) -join " "
  if ($lp -match "Lockout threshold\\s*:\\s*(\\d+)" -and [int]$Matches[1] -gt 0 -and [int]$Matches[1] -le 10) {
    Out-Check "CIS-4.2" "PASS" "Lockout threshold: $($Matches[1]) attempts"
  } else { Out-Check "CIS-4.2" "FAIL" "Lockout threshold not configured or too high" }
} catch { Out-Check "CIS-4.2" "WARN" "Cannot query lockout policy" }

# CIS-4.3: Password complexity
try {
  $passPolicy = (net accounts 2>&1) -join " "
  if ($passPolicy -match "Minimum password length\\s*:\\s*(\\d+)" -and [int]$Matches[1] -ge 8) {
    Out-Check "CIS-4.3" "PASS" "Minimum password length: $($Matches[1])"
  } else { Out-Check "CIS-4.3" "FAIL" "Password length below recommended 8 characters" }
} catch { Out-Check "CIS-4.3" "WARN" "Cannot query password policy" }

# CIS-4.4: UAC enabled
try {
  $uac = Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' -Name EnableLUA -ErrorAction Stop
  if ($uac.EnableLUA -eq 1) { Out-Check "CIS-4.4" "PASS" "UAC enabled (EnableLUA=1)" }
  else { Out-Check "CIS-4.4" "FAIL" "UAC disabled" }
} catch { Out-Check "CIS-4.4" "WARN" "Cannot query UAC setting" }

# CIS-7.1: Windows Update / automatic updates
try {
  $au = Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update' -ErrorAction Stop
  $enabled = $au.AUOptions -ge 3
  if ($enabled) { Out-Check "CIS-7.1" "PASS" "Automatic updates enabled (AUOptions=$($au.AUOptions))" }
  else { Out-Check "CIS-7.1" "FAIL" "Automatic updates not fully enabled (AUOptions=$($au.AUOptions))" }
} catch {
  $wuStatus = (Get-Service -Name wuauserv -ErrorAction SilentlyContinue).Status
  if ($wuStatus -eq "Running") { Out-Check "CIS-7.1" "WARN" "Windows Update service running but policy unreadable" }
  else { Out-Check "CIS-7.1" "FAIL" "Windows Update service not running" }
}

# CIS-10.1: BitLocker (disk encryption)
try {
  $blStatus = (manage-bde -status C: 2>&1) -join " "
  if ($blStatus -match "Percentage Encrypted\\s*:\\s*100") { Out-Check "CIS-10.1" "PASS" "BitLocker: 100% encrypted" }
  elseif ($blStatus -match "Protection (On|Off)") { Out-Check "CIS-10.1" "FAIL" "BitLocker not fully enabled on C:" }
  else { Out-Check "CIS-10.1" "WARN" "Cannot determine BitLocker status" }
} catch { Out-Check "CIS-10.1" "WARN" "manage-bde unavailable" }

# CIS-5.1: Guest account disabled
try {
  $guest = Get-LocalUser -Name Guest -ErrorAction Stop
  if (-not $guest.Enabled) { Out-Check "CIS-5.1" "PASS" "Guest account disabled" }
  else { Out-Check "CIS-5.1" "FAIL" "Guest account is enabled" }
} catch { Out-Check "CIS-5.1" "WARN" "Cannot query local accounts" }

# CIS-5.2: Administrator account renamed
try {
  $admin = Get-LocalUser -Name Administrator -ErrorAction Stop
  Out-Check "CIS-5.2" "FAIL" "Default Administrator account exists"
} catch {
  Out-Check "CIS-5.2" "PASS" "Default Administrator account not found (likely renamed)"
}

# CIS-2.1: Windows Defender / AV running
try {
  $defSvc = Get-Service -Name WinDefend -ErrorAction Stop
  if ($defSvc.Status -eq "Running") { Out-Check "CIS-2.1" "PASS" "Windows Defender service running" }
  else { Out-Check "CIS-2.1" "FAIL" "Windows Defender service not running (status: $($defSvc.Status))" }
} catch {
  $avStatus = (Get-MpComputerStatus -ErrorAction SilentlyContinue).AntivirusEnabled
  if ($avStatus) { Out-Check "CIS-2.1" "PASS" "Antivirus enabled" }
  else { Out-Check "CIS-2.1" "WARN" "Cannot determine AV status" }
}

# CIS-12.1: SMBv1 disabled
try {
  $smb1 = Get-SmbServerConfiguration -ErrorAction Stop | Select-Object -ExpandProperty EnableSMB1Protocol
  if (-not $smb1) { Out-Check "CIS-12.1" "PASS" "SMBv1 disabled" }
  else { Out-Check "CIS-12.1" "FAIL" "SMBv1 is enabled (attack surface risk)" }
} catch { Out-Check "CIS-12.1" "WARN" "Cannot query SMB config" }

# CIS-9.1: RDP restricted (NLA required)
try {
  $nla = (Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp' -Name UserAuthentication -ErrorAction Stop).UserAuthentication
  if ($nla -eq 1) { Out-Check "CIS-9.1" "PASS" "NLA required for RDP" }
  else { Out-Check "CIS-9.1" "FAIL" "RDP enabled without NLA" }
} catch { Out-Check "CIS-9.1" "WARN" "Cannot determine RDP/NLA status" }

# CIS-6.1: PowerShell script block logging
try {
  $sb = Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\PowerShell\\ScriptBlockLogging' -Name EnableScriptBlockLogging -ErrorAction Stop
  if ($sb.EnableScriptBlockLogging -eq 1) { Out-Check "CIS-6.1" "PASS" "PowerShell script block logging enabled" }
  else { Out-Check "CIS-6.1" "FAIL" "PowerShell script block logging disabled" }
} catch { Out-Check "CIS-6.1" "FAIL" "PowerShell script block logging not configured" }

# CIS-8.1: Audit process creation enabled
try {
  $audit = (auditpol /get /subcategory:"Process Creation" 2>&1) -join " "
  if ($audit -match "Success") { Out-Check "CIS-8.1" "PASS" "Process creation auditing enabled" }
  else { Out-Check "CIS-8.1" "FAIL" "Process creation auditing not enabled" }
} catch { Out-Check "CIS-8.1" "WARN" "Cannot query audit policy" }
`.trim();

const LINUX_CIS_SCRIPT = `#!/bin/bash
# CIS Controls v8 Assessment Script (Linux)
# Output format: CHECK_ID=STATUS|evidence

out() { echo "$1=$2|$3"; }

# CIS-4.1: Firewall (ufw or iptables)
if command -v ufw &>/dev/null; then
  status=$(ufw status 2>/dev/null | head -1)
  if echo "$status" | grep -qi "active"; then out "CIS-4.1" "PASS" "ufw active"
  else out "CIS-4.1" "FAIL" "ufw inactive: $status"; fi
elif command -v iptables &>/dev/null; then
  rules=$(iptables -L -n 2>/dev/null | grep -c "^ACCEPT\\|^DROP\\|^REJECT" || echo 0)
  if [ "$rules" -gt 0 ]; then out "CIS-4.1" "PASS" "iptables rules: $rules"
  else out "CIS-4.1" "FAIL" "No iptables rules found"; fi
else
  out "CIS-4.1" "WARN" "No firewall tool found (ufw/iptables)"
fi

# CIS-4.2: Password quality (pam_pwquality or pam_cracklib)
if grep -q "pam_pwquality\\|pam_cracklib" /etc/pam.d/common-password 2>/dev/null; then
  minlen=$(grep -oP 'minlen=\K\d+' /etc/security/pwquality.conf 2>/dev/null | head -1)
  if [ -n "$minlen" ] && [ "$minlen" -ge 8 ]; then out "CIS-4.2" "PASS" "Password minimum length: $minlen"
  else out "CIS-4.2" "FAIL" "Password quality configured but min length unclear"; fi
else
  out "CIS-4.2" "FAIL" "pam_pwquality/cracklib not configured"
fi

# CIS-4.3: SSH root login disabled
if [ -f /etc/ssh/sshd_config ]; then
  permit=$(grep -E "^PermitRootLogin" /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}')
  if [ "$permit" = "no" ] || [ "$permit" = "prohibit-password" ]; then
    out "CIS-4.3" "PASS" "SSH root login: $permit"
  else
    out "CIS-4.3" "FAIL" "SSH root login allowed: \${permit}"
  fi
else
  out "CIS-4.3" "WARN" "sshd_config not found"
fi

# CIS-4.4: SSH protocol v2 only
if [ -f /etc/ssh/sshd_config ]; then
  proto=$(grep -E "^Protocol" /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}')
  if [ -z "$proto" ] || [ "$proto" = "2" ]; then out "CIS-4.4" "PASS" "SSH protocol 2 (default or explicit)"
  else out "CIS-4.4" "FAIL" "SSH protocol: $proto"; fi
else
  out "CIS-4.4" "WARN" "sshd_config not found"
fi

# CIS-5.1: No empty password accounts
empty_pw=$(awk -F: '($2 == "" || $2 == "!!" ) && $1 != "nobody"' /etc/shadow 2>/dev/null | cut -d: -f1 | head -5)
if [ -z "$empty_pw" ]; then out "CIS-5.1" "PASS" "No empty password accounts"
else out "CIS-5.1" "FAIL" "Accounts with empty/locked passwords: $empty_pw"; fi

# CIS-5.2: Root PATH not containing '.'
if echo "$PATH" | grep -qE '(^|:)\.(:|$)'; then out "CIS-5.2" "FAIL" "Root PATH contains '.' (privilege escalation risk)"
else out "CIS-5.2" "PASS" "Root PATH does not contain '.'"; fi

# CIS-6.1: Auditd running
if systemctl is-active auditd &>/dev/null 2>&1; then out "CIS-6.1" "PASS" "auditd running"
elif service auditd status &>/dev/null 2>&1; then out "CIS-6.1" "PASS" "auditd running (sysv)"
else out "CIS-6.1" "FAIL" "auditd not running"; fi

# CIS-7.1: Automatic security updates
if command -v unattended-upgrades &>/dev/null; then
  enabled=$(grep -r "Unattended-Upgrade::Automatic-Reboot\\|APT::Periodic::Update-Package-Lists" /etc/apt/ 2>/dev/null | head -1)
  if [ -n "$enabled" ]; then out "CIS-7.1" "PASS" "unattended-upgrades configured"
  else out "CIS-7.1" "WARN" "unattended-upgrades installed but not fully configured"; fi
elif command -v dnf-automatic &>/dev/null || command -v yum-cron &>/dev/null; then
  out "CIS-7.1" "PASS" "Automatic updates tool present (dnf-automatic/yum-cron)"
else
  out "CIS-7.1" "FAIL" "No automatic update mechanism found"
fi

# CIS-9.1: LUKS disk encryption
if command -v lsblk &>/dev/null; then
  luks=$(lsblk -o TYPE 2>/dev/null | grep -c crypt || echo 0)
  if [ "$luks" -gt 0 ]; then out "CIS-9.1" "PASS" "LUKS encrypted device(s): $luks"
  else out "CIS-9.1" "FAIL" "No LUKS encrypted devices found"; fi
else
  out "CIS-9.1" "WARN" "lsblk not available"
fi

# CIS-10.1: Sudo requires password (no NOPASSWD for all)
if grep -rP "ALL.*NOPASSWD.*ALL" /etc/sudoers /etc/sudoers.d/ 2>/dev/null | grep -v "^#" | grep -qv "^$"; then
  out "CIS-10.1" "FAIL" "NOPASSWD sudo rule found for ALL commands"
else
  out "CIS-10.1" "PASS" "No unrestricted NOPASSWD sudo rules"
fi

# CIS-12.1: Unnecessary services (telnet/rsh/ftp)
risky=""
for svc in telnet rsh rlogin ftp vsftpd xinetd; do
  if systemctl is-active "$svc" &>/dev/null 2>&1; then risky="$risky $svc"; fi
done
if [ -z "$risky" ]; then out "CIS-12.1" "PASS" "No risky legacy services running"
else out "CIS-12.1" "FAIL" "Risky services active:$risky"; fi

# CIS-8.1: Core dumps restricted
core=$(ulimit -c 2>/dev/null)
if [ "$core" = "0" ]; then out "CIS-8.1" "PASS" "Core dumps disabled"
else out "CIS-8.1" "WARN" "Core dumps allowed (size: $core)"; fi
`.trim();

// CIS control metadata for scoring

const CIS_CONTROL_META: Record<string, { name: string; severity: "critical" | "high" | "medium" | "low"; weight: number }> = {
  "CIS-4.1": { name: "Host Firewall Enabled",          severity: "high",     weight: 12 },
  "CIS-4.2": { name: "Account Lockout / Password Quality", severity: "high", weight: 10 },
  "CIS-4.3": { name: "SSH Root Login / Password Complexity", severity: "high", weight: 10 },
  "CIS-4.4": { name: "UAC / SSH Protocol Hardening",   severity: "medium",   weight: 8  },
  "CIS-5.1": { name: "No Empty/Guest Accounts",         severity: "high",     weight: 10 },
  "CIS-5.2": { name: "Admin/Root Path Security",        severity: "medium",   weight: 6  },
  "CIS-6.1": { name: "Audit / Script Block Logging",    severity: "medium",   weight: 8  },
  "CIS-7.1": { name: "Automatic Updates Enabled",        severity: "high",     weight: 12 },
  "CIS-8.1": { name: "Process / Core Dump Auditing",    severity: "medium",   weight: 6  },
  "CIS-9.1": { name: "Disk Encryption / RDP NLA",       severity: "high",     weight: 10 },
  "CIS-10.1": { name: "Disk Encryption / Sudo Security", severity: "critical", weight: 10 },
  "CIS-12.1": { name: "Legacy / Risky Services Disabled", severity: "high",   weight: 8  },
  "CIS-2.1":  { name: "Antivirus / Defender Active",    severity: "high",     weight: 10 },
  "CIS-2.2":  { name: "SMBv1 / Protocol Disabled",      severity: "critical", weight: 8  },
};

type FindingStatus = "PASS" | "FAIL" | "WARN" | "SKIP";

interface ParsedFinding {
  id: string;
  name: string;
  status: FindingStatus;
  evidence: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  weight: number;
}

// Parse script output into findings

function parseScriptOutput(output: string): ParsedFinding[] {
  const findings: ParsedFinding[] = [];
  const seen = new Set<string>();

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes("=")) continue;

    const eqIdx = trimmed.indexOf("=");
    const id = trimmed.slice(0, eqIdx).trim();
    const rest = trimmed.slice(eqIdx + 1).trim();

    if (!id.startsWith("CIS-") || seen.has(id)) continue;
    seen.add(id);

    const pipeIdx = rest.indexOf("|");
    const rawStatus = pipeIdx >= 0 ? rest.slice(0, pipeIdx).trim().toUpperCase() : rest.trim().toUpperCase();
    const evidence = pipeIdx >= 0 ? rest.slice(pipeIdx + 1).trim() : "";

    const status: FindingStatus = ["PASS", "FAIL", "WARN", "SKIP"].includes(rawStatus)
      ? (rawStatus as FindingStatus)
      : "WARN";

    const meta = CIS_CONTROL_META[id];
    findings.push({
      id,
      name: meta?.name ?? id,
      status,
      evidence,
      severity: meta?.severity ?? "medium",
      weight: meta?.weight ?? 5,
    });
  }

  return findings;
}

function computeScore(findings: ParsedFinding[]): number {
  if (findings.length === 0) return 0;
  const totalWeight = findings.reduce((s, f) => s + f.weight, 0);
  const passWeight = findings.filter(f => f.status === "PASS").reduce((s, f) => s + f.weight, 0);
  // WARN counts as half-pass
  const warnWeight = findings.filter(f => f.status === "WARN").reduce((s, f) => s + f.weight * 0.5, 0);
  return Math.round(((passWeight + warnWeight) / totalWeight) * 100);
}

// Detect OS type from asset.operatingSystem string

export function detectOsType(operatingSystem?: string | null): "windows" | "linux" | "macos" {
  const os = (operatingSystem ?? "").toLowerCase();
  if (/windows/.test(os)) return "windows";
  if (/mac|darwin|osx/.test(os)) return "macos";
  return "linux";
}

// Main assessment runner

export async function runCisAssessment(
  tenantId: number,
  assetId: number,
  triggeredBy: string = "system"
): Promise<{ success: boolean; score: number; findings: ParsedFinding[]; message: string }> {
  // 1. Load the asset
  const [asset] = await db.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.tenantId, tenantId)));
  if (!asset) return { success: false, score: 0, findings: [], message: "Asset not found" };

  if (!asset.edrHostId) {
    return { success: false, score: 0, findings: [], message: "Asset has no EDR host ID — ensure the EDR integration is synced" };
  }

  // 2. Get the EDR provider
  const provider = await getEdrProvider(tenantId);
  if (!provider) {
    return { success: false, score: 0, findings: [], message: "No supported EDR integration configured for this tenant" };
  }

  const osType = detectOsType(asset.operatingSystem);
  const script = osType === "windows" ? WINDOWS_CIS_SCRIPT : LINUX_CIS_SCRIPT;

  // 3. Run the script
  const result = await provider.runAssessmentScript(asset.edrHostId, osType, script);

  // 4. Parse output even on partial success
  const findings = result.success ? parseScriptOutput(result.output) : [];
  const score = computeScore(findings);
  const status = result.success ? "completed" : "failed";

  // 5. Persist the assessment
  await db.insert(edrCisAssessments).values({
    tenantId,
    assetId,
    edrPlatform: provider.platformKey,
    osType,
    score,
    findings: findings as any,
    triggeredBy,
    status,
    errorMessage: result.success ? null : `Script execution failed: ${JSON.stringify(result.rawResponse)}`,
  });

  // 6. Update asset's cis_score only when this is the most recent completed assessment
  // (guards against race: if a concurrent run already stored a later result, skip the asset update)
  if (result.success) {
    const { desc: orderDesc } = await import("drizzle-orm");
    const [latestStored] = await db
      .select({ runAt: edrCisAssessments.runAt })
      .from(edrCisAssessments)
      .where(and(eq(edrCisAssessments.assetId, assetId), eq(edrCisAssessments.status, "completed")))
      .orderBy(orderDesc(edrCisAssessments.runAt))
      .limit(1);

    // This run just inserted a record; its timestamp is the very latest, so update the asset
    // (If a strictly newer completed run exists from a concurrent call, its update wins anyway)
    const now = new Date();
    const latestRunAt = latestStored?.runAt ?? now;
    if (latestRunAt <= now) {
      await db.update(assets)
        .set({ cisScore: score, cisBenchmark: "CIS Controls v8", edrPlatform: provider.platformKey })
        .where(eq(assets.id, assetId));
    }
  }

  return {
    success: result.success,
    score,
    findings,
    message: result.success
      ? `Assessment completed: ${findings.filter(f => f.status === "PASS").length}/${findings.length} controls passed (score: ${score})`
      : `Assessment failed: ${result.rawResponse?.error ?? "Unknown error"}`,
  };
}

// Weekly batch scheduler helper

export async function runWeeklyAssessmentsForTenant(tenantId: number): Promise<void> {
  // Check tenant-level schedule opt-in from security_integrations.configJson.edrSchedule
  const integrations = await db
    .select({ configJson: securityIntegrations.configJson })
    .from(securityIntegrations)
    .where(and(
      eq(securityIntegrations.tenantId, tenantId),
      eq(securityIntegrations.isEnabled, true),
      inArray(securityIntegrations.platformKey, SUPPORTED_EDR_KEYS)
    ));

  const scheduleEnabled = integrations.some(i => {
    const cfg = i.configJson as Record<string, any> | null;
    return cfg?.edrSchedule?.enabled === true;
  });

  if (!scheduleEnabled) {
    console.log(`[EDR Scheduler] tenant=${tenantId}: schedule not enabled — skipping`);
    return;
  }

  // Fetch all assets with an EDR host ID (no per-asset schedule flag needed)
  const eligible = await db
    .select({ id: assets.id, hostname: assets.hostname })
    .from(assets)
    .where(and(
      eq(assets.tenantId, tenantId),
      isNotNull(assets.edrHostId)
    ));

  console.log(`[EDR Scheduler] tenant=${tenantId}: ${eligible.length} assets eligible for assessment`);

  const BATCH_SIZE = 10;
  const DELAY_MS = 5000;

  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(a => runCisAssessment(tenantId, a.id, "scheduler").catch(err => {
        console.error(`[EDR Scheduler] asset=${a.id} (${a.hostname}) failed:`, err);
      }))
    );
    if (i + BATCH_SIZE < eligible.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }
}

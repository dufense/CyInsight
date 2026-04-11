/**
 * EDR Remediation Engine
 *
 * Provides typed functions for endpoint isolation, unisolation, and preset
 * remediation command execution via the configured EDR provider.
 * All actions are logged to edr_remediation_actions for full audit trail.
 */

import { db } from "./db";
import { assets, edrRemediationActions } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getEdrProvider, type EdrActionResult } from "./edr-provider";

// Preset remediation command dictionary

export const PRESET_COMMANDS: Record<string, {
  label: string;
  description: string;
  windowsScript: string;
  linuxScript: string;
}> = {
  clear_temp_files: {
    label: "Clear Temp Files",
    description: "Remove files from temp directories to eliminate potential malware persistence",
    windowsScript: `Remove-Item -Path "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item -Path "C:\\Windows\\Temp\\*" -Recurse -Force -ErrorAction SilentlyContinue; Write-Output "Temp files cleared"`,
    linuxScript: `rm -rf /tmp/* /var/tmp/* 2>/dev/null; echo "Temp files cleared"`,
  },
  run_av_scan: {
    label: "Run AV Scan",
    description: "Trigger a quick antivirus scan on the endpoint",
    windowsScript: `Start-MpScan -ScanType QuickScan -ErrorAction SilentlyContinue; Write-Output "Windows Defender quick scan initiated"`,
    linuxScript: `if command -v clamscan &>/dev/null; then clamscan --infected --remove --recursive /home /tmp 2>/dev/null & echo "ClamAV scan started"; else echo "No AV scanner found"; fi`,
  },
  kill_process: {
    label: "Kill Suspicious Processes",
    description: "Terminate processes commonly associated with malware (adjust targets as needed)",
    windowsScript: `$suspicious = @("powershell_ise","cmd","wscript","cscript"); foreach ($p in $suspicious) { Stop-Process -Name $p -Force -ErrorAction SilentlyContinue }; Write-Output "Process termination attempted"`,
    linuxScript: `pkill -f "nc -e /bin/sh" 2>/dev/null; pkill -f "bash -i >& /dev" 2>/dev/null; echo "Suspicious process kill attempted"`,
  },
  flush_dns: {
    label: "Flush DNS Cache",
    description: "Clear DNS cache to remove potentially poisoned records",
    windowsScript: `ipconfig /flushdns; Write-Output "DNS cache flushed"`,
    linuxScript: `if command -v systemd-resolve &>/dev/null; then systemd-resolve --flush-caches; echo "systemd-resolve DNS cache flushed"; elif command -v service &>/dev/null; then service nscd restart 2>/dev/null; echo "nscd restarted"; else echo "No DNS cache service found"; fi`,
  },
  disable_local_account: {
    label: "Disable Suspicious Local Account",
    description: "Disable the last logged-in user account (use with caution)",
    windowsScript: `$user = (Get-WmiObject -Class Win32_ComputerSystem).UserName -replace ".*\\\\",""; if ($user) { Disable-LocalUser -Name $user -ErrorAction SilentlyContinue; Write-Output "Disabled account: $user" } else { Write-Output "No active user session found" }`,
    linuxScript: `last_user=$(last -n 1 -R 2>/dev/null | awk 'NR==1{print $1}'); if [ -n "$last_user" ] && [ "$last_user" != "reboot" ]; then usermod -L "$last_user" 2>/dev/null; echo "Locked account: $last_user"; else echo "No user to lock"; fi`,
  },
};

export type RemediationActionType = "isolate" | "unisolate" | "run_command";

export interface RemediationResult {
  success: boolean;
  message: string;
  actionId?: number;
  rawResponse?: any;
}

// Shared: load asset + provider

async function loadAssetAndProvider(tenantId: number, assetId: number) {
  const [asset] = await db.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.tenantId, tenantId)));
  if (!asset) throw Object.assign(new Error("Asset not found"), { status: 404 });
  if (!asset.edrHostId) throw Object.assign(new Error("Asset has no EDR host ID. Sync the EDR integration first."), { status: 422 });

  const provider = await getEdrProvider(tenantId);
  if (!provider) throw Object.assign(new Error("No supported EDR integration configured for this tenant"), { status: 422 });

  return { asset, provider };
}

// Log action to DB

async function logAction(
  tenantId: number,
  assetId: number,
  edrPlatform: string,
  actionType: RemediationActionType,
  commandKey: string | null,
  triggeredBy: string,
  result: EdrActionResult | { success: boolean; message: string; rawResponse?: any }
): Promise<number> {
  const [row] = await db.insert(edrRemediationActions).values({
    tenantId,
    assetId,
    edrPlatform,
    actionType,
    commandKey: commandKey ?? undefined,
    status: result.success ? "success" : "failed",
    triggeredBy,
    edrResponse: result.rawResponse ?? null,
    errorMessage: result.success ? null : result.message,
  }).returning({ id: edrRemediationActions.id });
  return row.id;
}

// Public API

export async function isolateEndpoint(
  tenantId: number,
  assetId: number,
  triggeredBy: string
): Promise<RemediationResult> {
  try {
    const { asset, provider } = await loadAssetAndProvider(tenantId, assetId);
    const result = await provider.isolateHost(asset.edrHostId!);
    const actionId = await logAction(tenantId, assetId, provider.platformKey, "isolate", null, triggeredBy, result);

    if (result.success) {
      // Reflect isolation in asset status
      await db.update(assets).set({ status: "quarantined" }).where(eq(assets.id, assetId));
    }

    return { ...result, actionId };
  } catch (err: any) {
    if (err.status) throw err;
    return { success: false, message: err.message };
  }
}

export async function unisolateEndpoint(
  tenantId: number,
  assetId: number,
  triggeredBy: string
): Promise<RemediationResult> {
  try {
    const { asset, provider } = await loadAssetAndProvider(tenantId, assetId);
    const result = await provider.unisolateHost(asset.edrHostId!);
    const actionId = await logAction(tenantId, assetId, provider.platformKey, "unisolate", null, triggeredBy, result);

    if (result.success) {
      await db.update(assets).set({ status: "active" }).where(eq(assets.id, assetId));
    }

    return { ...result, actionId };
  } catch (err: any) {
    if (err.status) throw err;
    return { success: false, message: err.message };
  }
}

export async function runRemediationCommand(
  tenantId: number,
  assetId: number,
  commandKey: string,
  triggeredBy: string
): Promise<RemediationResult> {
  const preset = PRESET_COMMANDS[commandKey];
  if (!preset) {
    return { success: false, message: `Unknown command key: ${commandKey}` };
  }

  try {
    const { asset, provider } = await loadAssetAndProvider(tenantId, assetId);
    const osType = (asset.operatingSystem ?? "").toLowerCase().includes("windows") ? "windows" : "linux";
    const script = osType === "windows" ? preset.windowsScript : preset.linuxScript;

    const cmdResult = await provider.runAssessmentScript(asset.edrHostId!, osType, script);
    const actionId = await logAction(
      tenantId, assetId, provider.platformKey, "run_command", commandKey, triggeredBy,
      { success: cmdResult.success, message: cmdResult.output, rawResponse: cmdResult.rawResponse }
    );

    return {
      success: cmdResult.success,
      message: cmdResult.success ? cmdResult.output : `Command failed: ${JSON.stringify(cmdResult.rawResponse)}`,
      actionId,
      rawResponse: cmdResult.rawResponse,
    };
  } catch (err: any) {
    if (err.status) throw err;
    return { success: false, message: err.message };
  }
}

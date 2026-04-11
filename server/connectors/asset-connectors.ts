/**
 * Asset inventory connectors for EDR/XDR, Endpoint Security, DLP,
 * Patch Management, and Vulnerability Management platforms.
 *
 * Each platform has a dedicated connector class with a concrete pullAssets()
 * implementation. Where a live vendor API has not yet been built, the
 * connector returns a deterministic mapped stub that reflects the expected
 * AssetRecord shape for that platform. Real connectors (CrowdStrike, Cynet)
 * live in their own files and make live API calls.
 *
 * All AssetRecord fields conform strictly to the interface in base-connector.ts.
 * status values are from the asset_status enum: active|inactive|decommissioned|quarantined.
 * Fields not in AssetRecord (osVersion, deploymentType, etc.) are placed in enrichmentData.
 */

import {
  BaseConnector,
  registerConnector,
  type ConnectionTestResult,
  type PullDataResult,
  type EventSchemaField,
  type AssetRecord,
} from "./base-connector";

// Live connectors — imported for their self-registration side-effect
import "./vicarius";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal realistic AssetRecord for a stub connector */
function stubRecord(
  hostname: string,
  platformKey: string,
  overrides: Partial<AssetRecord> = {}
): AssetRecord {
  return {
    hostname,
    operatingSystem: "Windows 10 Enterprise",
    status: "active",
    riskScore: 20,
    riskLevel: "low",
    agentVersion: "1.0.0",
    source: platformKey,
    sourcePlatforms: [platformKey],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Base stub: shared scaffolding
// ---------------------------------------------------------------------------

abstract class StubAssetConnector extends BaseConnector {
  abstract get platformKey(): string;
  abstract get platformLabel(): string;

  /** Subclasses override to return their mapped stub records */
  protected buildStubAssets(): AssetRecord[] {
    return [];
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return {
      success: false,
      latencyMs: 0,
      message: `${this.platformLabel}: live connection not configured`,
      timestamp: new Date().toISOString(),
    };
  }

  async pullData(): Promise<PullDataResult> {
    return { events: [], totalPulled: 0, hasMore: false, message: `${this.platformLabel}: alert pull not implemented` };
  }

  getEventSchema(): EventSchemaField[] {
    return [];
  }

  mapToInternal(rawEvent: Record<string, unknown>): Record<string, unknown> {
    return rawEvent;
  }

  async pullAssets(): Promise<{ assets: AssetRecord[]; totalPulled: number; message: string }> {
    const assets = this.buildStubAssets();
    return {
      assets,
      totalPulled: assets.length,
      message: `${this.platformLabel}: returned ${assets.length} stub asset records (live API not yet configured)`,
    };
  }
}

// ---------------------------------------------------------------------------
// EDR / XDR
// ---------------------------------------------------------------------------

class PaloAltoCortexConnector extends StubAssetConnector {
  get platformKey() { return "palo_alto_cortex"; }
  get platformLabel() { return "Palo Alto Cortex XDR"; }

  protected buildStubAssets(): AssetRecord[] {
    return [
      stubRecord("CORTEX-WIN-001", this.platformKey, {
        operatingSystem: "Windows 11 Enterprise", agentVersion: "8.3.0.12101",
        riskScore: 15, riskLevel: "low", status: "active",
        enrichmentData: { osVersion: "10.0.22621", vendor: "Palo Alto Networks" },
      }),
      stubRecord("CORTEX-WIN-002", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise", agentVersion: "8.3.0.12101",
        riskScore: 35, riskLevel: "medium", status: "active",
        enrichmentData: { osVersion: "10.0.19045", vendor: "Palo Alto Networks" },
      }),
      stubRecord("CORTEX-LNX-001", this.platformKey, {
        operatingSystem: "Ubuntu 22.04 LTS", agentVersion: "8.3.0.12101",
        riskScore: 10, riskLevel: "low", status: "active", endpointType: "Server",
        enrichmentData: { osVersion: "22.04", vendor: "Palo Alto Networks" },
      }),
    ];
  }
}

class SentinelOneConnector extends StubAssetConnector {
  get platformKey() { return "sentinelone"; }
  get platformLabel() { return "SentinelOne Singularity"; }

  protected buildStubAssets(): AssetRecord[] {
    return [
      stubRecord("S1-DESKTOP-001", this.platformKey, {
        operatingSystem: "Windows 11 Enterprise", agentVersion: "23.4.2.3",
        riskScore: 10, riskLevel: "low", status: "active", endpointType: "Workstation",
        enrichmentData: { osVersion: "10.0.22621", groupName: "Default Group" },
        edrHostId: "s1-agent-001", edrPlatform: "sentinelone",
      }),
      stubRecord("S1-DESKTOP-002", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise", agentVersion: "23.4.2.3",
        riskScore: 40, riskLevel: "medium", status: "active", endpointType: "Workstation",
        enrichmentData: { osVersion: "10.0.19045", groupName: "Default Group" },
        edrHostId: "s1-agent-002", edrPlatform: "sentinelone",
      }),
      stubRecord("S1-SERVER-001", this.platformKey, {
        operatingSystem: "Windows Server 2022", agentVersion: "23.4.2.3",
        riskScore: 25, riskLevel: "low", status: "active", endpointType: "Server",
        enrichmentData: { osVersion: "10.0.20348", groupName: "Servers" },
        edrHostId: "s1-agent-srv-001", edrPlatform: "sentinelone",
      }),
      stubRecord("S1-MAC-001", this.platformKey, {
        operatingSystem: "macOS 13.4 Ventura", agentVersion: "23.4.2.3",
        riskScore: 8, riskLevel: "low", status: "active", endpointType: "Workstation",
        enrichmentData: { osVersion: "13.4", groupName: "Mac Fleet" },
        edrHostId: "s1-agent-mac-001", edrPlatform: "sentinelone",
      }),
    ];
  }
}

class MsDefenderEndpointConnector extends StubAssetConnector {
  get platformKey() { return "ms_defender_endpoint"; }
  get platformLabel() { return "Microsoft Defender for Endpoint"; }

  protected buildStubAssets(): AssetRecord[] {
    return [
      stubRecord("MDE-WIN11-001", this.platformKey, {
        operatingSystem: "Windows 11 Enterprise", agentVersion: "10.8740.19041.2364",
        riskScore: 18, riskLevel: "low", status: "active",
        enrichmentData: { osVersion: "10.0.22621.2715", riskExposureLevel: "Low" },
        edrHostId: "mde-machine-001", edrPlatform: "ms_defender_endpoint",
      }),
      stubRecord("MDE-WIN10-001", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise 21H2", agentVersion: "10.8740.19041.2364",
        riskScore: 55, riskLevel: "high", status: "active",
        enrichmentData: { osVersion: "10.0.19044.3086", riskExposureLevel: "High" },
        edrHostId: "mde-machine-002", edrPlatform: "ms_defender_endpoint",
      }),
      stubRecord("MDE-SVR-001", this.platformKey, {
        operatingSystem: "Windows Server 2019", agentVersion: "10.8740.19041.2364",
        riskScore: 30, riskLevel: "medium", status: "active", endpointType: "Server",
        enrichmentData: { osVersion: "10.0.17763.4737", riskExposureLevel: "Medium" },
        edrHostId: "mde-machine-srv-001", edrPlatform: "ms_defender_endpoint",
      }),
      stubRecord("MDE-SVR-002", this.platformKey, {
        operatingSystem: "Windows Server 2016", agentVersion: "10.8740.19041.2364",
        riskScore: 65, riskLevel: "high", status: "active", endpointType: "Server",
        enrichmentData: { osVersion: "10.0.14393.6230", riskExposureLevel: "High" },
        edrHostId: "mde-machine-srv-002", edrPlatform: "ms_defender_endpoint",
      }),
    ];
  }
}

// ---------------------------------------------------------------------------
// Endpoint Security
// ---------------------------------------------------------------------------

class DeceptiveBytesConnector extends StubAssetConnector {
  get platformKey() { return "deceptive_bytes"; }
  get platformLabel() { return "Deceptive Bytes"; }

  protected buildStubAssets(): AssetRecord[] {
    return [
      stubRecord("DB-AGENT-001", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise", agentVersion: "3.2.1",
        riskScore: 5, riskLevel: "low", status: "active",
        enrichmentData: { agentStatus: "Protected", osVersion: "10.0.19045" },
      }),
      stubRecord("DB-AGENT-002", this.platformKey, {
        operatingSystem: "Windows 11 Enterprise", agentVersion: "3.2.1",
        riskScore: 12, riskLevel: "low", status: "active",
        enrichmentData: { agentStatus: "Protected", osVersion: "10.0.22621" },
      }),
    ];
  }
}

class SophosEndpointConnector extends StubAssetConnector {
  get platformKey() { return "sophos_endpoint"; }
  get platformLabel() { return "Sophos Endpoint"; }

  protected buildStubAssets(): AssetRecord[] {
    return [
      stubRecord("SOPHOS-WIN-001", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise", agentVersion: "2023.1.0.3",
        riskScore: 20, riskLevel: "low", status: "active",
        enrichmentData: { type: "Workstation", tamperProtection: true },
      }),
      stubRecord("SOPHOS-WIN-002", this.platformKey, {
        operatingSystem: "Windows 11 Enterprise", agentVersion: "2023.1.0.3",
        riskScore: 8, riskLevel: "low", status: "active",
        enrichmentData: { type: "Workstation", tamperProtection: true },
      }),
      stubRecord("SOPHOS-MAC-001", this.platformKey, {
        operatingSystem: "macOS 13.6 Ventura", agentVersion: "2023.1.0.3",
        riskScore: 6, riskLevel: "low", status: "active",
        enrichmentData: { type: "Workstation", tamperProtection: true },
      }),
    ];
  }
}

class TrendMicroEndpointConnector extends StubAssetConnector {
  get platformKey() { return "trendmicro_endpoint"; }
  get platformLabel() { return "Trend Micro Endpoint"; }

  protected buildStubAssets(): AssetRecord[] {
    return [
      stubRecord("TMEP-WIN-001", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise", agentVersion: "14.0.12345",
        riskScore: 22, riskLevel: "low", status: "active",
        enrichmentData: { policyName: "Standard Policy", componentVersion: "14.0" },
      }),
      stubRecord("TMEP-WIN-002", this.platformKey, {
        operatingSystem: "Windows Server 2022", agentVersion: "14.0.12345",
        riskScore: 30, riskLevel: "medium", status: "active", endpointType: "Server",
        enrichmentData: { policyName: "Server Policy", componentVersion: "14.0" },
      }),
    ];
  }
}

// ---------------------------------------------------------------------------
// DLP
// ---------------------------------------------------------------------------

class ForcepointDLPConnector extends StubAssetConnector {
  get platformKey() { return "forcepoint_dlp"; }
  get platformLabel() { return "Forcepoint DLP"; }

  protected buildStubAssets(): AssetRecord[] {
    return [
      stubRecord("FP-DLP-AGENT-001", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise", agentVersion: "8.9.1",
        riskScore: 15, riskLevel: "low", status: "active",
        enrichmentData: { policyProfile: "Financial Data", channelControl: true },
      }),
      stubRecord("FP-DLP-AGENT-002", this.platformKey, {
        operatingSystem: "Windows 11 Enterprise", agentVersion: "8.9.1",
        riskScore: 10, riskLevel: "low", status: "active",
        enrichmentData: { policyProfile: "Financial Data", channelControl: true },
      }),
    ];
  }
}

class TrellixDLPConnector extends StubAssetConnector {
  get platformKey() { return "trellix_dlp"; }
  get platformLabel() { return "Trellix DLP"; }

  protected buildStubAssets(): AssetRecord[] {
    return [
      stubRecord("TRELLIX-DLP-001", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise", agentVersion: "11.10.0",
        riskScore: 18, riskLevel: "low", status: "active",
        enrichmentData: { policySet: "Default", epoManaged: true },
      }),
      stubRecord("TRELLIX-DLP-002", this.platformKey, {
        operatingSystem: "Windows Server 2019", agentVersion: "11.10.0",
        riskScore: 25, riskLevel: "low", status: "active", endpointType: "Server",
        enrichmentData: { policySet: "Server", epoManaged: true },
      }),
    ];
  }
}

class FortiDLPConnector extends StubAssetConnector {
  get platformKey() { return "fortidlp"; }
  get platformLabel() { return "FortiDLP"; }

  protected buildStubAssets(): AssetRecord[] {
    return [
      stubRecord("FORDLP-WIN-001", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise", agentVersion: "22.3.0",
        riskScore: 12, riskLevel: "low", status: "active",
        enrichmentData: { policyGroup: "Default" },
      }),
    ];
  }
}

class GTBDLPConnector extends StubAssetConnector {
  get platformKey() { return "gtb_dlp"; }
  get platformLabel() { return "GTB DLP"; }

  protected buildStubAssets(): AssetRecord[] {
    return [
      stubRecord("GTB-WIN-001", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise", agentVersion: "19.5.0",
        riskScore: 14, riskLevel: "low", status: "active",
        enrichmentData: { inspectionMode: "Full" },
      }),
    ];
  }
}

class ProofpointDLPConnector extends StubAssetConnector {
  get platformKey() { return "proofpoint_dlp"; }
  get platformLabel() { return "Proofpoint DLP"; }

  protected buildStubAssets(): AssetRecord[] {
    return [
      stubRecord("PP-DLP-001", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise", agentVersion: "8.21.2",
        riskScore: 16, riskLevel: "low", status: "active",
        enrichmentData: { agentMode: "Monitor" },
      }),
      stubRecord("PP-DLP-002", this.platformKey, {
        operatingSystem: "Windows 11 Enterprise", agentVersion: "8.21.2",
        riskScore: 9, riskLevel: "low", status: "active",
        enrichmentData: { agentMode: "Enforce" },
      }),
    ];
  }
}

// ---------------------------------------------------------------------------
// Vulnerability Management
// ---------------------------------------------------------------------------

class Rapid7Connector extends StubAssetConnector {
  get platformKey() { return "rapid7"; }
  get platformLabel() { return "Rapid7 InsightVM"; }

  protected buildStubAssets(): AssetRecord[] {
    return [
      stubRecord("RAPID7-SCAN-001", this.platformKey, {
        operatingSystem: "Windows Server 2019", agentVersion: "6.6.196",
        riskScore: 70, riskLevel: "high", status: "active", endpointType: "Server",
        enrichmentData: { criticalVulns: 5, exploitableVulns: 3, scanStatus: "completed" },
      }),
      stubRecord("RAPID7-SCAN-002", this.platformKey, {
        operatingSystem: "Ubuntu 20.04 LTS", agentVersion: "6.6.196",
        riskScore: 45, riskLevel: "medium", status: "active", endpointType: "Server",
        enrichmentData: { criticalVulns: 2, exploitableVulns: 1, scanStatus: "completed" },
      }),
      stubRecord("RAPID7-WIN-001", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise", agentVersion: "6.6.196",
        riskScore: 35, riskLevel: "medium", status: "active",
        enrichmentData: { criticalVulns: 1, exploitableVulns: 0, scanStatus: "completed" },
      }),
    ];
  }
}

class QualysConnector extends StubAssetConnector {
  get platformKey() { return "qualys"; }
  get platformLabel() { return "Qualys VMDR"; }

  protected buildStubAssets(): AssetRecord[] {
    return [
      stubRecord("QUALYS-WIN-001", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise", agentVersion: "4.3.0.100",
        riskScore: 28, riskLevel: "low", status: "active",
        enrichmentData: { trs: 260, qualysAgentStatus: "Active" },
      }),
      stubRecord("QUALYS-WIN-002", this.platformKey, {
        operatingSystem: "Windows Server 2016", agentVersion: "4.3.0.100",
        riskScore: 60, riskLevel: "high", status: "active", endpointType: "Server",
        enrichmentData: { trs: 720, qualysAgentStatus: "Active" },
      }),
      stubRecord("QUALYS-LNX-001", this.platformKey, {
        operatingSystem: "CentOS Linux 7", agentVersion: "4.3.0.100",
        riskScore: 50, riskLevel: "medium", status: "active", endpointType: "Server",
        enrichmentData: { trs: 490, qualysAgentStatus: "Active" },
      }),
    ];
  }
}

class TenableConnector extends StubAssetConnector {
  get platformKey() { return "tenable"; }
  get platformLabel() { return "Tenable.io"; }

  protected buildStubAssets(): AssetRecord[] {
    return [
      stubRecord("TENABLE-WIN-001", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise", agentVersion: "10.5.2",
        riskScore: 38, riskLevel: "medium", status: "active",
        enrichmentData: { acrScore: 38, exposureScore: 320, scanFrequency: "daily" },
      }),
      stubRecord("TENABLE-SVR-001", this.platformKey, {
        operatingSystem: "Windows Server 2022", agentVersion: "10.5.2",
        riskScore: 55, riskLevel: "high", status: "active", endpointType: "Server",
        enrichmentData: { acrScore: 55, exposureScore: 580, scanFrequency: "daily" },
      }),
      stubRecord("TENABLE-LNX-001", this.platformKey, {
        operatingSystem: "Ubuntu 22.04 LTS", agentVersion: "10.5.2",
        riskScore: 42, riskLevel: "medium", status: "active", endpointType: "Server",
        enrichmentData: { acrScore: 42, exposureScore: 410, scanFrequency: "daily" },
      }),
    ];
  }
}

// VicariusConnector — live connector; registered via import at bottom of this file.

// ---------------------------------------------------------------------------
// Patch Management
// ---------------------------------------------------------------------------

class MsIntuneConnector extends StubAssetConnector {
  get platformKey() { return "ms_intune"; }
  get platformLabel() { return "Microsoft Intune"; }

  protected buildStubAssets(): AssetRecord[] {
    return [
      stubRecord("INTUNE-WIN11-001", this.platformKey, {
        operatingSystem: "Windows 11 Enterprise 23H2", agentVersion: "MDM:10.0.22631",
        riskScore: 10, riskLevel: "low", status: "active",
        enrichmentData: { enrollmentType: "AzureAD", complianceState: "Compliant", mdmAuthority: "Intune" },
      }),
      stubRecord("INTUNE-WIN11-002", this.platformKey, {
        operatingSystem: "Windows 11 Enterprise 22H2", agentVersion: "MDM:10.0.22621",
        riskScore: 25, riskLevel: "low", status: "active",
        enrichmentData: { enrollmentType: "AzureAD", complianceState: "NonCompliant", mdmAuthority: "Intune" },
      }),
      stubRecord("INTUNE-MAC-001", this.platformKey, {
        operatingSystem: "macOS 14.1 Sonoma", agentVersion: "MDM:2309.1",
        riskScore: 8, riskLevel: "low", status: "active",
        enrichmentData: { enrollmentType: "UserApproved", complianceState: "Compliant", mdmAuthority: "Intune" },
      }),
      stubRecord("INTUNE-WIN10-001", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise 22H2", agentVersion: "MDM:10.0.19045",
        riskScore: 40, riskLevel: "medium", status: "active",
        enrichmentData: { enrollmentType: "AzureAD", complianceState: "NonCompliant", mdmAuthority: "Intune" },
      }),
    ];
  }
}

class MsSccmConnector extends StubAssetConnector {
  get platformKey() { return "ms_sccm"; }
  get platformLabel() { return "Microsoft SCCM / Endpoint Manager"; }

  protected buildStubAssets(): AssetRecord[] {
    return [
      stubRecord("SCCM-CLIENT-001", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise", agentVersion: "SCCM:5.00.9096",
        riskScore: 20, riskLevel: "low", status: "active",
        enrichmentData: { clientVersion: "5.00.9096.1000", managementPoint: "SCCM-MP-01", compliance: true },
      }),
      stubRecord("SCCM-CLIENT-002", this.platformKey, {
        operatingSystem: "Windows Server 2019", agentVersion: "SCCM:5.00.9096",
        riskScore: 30, riskLevel: "medium", status: "active", endpointType: "Server",
        enrichmentData: { clientVersion: "5.00.9096.1000", managementPoint: "SCCM-MP-01", compliance: false },
      }),
      stubRecord("SCCM-CLIENT-003", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise 21H2", agentVersion: "SCCM:5.00.9096",
        riskScore: 15, riskLevel: "low", status: "active",
        enrichmentData: { clientVersion: "5.00.9096.1000", managementPoint: "SCCM-MP-02", compliance: true },
      }),
    ];
  }
}

class IvantiPatchConnector extends StubAssetConnector {
  get platformKey() { return "ivanti_patch"; }
  get platformLabel() { return "Ivanti Patch Management"; }

  protected buildStubAssets(): AssetRecord[] {
    return [
      stubRecord("IVANTI-WIN-001", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise", agentVersion: "2023.3",
        riskScore: 22, riskLevel: "low", status: "active",
        enrichmentData: { patchGroup: "Production Workstations", missingPatches: 3 },
      }),
      stubRecord("IVANTI-WIN-002", this.platformKey, {
        operatingSystem: "Windows Server 2022", agentVersion: "2023.3",
        riskScore: 35, riskLevel: "medium", status: "active", endpointType: "Server",
        enrichmentData: { patchGroup: "Production Servers", missingPatches: 8 },
      }),
    ];
  }
}

class ManageEnginePatchConnector extends StubAssetConnector {
  get platformKey() { return "manage_engine_patch"; }
  get platformLabel() { return "ManageEngine Patch Manager Plus"; }

  protected buildStubAssets(): AssetRecord[] {
    return [
      stubRecord("MEPM-WIN-001", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise", agentVersion: "10.1.2220",
        riskScore: 18, riskLevel: "low", status: "active",
        enrichmentData: { patchStatus: "Fully Patched", systemGroup: "Workstations" },
      }),
      stubRecord("MEPM-WIN-002", this.platformKey, {
        operatingSystem: "Windows 11 Enterprise", agentVersion: "10.1.2220",
        riskScore: 12, riskLevel: "low", status: "active",
        enrichmentData: { patchStatus: "Fully Patched", systemGroup: "Workstations" },
      }),
    ];
  }
}

class WsusConnector extends StubAssetConnector {
  get platformKey() { return "wsus"; }
  get platformLabel() { return "Microsoft WSUS"; }

  protected buildStubAssets(): AssetRecord[] {
    return [
      stubRecord("WSUS-WIN-001", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise 22H2", agentVersion: "WUA:10.0.19041",
        riskScore: 20, riskLevel: "low", status: "active",
        enrichmentData: { wsusGroup: "Workstations", lastUpdateInstalled: "2024-01-15" },
      }),
      stubRecord("WSUS-WIN-002", this.platformKey, {
        operatingSystem: "Windows Server 2019", agentVersion: "WUA:10.0.17763",
        riskScore: 25, riskLevel: "low", status: "active", endpointType: "Server",
        enrichmentData: { wsusGroup: "Servers", lastUpdateInstalled: "2024-01-10" },
      }),
      stubRecord("WSUS-WIN-003", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise 21H2", agentVersion: "WUA:10.0.19044",
        riskScore: 30, riskLevel: "medium", status: "active",
        enrichmentData: { wsusGroup: "Workstations", lastUpdateInstalled: "2024-01-08" },
      }),
    ];
  }
}

class BigFixConnector extends StubAssetConnector {
  get platformKey() { return "bigfix"; }
  get platformLabel() { return "HCL BigFix"; }

  protected buildStubAssets(): AssetRecord[] {
    return [
      stubRecord("BIGFIX-WIN-001", this.platformKey, {
        operatingSystem: "Windows 10 Enterprise", agentVersion: "10.0.9",
        riskScore: 15, riskLevel: "low", status: "active",
        enrichmentData: { relayServer: "BIGFIX-RELAY-01", subscribed: true },
      }),
      stubRecord("BIGFIX-LNX-001", this.platformKey, {
        operatingSystem: "Red Hat Enterprise Linux 8", agentVersion: "10.0.9",
        riskScore: 28, riskLevel: "low", status: "active", endpointType: "Server",
        enrichmentData: { relayServer: "BIGFIX-RELAY-01", subscribed: true },
      }),
    ];
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

registerConnector("palo_alto_cortex", PaloAltoCortexConnector);
registerConnector("sentinelone", SentinelOneConnector);
registerConnector("ms_defender_endpoint", MsDefenderEndpointConnector);

registerConnector("deceptive_bytes", DeceptiveBytesConnector);
registerConnector("sophos_endpoint", SophosEndpointConnector);
registerConnector("trendmicro_endpoint", TrendMicroEndpointConnector);

registerConnector("forcepoint_dlp", ForcepointDLPConnector);
registerConnector("trellix_dlp", TrellixDLPConnector);
registerConnector("fortidlp", FortiDLPConnector);
registerConnector("gtb_dlp", GTBDLPConnector);
registerConnector("proofpoint_dlp", ProofpointDLPConnector);

registerConnector("rapid7", Rapid7Connector);
registerConnector("qualys", QualysConnector);
registerConnector("tenable", TenableConnector);
// vicarius is registered in server/connectors/vicarius.ts (live connector)

registerConnector("ms_intune", MsIntuneConnector);
registerConnector("ms_sccm", MsSccmConnector);
registerConnector("ivanti_patch", IvantiPatchConnector);
registerConnector("manage_engine_patch", ManageEnginePatchConnector);
registerConnector("wsus", WsusConnector);
registerConnector("bigfix", BigFixConnector);

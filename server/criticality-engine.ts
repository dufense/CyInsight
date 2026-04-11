interface AssetForCriticality {
  hostname?: string | null;
  endpointType?: string | null;
  endpointGroup?: string | null;
  tags?: string | null;
  criticality?: string | null;
}

const CRITICAL_PATTERNS = /\b(dc|pdc|bdc|ad|ldap|gpo|sccm|wsus|exchange|mail|smtp|kms|pki|ca|sql|db|database|finance|fin|erp|sap|oracle|core|infra|prod|production|backup|bkp|bkup|veeam|nas|san|nfs|vault|secret|key|hsm|fw|firewall|gw|gateway|vpn|proxy|bastion|jump|mgmt|mgr)\d*[.\-]/i;
const HIGH_PATTERNS = /\b(app|api|web|www|srv|server|vm|vms|esxi|hyper|dev|qa|uat|test|stage|monitoring|log|siem|soc|ids|ips|dlp|edr|crm|hrm|erp)\d*[.\-]/i;
const SERVER_TYPES = /server|virtual machine|esxi|hypervisor/i;
const CRITICAL_GROUPS = /critical|tier.?0|tier.?1|production|finance|security|domain.control/i;
const HIGH_GROUPS = /tier.?2|application|backend|database/i;

export type CriticalityTier = "critical" | "high" | "medium" | "low" | "unclassified";

export function assignCriticality(asset: AssetForCriticality): CriticalityTier {
  const hostname = (asset.hostname || "").toLowerCase() + "-";
  const endpointType = (asset.endpointType || "").toLowerCase();
  const endpointGroup = (asset.endpointGroup || "").toLowerCase();
  const tags = (asset.tags || "").toLowerCase();

  if (CRITICAL_PATTERNS.test(hostname)) return "critical";
  if (/domain.control|dc\d+/i.test(hostname)) return "critical";
  if (CRITICAL_GROUPS.test(endpointGroup)) return "critical";
  if (/critical/i.test(tags)) return "critical";

  if (SERVER_TYPES.test(endpointType)) return "high";
  if (HIGH_PATTERNS.test(hostname)) return "high";
  if (HIGH_GROUPS.test(endpointGroup)) return "high";
  if (/high/i.test(tags)) return "high";

  if (/workstation|laptop|desktop/i.test(endpointType)) return "medium";
  if (/medium/i.test(tags)) return "medium";

  if (/mobile|phone|tablet|iot/i.test(endpointType)) return "low";
  if (/low/i.test(tags)) return "low";

  return "unclassified";
}

export const CRITICALITY_MULTIPLIER: Record<CriticalityTier, number> = {
  critical: 1.25,
  high: 1.10,
  medium: 1.00,
  low: 0.90,
  unclassified: 1.00,
};

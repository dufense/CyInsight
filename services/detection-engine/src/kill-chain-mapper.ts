export interface KillChainMapping {
  phase: string;
  phaseNumber: number;
  description: string;
  severity_multiplier: number;
}

const KILL_CHAIN_PHASES: Record<string, KillChainMapping> = {
  reconnaissance: {
    phase: "Reconnaissance",
    phaseNumber: 1,
    description: "Adversary gathers information about the target before launching an attack.",
    severity_multiplier: 0.8,
  },
  weaponization: {
    phase: "Weaponization",
    phaseNumber: 2,
    description: "Adversary creates or acquires tools and payloads for the attack.",
    severity_multiplier: 0.85,
  },
  delivery: {
    phase: "Delivery",
    phaseNumber: 3,
    description: "Adversary transmits the weapon to the target environment.",
    severity_multiplier: 1.0,
  },
  exploitation: {
    phase: "Exploitation",
    phaseNumber: 4,
    description: "Adversary exploits a vulnerability to execute code on the target system.",
    severity_multiplier: 1.1,
  },
  installation: {
    phase: "Installation",
    phaseNumber: 5,
    description: "Adversary installs persistent access mechanisms on the target system.",
    severity_multiplier: 1.15,
  },
  command_and_control: {
    phase: "Command & Control",
    phaseNumber: 6,
    description: "Adversary establishes communication channel with compromised system.",
    severity_multiplier: 1.2,
  },
  actions_on_objectives: {
    phase: "Actions on Objectives",
    phaseNumber: 7,
    description: "Adversary accomplishes their goal (data theft, destruction, etc.).",
    severity_multiplier: 1.3,
  },
};

export function mapToKillChain(killChainPhase: string | null | undefined): KillChainMapping | null {
  if (!killChainPhase) return null;
  return KILL_CHAIN_PHASES[killChainPhase] || null;
}

export function getKillChainFromMITRETactic(tactic: string): KillChainMapping | null {
  const TACTIC_TO_PHASE: Record<string, string> = {
    "Reconnaissance": "reconnaissance",
    "Resource Development": "weaponization",
    "Initial Access": "delivery",
    "Execution": "exploitation",
    "Persistence": "installation",
    "Privilege Escalation": "exploitation",
    "Defense Evasion": "exploitation",
    "Credential Access": "exploitation",
    "Discovery": "exploitation",
    "Lateral Movement": "installation",
    "Collection": "actions_on_objectives",
    "Command and Control": "command_and_control",
    "Exfiltration": "actions_on_objectives",
    "Impact": "actions_on_objectives",
  };

  const phase = TACTIC_TO_PHASE[tactic];
  if (!phase) return null;
  return KILL_CHAIN_PHASES[phase] || null;
}

export function adjustSeverityByKillChain(baseSeverity: string, killChain: KillChainMapping | null): string {
  if (!killChain) return baseSeverity;

  const severityOrder = ["informational", "low", "medium", "high", "critical"];
  const currentIdx = severityOrder.indexOf(baseSeverity.toLowerCase());
  if (currentIdx < 0) return baseSeverity;

  if (killChain.severity_multiplier > 1.15 && currentIdx < severityOrder.length - 1) {
    return severityOrder[currentIdx + 1];
  }

  return baseSeverity;
}

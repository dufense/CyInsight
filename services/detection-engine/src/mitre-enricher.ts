export interface MITREEnrichment {
  tactic: string;
  tacticId: string;
  technique: string;
  techniqueName: string;
  killChainPhase: string;
  description: string;
}

const MITRE_TACTICS: Record<string, { id: string; techniques: Record<string, string>; killChainPhase: string; description: string }> = {
  "Reconnaissance": {
    id: "TA0043",
    techniques: { "T1595": "Active Scanning", "T1592": "Gather Victim Host Information", "T1589": "Gather Victim Identity Information", "T1590": "Gather Victim Network Information", "T1591": "Gather Victim Org Information" },
    killChainPhase: "reconnaissance",
    description: "The adversary is trying to gather information they can use to plan future operations.",
  },
  "Resource Development": {
    id: "TA0042",
    techniques: { "T1583": "Acquire Infrastructure", "T1584": "Compromise Infrastructure", "T1587": "Develop Capabilities", "T1588": "Obtain Capabilities", "T1585": "Establish Accounts" },
    killChainPhase: "weaponization",
    description: "The adversary is trying to establish resources they can use to support operations.",
  },
  "Initial Access": {
    id: "TA0001",
    techniques: { "T1566": "Phishing", "T1190": "Exploit Public-Facing Application", "T1133": "External Remote Services", "T1078": "Valid Accounts", "T1189": "Drive-by Compromise", "T1195": "Supply Chain Compromise", "T1200": "Hardware Additions" },
    killChainPhase: "delivery",
    description: "The adversary is trying to get into your network.",
  },
  "Execution": {
    id: "TA0002",
    techniques: { "T1059": "Command and Scripting Interpreter", "T1204": "User Execution", "T1203": "Exploitation for Client Execution", "T1047": "Windows Management Instrumentation", "T1053": "Scheduled Task/Job" },
    killChainPhase: "exploitation",
    description: "The adversary is trying to run malicious code.",
  },
  "Persistence": {
    id: "TA0003",
    techniques: { "T1547": "Boot or Logon Autostart Execution", "T1053": "Scheduled Task/Job", "T1136": "Create Account", "T1098": "Account Manipulation", "T1543": "Create or Modify System Process" },
    killChainPhase: "installation",
    description: "The adversary is trying to maintain their foothold.",
  },
  "Privilege Escalation": {
    id: "TA0004",
    techniques: { "T1068": "Exploitation for Privilege Escalation", "T1055": "Process Injection", "T1134": "Access Token Manipulation", "T1548": "Abuse Elevation Control Mechanism" },
    killChainPhase: "exploitation",
    description: "The adversary is trying to gain higher-level permissions.",
  },
  "Defense Evasion": {
    id: "TA0005",
    techniques: { "T1070": "Indicator Removal", "T1036": "Masquerading", "T1027": "Obfuscated Files or Information", "T1562": "Impair Defenses", "T1218": "System Binary Proxy Execution" },
    killChainPhase: "exploitation",
    description: "The adversary is trying to avoid being detected.",
  },
  "Credential Access": {
    id: "TA0006",
    techniques: { "T1003": "OS Credential Dumping", "T1110": "Brute Force", "T1555": "Credentials from Password Stores", "T1556": "Modify Authentication Process", "T1539": "Steal Web Session Cookie" },
    killChainPhase: "exploitation",
    description: "The adversary is trying to steal account names and passwords.",
  },
  "Discovery": {
    id: "TA0007",
    techniques: { "T1087": "Account Discovery", "T1082": "System Information Discovery", "T1083": "File and Directory Discovery", "T1046": "Network Service Discovery", "T1057": "Process Discovery" },
    killChainPhase: "exploitation",
    description: "The adversary is trying to figure out your environment.",
  },
  "Lateral Movement": {
    id: "TA0008",
    techniques: { "T1021": "Remote Services", "T1570": "Lateral Tool Transfer", "T1563": "Remote Service Session Hijacking", "T1534": "Internal Spearphishing", "T1091": "Replication Through Removable Media" },
    killChainPhase: "lateral_movement",
    description: "The adversary is trying to move through your environment.",
  },
  "Collection": {
    id: "TA0009",
    techniques: { "T1560": "Archive Collected Data", "T1005": "Data from Local System", "T1039": "Data from Network Shared Drive", "T1114": "Email Collection", "T1113": "Screen Capture" },
    killChainPhase: "actions_on_objectives",
    description: "The adversary is trying to gather data of interest to their goal.",
  },
  "Command and Control": {
    id: "TA0011",
    techniques: { "T1071": "Application Layer Protocol", "T1105": "Ingress Tool Transfer", "T1572": "Protocol Tunneling", "T1573": "Encrypted Channel", "T1090": "Proxy" },
    killChainPhase: "command_and_control",
    description: "The adversary is trying to communicate with compromised systems to control them.",
  },
  "Exfiltration": {
    id: "TA0010",
    techniques: { "T1041": "Exfiltration Over C2 Channel", "T1048": "Exfiltration Over Alternative Protocol", "T1567": "Exfiltration Over Web Service", "T1029": "Scheduled Transfer", "T1052": "Exfiltration Over Physical Medium" },
    killChainPhase: "actions_on_objectives",
    description: "The adversary is trying to steal data.",
  },
  "Impact": {
    id: "TA0040",
    techniques: { "T1486": "Data Encrypted for Impact", "T1489": "Service Stop", "T1490": "Inhibit System Recovery", "T1529": "System Shutdown/Reboot", "T1485": "Data Destruction" },
    killChainPhase: "actions_on_objectives",
    description: "The adversary is trying to manipulate, interrupt, or destroy your systems and data.",
  },
};

const THREAT_TO_TACTIC: Record<string, string> = {
  "malware": "Execution",
  "ransomware": "Impact",
  "phishing": "Initial Access",
  "brute_force": "Credential Access",
  "brute force": "Credential Access",
  "data exfiltration": "Exfiltration",
  "unauthorized access": "Initial Access",
  "privilege escalation": "Privilege Escalation",
  "lateral movement": "Lateral Movement",
  "command and control": "Command and Control",
  "cryptomining": "Impact",
  "rootkit": "Persistence",
  "webshell": "Persistence",
  "process injection": "Defense Evasion",
  "dll side-loading": "Defense Evasion",
  "port scan": "Discovery",
  "network scanning": "Discovery",
  "vulnerability": "Initial Access",
  "suspicious process": "Execution",
  "defense evasion": "Defense Evasion",
  "masquerading": "Defense Evasion",
  "storage device": "Lateral Movement",
  "insertion of storage": "Lateral Movement",
  "removable media": "Lateral Movement",
  "usb device": "Lateral Movement",
  "usb mass storage": "Lateral Movement",
  "device control": "Initial Access",
  "credential access": "Credential Access",
};

const THREAT_TO_TECHNIQUE: Record<string, string> = {
  "exfiltration over usb": "T1052",
  "exfiltration over removable": "T1052",
  "copy to removable": "T1052",
  "copy to usb": "T1052",
  "data written to removable": "T1052",
  "transfer to removable": "T1052",
  "transfer to usb": "T1052",
  "storage device": "T1091",
  "insertion of storage": "T1091",
  "removable media": "T1091",
  "usb device": "T1091",
  "usb mass storage": "T1091",
  "device control": "T1200",
  "brute force": "T1110",
  "brute_force": "T1110",
  "phishing": "T1566",
};

const PHISHING_SIGNALS = ["email", "link", "attachment", "credential", "message", "lure", "click", "href", "mailto", "spoofed", "impersonat"];
const USB_MEDIA_TERMS = ["usb", "removable", "thumb drive", "flash drive", "external drive"];
const USB_EXFIL_SIGNALS = ["exfil", "copy", "transfer", "written", "upload"];

export function enrichWithMITRE(event: Record<string, any>): MITREEnrichment | null {
  const existingTactic = event.mitreTactic || event.mitre_tactic;
  const existingTechnique = event.mitreTechnique || event.mitre_technique;

  if (existingTactic && MITRE_TACTICS[existingTactic]) {
    const info = MITRE_TACTICS[existingTactic];
    return {
      tactic: existingTactic,
      tacticId: info.id,
      technique: existingTechnique || Object.keys(info.techniques)[0] || "",
      techniqueName: existingTechnique ? (info.techniques[existingTechnique] || "") : Object.values(info.techniques)[0] || "",
      killChainPhase: info.killChainPhase,
      description: info.description,
    };
  }

  const threatText = `${event.threat || ""} ${event.description || ""}`.toLowerCase();

  const hasUsbExfil = USB_MEDIA_TERMS.some(t => threatText.includes(t)) && USB_EXFIL_SIGNALS.some(s => threatText.includes(s));
  if (hasUsbExfil) {
    const exfilInfo = MITRE_TACTICS["Exfiltration"];
    return {
      tactic: "Exfiltration",
      tacticId: exfilInfo.id,
      technique: "T1052",
      techniqueName: "Exfiltration Over Physical Medium",
      killChainPhase: exfilInfo.killChainPhase,
      description: exfilInfo.description,
    };
  }

  const isPhishingContext = PHISHING_SIGNALS.some(sig => threatText.includes(sig));

  for (const [keyword, tactic] of Object.entries(THREAT_TO_TACTIC)) {
    if (keyword === "phishing" && !isPhishingContext) continue;
    if (threatText.includes(keyword)) {
      const info = MITRE_TACTICS[tactic];
      if (info) {
        const techniqueOverride = THREAT_TO_TECHNIQUE[keyword];
        const technique = techniqueOverride || Object.keys(info.techniques)[0] || "";
        return {
          tactic,
          tacticId: info.id,
          technique,
          techniqueName: info.techniques[technique] || Object.values(info.techniques)[0] || "",
          killChainPhase: info.killChainPhase,
          description: info.description,
        };
      }
    }
  }

  return null;
}

export function enrichFromSigmaMatch(sigmaTactic: string, sigmaTechnique: string): MITREEnrichment | null {
  if (!sigmaTactic) return null;

  const tacticKey = Object.keys(MITRE_TACTICS).find(
    k => k.toLowerCase() === sigmaTactic.toLowerCase()
  );
  if (!tacticKey) return null;

  const info = MITRE_TACTICS[tacticKey];
  const technique = sigmaTechnique || Object.keys(info.techniques)[0] || "";
  const techniqueName = info.techniques[technique] || Object.values(info.techniques)[0] || "";

  return {
    tactic: tacticKey,
    tacticId: info.id,
    technique,
    techniqueName,
    killChainPhase: info.killChainPhase,
    description: info.description,
  };
}

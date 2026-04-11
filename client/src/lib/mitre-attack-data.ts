export interface MitreTechnique {
  id: string;
  name: string;
  description: string;
  subTechniques?: { id: string; name: string }[];
  prevalenceRank: number;
}

export interface MitreTactic {
  id: string;
  name: string;
  shortName: string;
  techniques: MitreTechnique[];
}

export const MITRE_TACTICS: MitreTactic[] = [
  {
    id: "TA0001", name: "Reconnaissance", shortName: "Recon",
    techniques: [
      { id: "T1595", name: "Active Scanning", description: "Adversaries may scan victim IP blocks to gather information.", prevalenceRank: 12 },
      { id: "T1592", name: "Gather Victim Host Info", description: "Adversaries gather host information.", prevalenceRank: 15 },
      { id: "T1589", name: "Gather Victim Identity Info", description: "Adversaries gather identity information.", prevalenceRank: 14 },
      { id: "T1590", name: "Gather Victim Network Info", description: "Adversaries gather network information.", prevalenceRank: 16 },
      { id: "T1591", name: "Gather Victim Org Info", description: "Adversaries gather organizational information.", prevalenceRank: 18 },
      { id: "T1598", name: "Phishing for Info", description: "Adversaries send phishing to elicit sensitive information.", prevalenceRank: 9 },
      { id: "T1597", name: "Search Closed Sources", description: "Adversaries may search private data.", prevalenceRank: 20 },
      { id: "T1596", name: "Search Open Technical Databases", description: "Adversaries search open databases.", prevalenceRank: 17 },
      { id: "T1593", name: "Search Open Websites/Domains", description: "Adversaries may search websites.", prevalenceRank: 13 },
      { id: "T1594", name: "Search Victim-Owned Websites", description: "Adversaries search victim websites.", prevalenceRank: 19 },
    ]
  },
  {
    id: "TA0002", name: "Resource Development", shortName: "Resource Dev",
    techniques: [
      { id: "T1583", name: "Acquire Infrastructure", description: "Adversaries may buy, lease, or rent infrastructure.", prevalenceRank: 11 },
      { id: "T1586", name: "Compromise Accounts", description: "Adversaries may compromise accounts.", prevalenceRank: 5 },
      { id: "T1584", name: "Compromise Infrastructure", description: "Adversaries may compromise third-party infrastructure.", prevalenceRank: 10 },
      { id: "T1587", name: "Develop Capabilities", description: "Adversaries develop their own capabilities.", prevalenceRank: 13 },
      { id: "T1585", name: "Establish Accounts", description: "Adversaries create and cultivate accounts.", prevalenceRank: 14 },
      { id: "T1588", name: "Obtain Capabilities", description: "Adversaries may buy or steal capabilities.", prevalenceRank: 8 },
      { id: "T1608", name: "Stage Capabilities", description: "Adversaries upload tools to controlled infrastructure.", prevalenceRank: 12 },
    ]
  },
  {
    id: "TA0043", name: "Initial Access", shortName: "Initial Access",
    techniques: [
      { id: "T1189", name: "Drive-by Compromise", description: "Adversaries gain access through drive-by compromise.", prevalenceRank: 15 },
      { id: "T1190", name: "Exploit Public-Facing Application", description: "Adversaries exploit internet-facing software.", prevalenceRank: 3 },
      { id: "T1133", name: "External Remote Services", description: "Adversaries leverage external remote services.", prevalenceRank: 4 },
      { id: "T1200", name: "Hardware Additions", description: "Adversaries introduce hardware.", prevalenceRank: 20 },
      { id: "T1566", name: "Phishing", description: "Adversaries send phishing messages.", prevalenceRank: 1,
        subTechniques: [{ id: "T1566.001", name: "Spearphishing Attachment" }, { id: "T1566.002", name: "Spearphishing Link" }, { id: "T1566.003", name: "Spearphishing via Service" }] },
      { id: "T1091", name: "Replication Through Removable Media", description: "Adversaries move through removable media.", prevalenceRank: 18 },
      { id: "T1195", name: "Supply Chain Compromise", description: "Adversaries manipulate products before delivery.", prevalenceRank: 10 },
      { id: "T1199", name: "Trusted Relationship", description: "Adversaries breach via trusted third parties.", prevalenceRank: 11 },
      { id: "T1078", name: "Valid Accounts", description: "Adversaries use valid credentials.", prevalenceRank: 2,
        subTechniques: [{ id: "T1078.001", name: "Default Accounts" }, { id: "T1078.002", name: "Domain Accounts" }, { id: "T1078.003", name: "Local Accounts" }, { id: "T1078.004", name: "Cloud Accounts" }] },
    ]
  },
  {
    id: "TA0002", name: "Execution", shortName: "Execution",
    techniques: [
      { id: "T1059", name: "Command and Scripting Interpreter", description: "Adversaries abuse command interpreters.", prevalenceRank: 1,
        subTechniques: [{ id: "T1059.001", name: "PowerShell" }, { id: "T1059.003", name: "Windows Command Shell" }, { id: "T1059.006", name: "Python" }, { id: "T1059.007", name: "JavaScript" }] },
      { id: "T1609", name: "Container Administration Command", description: "Adversaries abuse container admin.", prevalenceRank: 18 },
      { id: "T1610", name: "Deploy Container", description: "Adversaries deploy rogue containers.", prevalenceRank: 19 },
      { id: "T1203", name: "Exploitation for Client Execution", description: "Adversaries exploit software for execution.", prevalenceRank: 8 },
      { id: "T1559", name: "Inter-Process Communication", description: "Adversaries abuse IPC.", prevalenceRank: 15 },
      { id: "T1106", name: "Native API", description: "Adversaries interact with native OS APIs.", prevalenceRank: 4 },
      { id: "T1053", name: "Scheduled Task/Job", description: "Adversaries abuse task scheduling.", prevalenceRank: 5,
        subTechniques: [{ id: "T1053.003", name: "Cron" }, { id: "T1053.005", name: "Scheduled Task" }, { id: "T1053.006", name: "Systemd Timers" }] },
      { id: "T1129", name: "Shared Modules", description: "Adversaries load shared modules.", prevalenceRank: 17 },
      { id: "T1072", name: "Software Deployment Tools", description: "Adversaries use software deployment tools.", prevalenceRank: 12 },
      { id: "T1569", name: "System Services", description: "Adversaries abuse system services.", prevalenceRank: 9 },
      { id: "T1204", name: "User Execution", description: "Adversaries trick users into executing malicious code.", prevalenceRank: 3,
        subTechniques: [{ id: "T1204.001", name: "Malicious Link" }, { id: "T1204.002", name: "Malicious File" }] },
      { id: "T1047", name: "Windows Management Instrumentation", description: "Adversaries abuse WMI.", prevalenceRank: 6 },
    ]
  },
  {
    id: "TA0003", name: "Persistence", shortName: "Persistence",
    techniques: [
      { id: "T1098", name: "Account Manipulation", description: "Adversaries manipulate accounts to maintain persistence.", prevalenceRank: 7 },
      { id: "T1197", name: "BITS Jobs", description: "Adversaries abuse BITS.", prevalenceRank: 17 },
      { id: "T1547", name: "Boot or Logon Autostart Execution", description: "Adversaries configure autostart mechanisms.", prevalenceRank: 4 },
      { id: "T1037", name: "Boot or Logon Initialization Scripts", description: "Adversaries use initialization scripts.", prevalenceRank: 12 },
      { id: "T1176", name: "Browser Extensions", description: "Adversaries install malicious browser extensions.", prevalenceRank: 16 },
      { id: "T1554", name: "Compromise Host Software Binary", description: "Adversaries modify host software binaries.", prevalenceRank: 18 },
      { id: "T1136", name: "Create Account", description: "Adversaries create accounts.", prevalenceRank: 6,
        subTechniques: [{ id: "T1136.001", name: "Local Account" }, { id: "T1136.002", name: "Domain Account" }, { id: "T1136.003", name: "Cloud Account" }] },
      { id: "T1543", name: "Create or Modify System Process", description: "Adversaries create or modify system-level processes.", prevalenceRank: 8 },
      { id: "T1546", name: "Event Triggered Execution", description: "Adversaries trigger execution via system events.", prevalenceRank: 10 },
      { id: "T1133", name: "External Remote Services", description: "Adversaries use external remote services for persistence.", prevalenceRank: 5 },
      { id: "T1574", name: "Hijack Execution Flow", description: "Adversaries hijack execution flow.", prevalenceRank: 9 },
      { id: "T1525", name: "Implant Internal Image", description: "Adversaries implant malicious images.", prevalenceRank: 20 },
      { id: "T1556", name: "Modify Authentication Process", description: "Adversaries modify authentication.", prevalenceRank: 11 },
      { id: "T1137", name: "Office Application Startup", description: "Adversaries abuse Office application startup.", prevalenceRank: 14 },
      { id: "T1542", name: "Pre-OS Boot", description: "Adversaries modify pre-OS boot mechanisms.", prevalenceRank: 19 },
      { id: "T1053", name: "Scheduled Task/Job (Persistence)", description: "Adversaries abuse task scheduling for persistence.", prevalenceRank: 3 },
      { id: "T1505", name: "Server Software Component", description: "Adversaries abuse server software components.", prevalenceRank: 13 },
      { id: "T1078", name: "Valid Accounts (Persistence)", description: "Adversaries use valid accounts for persistence.", prevalenceRank: 2 },
    ]
  },
  {
    id: "TA0004", name: "Privilege Escalation", shortName: "Priv Esc",
    techniques: [
      { id: "T1548", name: "Abuse Elevation Control Mechanism", description: "Adversaries abuse elevation controls.", prevalenceRank: 5 },
      { id: "T1134", name: "Access Token Manipulation", description: "Adversaries manipulate access tokens.", prevalenceRank: 7 },
      { id: "T1098", name: "Account Manipulation (PrivEsc)", description: "Adversaries manipulate accounts for escalation.", prevalenceRank: 8 },
      { id: "T1547", name: "Boot or Logon Autostart Execution (PrivEsc)", description: "Adversaries use autostart for privilege.", prevalenceRank: 12 },
      { id: "T1543", name: "Create or Modify System Process (PrivEsc)", description: "Adversaries create system processes.", prevalenceRank: 9 },
      { id: "T1484", name: "Domain or Tenant Policy Modification", description: "Adversaries modify policy.", prevalenceRank: 13 },
      { id: "T1611", name: "Escape to Host", description: "Adversaries escape container to host.", prevalenceRank: 18 },
      { id: "T1546", name: "Event Triggered Execution (PrivEsc)", description: "Adversaries use events for privilege.", prevalenceRank: 11 },
      { id: "T1068", name: "Exploitation for Privilege Escalation", description: "Adversaries exploit vulnerabilities for privilege.", prevalenceRank: 3 },
      { id: "T1574", name: "Hijack Execution Flow (PrivEsc)", description: "Adversaries hijack execution flow.", prevalenceRank: 10 },
      { id: "T1055", name: "Process Injection", description: "Adversaries inject code into running processes.", prevalenceRank: 2 },
      { id: "T1053", name: "Scheduled Task/Job (PrivEsc)", description: "Adversaries use scheduled tasks for privilege.", prevalenceRank: 6 },
      { id: "T1078", name: "Valid Accounts (PrivEsc)", description: "Adversaries use valid accounts for escalation.", prevalenceRank: 1 },
    ]
  },
  {
    id: "TA0005", name: "Defense Evasion", shortName: "Def Evasion",
    techniques: [
      { id: "T1548", name: "Abuse Elevation Control Mechanism", description: "Adversaries abuse elevation controls to evade defenses.", prevalenceRank: 6 },
      { id: "T1134", name: "Access Token Manipulation", description: "Adversaries manipulate tokens to impersonate users.", prevalenceRank: 8 },
      { id: "T1197", name: "BITS Jobs", description: "Adversaries use BITS to evade detections.", prevalenceRank: 17 },
      { id: "T1140", name: "Deobfuscate/Decode Files or Information", description: "Adversaries decode obfuscated data.", prevalenceRank: 4 },
      { id: "T1006", name: "Direct Volume Access", description: "Adversaries access volume directly.", prevalenceRank: 19 },
      { id: "T1484", name: "Domain or Tenant Policy Modification", description: "Adversaries modify domain policy.", prevalenceRank: 14 },
      { id: "T1480", name: "Execution Guardrails", description: "Adversaries use guardrails to limit discovery.", prevalenceRank: 18 },
      { id: "T1211", name: "Exploitation for Defense Evasion", description: "Adversaries exploit software to evade defenses.", prevalenceRank: 13 },
      { id: "T1222", name: "File and Directory Permissions Modification", description: "Adversaries modify permissions.", prevalenceRank: 11 },
      { id: "T1564", name: "Hide Artifacts", description: "Adversaries attempt to hide artifacts.", prevalenceRank: 5 },
      { id: "T1574", name: "Hijack Execution Flow", description: "Adversaries hijack execution to evade defenses.", prevalenceRank: 9 },
      { id: "T1562", name: "Impair Defenses", description: "Adversaries disable or tamper with security tools.", prevalenceRank: 2 },
      { id: "T1070", name: "Indicator Removal", description: "Adversaries delete evidence of activities.", prevalenceRank: 3 },
      { id: "T1202", name: "Indirect Command Execution", description: "Adversaries use indirect command methods.", prevalenceRank: 15 },
      { id: "T1036", name: "Masquerading", description: "Adversaries masquerade as legitimate processes.", prevalenceRank: 1 },
      { id: "T1027", name: "Obfuscated Files or Information", description: "Adversaries obfuscate files.", prevalenceRank: 4 },
      { id: "T1542", name: "Pre-OS Boot", description: "Adversaries modify pre-OS boot.", prevalenceRank: 20 },
      { id: "T1055", name: "Process Injection", description: "Adversaries inject processes.", prevalenceRank: 7 },
      { id: "T1207", name: "Rogue Domain Controller", description: "Adversaries register rogue domain controllers.", prevalenceRank: 16 },
      { id: "T1014", name: "Rootkit", description: "Adversaries use rootkits to hide.", prevalenceRank: 10 },
    ]
  },
  {
    id: "TA0006", name: "Credential Access", shortName: "Cred Access",
    techniques: [
      { id: "T1110", name: "Brute Force", description: "Adversaries try many passwords.", prevalenceRank: 2,
        subTechniques: [{ id: "T1110.001", name: "Password Guessing" }, { id: "T1110.002", name: "Password Cracking" }, { id: "T1110.003", name: "Password Spraying" }, { id: "T1110.004", name: "Credential Stuffing" }] },
      { id: "T1555", name: "Credentials from Password Stores", description: "Adversaries extract credentials from stores.", prevalenceRank: 5 },
      { id: "T1212", name: "Exploitation for Credential Access", description: "Adversaries exploit software for credentials.", prevalenceRank: 8 },
      { id: "T1187", name: "Forced Authentication", description: "Adversaries force authentication from targets.", prevalenceRank: 10 },
      { id: "T1606", name: "Forge Web Credentials", description: "Adversaries forge web authentication tokens.", prevalenceRank: 11 },
      { id: "T1056", name: "Input Capture", description: "Adversaries use keyloggers.", prevalenceRank: 7 },
      { id: "T1557", name: "Adversary-in-the-Middle", description: "Adversaries intercept network traffic.", prevalenceRank: 9 },
      { id: "T1556", name: "Modify Authentication Process", description: "Adversaries modify authentication processes.", prevalenceRank: 13 },
      { id: "T1040", name: "Network Sniffing", description: "Adversaries sniff network traffic.", prevalenceRank: 12 },
      { id: "T1003", name: "OS Credential Dumping", description: "Adversaries dump credentials from OS.", prevalenceRank: 1 },
      { id: "T1528", name: "Steal Application Access Token", description: "Adversaries steal app tokens.", prevalenceRank: 14 },
      { id: "T1558", name: "Steal or Forge Kerberos Tickets", description: "Adversaries steal Kerberos tickets.", prevalenceRank: 6 },
      { id: "T1539", name: "Steal Web Session Cookie", description: "Adversaries steal session cookies.", prevalenceRank: 15 },
    ]
  },
  {
    id: "TA0007", name: "Discovery", shortName: "Discovery",
    techniques: [
      { id: "T1087", name: "Account Discovery", description: "Adversaries enumerate accounts.", prevalenceRank: 4 },
      { id: "T1010", name: "Application Window Discovery", description: "Adversaries discover application windows.", prevalenceRank: 17 },
      { id: "T1217", name: "Browser Information Discovery", description: "Adversaries collect browser info.", prevalenceRank: 15 },
      { id: "T1580", name: "Cloud Infrastructure Discovery", description: "Adversaries enumerate cloud infrastructure.", prevalenceRank: 10 },
      { id: "T1538", name: "Cloud Service Dashboard", description: "Adversaries access cloud dashboards.", prevalenceRank: 14 },
      { id: "T1526", name: "Cloud Service Discovery", description: "Adversaries enumerate cloud services.", prevalenceRank: 12 },
      { id: "T1619", name: "Cloud Storage Object Discovery", description: "Adversaries enumerate cloud storage.", prevalenceRank: 16 },
      { id: "T1613", name: "Container and Resource Discovery", description: "Adversaries discover containers.", prevalenceRank: 18 },
      { id: "T1522", name: "Cloud Instance Metadata API", description: "Adversaries query metadata APIs.", prevalenceRank: 13 },
      { id: "T1482", name: "Domain Trust Discovery", description: "Adversaries enumerate domain trusts.", prevalenceRank: 8 },
      { id: "T1083", name: "File and Directory Discovery", description: "Adversaries enumerate files.", prevalenceRank: 3 },
      { id: "T1046", name: "Network Service Discovery", description: "Adversaries scan for open services.", prevalenceRank: 2 },
      { id: "T1135", name: "Network Share Discovery", description: "Adversaries enumerate network shares.", prevalenceRank: 9 },
      { id: "T1201", name: "Password Policy Discovery", description: "Adversaries discover password policies.", prevalenceRank: 11 },
      { id: "T1120", name: "Peripheral Device Discovery", description: "Adversaries discover peripheral devices.", prevalenceRank: 19 },
      { id: "T1069", name: "Permission Groups Discovery", description: "Adversaries discover group memberships.", prevalenceRank: 6 },
      { id: "T1057", name: "Process Discovery", description: "Adversaries enumerate running processes.", prevalenceRank: 5 },
      { id: "T1012", name: "Query Registry", description: "Adversaries query the Windows registry.", prevalenceRank: 7 },
      { id: "T1018", name: "Remote System Discovery", description: "Adversaries discover remote systems.", prevalenceRank: 1 },
      { id: "T1518", name: "Software Discovery", description: "Adversaries enumerate installed software.", prevalenceRank: 10 },
    ]
  },
  {
    id: "TA0008", name: "Lateral Movement", shortName: "Lateral Mvmt",
    techniques: [
      { id: "T1210", name: "Exploitation of Remote Services", description: "Adversaries exploit remote services.", prevalenceRank: 3 },
      { id: "T1534", name: "Internal Spearphishing", description: "Adversaries phish within an organization.", prevalenceRank: 8 },
      { id: "T1570", name: "Lateral Tool Transfer", description: "Adversaries transfer tools to other systems.", prevalenceRank: 5 },
      { id: "T1563", name: "Remote Service Session Hijacking", description: "Adversaries hijack legitimate sessions.", prevalenceRank: 7 },
      { id: "T1021", name: "Remote Services", description: "Adversaries use remote services for lateral movement.", prevalenceRank: 1,
        subTechniques: [{ id: "T1021.001", name: "Remote Desktop Protocol" }, { id: "T1021.002", name: "SMB/Windows Admin Shares" }, { id: "T1021.004", name: "SSH" }] },
      { id: "T1091", name: "Replication Through Removable Media", description: "Adversaries replicate via removable media.", prevalenceRank: 10 },
      { id: "T1072", name: "Software Deployment Tools", description: "Adversaries use deployment tools for lateral movement.", prevalenceRank: 9 },
      { id: "T1080", name: "Taint Shared Content", description: "Adversaries taint shared content.", prevalenceRank: 11 },
      { id: "T1550", name: "Use Alternate Authentication Material", description: "Adversaries use alternative authentication.", prevalenceRank: 4 },
    ]
  },
  {
    id: "TA0009", name: "Collection", shortName: "Collection",
    techniques: [
      { id: "T1119", name: "Automated Collection", description: "Adversaries automate data collection.", prevalenceRank: 5 },
      { id: "T1115", name: "Clipboard Data", description: "Adversaries collect clipboard data.", prevalenceRank: 9 },
      { id: "T1530", name: "Data from Cloud Storage", description: "Adversaries exfiltrate cloud storage data.", prevalenceRank: 7 },
      { id: "T1602", name: "Data from Configuration Repository", description: "Adversaries collect from config repos.", prevalenceRank: 11 },
      { id: "T1213", name: "Data from Information Repositories", description: "Adversaries mine internal repositories.", prevalenceRank: 6 },
      { id: "T1005", name: "Data from Local System", description: "Adversaries collect data from local systems.", prevalenceRank: 3 },
      { id: "T1039", name: "Data from Network Shared Drive", description: "Adversaries collect from network shares.", prevalenceRank: 8 },
      { id: "T1025", name: "Data from Removable Media", description: "Adversaries collect from removable media.", prevalenceRank: 12 },
      { id: "T1074", name: "Data Staged", description: "Adversaries stage data for exfiltration.", prevalenceRank: 4 },
      { id: "T1114", name: "Email Collection", description: "Adversaries collect emails.", prevalenceRank: 10 },
      { id: "T1056", name: "Input Capture (Collection)", description: "Adversaries capture keystrokes.", prevalenceRank: 13 },
      { id: "T1185", name: "Browser Session Hijacking", description: "Adversaries hijack browser sessions.", prevalenceRank: 14 },
      { id: "T1557", name: "Adversary-in-the-Middle (Collection)", description: "Adversaries intercept traffic.", prevalenceRank: 15 },
      { id: "T1113", name: "Screen Capture", description: "Adversaries take screenshots.", prevalenceRank: 2 },
      { id: "T1125", name: "Video Capture", description: "Adversaries capture video from webcams.", prevalenceRank: 16 },
    ]
  },
  {
    id: "TA0011", name: "Command and Control", shortName: "C2",
    techniques: [
      { id: "T1071", name: "Application Layer Protocol", description: "Adversaries use application layer protocols for C2.", prevalenceRank: 1,
        subTechniques: [{ id: "T1071.001", name: "Web Protocols" }, { id: "T1071.004", name: "DNS" }] },
      { id: "T1092", name: "Communication Through Removable Media", description: "Adversaries use removable media for C2.", prevalenceRank: 17 },
      { id: "T1132", name: "Data Encoding", description: "Adversaries encode data for C2.", prevalenceRank: 8 },
      { id: "T1001", name: "Data Obfuscation", description: "Adversaries obfuscate C2 communications.", prevalenceRank: 9 },
      { id: "T1568", name: "Dynamic Resolution", description: "Adversaries dynamically resolve C2 domains.", prevalenceRank: 6 },
      { id: "T1573", name: "Encrypted Channel", description: "Adversaries use encrypted C2 channels.", prevalenceRank: 2 },
      { id: "T1008", name: "Fallback Channels", description: "Adversaries use backup C2 channels.", prevalenceRank: 12 },
      { id: "T1105", name: "Ingress Tool Transfer", description: "Adversaries transfer tools to the victim.", prevalenceRank: 4 },
      { id: "T1104", name: "Multi-Stage Channels", description: "Adversaries use multi-stage C2.", prevalenceRank: 11 },
      { id: "T1095", name: "Non-Application Layer Protocol", description: "Adversaries use non-standard protocols.", prevalenceRank: 7 },
      { id: "T1571", name: "Non-Standard Port", description: "Adversaries use non-standard ports.", prevalenceRank: 5 },
      { id: "T1572", name: "Protocol Tunneling", description: "Adversaries tunnel protocols.", prevalenceRank: 10 },
      { id: "T1090", name: "Proxy", description: "Adversaries use proxies for C2.", prevalenceRank: 3 },
      { id: "T1219", name: "Remote Access Software", description: "Adversaries use remote access tools.", prevalenceRank: 13 },
      { id: "T1205", name: "Traffic Signaling", description: "Adversaries use traffic signaling.", prevalenceRank: 15 },
      { id: "T1102", name: "Web Service", description: "Adversaries use web services for C2.", prevalenceRank: 14 },
    ]
  },
  {
    id: "TA0010", name: "Exfiltration", shortName: "Exfiltration",
    techniques: [
      { id: "T1020", name: "Automated Exfiltration", description: "Adversaries automate exfiltration.", prevalenceRank: 6 },
      { id: "T1030", name: "Data Transfer Size Limits", description: "Adversaries exfiltrate in small chunks.", prevalenceRank: 9 },
      { id: "T1048", name: "Exfiltration Over Alternative Protocol", description: "Adversaries use alternative protocols.", prevalenceRank: 5,
        subTechniques: [{ id: "T1048.003", name: "Exfiltration Over Unencrypted Non-C2 Protocol" }] },
      { id: "T1041", name: "Exfiltration Over C2 Channel", description: "Adversaries exfiltrate over the C2 channel.", prevalenceRank: 2 },
      { id: "T1011", name: "Exfiltration Over Other Network Medium", description: "Adversaries exfiltrate over other networks.", prevalenceRank: 8 },
      { id: "T1052", name: "Exfiltration Over Physical Medium", description: "Adversaries physically exfiltrate data.", prevalenceRank: 10 },
      { id: "T1567", name: "Exfiltration Over Web Service", description: "Adversaries exfiltrate via web services.", prevalenceRank: 3 },
      { id: "T1029", name: "Scheduled Transfer", description: "Adversaries schedule exfiltration.", prevalenceRank: 7 },
      { id: "T1537", name: "Transfer Data to Cloud Account", description: "Adversaries transfer data to cloud accounts.", prevalenceRank: 4 },
    ]
  },
  {
    id: "TA0040", name: "Impact", shortName: "Impact",
    techniques: [
      { id: "T1531", name: "Account Access Removal", description: "Adversaries remove access to accounts.", prevalenceRank: 12 },
      { id: "T1485", name: "Data Destruction", description: "Adversaries destroy data.", prevalenceRank: 7 },
      { id: "T1486", name: "Data Encrypted for Impact", description: "Adversaries encrypt data for ransom.", prevalenceRank: 1 },
      { id: "T1565", name: "Data Manipulation", description: "Adversaries manipulate data.", prevalenceRank: 9 },
      { id: "T1491", name: "Defacement", description: "Adversaries deface websites.", prevalenceRank: 11 },
      { id: "T1561", name: "Disk Wipe", description: "Adversaries wipe disks.", prevalenceRank: 8 },
      { id: "T1499", name: "Endpoint Denial of Service", description: "Adversaries perform DoS on endpoints.", prevalenceRank: 5 },
      { id: "T1495", name: "Firmware Corruption", description: "Adversaries corrupt firmware.", prevalenceRank: 14 },
      { id: "T1490", name: "Inhibit System Recovery", description: "Adversaries disable recovery mechanisms.", prevalenceRank: 3 },
      { id: "T1498", name: "Network Denial of Service", description: "Adversaries perform network DoS.", prevalenceRank: 6 },
      { id: "T1496", name: "Resource Hijacking", description: "Adversaries leverage victim resources.", prevalenceRank: 4 },
      { id: "T1489", name: "Service Stop", description: "Adversaries stop critical services.", prevalenceRank: 10 },
      { id: "T1529", name: "System Shutdown/Reboot", description: "Adversaries shut down systems.", prevalenceRank: 13 },
    ]
  },
];

export const ALL_TECHNIQUES = MITRE_TACTICS.flatMap(t => t.techniques);
export const TOTAL_TECHNIQUE_COUNT = ALL_TECHNIQUES.length;

export function getTacticColor(tacticName: string): string {
  const colors: Record<string, string> = {
    "Reconnaissance": "#6366f1",
    "Resource Development": "#8b5cf6",
    "Initial Access": "#ec4899",
    "Execution": "#f97316",
    "Persistence": "#eab308",
    "Privilege Escalation": "#84cc16",
    "Defense Evasion": "#06b6d4",
    "Credential Access": "#f43f5e",
    "Discovery": "#14b8a6",
    "Lateral Movement": "#f59e0b",
    "Collection": "#10b981",
    "Command and Control": "#3b82f6",
    "Exfiltration": "#a855f7",
    "Impact": "#ef4444",
  };
  return colors[tacticName] || "#64748b";
}

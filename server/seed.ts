import { db } from "./db";
import { tenants, incidents, tickets, projects, tasks, securityEvents } from "@shared/schema";

export async function seedDatabase() {
  const existingTenants = await db.select().from(tenants);
  if (existingTenants.length > 0) return;

  console.log("Seeding database with hierarchical tenant data...");

  const msspData = [
    { name: "Vinca Cyber", slug: "vinca-cyber", type: "mssp" as const, industry: "Cybersecurity", contactEmail: "ops@vincacyber.com" },
    { name: "Cibervest", slug: "cibervest", type: "mssp" as const, industry: "Financial Services", contactEmail: "security@cibervest.com" },
    { name: "HitaskIT", slug: "hitaskit", type: "mssp" as const, industry: "Technology", contactEmail: "soc@hitaskit.com" },
  ];

  const createdMSSPs = await db.insert(tenants).values(msspData).returning();
  const vincaId = createdMSSPs.find(t => t.slug === "vinca-cyber")!.id;
  const cibervestId = createdMSSPs.find(t => t.slug === "cibervest")!.id;
  const hitaskitId = createdMSSPs.find(t => t.slug === "hitaskit")!.id;

  const customerData = [
    { name: "Fedfina", slug: "fedfina", type: "customer" as const, parentId: vincaId, industry: "Financial Services", contactEmail: "it@fedfina.com" },
    { name: "P99 Software", slug: "p99-software", type: "customer" as const, parentId: vincaId, industry: "Software Development", contactEmail: "security@p99soft.com" },
    { name: "Nineleaves", slug: "nineleaves", type: "customer" as const, parentId: vincaId, industry: "Technology Consulting", contactEmail: "admin@nineleaves.com" },
    { name: "Maantic Global", slug: "maantic-global", type: "customer" as const, parentId: vincaId, industry: "IT Solutions", contactEmail: "security@maantic.com" },
    { name: "Claim Power", slug: "claim-power", type: "customer" as const, parentId: vincaId, industry: "Insurance Technology", contactEmail: "it@claimpower.com" },
    { name: "PKF Africa", slug: "pkf-africa", type: "customer" as const, parentId: cibervestId, industry: "Professional Services", contactEmail: "it@pkfafrica.com" },
    { name: "RTIX Surgical", slug: "rtix-surgical", type: "customer" as const, parentId: hitaskitId, industry: "Healthcare Technology", contactEmail: "it@rtixsurgical.com" },
  ];

  const createdCustomers = await db.insert(tenants).values(customerData).returning();

  const allTenants = [...createdMSSPs, ...createdCustomers];

  const incidentTemplates: Record<string, Array<{ title: string; description: string; severity: "critical" | "high" | "medium" | "low" | "info"; status: "open" | "investigating" | "contained" | "resolved" | "closed"; source: string; category: string; affectedAssets: string }>> = {
    "fedfina": [
      { title: "Unauthorized wire transfer attempt detected", description: "Suspicious wire transfer request from compromised email account targeting external bank", severity: "critical", status: "investigating", source: "SIEM", category: "fraud", affectedAssets: "Core Banking System" },
      { title: "SQL injection attempt on loan portal", description: "Automated SQL injection attacks detected on public-facing loan application portal", severity: "high", status: "contained", source: "WAF", category: "intrusion", affectedAssets: "Loan Portal WEB-01" },
      { title: "Phishing emails targeting treasury department", description: "Targeted spear phishing campaign impersonating CFO with urgent payment requests", severity: "high", status: "open", source: "Email Gateway", category: "phishing", affectedAssets: "Exchange Server" },
      { title: "Anomalous database queries on customer PII", description: "Unusual SELECT queries on customer personal data outside business hours", severity: "medium", status: "investigating", source: "Database Activity Monitor", category: "data_breach", affectedAssets: "DB-CUST-01" },
      { title: "Expired SSL on mobile banking API", description: "SSL certificate for mobile banking API endpoint expired", severity: "medium", status: "open", source: "Certificate Monitor", category: "vulnerability", affectedAssets: "api.fedfina.com" },
      { title: "Brute force on employee VPN", description: "Over 500 failed VPN login attempts from multiple IP addresses", severity: "medium", status: "resolved", source: "VPN Gateway", category: "intrusion", affectedAssets: "VPN Gateway" },
      { title: "Outdated Java runtime on payment servers", description: "Critical CVE affecting Java 8 runtime on 3 payment processing servers", severity: "high", status: "open", source: "Vulnerability Scanner", category: "vulnerability", affectedAssets: "PAY-01, PAY-02, PAY-03" },
      { title: "Suspicious PowerShell execution on workstation", description: "Encoded PowerShell command detected on finance workstation", severity: "high", status: "contained", source: "EDR", category: "malware", affectedAssets: "WS-FIN-015" },
    ],
    "p99-software": [
      { title: "Source code repository access from unknown IP", description: "GitHub Enterprise accessed from unrecognized IP address in suspicious geography", severity: "critical", status: "investigating", source: "CASB", category: "data_breach", affectedAssets: "GitHub Enterprise" },
      { title: "Container escape vulnerability in CI/CD", description: "CVE-2025-1234 allows container escape in production Kubernetes cluster", severity: "critical", status: "open", source: "Container Scanner", category: "vulnerability", affectedAssets: "K8s Cluster PROD" },
      { title: "Malicious npm package in dependency tree", description: "Supply chain attack via compromised npm package in build pipeline", severity: "high", status: "contained", source: "SCA Tool", category: "malware", affectedAssets: "Build Pipeline" },
      { title: "API key exposed in public commit", description: "AWS API keys accidentally committed to public repository branch", severity: "high", status: "resolved", source: "Secret Scanner", category: "data_breach", affectedAssets: "AWS Account" },
      { title: "DDoS on client demo environment", description: "Volumetric DDoS attack targeting client demo infrastructure", severity: "medium", status: "resolved", source: "WAF", category: "ddos", affectedAssets: "Demo Servers" },
      { title: "Jenkins server running outdated plugins", description: "12 Jenkins plugins with known CVEs need immediate update", severity: "medium", status: "open", source: "Vulnerability Scanner", category: "vulnerability", affectedAssets: "Jenkins CI" },
      { title: "Unauthorized SSH access to staging", description: "SSH login from departing employee's credentials after termination", severity: "high", status: "closed", source: "SIEM", category: "intrusion", affectedAssets: "Staging Servers" },
    ],
    "nineleaves": [
      { title: "Ransomware precursor activity detected", description: "Cobalt Strike beacon communication detected from endpoint in consulting team", severity: "critical", status: "investigating", source: "EDR", category: "malware", affectedAssets: "WS-CONS-008" },
      { title: "Client data exfiltration attempt", description: "Large data transfer to personal cloud storage detected via DLP", severity: "high", status: "contained", source: "DLP", category: "data_breach", affectedAssets: "File Server FS-02" },
      { title: "Weak passwords on domain admin accounts", description: "Password audit reveals 3 domain admin accounts with weak passwords", severity: "high", status: "open", source: "Identity Audit", category: "vulnerability", affectedAssets: "Active Directory" },
      { title: "Phishing site cloning company portal", description: "Lookalike domain registered hosting clone of employee login portal", severity: "medium", status: "investigating", source: "Threat Intel", category: "phishing", affectedAssets: "portal.nineleaves.com" },
      { title: "Unpatched Exchange server CVE", description: "Microsoft Exchange CVE-2025-0001 affecting on-premise mail server", severity: "critical", status: "open", source: "Vulnerability Scanner", category: "vulnerability", affectedAssets: "EXCH-01" },
      { title: "Suspicious VPN connection from offshore", description: "VPN login from unexpected geographic location for senior consultant", severity: "medium", status: "resolved", source: "VPN Gateway", category: "intrusion", affectedAssets: "VPN Gateway" },
    ],
    "maantic-global": [
      { title: "Zero-day exploit attempt on web application", description: "Automated exploitation attempts targeting custom web application framework", severity: "critical", status: "investigating", source: "WAF", category: "intrusion", affectedAssets: "Web App WA-01" },
      { title: "Insider threat - excessive data downloads", description: "Employee downloading large volumes of proprietary project documentation", severity: "high", status: "investigating", source: "DLP", category: "data_breach", affectedAssets: "SharePoint" },
      { title: "Compromised service account credentials", description: "Service account used for API integration found on dark web credential dump", severity: "high", status: "contained", source: "Dark Web Monitor", category: "intrusion", affectedAssets: "API Gateway" },
      { title: "Outdated antivirus definitions on 20 endpoints", description: "AV definitions more than 7 days old on remote worker endpoints", severity: "medium", status: "open", source: "AV Console", category: "vulnerability", affectedAssets: "Remote Endpoints" },
      { title: "DNS tunneling attempt detected", description: "Suspicious DNS query patterns indicating potential data exfiltration", severity: "high", status: "contained", source: "DNS Firewall", category: "data_breach", affectedAssets: "DNS Infrastructure" },
      { title: "Failed MFA bypass attempts", description: "Multiple attempts to bypass MFA on admin portal detected", severity: "medium", status: "resolved", source: "Identity Provider", category: "intrusion", affectedAssets: "Admin Portal" },
    ],
    "claim-power": [
      { title: "PII data exposure in API response", description: "Customer PII including SSN exposed in unprotected API endpoint", severity: "critical", status: "investigating", source: "API Scanner", category: "data_breach", affectedAssets: "Claims API" },
      { title: "Fraudulent insurance claim submission bot", description: "Automated bot submitting fraudulent claims through web portal", severity: "high", status: "contained", source: "WAF", category: "fraud", affectedAssets: "Claims Portal" },
      { title: "Ransomware email with encrypted attachment", description: "Email with password-protected ZIP containing ransomware bypassed gateway", severity: "high", status: "open", source: "Email Gateway", category: "malware", affectedAssets: "Email System" },
      { title: "Unsecured S3 bucket with claim documents", description: "Public S3 bucket containing sensitive claim documents discovered", severity: "critical", status: "resolved", source: "Cloud Security", category: "data_breach", affectedAssets: "AWS S3" },
      { title: "OWASP Top 10 vulnerabilities on portal", description: "Penetration test reveals XSS and CSRF vulnerabilities on claims portal", severity: "medium", status: "open", source: "Pen Test Report", category: "vulnerability", affectedAssets: "Claims Portal" },
      { title: "Lateral movement detected in network", description: "Pass-the-hash activity detected between workstations", severity: "high", status: "investigating", source: "EDR", category: "intrusion", affectedAssets: "Internal Network" },
    ],
    "pkf-africa": [
      { title: "Business email compromise targeting CFO", description: "Sophisticated BEC attack impersonating managing partner for wire transfer", severity: "critical", status: "investigating", source: "Email Gateway", category: "phishing", affectedAssets: "Executive Accounts" },
      { title: "Tax season phishing campaign", description: "Mass phishing targeting staff with fake tax document links", severity: "high", status: "contained", source: "Email Gateway", category: "phishing", affectedAssets: "Email System" },
      { title: "Audit data exposed on shared drive", description: "Sensitive client audit data accessible without proper ACLs", severity: "high", status: "open", source: "DLP", category: "data_breach", affectedAssets: "File Server" },
      { title: "Malware on partner laptop", description: "Trojan detected on visiting partner's laptop connected to network", severity: "medium", status: "contained", source: "NAC", category: "malware", affectedAssets: "Guest Network" },
      { title: "Weak encryption on client communications", description: "TLS 1.0 still enabled on client-facing file exchange portal", severity: "medium", status: "open", source: "Security Audit", category: "vulnerability", affectedAssets: "File Exchange Portal" },
      { title: "Unauthorized access to payroll system", description: "Failed attempts to access payroll from unauthorized workstation", severity: "medium", status: "resolved", source: "Application Logs", category: "intrusion", affectedAssets: "Payroll System" },
      { title: "Cloud misconfiguration in Azure AD", description: "Overly permissive roles assigned in Azure AD tenant", severity: "high", status: "investigating", source: "Cloud Security", category: "vulnerability", affectedAssets: "Azure AD" },
    ],
    "rtix-surgical": [
      { title: "Medical device network anomaly", description: "Unusual network traffic from surgical equipment controller to external IP", severity: "critical", status: "investigating", source: "Network Monitor", category: "intrusion", affectedAssets: "Surgical Device Network" },
      { title: "HIPAA violation - unencrypted patient data", description: "Patient records transmitted unencrypted between facilities", severity: "critical", status: "open", source: "DLP", category: "data_breach", affectedAssets: "EMR System" },
      { title: "Phishing targeting surgical staff", description: "Spear phishing with malicious links disguised as surgical supply orders", severity: "high", status: "contained", source: "Email Gateway", category: "phishing", affectedAssets: "Email System" },
      { title: "Outdated firmware on IoT medical devices", description: "15 connected medical devices running firmware with known vulnerabilities", severity: "high", status: "open", source: "IoT Scanner", category: "vulnerability", affectedAssets: "Medical IoT Devices" },
      { title: "Unauthorized Wi-Fi access point detected", description: "Rogue access point found in surgical wing broadcasting open SSID", severity: "medium", status: "resolved", source: "WIDS", category: "intrusion", affectedAssets: "Wireless Network" },
      { title: "Backup integrity failure for patient records", description: "Weekly backup verification failed for patient database", severity: "medium", status: "investigating", source: "Backup Monitor", category: "other", affectedAssets: "Backup Server" },
    ],
  };

  const msspIncidents: Record<string, Array<{ title: string; description: string; severity: "critical" | "high" | "medium" | "low" | "info"; status: "open" | "investigating" | "contained" | "resolved" | "closed"; source: string; category: string; affectedAssets: string }>> = {
    "vinca-cyber": [
      { title: "SOC infrastructure DDoS attack", description: "Distributed denial of service targeting SOC monitoring infrastructure", severity: "critical", status: "resolved", source: "WAF", category: "ddos", affectedAssets: "SOC Infrastructure" },
      { title: "SIEM log ingestion pipeline failure", description: "Log forwarding agents failing on 12 client tenants", severity: "high", status: "investigating", source: "SIEM", category: "other", affectedAssets: "SIEM Pipeline" },
      { title: "Threat intel feed compromise suspected", description: "Anomalous indicators in third-party threat intelligence feed", severity: "medium", status: "investigating", source: "Threat Intel", category: "other", affectedAssets: "TI Platform" },
    ],
    "cibervest": [
      { title: "Client credential store unauthorized access", description: "Suspicious access to encrypted credential vault from unknown session", severity: "critical", status: "investigating", source: "Vault Audit", category: "intrusion", affectedAssets: "Credential Vault" },
      { title: "MFA bypass on analyst portal", description: "Authentication bypass vulnerability found in analyst SSO portal", severity: "high", status: "contained", source: "Pen Test", category: "vulnerability", affectedAssets: "SSO Portal" },
    ],
    "hitaskit": [
      { title: "Internal phishing simulation flagged", description: "Phishing test results show 30% click rate among staff", severity: "medium", status: "resolved", source: "Phishing Sim", category: "phishing", affectedAssets: "Staff Email" },
      { title: "Monitoring agent disconnected on 5 endpoints", description: "EDR agents not reporting from client monitoring targets", severity: "high", status: "open", source: "EDR Console", category: "other", affectedAssets: "Client Endpoints" },
    ],
  };

  for (const tenant of allTenants) {
    const templateKey = tenant.slug;
    const incidentList = incidentTemplates[templateKey] || msspIncidents[templateKey] || [];

    if (incidentList.length > 0) {
      const incidentData = incidentList.map(inc => ({
        tenantId: tenant.id,
        ...inc,
      }));
      await db.insert(incidents).values(incidentData);
    }

    const ticketData = [
      { tenantId: tenant.id, title: "Request for security policy review", description: "Annual security policy review and update needed", priority: "medium" as const, status: "open" as const, category: "general" },
      { tenantId: tenant.id, title: "New employee access provisioning", description: "Access setup for 5 new employees starting next week", priority: "high" as const, status: "in_progress" as const, category: "access" },
      { tenantId: tenant.id, title: "Firewall rule change request", description: "Need to update firewall rules for new application deployment", priority: "medium" as const, status: "waiting" as const, category: "configuration" },
      { tenantId: tenant.id, title: "Security awareness training report", description: "Monthly security training completion report needed", priority: "low" as const, status: "resolved" as const, category: "general" },
    ];

    await db.insert(tickets).values(ticketData);

    const projectData = [
      { tenantId: tenant.id, name: "Security Posture Assessment", description: "Comprehensive assessment of current security controls and gaps", status: "active" as const },
      { tenantId: tenant.id, name: "Compliance Remediation", description: "Address findings from recent compliance audit", status: "planning" as const },
    ];

    const createdProjects = await db.insert(projects).values(projectData).returning();

    if (createdProjects[0]) {
      const taskData = [
        { projectId: createdProjects[0].id, title: "Network vulnerability scan", description: "Run comprehensive network vulnerability scan", status: "done" as const, priority: "high" as const },
        { projectId: createdProjects[0].id, title: "Endpoint security audit", description: "Audit EDR deployment and configuration", status: "in_progress" as const, priority: "high" as const },
        { projectId: createdProjects[0].id, title: "Cloud security review", description: "Review cloud infrastructure security settings", status: "todo" as const, priority: "medium" as const },
        { projectId: createdProjects[0].id, title: "Penetration test report", description: "Compile results from penetration testing", status: "review" as const, priority: "urgent" as const },
        { projectId: createdProjects[0].id, title: "Security baseline documentation", description: "Document security baselines for all systems", status: "backlog" as const, priority: "low" as const },
      ];
      await db.insert(tasks).values(taskData);
    }

    if (createdProjects[1]) {
      const complianceTasks = [
        { projectId: createdProjects[1].id, title: "Policy gap analysis", description: "Identify gaps between current policies and compliance requirements", status: "todo" as const, priority: "high" as const },
        { projectId: createdProjects[1].id, title: "Access control review", description: "Review and update access control matrices", status: "backlog" as const, priority: "medium" as const },
        { projectId: createdProjects[1].id, title: "Incident response plan update", description: "Update IR plan based on audit findings", status: "backlog" as const, priority: "high" as const },
      ];
      await db.insert(tasks).values(complianceTasks);
    }
  }

  await seedSecurityEvents(allTenants);

  console.log("Database seeded with hierarchical tenant structure successfully!");
  console.log(`  MSSPs: ${createdMSSPs.map(t => t.name).join(", ")}`);
  console.log(`  Customers: ${createdCustomers.map(t => `${t.name} (under ${allTenants.find(p => p.id === t.parentId)?.name})`).join(", ")}`);
}

export async function seedSecurityEvents(allTenants?: Array<{ id: number; slug: string; name: string }>) {
  const existingEvents = await db.select().from(securityEvents);
  if (existingEvents.length > 0) return;

  if (!allTenants) {
    allTenants = await db.select().from(tenants);
  }

  console.log("Seeding security events data...");

  const randomDate = (daysBack: number) => {
    const d = new Date();
    d.setDate(d.getDate() - Math.floor(Math.random() * daysBack));
    d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
    return d;
  };

  const emailEvents = [
    { threat: "Emotet Trojan", target: "finance@{tenant}.com", attacker: "invoice-update@malicious-domain.ru", severity: "critical" as const, description: "Emotet dropper attached to fake invoice email" },
    { threat: "Credential Phishing", target: "ceo@{tenant}.com", attacker: "support@micros0ft-verify.com", severity: "high" as const, description: "Credential harvesting page impersonating Microsoft 365 login" },
    { threat: "BEC Wire Fraud", target: "accounts@{tenant}.com", attacker: "cfo-urgent@{tenant}-exec.com", severity: "critical" as const, description: "Business email compromise requesting urgent wire transfer" },
    { threat: "Spear Phishing", target: "hr@{tenant}.com", attacker: "resume-apply@jobsite-fake.com", severity: "high" as const, description: "Targeted phishing with malicious resume attachment" },
    { threat: "Malware Delivery", target: "admin@{tenant}.com", attacker: "noreply@delivery-notice.xyz", severity: "high" as const, description: "Malware dropper disguised as delivery notification" },
    { threat: "Spam Campaign", target: "info@{tenant}.com", attacker: "deals@promo-blast.net", severity: "low" as const, description: "Mass spam campaign with suspicious links" },
    { threat: "Credential Phishing", target: "ops@{tenant}.com", attacker: "it-helpdesk@{tenant}-portal.net", severity: "high" as const, description: "Internal IT helpdesk impersonation for credential theft" },
    { threat: "Ransomware Dropper", target: "legal@{tenant}.com", attacker: "court-notice@legal-filing.xyz", severity: "critical" as const, description: "Ransomware payload in fake legal notice" },
    { threat: "Data Exfil Link", target: "sales@{tenant}.com", attacker: "proposal@partner-collab.com", severity: "medium" as const, description: "Phishing link leading to data exfiltration page" },
    { threat: "Whaling Attack", target: "cfo@{tenant}.com", attacker: "board@{tenant}-directors.com", severity: "critical" as const, description: "Whaling attack targeting CFO with fake board directive" },
    { threat: "QR Phishing", target: "reception@{tenant}.com", attacker: "scan-verify@qr-secure.net", severity: "medium" as const, description: "QR code phishing redirecting to credential harvester" },
    { threat: "Invoice Fraud", target: "procurement@{tenant}.com", attacker: "billing@vendor-update.biz", severity: "high" as const, description: "Fraudulent invoice from impersonated vendor" },
    { threat: "Spear Phishing", target: "developer@{tenant}.com", attacker: "security-alert@github-notify.io", severity: "high" as const, description: "GitHub impersonation targeting developer credentials" },
    { threat: "Malware Delivery", target: "support@{tenant}.com", attacker: "ticket@helpdesk-urgent.com", severity: "medium" as const, description: "Trojan in fake helpdesk ticket attachment" },
    { threat: "Credential Phishing", target: "manager@{tenant}.com", attacker: "zoom-invite@meeting-now.xyz", severity: "medium" as const, description: "Fake Zoom meeting invite harvesting credentials" },
  ];

  const endpointEvents = [
    { threat: "Ryuk Ransomware", target: "SRV-DC-01", attacker: "185.220.101.34", asset: "Domain Controller", severity: "critical" as const, description: "Ryuk ransomware encryption activity on domain controller" },
    { threat: "Cobalt Strike Beacon", target: "WS-FIN-015", attacker: "45.77.123.89", asset: "Finance Workstation", severity: "critical" as const, description: "Cobalt Strike beacon communication detected" },
    { threat: "TrickBot", target: "WS-HR-003", attacker: "91.215.85.201", asset: "HR Workstation", severity: "high" as const, description: "TrickBot banking trojan infecting HR endpoint" },
    { threat: "Mimikatz", target: "SRV-APP-02", attacker: "Internal Lateral", asset: "Application Server", severity: "critical" as const, description: "Mimikatz credential dumping detected on app server" },
    { threat: "WannaCry Variant", target: "WS-OPS-009", attacker: "Unknown", asset: "Operations Workstation", severity: "critical" as const, description: "WannaCry variant spreading via SMB" },
    { threat: "Emotet Payload", target: "WS-SALES-007", attacker: "193.56.28.103", asset: "Sales Workstation", severity: "high" as const, description: "Emotet payload executed from email attachment" },
    { threat: "PowerShell Empire", target: "SRV-WEB-01", attacker: "172.16.45.22", asset: "Web Server", severity: "high" as const, description: "PowerShell Empire agent executing recon commands" },
    { threat: "Cryptominer", target: "SRV-BUILD-03", attacker: "Mining Pool", asset: "Build Server", severity: "medium" as const, description: "XMRig cryptocurrency miner detected on build server" },
    { threat: "Backdoor Trojan", target: "WS-EXEC-001", attacker: "203.0.113.42", asset: "Executive Laptop", severity: "critical" as const, description: "Persistent backdoor installed on executive laptop" },
    { threat: "Fileless Malware", target: "SRV-DB-01", attacker: "In-Memory", asset: "Database Server", severity: "high" as const, description: "Fileless malware using WMI for persistence" },
    { threat: "Rootkit", target: "SRV-MAIL-01", attacker: "78.46.91.155", asset: "Mail Server", severity: "critical" as const, description: "Kernel-level rootkit hiding malicious processes" },
    { threat: "Adware", target: "WS-MKT-012", attacker: "Bundled Software", asset: "Marketing Workstation", severity: "low" as const, description: "Adware installed via software bundle" },
    { threat: "RAT (Remote Access)", target: "WS-DEV-004", attacker: "94.130.12.77", asset: "Developer Workstation", severity: "high" as const, description: "Remote access trojan providing persistent access" },
    { threat: "Ransomware Precursor", target: "SRV-FILE-02", attacker: "Internal Pivot", asset: "File Server", severity: "high" as const, description: "Pre-ransomware reconnaissance and lateral movement" },
    { threat: "Keylogger", target: "WS-ACCT-006", attacker: "Unknown", asset: "Accounting Workstation", severity: "high" as const, description: "Keylogger capturing credentials on accounting system" },
  ];

  const vulnerabilityEvents = [
    { threat: "CVE-2025-21298", target: "SRV-EXCH-01", severity: "critical" as const, app: "Microsoft Exchange", description: "Remote code execution vulnerability in Exchange Server" },
    { threat: "CVE-2025-0282", target: "VPN-GW-01", severity: "critical" as const, app: "Ivanti Connect Secure", description: "Authentication bypass in VPN gateway" },
    { threat: "CVE-2024-3400", target: "FW-PALO-01", severity: "critical" as const, app: "Palo Alto PAN-OS", description: "Command injection in firewall management interface" },
    { threat: "CVE-2025-1234", target: "SRV-WEB-02", severity: "high" as const, app: "Apache Tomcat", description: "Path traversal vulnerability in web server" },
    { threat: "CVE-2024-50623", target: "FTP-CLEO-01", severity: "critical" as const, app: "Cleo Harmony", description: "Unrestricted file upload vulnerability" },
    { threat: "CVE-2025-5678", target: "SRV-DB-PROD", severity: "high" as const, app: "PostgreSQL", description: "Privilege escalation in database server" },
    { threat: "CVE-2025-2468", target: "SRV-JIRA-01", severity: "medium" as const, app: "Atlassian Jira", description: "Stored XSS in project management tool" },
    { threat: "CVE-2024-11234", target: "LB-NGINX-01", severity: "high" as const, app: "NGINX Plus", description: "HTTP request smuggling in load balancer" },
    { threat: "CVE-2025-3344", target: "SRV-JENKINS-01", severity: "high" as const, app: "Jenkins", description: "Arbitrary code execution via pipeline script" },
    { threat: "CVE-2025-7890", target: "WS-CHROME-ALL", severity: "medium" as const, app: "Google Chrome", description: "Use-after-free vulnerability in browser engine" },
    { threat: "CVE-2025-4455", target: "SRV-DOCKER-01", severity: "high" as const, app: "Docker Engine", description: "Container escape vulnerability" },
    { threat: "CVE-2024-9876", target: "FW-FORTINET-01", severity: "critical" as const, app: "FortiGate", description: "Authentication bypass in firewall web interface" },
    { threat: "CVE-2025-1122", target: "SRV-AD-01", severity: "high" as const, app: "Active Directory", description: "Privilege escalation via certificate services" },
    { threat: "CVE-2025-6677", target: "SRV-SPLUNK-01", severity: "medium" as const, app: "Splunk Enterprise", description: "SSRF vulnerability in SIEM platform" },
    { threat: "CVE-2025-8899", target: "SRV-K8S-01", severity: "high" as const, app: "Kubernetes", description: "RBAC bypass allowing cluster admin access" },
  ];

  for (const tenant of allTenants) {
    if (tenant.slug.includes("vinca") || tenant.slug.includes("cibervest") || tenant.slug.includes("hitaskit")) {
      continue;
    }

    const slugClean = tenant.slug.replace(/-/g, "");

    const emailCount = 8 + Math.floor(Math.random() * 8);
    const emailBatch = [];
    for (let i = 0; i < emailCount; i++) {
      const tmpl = emailEvents[i % emailEvents.length];
      emailBatch.push({
        tenantId: tenant.id,
        eventType: "email" as const,
        severity: tmpl.severity,
        threat: tmpl.threat,
        target: tmpl.target.replace("{tenant}", slugClean),
        attacker: tmpl.attacker.replace("{tenant}", slugClean),
        description: tmpl.description,
        occurredAt: randomDate(90),
      });
    }

    const endpointCount = 8 + Math.floor(Math.random() * 8);
    const endpointBatch = [];
    for (let i = 0; i < endpointCount; i++) {
      const tmpl = endpointEvents[i % endpointEvents.length];
      endpointBatch.push({
        tenantId: tenant.id,
        eventType: "endpoint" as const,
        severity: tmpl.severity,
        threat: tmpl.threat,
        target: tmpl.target,
        attacker: tmpl.attacker,
        asset: tmpl.asset,
        description: tmpl.description,
        occurredAt: randomDate(90),
      });
    }

    const vulnCount = 8 + Math.floor(Math.random() * 8);
    const vulnBatch = [];
    for (let i = 0; i < vulnCount; i++) {
      const tmpl = vulnerabilityEvents[i % vulnerabilityEvents.length];
      vulnBatch.push({
        tenantId: tenant.id,
        eventType: "vulnerability" as const,
        severity: tmpl.severity,
        threat: tmpl.threat,
        target: tmpl.target,
        app: tmpl.app,
        description: tmpl.description,
        occurredAt: randomDate(90),
      });
    }

    await db.insert(securityEvents).values([...emailBatch, ...endpointBatch, ...vulnBatch]);
  }

  console.log("Security events seeded successfully!");
}

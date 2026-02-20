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

  console.log("Seeding comprehensive security events data...");

  const randomDate = (daysBack: number) => {
    const d = new Date();
    d.setDate(d.getDate() - Math.floor(Math.random() * daysBack));
    d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
    return d;
  };

  const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const riskRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

  const countries = ["United States", "Russia", "China", "North Korea", "Iran", "Brazil", "Nigeria", "Romania", "Ukraine", "India", "Germany", "Netherlands", "France", "United Kingdom", "Vietnam", "Turkey", "Pakistan", "Indonesia"];
  const actions = ["blocked", "quarantined", "isolated", "allowed", "alerted", "sandboxed", "dropped", "logged"];
  const emailActions = ["blocked", "quarantined", "delivered", "sandboxed", "stripped"];
  const logSources = ["CrowdStrike Falcon", "Palo Alto Cortex XDR", "Microsoft Defender", "SentinelOne", "Check Point HEC", "Fortinet FortiGate", "Cisco Umbrella", "Zscaler ZIA", "Netskope CASB", "Proofpoint", "Mimecast", "Splunk SIEM", "QRadar", "LogRhythm", "Rapid7 InsightIDR", "Carbon Black", "Trend Micro", "McAfee ePO", "Sophos Central", "Darktrace"];

  for (const tenant of allTenants) {
    if (tenant.slug.includes("vinca") || tenant.slug.includes("cibervest") || tenant.slug.includes("hitaskit")) continue;

    const slugClean = tenant.slug.replace(/-/g, "");
    const events: any[] = [];

    const emailTemplates = [
      { threat: "Emotet Trojan", sender: "invoice-update@malicious-domain.ru", recipient: "finance@{t}.com", severity: "critical" as const, threatVector: "Phishing", mitreTactic: "Initial Access", mitreTechnique: "T1566.001 - Spearphishing Attachment", description: "Emotet dropper attached to fake invoice email", sourceType: "Email Gateway" },
      { threat: "Credential Phishing", sender: "support@micros0ft-verify.com", recipient: "ceo@{t}.com", severity: "high" as const, threatVector: "Phishing", mitreTactic: "Credential Access", mitreTechnique: "T1556 - Modify Authentication Process", description: "Credential harvesting page impersonating Microsoft 365", sourceType: "Email Gateway" },
      { threat: "BEC Wire Fraud", sender: "cfo-urgent@{t}-exec.com", recipient: "accounts@{t}.com", severity: "critical" as const, threatVector: "Social Engineering", mitreTactic: "Initial Access", mitreTechnique: "T1566.002 - Spearphishing Link", description: "Business email compromise requesting urgent wire transfer", sourceType: "Email Gateway" },
      { threat: "Spear Phishing", sender: "resume-apply@jobsite-fake.com", recipient: "hr@{t}.com", severity: "high" as const, threatVector: "Phishing", mitreTactic: "Initial Access", mitreTechnique: "T1566.001 - Spearphishing Attachment", description: "Targeted phishing with malicious resume attachment", sourceType: "Email Gateway" },
      { threat: "Malware Delivery", sender: "noreply@delivery-notice.xyz", recipient: "admin@{t}.com", severity: "high" as const, threatVector: "Phishing", mitreTactic: "Execution", mitreTechnique: "T1204.002 - Malicious File", description: "Malware dropper disguised as delivery notification", sourceType: "Email Gateway" },
      { threat: "Spam Campaign", sender: "deals@promo-blast.net", recipient: "info@{t}.com", severity: "low" as const, threatVector: "Spam", mitreTactic: "Initial Access", mitreTechnique: "T1566 - Phishing", description: "Mass spam campaign with suspicious links", sourceType: "Spam Filter" },
      { threat: "Ransomware Dropper", sender: "court-notice@legal-filing.xyz", recipient: "legal@{t}.com", severity: "critical" as const, threatVector: "Ransomware", mitreTactic: "Execution", mitreTechnique: "T1204.002 - Malicious File", description: "Ransomware payload in fake legal notice", sourceType: "Email Gateway" },
      { threat: "Whaling Attack", sender: "board@{t}-directors.com", recipient: "cfo@{t}.com", severity: "critical" as const, threatVector: "Social Engineering", mitreTactic: "Initial Access", mitreTechnique: "T1566.002 - Spearphishing Link", description: "Whaling attack targeting CFO with fake board directive", sourceType: "Email Gateway" },
      { threat: "QR Phishing", sender: "scan-verify@qr-secure.net", recipient: "reception@{t}.com", severity: "medium" as const, threatVector: "Phishing", mitreTactic: "Credential Access", mitreTechnique: "T1598 - Phishing for Information", description: "QR code phishing redirecting to credential harvester", sourceType: "Email Gateway" },
      { threat: "Invoice Fraud", sender: "billing@vendor-update.biz", recipient: "procurement@{t}.com", severity: "high" as const, threatVector: "Social Engineering", mitreTactic: "Initial Access", mitreTechnique: "T1566.002 - Spearphishing Link", description: "Fraudulent invoice from impersonated vendor", sourceType: "Email Gateway" },
      { threat: "Spear Phishing", sender: "security-alert@github-notify.io", recipient: "developer@{t}.com", severity: "high" as const, threatVector: "Phishing", mitreTactic: "Credential Access", mitreTechnique: "T1598 - Phishing for Information", description: "GitHub impersonation targeting developer credentials", sourceType: "Email Gateway" },
      { threat: "Credential Phishing", sender: "zoom-invite@meeting-now.xyz", recipient: "manager@{t}.com", severity: "medium" as const, threatVector: "Phishing", mitreTactic: "Credential Access", mitreTechnique: "T1556 - Modify Authentication Process", description: "Fake Zoom meeting invite harvesting credentials", sourceType: "Email Gateway" },
      { threat: "Malware Delivery", sender: "ticket@helpdesk-urgent.com", recipient: "support@{t}.com", severity: "medium" as const, threatVector: "Phishing", mitreTactic: "Execution", mitreTechnique: "T1204.002 - Malicious File", description: "Trojan in fake helpdesk ticket attachment", sourceType: "Email Gateway" },
      { threat: "Data Exfil Link", sender: "proposal@partner-collab.com", recipient: "sales@{t}.com", severity: "medium" as const, threatVector: "Social Engineering", mitreTactic: "Exfiltration", mitreTechnique: "T1567 - Exfiltration Over Web Service", description: "Phishing link leading to data exfiltration page", sourceType: "Email Gateway" },
      { threat: "BEC Payroll Diversion", sender: "hr-update@{t}-portal.net", recipient: "payroll@{t}.com", severity: "critical" as const, threatVector: "Social Engineering", mitreTactic: "Initial Access", mitreTechnique: "T1566.002 - Spearphishing Link", description: "BEC attempting payroll direct deposit change", sourceType: "Email Gateway" },
    ];

    for (let i = 0; i < 12 + Math.floor(Math.random() * 6); i++) {
      const t = emailTemplates[i % emailTemplates.length];
      events.push({
        tenantId: tenant.id, eventType: "email" as const, severity: t.severity,
        threat: t.threat, target: t.recipient.replace(/\{t\}/g, slugClean), attacker: t.sender.replace(/\{t\}/g, slugClean),
        sender: t.sender.replace(/\{t\}/g, slugClean), recipient: t.recipient.replace(/\{t\}/g, slugClean),
        description: t.description, threatVector: t.threatVector, mitreTactic: t.mitreTactic,
        mitreTechnique: t.mitreTechnique, action: pick(emailActions), sourceType: t.sourceType,
        logSource: pick(["Proofpoint", "Mimecast", "Microsoft Defender for O365", "Barracuda", "Cisco IronPort"]),
        country: pick(countries), riskScore: riskRange(40, 98), occurredAt: randomDate(120),
      });
    }

    const endpointTemplates = [
      { threat: "Ryuk Ransomware", target: "SRV-DC-01", attacker: "185.220.101.34", asset: "Domain Controller", severity: "critical" as const, threatVector: "Ransomware", mitreTactic: "Impact", mitreTechnique: "T1486 - Data Encrypted for Impact" },
      { threat: "Cobalt Strike Beacon", target: "WS-FIN-015", attacker: "45.77.123.89", asset: "Finance Workstation", severity: "critical" as const, threatVector: "C2", mitreTactic: "Command and Control", mitreTechnique: "T1071.001 - Web Protocols" },
      { threat: "TrickBot", target: "WS-HR-003", attacker: "91.215.85.201", asset: "HR Workstation", severity: "high" as const, threatVector: "Malware", mitreTactic: "Collection", mitreTechnique: "T1005 - Data from Local System" },
      { threat: "Mimikatz", target: "SRV-APP-02", attacker: "Internal Lateral", asset: "Application Server", severity: "critical" as const, threatVector: "Credential Theft", mitreTactic: "Credential Access", mitreTechnique: "T1003.001 - LSASS Memory" },
      { threat: "WannaCry Variant", target: "WS-OPS-009", attacker: "Unknown", asset: "Operations Workstation", severity: "critical" as const, threatVector: "Ransomware", mitreTactic: "Lateral Movement", mitreTechnique: "T1021.002 - SMB/Windows Admin Shares" },
      { threat: "Emotet Payload", target: "WS-SALES-007", attacker: "193.56.28.103", asset: "Sales Workstation", severity: "high" as const, threatVector: "Malware", mitreTactic: "Execution", mitreTechnique: "T1059.001 - PowerShell" },
      { threat: "PowerShell Empire", target: "SRV-WEB-01", attacker: "172.16.45.22", asset: "Web Server", severity: "high" as const, threatVector: "C2", mitreTactic: "Execution", mitreTechnique: "T1059.001 - PowerShell" },
      { threat: "Cryptominer", target: "SRV-BUILD-03", attacker: "Mining Pool", asset: "Build Server", severity: "medium" as const, threatVector: "Cryptojacking", mitreTactic: "Impact", mitreTechnique: "T1496 - Resource Hijacking" },
      { threat: "Backdoor Trojan", target: "WS-EXEC-001", attacker: "203.0.113.42", asset: "Executive Laptop", severity: "critical" as const, threatVector: "Trojan", mitreTactic: "Persistence", mitreTechnique: "T1547.001 - Registry Run Keys" },
      { threat: "Fileless Malware", target: "SRV-DB-01", attacker: "In-Memory", asset: "Database Server", severity: "high" as const, threatVector: "Fileless", mitreTactic: "Defense Evasion", mitreTechnique: "T1055 - Process Injection" },
      { threat: "Rootkit", target: "SRV-MAIL-01", attacker: "78.46.91.155", asset: "Mail Server", severity: "critical" as const, threatVector: "Rootkit", mitreTactic: "Defense Evasion", mitreTechnique: "T1014 - Rootkit" },
      { threat: "RAT (Remote Access)", target: "WS-DEV-004", attacker: "94.130.12.77", asset: "Developer Workstation", severity: "high" as const, threatVector: "Trojan", mitreTactic: "Command and Control", mitreTechnique: "T1219 - Remote Access Software" },
      { threat: "Ransomware Precursor", target: "SRV-FILE-02", attacker: "Internal Pivot", asset: "File Server", severity: "high" as const, threatVector: "Ransomware", mitreTactic: "Discovery", mitreTechnique: "T1083 - File and Directory Discovery" },
      { threat: "Keylogger", target: "WS-ACCT-006", attacker: "Unknown", asset: "Accounting Workstation", severity: "high" as const, threatVector: "Spyware", mitreTactic: "Collection", mitreTechnique: "T1056.001 - Keylogging" },
      { threat: "Adware", target: "WS-MKT-012", attacker: "Bundled Software", asset: "Marketing Workstation", severity: "low" as const, threatVector: "PUP", mitreTactic: "Execution", mitreTechnique: "T1204.002 - Malicious File" },
    ];

    for (let i = 0; i < 12 + Math.floor(Math.random() * 8); i++) {
      const t = endpointTemplates[i % endpointTemplates.length];
      events.push({
        tenantId: tenant.id, eventType: "endpoint" as const, severity: t.severity,
        threat: t.threat, target: t.target, attacker: t.attacker, asset: t.asset,
        description: `${t.threat} detected on ${t.asset}`, threatVector: t.threatVector,
        mitreTactic: t.mitreTactic, mitreTechnique: t.mitreTechnique,
        action: pick(["blocked", "quarantined", "isolated", "alerted"]),
        sourceType: "EDR", logSource: pick(["CrowdStrike Falcon", "SentinelOne", "Microsoft Defender", "Carbon Black", "Palo Alto Cortex XDR"]),
        country: pick(countries), riskScore: riskRange(50, 99), occurredAt: randomDate(120),
      });
    }

    const vulnTemplates = [
      { threat: "CVE-2025-21298", target: "SRV-EXCH-01", app: "Microsoft Exchange", severity: "critical" as const },
      { threat: "CVE-2025-0282", target: "VPN-GW-01", app: "Ivanti Connect Secure", severity: "critical" as const },
      { threat: "CVE-2024-3400", target: "FW-PALO-01", app: "Palo Alto PAN-OS", severity: "critical" as const },
      { threat: "CVE-2025-1234", target: "SRV-WEB-02", app: "Apache Tomcat", severity: "high" as const },
      { threat: "CVE-2024-50623", target: "FTP-CLEO-01", app: "Cleo Harmony", severity: "critical" as const },
      { threat: "CVE-2025-5678", target: "SRV-DB-PROD", app: "PostgreSQL", severity: "high" as const },
      { threat: "CVE-2025-2468", target: "SRV-JIRA-01", app: "Atlassian Jira", severity: "medium" as const },
      { threat: "CVE-2024-11234", target: "LB-NGINX-01", app: "NGINX Plus", severity: "high" as const },
      { threat: "CVE-2025-3344", target: "SRV-JENKINS-01", app: "Jenkins", severity: "high" as const },
      { threat: "CVE-2025-7890", target: "WS-CHROME-ALL", app: "Google Chrome", severity: "medium" as const },
      { threat: "CVE-2025-4455", target: "SRV-DOCKER-01", app: "Docker Engine", severity: "high" as const },
      { threat: "CVE-2024-9876", target: "FW-FORTINET-01", app: "FortiGate", severity: "critical" as const },
      { threat: "CVE-2025-1122", target: "SRV-AD-01", app: "Active Directory", severity: "high" as const },
      { threat: "CVE-2025-8899", target: "SRV-K8S-01", app: "Kubernetes", severity: "high" as const },
    ];

    for (let i = 0; i < 10 + Math.floor(Math.random() * 6); i++) {
      const t = vulnTemplates[i % vulnTemplates.length];
      events.push({
        tenantId: tenant.id, eventType: "vulnerability" as const, severity: t.severity,
        threat: t.threat, target: t.target, app: t.app,
        description: `${t.threat} affecting ${t.app}`, threatVector: "Vulnerability",
        mitreTactic: "Initial Access", mitreTechnique: "T1190 - Exploit Public-Facing Application",
        action: pick(["alerted", "logged"]), sourceType: "Vulnerability Scanner",
        logSource: pick(["Tenable Nessus", "Qualys", "Rapid7 InsightVM", "OpenVAS"]),
        riskScore: riskRange(30, 95), occurredAt: randomDate(120),
      });
    }

    const casbTemplates = [
      { threat: "Shadow IT - Unauthorized SaaS", app: "WeTransfer", severity: "high" as const, description: "Sensitive files uploaded to unauthorized file sharing service" },
      { threat: "Shadow IT - Personal Cloud", app: "Google Drive (Personal)", severity: "medium" as const, description: "Corporate data synced to personal cloud storage" },
      { threat: "Unauthorized Cloud App", app: "Slack (Free Tier)", severity: "medium" as const, description: "Employees using unauthorized free Slack workspace" },
      { threat: "Cloud DLP Violation", app: "Dropbox", severity: "high" as const, description: "PII data detected in shared Dropbox folder" },
      { threat: "Risky OAuth Grant", app: "Third-Party Chrome Extension", severity: "high" as const, description: "Risky OAuth permissions granted to unknown extension" },
      { threat: "Account Takeover", app: "Salesforce", severity: "critical" as const, description: "Impossible travel login detected on Salesforce account" },
      { threat: "Shadow IT - AI Tool", app: "ChatGPT (Unmanaged)", severity: "high" as const, description: "Confidential code pasted into unmanaged AI tool" },
      { threat: "Excessive Sharing", app: "OneDrive", severity: "medium" as const, description: "Sensitive folder shared externally with broad permissions" },
    ];

    for (let i = 0; i < 8 + Math.floor(Math.random() * 5); i++) {
      const t = casbTemplates[i % casbTemplates.length];
      events.push({
        tenantId: tenant.id, eventType: "casb" as const, severity: t.severity,
        threat: t.threat, app: t.app, description: t.description,
        target: pick([`user${riskRange(1,20)}@${slugClean}.com`, `admin@${slugClean}.com`, `sales@${slugClean}.com`]),
        threatVector: "Cloud Misuse", mitreTactic: "Exfiltration",
        mitreTechnique: "T1567 - Exfiltration Over Web Service",
        action: pick(["blocked", "alerted", "logged"]), sourceType: "CASB",
        logSource: pick(["Netskope", "Microsoft Defender for Cloud Apps", "Zscaler CASB", "Skyhigh Security"]),
        riskScore: riskRange(40, 90), occurredAt: randomDate(120),
      });
    }

    const wafTemplates = [
      { threat: "SQL Injection", severity: "critical" as const, protocol: "HTTPS", description: "SQL injection attempt on login form" },
      { threat: "Cross-Site Scripting (XSS)", severity: "high" as const, protocol: "HTTPS", description: "Reflected XSS attack in search parameter" },
      { threat: "DDoS - HTTP Flood", severity: "critical" as const, protocol: "HTTP", description: "Volumetric HTTP flood targeting web application" },
      { threat: "Directory Traversal", severity: "high" as const, protocol: "HTTPS", description: "Path traversal attempt accessing system files" },
      { threat: "Command Injection", severity: "critical" as const, protocol: "HTTPS", description: "OS command injection via vulnerable parameter" },
      { threat: "CSRF Attack", severity: "medium" as const, protocol: "HTTPS", description: "Cross-site request forgery on admin panel" },
      { threat: "XML External Entity (XXE)", severity: "high" as const, protocol: "HTTPS", description: "XXE injection in XML parser endpoint" },
      { threat: "Bot Traffic", severity: "medium" as const, protocol: "HTTP", description: "Automated bot scraping sensitive content" },
      { threat: "API Abuse", severity: "high" as const, protocol: "HTTPS", description: "Rate limit exceeded on authentication API" },
      { threat: "DDoS - Slowloris", severity: "high" as const, protocol: "HTTP", description: "Slowloris attack holding connections open" },
    ];

    for (let i = 0; i < 10 + Math.floor(Math.random() * 6); i++) {
      const t = wafTemplates[i % wafTemplates.length];
      events.push({
        tenantId: tenant.id, eventType: "waf" as const, severity: t.severity,
        threat: t.threat, description: t.description, protocol: t.protocol,
        target: pick([`web.${slugClean}.com`, `api.${slugClean}.com`, `portal.${slugClean}.com`, `app.${slugClean}.com`]),
        attacker: `${riskRange(1,223)}.${riskRange(0,255)}.${riskRange(0,255)}.${riskRange(1,254)}`,
        threatVector: "Web Attack", mitreTactic: "Initial Access",
        mitreTechnique: "T1190 - Exploit Public-Facing Application",
        action: pick(["blocked", "dropped", "alerted", "logged"]), sourceType: "WAF",
        logSource: pick(["Cloudflare WAF", "AWS WAF", "Imperva", "F5 BIG-IP", "Akamai Kona"]),
        country: pick(countries), riskScore: riskRange(50, 99), occurredAt: randomDate(120),
      });
    }

    const dlpTemplates = [
      { threat: "PII Leakage", severity: "critical" as const, description: "Social Security Numbers detected in outgoing email" },
      { threat: "Financial Data Exposure", severity: "high" as const, description: "Credit card numbers found in uploaded document" },
      { threat: "Source Code Leak", severity: "high" as const, description: "Proprietary source code uploaded to public repository" },
      { threat: "Healthcare Data (PHI)", severity: "critical" as const, description: "Patient health information in unauthorized location" },
      { threat: "Sensitive Document Print", severity: "medium" as const, description: "Classified document sent to unmonitored printer" },
      { threat: "USB Data Transfer", severity: "high" as const, description: "Bulk data copied to unauthorized USB device" },
    ];

    for (let i = 0; i < 6 + Math.floor(Math.random() * 4); i++) {
      const t = dlpTemplates[i % dlpTemplates.length];
      events.push({
        tenantId: tenant.id, eventType: "dlp" as const, severity: t.severity,
        threat: t.threat, description: t.description,
        target: pick([`user${riskRange(1,15)}@${slugClean}.com`, `admin@${slugClean}.com`]),
        threatVector: "Data Loss", mitreTactic: "Exfiltration",
        mitreTechnique: pick(["T1048 - Exfiltration Over Alternative Protocol", "T1567 - Exfiltration Over Web Service"]),
        action: pick(["blocked", "alerted", "logged"]), sourceType: "DLP",
        logSource: pick(["Symantec DLP", "Microsoft Purview", "Forcepoint DLP", "Digital Guardian"]),
        riskScore: riskRange(60, 99), occurredAt: randomDate(120),
      });
    }

    const networkTemplates = [
      { threat: "Port Scan", severity: "medium" as const, protocol: "TCP", description: "Sequential port scan from external IP" },
      { threat: "DNS Tunneling", severity: "high" as const, protocol: "DNS", description: "Suspicious DNS queries indicating data exfiltration" },
      { threat: "C2 Communication", severity: "critical" as const, protocol: "HTTPS", description: "Outbound connection to known C2 infrastructure" },
      { threat: "Lateral Movement", severity: "high" as const, protocol: "SMB", description: "Unusual SMB traffic between workstations" },
      { threat: "ARP Spoofing", severity: "high" as const, protocol: "ARP", description: "ARP spoofing detected on internal network" },
      { threat: "Suspicious Outbound", severity: "medium" as const, protocol: "HTTPS", description: "High-volume outbound traffic to unusual destination" },
      { threat: "IDS Alert - Exploit Kit", severity: "critical" as const, protocol: "HTTP", description: "Exploit kit download attempt detected by IDS" },
      { threat: "Brute Force SSH", severity: "high" as const, protocol: "SSH", description: "Multiple failed SSH login attempts from single IP" },
    ];

    for (let i = 0; i < 8 + Math.floor(Math.random() * 5); i++) {
      const t = networkTemplates[i % networkTemplates.length];
      events.push({
        tenantId: tenant.id, eventType: "network" as const, severity: t.severity,
        threat: t.threat, description: t.description, protocol: t.protocol,
        target: pick([`10.${riskRange(0,255)}.${riskRange(0,255)}.${riskRange(1,254)}`, `192.168.${riskRange(1,10)}.${riskRange(1,254)}`]),
        attacker: `${riskRange(1,223)}.${riskRange(0,255)}.${riskRange(0,255)}.${riskRange(1,254)}`,
        threatVector: pick(["Network Intrusion", "C2", "Lateral Movement", "Reconnaissance"]),
        mitreTactic: pick(["Reconnaissance", "Lateral Movement", "Command and Control", "Exfiltration"]),
        mitreTechnique: pick(["T1046 - Network Service Discovery", "T1571 - Non-Standard Port", "T1071 - Application Layer Protocol"]),
        action: pick(["blocked", "dropped", "alerted", "logged"]), sourceType: "IDS/IPS",
        logSource: pick(["Palo Alto NGFW", "Fortinet FortiGate", "Cisco Firepower", "Snort", "Suricata", "Check Point"]),
        country: pick(countries), riskScore: riskRange(40, 95), occurredAt: randomDate(120),
      });
    }

    const identityTemplates = [
      { threat: "Impossible Travel", severity: "high" as const, description: "Login from two countries within 30 minutes" },
      { threat: "Brute Force Login", severity: "high" as const, description: "50+ failed login attempts in 5 minutes" },
      { threat: "Privilege Escalation", severity: "critical" as const, description: "User elevated to admin role without approval" },
      { threat: "Stale Account Access", severity: "medium" as const, description: "Dormant account accessed after 90 days" },
      { threat: "MFA Fatigue Attack", severity: "high" as const, description: "Repeated MFA push notifications to user" },
      { threat: "Password Spray", severity: "high" as const, description: "Common passwords tried across multiple accounts" },
      { threat: "Service Account Abuse", severity: "critical" as const, description: "Service account used for interactive login" },
    ];

    for (let i = 0; i < 6 + Math.floor(Math.random() * 4); i++) {
      const t = identityTemplates[i % identityTemplates.length];
      events.push({
        tenantId: tenant.id, eventType: "identity" as const, severity: t.severity,
        threat: t.threat, description: t.description,
        target: pick([`admin@${slugClean}.com`, `user${riskRange(1,20)}@${slugClean}.com`, `svc_account_${riskRange(1,5)}`]),
        attacker: `${riskRange(1,223)}.${riskRange(0,255)}.${riskRange(0,255)}.${riskRange(1,254)}`,
        threatVector: "Identity Attack", mitreTactic: "Credential Access",
        mitreTechnique: pick(["T1110 - Brute Force", "T1078 - Valid Accounts", "T1556 - Modify Authentication Process"]),
        action: pick(["blocked", "alerted", "logged"]), sourceType: "Identity Provider",
        logSource: pick(["Azure AD", "Okta", "CyberArk", "Ping Identity", "OneLogin"]),
        country: pick(countries), riskScore: riskRange(50, 98), occurredAt: randomDate(120),
      });
    }

    const cloudTemplates = [
      { threat: "Public S3 Bucket", severity: "critical" as const, app: "AWS S3", description: "S3 bucket with sensitive data exposed publicly" },
      { threat: "Overprivileged IAM Role", severity: "high" as const, app: "AWS IAM", description: "IAM role with admin access assigned to Lambda" },
      { threat: "Unencrypted RDS", severity: "high" as const, app: "AWS RDS", description: "Database instance running without encryption at rest" },
      { threat: "Azure Key Vault Exposure", severity: "critical" as const, app: "Azure Key Vault", description: "Key Vault access policy overly permissive" },
      { threat: "GCP Firewall Misconfiguration", severity: "high" as const, app: "GCP VPC", description: "Firewall rule allows 0.0.0.0/0 inbound on all ports" },
      { threat: "Container Image Vulnerability", severity: "high" as const, app: "ECR/ACR", description: "Container images with critical CVEs in registry" },
    ];

    for (let i = 0; i < 6 + Math.floor(Math.random() * 4); i++) {
      const t = cloudTemplates[i % cloudTemplates.length];
      events.push({
        tenantId: tenant.id, eventType: "cloud" as const, severity: t.severity,
        threat: t.threat, app: t.app, description: t.description,
        target: pick([`account-${slugClean}-prod`, `account-${slugClean}-dev`, `subscription-${slugClean}`]),
        threatVector: "Cloud Misconfiguration", mitreTactic: "Initial Access",
        mitreTechnique: "T1190 - Exploit Public-Facing Application",
        action: pick(["alerted", "logged"]), sourceType: "CSPM",
        logSource: pick(["AWS Security Hub", "Azure Defender", "GCP Security Command Center", "Prisma Cloud", "Wiz"]),
        riskScore: riskRange(60, 99), occurredAt: randomDate(120),
      });
    }

    const sseTemplates = [
      { threat: "Unsanctioned App Access", severity: "medium" as const, description: "User accessing blocked web application category" },
      { threat: "SSL Inspection Bypass", severity: "high" as const, description: "Application using certificate pinning to bypass inspection" },
      { threat: "Malware Download Blocked", severity: "high" as const, description: "Known malicious file download blocked at proxy" },
      { threat: "Phishing Site Access", severity: "high" as const, description: "User attempted to access known phishing URL" },
      { threat: "Data Upload to Cloud", severity: "medium" as const, description: "Large file upload to unmanaged cloud service" },
    ];

    for (let i = 0; i < 5 + Math.floor(Math.random() * 4); i++) {
      const t = sseTemplates[i % sseTemplates.length];
      events.push({
        tenantId: tenant.id, eventType: "sse" as const, severity: t.severity,
        threat: t.threat, description: t.description,
        target: pick([`user${riskRange(1,15)}@${slugClean}.com`]),
        threatVector: "Web Security", mitreTactic: pick(["Initial Access", "Exfiltration"]),
        mitreTechnique: pick(["T1566 - Phishing", "T1567 - Exfiltration Over Web Service"]),
        action: pick(["blocked", "alerted", "logged"]), sourceType: "SSE/SWG",
        logSource: pick(["Zscaler ZIA", "Netskope", "Palo Alto Prisma Access", "Cisco Umbrella", "Skyhigh Security"]),
        country: pick(countries), riskScore: riskRange(30, 85), occurredAt: randomDate(120),
      });
    }

    if (events.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < events.length; i += batchSize) {
        await db.insert(securityEvents).values(events.slice(i, i + batchSize));
      }
    }
  }

  console.log("Comprehensive security events seeded successfully!");
}

import { db } from "./db";
import { tenants, incidents, tickets, projects, tasks } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedDatabase() {
  const existingTenants = await db.select().from(tenants);
  if (existingTenants.length > 0) return;

  console.log("Seeding database with initial data...");

  const tenantData = [
    { name: "Vinca Cyber", slug: "vinca-cyber", industry: "Cybersecurity", contactEmail: "ops@vincacyber.com" },
    { name: "Cibervest", slug: "cibervest", industry: "Financial Services", contactEmail: "security@cibervest.com" },
    { name: "PKF", slug: "pkf", industry: "Professional Services", contactEmail: "it@pkf.com" },
    { name: "HitaskIT", slug: "hitaskit", industry: "Technology", contactEmail: "soc@hitaskit.com" },
  ];

  const createdTenants = await db.insert(tenants).values(tenantData).returning();

  for (const tenant of createdTenants) {
    const incidentData = [
      { tenantId: tenant.id, title: "Suspicious RDP brute force attempts detected", description: "Multiple failed RDP login attempts from IP range 185.220.x.x targeting domain controllers", severity: "critical" as const, status: "investigating" as const, source: "SIEM", category: "intrusion", affectedAssets: "DC-01, DC-02" },
      { tenantId: tenant.id, title: "Phishing campaign targeting finance department", description: "Spear phishing emails with malicious PDF attachments sent to 15 employees", severity: "high" as const, status: "contained" as const, source: "Email Gateway", category: "phishing", affectedAssets: "Exchange Server" },
      { tenantId: tenant.id, title: "Malware detected on endpoint WS-ACCT-042", description: "Emotet trojan detected by EDR on workstation in accounting department", severity: "high" as const, status: "open" as const, source: "EDR", category: "malware", affectedAssets: "WS-ACCT-042" },
      { tenantId: tenant.id, title: "Unusual outbound data transfer detected", description: "Large volume of data transferred to external cloud storage service during non-business hours", severity: "medium" as const, status: "investigating" as const, source: "DLP", category: "data_breach", affectedAssets: "File Server FS-01" },
      { tenantId: tenant.id, title: "SSL certificate expiring on public-facing web server", description: "SSL certificate for main web application expires in 7 days", severity: "medium" as const, status: "open" as const, source: "Vulnerability Scanner", category: "vulnerability", affectedAssets: "web-prod-01" },
      { tenantId: tenant.id, title: "Failed login attempts from unknown geographic location", description: "Multiple login attempts from unusual IP ranges in Eastern Europe", severity: "medium" as const, status: "resolved" as const, source: "Azure AD", category: "intrusion", affectedAssets: "Azure AD" },
      { tenantId: tenant.id, title: "Outdated firmware on network switches", description: "Critical vulnerability CVE-2024-1234 affects current firmware version on 8 switches", severity: "low" as const, status: "open" as const, source: "Vulnerability Scanner", category: "vulnerability", affectedAssets: "Network Layer 2" },
      { tenantId: tenant.id, title: "DDoS attempt on external web services", description: "Volumetric DDoS attack targeting public API endpoints", severity: "critical" as const, status: "resolved" as const, source: "WAF", category: "ddos", affectedAssets: "API Gateway" },
      { tenantId: tenant.id, title: "Unauthorized access to admin panel", description: "User attempted access to admin dashboard without proper authorization", severity: "high" as const, status: "closed" as const, source: "Application Logs", category: "intrusion", affectedAssets: "Admin Portal" },
      { tenantId: tenant.id, title: "Endpoint protection agent offline on 3 servers", description: "EDR agents stopped reporting on production database servers", severity: "medium" as const, status: "investigating" as const, source: "EDR Console", category: "other", affectedAssets: "DB-01, DB-02, DB-03" },
    ];

    await db.insert(incidents).values(incidentData);

    const ticketData = [
      { tenantId: tenant.id, title: "Request for new firewall rule", description: "Need to allow traffic from partner network 10.20.x.x/24 to internal application server", priority: "medium" as const, status: "open" as const, category: "configuration" },
      { tenantId: tenant.id, title: "VPN access not working for remote users", description: "Several remote employees reporting inability to connect via VPN client since yesterday", priority: "high" as const, status: "in_progress" as const, category: "incident" },
      { tenantId: tenant.id, title: "Monthly security assessment report request", description: "Requesting comprehensive security assessment report for board meeting", priority: "medium" as const, status: "waiting" as const, category: "general" },
      { tenantId: tenant.id, title: "Access provisioning for new hire batch", description: "15 new employees starting next Monday need access to corporate systems", priority: "urgent" as const, status: "open" as const, category: "access" },
      { tenantId: tenant.id, title: "SIEM alert tuning required", description: "Too many false positive alerts from the web application firewall module", priority: "low" as const, status: "resolved" as const, category: "configuration" },
    ];

    await db.insert(tickets).values(ticketData);

    const projectData = [
      { tenantId: tenant.id, name: "SOC Enhancement Phase 2", description: "Upgrade SOC capabilities with advanced threat hunting and automated response", status: "active" as const },
      { tenantId: tenant.id, name: "Zero Trust Implementation", description: "Deploy zero trust architecture across all network segments", status: "planning" as const },
    ];

    const createdProjects = await db.insert(projects).values(projectData).returning();

    if (createdProjects[0]) {
      const taskData = [
        { projectId: createdProjects[0].id, title: "Deploy SOAR playbooks for phishing response", description: "Create and test automated playbooks for phishing incident response", status: "done" as const, priority: "high" as const },
        { projectId: createdProjects[0].id, title: "Integrate threat intelligence feeds", description: "Connect MISP and AlienVault OTX feeds to SIEM", status: "in_progress" as const, priority: "high" as const },
        { projectId: createdProjects[0].id, title: "Configure automated ticket creation from alerts", description: "Set up automatic ticket creation for P1 and P2 alerts", status: "review" as const, priority: "medium" as const },
        { projectId: createdProjects[0].id, title: "Implement log correlation rules", description: "Create correlation rules for detecting lateral movement patterns", status: "todo" as const, priority: "urgent" as const },
        { projectId: createdProjects[0].id, title: "Security dashboard redesign", description: "Update executive dashboard with new KPI metrics and visualizations", status: "backlog" as const, priority: "low" as const },
        { projectId: createdProjects[0].id, title: "EDR policy optimization", description: "Fine-tune EDR detection policies to reduce false positives", status: "in_progress" as const, priority: "medium" as const },
      ];

      await db.insert(tasks).values(taskData);
    }

    if (createdProjects[1]) {
      const ztTasks = [
        { projectId: createdProjects[1].id, title: "Network segmentation assessment", description: "Document current network segments and identify gaps", status: "todo" as const, priority: "high" as const },
        { projectId: createdProjects[1].id, title: "Identity provider evaluation", description: "Evaluate IdP solutions for conditional access", status: "backlog" as const, priority: "medium" as const },
        { projectId: createdProjects[1].id, title: "Micro-segmentation POC", description: "Proof of concept for micro-segmentation in production", status: "backlog" as const, priority: "high" as const },
      ];

      await db.insert(tasks).values(ztTasks);
    }
  }

  console.log("Database seeded successfully!");
}

import { useState } from "react";
import { BookOpen, Server, Shield, Users, Building2, BarChart3, AlertTriangle, Brain, FileText, Clock, Mail, Globe, Download, Database, Key, Webhook, Gauge, Plug, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

function TableOfContents({ sections, onNavigate }: { sections: { id: string; title: string }[]; onNavigate: (id: string) => void }) {
  return (
    <div className="space-y-1" data-testid="table-of-contents">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">On This Page</p>
      {sections.map((s) => (
        <Button
          key={s.id}
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs font-normal"
          onClick={() => onNavigate(s.id)}
          data-testid={`link-toc-${s.id}`}
        >
          <ChevronRight className="w-3 h-3 mr-1 shrink-0" />
          <span className="truncate">{s.title}</span>
        </Button>
      ))}
    </div>
  );
}

function DocSection({ id, title, icon, children }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card id={id} data-testid={`section-${id}`} className="scroll-mt-4">
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <div className="text-primary">{icon}</div>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-relaxed">{children}</CardContent>
    </Card>
  );
}

function CodeBlock({ children, title }: { children: string; title?: string }) {
  return (
    <div className="rounded-md border bg-muted/50 overflow-hidden">
      {title && <div className="px-3 py-1.5 border-b text-xs font-medium text-muted-foreground bg-muted">{title}</div>}
      <pre className="p-3 overflow-x-auto text-xs"><code>{children}</code></pre>
    </div>
  );
}

const adminSections = [
  { id: "platform-overview", title: "Platform Overview" },
  { id: "user-role-management", title: "User & Role Management" },
  { id: "tenant-management", title: "Tenant Management" },
  { id: "dashboard-configuration", title: "Dashboard Configuration" },
  { id: "incident-management", title: "Incident Management" },
  { id: "ai-soc-analyst", title: "AI SOC Analyst" },
  { id: "report-generation", title: "Report Generation" },
  { id: "shift-roster", title: "Shift Roster Management" },
  { id: "knowledge-base", title: "Knowledge Base" },
  { id: "email-notifications", title: "Email Notifications" },
  { id: "timezone-configuration", title: "Timezone Configuration" },
];

const installSections = [
  { id: "system-requirements", title: "System Requirements" },
  { id: "environment-setup", title: "Environment Setup" },
  { id: "database-setup", title: "Database Setup" },
  { id: "environment-variables", title: "Environment Variables" },
  { id: "first-time-setup", title: "First-Time Setup" },
  { id: "docker-deployment", title: "Docker Deployment" },
  { id: "cloud-deployment", title: "Cloud Deployment" },
  { id: "ssl-tls", title: "SSL/TLS Configuration" },
  { id: "backup-recovery", title: "Backup & Recovery" },
];

const apiSections = [
  { id: "authentication", title: "Authentication" },
  { id: "push-api", title: "Push API" },
  { id: "security-event-types", title: "Security Event Types" },
  { id: "incident-apis", title: "Incident APIs" },
  { id: "email-provider-setup", title: "Email Provider Setup" },
  { id: "webhook-endpoints", title: "Webhook Endpoints" },
  { id: "rate-limits", title: "Rate Limits" },
  { id: "connector-development", title: "Connector Development" },
];

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function AdminGuideContent() {
  return (
    <div className="space-y-4">
      <DocSection id="platform-overview" title="Platform Overview" icon={<Server className="w-5 h-5" />}>
        <p>SecureOps is a multi-tenant Managed Security Service Provider (MSSP) platform designed for organizations that provide security operations services to multiple clients. The architecture follows a hierarchical multi-tenant model that ensures complete data isolation between customers while providing centralized management capabilities for the MSSP operator.</p>
        <h3 className="font-semibold mt-3">Architecture</h3>
        <p>The platform uses a three-tier hierarchy:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Platform Level:</strong> The top-level administrative layer managed by the MSSP. Platform administrators have visibility across all tenants and can configure global settings, manage user accounts, and monitor the health of the entire platform.</li>
          <li><strong>Tenant Level:</strong> Each customer organization is represented as a tenant. Tenants have isolated data stores, independent configurations, and dedicated dashboards. A tenant can represent an individual company, a business unit, or a geographic region.</li>
          <li><strong>User Level:</strong> Individual analysts, managers, and customer representatives are assigned to one or more tenants with role-based access controls that restrict their visibility and actions according to their responsibilities.</li>
        </ul>
        <h3 className="font-semibold mt-3">Key Capabilities</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Centralized security event ingestion from multiple sources (SIEM, EDR, cloud, network)</li>
          <li>Automated incident classification using SIGMA rules and AI-powered analysis</li>
          <li>MITRE ATT&CK framework mapping for all detected threats</li>
          <li>Real-time dashboards with drill-down analytics per tenant</li>
          <li>Automated and manual report generation with PDF export</li>
          <li>Entity-based risk scoring for users, devices, and applications</li>
          <li>Knowledge base for SOC procedures and runbooks</li>
        </ul>
      </DocSection>

      <DocSection id="user-role-management" title="User & Role Management" icon={<Users className="w-5 h-5" />}>
        <p>SecureOps implements a granular role-based access control (RBAC) system. Each user is assigned exactly one role that determines their permissions across the platform.</p>
        <h3 className="font-semibold mt-3">Available Roles</h3>
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-1"><Badge variant="default">platform_admin</Badge></div>
            <p>Full administrative access across all tenants. Can create and delete tenants, manage all users, configure platform-wide settings, view all dashboards, and access the Admin Portal. This role is typically reserved for the MSSP's senior management or platform engineering team.</p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1"><Badge variant="default">mss_admin</Badge></div>
            <p>Administrative access scoped to assigned tenants. Can manage users within their tenants, configure tenant-specific settings, generate reports, and oversee incident response. This role is designed for MSS delivery managers who are responsible for specific customer accounts.</p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1"><Badge variant="secondary">mss_analyst</Badge></div>
            <p>Operational access for day-to-day security analysis. Can view and update incidents, investigate alerts, add enrichment data, and create knowledge base articles. Analysts cannot modify tenant configurations or manage user accounts.</p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1"><Badge variant="secondary">soc_manager</Badge></div>
            <p>Supervisory role for SOC operations. Can view all incidents and analyst activities within assigned tenants, approve incident escalations, manage shift schedules, and generate performance reports. Has access to the Admin Portal for tenant-level settings.</p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1"><Badge variant="outline">customer</Badge></div>
            <p>Read-only access for customer representatives. Can view dashboards, incident summaries, and reports for their specific tenant. Cannot modify any data or configuration. This role provides transparency to the end customer about their security posture.</p>
          </div>
        </div>
        <h3 className="font-semibold mt-3">User Creation</h3>
        <p>Users are created through the Admin Portal by platform administrators or MSS administrators. Each user requires a unique email address, first and last name, assigned role, and tenant association. Users authenticate via username/password credentials with session-based authentication.</p>
      </DocSection>

      <DocSection id="tenant-management" title="Tenant Management" icon={<Building2 className="w-5 h-5" />}>
        <p>Tenants represent individual customer organizations within the MSSP platform. Each tenant maintains complete data isolation and can be independently configured.</p>
        <h3 className="font-semibold mt-3">Creating a Tenant</h3>
        <p>Navigate to the Admin Portal and select "Tenants" from the management menu. Click "Create Tenant" and provide the following information:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Tenant Name:</strong> A unique, human-readable identifier (e.g., "Acme Corporation")</li>
          <li><strong>Tenant Slug:</strong> A URL-safe identifier automatically generated from the name</li>
          <li><strong>Contact Email:</strong> Primary email for the tenant's security team</li>
          <li><strong>Timezone:</strong> The tenant's primary timezone for date/time display (IANA format)</li>
          <li><strong>Status:</strong> Active or Inactive</li>
        </ul>
        <h3 className="font-semibold mt-3">Tenant Hierarchy</h3>
        <p>The platform supports a flat tenant model where each tenant is directly under the platform level. Within each tenant, data is organized by security events, incidents, assets, and users. Cross-tenant data access is only available to platform_admin role users.</p>
        <h3 className="font-semibold mt-3">Customer Onboarding Workflow</h3>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Create the tenant record with customer details and timezone</li>
          <li>Configure data ingestion endpoints and API keys for the tenant</li>
          <li>Set up security event connectors (SIEM, EDR, cloud providers)</li>
          <li>Create user accounts for both MSS analysts and customer representatives</li>
          <li>Configure email notification settings for incident alerts</li>
          <li>Validate data flow by sending test events through the Push API</li>
          <li>Generate initial baseline reports and configure scheduled reports</li>
        </ol>
      </DocSection>

      <DocSection id="dashboard-configuration" title="Dashboard Configuration" icon={<BarChart3 className="w-5 h-5" />}>
        <p>The platform provides real-time dashboards with configurable chart types and drill-down capabilities. Dashboards automatically update as new security events are ingested.</p>
        <h3 className="font-semibold mt-3">Chart Types</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Area Charts:</strong> Time-series visualization of event volume trends, showing patterns over hours, days, or weeks</li>
          <li><strong>Bar Charts:</strong> Comparative analysis of event categories, severity distributions, and top affected assets</li>
          <li><strong>Pie/Donut Charts:</strong> Proportional breakdown of incident types, source categories, and resolution statuses</li>
          <li><strong>KPI Cards:</strong> Real-time counters for critical metrics like open incidents, mean time to respond, and event ingestion rate</li>
          <li><strong>Tables:</strong> Sortable, filterable lists of recent incidents, top risk entities, and asset inventories</li>
        </ul>
        <h3 className="font-semibold mt-3">Drill-Down Navigation</h3>
        <p>All dashboard elements support interactive drill-down. Clicking on a chart segment, table row, or KPI card navigates to a filtered view showing the underlying data. For example, clicking on "Critical" severity in a bar chart filters the incident list to show only critical incidents for the selected time period.</p>
        <h3 className="font-semibold mt-3">Real-Time Updates</h3>
        <p>Dashboards use polling-based refresh with configurable intervals. The default refresh interval is 30 seconds for KPI cards and 60 seconds for charts. Data is fetched from the server using React Query with automatic cache invalidation when underlying data changes.</p>
      </DocSection>

      <DocSection id="incident-management" title="Incident Management" icon={<AlertTriangle className="w-5 h-5" />}>
        <p>The incident management system tracks security incidents from detection through resolution, with automated enrichment and classification capabilities.</p>
        <h3 className="font-semibold mt-3">Incident Lifecycle</h3>
        <ol className="list-decimal pl-5 space-y-1">
          <li><strong>Detection:</strong> Security events trigger incident creation through SIGMA rule matching or manual escalation by analysts</li>
          <li><strong>Triage:</strong> Initial severity assessment and categorization by the SOC team</li>
          <li><strong>Investigation:</strong> Analysts gather evidence, correlate events, and enrich incidents with threat intelligence</li>
          <li><strong>Containment:</strong> Actions taken to limit the impact of confirmed threats</li>
          <li><strong>Resolution:</strong> Root cause determination and remediation steps documented</li>
          <li><strong>Closure:</strong> Final review, lessons learned, and incident report generation</li>
        </ol>
        <h3 className="font-semibold mt-3">Enrichment Pipeline</h3>
        <p>Incidents are automatically enriched with contextual data including IP geolocation, domain reputation, file hash lookups, user behavior analytics, and asset criticality scores. The enrichment pipeline runs asynchronously and updates incident records as data becomes available.</p>
        <h3 className="font-semibold mt-3">MITRE ATT&CK Mapping</h3>
        <p>Every incident is mapped to the MITRE ATT&CK framework using tactic and technique identifiers. This mapping provides standardized classification that enables cross-incident analysis and helps identify attack patterns across the kill chain. The platform supports the Enterprise ATT&CK matrix with tactics ranging from Initial Access (TA0001) through Impact (TA0040).</p>
        <h3 className="font-semibold mt-3">Classification</h3>
        <p>Incidents are classified by type (malware, phishing, unauthorized access, data exfiltration, etc.), severity (critical, high, medium, low, informational), and confidence level. AI-assisted classification uses natural language processing to analyze event descriptions and suggest appropriate categories.</p>
      </DocSection>

      <DocSection id="ai-soc-analyst" title="AI SOC Analyst" icon={<Brain className="w-5 h-5" />}>
        <p>The AI SOC Analyst is an intelligent investigation assistant powered by large language models. It analyzes security incidents, correlates evidence, and provides actionable investigation guidance.</p>
        <h3 className="font-semibold mt-3">Investigation Workflow</h3>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Select an incident or group of related events for AI analysis</li>
          <li>The AI analyst ingests all associated event data, enrichment results, and historical context</li>
          <li>A comprehensive investigation report is generated including timeline reconstruction, affected entity analysis, and threat assessment</li>
          <li>The analyst provides specific recommended actions with priority ranking</li>
          <li>Investigation results are attached to the incident record for audit trail purposes</li>
        </ol>
        <h3 className="font-semibold mt-3">Verdict System</h3>
        <p>The AI analyst produces verdicts for each investigation:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><Badge variant="destructive" className="text-xs">True Positive</Badge> Confirmed security threat requiring immediate action</li>
          <li><Badge variant="secondary" className="text-xs">Benign Positive</Badge> Legitimate activity that triggered detection rules</li>
          <li><Badge variant="outline" className="text-xs">False Positive</Badge> Incorrect detection due to rule tuning issues</li>
          <li><Badge variant="default" className="text-xs">Suspicious</Badge> Activity requiring further human investigation</li>
        </ul>
        <h3 className="font-semibold mt-3">Notifications</h3>
        <p>When an AI investigation completes, notifications are sent to the assigned analyst and SOC manager via the platform notification system. For critical verdicts, email notifications are also dispatched to the configured alert recipients for the tenant.</p>
      </DocSection>

      <DocSection id="report-generation" title="Report Generation" icon={<FileText className="w-5 h-5" />}>
        <p>The platform supports 13 distinct report types that can be generated on-demand or scheduled for automatic delivery.</p>
        <h3 className="font-semibold mt-3">Report Types</h3>
        <ol className="list-decimal pl-5 space-y-1 text-xs">
          <li>Monthly Security Summary - Executive overview of security posture and key metrics</li>
          <li>Incident Detail Report - Deep-dive analysis of individual security incidents</li>
          <li>Threat Landscape Report - Overview of detected threats mapped to MITRE ATT&CK</li>
          <li>Compliance Status Report - Current compliance posture against configured frameworks</li>
          <li>Asset Inventory Report - Complete listing of monitored assets with risk scores</li>
          <li>User Activity Report - User behavior analytics and access pattern summaries</li>
          <li>SLA Performance Report - Service level agreement compliance metrics</li>
          <li>Vulnerability Assessment Report - Known vulnerabilities and remediation priorities</li>
          <li>Risk Scoring Report - Entity risk scores with trend analysis</li>
          <li>Event Volume Report - Ingestion statistics and event source health</li>
          <li>Shift Handover Report - SOC shift transition summary with open items</li>
          <li>Cloud Security Report - Cloud infrastructure security findings</li>
          <li>Executive Dashboard Report - Board-level security summary with KPIs</li>
        </ol>
        <h3 className="font-semibold mt-3">PDF Output</h3>
        <p>All reports are generated as professionally formatted PDF documents with consistent branding, charts rendered as embedded images, and structured data tables. Reports include a cover page, table of contents, executive summary, detailed findings, and appendices where applicable.</p>
        <h3 className="font-semibold mt-3">Scheduling</h3>
        <p>Reports can be scheduled for automatic generation at daily, weekly, or monthly intervals. Scheduled reports are delivered via email to configured recipients and stored in the platform for historical access.</p>
      </DocSection>

      <DocSection id="shift-roster" title="Shift Roster Management" icon={<Clock className="w-5 h-5" />}>
        <p>The shift roster module manages SOC team schedules and ensures continuous coverage for security monitoring operations.</p>
        <h3 className="font-semibold mt-3">Team Types</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>MSS Team:</strong> Managed Security Service analysts responsible for ongoing monitoring and incident response. MSS teams operate in rotating shifts to provide 24/7 coverage.</li>
          <li><strong>Implementation Team:</strong> Engineers responsible for deploying and configuring security tools, onboarding new tenants, and maintaining integrations. Implementation teams typically follow business-hours schedules.</li>
        </ul>
        <h3 className="font-semibold mt-3">Shift Configuration</h3>
        <p>Shifts are defined with start time, end time, assigned personnel, and coverage type (primary or backup). The platform tracks shift handovers and generates handover reports that summarize open incidents, pending investigations, and items requiring follow-up from the incoming shift.</p>
      </DocSection>

      <DocSection id="knowledge-base" title="Knowledge Base" icon={<BookOpen className="w-5 h-5" />}>
        <p>The knowledge base provides a centralized repository for SOC procedures, investigation runbooks, and reference documentation.</p>
        <h3 className="font-semibold mt-3">Document Management</h3>
        <p>Documents are created and edited using a rich text editor with support for formatted text, code blocks, images, and hyperlinks. Each document has a title, category, tags, and author attribution. Version history is maintained for audit purposes.</p>
        <h3 className="font-semibold mt-3">Categories</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Standard Operating Procedures:</strong> Step-by-step instructions for common SOC tasks</li>
          <li><strong>Investigation Runbooks:</strong> Guided playbooks for specific incident types</li>
          <li><strong>Technical References:</strong> Documentation for tools, integrations, and platform features</li>
          <li><strong>Threat Intelligence:</strong> Threat actor profiles, IOC databases, and campaign tracking</li>
          <li><strong>Training Materials:</strong> Onboarding guides and skill development resources</li>
        </ul>
      </DocSection>

      <DocSection id="email-notifications" title="Email Notifications" icon={<Mail className="w-5 h-5" />}>
        <p>The platform sends automated email notifications for critical events including new incidents, investigation completions, report deliveries, and system alerts.</p>
        <h3 className="font-semibold mt-3">Provider Setup</h3>
        <p>Email delivery requires configuring an SMTP provider in the Admin Portal. Supported providers include SendGrid, Office 365, Google Workspace, and custom SMTP servers. See the API Integration Guide for detailed provider configuration steps.</p>
        <h3 className="font-semibold mt-3">Notification Templates</h3>
        <p>The platform uses pre-designed HTML email templates for each notification type. Templates include the SecureOps branding, incident details formatted in a readable layout, severity indicators with color coding, and direct links to the relevant platform pages.</p>
        <h3 className="font-semibold mt-3">Action Buttons</h3>
        <p>Email notifications include contextual action buttons that link directly to the relevant incident, report, or dashboard within the platform. Recipients can acknowledge incidents, view investigation results, or download reports with a single click from the email notification.</p>
      </DocSection>

      <DocSection id="timezone-configuration" title="Timezone Configuration" icon={<Globe className="w-5 h-5" />}>
        <p>Each tenant can be configured with its own timezone setting to ensure all date and time displays are presented in the customer's local time.</p>
        <h3 className="font-semibold mt-3">IANA Timezone Format</h3>
        <p>Timezones are specified using the IANA Time Zone Database format (e.g., "America/New_York", "Europe/London", "Asia/Kolkata"). This format accounts for daylight saving time transitions and historical timezone changes automatically.</p>
        <h3 className="font-semibold mt-3">Configuration</h3>
        <p>Set the tenant timezone in the Admin Portal under Tenant Settings. All timestamps in dashboards, incident reports, and exported data will be converted to the configured timezone. Internal storage always uses UTC to ensure consistency across multi-timezone deployments. The timezone setting affects dashboard chart labels, incident timestamps, report generation dates, and event log displays.</p>
      </DocSection>
    </div>
  );
}

function InstallationGuideContent() {
  return (
    <div className="space-y-4">
      <DocSection id="system-requirements" title="System Requirements" icon={<Server className="w-5 h-5" />}>
        <h3 className="font-semibold">Minimum Requirements</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Runtime:</strong> Node.js 18.0 or later (LTS recommended)</li>
          <li><strong>Database:</strong> PostgreSQL 14.0 or later</li>
          <li><strong>Memory:</strong> 4 GB RAM minimum (8 GB recommended for production)</li>
          <li><strong>Storage:</strong> 20 GB available disk space for application and database</li>
          <li><strong>CPU:</strong> 2 vCPUs minimum (4 vCPUs recommended for production)</li>
          <li><strong>OS:</strong> Linux (Ubuntu 22.04+, RHEL 8+), macOS 13+, or Windows Server 2019+</li>
        </ul>
        <h3 className="font-semibold mt-3">Recommended Production Specs</h3>
        <p>For deployments handling more than 10,000 events per day, scale to 8 GB RAM, 4 vCPUs, and use a managed PostgreSQL service with automated backups. Consider deploying behind a load balancer for high availability.</p>
      </DocSection>

      <DocSection id="environment-setup" title="Environment Setup" icon={<Download className="w-5 h-5" />}>
        <h3 className="font-semibold">Clone and Install</h3>
        <CodeBlock title="Terminal">{`# Clone the repository
git clone https://github.com/your-org/secureops.git
cd secureops

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env`}</CodeBlock>
        <h3 className="font-semibold mt-3">Development Mode</h3>
        <CodeBlock title="Terminal">{`# Start development server (frontend + backend)
npm run dev

# The application will be available at http://localhost:5000
# Hot module replacement is enabled for frontend changes
# Backend changes trigger automatic server restart`}</CodeBlock>
        <h3 className="font-semibold mt-3">Production Build</h3>
        <CodeBlock title="Terminal">{`# Build for production
npm run build

# Start production server
NODE_ENV=production npm start`}</CodeBlock>
      </DocSection>

      <DocSection id="database-setup" title="Database Setup" icon={<Database className="w-5 h-5" />}>
        <h3 className="font-semibold">PostgreSQL Configuration</h3>
        <CodeBlock title="Terminal">{`# Create the database
createdb secureops

# Or using psql
psql -U postgres -c "CREATE DATABASE secureops;"

# Verify connection
psql -U postgres -d secureops -c "SELECT version();"`}</CodeBlock>
        <h3 className="font-semibold mt-3">Running Migrations</h3>
        <CodeBlock title="Terminal">{`# Push schema changes to database (development)
npm run db:push

# Generate migration files (for version control)
npx drizzle-kit generate

# Apply migrations (production)
npx drizzle-kit migrate`}</CodeBlock>
        <p className="mt-2">The platform uses Drizzle ORM for database schema management. Schema definitions are located in <code className="text-xs bg-muted px-1 py-0.5 rounded">shared/schema.ts</code>. Always run <code className="text-xs bg-muted px-1 py-0.5 rounded">db:push</code> after modifying the schema during development.</p>
      </DocSection>

      <DocSection id="environment-variables" title="Environment Variables" icon={<Key className="w-5 h-5" />}>
        <p>The following environment variables must be configured before starting the application:</p>
        <div className="space-y-2">
          <div>
            <Badge variant="destructive" className="text-xs">Required</Badge>
            <CodeBlock>{`DATABASE_URL=postgresql://user:password@localhost:5432/secureops`}</CodeBlock>
            <p className="text-xs text-muted-foreground mt-1">PostgreSQL connection string. Supports SSL connections by appending <code>?sslmode=require</code>.</p>
          </div>
          <div>
            <Badge variant="destructive" className="text-xs">Required</Badge>
            <CodeBlock>{`SESSION_SECRET=your-random-secret-key-min-32-chars`}</CodeBlock>
            <p className="text-xs text-muted-foreground mt-1">Secret key for signing session cookies. Generate with: <code>openssl rand -hex 32</code></p>
          </div>
          <div>
            <Badge variant="secondary" className="text-xs">Optional</Badge>
            <CodeBlock>{`OPENAI_API_KEY=sk-...`}</CodeBlock>
            <p className="text-xs text-muted-foreground mt-1">OpenAI API key for the AI SOC Analyst feature. Required for AI-powered incident investigation and automated classification.</p>
          </div>
          <div>
            <Badge variant="secondary" className="text-xs">Optional</Badge>
            <CodeBlock>{`SMTP_HOST=smtp.provider.com
SMTP_PORT=587
SMTP_USER=notifications@yourdomain.com
SMTP_PASS=your-smtp-password
SMTP_FROM=SecureOps <notifications@yourdomain.com>`}</CodeBlock>
            <p className="text-xs text-muted-foreground mt-1">SMTP configuration for email notifications. See the API Integration Guide for provider-specific setup instructions.</p>
          </div>
        </div>
      </DocSection>

      <DocSection id="first-time-setup" title="First-Time Setup" icon={<Shield className="w-5 h-5" />}>
        <h3 className="font-semibold">Admin User Creation</h3>
        <p>On first launch, you need to create an initial platform administrator account. Access the application and use the superadmin portal to create the first admin user:</p>
        <CodeBlock title="Terminal">{`# Seed the database with initial data
npm run db:seed

# This creates:
# - Default platform_admin user (admin@secureops.local)
# - Initial tenant for testing
# - Sample security events for dashboard verification`}</CodeBlock>
        <h3 className="font-semibold mt-3">Initial Tenant Setup</h3>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Log in with the platform_admin credentials</li>
          <li>Navigate to Admin Portal from the sidebar</li>
          <li>Create your first customer tenant with name, contact email, and timezone</li>
          <li>Generate an API key for the tenant to enable event ingestion</li>
          <li>Create user accounts for MSS analysts assigned to the tenant</li>
          <li>Configure email notification settings for incident alerts</li>
        </ol>
      </DocSection>

      <DocSection id="docker-deployment" title="Docker Deployment" icon={<Server className="w-5 h-5" />}>
        <h3 className="font-semibold">Dockerfile</h3>
        <CodeBlock title="Dockerfile">{`FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 5000
CMD ["node", "dist/index.js"]`}</CodeBlock>
        <h3 className="font-semibold mt-3">Docker Compose</h3>
        <CodeBlock title="docker-compose.yml">{`version: "3.8"
services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - DATABASE_URL=postgresql://secureops:password@db:5432/secureops
      - SESSION_SECRET=\${SESSION_SECRET}
      - OPENAI_API_KEY=\${OPENAI_API_KEY}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: secureops
      POSTGRES_USER: secureops
      POSTGRES_PASSWORD: password
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U secureops"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:`}</CodeBlock>
        <CodeBlock title="Terminal">{`# Build and start
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop
docker-compose down`}</CodeBlock>
      </DocSection>

      <DocSection id="cloud-deployment" title="Cloud Deployment" icon={<Globe className="w-5 h-5" />}>
        <h3 className="font-semibold">AWS (ECS + RDS)</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Push the Docker image to Amazon ECR</li>
          <li>Create an RDS PostgreSQL 16 instance (db.t3.medium or larger)</li>
          <li>Create an ECS Fargate service with the container image</li>
          <li>Configure environment variables through ECS task definition secrets</li>
          <li>Set up an Application Load Balancer with HTTPS listener</li>
          <li>Configure a Route 53 DNS record pointing to the ALB</li>
        </ul>
        <h3 className="font-semibold mt-3">GCP (Cloud Run)</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Push the Docker image to Google Artifact Registry</li>
          <li>Create a Cloud SQL PostgreSQL instance</li>
          <li>Deploy to Cloud Run with the Cloud SQL connection configured</li>
          <li>Set environment variables through Cloud Run revision settings</li>
          <li>Map a custom domain with managed SSL certificate</li>
        </ul>
        <h3 className="font-semibold mt-3">Azure (App Service)</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Push the Docker image to Azure Container Registry</li>
          <li>Create an Azure Database for PostgreSQL Flexible Server</li>
          <li>Create an App Service with container deployment</li>
          <li>Configure environment variables in App Service Configuration</li>
          <li>Enable custom domain with managed SSL through App Service</li>
        </ul>
      </DocSection>

      <DocSection id="ssl-tls" title="SSL/TLS Configuration" icon={<Shield className="w-5 h-5" />}>
        <h3 className="font-semibold">Certificate Setup</h3>
        <p>For production deployments, always use TLS encryption. The recommended approach is to terminate SSL at a reverse proxy (Nginx, Caddy, or cloud load balancer) rather than in the Node.js application directly.</p>
        <h3 className="font-semibold mt-3">Nginx Reverse Proxy</h3>
        <CodeBlock title="nginx.conf">{`server {
    listen 443 ssl http2;
    server_name secureops.yourdomain.com;

    ssl_certificate /etc/ssl/certs/secureops.crt;
    ssl_certificate_key /etc/ssl/private/secureops.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}`}</CodeBlock>
        <h3 className="font-semibold mt-3">Let's Encrypt (Certbot)</h3>
        <CodeBlock title="Terminal">{`# Install certbot
sudo apt install certbot python3-certbot-nginx

# Obtain and configure certificate
sudo certbot --nginx -d secureops.yourdomain.com

# Auto-renewal is configured automatically
sudo certbot renew --dry-run`}</CodeBlock>
      </DocSection>

      <DocSection id="backup-recovery" title="Backup & Recovery" icon={<Database className="w-5 h-5" />}>
        <h3 className="font-semibold">Database Backup</h3>
        <CodeBlock title="Terminal">{`# Full database backup
pg_dump -U secureops -h localhost -d secureops \\
  --format=custom --compress=9 \\
  -f backup_$(date +%Y%m%d_%H%M%S).dump

# Backup specific tables
pg_dump -U secureops -d secureops \\
  -t incidents -t security_events -t tenants \\
  --format=custom -f partial_backup.dump

# Automated daily backup (add to crontab)
# 0 2 * * * /usr/local/bin/backup-secureops.sh`}</CodeBlock>
        <h3 className="font-semibold mt-3">Restore Procedures</h3>
        <CodeBlock title="Terminal">{`# Restore from backup
pg_restore -U secureops -h localhost -d secureops \\
  --clean --if-exists backup_20240101_020000.dump

# Restore to a new database
createdb secureops_restored
pg_restore -U secureops -d secureops_restored backup.dump

# Verify restore integrity
psql -U secureops -d secureops_restored \\
  -c "SELECT COUNT(*) FROM incidents;"
psql -U secureops -d secureops_restored \\
  -c "SELECT COUNT(*) FROM security_events;"`}</CodeBlock>
        <h3 className="font-semibold mt-3">Best Practices</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Schedule automated backups at least once daily during low-traffic hours</li>
          <li>Store backups in a separate geographic region from your primary database</li>
          <li>Test restore procedures monthly to verify backup integrity</li>
          <li>Retain daily backups for 30 days, weekly backups for 90 days, and monthly backups for 1 year</li>
          <li>Encrypt backup files at rest using AES-256 encryption</li>
        </ul>
      </DocSection>
    </div>
  );
}

function APIIntegrationGuideContent() {
  return (
    <div className="space-y-4">
      <DocSection id="authentication" title="Authentication" icon={<Key className="w-5 h-5" />}>
        <p>The platform supports two authentication methods for API access: session-based authentication for browser clients and API key authentication for programmatic integrations.</p>
        <h3 className="font-semibold mt-3">Session Authentication</h3>
        <CodeBlock title="Login Request">{`POST /api/auth/login
Content-Type: application/json

{
  "email": "analyst@example.com",
  "password": "your-password"
}

# Response: Set-Cookie header with session token
# Include credentials in subsequent requests`}</CodeBlock>
        <h3 className="font-semibold mt-3">API Key Authentication</h3>
        <p>API keys are generated per tenant in the Admin Portal. Use the Bearer token scheme in the Authorization header:</p>
        <CodeBlock title="API Key Usage">{`GET /api/v1/incidents?tenantId=tenant-123
Authorization: Bearer sk_live_abc123def456ghi789
Content-Type: application/json`}</CodeBlock>
        <h3 className="font-semibold mt-3">Key Management</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>API keys are scoped to a single tenant and cannot access cross-tenant data</li>
          <li>Keys can be rotated without downtime by generating a new key before revoking the old one</li>
          <li>All API key usage is logged for audit purposes with source IP, timestamp, and endpoint accessed</li>
        </ul>
      </DocSection>

      <DocSection id="push-api" title="Push API" icon={<Server className="w-5 h-5" />}>
        <p>The Push API enables external systems to send security events directly to the SecureOps platform. Events are validated, normalized, and processed through the ingestion pipeline.</p>
        <h3 className="font-semibold mt-3">Endpoint</h3>
        <CodeBlock title="Push API">{`POST /api/v1/ingest/:tenantId
Authorization: Bearer sk_live_your_api_key
Content-Type: application/json

{
  "events": [
    {
      "source": "crowdstrike",
      "eventType": "malware_detected",
      "severity": "critical",
      "timestamp": "2024-01-15T14:30:00Z",
      "sourceIp": "192.168.1.100",
      "destinationIp": "10.0.0.50",
      "userName": "jdoe",
      "hostName": "WS-FINANCE-042",
      "description": "Malicious executable detected and quarantined",
      "rawData": { ... }
    }
  ]
}

# Response
{
  "status": "accepted",
  "eventsReceived": 1,
  "eventsProcessed": 1,
  "batchId": "batch_abc123"
}`}</CodeBlock>
        <h3 className="font-semibold mt-3">Batch Ingestion</h3>
        <p>The Push API accepts up to 1,000 events per request. For high-volume sources, implement client-side batching with a flush interval of 10-30 seconds. Each batch receives a unique <code className="text-xs bg-muted px-1 py-0.5 rounded">batchId</code> for tracking through the processing pipeline.</p>
      </DocSection>

      <DocSection id="security-event-types" title="Security Event Types" icon={<AlertTriangle className="w-5 h-5" />}>
        <p>The platform recognizes 10 standard security event types. Each type has specific fields and classification logic:</p>
        <div className="space-y-3">
          <div>
            <Badge variant="destructive" className="text-xs">1. Malware Detection</Badge>
            <CodeBlock>{`{
  "eventType": "malware_detected",
  "severity": "critical",
  "hostName": "WS-FINANCE-042",
  "fileName": "invoice_q4.exe",
  "filePath": "C:\\Users\\jdoe\\Downloads\\",
  "fileHash": "a1b2c3d4e5f6...",
  "malwareFamily": "Emotet",
  "action": "quarantined"
}`}</CodeBlock>
          </div>
          <div>
            <Badge variant="destructive" className="text-xs">2. Intrusion Attempt</Badge>
            <CodeBlock>{`{
  "eventType": "intrusion_attempt",
  "severity": "high",
  "sourceIp": "203.0.113.50",
  "destinationIp": "10.0.1.100",
  "destinationPort": 445,
  "protocol": "TCP",
  "signature": "ET EXPLOIT MS17-010",
  "action": "blocked"
}`}</CodeBlock>
          </div>
          <div>
            <Badge variant="secondary" className="text-xs">3. Authentication Failure</Badge>
            <CodeBlock>{`{
  "eventType": "auth_failure",
  "severity": "medium",
  "userName": "admin",
  "sourceIp": "198.51.100.25",
  "authMethod": "password",
  "failureReason": "invalid_credentials",
  "attemptCount": 15,
  "targetService": "VPN Gateway"
}`}</CodeBlock>
          </div>
          <div>
            <Badge variant="secondary" className="text-xs">4. Policy Violation</Badge>
            <CodeBlock>{`{
  "eventType": "policy_violation",
  "severity": "medium",
  "userName": "jsmith",
  "policyName": "DLP-CreditCard",
  "action": "blocked",
  "destination": "personal-email.com",
  "dataClassification": "PCI-DSS"
}`}</CodeBlock>
          </div>
          <div>
            <Badge variant="secondary" className="text-xs">5. Anomalous Behavior</Badge>
            <CodeBlock>{`{
  "eventType": "anomalous_behavior",
  "severity": "medium",
  "userName": "contractor_01",
  "behaviorType": "unusual_access_time",
  "baselineDeviation": 3.2,
  "details": "Access at 03:15 UTC, normal hours 08:00-18:00"
}`}</CodeBlock>
          </div>
          <div>
            <Badge variant="outline" className="text-xs">6. Vulnerability Found</Badge>
            <CodeBlock>{`{
  "eventType": "vulnerability_found",
  "severity": "high",
  "hostName": "SRV-WEB-01",
  "cveId": "CVE-2024-1234",
  "cvssScore": 9.1,
  "affectedSoftware": "Apache HTTP Server 2.4.49",
  "remediation": "Upgrade to 2.4.54+"
}`}</CodeBlock>
          </div>
          <div>
            <Badge variant="outline" className="text-xs">7. Data Exfiltration</Badge>
            <CodeBlock>{`{
  "eventType": "data_exfiltration",
  "severity": "critical",
  "sourceIp": "10.0.5.22",
  "destinationIp": "185.220.101.1",
  "bytesTransferred": 524288000,
  "protocol": "HTTPS",
  "userName": "svc_backup"
}`}</CodeBlock>
          </div>
          <div>
            <Badge variant="outline" className="text-xs">8. Phishing Attempt</Badge>
            <CodeBlock>{`{
  "eventType": "phishing_attempt",
  "severity": "high",
  "recipientEmail": "cfo@company.com",
  "senderEmail": "ceo@c0mpany.com",
  "subject": "Urgent Wire Transfer Required",
  "action": "quarantined",
  "indicators": ["spoofed_domain", "urgency_language"]
}`}</CodeBlock>
          </div>
          <div>
            <Badge variant="outline" className="text-xs">9. Privilege Escalation</Badge>
            <CodeBlock>{`{
  "eventType": "privilege_escalation",
  "severity": "critical",
  "userName": "temp_user_42",
  "previousRole": "standard_user",
  "newRole": "domain_admin",
  "method": "group_policy_modification",
  "hostName": "DC-PRIMARY"
}`}</CodeBlock>
          </div>
          <div>
            <Badge variant="outline" className="text-xs">10. Cloud Security Event</Badge>
            <CodeBlock>{`{
  "eventType": "cloud_security",
  "severity": "high",
  "cloudProvider": "AWS",
  "service": "S3",
  "action": "PutBucketPolicy",
  "resourceArn": "arn:aws:s3:::sensitive-data-bucket",
  "effect": "public_access_granted",
  "actorIdentity": "arn:aws:iam::123456789:user/dev-intern"
}`}</CodeBlock>
          </div>
        </div>
      </DocSection>

      <DocSection id="incident-apis" title="Incident APIs" icon={<AlertTriangle className="w-5 h-5" />}>
        <h3 className="font-semibold">List Incidents</h3>
        <CodeBlock>{`GET /api/incidents?tenantId=tenant-123&status=open&severity=critical
Authorization: Bearer sk_live_your_api_key

# Response
{
  "incidents": [
    {
      "id": 1,
      "title": "Brute Force Attack Detected",
      "severity": "critical",
      "status": "investigating",
      "assignee": "analyst@example.com",
      "createdAt": "2024-01-15T14:30:00Z",
      "mitreTactic": "TA0006",
      "mitreTechnique": "T1110"
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 20
}`}</CodeBlock>
        <h3 className="font-semibold mt-3">Get Incident Detail</h3>
        <CodeBlock>{`GET /api/incidents/:id
Authorization: Bearer sk_live_your_api_key`}</CodeBlock>
        <h3 className="font-semibold mt-3">Update Incident</h3>
        <CodeBlock>{`PATCH /api/incidents/:id
Authorization: Bearer sk_live_your_api_key
Content-Type: application/json

{
  "status": "resolved",
  "resolution": "False positive - legitimate admin activity",
  "closedBy": "analyst@example.com"
}`}</CodeBlock>
        <h3 className="font-semibold mt-3">Trigger Enrichment</h3>
        <CodeBlock>{`POST /api/incidents/:id/enrich
Authorization: Bearer sk_live_your_api_key

# Triggers async enrichment pipeline:
# - IP geolocation lookup
# - Domain reputation check
# - File hash analysis
# - User behavior context
# - Asset criticality scoring`}</CodeBlock>
      </DocSection>

      <DocSection id="email-provider-setup" title="Email Provider Setup" icon={<Mail className="w-5 h-5" />}>
        <h3 className="font-semibold">SendGrid</h3>
        <p>SendGrid is the recommended email provider for high-volume notification delivery.</p>
        <CodeBlock title="SendGrid Configuration">{`SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.your-sendgrid-api-key
SMTP_FROM=SecureOps <alerts@yourdomain.com>

# Generate API key:
# 1. Log in to SendGrid Dashboard
# 2. Navigate to Settings > API Keys
# 3. Click "Create API Key"
# 4. Select "Restricted Access" with Mail Send permissions
# 5. Copy the generated key (shown only once)

# Webhook setup for delivery tracking:
# Settings > Mail Settings > Event Webhooks
# POST URL: https://secureops.yourdomain.com/api/webhooks/sendgrid`}</CodeBlock>

        <h3 className="font-semibold mt-3">Office 365</h3>
        <p>Use an App Password for Office 365 SMTP relay when MFA is enabled on the sending account.</p>
        <CodeBlock title="Office 365 Configuration">{`SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=notifications@yourdomain.com
SMTP_PASS=your-app-password
SMTP_FROM=SecureOps <notifications@yourdomain.com>

# App Password creation:
# 1. Sign in to https://myaccount.microsoft.com
# 2. Navigate to Security > Additional security verification
# 3. Click "Create a new app password"
# 4. Name it "SecureOps Notifications"
# 5. Copy the generated 16-character password
# 6. Use this password as SMTP_PASS (not the account password)`}</CodeBlock>

        <h3 className="font-semibold mt-3">Google Workspace</h3>
        <p>Gmail SMTP requires an App Password when 2-Step Verification is enabled.</p>
        <CodeBlock title="Google Workspace Configuration">{`SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=notifications@yourdomain.com
SMTP_PASS=your-16-char-app-password
SMTP_FROM=SecureOps <notifications@yourdomain.com>

# App Password creation:
# 1. Go to https://myaccount.google.com/security
# 2. Enable 2-Step Verification if not already enabled
# 3. Go to App passwords (under "Signing in to Google")
# 4. Select "Mail" as the app and your device type
# 5. Click "Generate" and copy the 16-character password
# 6. Use this as SMTP_PASS`}</CodeBlock>

        <h3 className="font-semibold mt-3">Custom SMTP</h3>
        <CodeBlock title="Custom SMTP Configuration">{`SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_USER=secureops@yourdomain.com
SMTP_PASS=your-smtp-password
SMTP_FROM=SecureOps <secureops@yourdomain.com>
SMTP_TLS=true

# For non-TLS connections (not recommended):
# SMTP_PORT=25
# SMTP_TLS=false

# For implicit TLS (SMTPS):
# SMTP_PORT=465
# SMTP_SECURE=true`}</CodeBlock>
      </DocSection>

      <DocSection id="webhook-endpoints" title="Webhook Endpoints" icon={<Webhook className="w-5 h-5" />}>
        <p>Configure webhook endpoints to receive real-time notifications when events occur in the platform. Webhooks deliver HTTP POST requests with JSON payloads to your specified URL.</p>
        <h3 className="font-semibold mt-3">Webhook Events</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><code className="text-xs bg-muted px-1 py-0.5 rounded">incident.created</code> - New incident created from detection rules</li>
          <li><code className="text-xs bg-muted px-1 py-0.5 rounded">incident.updated</code> - Incident status, severity, or assignment changed</li>
          <li><code className="text-xs bg-muted px-1 py-0.5 rounded">incident.resolved</code> - Incident marked as resolved</li>
          <li><code className="text-xs bg-muted px-1 py-0.5 rounded">investigation.completed</code> - AI investigation analysis finished</li>
          <li><code className="text-xs bg-muted px-1 py-0.5 rounded">report.generated</code> - Scheduled or on-demand report ready</li>
          <li><code className="text-xs bg-muted px-1 py-0.5 rounded">alert.critical</code> - Critical severity event detected</li>
        </ul>
        <h3 className="font-semibold mt-3">Webhook Payload</h3>
        <CodeBlock title="Webhook POST Body">{`{
  "event": "incident.created",
  "timestamp": "2024-01-15T14:30:00Z",
  "tenantId": "tenant-123",
  "data": {
    "incidentId": 456,
    "title": "Brute Force Attack Detected",
    "severity": "critical",
    "source": "sigma_rule",
    "affectedAssets": ["SRV-AUTH-01"]
  },
  "signature": "sha256=abc123..."
}

# Verify webhook signature:
# HMAC-SHA256(webhook_secret, request_body) === signature`}</CodeBlock>
      </DocSection>

      <DocSection id="rate-limits" title="Rate Limits" icon={<Gauge className="w-5 h-5" />}>
        <p>API rate limits are enforced per tenant to ensure fair usage and platform stability.</p>
        <div className="space-y-2">
          <h3 className="font-semibold">Limits</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>General API:</strong> 100 requests per minute per tenant</li>
            <li><strong>Push API (Ingestion):</strong> 50 requests per minute per tenant, up to 1,000 events per request</li>
            <li><strong>Report Generation:</strong> 10 requests per hour per tenant</li>
            <li><strong>AI Investigation:</strong> 20 requests per hour per tenant</li>
          </ul>
          <h3 className="font-semibold mt-3">Rate Limit Headers</h3>
          <CodeBlock>{`X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1705334400

# When rate limited, the API returns:
# HTTP 429 Too Many Requests
{
  "error": "rate_limit_exceeded",
  "message": "Rate limit of 100 requests per minute exceeded",
  "retryAfter": 23
}`}</CodeBlock>
          <h3 className="font-semibold mt-3">Best Practices</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Implement exponential backoff when receiving 429 responses</li>
            <li>Batch security events into groups of 100-500 per request to maximize throughput</li>
            <li>Cache API responses on the client side when data freshness permits</li>
            <li>Monitor the <code className="text-xs bg-muted px-1 py-0.5 rounded">X-RateLimit-Remaining</code> header to proactively throttle requests</li>
          </ul>
        </div>
      </DocSection>

      <DocSection id="connector-development" title="Connector Development" icon={<Plug className="w-5 h-5" />}>
        <p>Custom connectors enable integration with security tools not natively supported by the platform. Connectors extend the <code className="text-xs bg-muted px-1 py-0.5 rounded">BaseConnector</code> interface and implement standardized methods for event collection.</p>
        <h3 className="font-semibold mt-3">Base Connector Interface</h3>
        <CodeBlock title="server/connectors/base-connector.ts">{`export interface BaseConnector {
  name: string;
  version: string;
  supportedEventTypes: string[];

  initialize(config: ConnectorConfig): Promise<void>;
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  fetchEvents(since: Date): Promise<NormalizedEvent[]>;
  healthCheck(): Promise<ConnectorHealth>;
}

export interface ConnectorConfig {
  apiUrl: string;
  apiKey: string;
  tenantId: string;
  pollingInterval: number; // seconds
  customFields?: Record<string, string>;
}

export interface NormalizedEvent {
  source: string;
  eventType: string;
  severity: "critical" | "high" | "medium" | "low" | "informational";
  timestamp: string;
  sourceIp?: string;
  destinationIp?: string;
  userName?: string;
  hostName?: string;
  description: string;
  rawData: Record<string, unknown>;
}`}</CodeBlock>
        <h3 className="font-semibold mt-3">Creating a Custom Connector</h3>
        <CodeBlock title="server/connectors/my-siem.ts">{`import type { BaseConnector, ConnectorConfig, NormalizedEvent } from "./base-connector";

export class MySIEMConnector implements BaseConnector {
  name = "My SIEM";
  version = "1.0.0";
  supportedEventTypes = ["malware_detected", "intrusion_attempt", "auth_failure"];

  private config!: ConnectorConfig;
  private client: any;

  async initialize(config: ConnectorConfig): Promise<void> {
    this.config = config;
    // Initialize API client with credentials
  }

  async connect(): Promise<boolean> {
    // Verify API connectivity and authentication
    const response = await fetch(this.config.apiUrl + "/health", {
      headers: { "Authorization": "Bearer " + this.config.apiKey }
    });
    return response.ok;
  }

  async disconnect(): Promise<void> {
    // Clean up connections
  }

  async fetchEvents(since: Date): Promise<NormalizedEvent[]> {
    // Fetch and normalize events from the source
    const raw = await this.client.getAlerts({ since: since.toISOString() });
    return raw.map((alert: any) => ({
      source: this.name,
      eventType: this.mapEventType(alert.category),
      severity: this.mapSeverity(alert.priority),
      timestamp: alert.timestamp,
      sourceIp: alert.src_ip,
      userName: alert.user,
      hostName: alert.hostname,
      description: alert.message,
      rawData: alert
    }));
  }

  async healthCheck() {
    return { status: "healthy", lastCheck: new Date().toISOString() };
  }
}`}</CodeBlock>
      </DocSection>
    </div>
  );
}

export default function DocumentationPage() {
  const [activeTab, setActiveTab] = useState("admin");

  const currentSections = activeTab === "admin" ? adminSections : activeTab === "install" ? installSections : apiSections;

  return (
    <div className="h-full flex flex-col" data-testid="page-documentation">
      <div className="border-b px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight" data-testid="text-documentation-title">Platform Documentation</h1>
            <p className="text-sm text-muted-foreground">Comprehensive guides for administrators, deployment, and API integration</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="border-b px-6 shrink-0">
          <TabsList className="h-10" data-testid="tabs-documentation">
            <TabsTrigger value="admin" data-testid="tab-admin-guide">Admin Guide</TabsTrigger>
            <TabsTrigger value="install" data-testid="tab-installation-guide">Installation Guide</TabsTrigger>
            <TabsTrigger value="api" data-testid="tab-api-guide">API Integration Guide</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 flex min-h-0">
          <aside className="hidden lg:block w-56 border-r shrink-0">
            <ScrollArea className="h-full p-3">
              <TableOfContents sections={currentSections} onNavigate={scrollToSection} />
            </ScrollArea>
          </aside>

          <div className="flex-1 min-w-0">
            <ScrollArea className="h-full">
              <div className="max-w-4xl mx-auto p-6 space-y-4">
                <TabsContent value="admin" className="mt-0 space-y-4" data-testid="content-admin-guide">
                  <AdminGuideContent />
                </TabsContent>
                <TabsContent value="install" className="mt-0 space-y-4" data-testid="content-installation-guide">
                  <InstallationGuideContent />
                </TabsContent>
                <TabsContent value="api" className="mt-0 space-y-4" data-testid="content-api-guide">
                  <APIIntegrationGuideContent />
                </TabsContent>
              </div>
            </ScrollArea>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
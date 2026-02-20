# SecureOps - MSSP Reporting Platform

## Overview
Multi-level multi-tenant MSSP (Managed Security Service Provider) platform for managing security operations across client organizations. Features hierarchical tenant architecture (MSSP → Customers), incident orchestration, AI-powered report generation, support ticketing, project management with Kanban boards, and enterprise-grade CISO-level security dashboards.

## Architecture
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + Recharts + wouter routing
- **Backend**: Express.js with session-based auth (Replit Auth)
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **AI**: OpenAI via Replit AI Integrations for report generation
- **Auth**: Replit OIDC Auth with role-based access control

## Key Files
- `shared/schema.ts` - Database schema (tenants with hierarchy, incidents, tickets, projects, tasks, reports, security_events)
- `server/routes.ts` - API routes with tenant access control middleware
- `server/storage.ts` - Database storage layer (IStorage interface) with enhanced dashboard stats
- `server/seed.ts` - Seed data: 3 MSSPs, 7 customer orgs, 680+ security events across 10 event types
- `client/src/App.tsx` - Main app with routing and auth flow
- `client/src/components/app-sidebar.tsx` - Sidebar navigation with hierarchical tenant selector
- `client/src/lib/tenant-context.tsx` - Multi-tenant context provider with hierarchy support
- `client/src/pages/dashboard.tsx` - CISO-grade dashboard with 8 tabs (SOC, Threats, Email, Endpoint, Cloud/WAF, Network/Identity, Logs, Vulnerabilities)
- `client/src/pages/reports.tsx` - AI-powered report generation with 8 report types and file download
- `client/src/pages/import.tsx` - Data import (CSV/Excel/PDF) with drag-and-drop

## Security Events Architecture
10 event types: email, endpoint, vulnerability, casb, waf, dlp, sse, network, identity, cloud
Enriched metadata: threatVector, mitreTactic, mitreTechnique, action, sourceType, logSource, sender, recipient, protocol, country, riskScore
Log sources: CrowdStrike, Palo Alto, SentinelOne, Netskope, Proofpoint, Microsoft Defender, Splunk, QRadar, etc.

## Dashboard Tabs
1. **SOC Overview** - Risk/compliance gauges, incident trends, severity breakdown, recent incidents
2. **Threat Intel** - MITRE ATT&CK radar, threat vectors, top threats/targets/attackers, attack origins
3. **Email Security** - Email threats, top senders/recipients, action distribution, threat vectors
4. **Endpoint** - Malware families, infected hosts, EDR actions, threat vector icons
5. **Cloud & WAF** - WAF attacks, CASB shadow IT apps, DLP violations, cloud misconfigs
6. **Network & Identity** - Network threats, identity attacks, protocols, geographic origins
7. **Log Sources** - Event ingestion trends, log source health, source type distribution, EPS
8. **Vulnerabilities** - Vulnerable apps, severity distribution, event severity

## Report Types
executive_summary, endpoint, email, vulnerability, compliance, threat_intelligence, incident_response, cloud_security

## Multi-Level Tenant Hierarchy
MSSPs (top-level service providers):
1. **Vinca Cyber** (Cybersecurity) → Fedfina, P99 Software, Nineleaves, Maantic Global, Claim Power
2. **Cibervest** (Financial Services) → PKF Africa
3. **HitaskIT** (Technology) → RTIX Surgical

Tenants table has `type` field (mssp/customer) and `parentId` (nullable, references parent MSSP).
Security events are seeded for customer tenants only (MSSPs have incidents but no security events).

## Roles
- `mss_admin` - Full platform access, can manage MSSP and all child customer tenants
- `mss_analyst` - Operational access to incidents, tickets, projects, reports within MSSP scope
- `customer` - Dashboard-only view with ticket submission, limited to own tenant

## API Routes
- `GET /api/tenants` - List accessible tenants (MSSP + children for MSS users)
- `GET /api/tenants/hierarchy` - Hierarchical tenant structure [{mssp, children: [...]}]
- `GET /api/user/profile` - User role and tenant info
- `GET /api/dashboard/:tenantId` - Enhanced dashboard statistics with all event breakdowns
- `GET/POST/PATCH /api/incidents` - Incident CRUD (MSS role required for create/update)
- `GET/POST/PATCH /api/tickets` - Ticket CRUD
- `GET/POST/PATCH /api/projects` - Project CRUD (MSS role required)
- `GET/POST/PATCH /api/tasks` - Task CRUD (MSS role required)
- `GET /api/reports/:tenantId` - List reports
- `POST /api/reports/generate` - AI-powered report generation (MSS role required)
- `POST /api/import` - File import (CSV/Excel/PDF)
- `GET /api/reports/download/:id` - Download report file

## Access Control
- MSS users can access their MSSP and all child customer tenants
- Customer users can only access their own tenant
- Tenant access validated server-side via assertTenantAccess middleware
- Input validation via Zod schemas on all create/update endpoints

## Running
Workflow "Start application" runs `npm run dev` which starts Express + Vite on port 5000.

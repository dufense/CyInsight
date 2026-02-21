# SecureOps - MSSP Reporting Platform

## Overview
Multi-level multi-tenant MSSP (Managed Security Service Provider) platform for managing security operations across client organizations. Features hierarchical tenant architecture (MSSP → Customers), incident orchestration, AI-powered report generation, support ticketing with SLA tracking and AI-powered suggestions, project management with Kanban boards and AI risk assessment/task breakdown, Knowledge Base with document management (8 categories), enterprise-grade CISO-level security dashboards, Solutions & Services management with MSA/SLA tracking, shift roster management for Implementation and MSS teams, and automated project reporting.

## Architecture
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + Recharts + wouter routing
- **Backend**: Express.js with session-based auth (Replit Auth)
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **AI**: OpenAI via Replit AI Integrations for report generation, ticket suggestions, project risk assessment, task breakdown, document content generation
- **Auth**: Replit OIDC Auth with role-based access control

## Key Files
- `shared/schema.ts` - Database schema (tenants, incidents, tickets, projects, tasks, reports, security_events, services, sla_definitions, team_members, shift_rosters, documents, ticket_feedback, ticket_attachments, superadmins, licenses)
- `server/routes.ts` - API routes with tenant access control middleware
- `server/storage.ts` - Database storage layer (IStorage interface) with CRUD for all entities
- `server/seed.ts` - Disabled (production-ready, no seed data)
- `client/src/App.tsx` - Main app with routing and auth flow
- `client/src/components/app-sidebar.tsx` - Sidebar navigation with hierarchical tenant selector and role-based menu
- `client/src/lib/tenant-context.tsx` - Multi-tenant context provider with hierarchy support, isMSS, isAdmin flags
- `client/src/pages/dashboard.tsx` - CISO-grade dashboard with 8 tabs
- `client/src/pages/tickets.tsx` - Ticketing with SLA indicators, activity dashboard, detail dialog with comments/attachments/feedback
- `client/src/pages/projects.tsx` - Project management with activity dashboard, report generation, read-only mode for customers
- `client/src/pages/knowledge-base.tsx` - Knowledge Base with document management and AI content generation
- `client/src/pages/services.tsx` - Solutions & Services management with SLA tracking
- `client/src/pages/shift-roster.tsx` - Shift roster management for Implementation and MSS teams
- `client/src/pages/reports.tsx` - AI-powered report generation with 8 report types
- `client/src/pages/import.tsx` - Data import (CSV/Excel/PDF)
- `client/src/pages/admin-center.tsx` - Admin Center for tenant user management (create/edit/delete users with role assignment)

## Security Events Architecture
10 event types: email, endpoint, vulnerability, casb, waf, dlp, sse, network, identity, cloud
Enriched metadata: threatVector, mitreTactic, mitreTechnique, action, sourceType, logSource, sender, recipient, protocol, country, riskScore

## Dashboard Tabs
1. **SOC Overview** - Risk/compliance gauges, incident trends, severity breakdown, recent incidents
2. **Threat Intel** - MITRE ATT&CK radar, threat vectors, top threats/targets/attackers, attack origins
3. **Email Security** - Email threats, top senders/recipients, action distribution, threat vectors
4. **Endpoint** - Malware families, infected hosts, EDR actions, threat vector icons
5. **Cloud & WAF** - WAF attacks, CASB shadow IT apps, DLP violations, cloud misconfigs
6. **Network & Identity** - Network threats, identity attacks, protocols, geographic origins
7. **Log Sources** - Event ingestion trends, log source health, source type distribution, EPS
8. **Vulnerabilities** - Vulnerable apps, severity distribution, event severity

## New Features (Feb 2026)
### Solutions & Services Management
- Service definitions with MSA tracking (start/end dates, contract value)
- SLA definitions per service (response time, resolution time, uptime targets)
- SLA Dashboard with compliance indicators (green/yellow/red)
- Service types: managed_soc, vulnerability_management, email_security, endpoint_protection, cloud_security, compliance_advisory, incident_response, penetration_testing

### Shift Roster Management
- Two team types: Implementation (Ticketing & Projects) and MSS (Incidents & Dashboards)
- Team member management with active/inactive status
- Shift scheduling: day, night, swing, on-call shifts
- Visual shift type indicators with color coding

### Enhanced Ticketing
- Activity dashboard with stats (total, open, in progress, waiting, resolved)
- SLA compliance indicator with visual percentage
- Priority distribution donut chart
- Service linkage for SLA tracking
- SLA breach indicators on ticket cards
- Service filter dropdown

### Enhanced Project Management
- Activity dashboard with cross-project stats
- Per-project progress bars (tasks done/total)
- AI-powered report generation (Daily Project Status, Weekly Project Summary)
- Enhanced task cards with assignee, due dates, overdue indicators

### Multi-Role Assignment & Role Switcher
- Users can be assigned multiple roles via Admin Center (assignedRoles array in tenant_users)
- Role switcher visible to any user with 2+ assigned roles (plus platform_admin/superadmin)
- Users with multiple roles see only their assigned roles in the switcher
- Platform admin and superadmin see all 8 roles
- Dropdown in top-right header showing current role with icon + checkmark for active
- Actually updates the user's active role in the database via PUT /api/user/role
- All cached queries cleared on role switch for immediate UI update
- Tenant context resets currentTenant if it becomes invalid after role change

### Role-Based Navigation
- Security Analyst: Dashboard, Incidents, Tickets, Shift Roster, Knowledge Base, Reports, Import (NO Projects, NO Services, NO Admin Center)
- Security Engineer: Dashboard, Incidents, Tickets, Projects, Knowledge Base, Services, Shift Roster, Reports, Import
- Service Desk: Dashboard, Tickets, Projects, Knowledge Base, Services, Reports, Import
- Customer: Dashboard, Tickets, Projects, Knowledge Base
- Admin roles (platform_admin, mss_admin, soc_manager): Full access including Admin Center

### Superadmin & Tenant Administration
- Standalone superadmin login (username/password: admin/Admin@123)
- Dedicated Tenant Admin page with 4 tabs:
  - Platform Overview: Stats cards (tenants, users, licenses) + MSSP hierarchy view
  - Tenants: Full CRUD for MSSP and customer tenants with search/filter
  - Tenant Users: User management with role assignment across tenants
  - License Management: License CRUD with type, status, dates, user/endpoint limits
- Accessible to both superadmin and platform_admin users
- Superadmin auth uses bcrypt-hashed password with session-based auth

## Database Tables
- `superadmins` - Superadmin credentials (username, password_hash, display_name)
- `licenses` - Tenant license management (tenant_id, license_type, max_users, status, dates)
- `tenants` - Organizations (MSSP/customer hierarchy)
- `tenant_users` - User-tenant-role mappings
- `incidents` - Security incidents
- `tickets` - Support tickets with SLA fields (serviceId, firstResponseAt, slaBreached)
- `ticket_comments` - Ticket discussion threads
- `projects` - Project management
- `tasks` - Kanban tasks with assignee and due dates
- `reports` - Generated reports
- `security_events` - Security event telemetry
- `services` - Solutions & services with MSA tracking
- `sla_definitions` - SLA targets per service per priority
- `team_members` - Team member profiles (implementation/mss teams)
- `shift_rosters` - Shift schedule entries
- `documents` - Knowledge Base documents with categories and visibility controls

## Report Types
executive_summary, endpoint, email, vulnerability, compliance, threat_intelligence, incident_response, cloud_security

## Multi-Level Tenant Hierarchy
Tenants table has `type` field (mssp/customer) and `parentId` (nullable, references parent MSSP).
First user auto-provisions as platform_admin with auto-created MSSP tenant.
Customer tenants can be created via POST /api/tenants by MSS admins.

## Roles
- `platform_admin` - Super-admin with full visibility across ALL MSSPs and their customers, can create MSSP tenants
- `mss_admin` - Full platform access, can manage MSSP and all child customer tenants
- `mss_analyst` - Operational access to incidents, tickets, projects, reports within MSSP scope
- `customer` - Dashboard-only view with ticket submission, limited to own tenant

## API Routes
### Superadmin Auth
- `POST /api/superadmin/login` - Superadmin login (username/password)
- `GET /api/superadmin/session` - Check superadmin session
- `POST /api/superadmin/logout` - Superadmin logout
### Tenant Admin (superadmin/platform_admin only)
- `GET /api/tenant-admin/stats` - Platform statistics
- `GET/POST/PUT /api/tenant-admin/tenants` - Tenant CRUD
- `GET/POST /api/tenant-admin/tenant-users` - Tenant user management
- `GET/POST/PUT/DELETE /api/tenant-admin/licenses` - License management
### Regular API
- `GET /api/tenants` - List accessible tenants
- `POST /api/tenants` - Create customer tenant (MSS role)
- `GET /api/tenants/hierarchy` - Hierarchical tenant structure
- `GET /api/user/profile` - User role and tenant info (auto-provisions first user)
- `PUT /api/user/role` - Switch user role (superadmin/platform_admin only)
- `GET /api/dashboard/:tenantId` - Enhanced dashboard statistics
- `GET/POST/PATCH /api/incidents` - Incident CRUD
- `GET/POST/PATCH /api/tickets` - Ticket CRUD with SLA fields
- `GET/POST/PATCH /api/projects` - Project CRUD
- `GET/POST/PATCH /api/tasks` - Task CRUD
- `GET/POST/PATCH /api/services` - Service CRUD (MSS role)
- `GET/POST /api/sla-definitions` - SLA definition management
- `DELETE /api/sla-definitions/:id` - Delete SLA definition
- `GET/POST/PATCH /api/team-members` - Team member CRUD
- `GET/POST/PATCH/DELETE /api/shift-rosters` - Shift roster CRUD
- `GET /api/reports/:tenantId` - List reports
- `POST /api/reports/generate` - AI-powered report generation
- `GET/POST/PATCH/DELETE /api/documents` - Document CRUD with tenant-scoped access
- `POST /api/ai/generate-document` - AI-powered document content generation
- `POST /api/ai/ticket-suggest` - AI ticket auto-categorize and priority suggestion
- `POST /api/ai/ticket-response` - AI-generated ticket response
- `POST /api/ai/project-risk` - AI project risk assessment
- `POST /api/ai/task-breakdown` - AI task breakdown from goal
- `POST /api/import` - File import (CSV/Excel/PDF)
- `GET /api/reports/download/:id` - Download report file

## Access Control
- MSS users can access their MSSP and all child customer tenants
- Customer users can only access their own tenant
- Tenant access validated server-side via assertTenantAccess middleware
- Input validation via Zod schemas on all create/update endpoints

## Running
Workflow "Start application" runs `npm run dev` which starts Express + Vite on port 5000.

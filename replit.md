# SecureOps - MSSP Reporting Platform

## Overview
Multi-level multi-tenant MSSP (Managed Security Service Provider) platform for managing security operations across client organizations. Features hierarchical tenant architecture (MSSP → Customers), incident orchestration, AI-powered report generation, support ticketing, and project management with Kanban boards.

## Architecture
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + Recharts + wouter routing
- **Backend**: Express.js with session-based auth (Replit Auth)
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **AI**: OpenAI via Replit AI Integrations for report generation
- **Auth**: Replit OIDC Auth with role-based access control

## Key Files
- `shared/schema.ts` - Database schema (tenants with hierarchy, incidents, tickets, projects, tasks, reports)
- `server/routes.ts` - API routes with tenant access control middleware
- `server/storage.ts` - Database storage layer (IStorage interface)
- `server/seed.ts` - Seed data for 3 MSSPs with 7 customer organizations
- `client/src/App.tsx` - Main app with routing and auth flow
- `client/src/components/app-sidebar.tsx` - Sidebar navigation with hierarchical tenant selector
- `client/src/lib/tenant-context.tsx` - Multi-tenant context provider with hierarchy support
- `client/src/pages/` - Dashboard, Incidents, Tickets, Projects, Reports, Landing

## Multi-Level Tenant Hierarchy
MSSPs (top-level service providers):
1. **Vinca Cyber** (Cybersecurity) → Fedfina, P99 Software, Nineleaves, Maantic Global, Claim Power
2. **Cibervest** (Financial Services) → PKF Africa
3. **HitaskIT** (Technology) → RTIX Surgical

Tenants table has `type` field (mssp/customer) and `parentId` (nullable, references parent MSSP).

## Roles
- `mss_admin` - Full platform access, can manage MSSP and all child customer tenants
- `mss_analyst` - Operational access to incidents, tickets, projects, reports within MSSP scope
- `customer` - Dashboard-only view with ticket submission, limited to own tenant

## API Routes
- `GET /api/tenants` - List accessible tenants (MSSP + children for MSS users)
- `GET /api/tenants/hierarchy` - Hierarchical tenant structure [{mssp, children: [...]}]
- `GET /api/user/profile` - User role and tenant info
- `GET /api/dashboard/:tenantId` - Dashboard statistics
- `GET/POST/PATCH /api/incidents` - Incident CRUD (MSS role required for create/update)
- `GET/POST/PATCH /api/tickets` - Ticket CRUD
- `GET/POST/PATCH /api/projects` - Project CRUD (MSS role required)
- `GET/POST/PATCH /api/tasks` - Task CRUD (MSS role required)
- `GET /api/reports/:tenantId` - List reports
- `POST /api/reports/generate` - AI-powered report generation (MSS role required)

## Access Control
- MSS users can access their MSSP and all child customer tenants
- Customer users can only access their own tenant
- Tenant access validated server-side via assertTenantAccess middleware
- Input validation via Zod schemas on all create/update endpoints

## Running
Workflow "Start application" runs `npm run dev` which starts Express + Vite on port 5000.

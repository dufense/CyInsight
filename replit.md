# SecureOps - MSSP Reporting Platform

## Overview
Multi-tenant MSSP (Managed Security Service Provider) platform for managing security operations across client organizations. Features incident orchestration, AI-powered report generation, support ticketing, and project management with Kanban boards.

## Architecture
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + Recharts + wouter routing
- **Backend**: Express.js with session-based auth (Replit Auth)
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **AI**: OpenAI via Replit AI Integrations for report generation
- **Auth**: Replit OIDC Auth with role-based access control

## Key Files
- `shared/schema.ts` - Database schema (tenants, incidents, tickets, projects, tasks, reports)
- `server/routes.ts` - API routes with auth middleware
- `server/storage.ts` - Database storage layer (IStorage interface)
- `server/seed.ts` - Seed data for 4 tenants (Vinca Cyber, Cibervest, PKF, HitaskIT)
- `client/src/App.tsx` - Main app with routing and auth flow
- `client/src/components/app-sidebar.tsx` - Sidebar navigation with tenant selector
- `client/src/lib/tenant-context.tsx` - Multi-tenant context provider
- `client/src/pages/` - Dashboard, Incidents, Tickets, Projects, Reports, Landing

## Tenants
1. Vinca Cyber (Cybersecurity)
2. Cibervest (Financial Services)
3. PKF (Professional Services)
4. HitaskIT (Technology)

## Roles
- `mss_admin` - Full platform access, can manage all tenants
- `mss_analyst` - Operational access to incidents, tickets, projects, reports
- `customer` - Dashboard-only view with ticket submission

## API Routes
- `GET /api/tenants` - List all tenants
- `GET /api/user/profile` - User role and tenant info
- `GET /api/dashboard/:tenantId` - Dashboard statistics
- `GET/POST/PATCH /api/incidents` - Incident CRUD
- `GET/POST/PATCH /api/tickets` - Ticket CRUD
- `GET/POST/PATCH /api/projects` - Project CRUD
- `GET/POST/PATCH /api/tasks` - Task CRUD
- `GET /api/reports/:tenantId` - List reports
- `POST /api/reports/generate` - AI-powered report generation

## Running
Workflow "Start application" runs `npm run dev` which starts Express + Vite on port 5000.

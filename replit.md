# SecureOps - MSSP Reporting Platform

## Overview
SecureOps is a multi-level, multi-tenant Managed Security Service Provider (MSSP) platform designed to streamline security operations for client organizations. It offers a hierarchical tenant architecture (MSSP to Customers), incident orchestration, AI-powered report generation, and robust support ticketing with SLA tracking and AI suggestions. The platform also includes project management with Kanban boards and AI risk assessment, a comprehensive Knowledge Base with document management, and enterprise-grade CISO-level security dashboards. Additionally, it provides solutions & services management with MSA/SLA tracking, shift roster management for security teams, and automated project reporting. The business vision is to provide a comprehensive, AI-enhanced security management solution that empowers MSSPs to efficiently manage security for their diverse client base, offering significant market potential in the cybersecurity services sector.

## User Preferences
- All dashboard charts should support type switching (bar/line/area/pie) via ChartTypeSelector buttons in card headers.
- Interactive elements like clickable legends, enhanced tooltips, and hover effects are preferred for charts.
- Incident enrichment should include MITRE ATT&CK (tactic, technique ID, technique name) and Lockheed Martin Cyber Kill Chain phase mapping, with visual indicators for progress and classification (True Positive/False Positive).
- Confidence scoring for incidents (0-100) with a progress bar visualization is desired.
- A 90-day alert data retention indicator showing days old and retention status is important.
- Framework badges (MITRE, LMKC, TP/FP) should be visible on incident table rows.
- Stats bars showing TP/FP/Unclassified counts and average confidence are preferred.
- Inline editing for MSS users on all enrichment fields is required.
- Tenant industry field should be a dropdown with 20 standard options (e.g., Banking, Healthcare, Technology).
- Quick TP/FP classification buttons directly on incident table rows for MSS users are needed, with toggle behavior to unset classification. Non-MSS users should see read-only badges.
- IOC data should be stored per incident via AI enrichment, and incident details should include an IOC reputation panel with indicator type, value, reputation, and country, using color-coded badges (malicious, suspicious, clean).
- A "Bulk AI Enrich All" button on the incidents page for MSS users is desired, capable of enriching up to 100 unenriched incidents in batches of 15, adding MITRE ATT&CK mapping, Kill Chain phase, confidence score, classification, and IOC reputation.
- Cross-source event correlation is a key feature, identifying IOCs appearing in 2+ event types and returning the top 20 correlated indicators with event counts, severity, data source types, and timestamps.
- Service definitions should include MSA tracking (start/end dates, contract value) and SLA definitions (response time, resolution time, uptime targets). An SLA Dashboard with compliance indicators (green/yellow/red) is necessary.
- Two team types for shift roster management: Implementation (Ticketing & Projects) and MSS (Incidents & Dashboards), with visual shift type indicators and color coding.
- Enhanced ticketing should feature an activity dashboard, SLA compliance indicators, priority distribution charts, and service linkage for SLA tracking.
- Enhanced project management should include an activity dashboard, per-project progress bars, AI-powered report generation (Daily Project Status, Weekly Project Summary), and enhanced task cards.
- Users should be assignable to multiple roles, with a role switcher visible to users with 2+ assigned roles. The active role should be updated in the database, and cached queries cleared on role switch.
- Role-based navigation should be strictly enforced, ensuring users only see relevant sections based on their assigned roles.
- A dedicated standalone Admin Portal at `/admin` is required for multi-tenancy management, accessible by specific admin roles. It should include tabs for Overview, Tenants, Users, and Licenses, with full CRUD capabilities and search.

## System Architecture
The platform utilizes a modern web stack: React with Vite, TailwindCSS, shadcn/ui, and Recharts for the frontend, and Express.js for the backend. Data persistence is handled by PostgreSQL (Neon) with Drizzle ORM. AI capabilities are integrated via OpenAI through Replit AI Integrations, powering features like report generation, ticket suggestions, project risk assessment, task breakdown, and document content generation. Authentication is managed by Replit OIDC Auth with robust role-based access control.

**UI/UX Decisions:**
- **Color Schemes:** Uses shadcn/ui for component styling, implying a modern, accessible, and customizable design system.
- **Templates:** Standardized layouts for dashboards, tables, and forms across the application.
- **Design Approaches:** Emphasis on intuitive navigation, data visualization through interactive charts (bar, line, area, pie with type switching), and clear indicators for status and compliance (e.g., SLA compliance, confidence scores, reputation badges).
- **Multi-tenant context provider** (`client/src/lib/tenant-context.tsx`) supports hierarchical tenant selection and role-based feature access.
- **Admin Portal** (`client/src/pages/admin-portal.tsx`) is a standalone application with a distinct layout for managing platform-level entities, ensuring clear separation from operational dashboards.

**Technical Implementations:**
- **Database Schema:** Defined in `shared/schema.ts`, covering a wide array of entities from tenants and incidents to team members and licenses.
- **API Routes:** Implemented in `server/routes.ts` with tenant access control middleware.
- **Storage Layer:** Abstracted through an `IStorage` interface in `server/storage.ts`, providing CRUD operations for all entities.
- **Security Events:** Supports 10 event types (email, endpoint, vulnerability, etc.) with enriched metadata like `threatVector`, `mitreTactic`, `riskScore`.
- **Dashboard Charts:** Reusable `FlexChart` component for dynamic chart rendering with interactive features.
- **Incident Enrichment:** AI-driven enrichment for MITRE ATT&CK, Kill Chain, confidence scoring, and classification. IOC data is stored in a JSONB column (`iocData`) for flexible storage.
- **Cross-Source Event Correlation:** Dedicated API endpoint (`POST /api/ai/correlate-events`) for advanced threat detection.
- **Multi-Role Assignment & Role Switcher:** Dynamic role management with immediate UI updates upon role change by clearing cached queries.
- **Access Control:** Implemented with `assertTenantAccess` middleware on the server-side and role-based navigation on the client-side.
- **Data Import:** Supports CSV/Excel/PDF with AI enrichment and column detection.
- **Database Migrations:** Utilizes `drizzle-kit generate` and `drizzle-orm migrate` for safe, incremental schema updates, automatically run on server startup.

**Feature Specifications:**
- **Multi-Level Tenant Hierarchy:** `tenants` table with `type` (mssp/customer) and `parentId` for hierarchical relationships.
- **Roles:** `platform_admin`, `mss_admin`, `mss_analyst`, `customer`, and others, each with specific access privileges.
- **Reports:** 13 report types, including `executive_summary`, `endpoint`, `email`, `vulnerability`, etc., generated via AI.
- **AI Integrations:** OpenAI for various functionalities including report generation, ticket suggestions, project risk assessment, and document content creation.

## External Dependencies
- **Frontend Framework:** React
- **Build Tool:** Vite
- **Styling:** TailwindCSS, shadcn/ui
- **Charting Library:** Recharts
- **Routing:** wouter
- **Backend Framework:** Express.js
- **Database:** PostgreSQL (Neon)
- **ORM:** Drizzle ORM
- **Artificial Intelligence:** OpenAI (via Replit AI Integrations)
- **Authentication:** Replit OIDC Auth
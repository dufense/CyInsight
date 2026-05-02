# Cyber Command Center - MSSP Platform

## Overview
Cyber Command Center is an AI-enhanced, multi-level, multi-tenant Managed Security Service Provider (MSSP) platform designed to boost security posture and operational efficiency. It offers a hierarchical tenant architecture, AI-powered incident orchestration and reporting, robust support ticketing with SLA tracking, and integrated project management featuring AI risk assessment. Key capabilities include CISO-level security dashboards, comprehensive solutions & services management, and shift roster management. The platform aims to deliver AI-native security solutions, optimize operational workflows, and provide end-to-end security management.

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
- Enhanced ticketing should feature an activity dashboard, SLA compliance indicators, priority distribution charts, service linkage for SLA tracking, smart agent assignment from shift rosters with workload balancing, real-time SLA countdown timers, and auto-breach detection.
- Enhanced project management should include an activity dashboard, per-project progress bars, AI-powered report generation (Daily Project Status, Weekly Project Summary), enhanced task cards, and a comprehensive project detail page (`/projects/:id`) with 7 tabs: Overview, Scope (inclusions/exclusions), Activities (milestones + daily logs), RACI Matrix (interactive grid), Risk Register (probability/impact scoring), Tasks (embedded Kanban), and AI Reports.
- Users should be assignable to multiple roles, with a role switcher visible to users with 2+ assigned roles. The active role should be updated in the database, and cached queries cleared on role switch.
- Role-based navigation should be strictly enforced, ensuring users only see relevant sections based on their assigned roles.
- A dedicated standalone Admin Portal at `/admin` is required for multi-tenancy management, accessible by specific admin roles. It should include tabs for Overview, Tenants, Users, Licenses, Data Retention, Data Infrastructure, and Platform Health (7 tabs), with full CRUD capabilities and search.
- Platform Health tab provides real-time monitoring: system health cards (uptime, DB, memory, cache), dependencies table, event ingestion charts, integration/connector status with inactivity alerts, per-tenant health grid, pipeline/receiver stats, data plane region health cards, Quota Engine & Read Replica panel (tier distribution, throttle counts, replica lag). Auto-refreshes every 30s. Restricted to platform_admin/superadmin roles.
- CAASM module has 8 tabs: Cyber Asset Intelligence, Asset Explorer, Device Posture, Attack Surface, Location & Geo, OS Landscape, Coverage, Migration.
- CAASM CIS Score, Asset Criticality & User-Asset Mapping: `assets` table has `cis_score`, `cis_benchmark`, `criticality`, `primary_user_id`, `primary_user_email` columns. Backend manages CIS scoring, criticality assignment, and user correlation. UI includes CIS gauge, criticality badge, assigned user cards, and filters.
- Autonomous Response Engine: Manages incident response plans and actions. Backend uses AI to build prioritized containment plans and executes typed actions (host isolation, IP block, account disable, etc.). UI provides an "Auto Response" tab in the Incident War Room with a mode switcher, step-by-step action cards, undo functionality, and plan progress.
- Entity Intelligence Graph: Extracts entity nodes (host, user, IP, domain, hash, process, email) and directed edges from incident events. Computes BFS attack paths. UI presents a force-directed SVG graph in the Incident War Room with node color-coding, sizing, zoom/pan/drag interactions, attack path overlay, timeline scrubber, and node detail side panel.
- CIS Benchmark Assessment & Endpoint Remediation: Manages EDR-based CIS assessments and remediation actions. Backend integrates with multiple EDR providers via an abstraction layer and includes assessment and remediation engines. UI provides a "CIS Benchmark Assessment" tab in Asset Detail with configuration, score cards, on-demand assessment, findings, history, and action logs.
- Cyber LLM Predictive Attack Engine (`/predictive-attack`): AI-powered 30-day attack forecasting. Backend service analyzes last 90 days of incidents (MITRE tactics, severity, IOC types) and uses LLM to generate: attack vector probability matrix (5-8 vectors with probability/delta/confidence/MITRE techniques), 30-day risk score timeline, predicted target sectors by industry, emerging threat indicators, and executive narrative. Results cached in `attack_forecasts` table (6h TTL). APIs: `GET /api/predictive-attack/forecast/:tenantId` (cached), `POST /api/predictive-attack/forecast/:tenantId/refresh` (force regen). Accessible to all SOC roles.
- AI Detection Engineering Feedback Loop: Backend uses AI to assess rule quality and store improvement suggestion.
- SOC Overview CounterShadow-Inspired Widgets: Dashboards show: 5-card KPI row (MTTD/MTTI/MTTR/MTTC/SLA), AI Override Rate RadialBarChart gauge, Top Flagged Users horizontal bar + Top Flagged Hosts donut, and a full-width stacked area chart for 30-day investigation status time-series. All backend queries use read-replica pool.
- Cyber Intelligence Hub: Comprehensive CTI module with full CRUD for threat actors, intrusion sets, campaigns, malware families, and intel reports, aggregate stats, STIX 2.1 bundle export, and AI brief generation.
- Navigation Overhaul: Sidebar restructured — new **Cyber Intelligence** group (12 items: Intel Overview, IOC Indicators [badge: IOC], Threat Actors, Intrusion Sets, Campaigns, Malware Families, STIX Observables [badge: STIX], Intel Reports, Attack Patterns, Global Threat Map, Predictive Engine [badge: LLM], Federated Intel); SOC Operations streamlined; AI & Intelligence reduced; Service Management includes Ops Center at top for all roles; Projects removed from sidebar.
- Log Intelligence Section: New sidebar section with 4 real-API-backed sub-pages. Log Explorer (`/log-intelligence/explorer`) queries `GET /api/events/:tenantId` + `/stats` with multi-select filters (severity, MITRE tactic, MITRE technique, source, category), entity/confidence/time-range filters, and expandable side-by-side raw+parsed view. Source Management (`/log-intelligence/sources`) uses `GET /api/log-sources/:tenantId`, `POST` to add sources, `/health` for test connection, `/fingerprint` for AI device fingerprinting. Detection Feed (`/log-intelligence/detections`) queries `GET /api/events/:tenantId/stats` for real eventsByType/eventsBySeverity and `GET /api/events/:tenantId` for per-category drill-down detections (15 attack categories with sparklines, 30s auto-refresh). AI Training & Feedback (`/log-intelligence/training`) queries `GET /api/events/:tenantId` to build a review queue of real low-confidence/needsReview events, `GET /api/ai-learning/stats/:tenantId` for live feedback counts, and `POST /api/ai-learning/feedback` for verdict submission.

## System Architecture
### Multi-Plane Architecture
The platform utilizes a multi-plane architecture, separating Management, Data, and Receiver & Analytics Planes.

### Key Architectural Decisions
- **AI Model Abstraction:** Vendor-neutral abstraction for multiple AI services.
- **Cloud Object Storage Abstraction:** Unified abstraction for various cloud storage providers.
- **Multi-Level Tenant Hierarchy:** Supports hierarchical tenant relationships and granular data region assignments.
- **Role-Based Access Control:** Strict permissions for `platform_admin`, `mss_admin`, `mss_analyst`, and `customer` roles.
- **Universal Data Ingestion Pipeline:** Multi-channel system with Push API, AI Normalizer, and a 6-stage enrichment pipeline.
- **AI Contextual Intelligence:** Leverages configurable AI providers for intelligent processing.
- **AI-Generated Reports:** Offers 44 templates across 9 groups with professional PDF output.
- **AI-Enhanced Ticketing:** Features duplicate detection, summarization, sentiment analysis, and complexity assessment.
- **Agentic AI SOC Analyst:** Orchestrates seven specialized agents for autonomous ticket processing.
- **Federated Cross-Tenant Threat Intelligence:** Core propagation engine with auto-nomination, contribution scoring, and IOC propagation.
- **Enterprise SSO & MFA Integration:** Multi-tenant SSO via OIDC and SAML 2.0, with various MFA methods.
- **Per-Tenant Quota Engine:** Implements Redis token-bucket rate limiting per tenant.
- **DB Read Replica Routing:** Utilizes read replicas for heavy analytics queries.
- **7-Layer Crash-Proof Architecture:** Comprehensive resilience layer.
- **Elastic AWS ECS Tier (pay-as-you-use):** CloudFormation templates deploy the same topology as Hyperscale but with on-demand AWS primitives (Aurora Serverless v2, Kinesis on-demand, ElastiCache Serverless, ECS Fargate autoscaling, ClickHouse 3-node). A `TenantTier` parameter drives scaling via CFN `Mappings`. Compatible with existing management and data plane components.

### Technology Stack
- **Frontend:** React with Vite, TailwindCSS, shadcn/ui, Recharts.
- **Backend:** Express.js.
- **Database:** PostgreSQL with Drizzle ORM.
- **Authentication:** Passport.js sessions.
- **Deployment:** Docker Compose, Kubernetes (Helm charts), AWS ECS Fargate.

### UI/UX Design
- Modern, accessible component styling using shadcn/ui.
- Intuitive navigation, interactive charts, and clear status/compliance indicators.
- Per-tenant branding and dynamic theming.
- Interactive guided tours for key modules.
- PWA / Mobile-First design.

### Feature Specifications
- **AI Smart Alert Triage Center:** Intelligent noise reduction, alert clustering, AI-suggested suppressions.
- **Unified SOC Console:** Single-page console with domain-based tab navigation.
- **Zero Trust Posture Center:** Identity, device, network pillar scoring, composite ZT score.
- **Incident War Room:** Live investigation console with Timeline, Evidence Locker, Threat Intel, and ARIA AI Investigation Assistant.
- **AI Threat Forecast:** AI-powered 30-day risk narratives, top attack vectors, emerging indicators.
- **IOC Decay Tracker:** Scores IOCs by freshness.
- **Executive AI Intelligence Briefing & SOC KPI Dashboard:** AI-generated situation reports, threat levels, SOC metrics.
- **Cyber Command Center:** 11 security domain tabs and 4 sub-dashboard modes.
- **CAASM Module:** Cyber Asset Intelligence platform with 11 modules, animated posture hub, redesigned attack surface view.
- **Cyber Intelligence Hub:** Full CTI platform with various threat intelligence entities and AI-generated intelligence briefs.
- **Threat Intelligence Feed Management:** IOC feed manager with auto-correlation capabilities.
- **Unified Operations Center:** Consolidates Tickets, Cases, and AI Activity.
- **SOAR Playbook Studio:** Automated response playbook library.
- **Threat Hunting Workbench:** Dedicated hunt interface with entity pivot actions.
- **Sigma Rule Engine:** Utilizes 3,120 Sigma rules with source-aware normalization.
- **Malware Sandbox & Extended TI Connectors:** Integration with enterprise sandbox platforms and additional TI connectors.
- **Multi-Vector Attack Detection Engine:** Features 15 parallel signal extractors, LLM classifier with MITRE ATT&CK mapping, behavioral baselines, cross-event attack chain correlation, auto-incident promotion, and analyst feedback loop.
- **Integration Autoheal Engine:** Autonomous integration recovery.

## External Dependencies
- **Artificial Intelligence:** OpenAI, Anthropic, Ollama, Azure, Google Vertex AI, HuggingFace, xAI Grok, DeepSeek, Moonshot Kimi, Zhipu AI, Custom OpenAI-compatible providers
- **Object Storage:** AWS S3, Azure Blob, Google Cloud Storage, MinIO
- **Database:** PostgreSQL, TimescaleDB
- **OLAP / Search:** ClickHouse
- **Messaging:** Apache Kafka
- **Cache:** Redis
- **Email:** nodemailer
- **EDR Providers:** Cynet 360, CrowdStrike Falcon, SentinelOne, MS Defender for Endpoint
- **Malware Sandboxes:** Any.Run, Hybrid Analysis, Joe Sandbox, Hatching Triage, Intezer, VMRay
- **Threat Intelligence Connectors:** ThreatFox, GreyNoise, Shodan, URLScan.io
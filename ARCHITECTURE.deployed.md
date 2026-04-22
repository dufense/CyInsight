# CyInsight Deployed Architecture — AWS Starter Stack

**Date:** April 20, 2026
**Environment:** AWS Production (ap-south-1)
**Deployment Mode:** Single-Stack (All-in-One)
**Domain:** https://app.riskproficient.com

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Component Diagram](#2-component-diagram)
3. [Technology Stack](#3-technology-stack)
4. [Data Flow](#4-data-flow)
5. [Security Architecture](#5-security-architecture)
6. [Network Topology](#6-network-topology)
7. [Database Architecture](#7-database-architecture)
8. [Request Lifecycle](#8-request-lifecycle)
9. [Background Processing](#9-background-processing)
10. [Scaling Boundaries](#10-scaling-boundaries)
11. [Failure Modes & Recovery](#11-failure-modes--recovery)

---

## 1. Architecture Overview

The deployed AWS starter stack is a **single-plane, monolithic deployment** of the CyInsight (Cyber Command Center) MSSP platform. All services run within a single ECS Fargate cluster with shared backing services (RDS, Redis, ClickHouse, S3).

This architecture trades the full multi-region, multi-plane scalability of the complete platform for operational simplicity and rapid deployment. It is suitable for:
- Production pilots and POCs
- Small-to-medium MSSP operations
- Single-region deployments

### Relationship to Full Architecture

The full CyInsight platform uses a **three-plane architecture**:
- **Receiver & Analytics Plane** — Event ingestion, normalization, detection
- **Management Plane** — API, UI, orchestration, ticketing
- **Data Plane** — Hot storage (TimescaleDB), OLAP (ClickHouse), cold archive (S3)

The deployed starter stack **collapses all three planes into a single ECS service** while maintaining the same internal service boundaries and data flows.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FULL PLATFORM (3-Plane)                         │
├─────────────────────────────────────────────────────────────────────────┤
│  Receiver Plane    │  Management Plane    │  Data Plane                │
│  (Kafka + Workers) │  (API + UI Servers)  │  (TimescaleDB + CH + S3)   │
│  ──────────────────┼──────────────────────┼──────────────────────────  │
│  Multi-Region      │  EU Central          │  Multi-Region              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ Collapsed to Single Stack
┌─────────────────────────────────────────────────────────────────────────┐
│                      DEPLOYED STARTER STACK                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                     ECS Fargate Service                         │   │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │   │
│   │  │  Express    │  │  Background │  │  Scheduled Jobs         │ │   │
│   │  │  API + UI   │  │  Workers    │  │  (AI, EDR, Detection)   │ │   │
│   │  │  (Port 5000)│  │             │  │                         │ │   │
│   │  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │   │
│   │         │                │                     │               │   │
│   │         └────────────────┴─────────────────────┘               │   │
│   │                          │                                     │   │
│   │                   Shared Node.js Process                       │   │
│   │                   (Single Monolith)                            │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│   ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌─────────────────┐    │
│   │  RDS     │  │  Redis   │  │  ClickHouse  │  │      S3         │    │
│   │PostgreSQL│  │ElastiCache│  │   (ECS+EFS)  │  │   (Objects)     │    │
│   │ 16.6    │  │   7.1    │  │              │  │                 │    │
│   └──────────┘  └──────────┘  └──────────────┘  └─────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Diagram

```
                              Internet
                                 │
                                 ▼
                    ┌──────────────────────┐
                    │   Route 53           │
                    │  app.riskproficient  │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   ALB (Port 443)     │
                    │  HTTPS + ACM Cert    │
                    │  HTTP → 301 HTTPS    │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
        ┌─────────┐     ┌─────────┐     ┌─────────┐
        │ ECS Task│     │ ECS Task│     │ ECS Task│
        │   #1    │     │   #2    │     │  (Spare)│
        │ 2 vCPU  │     │ 2 vCPU  │     │         │
        │ 4 GB    │     │ 4 GB    │     │         │
        └────┬────┘     └────┬────┘     └─────────┘
             │               │
             └───────┬───────┘
                     │
        ┌────────────┼────────────┬────────────┐
        │            │            │            │
        ▼            ▼            ▼            ▼
   ┌────────┐  ┌────────┐  ┌──────────┐  ┌────────┐
   │  RDS   │  │ Redis  │  │ClickHouse│  │   S3   │
   │   Pg   │  │  Cache │  │  OLAP    │  │ Bucket │
   │ 16.6   │  │        │  │          │  │        │
   └────────┘  └────────┘  └──────────┘  └────────┘
```

### Component Responsibilities

| Component | Technology | Responsibility |
|-----------|------------|---------------|
| **ECS Tasks** | Node.js 20 + Express | API server, React SPA, background workers, scheduled jobs |
| **RDS** | PostgreSQL 16.6 | Primary database — all relational data (124 tables) |
| **Redis** | ElastiCache Redis 7.1 | Session store, cache, rate limiting, pub/sub |
| **ClickHouse** | ClickHouse 24.x | OLAP analytics, event storage, fast aggregations |
| **S3** | AWS S3 | File uploads, reports, archives, cold storage |
| **ALB** | AWS ALB | SSL termination, health checks, traffic distribution |
| **Route 53** | AWS Route 53 | DNS hosting, domain management |

---

## 3. Technology Stack

### 3.1 Backend
| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Node.js 20 (Alpine) | JavaScript runtime |
| Framework | Express.js 4.x | HTTP server, middleware, routing |
| ORM | Drizzle ORM | Type-safe SQL queries, migrations |
| Auth | Passport.js + bcrypt | Local auth, session management |
| Sessions | express-session + connect-redis | Stateful sessions with Redis backing |
| Validation | Zod | Schema validation |
| AI/LLM | OpenAI SDK + Google GenAI | AI investigations, triage, enrichment |
| Email | Nodemailer | Notifications, alerts |
| PDF | pdfkit | Report generation |
| Excel | xlsx | Spreadsheet exports |

### 3.2 Frontend
| Layer | Technology |
|-------|-----------|
| Framework | React 18 + Vite |
| Styling | Tailwind CSS + shadcn/ui |
| State | React Query + Zustand |
| Charts | Recharts |
| Maps | Leaflet |
| Build | esbuild (via Vite) |

### 3.3 Data Stores
| Store | Technology | Use Case |
|-------|-----------|----------|
| Primary DB | PostgreSQL 16.6 | All transactional data |
| Cache/Sessions | Redis 7.1 | Sessions, rate limits, temp data |
| Analytics | ClickHouse | Security events, aggregations, IOC lookups |
| Object Storage | AWS S3 | Files, reports, exports |

### 3.4 DevOps / Infrastructure
| Layer | Technology |
|-------|-----------|
| Container | Docker + ECS Fargate |
| Orchestration | AWS ECS |
| CI/CD | GitHub Actions (`.github/workflows`) |
| IaC | AWS CloudFormation |
| DNS | Route 53 |
| SSL | AWS ACM |
| Load Balancing | AWS ALB |

---

## 4. Data Flow

### 4.1 Ingestion Flow (Security Events)

```
Log Source
    │
    ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   API /     │────▶│  Parser     │────▶│  Enrichment │
│   Webhook   │     │  (CEF/JSON) │     │  Pipeline   │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                                │
                       ┌────────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Risk Scoring   │
              │  + Correlation  │
              └────────┬────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
         ▼             ▼             ▼
    ┌────────┐   ┌──────────┐   ┌────────┐
    │  RDS   │   │ClickHouse│   │   S3   │
    │   Pg   │   │  (OLAP)  │   │(Archive│
    │(Incidents│  │ (Events) │   │/Reports)│
    │ Assets) │   └──────────┘   └────────┘
    └────────┘
```

### 4.2 User Request Flow

```
User Browser
    │
    ▼ HTTPS
Route 53 (app.riskproficient.com)
    │
    ▼
ALB (Port 443)
    │
    ▼
ECS Task (Express)
    │
    ├──▶ React SPA (Static files)
    │
    ├──▶ API Routes (JSON)
    │       │
    │       ├──▶ PostgreSQL (via Drizzle)
    │       ├──▶ Redis (Sessions/Cache)
    │       ├──▶ ClickHouse (Analytics)
    │       └──▶ S3 (File uploads)
    │
    └──▶ WebSocket (if real-time features)
```

### 4.3 Background Processing Flow

```
ECS Task (Background Async Block)
    │
    ├──▶ Migration Runner (on startup)
    │
    ├──▶ AI Agent Scheduler
    │       ├──▶ OpenAI API
    │       └──▶ PostgreSQL (ai_investigations)
    │
    ├──▶ EDR Scheduler
    │       └──▶ Security Integration APIs
    │
    ├──▶ Detection Pipeline
    │       ├──▶ Sigma Rules Engine
    │       └──▶ MITRE ATT&CK Mapping
    │
    ├──▶ ClickHouse Ingest Monitor
    │       └──▶ ClickHouse DDL / Migrations
    │
    ├──▶ TAXII Poll Scheduler
    │       └──▶ External Threat Intel Feeds
    │
    ├──▶ OpenCTI Sync Scheduler
    │       └──▶ OpenCTI API
    │
    └──▶ Kafka Consumer (if enabled)
            └──▶ Event Stream Processing
```

---

## 5. Security Architecture

### 5.1 Network Security

```
Internet
    │
    ▼
┌─────────────────────────────────────────┐
│  ALB Security Group                     │
│  Inbound: 0.0.0.0/0 : 80, 443          │
│  Outbound: VPC only                     │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  ECS Security Group                     │
│  Inbound: ALB SG only : 5000            │
│  Outbound: VPC + AWS Services           │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  RDS Security Group                     │
│  Inbound: ECS SG + VPC : 5432           │
│  Outbound: None                         │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  Redis Security Group                   │
│  Inbound: ECS SG + VPC : 6379           │
│  Outbound: None                         │
└─────────────────────────────────────────┘
```

### 5.2 Application Security

| Layer | Mechanism |
|-------|-----------|
| **Transport** | TLS 1.2+ (ACM certificate), HSTS header |
| **Authentication** | Passport.js local strategy, bcrypt hashed passwords |
| **Session** | Server-side sessions in Redis, HTTP-only cookies |
| **Authorization** | Role-based access control (RBAC) — platform_admin, mss_admin, soc_manager, etc. |
| **Input Validation** | Zod schemas on all API inputs |
| **CSRF** | SameSite cookies, CORS configuration |
| **CSP** | Content-Security-Policy headers |
| **Rate Limiting** | express-rate-limit with Redis store |
| **Secrets** | AWS Secrets Manager (not in env vars or code) |

### 5.3 Data Security

| Layer | Mechanism |
|-------|-----------|
| **Database** | SSL/TLS required (`sslmode=require`) |
| **Redis** | VPC-only access (no public endpoint) |
| **ClickHouse** | Internal ALB, VPC-only |
| **S3** | IAM role-based access, bucket policies |
| **Backups** | RDS automated backups, S3 versioning |

---

## 6. Network Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                         VPC: 10.0.0.0/16                        │
│                                                                 │
│  ┌─────────────────────────┐    ┌─────────────────────────┐    │
│  │    Public Subnets       │    │    Private Subnets      │    │
│  │  10.0.1.0/24 (1a)       │    │  10.0.3.0/24 (1a)       │    │
│  │  10.0.2.0/24 (1b)       │    │  10.0.4.0/24 (1b)       │    │
│  │                         │    │                         │    │
│  │  [ALB]                  │    │  [ECS Tasks]            │    │
│  │  [NAT Gateway]          │    │  [RDS PostgreSQL]       │    │
│  │                         │    │  [Redis ElastiCache]    │    │
│  │                         │    │  [ClickHouse]           │    │
│  └─────────────────────────┘    └─────────────────────────┘    │
│              │                             │                    │
│              │         IGW                 │                    │
│              └───────────┬─────────────────┘                    │
│                          │                                      │
│                          ▼                                      │
│                      Internet                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Subnet Allocation

| Subnet | CIDR | AZ | Purpose |
|--------|------|-----|---------|
| Public-1a | 10.0.1.0/24 | ap-south-1a | ALB, NAT Gateway |
| Public-1b | 10.0.2.0/24 | ap-south-1b | ALB, NAT Gateway |
| Private-1a | 10.0.3.0/24 | ap-south-1a | ECS, RDS, Redis, ClickHouse |
| Private-1b | 10.0.4.0/24 | ap-south-1b | ECS, RDS, Redis, ClickHouse |

---

## 7. Database Architecture

### 7.1 PostgreSQL (Primary)

**Instance:** `db.t3.micro` (can be upgraded)
**Storage:** gp2 SSD, auto-scaling
**Backup:** Automated daily backups with 7-day retention
**Multi-AZ:** No (starter stack — enable for production HA)

**Schema Organization:**
```
public schema
├── Core Identity: users, tenants, superadmins, sessions
├── Assets: assets, infrastructure_locations, user_assets
├── Security Ops: incidents, security_events, cases, playbooks
├── Threat Intel: threat_intel_feeds, threat_intel_iocs, sigma_rules
├── AI/ML: ai_investigations, ai_agent_activity_log, ai_learning_feedback
├── Integrations: platform_integrations, security_integrations, db_connectors
├── Ticketing: tickets, ticket_comments, ticket_attachments
├── Reporting: reports, report_schedules, documents
├── Compliance: compliance_assessments
├── CTI Cache: opencti_*, taxii_*
└── Platform: platform_settings, tenant_quotas, licenses
```

### 7.2 Redis (Cache & Sessions)

**Cluster Mode:** Disabled (single node)
**Node Type:** `cache.t3.micro`
**Use Cases:**
- Session store (`connect-redis`)
- Rate limiting counters
- Temporary cache
- Pub/sub for real-time features

### 7.3 ClickHouse (Analytics)

**Deployment:** ECS Fargate + EFS (persistent storage)
**Use Cases:**
- Security event analytics
- Fast aggregations and rollups
n- IOC enrichment lookups
- Time-series data

**Tables:**
- `events` — normalized security events
- `iocs` — threat intelligence indicators
- `metrics` — platform metrics and KPIs

### 7.4 S3 (Object Storage)

**Bucket:** `cyinsight-data-200810847769-production`
**Use Cases:**
- File uploads (evidence, attachments)
- Generated reports (PDF, Excel)
- Log archives
- Export downloads

---

## 8. Request Lifecycle

### 8.1 Login Page Request

```
1. User opens https://app.riskproficient.com/login
   │
2. DNS Resolution
   │   Route 53 → ALB IP (52.66.82.27 or 43.205.219.177)
   │
3. TLS Handshake
   │   ALB presents ACM certificate for app.riskproficient.com
   │
4. ALB → ECS Target Group
   │   Health check passed → forward to healthy task
   │
5. Express Server
   │   serveStatic() → returns React SPA index.html
   │
6. Browser loads SPA
   │   Fetches JS/CSS bundles from /assets/
   │
7. React Router
   │   Client-side routing renders /login page
   │
8. Login API Call
   │   POST /api/superadmin/login
   │   → bcrypt compare → session created in Redis
   │   → Set-Cookie header returned
   │
9. Authenticated Session
   │   Subsequent requests include session cookie
   │   → Redis lookup → req.session populated
```

### 8.2 API Request (Authenticated)

```
1. Client sends request with session cookie
   │
2. ALB → ECS Task
   │
3. Express Middleware Chain
   │   requestIdMiddleware → circuitBreakerMiddleware
   │   → express-session (Redis lookup)
   │   → isAuthenticated middleware
   │
4. Route Handler
   │   Business logic → Drizzle ORM queries
   │
5. Database Queries
   │   PostgreSQL (transactional data)
   │   Redis (cache lookups)
   │   ClickHouse (analytics queries)
   │
6. Response
   │   JSON response → client
```

---

## 9. Background Processing

The application runs multiple background processes within each ECS task:

### 9.1 Startup Sequence

```
httpServer.listen(port)  ← Starts immediately (health checks pass)
    │
    └── Background Async Block
        │
        ├── runMigrations()           ← Custom resilient runner
        │   ├── Old migrations (0000-0022)
        │   └── New migration (0023)   ← Creates missing tables
        │
        ├── ensureQuotaTable()        ← Idempotent quota setup
        │
        ├── initClickHouseSchema()    ← 15s timeout wrapper
        │
        ├── createPerformanceIndexes() ← DB index optimization
        │
        ├── registerRoutes()          ← Express routes registration
        │
        ├── serveStatic()             ← React SPA static files
        │
        ├── runProdDataMigration()    ← Production data fixes
        │
        ├── runStartupEnrichment()    ← Asset enrichment
        │
        ├── serverReady = true        ← App marked ready
        │
        └── Start Scheduled Jobs
            ├── startAIAgentScheduler()
            ├── startEdrScheduler()
            ├── startClickHouseIngestMonitor()
            ├── startTaxiiPollScheduler()
            ├── startOpenCTISyncScheduler()
            └── startKafkaConsumerIfPrimary()
```

### 9.2 Scheduled Jobs (Running Continuously)

| Job | Frequency | Purpose |
|-----|-----------|---------|
| **AI Agent Scheduler** | Continuous | AI triage, investigations, recommendations |
| **EDR Scheduler** | Continuous | Endpoint detection & response polling |
| **ClickHouse Ingest Monitor** | Continuous | Monitor ClickHouse ingestion health |
| **ClickHouse Fast Path** | Continuous | Fast-path event processing |
| **TAXII Poll** | Every 30 min | Poll threat intelligence feeds |
| **OpenCTI Sync** | Every 6 hours | Sync with OpenCTI platform |
| **ML Baseline Refresh** | Every 30s | Behavioral baseline updates |
| **ML Entity Scoring** | Every 30s | Entity risk scoring |
| **Detection Pipeline** | Every 60s | Attack detection & correlation |
| **Training Review** | Every 60s | AI model training feedback |
| **Autoheal Monitor** | Continuous | Failed integration recovery |

### 9.3 Background Workers (All Environments)

| Worker | File | Purpose |
|--------|------|---------|
| ML Baseline | `ml-behavior-engine.js` | Baseline refresh job |
| ML Scoring | `ml-behavior-engine.js` | Entity scoring job |
| Detection Pipeline | `attack-detection-pipeline.js` | Multi-vector classification |
| AI Training | `ai-training-manager.js` | Training review loop |
| Autoheal | `integration-autoheal.js` | Integration health monitoring |

---

## 10. Scaling Boundaries

### 10.1 Current Limits (Starter Stack)

| Resource | Current | Max (Before Upgrade) |
|----------|---------|---------------------|
| ECS Tasks | 2 | ~10 (ALB target capacity) |
| RDS | db.t3.micro | db.t3.large |
| Redis | cache.t3.micro | cache.r6g.large |
| ClickHouse | 1 ECS task | 3+ tasks + sharding |

### 10.2 Horizontal Scaling (Application)

```
┌─────────────────────────────────────────┐
│  Scale ECS Service                      │
│  aws ecs update-service --desired-count N│
│                                         │
│  Each new task:                         │
│  - Runs same container image            │
│  - Connects to same RDS/Redis/CH/S3    │
│  - ALB distributes traffic round-robin  │
│  - Background jobs may duplicate        │
│    (handled by primary-worker logic)    │
└─────────────────────────────────────────┘
```

### 10.3 Vertical Scaling (Database)

| Component | Scale Action |
|-----------|-------------|
| RDS | Modify instance class → reboot (5 min downtime) |
| Redis | Modify node type → failover (minimal downtime) |
| ClickHouse | Increase ECS task CPU/memory |
| ALB | Auto-scales (no action needed) |

### 10.4 When to Migrate to Multi-Plane

Consider migrating to the full 3-plane architecture when:
- Monthly events > 100M
- Need multi-region deployment
- Require dedicated analytics infrastructure
- Need Kafka streaming for real-time processing
- Compliance requires data residency separation

---

## 11. Failure Modes & Recovery

### 11.1 Component Failure Matrix

| Component | Failure Mode | Impact | Recovery |
|-----------|-------------|--------|----------|
| **ECS Task** | Container crash | Reduced capacity (1/2 tasks) | Auto-replaced by ECS within 60s |
| **ECS Service** | All tasks down | App unavailable | ECS circuit breaker rolls back deployment |
| **RDS** | Instance failure | App read/write failure | Restore from snapshot (if no Multi-AZ) |
| **Redis** | Cache failure | Sessions lost, rate limits reset | App continues (stateless fallback) |
| **ClickHouse** | Service down | Analytics unavailable | App continues (PostgreSQL fallback) |
| **S3** | Regional outage | File uploads fail | Retry with exponential backoff |
| **ALB** | Health check fails | Traffic routes to healthy targets | Auto-detects unhealthy targets |

### 11.2 Health Check Endpoints

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `/_health` | ALB health check | `{"status":"ok","ready":true}` |
| `/_health` (startup) | Startup probe | `{"status":"ok","ready":false}` until init complete |

### 11.3 Circuit Breaker

ECS deployment circuit breaker is **enabled with rollback**:
- If new deployment fails health checks → automatic rollback to previous task definition
- Prevents bad deployments from taking down the service

### 11.4 Data Recovery

| Data Store | Backup Strategy | RTO | RPO |
|-----------|-----------------|-----|-----|
| RDS | Automated daily backups + point-in-time recovery | ~15 min | ~5 min |
| Redis | No persistence (cache only) | N/A | N/A |
| ClickHouse | EFS snapshots | ~10 min | Last snapshot |
| S3 | Cross-region replication (optional) | N/A | Real-time |

---

## 12. Monitoring & Observability

### 12.1 CloudWatch Logs

| Log Group | Contents |
|-----------|----------|
| `/ecs/cyinsight-production` | Application stdout/stderr |
| `/aws/rds/instance/cyinsight-db-production/postgresql` | PostgreSQL logs |

### 12.2 Key Metrics to Watch

| Metric | Source | Alert Threshold |
|--------|--------|----------------|
| ECS Task CPU | CloudWatch | > 80% sustained |
| ECS Task Memory | CloudWatch | > 80% sustained |
| RDS CPU | CloudWatch | > 80% sustained |
| RDS Storage | CloudWatch | > 80% used |
| ALB 5xx Errors | CloudWatch | > 1% of requests |
| ALB Target Health | CloudWatch | < 100% healthy |

---

*Document generated: April 20, 2026*
*Architecture: Single-Stack Starter (Collapsed 3-Plane)*
*Next Evolution: Multi-Plane Distributed (see ARCHITECTURE.md)*

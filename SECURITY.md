# Security Policy — Cyber Command Center

## Overview

Cyber Command Center is an enterprise-grade Managed Security Service Provider
(MSSP) platform. We take security vulnerabilities seriously and appreciate
responsible disclosure from the security community.

---

## Supported Versions

| Version | Supported |
|---------|-----------|
| `main` branch (latest) | Yes |
| Previous releases | Best-effort patch backport |

---

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

### Preferred channel

Email: **security@[your-domain]** *(replace with your actual address)*

Include in your report:
- A clear description of the vulnerability
- Steps to reproduce (proof-of-concept if available)
- Affected component(s): API, auth, data plane, admin portal, etc.
- Potential impact assessment
- Your suggested fix if you have one

### Response SLA

| Stage | Target |
|-------|--------|
| Acknowledgement | Within **24 hours** of receipt |
| Initial triage | Within **72 hours** |
| Remediation — CRITICAL | Within **14 calendar days** |
| Remediation — HIGH | Within **30 calendar days** |
| Remediation — MEDIUM/LOW | Next scheduled release |

We will keep you informed throughout the process and credit you in the
release notes (unless you prefer to remain anonymous).

---

## Scope

### In-scope

- REST API endpoints (`/api/*`)
- Authentication and session management (`/api/auth/*`, `/api/superadmin/login`)
- Multi-tenant data isolation (tenant_id enforcement, row-level access)
- Data plane event ingestion API (`/api/ingest/*`)
- Admin portal (`/admin`) — privilege escalation, IDOR, auth bypass
- Platform integrations (AI providers, EDR connectors, TI feeds)
- Kubernetes / ECS Fargate deployment configuration and secrets handling
- SOAR playbook execution engine

### Out-of-scope

- Rate-limiting bypass without a demonstrated security impact
- Social engineering or phishing attacks targeting our team
- Physical security
- Issues in third-party libraries where there is no direct exploit path in
  our application (report those upstream; we monitor them via Trivy/npm audit)
- Denial-of-service attacks
- Findings from automated scanners without manual validation

---

## DevSecOps Pipeline

This repository enforces automated security gates on every commit:

| Gate | Tool | Severity Threshold |
|------|------|--------------------|
| Secrets detection | Gitleaks | Any finding = block |
| Dependency CVEs | npm audit | HIGH / CRITICAL = block |
| SAST | GitHub CodeQL | All findings reported to Security tab |
| IaC misconfiguration | Checkov | HIGH / CRITICAL = block |
| Container CVEs | Trivy | CRITICAL = block deployment |
| SBOM | Syft / CycloneDX | Generated per production release |

---

## Security Architecture Highlights

- **Authentication**: Username + password with bcrypt hashing (cost factor 12).
  Session tokens stored in Redis (with PostgreSQL fallback). MFA via TOTP.
- **Session security**: HttpOnly, Secure, SameSite=Strict cookies.
  SESSION_SECRET managed via AWS Secrets Manager.
- **Multi-tenancy**: All DB queries enforce `tenant_id` at the ORM layer.
  Cross-tenant data access requires platform_admin role.
- **Secrets management**: All API keys stored in PostgreSQL `platform_integrations`
  table or AWS Secrets Manager. No secrets in environment files committed to git.
- **Transport security**: TLS 1.2+ enforced at the AWS ALB layer. HTTP → HTTPS
  redirect enabled. HSTS header set.
- **Container security**: Non-root user (`appuser`, UID 1001) in Docker image.
  Read-only filesystem recommended (EFS for persistent data).
- **DB connection pool**: Parameterised queries via Drizzle ORM. No raw string
  concatenation in SQL. Statement timeout set to 15 seconds.

---

## GPG Key

For encrypted reports, use our security team GPG key:

```
Key ID:       0xREPLACE_WITH_REAL_KEY_ID
Fingerprint:  REPLACE WITH REAL FINGERPRINT
```

*(Upload your real GPG public key here or link to keybase.io)*

---

## Acknowledgements

We thank the following researchers for responsible disclosure:

*(This section will be populated as reports are received and resolved.)*

---

*This policy was last reviewed: 2026-04*

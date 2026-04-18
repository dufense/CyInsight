##############################################################################
# Cyber Command Center -- Data Plane Docker Image
#
# Multi-stage build with:
#   - AWS RDS CA bundle embedded at build time (avoids SELF_SIGNED_CERT_IN_CHAIN)
#   - startup-with-retry.sh entrypoint (30 retries, 5s wait) for DB readiness
#   - DB_SSL_CA + PGSSLMODE env vars for PostgreSQL TLS enforcement
#
# Build:
#   docker build -f deploy/data-plane/Dockerfile -t ccc-data-plane:latest .
#
# Environment variables (set at runtime via ECS secrets or docker run -e):
#   DATABASE_URL        — PostgreSQL / TimescaleDB connection string
#   DB_SSL_CA           — Path to CA bundle (default: /etc/ssl/certs/rds-ca-bundle.pem)
#   PGSSLMODE           — PostgreSQL SSL mode (default: verify-ca)
#   DATA_PLANE_REGION   — Logical region ID: india | bahrain | kenya
#   AWS_REGION          — AWS region code: ap-south-1 | me-south-1 | af-south-1
#   KAFKA_BROKERS       — MSK bootstrap brokers (comma-separated host:port)
#   CLICKHOUSE_URL      — ClickHouse OLAP endpoint (single source of truth for security events)
#   S3_RAW_BUCKET       — S3 bucket for raw security events
#   MANAGEMENT_PLANE_URL — Internal URL of the management plane
#   AI_PROVIDER         — AI provider (for normalisation pipeline)
#   AI_API_KEY          — AI API key
##############################################################################

FROM node:20-alpine AS base
WORKDIR /app

# ── Dependency install ────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --include=dev

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Runtime image ─────────────────────────────────────────────────────────────
FROM base AS runner

ENV NODE_ENV=production
ENV PORT=5000
ENV PLANE=data
# Default SSL settings — can be overridden at runtime via ECS secrets
ENV DB_SSL_CA=/etc/ssl/certs/rds-ca-bundle.pem
ENV PGSSLMODE=verify-ca
# Persistent data directories — EFS is mounted at /app/data on Fargate
ENV APP_REPORTS_DIR=/app/data/reports
ENV APP_UPLOADS_DIR=/app/data/uploads
# Cap cluster workers for Fargate (data plane gets 2 vCPUs → 4 workers)
ENV CLUSTER_WORKERS_MAX=4

RUN apk add --no-cache \
        curl \
        wget \
        ca-certificates \
        openssl && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# ── Embed AWS RDS CA bundle (avoids SELF_SIGNED_CERT_IN_CHAIN on RDS/Aurora) ─
# Downloads the global bundle which includes all RDS CA generations (2019, 2023, etc.)
# and all regions including ap-south-1, me-south-1, af-south-1.
RUN curl -sSfL \
      "https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem" \
      -o /etc/ssl/certs/rds-ca-bundle.pem && \
    cat /etc/ssl/certs/rds-ca-bundle.pem >> /etc/ssl/certs/ca-certificates.crt && \
    echo "RDS CA bundle installed ($(wc -l < /etc/ssl/certs/rds-ca-bundle.pem) lines)"

# ── Application files ─────────────────────────────────────────────────────────
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/start-prod.js ./start-prod.js
COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/sigma-rules ./sigma-rules

RUN npm prune --production 2>/dev/null; \
    mkdir -p /app/data/events /app/data/parquet /app/data/sigma-cache \
             /app/data/reports /app/data/uploads && \
    chown -R appuser:nodejs /app/data

# ── Startup retry entrypoint ──────────────────────────────────────────────────
COPY --chown=appuser:nodejs deploy/data-plane/start-with-retry.sh /app/start-with-retry.sh
RUN chmod +x /app/start-with-retry.sh

USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/healthz || exit 1

ENTRYPOINT ["/app/start-with-retry.sh"]
CMD ["node", "start-prod.js"]

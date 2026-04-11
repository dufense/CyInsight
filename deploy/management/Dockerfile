##############################################################################
# Cyber Command Center -- Management Plane Docker Image
#
# Multi-stage build with:
#   - AWS RDS CA bundle embedded at build time (avoids SELF_SIGNED_CERT_IN_CHAIN)
#   - startup-with-retry.sh entrypoint (30 retries, 5s wait) for DB readiness
#   - DB_SSL_CA + PGSSLMODE env vars for PostgreSQL TLS enforcement
#
# Build:
#   docker build -f deploy/management/Dockerfile -t ccc-management-plane:latest .
#
# Environment variables (set at runtime via ECS secrets or docker run -e):
#   DATABASE_URL        — PostgreSQL connection string
#   DB_SSL_CA           — Path to CA bundle (default: /etc/ssl/certs/rds-ca-bundle.pem)
#   PGSSLMODE           — PostgreSQL SSL mode (default: verify-ca)
#   SESSION_SECRET      — Express session secret
#   REDIS_URL           — ElastiCache / Redis Sentinel URL
#   AI_PROVIDER         — openai | anthropic | azure | vertex | ollama | custom
#   AI_API_KEY          — AI provider API key
#   KAFKA_BROKERS       — MSK bootstrap brokers (comma-separated host:port)
#   OPENSEARCH_URL      — OpenSearch / ElasticSearch endpoint URL
#   DATA_PLANE_ENDPOINTS — JSON map: {"india":"http://...","bahrain":"http://...","kenya":"http://..."}
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
ENV PLANE=management
# Default SSL settings — can be overridden at runtime via ECS secrets
ENV DB_SSL_CA=/etc/ssl/certs/rds-ca-bundle.pem
ENV PGSSLMODE=verify-ca
# Persistent data directories — EFS is mounted at /app/data on Fargate
ENV APP_REPORTS_DIR=/app/data/reports
ENV APP_UPLOADS_DIR=/app/data/uploads
# Cap cluster workers (matches 1 vCPU Fargate task; override per task size)
ENV CLUSTER_WORKERS_MAX=2

RUN apk add --no-cache \
        ffmpeg \
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
    # Append to system CA store so any library that uses the default store also trusts it
    cat /etc/ssl/certs/rds-ca-bundle.pem >> /etc/ssl/certs/ca-certificates.crt && \
    echo "RDS CA bundle installed ($(wc -l < /etc/ssl/certs/rds-ca-bundle.pem) lines)"

# ── Application files ─────────────────────────────────────────────────────────
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/start-prod.js ./start-prod.js
COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

RUN npm prune --production 2>/dev/null; \
    mkdir -p /app/data/reports /app/data/uploads /tmp/secureops/reports /tmp/secureops/uploads && \
    chown -R appuser:nodejs /app/data /tmp/secureops

# ── Startup retry entrypoint ──────────────────────────────────────────────────
# Waits for the PostgreSQL database to accept connections before launching Node.
# Retries up to 30 times with 5-second intervals (2.5 min total window).
# Reads DB_HOST from DATABASE_URL if DB_HOST is not set explicitly.
COPY --chown=appuser:nodejs deploy/management/start-with-retry.sh /app/start-with-retry.sh
RUN chmod +x /app/start-with-retry.sh

USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/healthz || exit 1

ENTRYPOINT ["/app/start-with-retry.sh"]
CMD ["node", "start-prod.js"]

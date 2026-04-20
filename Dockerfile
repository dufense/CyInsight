FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --include=dev

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=5000
# Default persistent data directories — override with APP_REPORTS_DIR / APP_UPLOADS_DIR.
# On ECS Fargate the EFS volume is mounted at /app/data, so set these to subdirs there
# so that reports and uploads survive task restarts and are shared across task replicas.
ENV APP_REPORTS_DIR=/app/data/reports
ENV APP_UPLOADS_DIR=/app/data/uploads
# Cap cluster workers to avoid OOM on Fargate tasks (task CPU / 1 vCPU ≈ 2 workers).
# Override per environment: CLUSTER_WORKERS_MAX=1 for 0.5 vCPU, =4 for 2 vCPU, etc.
ENV CLUSTER_WORKERS_MAX=2

RUN apk add --no-cache ffmpeg curl wget && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/start-prod.js ./start-prod.js
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/migration-data ./migration-data
RUN rm -f /app/migration-data/.migrated
COPY rds-ca-bundle.pem /etc/ssl/certs/rds-ca-bundle.pem

RUN npm prune --production 2>/dev/null

# /app/data is the EFS mount point on Fargate. Pre-create subdirs so the app
# can write before the first request even if EFS is mounted read-write.
# Also keep /tmp fallbacks so the image works without EFS (local dev / CI).
RUN mkdir -p /app/data/reports /app/data/uploads /app/data/events \
             /tmp/secureops/reports /tmp/secureops/uploads /tmp/secureops/events && \
    chown -R appuser:nodejs /app/data /tmp/secureops

USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/_health || exit 1

# Use start-prod.js (cluster manager) instead of running the CJS bundle directly.
# It respects CLUSTER_WORKERS_MAX for Fargate memory safety and sends SIGTERM
# gracefully to all workers on container stop.
CMD ["node", "start-prod.js"]

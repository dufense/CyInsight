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
ENV PLANE=receiver
# Persistent data directories — EFS is mounted at /app/data on Fargate
ENV APP_REPORTS_DIR=/app/data/reports
ENV APP_UPLOADS_DIR=/app/data/uploads
# Receiver is single-worker (lightweight ingest only)
ENV CLUSTER_WORKERS_MAX=1

RUN apk add --no-cache \
        ffmpeg \
        curl \
        wget \
        ca-certificates && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/start-prod.js ./start-prod.js
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/sigma-rules ./sigma-rules

RUN npm prune --production 2>/dev/null; \
    mkdir -p /app/data/reports /app/data/uploads && \
    chown -R appuser:nodejs /app/data

USER appuser

EXPOSE 5000
EXPOSE 514/udp
EXPOSE 1514
EXPOSE 6514

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/healthz || exit 1

CMD ["node", "start-prod.js"]

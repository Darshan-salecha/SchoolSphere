# syntax=docker/dockerfile:1

# SchoolSphere production image.
#
# Four stages:
#   deps    — install every dependency once, cached on the lockfile alone
#   builder — compile the Next.js app into a standalone server
#   tools   — full source + dev dependencies, used for one-off migrate/seed jobs
#   runner  — the tiny image that actually serves traffic, as a non-root user

ARG NODE_VERSION=22-alpine

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------------------------------------------------------------------------
FROM base AS deps
# Copying only the manifests means this layer is reused until a dependency
# actually changes, which is what keeps rebuilds fast.
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
# Placeholders only. Next needs these variables to exist while compiling; the
# real values are injected at runtime and never baked into the image.
ENV DATABASE_URL=postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder
ENV AUTH_SECRET=placeholder-build-secret-not-used-at-runtime-0000
RUN npm run build

# ---------------------------------------------------------------------------
# One-off jobs (migrations, seeding). Keeps dev dependencies so `tsx` and
# `drizzle-kit` are available; never exposed to traffic.
FROM base AS tools
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["node", "scripts/migrate.mjs"]

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_LOCAL_DIR=/app/.storage

# dumb-init reaps zombies and forwards SIGTERM, so containers stop cleanly.
RUN apk add --no-cache dumb-init \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Uploads live here. Mount a volume over it, or switch STORAGE_PROVIDER to S3
# once you run more than one instance.
RUN mkdir -p /app/.storage && chown -R nextjs:nodejs /app/.storage

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]

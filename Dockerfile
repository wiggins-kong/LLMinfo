# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# LLMinfo — single-container Next.js + SQLite image (linux/amd64)
#
# Debian slim rather than Alpine: better-sqlite3 ships a glibc prebuild
# (prebuilds/linux-x64.node) so no compiler is needed, and musl would force a
# source build plus a larger toolchain layer.
# ---------------------------------------------------------------------------

FROM node:24-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Only the manifests, so dependency installation is cached independently of
# source changes.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund


FROM node:24-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `next build` evaluates route modules; point DATA_DIR at a scratch path so the
# build never touches (or locks) a real volume.
ENV DATA_DIR=/tmp/build-data
ENV AUTH_SECRET=build-time-placeholder-not-used-at-runtime
RUN npm run build


FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATA_DIR=/data

# dumb-init reaps zombies and forwards signals, so `docker stop` is graceful.
RUN apt-get update \
 && apt-get install --no-install-recommends -y dumb-init ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Non-root runtime: the container only needs to write /data.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs \
 && mkdir -p /data/logos \
 && chown -R nextjs:nodejs /data

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# The health endpoint also runs the bootstrap sequence, so a healthy container
# is one whose admin account and first snapshot are ready.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]

# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# LLMinfo - single-container Next.js + SQLite image (linux/amd64)
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

# --ignore-scripts is REQUIRED here, and it must be an inline flag rather than
# an ENV (an ENV would also suppress `postbuild` in the builder stage below).
#
# Why: better-sqlite3 ships prebuilds/linux-x64.node and its tarball sets
# `"gypfile": false` precisely so npm will not compile it. But package-lock.json
# does not record that field, and npm decides by `pkg.gypfile !== false`, so on
# a lockfile-driven `npm ci` it synthesises `node-gyp rebuild`. node:24-slim has
# no Python, so the install aborts.
#
# Skipping install scripts is safe for this tree: the only package that
# declares one is esbuild, whose postinstall merely validates and copies the
# platform binary that npm already unpacked from optionalDependencies.
RUN npm ci --ignore-scripts --no-audit --no-fund


FROM node:24-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `next build` evaluates route modules, which construct the auth object and so
# read AUTH_SECRET. A throwaway value is supplied inline for the build only:
# as a plain shell variable it never becomes an image layer, and it avoids
# Docker's SecretsUsedInArgOrEnv warning. It is never used to sign anything.
#
# DATA_DIR points at a scratch path so the build cannot touch (or lock) a real
# volume.
ENV DATA_DIR=/tmp/build-data
RUN AUTH_SECRET=build-only-placeholder-not-a-real-secret npm run build


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

# `public/` is optional in this repository, and `postbuild` already mirrors it
# into `.next/standalone` when present. Copying it separately here would make
# Docker fail when the directory does not exist, so the standalone layer is the
# single source of truth for runtime assets.

# Container-side admin tooling (`npm run create-user`, `npm run migrate`).
#
# These run against the TypeScript sources directly: there is no bundler in the
# runtime image, and Node 24 strips types natively. Only the two scripts that
# are meaningful at runtime plus the two modules they import are copied, which
# keeps this to a few KB rather than shipping the whole src tree (or tsx and
# its ~11 MB of dependencies). gen-auth-schema and prepare-standalone are
# build-time tools and stay out of the runtime image.
COPY --from=builder --chown=nextjs:nodejs /app/scripts/create-user.ts ./scripts/create-user.ts
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.ts ./scripts/migrate.ts
COPY --from=builder --chown=nextjs:nodejs /app/src/db/schema-ddl.ts ./src/db/schema-ddl.ts
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/user-admin.ts ./src/lib/user-admin.ts

USER nextjs
EXPOSE 3000

# The health endpoint also runs the bootstrap sequence, so a healthy container
# is one whose admin account and first snapshot are ready.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]

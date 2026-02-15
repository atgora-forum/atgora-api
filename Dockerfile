# Multi-stage build for barazo-api
# Build context: monorepo root (docker build -f barazo-api/Dockerfile .)

# ---------------------------------------------------------------------------
# Stage 1: Install dependencies
# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /workspace

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.29.2 --activate

# Copy workspace root config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy all workspace package.json files (needed for pnpm install)
COPY barazo-lexicons/package.json ./barazo-lexicons/
COPY barazo-api/package.json ./barazo-api/
COPY barazo-web/package.json ./barazo-web/

# Install all dependencies (including devDeps for tsc build)
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 2: Build
# ---------------------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.29.2 --activate

# Copy installed dependencies
COPY --from=deps /workspace/ ./

# Copy lexicons source (workspace dependency)
COPY barazo-lexicons/ ./barazo-lexicons/

# Copy API source
COPY barazo-api/ ./barazo-api/

# Build lexicons first (workspace dependency), then API
RUN pnpm --filter @barazo-forum/lexicons build && \
    pnpm --filter barazo-api build

# Create standalone production deployment:
# Pack lexicons as tarball, then install API prod deps with npm
RUN cd /workspace/barazo-lexicons && pnpm pack --pack-destination /tmp && \
    mkdir -p /app/deploy && \
    cp /workspace/barazo-api/package.json /app/deploy/ && \
    cd /app/deploy && \
    npm install --omit=dev --install-links \
      $(ls /tmp/barazo-forum-lexicons-*.tgz) && \
    rm -rf /root/.npm

# ---------------------------------------------------------------------------
# Stage 3: Production runner
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 barazo

# Copy production deployment (node_modules + package.json)
COPY --from=builder /app/deploy/ ./

# Copy compiled output
COPY --from=builder /workspace/barazo-api/dist/ ./dist/

# Create plugins directory for runtime plugin loading
RUN mkdir -p /app/plugins && chown barazo:nodejs /app/plugins

USER barazo

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "dist/server.js"]

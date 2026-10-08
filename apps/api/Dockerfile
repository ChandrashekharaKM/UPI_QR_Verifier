# Multi-stage Dockerfile for UPI QR Verifier API
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm and native compilation tools for better-sqlite3
RUN apk add --no-cache python3 make g++ gcc
RUN corepack enable && corepack prepare pnpm@12.10.1 --activate

# Copy workspace configs
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json .npmrc ./
COPY packages/core/package.json ./packages/core/
COPY apps/api/package.json ./apps/api/
COPY ml/package.json ./ml/

# Install dependencies
RUN pnpm install --frozen-lockfile
RUN pnpm approve-builds --all

# Copy source trees
COPY packages/core ./packages/core
COPY apps/api ./apps/api

# Build core library
RUN pnpm --filter @upi-verifier/core build

# ----------------------------------------------------
# Production Runtime Stage
# ----------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/app/data/data.sqlite

# Copy built dependencies and app from builder
COPY --from=builder /app ./

# Create data directory for persistent SQLite
RUN mkdir -p /app/data

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/v1/health || exit 1

CMD ["node", "apps/api/dist/server.js"]

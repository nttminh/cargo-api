# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Cargo API: multi-stage production image
#   docker build -t cargo-api:latest .
# ---------------------------------------------------------------------------
ARG NODE_VERSION=20.18.1

# ---- deps: full dependency tree for building -------------------------------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---- build: compile TypeScript ----------------------------------------------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build \
 && npm prune --omit=dev --no-audit --no-fund

# ---- runtime: minimal, non-root ---------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS="--enable-source-maps --max-old-space-size=384"
WORKDIR /app

# tini: proper PID 1 so SIGTERM from Kubernetes reaches Node and zombies are reaped.
RUN apk add --no-cache tini

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/health/live > /dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]

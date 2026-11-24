# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# One image per service, from the same Dockerfile:
#   docker build --build-arg APP=gateway     -t cargo-gateway .
#   docker build --build-arg APP=identity    -t cargo-identity .
#   docker build --build-arg APP=master-data -t cargo-master-data .
#   docker build --build-arg APP=shipments   -t cargo-shipments .
# ---------------------------------------------------------------------------
ARG NODE_VERSION=22.23.5

# ---- deps: full dependency tree for building (shared by all services) ------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---- build: compile one service ---------------------------------------------
FROM deps AS build
ARG APP
RUN test -n "$APP" || (echo "Set --build-arg APP=<gateway|identity|master-data|shipments>" && exit 1)
COPY tsconfig.json nest-cli.json ./
COPY libs ./libs
COPY apps/${APP} ./apps/${APP}
RUN npx nest build ${APP} \
 && npm prune --omit=dev --no-audit --no-fund

# ---- runtime: minimal, non-root ---------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
ARG APP
ENV NODE_ENV=production \
    APP=${APP} \
    TZ=UTC \
    PORT=3000 \
    NODE_OPTIONS="--enable-source-maps --max-old-space-size=384"
WORKDIR /app
LABEL org.opencontainers.image.title="cargo-${APP}"

# tini: proper PID 1 so SIGTERM from Kubernetes reaches Node and zombies are reaped.
RUN apk add --no-cache tini

COPY --from=build --chown=node:node /app/node_modules ./node_modules
# Compiled service plus the shared libraries it uses:
#   dist/apps/<app>/src/main.js, dist/libs/...
COPY --from=build --chown=node:node /app/dist/apps/${APP} ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/health/live > /dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
# exec: node replaces the shell, so it receives signals from tini directly.
CMD ["/bin/sh", "-c", "exec node dist/apps/$APP/src/main.js"]

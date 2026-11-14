# Pin both toolchain versions independently of Railway's builder image.
FROM node:24.22.2-bookworm-slim AS base

RUN apt-get update \
  && apt-get install --yes --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global npm@11.19.1 \
  && test "$(node --version)" = "v24.22.2" \
  && test "$(npm --version)" = "11.19.1"

COPY certs/railway-production-postgres-root.crt /usr/local/share/ca-certificates/flow-production-postgres-root.crt
RUN update-ca-certificates

WORKDIR /app

FROM base AS dependencies
COPY package.json package-lock.json .npmrc ./
RUN npm ci

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 FLOW_ENV=staging FLOW_EXECUTION=disabled
RUN printf 'Build toolchain: node %s, npm %s\n' "$(node --version)" "$(npm --version)" \
  && npm run build

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_USE_SYSTEM_CA=1 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/src ./src

USER node
EXPOSE 3000
CMD ["node", "scripts/railway-start.mjs"]

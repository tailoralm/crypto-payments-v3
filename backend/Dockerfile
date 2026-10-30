FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN case "$TARGETARCH" in amd64) checksum=1f99fb518b83dec2ba8d870a7cc991d82a77e6196295a3d2754ba17ab9f91872 ;; arm64) checksum=3df43aedc9ff291d1735b5cb576cb97e0b157488796db2e32b28aecabb445775 ;; *) exit 1 ;; esac \
    && curl -fsSL "https://github.com/cloudflare/cloudflared/releases/download/2026.10.7/cloudflared-linux-${TARGETARCH}" -o /usr/local/bin/cloudflared \
    && echo "$checksum  /usr/local/bin/cloudflared" | sha256sum -c - \
    && chmod 755 /usr/local/bin/cloudflared
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]

FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS build
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=384
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.server.json vite.config.* index.html ./
COPY server ./server
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force && mkdir -p /data/attachments && chown -R node:node /data
COPY --from=build /app/dist/server ./dist/server
COPY --from=build /app/dist/web ./public
COPY migrations ./migrations
COPY deploy/entrypoint.cjs ./entrypoint.cjs
USER node
EXPOSE 8080
CMD ["node","entrypoint.cjs"]

# Explicit operator-only target: PostgreSQL 17 clients and the same Node runtime.
FROM postgres:17.11-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826 AS maintenance
WORKDIR /app
COPY --from=runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=runtime /app/node_modules ./node_modules
COPY deploy/backup.cjs deploy/maintenance.cjs ./
ENV PG_BIN=/usr/lib/postgresql/17/bin
ENV NODE_OPTIONS=--max-old-space-size=320
USER 1000:1000
ENTRYPOINT ["node","maintenance.cjs"]

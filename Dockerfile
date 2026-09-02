# Build ------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# Install against the lockfile only, so a source change does not re-resolve
# the dependency tree.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Run --------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# The pipeline lives here. Mount a volume at this path — see DEPLOY.md.
ENV BCC_DATA_DIR=/data
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S nextjs -G nodejs \
 && mkdir -p /data \
 && chown -R nextjs:nodejs /data

# `output: "standalone"` produces a self-contained server plus the minimum
# node_modules; static assets and public/ are copied alongside it.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/bcc/health || exit 1

CMD ["node", "server.js"]

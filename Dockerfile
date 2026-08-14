# Small, unprivileged, no build step (Node strips TypeScript at runtime).
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY src ./src
COPY scripts ./scripts

# Run as a non-root user. If this process is ever compromised, it should not
# own the machine.
RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV NODE_ENV=production
ENV DB_PATH=/app/data/driftwatch.db
ENV START_SERVER=1
EXPOSE 4021

HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:4021/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--experimental-strip-types", "src/api/server.ts"]

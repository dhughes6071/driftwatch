FROM apify/actor-node:22

COPY package.json ./
RUN npm install --omit=dev --omit=optional --no-audit --no-fund

COPY src ./src
# The health-system registry, read by src/health.ts.
COPY sources ./sources

CMD ["node", "--experimental-strip-types", "src/main.ts"]

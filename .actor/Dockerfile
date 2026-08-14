FROM apify/actor-node:22

COPY package.json ./
RUN npm install --omit=dev --omit=optional --no-audit --no-fund \
 && echo "Installed:" && npm ls --omit=dev --all 2>/dev/null || true

COPY src ./src

# Node strips the TypeScript at runtime -- no build step, nothing to break.
CMD ["node", "--experimental-strip-types", "src/jobs/main.ts"]

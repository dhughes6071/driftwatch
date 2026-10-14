FROM apify/actor-node:22

COPY package.json ./
RUN npm install --omit=dev --omit=optional --no-audit --no-fund

# Only the Actor runs on Apify; crawler/ runs on the owner's machine.
COPY src ./src

CMD ["node", "--experimental-strip-types", "src/main.ts"]

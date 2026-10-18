FROM apify/actor-node:22

COPY package.json ./
RUN npm install --omit=dev --omit=optional --no-audit --no-fund

# Only the Actor runs on Apify; crawler/ runs on the owner's machine.
COPY src ./src
# Standby mode reads the input schema to parse GET parameters.
COPY .actor/input_schema.json ./.actor/input_schema.json

CMD ["node", "--experimental-strip-types", "src/main.ts"]

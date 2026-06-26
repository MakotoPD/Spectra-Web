# Stage 1: Install dependencies and build
FROM node:22-alpine AS builder

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN apk add --no-cache python3 make g++ && \
    pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

# Nitro copies the better-sqlite3 JS into .output but NOT its compiled native
# addon (.node), so `bindings` can't find it at runtime. Locate the binary that
# was compiled in this stage (pnpm hides it under node_modules/.pnpm/...) and
# drop it into the server output where bindings looks for it.
RUN set -e; \
    BIN="$(find /app/node_modules -name better_sqlite3.node -path '*better-sqlite3*' | head -n1)"; \
    test -n "$BIN"; \
    mkdir -p .output/server/node_modules/better-sqlite3/build/Release; \
    cp "$BIN" .output/server/node_modules/better-sqlite3/build/Release/better_sqlite3.node; \
    echo "embedded $BIN"

# Stage 2: Production image
FROM node:22-alpine AS production

WORKDIR /app

COPY --from=builder /app/.output ./.output

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]

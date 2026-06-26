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

# Stage 2: Production image
FROM node:22-alpine AS production

WORKDIR /app

COPY --from=builder /app/.output ./.output

# better-sqlite3 is a native addon that Nitro can't bundle. Install it (compiled
# for this exact musl/arch image) so `require('better-sqlite3')` resolves at
# runtime via /app/node_modules. Build tools are removed afterwards to stay slim.
RUN apk add --no-cache python3 make g++ \
    && npm install --omit=dev better-sqlite3@12.11.1 \
    && apk del python3 make g++

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]

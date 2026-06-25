# Stage 1: Install dependencies and build
FROM node:22-alpine AS builder

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

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]

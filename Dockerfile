# ─── Builder ────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

# Install pnpm.
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

# Cache deps layer.
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod=false

# Build.
COPY . .
RUN pnpm build

# Strip dev deps for the runtime layer.
RUN pnpm prune --prod

# ─── Runtime ───────────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/db/drizzle ./db/drizzle
COPY --from=builder /app/db/init.sql ./db/init.sql
COPY --from=builder /app/db/data.sql ./db/data.sql
COPY --from=builder /app/package.json ./package.json

EXPOSE 4000
CMD ["node", "dist/src/main.js"]

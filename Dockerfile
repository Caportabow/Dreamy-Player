# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app

# ---- deps: full install (used by dev compose and the build stage) ----
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps --no-audit --no-fund

# ---- build: compile the Nuxt app ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runner: minimal runtime image ----
FROM base AS runner
ENV NODE_ENV=production
ENV HOST=0.0.0.0
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --legacy-peer-deps --no-audit --no-fund

COPY --from=build /app/.output ./.output
COPY --from=build /app/server/db/migrations ./server/db/migrations
COPY --from=build /app/scripts ./scripts

EXPOSE 3000

# Apply migrations, then start the server.
CMD ["sh", "-c", "node scripts/migrate.mjs && node .output/server/index.mjs"]

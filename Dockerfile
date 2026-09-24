# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Supabase browser configuration is intentionally public and baked into the
# client bundle. Keep Docker ARG names free of secret-like identifiers so
# build tooling does not misclassify the publishable browser value.
ARG KIDE_SUPABASE_URL
ARG KIDE_SUPABASE_PUBLISHABLE
ARG KIDE_SUPABASE_PROJECT

RUN VITE_SUPABASE_URL="$KIDE_SUPABASE_URL" \
    VITE_SUPABASE_PUBLISHABLE_KEY="$KIDE_SUPABASE_PUBLISHABLE" \
    VITE_SUPABASE_PROJECT_ID="$KIDE_SUPABASE_PROJECT" \
    KIDE_NODE_BUILD=1 \
    bun run build

# ---- Runtime stage ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080

COPY --from=build /app/.output ./.output

EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]

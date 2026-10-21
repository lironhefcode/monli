# Build context is the repo root (npm workspaces: lockfile lives there).

# --- Frontend: static SPA build.
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
RUN npm ci --workspace frontend --ignore-scripts

COPY frontend frontend
# The auth client types its roles from the backend's access-control definitions.
COPY backend/src/auth/permissions.ts backend/src/auth/permissions.ts
WORKDIR /app/frontend
RUN npx nuxt prepare && npm run build

# --- nginx: serves the SPA and proxies /api to the backend.
FROM nginx:1.27-alpine
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/frontend/.output/public /usr/share/nginx/html

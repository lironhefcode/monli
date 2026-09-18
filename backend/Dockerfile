# Build context is the repo root (npm workspaces: lockfile lives there).
FROM node:22-alpine

RUN apk add --no-cache openssl

WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
RUN npm ci

COPY backend backend
WORKDIR /app/backend
RUN npx prisma generate && npm run build

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
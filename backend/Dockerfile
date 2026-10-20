# Build context is the repo root (npm workspaces: lockfile lives there).

# --- Agent: static Linux x86_64 binary served at /agents/download/linux-x86_64.
# Alpine's toolchain targets musl, so the result runs on any Linux distro.
FROM rust:1.87-alpine AS agent-build
RUN apk add --no-cache musl-dev
WORKDIR /agent
COPY agent/Cargo.toml agent/Cargo.lock agent/build.rs ./
COPY agent/src src
RUN cargo build --release --locked

# --- Agent: Windows x86_64 exe, cross-compiled with the mingw-w64 toolchain.
# The server appends the URL and token to it per download (agent/src/baked.rs).
FROM rust:1.87-alpine AS agent-build-windows
RUN apk add --no-cache musl-dev mingw-w64-gcc
RUN rustup target add x86_64-pc-windows-gnu
WORKDIR /agent
COPY agent/Cargo.toml agent/Cargo.lock agent/build.rs ./
COPY agent/src src
RUN cargo build --release --locked --target x86_64-pc-windows-gnu

# --- Backend.
FROM node:22-alpine

RUN apk add --no-cache openssl

WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
RUN npm ci

COPY backend backend
WORKDIR /app/backend
RUN npx prisma generate && npm run build

COPY --from=agent-build /agent/target/release/monli-agent agent-dist/monli-agent-linux-x86_64
COPY --from=agent-build-windows /agent/target/x86_64-pc-windows-gnu/release/monli-agent.exe agent-dist/monli-agent-windows-x86_64.exe

EXPOSE 3000
# Seed inserts only missing built-in metrics, so it's safe on every start.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/db/seed.js && node dist/index.js"]

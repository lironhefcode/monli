# Build context is the repo root (npm workspaces: lockfile lives there).

# --- Agent: static Linux x86_64 binary served at /agents/download/linux-x86_64.
# Alpine's toolchain targets musl, so the result runs on any Linux distro.
FROM rust:1.87-alpine AS agent-build
RUN apk add --no-cache musl-dev
# "release" for shipping; docker-compose.dev.yml passes "fast" (no LTO).
ARG AGENT_PROFILE=release
WORKDIR /agent
COPY agent/Cargo.toml agent/Cargo.lock agent/build.rs ./
COPY agent/src src
# Cache mounts keep the crate downloads and compiled dependencies between
# builds, so a source change only recompiles the agent itself. The target dir
# is a cache, not part of the image, so the binary is copied out of it.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/agent/target,id=agent-target-linux \
    cargo build --profile "$AGENT_PROFILE" --locked \
    && cp "target/$AGENT_PROFILE/monli-agent" /monli-agent

# --- Agent: Windows x86_64 exe, cross-compiled with the mingw-w64 toolchain.
# The server appends the URL and token to it per download (agent/src/baked.rs).
FROM rust:1.87-alpine AS agent-build-windows
RUN apk add --no-cache musl-dev mingw-w64-gcc
RUN rustup target add x86_64-pc-windows-gnu
ARG AGENT_PROFILE=release
WORKDIR /agent
COPY agent/Cargo.toml agent/Cargo.lock agent/build.rs ./
COPY agent/src src
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/agent/target,id=agent-target-windows \
    cargo build --profile "$AGENT_PROFILE" --locked --target x86_64-pc-windows-gnu \
    && cp "target/x86_64-pc-windows-gnu/$AGENT_PROFILE/monli-agent.exe" /monli-agent.exe

# --- Backend dependencies, shared by the dev and prod images.
FROM node:22-alpine AS backend-base
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
RUN npm ci
WORKDIR /app/backend
EXPOSE 3000

# --- Dev: runs from source with tsx watch. docker-compose.dev.yml bind-mounts
# src/ and prisma/ over these copies, so edits apply without a rebuild.
FROM backend-base AS dev
COPY backend/tsconfig.json ./
COPY backend/prisma prisma
COPY backend/src src
COPY --from=agent-build /monli-agent agent-dist/monli-agent-linux-x86_64
COPY --from=agent-build-windows /monli-agent.exe agent-dist/monli-agent-windows-x86_64.exe
# generate runs on start so a schema change only needs a container restart.
CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && npx tsx src/db/seed.ts && npm run dev"]

# --- Prod (default target: the last stage).
FROM backend-base
COPY backend .
RUN npx prisma generate && npm run build

# Copied last so an agent change doesn't invalidate the TypeScript build layer.
COPY --from=agent-build /monli-agent agent-dist/monli-agent-linux-x86_64
COPY --from=agent-build-windows /monli-agent.exe agent-dist/monli-agent-windows-x86_64.exe

# Seed inserts only missing built-in metrics, so it's safe on every start.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/db/seed.js && node dist/index.js"]

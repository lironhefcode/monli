import { config as loadDotenv } from "dotenv";
import { defineConfig } from "vitest/config";

// So TEST_DATABASE_URL can be set in backend/.env as well as in the shell.
loadDotenv({ quiet: true });

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgresql://monli:monli@localhost:5433/monli_test";

// Two projects: unit/ tests pure helpers and needs nothing running. services/
// and routes/ run against a real Postgres (docker-compose.test.yml, started
// with `npm run test:db`). Those files share that database, so files run one
// at a time.
export default defineConfig({
  test: {
    fileParallelism: false,
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "db",
          include: ["test/services/**/*.test.ts", "test/routes/**/*.test.ts"],
          globalSetup: ["test/global-setup.ts"],
          // src/config/env.ts parses these at import time.
          env: {
            DATABASE_URL: databaseUrl,
            PUBLIC_API_URL: "http://localhost:3000",
            BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
            AUTH_TRUSTED_ORIGINS: "",
          },
        },
      },
    ],
  },
});

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import type { TestProject } from "vitest/node";
import { assertTestDatabase } from "./helpers/test-database.js";

// Brings the test database's schema up to date. The database itself is
// throwaway (tmpfs in docker-compose.test.yml), and tests empty the tables
// they use, so nothing needs to be reset here. DATABASE_URL comes from
// test.env in vitest.config.ts.
export default function setup(project: TestProject) {
  const databaseUrl = project.config.env.DATABASE_URL;
  assertTestDatabase(databaseUrl);

  // Run Prisma's CLI with node directly: no shell, so it works the same on Windows.
  const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}

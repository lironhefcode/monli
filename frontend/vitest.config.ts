import { defineVitestProject } from "@nuxt/test-utils/config";
import { defineConfig } from "vitest/config";

// Two projects: plain functions run in node without booting Nuxt; components,
// composables and middleware run in the Nuxt environment, with auto-imports.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      await defineVitestProject({
        test: {
          name: "nuxt",
          include: ["test/nuxt/**/*.test.ts"],
          environment: "nuxt",
        },
      }),
    ],
  },
});

import { createConfigForNuxt } from "@nuxt/eslint-config/flat";

// Same TypeScript rules as the backend (backend/eslint.config.mjs).
export default createConfigForNuxt().append({
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { args: "after-used", argsIgnorePattern: "^_" },
    ],
  },
});

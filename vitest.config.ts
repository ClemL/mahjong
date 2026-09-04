import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 60000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` throws outside a React Server Component; stub it so the
      // room service can be unit tested directly.
      "server-only": path.resolve(__dirname, "./test/stubs/server-only.ts"),
    },
  },
});

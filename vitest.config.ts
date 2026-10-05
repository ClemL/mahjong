import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // tsconfig keeps JSX for Next to compile; the tests need it compiled here.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // Component tests opt into jsdom per file, so the engine fuzz keeps the
    // faster node environment.
    setupFiles: ["./test/setupDom.ts"],
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

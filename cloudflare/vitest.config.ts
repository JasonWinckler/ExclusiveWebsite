import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Cloudflare build runners share limited CPU/memory; bound file workers
    // so parallel suite startup cannot starve otherwise fast tests.
    maxWorkers: 2,
    // Shared CI hosts can pause even synchronous template/SQLite tests long
    // enough to exceed Vitest's local default. Keep a finite CI allowance.
    testTimeout: process.env.CI ? 15_000 : 5_000,
    include: ["test/**/*.test.ts"],
    coverage: {
      include: ["src/**/*.ts"],
    },
  },
});

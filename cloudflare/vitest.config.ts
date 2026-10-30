import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Cloudflare build runners share limited CPU/memory; bound file workers
    // so parallel suite startup cannot starve otherwise fast tests.
    maxWorkers: 2,
    include: ["test/**/*.test.ts"],
    coverage: {
      include: ["src/**/*.ts"],
    },
  },
});

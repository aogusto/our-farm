import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./src/env.ts"],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});

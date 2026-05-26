import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./src/env.ts"],
    globalSetup: ["./src/test/global-teardown.ts"],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});

import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const testDb = process.env.TEST_DATABASE_URL ?? env.TEST_DATABASE_URL;
  // Global setup runs in this process, so expose the URL here as well.
  if (testDb) process.env.TEST_DATABASE_URL = testDb;
  return {
    resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
    test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
      globalSetup: ["tests/global-setup.ts"],
      // Integration tests share one database, so files run sequentially.
      fileParallelism: false,
      testTimeout: 30_000,
      hookTimeout: 60_000,
      env: { DATABASE_URL: testDb ?? "", TEST_DATABASE_URL: testDb ?? "", NODE_ENV: "test", APP_URL: "http://localhost:3000" },
    },
  };
});

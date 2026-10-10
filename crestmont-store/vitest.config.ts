import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Unit tests:     src/**\/*.test.ts    — pure logic and static security checks.
 * Database tests: tests/db/**\/*.test.ts — run against a disposable LOCAL
 *                 MySQL/MariaDB given in TEST_DATABASE_URL; skipped otherwise.
 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

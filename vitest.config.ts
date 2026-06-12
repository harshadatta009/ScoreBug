/**
 * Vitest configuration.
 *
 * - jsdom environment so React Testing Library can render components.
 * - "@/*" alias mirrors the tsconfig path so engine tests import domain
 *   modules without relative ../../ hell.
 * - E2E tests live in tests/e2e and are run exclusively by Playwright; they
 *   are excluded here to prevent Vitest from trying to run browser APIs.
 * - Coverage uses V8 (built into Node) to avoid a Babel/Istanbul round-trip.
 */

import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "tests/e2e/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      // The Vitest unit suite owns the pure domain logic (scoring engine, stats).
      // UI, pages, stores, server actions and lib glue are exercised by the
      // Playwright E2E suite instead, so we scope the coverage gate to the
      // domain — otherwise the (intentionally) untested UI drags the global
      // number down and the threshold stops measuring anything meaningful.
      include: ["src/domain/**"],
      exclude: [
        "node_modules/**",
        "tests/e2e/**",
        "**/__tests__/**",
        "**/*.test.{ts,tsx}",
        "**/*.config.{ts,mjs,js}",
        "**/*.d.ts",
        ".next/**",
        "src/app/sw.ts",
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 55,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

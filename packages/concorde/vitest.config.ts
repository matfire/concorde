import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test environment
    environment: "node",

    // Test file patterns
    include: ["src/**/*.{test,spec}.{js,ts}"],
    exclude: ["dist/**", "node_modules/**"],

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/**/*.{js,ts}"],
      exclude: [
        "src/**/*.{test,spec}.{js,ts}",
        "src/**/__tests__/**",
        "src/**/test-utils.ts",
        "src/index.ts", // Just re-exports, no logic to test
        "src/types.ts", // Type definitions only
        "dist/**",
        "node_modules/**",
        "**/*.d.ts",
      ],
      // Coverage thresholds (based on current excellent coverage)
      thresholds: {
        global: {
          branches: 85,
          functions: 100,
          lines: 95,
          statements: 95,
        },
      },
      // Output directory for coverage reports
      reportsDirectory: "./coverage",

      // Enable clean directory before collecting coverage
      clean: true,

      // Fail if coverage is below thresholds
      skipFull: false,
    },

    // Globals for better DX
    globals: true,

    // Reporter configuration
    reporters: ["verbose"],

    // Timeout settings
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});

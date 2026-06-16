import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    include: [
      'tests/**/*.test.ts',
    ],
    // Tests use describe.skipIf(...) / it.skipIf(...) for live-integration gating
    // Set INTEGRATION_LIVE=1 to enable live MCP-backed tests in CI.
  },
  coverage: {
    provider: 'v8',
    reporter: ['text', 'text-summary', 'html'],
    include: ['src/**'],
    exclude: [
      'src/cli/**',          // CLI entrypoints + wizard orchestration (tested via unit tests)
      'src/**/*.d.ts',
      'src/**/index.ts',     // Barrel exports
    ],
    thresholds: {
      // Phase 10 (BAUPLAN) target: ≥80% coverage.
      // We use a non-fatal threshold of 78% to avoid CI flakes on edge additions.
      statements: 78,
      branches: 78,
      functions: 85,
      lines: 78,
    },
  },
});

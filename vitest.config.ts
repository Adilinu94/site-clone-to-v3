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
});

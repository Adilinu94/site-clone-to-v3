/**
 * Centralized gate for live integration tests.
 *
 * Live tests (those that hit real MCP endpoints, real WordPress instances,
 * or any external HTTP service) are skipped unless explicitly enabled.
 *
 * Enable via env var: INTEGRATION_LIVE=1
 * Required for live tests:
 *   - INTEGRATION_LIVE=1        opt-in
 *   - NOVAMIRA_TEST_TOKEN      bearer token for test4.nick-webdesign.de
 *   - NOVAMIRA_TEST_ENDPOINT   full MCP endpoint URL
 */

export function isLiveEnabled(): boolean {
  return process.env.INTEGRATION_LIVE === '1';
}

export function requireLiveEnv(): { token: string; endpoint: string } {
  const token = process.env.NOVAMIRA_TEST_TOKEN;
  const endpoint = process.env.NOVAMIRA_TEST_ENDPOINT;
  if (!token || !endpoint) {
    throw new Error(
      'Live integration tests require NOVAMIRA_TEST_TOKEN and NOVAMIRA_TEST_ENDPOINT env vars. ' +
        'These should be set in CI via repository secrets, never committed.',
    );
  }
  return { token, endpoint };
}

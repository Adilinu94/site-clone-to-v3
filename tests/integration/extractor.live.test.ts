/**
 * Live integration test for Playwright Extractor.
 *
 * Runs the full extraction pipeline against real URLs.
 * Tests:
 *   - Public site (example.com) — no auth, no MCP required, validates Playwright stack
 *   - Self-test against test4.nick-webdesign.de — validates source-auth injection
 *
 * Enable with INTEGRATION_LIVE=1.
 */

import { describe, it, expect } from 'vitest';
import { extractFromUrl } from '../../src/extractor/index.js';
import { isLiveEnabled, requireLiveEnv } from '../helpers/integration-guard.js';

const TIMEOUT = 120_000;

describe.skipIf(!isLiveEnabled())('Live Extractor', () => {
  it(
    'extracts a public site (example.com) without auth',
    async () => {
      const result = await extractFromUrl({
        url: 'https://example.com',
        viewports: [{ label: 'desktop', width: 1440, height: 900 }],
        screenshots: true,
        scrollForLazyLoad: true,
        waitForHydration: true,
        detectAnimations: true,
        detectSections: true,
        detectResponsiveStyles: false,
        detectHoverStates: false,
        maxStyles: 200,
        outputDir: './research/_live-extractor-example.com',
      });

      expect(result.url).toBe('https://example.com');
      expect(result.viewports).toHaveLength(1);
      expect(result.viewports[0].screenshotPath).toBeTruthy();
      expect(result.fontsIntercepted).toBeDefined();
      expect(result.cssVariables).toBeDefined();
      expect(result.sections.length).toBeGreaterThan(0);
      expect(result.animations).toBeDefined();
    },
    TIMEOUT,
  );

  it(
    'extracts test4.nick-webdesign.de with source-auth (basic)',
    async () => {
      const env = requireLiveEnv();
      // This test verifies that the source-auth path does not throw even when
      // a page is publicly accessible. For staging sites behind auth, the
      // credentials would be loaded from ~/.clone-v3/source-auth.json.
      const result = await extractFromUrl({
        url: 'https://test4.nick-webdesign.de/',
        viewports: [{ label: 'desktop', width: 1440, height: 900 }],
        screenshots: true,
        scrollForLazyLoad: true,
        waitForHydration: true,
        detectAnimations: true,
        detectSections: true,
        detectResponsiveStyles: false,
        detectHoverStates: false,
        maxStyles: 500,
        outputDir: './research/_live-extractor-test4',
        sourceAuth: {
          type: 'bearer',
          token: env.token,
        },
      });

      expect(result.url).toContain('test4');
      expect(result.sections.length).toBeGreaterThan(0);
    },
    TIMEOUT,
  );
});

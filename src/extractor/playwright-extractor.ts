/**
 * Playwright-based page extractor.
 *
 * Sprint 2A: cold-reload + network-intercept for fonts + source-auth +
 * viewport screenshots. No SPA-hydration-wait, no lazy-scroll, no
 * CSS-variable-map, no computed-style-walk, no section-detection yet
 * — those are Sprint 2B + 2C.
 *
 * Audit-Fixes implemented here:
 *   - CORS: font-discovery via page.route() (not cssRules iteration)
 *   - Source-Auth: basic/bearer/cookie applied before page.goto()
 */

import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  DEFAULT_VIEWPORTS,
  type ExtractionOptions,
  type ExtractionResult,
  type AnimationInfo,
  type FontIntercept,
} from './types.js';
import {
  FontUrlCollector,
  buildFontRouteHandler,
} from './font-discovery.js';
import {
  sourceAuthToPlaywrightCookies,
} from '../lib/source-auth.js';

/** Build the AnimationInfo stub (Sprint 2A: basic; Sprint 2C: @keyframes discovery). */
async function detectAnimationsBasic(page: Page): Promise<AnimationInfo> {
  return await page.evaluate(() => {
    const gsap = (window as any).gsap;
    const ScrollTrigger = (window as any).ScrollTrigger;
    const framer = document.querySelector('[data-framer-name], [data-framer-component]');
    const lenis = document.querySelector('.lenis, [data-lenis]');
    return {
      has_keyframes: false, // Sprint 2C
      keyframe_names: [],
      has_gsap: typeof gsap === 'object' && gsap !== null,
      has_scrolltrigger: typeof ScrollTrigger === 'object' && ScrollTrigger !== null,
      has_framer_motion: framer !== null,
      has_lenis: lenis !== null,
    };
  });
}

/** Extract :root CSS variables. Cross-origin safe via per-stylesheet try/catch. */
async function extractCssVariables(page: Page): Promise<Record<string, string>> {
  return await page.evaluate(() => {
    const vars: Record<string, string> = {};
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList | null = null;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // cross-origin sheet — silently skip (Audit-Fix)
      }
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSStyleRule)) continue;
        if (rule.selectorText !== ':root' && rule.selectorText !== 'html') continue;
        for (let i = 0; i < rule.style.length; i++) {
          const prop = rule.style[i];
          if (!prop.startsWith('--')) continue;
          vars[prop] = rule.style.getPropertyValue(prop).trim();
        }
      }
    }
    return vars;
  });
}

/** Apply Source-Auth to a Playwright browser context. */
async function applySourceAuth(
  context: BrowserContext,
  auth: ExtractionOptions['sourceAuth'],
  targetUrl: string,
): Promise<void> {
  if (!auth) return;
  if (auth.type === 'cookie') {
    const cookies = await sourceAuthToPlaywrightCookies(auth, targetUrl);
    if (cookies.length > 0) await context.addCookies(cookies);
    return;
  }
  // basic & bearer: handled via extraHTTPHeaders (set in caller before newContext).
  // Playwright's BrowserContext has no .authenticate() in newer versions — header-injection is the
  // portable way and works for the vast majority of staging sites behind Basic Auth.
}

/**
 * Run the full extraction pipeline against a URL.
 * Returns ExtractionResult. Writes screenshots + JSON to outputDir.
 */
export async function extractFromUrl(options: ExtractionOptions): Promise<ExtractionResult> {
  const viewports = options.viewports ?? DEFAULT_VIEWPORTS;
  const hostname = new URL(options.url).hostname;

  await fs.mkdir(options.outputDir, { recursive: true });
  const screenshotsDir = path.join(options.outputDir, 'screenshots');
  await fs.mkdir(screenshotsDir, { recursive: true });

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });

    // Apply bearer-token via extra-headers (bearer is header-only, not basic-auth UI).
    const extraHeaders: Record<string, string> = {};
    if (options.sourceAuth?.type === 'bearer') {
      extraHeaders['Authorization'] = `Bearer ${options.sourceAuth.token}`;
    } else if (options.sourceAuth?.type === 'basic') {
      const creds = Buffer.from(
        `${options.sourceAuth.username}:${options.sourceAuth.password}`,
      ).toString('base64');
      extraHeaders['Authorization'] = `Basic ${creds}`;
    }

    const context = await browser.newContext({
      extraHTTPHeaders: extraHeaders,
      viewport: { width: viewports[0].width, height: viewports[0].height },
    });
    await applySourceAuth(context, options.sourceAuth, options.url);

    const fontCollector = new FontUrlCollector();
    const page = await context.newPage();

    // Register font route handlers BEFORE goto (Audit-Fix CORS).
    await page.route('**/*.woff2', buildFontRouteHandler(fontCollector));
    await page.route('**/*.woff', buildFontRouteHandler(fontCollector));
    await page.route('**/fonts.gstatic.com/**', buildFontRouteHandler(fontCollector));
    await page.route('**/fonts.googleapis.com/**', buildFontRouteHandler(fontCollector));

    // Initial goto
    await page.goto(options.url, { waitUntil: 'networkidle', timeout: 60_000 });

    // Cold-reload: hard reload to defeat cache and trigger all routes again
    await page.evaluate(() => location.reload());
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    // Per-viewport screenshots
    const viewportResults: ExtractionResult['viewports'] = [];
    if (options.screenshots !== false) {
      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.waitForLoadState('networkidle', { timeout: 30_000 });
        const filename = `screenshot-${vp.label}.png`;
        const filepath = path.join(screenshotsDir, filename);
        await page.screenshot({ path: filepath, fullPage: true });
        viewportResults.push({ config: vp, screenshotPath: filepath });
      }
    } else {
      for (const vp of viewports) {
        viewportResults.push({ config: vp });
      }
    }

    // CSS variables + animations
    const cssVariables = await extractCssVariables(page);
    const animations = options.detectAnimations !== false
      ? await detectAnimationsBasic(page)
      : {
          has_keyframes: false,
          keyframe_names: [],
          has_gsap: false,
          has_scrolltrigger: false,
          has_framer_motion: false,
          has_lenis: false,
        };

    // Persist JSON outputs
    const fontsIntercepted: FontIntercept[] = fontCollector.list();
    const result: ExtractionResult = {
      url: options.url,
      hostname,
      extracted_at: new Date().toISOString(),
      viewports: viewportResults,
      fontsIntercepted,
      cssVariables,
      sections: [], // Sprint 3
      animations,
    };

    await fs.writeFile(
      path.join(options.outputDir, 'fonts-detected.json'),
      JSON.stringify(fontsIntercepted, null, 2),
    );
    await fs.writeFile(
      path.join(options.outputDir, 'css-variables.json'),
      JSON.stringify(cssVariables, null, 2),
    );
    await fs.writeFile(
      path.join(options.outputDir, 'animations.json'),
      JSON.stringify(animations, null, 2),
    );
    await fs.writeFile(
      path.join(options.outputDir, 'extraction-result.json'),
      JSON.stringify(result, null, 2),
    );

    await context.close();
    return result;
  } finally {
    if (browser) await browser.close();
  }
}

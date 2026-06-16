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
import { waitForHydration } from './hydration-wait.js';
import { triggerLazyLoad } from './lazy-scroll.js';
import {
  walkComputedStyles,
  walkComputedStylesMultiViewport,
  injectDefaultsTable,
} from './computed-styles.js';
import { detectSections } from './section-detector.js';
import { discoverAnimations, buildCssBodyCollector } from './keyframes-discovery.js';


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

    // Sprint 2C: buffer CSS bodies for cross-origin @keyframes discovery
    const cssBodyCollector = buildCssBodyCollector();
    await page.route('**/*.css', cssBodyCollector.handler);

    // Initial goto
    await page.goto(options.url, { waitUntil: 'networkidle', timeout: 60_000 });

    // Cold-reload: hard reload to defeat cache and trigger all routes again
    await page.evaluate(() => location.reload());
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    // Sprint 2B: SPA-Hydration-Wait (MutationObserver fallback for Next.js/React/Webflow)
    if (options.waitForHydration !== false) {
      await waitForHydration(page);
    }

    // Sprint 2B: Lazy-Scroll triggers IntersectionObserver-based lazy-loads
    if (options.scrollForLazyLoad !== false) {
      await triggerLazyLoad(page);
    }

    // Per-viewport screenshots
    const viewportResults: ExtractionResult['viewports'] = [];
    if (options.screenshots !== false) {
      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.waitForLoadState('networkidle', { timeout: 30_000 });
        // Re-trigger lazy load for non-desktop viewports (mobile/tablet have different lazy-load triggers)
        if (vp.label !== 'desktop' && options.scrollForLazyLoad !== false) {
          await triggerLazyLoad(page, { resetToTop: true });
        }
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
    let animations: AnimationInfo;
    if (options.detectAnimations !== false) {
      // Sprint 2C: full @keyframes discovery (same-origin + cross-origin)
      const discovery = await discoverAnimations(page, cssBodyCollector.list());
      const basic = await detectAnimationsBasic(page);
      animations = {
        has_keyframes: discovery.keyframes.length > 0,
        keyframe_names: discovery.keyframes.map((k) => k.name),
        has_gsap: basic.has_gsap,
        has_scrolltrigger: basic.has_scrolltrigger,
        has_framer_motion: basic.has_framer_motion,
        has_lenis: basic.has_lenis,
        transitions: discovery.transitions,
        same_origin_keyframe_count: discovery.same_origin_count,
        cross_origin_keyframe_count: discovery.cross_origin_count,
      };
    } else {
      animations = {
        has_keyframes: false,
        keyframe_names: [],
        has_gsap: false,
        has_scrolltrigger: false,
        has_framer_motion: false,
        has_lenis: false,
      };
    }

    // Sprint 2C: Section-Detection
    const sections = options.detectSections !== false
      ? await detectSections(page, { maxSections: options.maxSections })
      : [];

    // Sprint 2C: Computed-Style-Walk (single viewport by default, multi if requested)
    let computedStyles: Record<string, import('./types.js').ComputedStyleSnapshot[]> | undefined;
    if (options.detectResponsiveStyles === true) {
      await injectDefaultsTable(page);
      computedStyles = await walkComputedStylesMultiViewport(
        page,
        viewports,
        {
          maxNodes: options.maxStyles ?? 500,
          customProperties: options.customProperties,
        },
      );
    } else if (options.maxStyles && options.maxStyles > 0) {
      await injectDefaultsTable(page);
      const desktopSnapshots = await walkComputedStyles(page, {
        maxNodes: options.maxStyles,
        customProperties: options.customProperties,
      });
      computedStyles = { [viewports[0].label]: desktopSnapshots };
    }

    // Phase 2.5: Design-Token-Intelligence (auto-runs if styles.json exists)
    // Lazy-import to avoid bundling the analyzer in non-token runs
    let designTokens: import('../analyzer/design-token-extractor.js').DesignTokens | undefined;
    if (computedStyles) {
      const { buildDesignTokens } = await import('../analyzer/design-token-extractor.js');
      // Flatten all viewports' snapshots into a single style list
      const allStyles: import('../analyzer/color-extractor.js').StyleNode[] = [];
      for (const snapshots of Object.values(computedStyles)) {
        allStyles.push(
          ...snapshots.map((s) => ({
            selector: s.selector,
            tag: s.tag,
            styles: s.styles,
          })),
        );
      }
      designTokens = buildDesignTokens({
        styles: allStyles,
        cssVariables,
        fontsDetected: fontCollector.list(),
        sourceUrl: options.url,
      });
    }

    // Persist JSON outputs
    const fontsIntercepted: FontIntercept[] = fontCollector.list();
    const result: ExtractionResult = {
      url: options.url,
      hostname,
      extracted_at: new Date().toISOString(),
      viewports: viewportResults,
      fontsIntercepted,
      cssVariables,
      sections,
      animations,
      computedStyles,
      designTokens,
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
      path.join(options.outputDir, 'sections.json'),
      JSON.stringify(sections, null, 2),
    );
    if (computedStyles) {
      await fs.writeFile(
        path.join(options.outputDir, 'styles.json'),
        JSON.stringify(computedStyles, null, 2),
      );
    }
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

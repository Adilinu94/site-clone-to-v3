/**
 * Lazy-Scroll (Sprint 2B).
 *
 * Triggers IntersectionObserver-based lazy loads (loading="lazy" images,
 * content-visibility: auto sections, etc.) by scrolling the page top-to-bottom
 * in 200px steps, then resets to top. After scrolling, waits for `networkidle`
 * so newly-fetched assets finish loading before screenshots.
 *
 * Why this matters: Without this, `styles.json` has empty `src` for many images
 * (they never mounted because they were below the fold and `loading="lazy"`
 * never resolved their `data-src`).
 *
 * Based on the user-audit pattern from BAUPLAN §2 Schritt 1e.
 */

import type { Page } from 'playwright';

export interface LazyScrollOptions {
  /** Step size in px (default 200). */
  stepPx?: number;
  /** Max wait per step in ms (default 1500). */
  maxStepMs?: number;
  /** Wait for networkidle after scrolling (default true). */
  waitForNetworkIdle?: boolean;
  /** Reset scroll position to top after scrolling (default true). */
  resetToTop?: boolean;
  /** Network-idle timeout in ms (default 30_000). */
  networkIdleTimeoutMs?: number;
}

export interface LazyScrollResult {
  /** Total scroll distance in px. */
  scrolledPx: number;
  /** Document height when scrolling started. */
  documentHeightPx: number;
  /** Number of scroll steps executed. */
  stepCount: number;
  /** Elapsed time in ms. */
  elapsedMs: number;
}

/** Scroll the page top-to-bottom to trigger lazy loads. */
export async function triggerLazyLoad(
  page: Page,
  options: LazyScrollOptions = {},
): Promise<LazyScrollResult> {
  const stepPx = options.stepPx ?? 200;
  const maxStepMs = options.maxStepMs ?? 1500;
  const waitForNetworkIdle = options.waitForNetworkIdle ?? true;
  const resetToTop = options.resetToTop ?? true;
  const networkIdleTimeoutMs = options.networkIdleTimeoutMs ?? 30_000;

  const start = Date.now();

  // Get initial document height
  const documentHeightPx = await page.evaluate(() => document.body.scrollHeight);

  // Scroll in steps (use IIFE form for type-safe Playwright API)
  const stepCount = (await page.evaluate(
    `new Promise((resolve) => {
      let total = 0;
      let count = 0;
      const step = ${stepPx};
      const maxWait = ${maxStepMs};
      const startTime = Date.now();
      const tick = () => {
        window.scrollBy(0, step);
        total += step;
        count += 1;
        if (total >= document.body.scrollHeight) { resolve(count); return; }
        if (Date.now() - startTime > maxWait) { resolve(count); return; }
        requestAnimationFrame(tick);
      };
      tick();
    })`,
  )) as number;

  // Wait for lazy-loaded network requests to complete
  if (waitForNetworkIdle) {
    await page.waitForLoadState('networkidle', { timeout: networkIdleTimeoutMs });
  }

  // Reset to top so screenshots start at the top of the page
  if (resetToTop) {
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  return {
    scrolledPx: stepCount * stepPx,
    documentHeightPx,
    stepCount,
    elapsedMs: Date.now() - start,
  };
}

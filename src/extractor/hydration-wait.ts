/**
 * SPA-Hydration-Wait (Sprint 2B).
 *
 * Problem: For Next.js / React / Webflow source sites, `networkidle` is NOT
 * enough — server-rendered HTML can change significantly after hydration
 * (lazy-images mount, conditional blocks render, client-side routing runs).
 * Screenshots taken before hydration miss the real DOM.
 *
 * Solution: try a known hydration marker selector first, fall back to a
 * MutationObserver-based idle detector (default 1500ms stable).
 *
 * Based on the user-audit pattern from BAUPLAN §2 Schritt 1d.
 */

import type { Page } from 'playwright';

const HYDRATION_SELECTORS = [
  '[data-hydrated="true"]',
  '[data-react-helmet]',
  '#__next[data-hydrated]',
  '[data-framer-name][data-framer-appear-id]', // Framer
  'astro-island[ssr]', // Astro
  '[ng-version]', // Angular
];

/** Wait for hydration to complete, then sleep for intro animations. */
export async function waitForHydration(
  page: Page,
  options: {
    selectorTimeoutMs?: number;
    idleStabilizationMs?: number;
    introAnimationSleepMs?: number;
  } = {},
): Promise<{ strategy: 'selector' | 'observer'; elapsedMs: number }> {
  const selectorTimeoutMs = options.selectorTimeoutMs ?? 10_000;
  const idleStabilizationMs = options.idleStabilizationMs ?? 1500;
  const introAnimationSleepMs = options.introAnimationSleepMs ?? 2000;

  const start = Date.now();

  // 1) Try a known hydration marker first (cheap, fast)
  try {
    await page.waitForSelector(HYDRATION_SELECTORS.join(','), {
      timeout: selectorTimeoutMs,
    });
    await sleep(introAnimationSleepMs);
    return { strategy: 'selector', elapsedMs: Date.now() - start };
  } catch {
    // Fall through to MutationObserver detector
  }

  // 2) MutationObserver-based idle detector (1500ms stable)
  // Use IIFE form (Playwright correctly handles Promise-returning string scripts)
  await page.evaluate(
    `new Promise((resolve) => {
      let stable = 0;
      const stableMs = ${idleStabilizationMs};
      const obs = new MutationObserver(() => { stable = 0; });
      obs.observe(document.body, { childList: true, subtree: true, attributes: true });
      const tick = setInterval(() => {
        stable += 100;
        if (stable >= stableMs) {
          clearInterval(tick);
          obs.disconnect();
          resolve();
        }
      }, 100);
    })`,
  );

  await sleep(introAnimationSleepMs);
  return { strategy: 'observer', elapsedMs: Date.now() - start };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

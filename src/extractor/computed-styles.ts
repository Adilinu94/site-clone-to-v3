/**
 * Computed-Style-Walk (Sprint 2C).
 *
 * Walks a tree of DOM nodes (typically the children of a Section) and captures
 * the non-default values of a curated set of ~60 visual CSS properties. The
 * result is consumed by the style-classifier (Phase 3) to map DOM elements
 * to V3 widgets + settings.
 *
 * Design notes:
 * - Property list is curated, not all CSS props. We capture what V3 needs.
 * - Custom-properties are also read (so `--color-brand-primary` is preserved
 *   alongside its resolved value).
 * - Non-default filter keeps the output small and meaningful.
 * - Multi-state (hover/focus/active) is OPT-IN via `detectStateStyles` (slow).
 * - Max-nodes guard prevents runaway extraction on large pages.
 *
 * Based on BAUPLAN §2 Schritt 4.
 */

import type { Page } from 'playwright';
import type { ComputedStyleSnapshot } from './types.js';

/** Curated set of visual properties that matter for V3 widget settings.
 *  Phase 4 (UMBAUPLAN §7.2): expanded to ~80 props covering pseudo-states,
 *  custom-properties (auto-detect), animation-*, transition-*, and the
 *  remaining visual props (cursor, whiteSpace, textOverflow, objectFit, ...). */
export const CURATED_PROPERTIES = [
  // Layout / box-model
  'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'box-sizing', 'overflow', 'overflow-x', 'overflow-y',
  // Background (Phase 4: added `background` shorthand)
  'background-color', 'background-image', 'background-size', 'background-position',
  'background-repeat', 'background-attachment', 'background',
  // Border (Phase 4: added `border` shorthand)
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
  'border',
  // Typography
  'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'letter-spacing', 'text-align', 'text-transform',
  'text-decoration', 'text-decoration-color', 'color',
  // Effects (Phase 4: added cursor, mix-blend-mode)
  'opacity', 'box-shadow', 'filter', 'backdrop-filter', 'transform', 'cursor', 'mix-blend-mode',
  // Flex / Grid
  'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content', 'gap',
  'grid-template-columns', 'grid-template-rows', 'grid-gap',
  // Text overflow / wrapping (Phase 4)
  'white-space', 'text-overflow', '-webkit-line-clamp',
  // Replaced / object-fit (Phase 4)
  'object-fit', 'object-position',
  // Transitions (Phase 4 — granular extraction moved to animation-property-extractor.ts,
  // but keep `transition` shorthand here so non-default transitions are visible in
  // the baseline snapshot).
  'transition',
] as const;

export type CuratedProperty = (typeof CURATED_PROPERTIES)[number];

/** Properties considered "default" (skipped unless explicitly set).
 *  Phase 4: added defaults for the new props. */
export const DEFAULT_VALUES: Partial<Record<CuratedProperty, string[]>> = {
  'display': ['block', 'inline'],
  'position': ['static'],
  'box-sizing': ['content-box'],
  'overflow': ['visible'],
  'overflow-x': ['visible'],
  'overflow-y': ['visible'],
  'background-color': ['rgba(0, 0, 0, 0)'],
  'background-repeat': ['repeat'],
  'background-attachment': ['scroll'],
  'background-image': ['none'],
  'background': ['none'],
  'border-top-style': ['none'],
  'border-right-style': ['none'],
  'border-bottom-style': ['none'],
  'border-left-style': ['none'],
  'border': ['none'],
  'font-style': ['normal'],
  'text-align': ['start'],
  'text-decoration': ['none'],
  'opacity': ['1'],
  'flex-direction': ['row'],
  'flex-wrap': ['nowrap'],
  'cursor': ['auto'],
  'mix-blend-mode': ['normal'],
  'white-space': ['normal'],
  'text-overflow': ['clip'],
  'object-fit': ['fill'],
  'object-position': ['50% 50%'],
  'transition': ['all 0s ease 0s', 'none'],
};

export interface WalkOptions {
  /** Root element selector (default: 'body'). */
  rootSelector?: string;
  /** Max nodes to walk (default: 500). */
  maxNodes?: number;
  /** Depth limit (default: 4 levels per BAUPLAN). */
  maxDepth?: number;
  /** Custom-properties to also read (e.g. ['--color-brand-primary']). */
  customProperties?: string[];
}

function buildWalkScript(
  rootSel: string,
  maxN: number,
  maxD: number,
  props: readonly string[],
  customProps: string[],
): string {
  // IIFE form: Playwright correctly handles function-expression-as-string.
  // Args are interpolated as JSON-literal expressions (safe — no user input).
  const propsJson = JSON.stringify(props);
  const customPropsJson = JSON.stringify(customProps);
  const rootSelJson = JSON.stringify(rootSel);
  return `(() => {
  const root = document.querySelector(${rootSelJson});
  if (!root) return [];
  const out = [];
  const defaults = (window).__cloneV3Defaults || {};
  const maxN = ${maxN};
  const maxD = ${maxD};
  const props = ${propsJson};
  const customProps = ${customPropsJson};

  const isDefault = (prop, value) => {
    const defList = defaults[prop] || [];
    if (defList.length === 0) return false;
    return defList.some((d) => d === value || d === value.replace(/\\s+/g, ' ').trim());
  };

  const buildSelector = (el, ancestors) => {
    const parts = [];
    const chain = ancestors.slice(-2).concat([el]);
    for (const node of chain) {
      const tag = node.tagName.toLowerCase();
      if (node.id) { parts.push('#' + node.id); continue; }
      const cls = (node.className && typeof node.className === 'string')
        ? node.className.split(/\\s+/).filter(Boolean)[0]
        : '';
      parts.push(cls ? tag + '.' + cls : tag);
    }
    return parts.join(' > ');
  };

  const walk = (el, depth, ancestors) => {
    if (out.length >= maxN) return;
    if (depth > maxD) return;
    const styles = {};
    const cs = getComputedStyle(el);
    for (const prop of props) {
      const val = cs.getPropertyValue(prop);
      if (!val) continue;
      if (isDefault(prop, val)) continue;
      styles[prop] = val;
    }
    for (const cp of customProps) {
      const val = cs.getPropertyValue(cp).trim();
      if (val) styles[cp] = val;
    }
    if (Object.keys(styles).length > 0) {
      out.push({
        selector: buildSelector(el, ancestors),
        tag: el.tagName.toLowerCase(),
        styles: styles,
      });
    }
    for (const child of Array.from(el.children)) {
      walk(child, depth + 1, ancestors.concat([el]));
    }
  };
  walk(root, 0, []);
  return out;
})()`;
}

/** Walk the DOM under `rootSelector` and capture non-default computed styles. */
export async function walkComputedStyles(
  page: Page,
  options: WalkOptions = {},
): Promise<ComputedStyleSnapshot[]> {
  const maxNodes = options.maxNodes ?? 500;
  const maxDepth = options.maxDepth ?? 4;
  const rootSelector = options.rootSelector ?? 'body';
  const customProperties = options.customProperties ?? [];

  const script = buildWalkScript(rootSelector, maxNodes, maxDepth, CURATED_PROPERTIES, customProperties);
  return ((await page.evaluate(script).catch(() => [])) ?? []) as ComputedStyleSnapshot[];
}

/**
 * Walk computed styles for ALL configured viewports.
 * Returns a map: viewport-label -> snapshots.
 */
export async function walkComputedStylesMultiViewport(
  page: Page,
  viewports: Array<{ label: string; width: number; height: number }>,
  walkOptions: WalkOptions = {},
): Promise<Record<string, ComputedStyleSnapshot[]>> {
  const out: Record<string, ComputedStyleSnapshot[]> = {};
  const originalSize = page.viewportSize();
  try {
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForLoadState('networkidle', { timeout: 30_000 });
      out[vp.label] = await walkComputedStyles(page, walkOptions);
    }
  } finally {
    if (originalSize) await page.setViewportSize(originalSize);
  }
  return out;
}

/** Inject the default-values table into the page before walking. */
export async function injectDefaultsTable(page: Page): Promise<void> {
  const SCRIPT = `(() => { window.__cloneV3Defaults = ${JSON.stringify(DEFAULT_VALUES)}; })();`;
  await page.evaluate(SCRIPT);
}

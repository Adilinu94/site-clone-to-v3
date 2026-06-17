/**
 * Section-Detector (Sprint 2C + V2 Phase 2).
 *
 * Detects page-sections (Hero, Features, Footer, etc.) from the live DOM so
 * the Section-Picker wizard (Phase 3) can offer them for selection.
 *
 * Detection strategy (heuristic, in order):
 *   1. <section> elements with `id` or meaningful class
 *   2. <div> with `data-section` attribute
 *   3. <header>, <footer>, <main>, <nav>
 *   4. Top-level direct children of <body> / <main> with `min-height: 60vh`
 *   5. Siblings with strong visual separation (large vertical gap + bg change)
 *
 * V2 addition: mergeSmallSections() combines adjacent tiny sections.
 * Threshold (V2 §5.5 Korrektur):
 *   - Two sections are "mergeable" if either:
 *       (a) both are < 200px tall AND each has < 2 child elements
 *       (b) both are < 100px tall AND share the same background-color
 *   - Merging produces a single section spanning both y-ranges and
 *     summing child_count. The merged section's selector is a list of
 *     child selectors (Elementor will rebuild them as inner-sections).
 *
 * Output: SectionInfo[] with y-range, selector, layout hint, child count.
 *
 * Based on BAUPLAN §2 Schritt 5 + UMBAUPLAN-V3 §5.5.
 */

import type { Page } from 'playwright';
import type { SectionInfo } from './types.js';

export interface DetectSectionsOptions {
  /** Max sections to detect (default: 50). */
  maxSections?: number;
  /** Min height in px to qualify (default: 200). */
  minHeightPx?: number;
  /** Min height as vh to qualify for "viewport section" (default: 0.4 = 40vh). */
  minVh?: number;
}

/** Merger threshold (V2 §5.5). Override only for tests. */
export interface MergeThreshold {
  /** Max height in px for rule (a). */
  maxHeightPx?: number;
  /** Max child-count per section for rule (a). */
  maxChildCount?: number;
  /** Max height in px for rule (b). */
  maxHeightPxTight?: number;
}

export const DEFAULT_MERGE_THRESHOLD: Required<MergeThreshold> = {
  maxHeightPx: 200,
  maxChildCount: 2,
  maxHeightPxTight: 100,
};

const SECTION_SELECTORS = [
  'section[id]',
  'section[class*="section"]',
  '[data-section]',
  '[role="region"]',
  'article',
  'aside',
  'header[role="banner"]',
  'footer[role="contentinfo"]',
  'main[role="main"]',
  'nav[role="navigation"]',
  'header',
  'footer',
  'main',
  'nav',
].join(', ');

interface RawSection {
  section_id: string;
  selector: string;
  y_range: [number, number];
  layout: string;
  child_count: number;
  tag: string;
  id?: string;
  classes: string;
}

function buildDetectScript(
  selectors: string,
  maxN: number,
  minH: number,
): string {
  return `(() => {
  const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selectors)}));
  const seen = new Set();
  const out = [];
  const maxN = ${maxN};
  const minH = ${minH};

  for (const el of nodes) {
    if (out.length >= maxN) break;
    if (seen.has(el)) continue;

    const rect = el.getBoundingClientRect();
    const scrollY = window.scrollY || window.pageYOffset;
    const yTop = Math.round(rect.top + scrollY);
    const yBottom = Math.round(rect.bottom + scrollY);
    const height = yBottom - yTop;

    if (height < minH) continue;

    const cs = getComputedStyle(el);
    const layout = cs.display + (cs.display === 'flex' ? ' ' + cs.flexDirection : '');

    const allDescendants = el.querySelectorAll('*');
    for (const d of Array.from(allDescendants)) seen.add(d);
    seen.add(el);

    let sel = '';
    if (el.id) {
      sel = '#' + el.id;
    } else {
      const tag = el.tagName.toLowerCase();
      const cls = (el.className && typeof el.className === 'string')
        ? el.className.split(/\\s+/).filter(Boolean).slice(0, 3).join('.')
        : '';
      sel = cls ? tag + '.' + cls : tag;
    }

    out.push({
      section_id: el.id || el.tagName.toLowerCase() + '-' + out.length,
      selector: sel,
      y_range: [yTop, yBottom],
      layout: layout,
      child_count: el.children.length,
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      classes: (typeof el.className === 'string' ? el.className : '').slice(0, 200),
    });
  }
  return out;
})()`;
}

export async function detectSections(
  page: Page,
  options: DetectSectionsOptions = {},
): Promise<SectionInfo[]> {
  const maxSections = options.maxSections ?? 50;
  const minHeightPx = options.minHeightPx ?? 200;
  // minVh is reserved for future hero-detection logic (currently unused but in API)

  const script = buildDetectScript(SECTION_SELECTORS, maxSections, minHeightPx);
  const raw = ((await page.evaluate(script).catch(() => [])) ?? []) as RawSection[];

  return raw.map((r) => ({
    section_id: r.section_id,
    selector: r.selector,
    y_range: r.y_range,
    layout: r.layout,
    child_count: r.child_count,
    tag: r.tag,
    id: r.id,
    classes: r.classes,
  } as SectionInfo));
}

/**
 * Helper for the merge decision: do `a` and `b` qualify as mergeable?
 * Exposed for unit tests.
 *
 *   (a) both < maxHeightPx AND both < maxChildCount children
 *   (b) both < maxHeightPxTight AND same backgroundColor
 *
 * @param bgA / bgB backgroundColor of section A / B (computed style).
 */
export function areMergeable(
  a: { heightPx: number; childCount: number; backgroundColor?: string },
  b: { heightPx: number; childCount: number; backgroundColor?: string },
  threshold: MergeThreshold = {},
): boolean {
  const t = { ...DEFAULT_MERGE_THRESHOLD, ...threshold };
  // Rule (a)
  if (
    a.heightPx < t.maxHeightPx &&
    b.heightPx < t.maxHeightPx &&
    a.childCount < t.maxChildCount &&
    b.childCount < t.maxChildCount
  ) {
    return true;
  }
  // Rule (b)
  if (
    a.heightPx < t.maxHeightPxTight &&
    b.heightPx < t.maxHeightPxTight &&
    !!a.backgroundColor &&
    a.backgroundColor === b.backgroundColor
  ) {
    return true;
  }
  return false;
}

/**
 * Merge adjacent small sections according to V2 §5.5 thresholds.
 *
 * Sections are processed in y-range order. Two adjacent sections (the next
 * one in the list, no gap) are merged when `areMergeable()` returns true.
 * The merged section's selector is a comma-separated list of child selectors
 * so Elementor V3 can recreate them as inner-sections.
 *
 * Background-color is optional; if absent, only rule (a) applies.
 */
export function mergeSmallSections<T extends {
  section_id: string;
  selector: string;
  y_range: [number, number];
  layout: string;
  child_count: number;
  tag: string;
  id?: string;
  classes: string;
  backgroundColor?: string;
}>(
  sections: T[],
  threshold: MergeThreshold = {},
): T[] {
  if (sections.length < 2) return sections;

  const sorted = [...sections].sort((a, b) => a.y_range[0] - b.y_range[0]);
  const merged: T[] = [];
  let buffer: T | null = null;

  const flushBuffer = () => {
    if (buffer) {
      merged.push(buffer);
      buffer = null;
    }
  };

  for (const sec of sorted) {
    const heightPx = sec.y_range[1] - sec.y_range[0];
    const sectionLike = {
      heightPx,
      childCount: sec.child_count,
      backgroundColor: sec.backgroundColor,
    };

    if (buffer) {
      const isAdjacent = sec.y_range[0] - buffer.y_range[1] <= 2; // tolerate 2px gap
      if (isAdjacent && areMergeable(sectionLike, {
        heightPx: buffer.y_range[1] - buffer.y_range[0],
        childCount: buffer.child_count,
        backgroundColor: buffer.backgroundColor,
      }, threshold)) {
        // Merge buffer + sec
        const combinedSelectors = `${buffer.selector}, ${sec.selector}`;
        buffer = {
          ...buffer,
          section_id: `${buffer.section_id}+${sec.section_id}`,
          selector: combinedSelectors,
          y_range: [buffer.y_range[0], sec.y_range[1]],
          child_count: buffer.child_count + sec.child_count,
        } as T;
        continue;
      } else {
        flushBuffer();
      }
    }
    buffer = sec;
  }
  flushBuffer();
  return merged;
}

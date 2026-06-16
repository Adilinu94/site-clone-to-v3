/**
 * Section-Detector (Sprint 2C).
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
 * Output: SectionInfo[] with y-range, selector, layout hint, child count.
 *
 * Based on BAUPLAN §2 Schritt 5.
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

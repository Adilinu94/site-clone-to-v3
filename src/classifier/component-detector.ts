/**
 * Component Detector — Phase 3 P1 Extension
 *
 * Extends style-classifier.ts with 7 additional layout patterns:
 *   stats        — counter/metric row (3-6 equal columns with large numbers)
 *   faq          — question-answer pairs (<details> or alternating heading/text)
 *   testimonials — quoted reviews with avatars (blockquote / circular image)
 *   pricing      — pricing cards (2-4 columns with price signals)
 *   timeline     — sequential steps with dates or numbers (vertical/horizontal)
 *   tabs         — switchable content panels (tablist / tab-panel selectors)
 *   accordion    — expandable items (<details> / aria-expanded pattern)
 *
 * Detection priority (called by style-classifier after its own checks):
 *   stats → testimonials → pricing → faq → accordion → timeline → tabs
 *
 * All heuristics operate on ComputedStyleSnapshot (CSS properties + selectors)
 * without DOM access. Two signal types are used:
 *   1. Keyword-matching in CSS selector strings (class / id names)
 *   2. CSS computed-property analysis (display, grid-template-columns, etc.)
 */
import type { ComputedStyleSnapshot, SectionInfo } from '../extractor/types.js';
import type { V3LayoutPattern } from './types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attempt to detect one of the 7 extended patterns.
 * Returns the matched pattern name or `null` (= fall through to 'content').
 */
export function detectComponent(
  section: SectionInfo,
  snap: ComputedStyleSnapshot,
  allSnapshots: ComputedStyleSnapshot[],
): V3LayoutPattern | null {
  const children = directChildren(section.selector, allSnapshots);

  if (isStats(section, snap, children)) return 'stats';
  if (isTestimonials(section, snap, children)) return 'testimonials';
  if (isPricing(section, snap, children)) return 'pricing';
  if (isFaq(section, snap, children)) return 'faq';
  if (isAccordion(section, snap, children)) return 'accordion';
  if (isTimeline(section, snap, children)) return 'timeline';
  if (isTabs(section, snap, children)) return 'tabs';

  return null;
}

// ---------------------------------------------------------------------------
// Pattern detectors
// ---------------------------------------------------------------------------

function isStats(
  section: SectionInfo,
  snap: ComputedStyleSnapshot,
  children: ComputedStyleSnapshot[],
): boolean {
  // Signal 1: selector keyword
  if (selectorHasAny(section.selector, ['stat', 'counter', 'metric', 'achievement', 'impact', 'count'])) {
    return true;
  }

  // Signal 2: grid/flex row of 3-6 equal columns where any child has large font-size (>32px)
  const display = snap.styles['display'];
  const colCount = children.length;
  if (colCount < 3 || colCount > 8) return false;

  const isRow =
    (display === 'flex' && snap.styles['flex-direction'] !== 'column') ||
    (display === 'grid' && countGridCols(snap.styles['grid-template-columns']) >= 3);

  if (!isRow) return false;

  const hasLargeText = children.some((c) => {
    const fs = parsePx(c.styles['font-size']);
    return fs !== null && fs >= 32;
  });
  return hasLargeText;
}

function isTestimonials(
  section: SectionInfo,
  _snap: ComputedStyleSnapshot,
  children: ComputedStyleSnapshot[],
): boolean {
  // Signal 1: selector keyword
  if (selectorHasAny(section.selector, ['testimonial', 'review', 'quote', 'feedback', 'client', 'customer'])) {
    return true;
  }

  // Signal 2: any child has a blockquote/cite tag OR circular image (border-radius ≥ 40%)
  const hasBlockquote = children.some((c) => c.tag === 'blockquote' || c.tag === 'q' || c.tag === 'cite');
  if (hasBlockquote) return true;

  const hasCircularImage = children.some((c) => {
    if (c.tag !== 'img') return false;
    const br = c.styles['border-radius'];
    if (!br) return false;
    // "50%", "50% 50% 50% 50%", or large px value
    if (br.includes('%')) {
      const pct = parseFloat(br);
      return pct >= 40;
    }
    return false;
  });
  return hasCircularImage;
}

function isPricing(
  section: SectionInfo,
  snap: ComputedStyleSnapshot,
  children: ComputedStyleSnapshot[],
): boolean {
  // Signal 1: selector keyword
  if (selectorHasAny(section.selector, ['pricing', 'price', 'plan', 'tier', 'package'])) {
    return true;
  }

  // Signal 2: 2-4 column grid/flex AND at least one child selector matches price keywords
  const display = snap.styles['display'];
  const colCount = children.length;
  if (colCount < 2 || colCount > 5) return false;

  const isMultiCol =
    display === 'grid' ||
    (display === 'flex' && snap.styles['flex-direction'] !== 'column');

  if (!isMultiCol) return false;

  return children.some((c) => selectorHasAny(c.selector, ['price', 'plan', 'tier', 'card']));
}

function isFaq(
  section: SectionInfo,
  _snap: ComputedStyleSnapshot,
  children: ComputedStyleSnapshot[],
): boolean {
  // Signal 1: selector keyword
  if (selectorHasAny(section.selector, ['faq', 'q-a', 'qa', 'questions', 'answer'])) {
    return true;
  }

  // Signal 2: 4+ children where >50% are heading tags (alternating Q/A structure)
  // Note: <details>/<summary> patterns are handled by isAccordion, not here.
  if (children.length < 4) return false;
  const headingTags = new Set(['h2', 'h3', 'h4', 'dt']);
  const headingCount = children.filter((c) => headingTags.has(c.tag)).length;
  return headingCount >= Math.ceil(children.length / 2);
}

function isAccordion(
  section: SectionInfo,
  _snap: ComputedStyleSnapshot,
  children: ComputedStyleSnapshot[],
): boolean {
  // Signal 1: selector keyword
  if (selectorHasAny(section.selector, ['accordion', 'collapse', 'expandable', 'toggle', 'expand'])) {
    return true;
  }

  // Signal 2: <details>/<summary> children (same as FAQ signal, but FAQ is checked first;
  // accordion requires 2+ details and NO heading-alternating pattern)
  const detailsCount = children.filter((c) => c.tag === 'details' || c.tag === 'summary').length;
  return detailsCount >= 2;
}

function isTimeline(
  section: SectionInfo,
  snap: ComputedStyleSnapshot,
  children: ComputedStyleSnapshot[],
): boolean {
  // Signal 1: selector keyword
  if (selectorHasAny(section.selector, ['timeline', 'steps', 'process', 'roadmap', 'history', 'milestone'])) {
    return true;
  }

  // Signal 2: vertical flex-column with 3+ children that each have a left border
  // (connecting line pattern common in timelines)
  if (children.length < 3) return false;
  const isVertical =
    snap.styles['display'] === 'flex' && snap.styles['flex-direction'] === 'column';
  if (!isVertical) return false;

  const withLeftBorder = children.filter((c) => {
    const bl = c.styles['border-left'] ?? c.styles['border-left-width'];
    return bl && bl !== '0px' && bl !== 'none';
  }).length;
  return withLeftBorder >= Math.ceil(children.length / 2);
}

function isTabs(
  section: SectionInfo,
  snap: ComputedStyleSnapshot,
  children: ComputedStyleSnapshot[],
): boolean {
  // Signal 1: selector keyword
  if (selectorHasAny(section.selector, ['tabs', 'tablist', 'tab-nav', 'tab-panel', 'tabpanel'])) {
    return true;
  }

  // Signal 2: any child selector contains tab-related keywords
  if (children.some((c) => selectorHasAny(c.selector, ['tab', 'nav-tab', 'tab-item']))) {
    return true;
  }

  // Signal 3: flex row of 3-7 equal-width children with overflow:hidden on parent
  // (tab navigation bar pattern)
  const display = snap.styles['display'];
  const overflow = snap.styles['overflow'];
  if (display === 'flex' && overflow === 'hidden' && children.length >= 3 && children.length <= 7) {
    const widths = children.map((c) => parsePx(c.styles['width']) ?? 0).filter((w) => w > 0);
    if (widths.length >= 3) {
      const sorted = [...widths].sort((a, b) => a - b);
      const range = sorted[sorted.length - 1] - sorted[0];
      return range < 10; // widths are nearly identical
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Return direct children of `parentSel` from the snapshot list. */
function directChildren(
  parentSel: string,
  snapshots: ComputedStyleSnapshot[],
): ComputedStyleSnapshot[] {
  const prefix = `${parentSel} > `;
  return snapshots.filter((s) => s.selector.startsWith(prefix));
}

/** Case-insensitive check: does the selector contain any of the keywords? */
function selectorHasAny(selector: string, keywords: string[]): boolean {
  const lower = selector.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

function parsePx(value: string | undefined): number | null {
  if (!value) return null;
  const m = value.match(/^(-?\d+(?:\.\d+)?)px$/);
  return m ? parseFloat(m[1]) : null;
}

function countGridCols(gridTemplateCols: string | undefined): number {
  if (!gridTemplateCols) return 0;
  const m = gridTemplateCols.match(/repeat\(\s*(\d+)\s*,/);
  if (m) return parseInt(m[1], 10);
  return gridTemplateCols.trim().split(/\s+/).length;
}

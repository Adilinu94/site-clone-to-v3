/**
 * Style-Classifier — Phase 3 Sprint 3A
 * Analyzes a section's container + child structure to determine the
 * best-matching V3 layout pattern.
 *
 * Spec: BAUPLAN-SITE-CLONE-TO-V3.md §Phase 3 — Tasks 1 (Layout-Heuristik)
 *
 * Patterns:
 *   - hero            (single-column, full-width, vertical-center, large heading)
 *   - image-text-sbs  (2-column flex/grid, image+text side by side)
 *   - card-grid       (3+ column grid with repeated card structure)
 *   - sticky-header   (position: sticky, top: 0)
 *   - footer          (multi-column, large padding-block)
 *   - content         (default fallback)
 */
import type { ComputedStyleSnapshot, SectionInfo } from '../extractor/types.js';
import type { V3LayoutPattern } from './types.js';
import { detectComponent } from './component-detector.js';

const HERO_MIN_VH = 0.7;
const FOOTER_MIN_PADDING = 64;
const GRID_MIN_CARDS = 3;

export interface ClassifierOptions {
  /** Hero detection: min height in vh (default 0.7 = 70vh). */
  heroMinVh?: number;
  /** Footer detection: min padding-block in px (default 64). */
  footerMinPaddingPx?: number;
  /** Card-grid: minimum number of card children (default 3). */
  gridMinCards?: number;
}

/**
 * Classify a section into a V3 layout pattern.
 * Inputs: section info from extractor + computed-style snapshots
 * scoped to that section's selector.
 */
export function classifySection(
  section: SectionInfo,
  snapshots: ComputedStyleSnapshot[],
  options: ClassifierOptions = {},
): V3LayoutPattern {
  const heroMinVh = options.heroMinVh ?? HERO_MIN_VH;
  void heroMinVh;
  const footerMinPadding = options.footerMinPaddingPx ?? FOOTER_MIN_PADDING;
  const gridMinCards = options.gridMinCards ?? GRID_MIN_CARDS;

  const sectionSnap = snapshots.find((s) => s.selector === section.selector);
  if (!sectionSnap) return 'content';

  // 1. Sticky-header check (matches `header` tag with position: sticky)
  if (isStickyHeader(section, sectionSnap)) return 'sticky-header';

  // 2. Footer check (large padding-block, multi-column, footer tag)
  if (isFooter(section, sectionSnap, footerMinPadding)) return 'footer';

  // 3. Hero check (very tall, single child column with h1)
  if (isHero(section, sectionSnap, snapshots)) return 'hero';

  // 4. Card-grid check (grid/flex with N+ children of similar structure)
  const childSnapshots = snapshots.filter((s) =>
    s.selector.startsWith(`${section.selector} >`),
  );
  if (isCardGrid(sectionSnap, childSnapshots, gridMinCards)) return 'card-grid';

  // 5. Image-text side-by-side (flex row, 2 columns, image+text)
  if (isImageTextSbs(sectionSnap, childSnapshots)) return 'image-text-sbs';

  // 6. Extended component patterns (stats, faq, testimonials, pricing, timeline, tabs, accordion)
  const component = detectComponent(section, sectionSnap, snapshots);
  if (component) return component;

  return 'content';
}

function isStickyHeader(
  section: SectionInfo,
  snap: ComputedStyleSnapshot,
): boolean {
  return section.tag === 'header' && /sticky|fixed/.test(snap.styles['position'] ?? '');
}

function isFooter(
  section: SectionInfo,
  snap: ComputedStyleSnapshot,
  minPaddingPx: number,
): boolean {
  if (section.tag !== 'footer') return false;
  const pt = parsePx(snap.styles['padding-top']) ?? 0;
  const pb = parsePx(snap.styles['padding-bottom']) ?? 0;
  return Math.max(pt, pb) >= minPaddingPx;
}

function isHero(
  section: SectionInfo,
  snap: ComputedStyleSnapshot,
  snapshots: ComputedStyleSnapshot[],
): boolean {
  const sectionHeight = section.y_range[1] - section.y_range[0];
  const height = parsePx(snap.styles['height']);
  const minHeight = parsePx(snap.styles['min-height']);
  if (height !== null && height < 600) return false;
  if (minHeight !== null && sectionHeight < 600) return false;

  const h1 = snapshots.find(
    (s) => s.tag === 'h1' && isDirectChild(s.selector, section.selector),
  );
  if (!h1) return false;

  const textAlign = snap.styles['text-align'];
  const flexDir = snap.styles['flex-direction'];
  if (textAlign === 'center' || flexDir === 'column' || flexDir === '') return true;
  return false;
}

function isCardGrid(
  snap: ComputedStyleSnapshot,
  childSnapshots: ComputedStyleSnapshot[],
  minCards: number,
): boolean {
  const display = snap.styles['display'];
  const gridCols = snap.styles['grid-template-columns'];
  const flexWrap = snap.styles['flex-wrap'];
  if (display === 'grid' && gridCols) {
    const cols = parseRepeatCount(gridCols);
    if (cols >= minCards) return true;
  }
  if (display === 'flex' && flexWrap === 'wrap') {
    // Detect flex children that share similar dimensions (>= minCards)
    if (childSnapshots.length >= minCards) {
      // Group children by their width — if 3+ share similar widths, it's a grid
      const widths = childSnapshots
        .map((c) => parsePx(c.styles['width']) ?? 0)
        .filter((w) => w > 0);
      const median = widths.sort((a, b) => a - b)[Math.floor(widths.length / 2)];
      const similar = widths.filter((w) => Math.abs(w - median) < 20).length;
      return similar >= minCards;
    }
  }
  return false;
}

function isImageTextSbs(
  snap: ComputedStyleSnapshot,
  childSnapshots: ComputedStyleSnapshot[],
): boolean {
  const display = snap.styles['display'];
  const flexDir = snap.styles['flex-direction'];
  if (display !== 'flex' || flexDir !== 'row') return false;

  // Check if any descendant contains media (img/picture/video) AND any
  // descendant contains text (h1-h6/p). Accept 2+ direct children.
  const hasMedia = childSnapshots.some(
    (c) =>
      c.tag === 'img' ||
      c.tag === 'picture' ||
      c.tag === 'video' ||
      c.selector.endsWith(' img') ||
      c.selector.endsWith(' picture'),
  );
  const hasText = childSnapshots.some(
    (c) =>
      /^h[1-6]$/.test(c.tag) ||
      c.tag === 'p' ||
      c.selector.endsWith(' h1') ||
      c.selector.endsWith(' h2') ||
      c.selector.endsWith(' p'),
  );
  return hasMedia && hasText;
}

function isDirectChild(childSel: string, parentSel: string): boolean {
  // childSel = "section.hero > div.row" or "section.hero > h1"
  // parentSel = "section.hero"
  // We want to know if child is an immediate descendant of parent
  return childSel.startsWith(`${parentSel} > `);
}

function parsePx(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^(-?\d+(?:\.\d+)?)px$/);
  return match ? parseFloat(match[1]) : null;
}

function parseRepeatCount(gridCols: string): number {
  // "200px 200px 200px" -> 3
  // "repeat(3, 1fr)" -> 3
  // "repeat(auto-fit, minmax(250px, 1fr))" -> 1 (indeterminate)
  const repeatMatch = gridCols.match(/repeat\(\s*(\d+)\s*,/);
  if (repeatMatch) return parseInt(repeatMatch[1], 10);
  const tokens = gridCols.trim().split(/\s+/);
  return tokens.length;
}

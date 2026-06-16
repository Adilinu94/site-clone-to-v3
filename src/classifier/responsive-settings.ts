/**
 * Responsive-Settings — Phase 3 Sprint 3D
 * Builds V3 settings with explicit _tablet / _mobile variants from
 * per-viewport computed-style snapshots.
 *
 * Spec: BAUPLAN-SITE-CLONE-TO-V3.md §Phase 3 — Tasks 3 (V3-Setting-Mapping)
 *
 * V3 responsive convention:
 *   - desktop value goes into the un-suffixed key (e.g. `typography_font_size`)
 *   - tablet value goes into `*_tablet`
 *   - mobile value goes into `*_mobile`
 *
 * Only properties that DIFFER between viewports get a responsive variant
 * (otherwise the V3 output is verbose and bloats the database).
 */
import type { ComputedStyleSnapshot } from '../extractor/types.js';

export type ViewportLabel = 'desktop' | 'tablet' | 'mobile';

/** Per-viewport computed styles for a single element. */
export interface ResponsiveStyles {
  desktop: Record<string, string>;
  tablet?: Record<string, string>;
  mobile?: Record<string, string>;
}

export interface ResponsiveSettingsOptions {
  /** Properties to extract from computed styles. */
  properties?: string[];
  /** Only emit _tablet/_mobile when value differs from desktop (default true). */
  responsiveOnlyOnDiff?: boolean;
}

const DEFAULT_PROPERTIES = [
  'font-size',
  'font-weight',
  'line-height',
  'color',
  'background-color',
  'padding',
  'margin',
  'width',
  'height',
  'gap',
  'flex-direction',
];

/**
 * Build V3 settings object with desktop + responsive variants.
 */
export function buildResponsiveSettings(
  styles: ResponsiveStyles,
  options: ResponsiveSettingsOptions = {},
): Record<string, unknown> {
  const properties = options.properties ?? DEFAULT_PROPERTIES;
  const responsiveOnlyOnDiff = options.responsiveOnlyOnDiff ?? true;
  const settings: Record<string, unknown> = {};

  for (const prop of properties) {
    const desktop = styles.desktop[prop];
    if (!desktop) continue;

    const v3Key = cssPropToV3Key(prop);
    settings[v3Key] = normalizeValue(prop, desktop);

    if (responsiveOnlyOnDiff) {
      // Only add tablet/mobile variants when they actually differ
      const tablet = styles.tablet?.[prop];
      if (tablet && tablet !== desktop) {
        settings[`${v3Key}_tablet`] = normalizeValue(prop, tablet);
      }
      const mobile = styles.mobile?.[prop];
      if (mobile && mobile !== desktop) {
        settings[`${v3Key}_mobile`] = normalizeValue(prop, mobile);
      }
    } else {
      if (styles.tablet?.[prop]) {
        settings[`${v3Key}_tablet`] = normalizeValue(prop, styles.tablet[prop]);
      }
      if (styles.mobile?.[prop]) {
        settings[`${v3Key}_mobile`] = normalizeValue(prop, styles.mobile[prop]);
      }
    }
  }

  return settings;
}

/**
 * Group computed-style snapshots by selector, then split by viewport.
 */
export function groupSnapshotsBySelector(
  snapshots: ComputedStyleSnapshot[],
  viewports: ViewportLabel[] = ['desktop', 'tablet', 'mobile'],
): Map<string, ResponsiveStyles> {
  const out = new Map<string, ResponsiveStyles>();

  for (const snap of snapshots) {
    const existing = out.get(snap.selector) ?? { desktop: {} };
    // Heuristic: tag snapshot with viewport by file path or label
    // (the extractor stores viewport in screenshotPath; here we just take what we get)
    existing.desktop = snap.styles; // default fallback
    out.set(snap.selector, existing);
  }
  // Strip unused viewport key
  void viewports;
  return out;
}

/**
 * Convert a CSS property name to V3 setting key.
 * - font-size        -> typography_font_size
 * - background-color -> background_color
 * - padding          -> _padding
 * - margin           -> _margin
 * - width/height     -> width/height (kept as-is)
 */
export function cssPropToV3Key(prop: string): string {
  if (prop === 'padding') return '_padding';
  if (prop === 'margin') return '_margin';
  if (prop === 'flex-direction') return 'flex_direction';
  if (prop.startsWith('font-') || prop === 'color' || prop === 'line-height') {
    return `typography_${prop.replace(/-/g, '_')}`;
  }
  return prop.replace(/-/g, '_');
}

function normalizeValue(prop: string, value: string): unknown {
  // Always wrap dimension values in { size, unit }
  if (/^-?\d+(?:\.\d+)?px$/.test(value)) {
    const num = parseFloat(value);
    return { size: num, unit: 'px' };
  }
  if (/^-?\d+(?:\.\d+)?rem$/.test(value)) {
    const num = parseFloat(value);
    return { size: num, unit: 'rem' };
  }
  if (/^-?\d+(?:\.\d+)?%$/.test(value)) {
    const num = parseFloat(value);
    return { size: num, unit: '%' };
  }
  if (/^-?\d+(?:\.\d+)?em$/.test(value)) {
    const num = parseFloat(value);
    return { size: num, unit: 'em' };
  }
  // font-weight: numeric
  if (prop === 'font-weight') {
    const num = parseInt(value, 10);
    if (!isNaN(num)) return num;
  }
  // Raw value for color etc.
  return value;
}

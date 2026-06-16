/**
 * Font-Discovery via Network-Interception.
 *
 * Plan-Audit-Fix (CORS-Fix): Iterating over `document.styleSheets[*].cssRules`
 * throws SecurityError for every cross-origin stylesheet (Google Fonts,
 * CDN-hosted fonts) and silently returns an empty list. We never see
 * `@font-face` declarations from fonts.googleapis.com this way.
 *
 * Solution: register `page.route()` handlers BEFORE `page.goto()` and
 * collect URLs as they are requested by the browser. This works for all
 * cross-origin fonts because we see the HTTP request, not the parsed CSS.
 *
 * The intercepted list is deduplicated by URL.
 */

import type { FontIntercept } from './types.js';

const GOOGLE_FONTS_RE = /fonts\.googleapis\.com/;
const GSTATIC_RE = /fonts\.gstatic\.com/;
const WOFF2_RE = /\.woff2(\?|$)/i;
const WOFF_RE = /\.woff(\?|$)/i;
const TTF_RE = /\.(ttf|truetype)(\?|$)/i;
const OTF_RE = /\.(otf|opentype)(\?|$)/i;

/** Classify a font URL by extension / domain. */
export function classifyFontUrl(url: string): FontIntercept['type'] {
  if (GOOGLE_FONTS_RE.test(url)) return 'google-fonts-css';
  if (WOFF2_RE.test(url)) return 'woff2';
  if (WOFF_RE.test(url)) return 'woff';
  if (TTF_RE.test(url)) return 'truetype';
  if (OTF_RE.test(url)) return 'opentype';
  return 'unknown';
}

/**
 * Parse a font URL for `family=...` and `weight=...` query params
 * (common in Google Fonts CSS responses). Returns undefined for
 * non-Google URLs.
 */
export function parseGoogleFontsQuery(url: string): {
  family?: string;
  weight?: number;
  style?: 'normal' | 'italic';
} {
  if (!GOOGLE_FONTS_RE.test(url) && !GSTATIC_RE.test(url)) return {};
  try {
    const u = new URL(url);
    const family = u.searchParams.get('family') ?? undefined;
    const weightStr = u.searchParams.get('weight') ?? undefined;
    const italic = u.searchParams.get('italic') ?? undefined;
    return {
      family: family ? family.split(':')[0] : undefined,
      weight: weightStr ? Number(weightStr) : undefined,
      style: italic ? 'italic' : 'normal',
    };
  } catch {
    return {};
  }
}

/**
 * In-memory dedup store for font URLs.
 * Use one instance per page (or per extraction run).
 */
export class FontUrlCollector {
  private seen = new Set<string>();
  private fonts: FontIntercept[] = [];

  /** Record a font URL if not seen before. */
  add(url: string): void {
    if (this.seen.has(url)) return;
    this.seen.add(url);
    const type = classifyFontUrl(url);
    const parsed = parseGoogleFontsQuery(url);
    this.fonts.push({ url, type, ...parsed });
  }

  /** Get all collected font intercepts (read-only snapshot). */
  list(): FontIntercept[] {
    return [...this.fonts];
  }

  /** Number of unique URLs. */
  count(): number {
    return this.fonts.length;
  }
}

/**
 * Build a Playwright `page.route()` handler that collects font URLs
 * and lets the request continue (we don't block, just observe).
 *
 * Usage:
 * ```ts
 * const collector = new FontUrlCollector();
 * await page.route(woff2Pattern, buildFontRouteHandler(collector));
 * await page.route(gstaticPattern, buildFontRouteHandler(collector));
 * await page.route(googleapisPattern, buildFontRouteHandler(collector));
 * await page.goto(url);
 * const fonts = collector.list();
 * ```
 */
export function buildFontRouteHandler(
  collector: FontUrlCollector,
): (route: import('playwright').Route) => Promise<void> {
  return async (route) => {
    try {
      collector.add(route.request().url());
    } finally {
      await route.continue();
    }
  };
}

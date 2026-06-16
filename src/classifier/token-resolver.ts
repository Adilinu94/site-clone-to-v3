/**
 * Token-Resolver — Phase 3 Sprint 3C
 * Resolves a computed-style value (hex color, dimension, etc.) to a
 * V3 token reference when it matches a known design token.
 *
 * Spec: BAUPLAN-SITE-CLONE-TO-V3.md §Phase 3 — Tasks 4 (CSS-Variable-Token-Resolution)
 *
 * V3 Global-Color-ID convention:  `ct-<semantic-name>`  (e.g. `ct-primary`, `ct-accent`)
 * V3 Typography-ID convention:    `tt-<role>`           (e.g. `tt-heading`, `tt-body`)
 * V3 Custom-Variable convention:  `var-<slugified-name>` (e.g. `var-ease-text`)
 */
import type { DesignTokens } from '../analyzer/design-token-extractor.js';

export interface ResolvedToken {
  /** Token name (e.g. "primary", "background"). */
  token_name: string;
  /** V3 ID convention ("ct-primary"). */
  v3_id: string;
  /** Original value (hex/dimension/etc.). */
  raw_value: string;
  /** Source type. */
  source: 'design-token' | 'css-var';
}

export interface TokenResolverOptions {
  /** CSS custom properties map (--name → resolved value). */
  cssVars?: Record<string, string>;
}

/**
 * Resolve a hex/rgb color value against the design-tokens.json palette.
 * Returns null if no match (caller should use the raw value).
 */
export function resolveColorToken(
  value: string,
  tokens: DesignTokens,
  options: TokenResolverOptions = {},
): ResolvedToken | null {
  if (!value) return null;
  const normalized = normalizeColor(value);
  if (!normalized) return null;

  // Direct match in tokens.colors (hex comparison)
  for (const [semantic, token] of Object.entries(tokens.colors ?? {})) {
    if (!token) continue;
    if (normalizeColor(token.hex) === normalized) {
      return {
        token_name: semantic,
        v3_id: `ct-${semantic}`,
        raw_value: value,
        source: 'design-token',
      };
    }
  }

  // CSS-var hints from the design-token extractor
  for (const [semantic, varName] of Object.entries(tokens.css_var_hints ?? {})) {
    if (!varName) continue;
    const resolved = options.cssVars?.[varName];
    if (resolved && normalizeColor(resolved) === normalized) {
      return {
        token_name: semantic,
        v3_id: `ct-${semantic}`,
        raw_value: value,
        source: 'css-var',
      };
    }
  }

  return null;
}

/**
 * Resolve a CSS custom property (e.g. "var(--color-brand)") to its token name.
 */
export function resolveCssVar(
  cssVarExpression: string,
  tokens: DesignTokens,
): ResolvedToken | null {
  const match = cssVarExpression.match(/var\(\s*(--[a-zA-Z0-9-_]+)\s*\)/);
  if (!match) return null;
  const varName = match[1];

  for (const [semantic, hint] of Object.entries(tokens.css_var_hints ?? {})) {
    if (hint === varName) {
      return {
        token_name: semantic,
        v3_id: `ct-${semantic}`,
        raw_value: cssVarExpression,
        source: 'css-var',
      };
    }
  }
  return null;
}

/**
 * Resolve a font-family to a V3 typography role (heading/body/mono).
 */
export function resolveFontRole(
  fontFamily: string,
  tokens: DesignTokens,
): { role: 'heading' | 'body' | 'mono' | 'system'; v3_id: string } | null {
  if (!fontFamily) return null;
  const normalized = fontFamily.toLowerCase().trim();

  if (tokens.fonts?.heading?.family) {
    if (normalized.includes(tokens.fonts.heading.family.toLowerCase())) {
      return { role: 'heading', v3_id: 'tt-heading' };
    }
  }
  if (tokens.fonts?.body?.family) {
    if (normalized.includes(tokens.fonts.body.family.toLowerCase())) {
      return { role: 'body', v3_id: 'tt-body' };
    }
  }
  if (tokens.fonts?.mono?.family) {
    if (normalized.includes(tokens.fonts.mono.family.toLowerCase())) {
      return { role: 'mono', v3_id: 'tt-mono' };
    }
  }

  // System-font fallback
  if (/apple-system|blinkmacsystemfont|segoe ui|roboto|helvetica|arial/i.test(normalized)) {
    return { role: 'system', v3_id: 'tt-body' };
  }
  return null;
}

function normalizeColor(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  // hex (#abc or #aabbcc)
  const hexMatch = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (hexMatch) {
    if (hexMatch[1].length === 3) {
      return `#${hexMatch[1]
        .split('')
        .map((c) => c + c)
        .join('')}`;
    }
    return `#${hexMatch[1].slice(0, 6)}`;
  }
  // rgb()/rgba()
  const rgbMatch = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10).toString(16).padStart(2, '0');
    const g = parseInt(rgbMatch[2], 10).toString(16).padStart(2, '0');
    const b = parseInt(rgbMatch[3], 10).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  return null;
}

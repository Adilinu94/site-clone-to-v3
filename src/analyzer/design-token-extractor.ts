/**
 * Design-Token-Extractor (Phase 2.5 — orchestrator).
 *
 * Combines color-extractor, font-token-extractor, spacing-extractor
 * into a single `design-tokens.json` output consumed by:
 *   - Phase 5 (V3 Design-System-Sync)
 *   - Wizard Step 7 (Design-Token-Review)
 *
 * Pure function — no Playwright, no I/O. Inputs are the JSON files
 * produced by Sprint 2A-2C extractor stages.
 *
 * Based on BAUPLAN §Phase 2.5.
 */

import {
  extractColorFrequency,
  clusterColors,
  assignSemanticNames,
  buildFrequencyLookup,
  type StyleNode,
  type SemanticColors,
} from './color-extractor.js';
import {
  extractFontTokens,
  type FontTokens,
  type FontDetected,
} from './font-token-extractor.js';
import {
  extractSpacingTokens,
  type SpacingTokens,
} from './spacing-extractor.js';

export interface DesignTokensInput {
  /** Output of styles.json: map viewport-label -> StyleNode[]. */
  styles: StyleNode[];
  /** Output of css-variables.json: --custom-prop -> resolved value. */
  cssVariables: Record<string, string>;
  /** Output of fonts-detected.json: intercepted font URLs. */
  fontsDetected: FontDetected[];
  /** Source URL (for context in output). */
  sourceUrl: string;
}

export interface DesignTokens {
  $schema: string;
  source_url: string;
  extracted_at: string;
  colors: Record<keyof SemanticColors, ColorToken | null>;
  fonts: FontTokens;
  spacing: SpacingTokens;
  /** Css variable hint per role (for downstream traceability). */
  css_var_hints: Record<keyof SemanticColors, string | null>;
  user_overrides: Record<string, unknown>;
}

export interface ColorToken {
  hex: string;
  frequency: number;
  css_var: string | null;
}

export interface DesignTokensOptions {
  maxColorClusters?: number;
  clusterThreshold?: number;
  minSectionHeightPx?: number;
}

const DEFAULT_SCHEMA = 'https://site-clone-to-v3.local/schemas/design-tokens.v1.json';

/** Build a complete design-tokens.json from extractor outputs. */
export function buildDesignTokens(
  input: DesignTokensInput,
  options: DesignTokensOptions = {},
): DesignTokens {
  const maxClusters = options.maxColorClusters ?? 20;
  const clusterThreshold = options.clusterThreshold ?? 15;
  const minSectionHeightPx = options.minSectionHeightPx ?? 400;

  // 1) Color frequency
  const freq = extractColorFrequency(input.styles);

  // 2) Cluster
  const clusters = clusterColors(freq, {
    maxClusters,
    clusterThreshold,
  });

  // 3) Semantic names
  const semantic = assignSemanticNames(clusters, input.cssVariables);

  // 4) Build a lookup {hex -> count} for the output
  const lookup = buildFrequencyLookup(freq);

  // 5) Map semantic roles -> ColorToken (with frequency + css-var hint)
  const cssVarHints = trackCssVarHints(input.cssVariables);
  const colors = mapSemanticToTokens(semantic, lookup, cssVarHints);

  // 6) Fonts
  const fonts = extractFontTokens(input.styles, input.fontsDetected);

  // 7) Spacing
  const spacing = extractSpacingTokens(input.styles, {
    minHeightPx: minSectionHeightPx,
  });

  return {
    $schema: DEFAULT_SCHEMA,
    source_url: input.sourceUrl,
    extracted_at: new Date().toISOString(),
    colors,
    fonts,
    spacing,
    css_var_hints: cssVarHints,
    user_overrides: {},
  };
}

/** Track which CSS-var matched which semantic role. */
function trackCssVarHints(
  cssVars: Record<string, string>,
): Record<keyof SemanticColors, string | null> {
  const out: Record<keyof SemanticColors, string | null> = {
    primary: null,
    secondary: null,
    background: null,
    surface: null,
    text: null,
    'text-muted': null,
    border: null,
    accent: null,
  };
  for (const [varName] of Object.entries(cssVars)) {
    const ln = varName.toLowerCase();
    if (/primary|brand|cta/.test(ln) && !out.primary) out.primary = varName;
    else if (/secondary/.test(ln) && !out.secondary) out.secondary = varName;
    else if (/background|\bbg\b(?!-)/.test(ln) && !out.background) out.background = varName;
    else if (/surface|card|panel/.test(ln) && !out.surface) out.surface = varName;
    else if (/text(?!-)/.test(ln) && !out.text) out.text = varName;
    else if (/muted|subtle|placeholder/.test(ln) && !out['text-muted']) out['text-muted'] = varName;
    else if (/border|divider|separator/.test(ln) && !out.border) out.border = varName;
    else if (/accent/.test(ln) && !out.accent) out.accent = varName;
  }
  return out;
}

/** Map {role: hex|null} -> {role: {hex, frequency, css_var}}. */
function mapSemanticToTokens(
  semantic: SemanticColors,
  freq: Record<string, number>,
  cssVarHints: Record<keyof SemanticColors, string | null>,
): Record<keyof SemanticColors, ColorToken | null> {
  const out = {} as Record<keyof SemanticColors, ColorToken | null>;
  const roles: (keyof SemanticColors)[] = [
    'primary', 'secondary', 'background', 'surface', 'text', 'text-muted', 'border', 'accent',
  ];
  for (const role of roles) {
    const hex = semantic[role];
    if (!hex) {
      out[role] = null;
      continue;
    }
    out[role] = {
      hex,
      frequency: freq[hex] ?? 0,
      css_var: cssVarHints[role],
    };
  }
  return out;
}

/** Re-export of types and primitives for convenience. */
export type { StyleNode, ColorCluster, SemanticColors } from './color-extractor.js';
export type { FontTokens, FontToken, FontDetected } from './font-token-extractor.js';
export type { SpacingTokens } from './spacing-extractor.js';

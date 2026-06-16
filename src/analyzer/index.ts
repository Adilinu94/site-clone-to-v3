/**
 * Public re-exports for the Analyzer module (Phase 2.5).
 */

export {
  buildDesignTokens,
  type DesignTokens,
  type DesignTokensInput,
  type DesignTokensOptions,
  type ColorToken,
} from './design-token-extractor.js';

export {
  extractColorFrequency,
  clusterColors,
  assignSemanticNames,
  buildFrequencyLookup,
  toHex,
  hexToRgb,
  hexDistance,
  luminance,
  saturation,
  COLOR_PROPS,
  type StyleNode,
  type ColorCluster,
  type SemanticColors,
} from './color-extractor.js';

export {
  extractFontTokens,
  mostCommon,
  resolveSource,
  HEADING_TAGS,
  BODY_TAGS,
  type FontTokens,
  type FontToken,
  type FontDetected,
} from './font-token-extractor.js';

export {
  extractSpacingTokens,
  parsePx,
  median,
  mode,
  type SpacingTokens,
} from './spacing-extractor.js';

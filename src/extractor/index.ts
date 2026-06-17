/**
 * Public re-exports for the Extractor module (Sprint 2A).
 */

export { extractFromUrl } from './playwright-extractor.js';
export {
  FontUrlCollector,
  classifyFontUrl,
  parseGoogleFontsQuery,
  buildFontRouteHandler,
} from './font-discovery.js';
export { waitForHydration } from './hydration-wait.js';
export { triggerLazyLoad } from './lazy-scroll.js';
export {
  walkComputedStyles,
  walkComputedStylesMultiViewport,
  injectDefaultsTable,
  CURATED_PROPERTIES,
  type CuratedProperty,
  type WalkOptions,
} from './computed-styles.js';
export { detectSections, mergeSmallSections, areMergeable, DEFAULT_MERGE_THRESHOLD, type DetectSectionsOptions, type MergeThreshold } from './section-detector.js';
export { planAdaptiveSamples, runAdaptiveScroll, type AdaptiveScrollOptions, type AdaptiveScrollResult } from './adaptive-scroll.js';
export type {
  PageSpec,
  SectionSpec,
  WidgetSpec,
  SectionKind,
  WidgetKind,
  DesignTokensSnapshot,
  TokenRef,
} from './spec-schema.js';
export { isPageSpec, emptyTokens } from './spec-schema.js';
export {
  buildPageSpec,
  buildSectionSpec,
  classifySectionKind,
  type BuildSpecInput,
  type ResolvedSection,
} from './spec-builder.js';
export {
  runExtractPipeline,
  preFlightScroll,
  detectSourceFramework,
  type ExtractPipelineOptions,
  type ExtractPipelineResult,
} from './extract-pipeline.js';
export {
  discoverAnimations,
  buildCssBodyCollector,
  type AnimationDiscovery,
  type KeyframeDefinition,
  type TransitionUsage,
  type CrossOriginStylesheet,
} from './keyframes-discovery.js';
export {
  DEFAULT_VIEWPORTS,
  type ViewportConfig,
  type FontIntercept,
  type DiscoveredImage,
  type DiscoveredSvg,
  type DiscoveredFavicon,
  type AnimationInfo,
  type SectionInfo,
  type ComputedStyleSnapshot,
  type ExtractionOptions,
  type ExtractionResult,
} from './types.js';

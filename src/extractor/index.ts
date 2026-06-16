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
export { detectSections, type DetectSectionsOptions } from './section-detector.js';
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

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
export {
  DEFAULT_VIEWPORTS,
  type ViewportConfig,
  type FontIntercept,
  type AnimationInfo,
  type SectionInfo,
  type ComputedStyleSnapshot,
  type ExtractionOptions,
  type ExtractionResult,
} from './types.js';

/**
 * Public entry point for programmatic use (Phase 11 — npm package).
 * Re-exports stable APIs for embedding clone-v3 in other tools.
 */
export { v3Id } from './lib/v3-id.js';
export { CLONE_V3_HOME, profilesPath, sourceAuthPath, researchPath } from './lib/paths.js';
export { withRetry, type RetryOptions } from './lib/with-retry.js';
export { PACKAGE_VERSION } from './lib/version.js';
export {
  createWPCodeAdapter,
  type WPCodeAdapter,
  type WPCodeCreateOptions,
  type WPCodeType,
  type WPCodeLocation,
} from './lib/wpcode-adapter.js';
export {
  createFontsPluginAdapter,
  type FontsPluginAdapter,
  type FontsPluginInfo,
  type CustomFontInput,
} from './lib/fonts-plugin-adapter.js';
export {
  runVisionQa,
  type VisionQaOptions,
  type VisionQaResult,
  type VisionIssue,
  type VisionMatchRating,
  type VisionApiCallFn,
} from './qa/vision-qa.js';
export {
  runHealingLoop,
  type HealingLoopOptions,
  type HealingLoopReport,
  type HealingIterationResult,
  type CaptureFn,
} from './qa/healing-loop.js';

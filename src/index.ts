/**
 * Public entry point for programmatic use (Phase 11 — npm package).
 * Re-exports stable APIs for embedding clone-v3 in other tools.
 */
export { v3Id } from './lib/v3-id.js';
export { CLONE_V3_HOME, profilesPath, sourceAuthPath, researchPath } from './lib/paths.js';
export { withRetry, type RetryOptions } from './lib/with-retry.js';
export { PACKAGE_VERSION } from './lib/version.js';

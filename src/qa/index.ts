/**
 * Barrel-Export for QA-Module.
 *
 * V1 (preserved): acceptance, auto-fix, html-report, issue-detector, ssim,
 *                 strictness, visual-capture, visual-diff.
 *
 * Phase 8 NEW: issue-types (28 total), batched-fix scheduler,
 *             render-capture with timeout/retry/mock-fallback.
 */

export * from './acceptance.js';
export * from './auto-fix.js';
export * from './html-report.js';
export * from './issue-detector.js';
export * from './ssim.js';
export * from './strictness.js';
export * from './visual-capture.js';
export * from './visual-diff.js';
export * from './phase8-issue-types.js';
export * from './phase8-batched-fix.js';
export * from './phase8-render-capture.js';
export * from './real-fixers.js';
export * from './pixel-element-resolver.js';
export * from './vision-qa.js';
export * from './healing-loop.js';
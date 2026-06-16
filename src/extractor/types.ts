/**
 * Type definitions for the Extractor module.
 *
 * Sprint 2A: foundational types for Playwright-based extraction of
 * live websites. Used by font-discovery.ts, playwright-extractor.ts,
 * and the public extractFromUrl() orchestrator in index.ts.
 */

import type { SourceAuth } from '../lib/source-auth.js';

/** Viewport configuration (label + width + height). */
export interface ViewportConfig {
  label: 'desktop' | 'tablet' | 'mobile' | string;
  width: number;
  height: number;
}

/** Default viewport presets (Plan §2: Desktop 1440 / Tablet 768 / Mobile 390). */
export const DEFAULT_VIEWPORTS: ViewportConfig[] = [
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'tablet', width: 768, height: 1024 },
  { label: 'mobile', width: 390, height: 844 },
];

/** A single font URL intercepted via page.route(). */
export interface FontIntercept {
  url: string;
  type: 'woff2' | 'woff' | 'truetype' | 'opentype' | 'google-fonts-css' | 'unknown';
  family?: string;
  weight?: number;
  style?: 'normal' | 'italic';
}

/** A detected section (from Phase 3 Section-Detector; stub here). */
export interface SectionInfo {
  section_id: string;
  selector: string;
  y_range: [number, number];
  layout: string;
  child_count: number;
}

/** Animation/Framework detection results. */
export interface AnimationInfo {
  has_keyframes: boolean;
  keyframe_names: string[];
  has_gsap: boolean;
  has_scrolltrigger: boolean;
  has_framer_motion: boolean;
  has_lenis: boolean;
  /** Sprint 2C: CSS transitions used in the DOM. */
  transitions?: Array<{
    selector: string;
    property: string;
    duration: string;
    easing: string;
    delay: string;
  }>;
  /** Sprint 2C: same-origin / cross-origin split for diagnostics. */
  same_origin_keyframe_count?: number;
  cross_origin_keyframe_count?: number;
}

/** Computed-style snapshot for a single node at a single viewport. */
export interface ComputedStyleSnapshot {
  selector: string;
  tag: string;
  styles: Record<string, string>;
}

/** Top-level extraction options. */
export interface ExtractionOptions {
  /** Source URL to extract from. */
  url: string;
  /** Viewports to capture (default: Desktop/Tablet/Mobile). */
  viewports?: ViewportConfig[];
  /** Output directory for screenshots + JSON files. */
  outputDir: string;
  /** Source authentication (basic/bearer/cookie) — for staging sites. */
  sourceAuth?: SourceAuth;
  /** Save full-page screenshots per viewport (default: true). */
  screenshots?: boolean;
  /** Scroll the page to trigger IntersectionObserver-based lazy-loads (default: true). */
  scrollForLazyLoad?: boolean;
  /** Wait for SPA hydration / DOM to stabilize before extraction (default: true). */
  waitForHydration?: boolean;
  /** Detect @keyframes / GSAP / Lenis (default: true). */
  detectAnimations?: boolean;
  /** Detect page sections (default: true). */
  detectSections?: boolean;
  /** Capture computed styles at all configured viewports (default: false — slow). */
  detectResponsiveStyles?: boolean;
  /** Capture :hover / :focus state styles (default: false — slow). */
  detectHoverStates?: boolean;
  /** Max nodes for computed-style walk (default: 500). */
  maxStyles?: number;
  /** Headless browser (default: chromium). */
  browser?: 'chromium' | 'firefox' | 'webkit';
  /** Custom CSS properties to also read in the computed-style walk. */
  customProperties?: string[];
  /** Max sections to detect (default: 50). */
  maxSections?: number;
}

/** Top-level extraction result. */
export interface ExtractionResult {
  url: string;
  hostname: string;
  extracted_at: string;
  viewports: Array<{
    config: ViewportConfig;
    screenshotPath?: string;
  }>;
  fontsIntercepted: FontIntercept[];
  cssVariables: Record<string, string>;
  sections: SectionInfo[];
  animations: AnimationInfo;
  /** DOM serialized (cheerio-compatible) for downstream analysis. */
  dom?: string;
  /** Per-viewport computed-style snapshots (only if detectResponsiveStyles). */
  computedStyles?: Record<string, ComputedStyleSnapshot[]>;
  /** Phase 2.5: design tokens derived from computed styles + CSS variables. */
  designTokens?: import('../analyzer/design-token-extractor.js').DesignTokens;
}

/**
 * Phase 3 — Type definitions for the Style-Classifier + Section-Picker.
 * Spec: BAUPLAN-SITE-CLONE-TO-V3.md §Phase 3
 */
import type { ComputedStyleSnapshot, SectionInfo } from '../extractor/types.js';
import type { DesignTokens } from '../analyzer/design-token-extractor.js';

/** V3 layout pattern recognized by the classifier. */
export type V3LayoutPattern =
  | 'hero'
  | 'image-text-sbs'
  | 'card-grid'
  | 'sticky-header'
  | 'footer'
  | 'content';

/** V3 widget type. */
export type V3WidgetType =
  | 'heading'
  | 'text-editor'
  | 'button'
  | 'image'
  | 'video'
  | 'form'
  | 'icon'
  | 'divider'
  | 'spacer'
  | 'html';

/** A single V3 widget suggestion. */
export interface V3Widget {
  type: V3WidgetType;
  /** Source DOM element selector (for provenance). */
  source_selector: string;
  /** Source DOM tag (h1, p, img, a.btn, etc.). */
  source_tag: string;
  /** Inner content (text for headings/paragraphs, alt-text for images). */
  content?: string;
  /** V3 settings to apply. */
  settings: Record<string, unknown>;
}

/** A V3 column inside a section. */
export interface V3Column {
  width: string; // '50%' | '33.333%' | 'auto'
  widgets: V3Widget[];
}

/** A V3 section (top-level elementor container). */
export interface V3Section {
  pattern: V3LayoutPattern;
  columns: V3Column[];
  settings: Record<string, unknown>;
  animations: Array<{
    type: 'css-keyframe' | 'gsap' | 'css-transition';
    name?: string;
    target: string;
    duration?: string;
  }>;
}

/** Settings provenance — where each setting came from. */
export interface SettingsProvenance {
  [key: string]: {
    source: 'computed-style' | 'design-token' | 'css-var' | 'user-override';
    value: unknown;
    token_name?: string;
    css_var?: string;
  };
}

/** A single classified section's spec (output of Phase 3). */
export interface SectionSpec {
  $schema: string;
  section_id: string;
  source: {
    url: string;
    selector: string;
    y_range: [number, number];
    screenshot?: string;
  };
  pattern: V3LayoutPattern;
  v3_section: V3Section;
  settings_provenance: SettingsProvenance;
  assets_required: Array<{
    type: 'image' | 'video' | 'font' | 'svg' | 'icon';
    url: string;
    target: string;
  }>;
  animations_required: Array<{
    type: 'css-keyframe' | 'gsap';
    name: string;
    target: string;
    duration?: string;
  }>;
  user_overrides: Record<string, unknown>;
}

/** Per-section Picker state (user decision). */
export interface PickerDecision {
  section_id: string;
  decision: 'approve' | 'skip' | 'review';
  reviewed_at?: string;
  notes?: string;
}

/** Output manifest of the Section-Picker. */
export interface SelectedSections {
  url: string;
  extracted_at: string;
  decisions: PickerDecision[];
  approved_count: number;
  skipped_count: number;
}

/** Helper: extract just the per-section computed-style scope. */
export function scopeSnapshotsToSection(
  section: SectionInfo,
  all: ComputedStyleSnapshot[],
): ComputedStyleSnapshot[] {
  // Include the section itself + all descendants (selectors that start with section.selector)
  const root = section.selector;
  return all.filter(
    (s) => s.selector === root || s.selector.startsWith(`${root} >`),
  );
}

/** Token re-export for convenience. */
export type { DesignTokens };

/**
 * Widget-Validator — V2 Phase 5
 * Pre-build validation for V3 widgets. Catches missing required settings,
 * unknown widget types, Pro-only widgets in non-Pro targets, and orphaned
 * asset references before they reach the Elementor builder.
 *
 * Spec: BAUPLAN-V3-PIXEL-PERFEKT.md §9.5
 */
import type { V3Widget, V3WidgetType, WidgetSpec } from './types.js';
import type { ProWidgetSuggestion, ProWidgetType } from './widget-mapper.js';
import type { ProState } from './widget-degradation.js';

export type WidgetIssueSeverity = 'error' | 'warning' | 'info';

export interface WidgetIssue {
  severity: WidgetIssueSeverity;
  widget_type: V3WidgetType | ProWidgetType;
  source_selector?: string;
  code: string;
  message: string;
  /** Suggested fix (e.g. "supply 'editor' setting"). */
  suggestion?: string;
}

export interface WidgetValidationOptions {
  /** Current Pro state of the target WordPress install. */
  proState: ProState;
  /** Set of Pro-only widget types that are NOT allowed in this run. */
  disallowedProWidgets?: ReadonlySet<ProWidgetType>;
}

export interface WidgetValidationResult {
  ok: boolean;
  issues: WidgetIssue[];
  errors: number;
  warnings: number;
  info: number;
}

/** Required settings per V3 widget type (minimum keys that must be present). */
const REQUIRED_V3_SETTINGS: Readonly<Record<V3WidgetType, readonly string[]>> = {
  heading: ['title', 'header_size'],
  'text-editor': ['editor'],
  button: ['text'],
  image: [], // image can render with just URL
  video: [],
  form: [],
  icon: [],
  divider: [],
  spacer: [],
  html: [],
};

/** Known V3 widget types (free). */
export const KNOWN_V3_WIDGET_TYPES: ReadonlySet<V3WidgetType> = new Set<V3WidgetType>([
  'heading',
  'text-editor',
  'button',
  'image',
  'video',
  'form',
  'icon',
  'divider',
  'spacer',
  'html',
]);

/** Known Pro widget types. */
export const KNOWN_PRO_WIDGET_TYPES: ReadonlySet<ProWidgetType> = new Set<ProWidgetType>([
  'slider',
  'accordion',
  'tabs',
  'counter',
  'testimonial-carousel',
  'price-table',
  'animated-headline',
  'progress-bar',
  'forms',
  'posts',
  'share-buttons',
  'gallery',
  'image-box',
  'icon-box',
]);

/** Check whether a string key is a known V3 widget type. */
export function isKnownV3WidgetType(value: string): value is V3WidgetType {
  return (KNOWN_V3_WIDGET_TYPES as ReadonlySet<string>).has(value);
}

/** Check whether a string key is a known Pro widget type. */
export function isKnownProWidgetType(value: string): value is ProWidgetType {
  return (KNOWN_PRO_WIDGET_TYPES as ReadonlySet<string>).has(value);
}

/** Validate a single V3 widget spec. */
export function validateV3Widget(
  widget: V3Widget | WidgetSpec,
  options: WidgetValidationOptions,
): WidgetIssue[] {
  const issues: WidgetIssue[] = [];

  // 1. Unknown type
  if (!isKnownV3WidgetType(widget.type)) {
    issues.push({
      severity: 'error',
      widget_type: widget.type,
      source_selector: widget.source_selector,
      code: 'unknown_widget_type',
      message: `Unknown V3 widget type: ${widget.type}`,
      suggestion: 'Use one of: heading, text-editor, button, image, video, form, icon, divider, spacer, html',
    });
    return issues; // skip remaining checks if type is unknown
  }

  // 2. Pro-only type slipped through
  if (isKnownProWidgetType(widget.type)) {
    issues.push({
      severity: 'error',
      widget_type: widget.type,
      source_selector: widget.source_selector,
      code: 'pro_widget_in_v3_run',
      message: `Pro-only widget "${widget.type}" present in V3 build but Pro state is ${options.proState}`,
      suggestion: 'Run degradeProWidgets() before building',
    });
  }

  // 3. Disallowed Pro widget
  if (options.disallowedProWidgets?.has(widget.type as ProWidgetType)) {
    issues.push({
      severity: 'error',
      widget_type: widget.type,
      source_selector: widget.source_selector,
      code: 'disallowed_pro_widget',
      message: `Widget "${widget.type}" is explicitly disallowed in this run`,
      suggestion: 'Remove from widget list or upgrade target',
    });
  }

  // 4. Missing required settings
  const required = REQUIRED_V3_SETTINGS[widget.type] ?? [];
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(widget.settings, key)) {
      issues.push({
        severity: 'error',
        widget_type: widget.type,
        source_selector: widget.source_selector,
        code: 'missing_required_setting',
        message: `Widget "${widget.type}" is missing required setting "${key}"`,
        suggestion: `Provide "${key}" in settings`,
      });
    }
  }

  // 5. Image: must have URL when required
  if (widget.type === 'image' && !hasImageUrl(widget.settings)) {
    issues.push({
      severity: 'warning',
      widget_type: widget.type,
      source_selector: widget.source_selector,
      code: 'missing_image_url',
      message: 'Image widget has no URL — will render as empty placeholder',
    });
  }

  // 6. Button: text must be non-empty
  if (widget.type === 'button') {
    const text = widget.settings['text'];
    if (typeof text !== 'string' || text.trim().length === 0) {
      issues.push({
        severity: 'warning',
        widget_type: widget.type,
        source_selector: widget.source_selector,
        code: 'empty_button_text',
        message: 'Button widget has empty text',
      });
    }
  }

  return issues;
}

/** Validate a single Pro widget suggestion. */
export function validateProWidget(
  widget: ProWidgetSuggestion,
  options: WidgetValidationOptions,
): WidgetIssue[] {
  const issues: WidgetIssue[] = [];

  // 1. Unknown Pro type
  if (!isKnownProWidgetType(widget.type)) {
    issues.push({
      severity: 'error',
      widget_type: widget.type,
      source_selector: widget.source_selector,
      code: 'unknown_pro_widget_type',
      message: `Unknown Pro widget type: ${widget.type}`,
    });
  }

  // 2. Pro widget used when Pro is absent (caller forgot to degrade)
  if (options.proState === 'absent') {
    issues.push({
      severity: 'error',
      widget_type: widget.type,
      source_selector: widget.source_selector,
      code: 'pro_widget_without_pro',
      message: `Pro widget "${widget.type}" passed to build but target has no Pro`,
      suggestion: 'Run degradeProWidgets() with proState="absent"',
    });
  }

  // 3. Pro state unknown → info-level warning
  if (options.proState === 'unknown') {
    issues.push({
      severity: 'info',
      widget_type: widget.type,
      source_selector: widget.source_selector,
      code: 'pro_widget_pro_state_unknown',
      message: `Pro widget "${widget.type}" with unknown Pro state — will attempt render`,
    });
  }

  // 4. Disallowed Pro widget
  if (options.disallowedProWidgets?.has(widget.type)) {
    issues.push({
      severity: 'error',
      widget_type: widget.type,
      source_selector: widget.source_selector,
      code: 'disallowed_pro_widget',
      message: `Pro widget "${widget.type}" is explicitly disallowed`,
    });
  }

  // 5. Missing content for content-required widgets
  const contentRequired: ReadonlySet<ProWidgetType> = new Set<ProWidgetType>([
    'counter',
    'animated-headline',
    'image-box',
    'icon-box',
  ]);
  if (
    contentRequired.has(widget.type) &&
    (!widget.content || widget.content.trim().length === 0)
  ) {
    issues.push({
      severity: 'warning',
      widget_type: widget.type,
      source_selector: widget.source_selector,
      code: 'missing_content',
      message: `Pro widget "${widget.type}" has empty content`,
    });
  }

  return issues;
}

/** Validate a whole batch of widgets (V3 + Pro mixed). */
export function validateWidgets(
  widgets: ReadonlyArray<V3Widget | WidgetSpec | ProWidgetSuggestion>,
  options: WidgetValidationOptions,
): WidgetValidationResult {
  const issues: WidgetIssue[] = [];

  for (const widget of widgets) {
    if (isProWidgetSuggestion(widget)) {
      issues.push(...validateProWidget(widget, options));
    } else {
      issues.push(...validateV3Widget(widget, options));
    }
  }

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const info = issues.filter((i) => i.severity === 'info').length;

  return { ok: errors === 0, issues, errors, warnings, info };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isProWidgetSuggestion(
  widget: V3Widget | WidgetSpec | ProWidgetSuggestion,
): widget is ProWidgetSuggestion {
  return (widget as ProWidgetSuggestion).requires_pro === true;
}

function hasImageUrl(settings: Record<string, unknown>): boolean {
  const url = settings['url'] ?? settings['image'] ?? settings['src'];
  if (typeof url === 'string') return url.trim().length > 0;
  if (url && typeof url === 'object') {
    const nested = (url as Record<string, unknown>)['url'];
    return typeof nested === 'string' && nested.trim().length > 0;
  }
  return false;
}
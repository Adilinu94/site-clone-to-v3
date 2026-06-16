/**
 * Widget-Mapper — Phase 3 Sprint 3B
 * Maps DOM elements to V3 widget suggestions based on tag + classes + computed
 * styles. Each widget carries source-provenance for downstream editability.
 *
 * Spec: BAUPLAN-SITE-CLONE-TO-V3.md §Phase 3 — Tasks 2 (Widget-Mapping)
 *
 * Mapping:
 *   h1-h6                       -> heading
 *   p                           -> text-editor
 *   a.btn / a.button / a[class] -> button
 *   img / picture               -> image
 *   video                       -> video
 *   form                        -> form (warn if Pro-only)
 *   svg / icon-*                -> icon
 *   hr                          -> divider
 *   unknown                     -> html (fallback)
 */
import type { V3Widget } from './types.js';

export interface WidgetMappingOptions {
  /** Warn (don't throw) when encountering a Pro-only widget. */
  warnOnPro?: boolean;
}

export interface WidgetMappingResult extends V3Widget {
  warnings: string[];
}

/**
 * Map a single DOM element to a V3 widget suggestion.
 */
export function mapElementToWidget(
  tag: string,
  selector: string,
  styles: Record<string, string>,
  content?: string,
  options: WidgetMappingOptions = {},
): WidgetMappingResult {
  const tagLower = tag.toLowerCase();
  const warnings: string[] = [];

  // 1. Headings
  if (/^h[1-6]$/.test(tagLower)) {
    return {
      type: 'heading',
      source_selector: selector,
      source_tag: tagLower,
      content,
      settings: buildHeadingSettings(tagLower, styles),
      warnings,
    };
  }

  // 2. Paragraphs
  if (tagLower === 'p') {
    return {
      type: 'text-editor',
      source_selector: selector,
      source_tag: tagLower,
      content,
      settings: buildTextSettings(styles),
      warnings,
    };
  }

  // 3. Buttons (anchors with btn class, or <button>)
  if (tagLower === 'button' || (tagLower === 'a' && hasButtonClass(selector))) {
    return {
      type: 'button',
      source_selector: selector,
      source_tag: tagLower,
      content,
      settings: buildButtonSettings(styles),
      warnings,
    };
  }

  // 4. Images
  if (tagLower === 'img' || tagLower === 'picture') {
    return {
      type: 'image',
      source_selector: selector,
      source_tag: tagLower,
      content,
      settings: buildImageSettings(styles),
      warnings,
    };
  }

  // 5. Video
  if (tagLower === 'video') {
    return {
      type: 'video',
      source_selector: selector,
      source_tag: tagLower,
      content,
      settings: buildVideoSettings(styles),
      warnings,
    };
  }

  // 6. Form (Pro-only in V3)
  if (tagLower === 'form') {
    if (options.warnOnPro !== false) {
      warnings.push('form widget requires Elementor Pro — will fallback to html');
    }
    return {
      type: 'form',
      source_selector: selector,
      source_tag: tagLower,
      content,
      settings: {},
      warnings,
    };
  }

  // 7. SVG / icon classes
  if (tagLower === 'svg' || /icon/.test(selector)) {
    return {
      type: 'icon',
      source_selector: selector,
      source_tag: tagLower,
      content,
      settings: buildIconSettings(styles),
      warnings,
    };
  }

  // 8. Horizontal rule
  if (tagLower === 'hr') {
    return {
      type: 'divider',
      source_selector: selector,
      source_tag: tagLower,
      content: undefined,
      settings: buildDividerSettings(styles),
      warnings,
    };
  }

  // 9. Fallback: html widget
  return {
    type: 'html',
    source_selector: selector,
    source_tag: tagLower,
    content,
    settings: {},
    warnings: [`No specific widget mapping for <${tagLower}> — using html fallback`],
  };
}

/**
 * Walk a list of (tag, selector, styles) tuples and return widget suggestions.
 * Preserves order of input.
 */
export function mapElementsToWidgets(
  elements: Array<{
    tag: string;
    selector: string;
    styles: Record<string, string>;
    content?: string;
  }>,
  options: WidgetMappingOptions = {},
): WidgetMappingResult[] {
  return elements.map((el) =>
    mapElementToWidget(el.tag, el.selector, el.styles, el.content, options),
  );
}

function hasButtonClass(selector: string): boolean {
  return /(^|[\s\.\#])(btn|button|cta)([-_\s\.\#:]|$)/i.test(selector);
}

function buildHeadingSettings(
  tag: string,
  styles: Record<string, string>,
): Record<string, unknown> {
  const settings: Record<string, unknown> = {
    title: '',
    header_size: tag.toUpperCase(), // H1, H2, ...
  };
  if (styles['font-size']) {
    const px = parsePx(styles['font-size']);
    if (px !== null) {
      settings.typography_font_size = { size: px, unit: 'px' };
      settings.typography_typography = 'custom';
    }
  }
  if (styles['font-weight']) {
    settings.typography_font_weight = parseInt(styles['font-weight'], 10) || 400;
  }
  if (styles['color']) settings.title_color = styles['color'];
  if (styles['line-height']) settings.typography_line_height = { size: styles['line-height'], unit: 'px' };
  if (styles['text-align']) settings.align = styles['text-align'];
  return settings;
}

function buildTextSettings(styles: Record<string, string>): Record<string, unknown> {
  const settings: Record<string, unknown> = { editor: '' };
  if (styles['font-size']) {
    const px = parsePx(styles['font-size']);
    if (px !== null) {
      settings.typography_font_size = { size: px, unit: 'px' };
      settings.typography_typography = 'custom';
    }
  }
  if (styles['color']) settings.text_color = styles['color'];
  if (styles['line-height']) settings.typography_line_height = { size: styles['line-height'], unit: 'px' };
  return settings;
}

function buildButtonSettings(styles: Record<string, string>): Record<string, unknown> {
  const settings: Record<string, unknown> = {
    text: '',
    align: 'left',
  };
  if (styles['background-color'] && !isTransparent(styles['background-color'])) {
    settings.background_color = styles['background-color'];
  }
  if (styles['color']) settings.text_color = styles['color'];
  if (styles['border-top-left-radius']) {
    const r = parsePx(styles['border-top-left-radius']);
    if (r !== null) {
      settings.border_radius = {
        top: `${r}px`,
        right: `${r}px`,
        bottom: `${r}px`,
        left: `${r}px`,
      };
    }
  }
  if (styles['padding-top'] || styles['padding-left']) {
    const pt = parsePx(styles['padding-top']) ?? 12;
    const pl = parsePx(styles['padding-left']) ?? 24;
    settings.text_padding = {
      top: `${pt}px`,
      right: `${pl}px`,
      bottom: `${pt}px`,
      left: `${pl}px`,
      unit: 'px',
    };
  }
  return settings;
}

function buildImageSettings(styles: Record<string, string>): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  if (styles['width']) {
    const px = parsePx(styles['width']);
    if (px !== null) settings.width = { size: px, unit: 'px' };
  }
  if (styles['height']) {
    const px = parsePx(styles['height']);
    if (px !== null) settings.height = { size: px, unit: 'px' };
  }
  if (styles['object-fit']) settings.object_fit = styles['object-fit'];
  if (styles['border-radius']) {
    const px = parsePx(styles['border-radius']);
    if (px !== null) settings.image_border_radius = `${px}px`;
  }
  return settings;
}

function buildVideoSettings(styles: Record<string, string>): Record<string, unknown> {
  return {
    video_type: 'hosted',
    ...(styles['width'] ? { width: styles['width'] } : {}),
    ...(styles['aspect-ratio'] ? { aspect_ratio: styles['aspect-ratio'] } : {}),
  };
}

function buildIconSettings(styles: Record<string, string>): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  if (styles['color']) settings.primary_color = styles['color'];
  if (styles['width']) {
    const px = parsePx(styles['width']);
    if (px !== null) settings.size = { size: px, unit: 'px' };
  }
  return settings;
}

function buildDividerSettings(styles: Record<string, string>): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  if (styles['border-top-color']) settings.color = styles['border-top-color'];
  if (styles['border-top-width']) {
    const px = parsePx(styles['border-top-width']);
    if (px !== null) settings.weight = { size: px, unit: 'px' };
  }
  return settings;
}

function parsePx(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^(-?\d+(?:\.\d+)?)px$/);
  return match ? parseFloat(match[1]) : null;
}

function isTransparent(value: string): boolean {
  return /rgba\([^)]+,\s*0\)|transparent/.test(value);
}

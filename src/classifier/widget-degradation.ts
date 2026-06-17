/**
 * Widget-Degradation — V2 Phase 5
 * Resolves Pro-only widgets to free fallback widgets (text-editor or html)
 * when Elementor Pro is not available on the target.
 *
 * Strategy:
 *   - If hasPro === true        → keep ProWidgetSuggestion as-is (caller decides)
 *   - If hasPro === false       → substitute via chosen fallback type
 *   - If hasPro === 'unknown'   → degrade conservatively (always text-editor/html)
 *
 * Spec: BAUPLAN-V3-PIXEL-PERFEKT.md §9.4
 */
import type { ProWidgetSuggestion, ProWidgetType } from './widget-mapper.js';
import type { V3Widget, WidgetSpec } from './types.js';

/** Free-widget fallback types. */
export type FallbackWidgetType = 'text-editor' | 'html';

/** The state of Pro on the target site (driven by pro-detector). */
export type ProState = 'present' | 'absent' | 'unknown';

/** One degradation record: which Pro widget fell back to which free widget + reason. */
export interface DegradationRecord {
  source_selector: string;
  pro_widget: ProWidgetType;
  fallback_widget: FallbackWidgetType;
  reason: string;
  /** True if any non-text content (images, iframes) was preserved as raw HTML. */
  preserved_assets: number;
}

/** Result of degrading a list of Pro widgets. */
export interface DegradationResult {
  /** Substituted widgets (ProWidgetSuggestion → V3Widget fallback). */
  fallbacks: V3Widget[];
  /** Unsubstituted Pro widgets (Pro is present). */
  kept: ProWidgetSuggestion[];
  /** Per-widget degradation records. */
  records: DegradationRecord[];
  /** Total count of widgets that fell back to free widgets. */
  degraded_count: number;
}

/** Convert a Pro widget suggestion into a free fallback widget. */
export function degradeProWidget(
  pro: ProWidgetSuggestion,
  proState: ProState,
): V3Widget {
  // If Pro is present, return the Pro widget wrapped as a V3Widget (caller handles it).
  if (proState === 'present') {
    return {
      type: 'html',
      source_selector: pro.source_selector,
      source_tag: pro.source_tag,
      content: undefined,
      settings: { _pro_widget: pro.type, _pro_settings: pro.settings },
    };
  }

  // Otherwise substitute per chosen fallback.
  if (pro.fallback === 'html') {
    return degradeToHtml(pro);
  }
  return degradeToTextEditor(pro);
}

function degradeToTextEditor(pro: ProWidgetSuggestion): V3Widget {
  const editor = renderProAsEditor(pro);
  return {
    type: 'text-editor',
    source_selector: pro.source_selector,
    source_tag: pro.source_tag,
    content: editor,
    settings: { editor, _degraded_from: pro.type, _reason: pro.warnings.join(' | ') },
  };
}

function degradeToHtml(pro: ProWidgetSuggestion): V3Widget {
  const html = renderProAsHtml(pro);
  return {
    type: 'html',
    source_selector: pro.source_selector,
    source_tag: pro.source_tag,
    content: html,
    settings: { html, _degraded_from: pro.type, _reason: pro.warnings.join(' | ') },
  };
}

/** Render a Pro widget as semantic HTML (used by html fallback). */
export function renderProAsHtml(pro: ProWidgetSuggestion): string {
  switch (pro.type) {
    case 'forms':
      return `<form class="elementor-form-fallback" data-clone-source="${pro.source_selector}">${pro.content ?? ''}</form>`;
    case 'gallery':
      return `<div class="elementor-gallery-fallback" data-clone-source="${pro.source_selector}">${pro.content ?? ''}</div>`;
    case 'posts':
      return `<div class="elementor-posts-fallback" data-clone-source="${pro.source_selector}">${pro.content ?? ''}</div>`;
    default:
      return renderProAsEditor(pro);
  }
}

/** Render a Pro widget as text-editor body (semantic, no markup shells). */
export function renderProAsEditor(pro: ProWidgetSuggestion): string {
  if (pro.content && pro.content.trim().length > 0) return pro.content;
  switch (pro.type) {
    case 'counter':
      return '0';
    case 'progress-bar':
      return '0%';
    case 'testimonial-carousel':
      return '';
    case 'animated-headline':
      return '';
    default:
      return '';
  }
}

/** Count non-text assets (img, iframe, video) preserved in fallback HTML. */
export function countPreservedAssets(html: string): number {
  if (!html) return 0;
  const matches = html.match(/<(img|iframe|video|picture)\b/gi);
  return matches ? matches.length : 0;
}

/** Degrade a list of Pro widgets according to a single Pro-state decision. */
export function degradeProWidgets(
  pros: readonly ProWidgetSuggestion[],
  proState: ProState,
): DegradationResult {
  const fallbacks: V3Widget[] = [];
  const kept: ProWidgetSuggestion[] = [];
  const records: DegradationRecord[] = [];

  for (const pro of pros) {
    if (proState === 'present') {
      kept.push(pro);
      records.push({
        source_selector: pro.source_selector,
        pro_widget: pro.type,
        fallback_widget: pro.fallback,
        reason: 'Pro present — kept as Pro widget',
        preserved_assets: 0,
      });
      continue;
    }

    const fallback = degradeProWidget(pro, proState);
    const html = fallback.settings['html'];
    const preserved_assets = typeof html === 'string' ? countPreservedAssets(html) : 0;

    fallbacks.push(fallback);
    records.push({
      source_selector: pro.source_selector,
      pro_widget: pro.type,
      fallback_widget: pro.fallback,
      reason: proState === 'unknown'
        ? `Pro state unknown — degraded conservatively to ${pro.fallback}`
        : `Pro absent — degraded to ${pro.fallback}`,
      preserved_assets,
    });
  }

  return {
    fallbacks,
    kept,
    records,
    degraded_count: fallbacks.length,
  };
}

/** Helper: convert a V3Widget (output of degradation) to a flat WidgetSpec. */
export function toWidgetSpec(widget: V3Widget): WidgetSpec {
  return {
    type: widget.type,
    source_selector: widget.source_selector,
    source_tag: widget.source_tag,
    content: widget.content,
    settings: widget.settings,
    classes: undefined,
  };
}
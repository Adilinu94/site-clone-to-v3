/**
 * Phase-5 Classifier tests — Pro-Detector, Pro-Widget Mapping, Degradation, Validation
 * Spec: BAUPLAN-V3-PIXEL-PERFEKT.md §9
 */
import { describe, it, expect } from 'vitest';
import {
  detectElementorPro,
  isProScriptSrc,
  isProScriptBody,
  isProClassName,
  isProWindowGlobal,
  isProGeneratorMeta,
  isProRestEndpoint,
  isProCustomElement,
  type ProDetectionInput,
} from '../../src/classifier/pro-detector.js';
import {
  detectProWidget,
  type ProWidgetSuggestion,
} from '../../src/classifier/widget-mapper.js';
import {
  degradeProWidget,
  degradeProWidgets,
  renderProAsHtml,
  renderProAsEditor,
  countPreservedAssets,
  toWidgetSpec,
  type ProState,
} from '../../src/classifier/widget-degradation.js';
import {
  validateV3Widget,
  validateProWidget,
  validateWidgets,
  isKnownV3WidgetType,
  isKnownProWidgetType,
  KNOWN_V3_WIDGET_TYPES,
  KNOWN_PRO_WIDGET_TYPES,
} from '../../src/classifier/widget-validator.js';
import type { V3Widget, WidgetSpec } from '../../src/classifier/types.js';

// ─────────────────────────────────────────────────────────────────────────────
// pro-detector
// ─────────────────────────────────────────────────────────────────────────────

describe('pro-detector', () => {
  it('detects Pro from script src', () => {
    expect(isProScriptSrc('https://example.com/wp-content/plugins/elementor-pro/assets/js/frontend.js')).toBe(true);
    expect(isProScriptSrc('https://example.com/elementor-pro.min.js')).toBe(true);
    expect(isProScriptSrc('https://example.com/elementor.js')).toBe(false);
  });

  it('detects Pro from script body markers', () => {
    expect(isProScriptBody('var elementorProVersion = "3.18.0";')).toBe(true);
    expect(isProScriptBody('{"pro": true}')).toBe(true);
    expect(isProScriptBody('var elementorVersion = "3.18.0";')).toBe(false);
  });

  it('detects Pro from class names', () => {
    expect(isProClassName('elementor-widget-pro-foo')).toBe(true);
    expect(isProClassName('elementor-pro-something')).toBe(true);
    expect(isProClassName('elementor-widget-heading')).toBe(false);
  });

  it('detects Pro from window globals', () => {
    expect(isProWindowGlobal('elementorProFrontend', {})).toBe(true);
    expect(isProWindowGlobal('ElementorProConfig', {})).toBe(true);
    expect(isProWindowGlobal('elementor_pro_version', '3.18.0')).toBe(true);
    expect(isProWindowGlobal('elementor_pro_version', '')).toBe(false);
    expect(isProWindowGlobal('elementorFrontend', {})).toBe(false);
  });

  it('detects Pro from generator meta', () => {
    expect(isProGeneratorMeta('Elementor Pro 3.18.0')).toBe(true);
    expect(isProGeneratorMeta('Elementor 3.18.0')).toBe(false);
  });

  it('detects Pro from REST endpoints', () => {
    expect(isProRestEndpoint('/wp-json/elementor-pro/v1/forms')).toBe(true);
    expect(isProRestEndpoint('/wp-json/elementor/v1/forms')).toBe(false);
  });

  it('detects Pro from custom elements', () => {
    expect(isProCustomElement('elementor-pro-counter')).toBe(true);
    expect(isProCustomElement('elementor-heading')).toBe(false);
  });

  it('returns hasPro=false when no positive signals', () => {
    const r = detectElementorPro({
      scriptSrcs: ['https://example.com/elementor.js'],
      classNames: ['elementor-widget-heading'],
    });
    expect(r.hasPro).toBe(false);
    expect(r.signals.length).toBe(0);
  });

  it('returns hasPro=true with weighted confidence', () => {
    const input: ProDetectionInput = {
      scriptSrcs: ['https://example.com/elementor-pro.min.js'],
      generatorMeta: ['Elementor Pro 3.18.0'],
    };
    const r = detectElementorPro(input);
    expect(r.hasPro).toBe(true);
    expect(r.confidence).toBeGreaterThan(0.7);
    expect(r.signals.length).toBe(2);
  });

  it('respects explicit negative REST endpoint', () => {
    const r = detectElementorPro({
      restEndpoints: { '/wp-json/elementor-pro/v1/forms': false },
    });
    expect(r.hasPro).toBe(false);
    expect(r.confidence).toBe(0.7);
  });

  it('combines multiple weak signals into meaningful confidence', () => {
    const r = detectElementorPro({
      classNames: ['elementor-widget-pro-counter', 'elementor-pro-form'],
      customElements: ['elementor-pro-tabs'],
    });
    expect(r.hasPro).toBe(true);
    expect(r.confidence).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// widget-mapper (Pro widgets)
// ─────────────────────────────────────────────────────────────────────────────

describe('widget-mapper (Pro)', () => {
  it('detects slider from elementor-widget-slider class', () => {
    const r = detectProWidget({
      tag: 'div',
      selector: '.elementor-widget-slider',
      classes: ['elementor-widget-slider'],
      attributes: {},
      childStructure: [
        { tag: 'div', selector: '.swiper-slide' },
        { tag: 'div', selector: '.swiper-slide' },
      ],
    });
    expect(r).not.toBeNull();
    expect(r!.type).toBe('slider');
    expect(r!.requires_pro).toBe(true);
    expect(r!.settings['slides_count']).toBe(2);
  });

  it('detects accordion from data-accordion', () => {
    const r = detectProWidget({
      tag: 'div',
      selector: '.accordion',
      attributes: { 'data-accordion': 'true', 'data-default-state': 'collapsed' },
      childStructure: [
        { tag: 'h3', selector: '.tab-title' },
        { tag: 'h3', selector: '.tab-title' },
      ],
    });
    expect(r?.type).toBe('accordion');
    expect(r?.detection).toBe('data-attr');
    expect(r?.settings['default_state']).toBe('collapsed');
  });

  it('detects tabs', () => {
    const r = detectProWidget({
      tag: 'div',
      selector: '.elementor-widget-tabs',
      classes: ['elementor-widget-tabs'],
      childStructure: [
        { tag: 'div', selector: '.tab-title-1' },
        { tag: 'div', selector: '.tab-content-1' },
      ],
    });
    expect(r?.type).toBe('tabs');
  });

  it('detects counter with prefix/suffix', () => {
    const r = detectProWidget({
      tag: 'div',
      selector: '.counter',
      classes: ['counter-stat'],
      content: '$1.5K+',
    });
    expect(r?.type).toBe('counter');
    expect(r?.settings['prefix']).toBe('$');
    expect(r?.settings['ending_number']).toBe(1.5);
  });

  it('detects testimonial-carousel by swiper-slide structure', () => {
    const r = detectProWidget({
      tag: 'div',
      selector: '.elementor-widget-testimonial',
      classes: ['elementor-widget-testimonial'],
      childStructure: [
        { tag: 'div', selector: '.swiper-slide' },
        { tag: 'div', selector: '.swiper-slide' },
        { tag: 'div', selector: '.swiper-slide' },
      ],
    });
    expect(r?.type).toBe('testimonial-carousel');
    expect(r?.settings['slides_count']).toBe(3);
  });

  it('detects price-table by structural pattern', () => {
    const r = detectProWidget({
      tag: 'div',
      selector: '.price-block',
      childStructure: [
        { tag: 'h3', selector: '.plan-name' },
        { tag: 'ul', selector: '.features' },
        { tag: 'a', selector: '.cta' },
      ],
    });
    expect(r?.type).toBe('price-table');
    expect(r?.detection).toBe('price-pattern');
  });

  it('detects animated-headline', () => {
    const r = detectProWidget({
      tag: 'h2',
      selector: '.elementor-headline',
      classes: ['elementor-headline'],
      content: 'We build bold things',
      attributes: { 'data-animation': 'rotate-3' },
    });
    expect(r?.type).toBe('animated-headline');
    expect(r?.settings['headline_text']).toBe('We build bold things');
  });

  it('detects progress-bar with data-percent', () => {
    const r = detectProWidget({
      tag: 'div',
      selector: '.elementor-progress-bar',
      classes: ['elementor-progress-bar'],
      attributes: { 'data-percent': '75', 'data-inner-text': 'Loading' },
    });
    expect(r?.type).toBe('progress-bar');
    expect(r?.settings['percent']).toEqual({ size: 75, unit: '%' });
    expect(r?.settings['inner_text']).toBe('Loading');
  });

  it('detects forms', () => {
    const r = detectProWidget({
      tag: 'form',
      selector: '.elementor-form',
      classes: ['elementor-form'],
      attributes: { name: 'contact' },
      childStructure: [
        { tag: 'input', selector: '.field-name' },
        { tag: 'input', selector: '.field-email' },
        { tag: 'textarea', selector: '.field-message' },
      ],
    });
    expect(r?.type).toBe('forms');
    expect(r?.settings['form_name']).toBe('contact');
    expect((r?.settings['form_fields'] as unknown[]).length).toBe(3);
  });

  it('detects posts', () => {
    const r = detectProWidget({
      tag: 'div',
      selector: '.elementor-widget-posts',
      classes: ['elementor-widget-posts'],
      attributes: { 'data-posts-per-page': '9', 'data-layout': 'masonry' },
    });
    expect(r?.type).toBe('posts');
    expect(r?.settings['posts_per_page']).toBe(9);
  });

  it('detects share-buttons and parses networks', () => {
    const r = detectProWidget({
      tag: 'div',
      selector: '.elementor-widget-share-buttons',
      classes: ['elementor-widget-share-buttons', 'share-facebook', 'share-twitter', 'share-linkedin'],
    });
    expect(r?.type).toBe('share-buttons');
    expect(r?.settings['share_buttons']).toEqual(['facebook', 'twitter', 'linkedin']);
  });

  it('detects gallery', () => {
    const r = detectProWidget({
      tag: 'div',
      selector: '.elementor-gallery',
      classes: ['elementor-gallery'],
      childStructure: [
        { tag: 'img', selector: '.gallery-item-1' },
        { tag: 'img', selector: '.gallery-item-2' },
      ],
    });
    expect(r?.type).toBe('gallery');
    expect((r?.settings['gallery_items'] as unknown[]).length).toBe(2);
  });

  it('detects image-box and icon-box', () => {
    const img = detectProWidget({
      tag: 'div',
      selector: '.elementor-widget-image-box',
      classes: ['elementor-widget-image-box'],
      content: 'Our Mission',
      attributes: { 'data-description': 'We build for the web' },
    });
    expect(img?.type).toBe('image-box');

    const icon = detectProWidget({
      tag: 'div',
      selector: '.elementor-widget-icon-box',
      classes: ['elementor-widget-icon-box'],
      content: 'Fast',
      attributes: { 'data-icon': 'fa-bolt', 'data-description': 'Lightweight' },
    });
    expect(icon?.type).toBe('icon-box');
    expect(icon?.settings['icon']).toBe('fa-bolt');
  });

  it('returns null for unknown patterns', () => {
    const r = detectProWidget({
      tag: 'div',
      selector: '.random',
      classes: ['random'],
    });
    expect(r).toBeNull();
  });

  it('all 14 Pro widgets are detected via KNOWN_PRO_WIDGET_TYPES', () => {
    expect(KNOWN_PRO_WIDGET_TYPES.size).toBe(14);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// widget-degradation
// ─────────────────────────────────────────────────────────────────────────────

function mkProSuggestion(overrides: Partial<ProWidgetSuggestion> = {}): ProWidgetSuggestion {
  return {
    type: 'counter',
    source_selector: '.counter',
    source_tag: 'div',
    content: '$1.5K+',
    settings: { ending_number: 1500, prefix: '$' },
    requires_pro: true,
    detection: 'counter-pattern',
    fallback: 'text-editor',
    warnings: ['Widget "counter" requires Elementor Pro — fallback: text-editor'],
    ...overrides,
  };
}

describe('widget-degradation', () => {
  it('keeps Pro widget when Pro is present', () => {
    const pro = mkProSuggestion();
    const r = degradeProWidget(pro, 'present');
    expect(r.type).toBe('html');
    expect(r.settings['_pro_widget']).toBe('counter');
  });

  it('degrades counter to text-editor when Pro absent', () => {
    const pro = mkProSuggestion({ content: '$1.5K+' });
    const r = degradeProWidget(pro, 'absent');
    expect(r.type).toBe('text-editor');
    expect(r.content).toBe('$1.5K+');
    expect(r.settings['_degraded_from']).toBe('counter');
  });

  it('degrades forms to html when Pro absent', () => {
    const pro = mkProSuggestion({
      type: 'forms',
      fallback: 'html',
      content: '<input name="email" />',
    });
    const r = degradeProWidget(pro, 'absent');
    expect(r.type).toBe('html');
    expect(r.content).toContain('<form');
    expect(r.content).toContain('data-clone-source=".counter"');
  });

  it('degrades gallery to html wrapper', () => {
    const pro = mkProSuggestion({ type: 'gallery', fallback: 'html' });
    const r = degradeProWidget(pro, 'absent');
    expect(r.type).toBe('html');
    expect(r.content).toContain('elementor-gallery-fallback');
  });

  it('degrades posts to html wrapper', () => {
    const pro = mkProSuggestion({ type: 'posts', fallback: 'html' });
    const r = degradeProWidget(pro, 'absent');
    expect(r.type).toBe('html');
    expect(r.content).toContain('elementor-posts-fallback');
  });

  it('uses conservative fallback when Pro state unknown', () => {
    const pro = mkProSuggestion({ type: 'forms', fallback: 'html' });
    const r = degradeProWidget(pro, 'unknown');
    expect(r.type).toBe('html');
  });

  it('renderProAsHtml builds correct shells per widget type', () => {
    expect(renderProAsHtml(mkProSuggestion({ type: 'forms', fallback: 'html' }))).toContain('<form');
    expect(renderProAsHtml(mkProSuggestion({ type: 'gallery', fallback: 'html' }))).toContain('elementor-gallery-fallback');
    expect(renderProAsHtml(mkProSuggestion({ type: 'posts', fallback: 'html' }))).toContain('elementor-posts-fallback');
    expect(renderProAsHtml(mkProSuggestion({ type: 'counter', fallback: 'text-editor', content: '' }))).toBe('0');
  });

  it('renderProAsEditor renders content or sensible default', () => {
    expect(renderProAsEditor(mkProSuggestion({ content: '$1.5K+' }))).toBe('$1.5K+');
    expect(renderProAsEditor(mkProSuggestion({ content: '', type: 'counter' }))).toBe('0');
    expect(renderProAsEditor(mkProSuggestion({ content: '', type: 'progress-bar' }))).toBe('0%');
  });

  it('countPreservedAssets counts img/iframe/video tags', () => {
    expect(countPreservedAssets('<img src="a.jpg"><iframe src="b"></iframe><video></video>')).toBe(3);
    expect(countPreservedAssets('')).toBe(0);
    expect(countPreservedAssets('<p>Hello</p>')).toBe(0);
  });

  it('degradeProWidgets produces records with preserved_assets count', () => {
    const pros = [
      mkProSuggestion({
        type: 'gallery',
        fallback: 'html',
        content: '<img src="1.jpg"><img src="2.jpg">',
      }),
      mkProSuggestion({ type: 'counter', fallback: 'text-editor' }),
    ];
    const r = degradeProWidgets(pros, 'absent');
    expect(r.degraded_count).toBe(2);
    expect(r.records[0].preserved_assets).toBe(2);
    expect(r.records[1].preserved_assets).toBe(0);
  });

  it('degradeProWidgets keeps all when Pro is present', () => {
    const pros = [mkProSuggestion(), mkProSuggestion({ type: 'tabs' })];
    const r = degradeProWidgets(pros, 'present');
    expect(r.kept.length).toBe(2);
    expect(r.degraded_count).toBe(0);
    expect(r.fallbacks.length).toBe(0);
  });

  it('toWidgetSpec flattens V3Widget to WidgetSpec', () => {
    const widget: V3Widget = {
      type: 'heading',
      source_selector: 'h1',
      source_tag: 'h1',
      content: 'Hello',
      settings: { title: 'Hello' },
    };
    const spec = toWidgetSpec(widget);
    expect(spec.type).toBe('heading');
    expect(spec.content).toBe('Hello');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// widget-validator
// ─────────────────────────────────────────────────────────────────────────────

describe('widget-validator', () => {
  it('isKnownV3WidgetType / isKnownProWidgetType', () => {
    expect(isKnownV3WidgetType('heading')).toBe(true);
    expect(isKnownV3WidgetType('slider')).toBe(false);
    expect(isKnownProWidgetType('slider')).toBe(true);
    expect(isKnownProWidgetType('heading')).toBe(false);
  });

  it('exposes all 10 V3 and 14 Pro widget types', () => {
    expect(KNOWN_V3_WIDGET_TYPES.size).toBe(10);
    expect(KNOWN_PRO_WIDGET_TYPES.size).toBe(14);
  });

  it('flags unknown widget type as error', () => {
    const issues = validateV3Widget(
      { type: 'nonsense' as never, settings: {} } as unknown as V3Widget,
      { proState: 'absent' },
    );
    expect(issues.some((i) => i.code === 'unknown_widget_type')).toBe(true);
  });

  it('flags missing required setting for heading', () => {
    const issues = validateV3Widget(
      { type: 'heading', source_selector: 'h1', settings: {} } as V3Widget,
      { proState: 'absent' },
    );
    expect(issues.some((i) => i.code === 'missing_required_setting' && i.message.includes('title'))).toBe(true);
    expect(issues.some((i) => i.code === 'missing_required_setting' && i.message.includes('header_size'))).toBe(true);
  });

  it('flags missing required setting for text-editor', () => {
    const issues = validateV3Widget(
      { type: 'text-editor', settings: {} } as V3Widget,
      { proState: 'absent' },
    );
    expect(issues.some((i) => i.code === 'missing_required_setting')).toBe(true);
  });

  it('passes when all required settings are present', () => {
    const issues = validateV3Widget(
      {
        type: 'heading',
        source_selector: 'h1',
        settings: { title: 'Hi', header_size: 'H1' },
      } as V3Widget,
      { proState: 'absent' },
    );
    expect(issues.length).toBe(0);
  });

  it('flags empty button text as warning', () => {
    const issues = validateV3Widget(
      {
        type: 'button',
        source_selector: 'a.btn',
        settings: { text: '' },
      } as V3Widget,
      { proState: 'absent' },
    );
    expect(issues.some((i) => i.code === 'empty_button_text')).toBe(true);
  });

  it('flags missing image URL as warning', () => {
    const issues = validateV3Widget(
      { type: 'image', source_selector: 'img', settings: {} } as V3Widget,
      { proState: 'absent' },
    );
    expect(issues.some((i) => i.code === 'missing_image_url')).toBe(true);
  });

  it('accepts nested image URL', () => {
    const issues = validateV3Widget(
      { type: 'image', source_selector: 'img', settings: { url: { url: 'https://x.com/a.jpg' } } } as V3Widget,
      { proState: 'absent' },
    );
    expect(issues.some((i) => i.code === 'missing_image_url')).toBe(false);
  });

  it('flags Pro widget without Pro', () => {
    const issues = validateProWidget(mkProSuggestion({ type: 'slider' }), { proState: 'absent' });
    expect(issues.some((i) => i.code === 'pro_widget_without_pro')).toBe(true);
  });

  it('flags Pro widget with unknown Pro state as info', () => {
    const issues = validateProWidget(mkProSuggestion({ type: 'slider' }), { proState: 'unknown' });
    expect(issues.some((i) => i.severity === 'info' && i.code === 'pro_widget_pro_state_unknown')).toBe(true);
  });

  it('does not flag Pro widget when Pro is present', () => {
    const issues = validateProWidget(mkProSuggestion({ type: 'slider' }), { proState: 'present' });
    expect(issues.length).toBe(0);
  });

  it('flags missing content for content-required Pro widgets', () => {
    const issues = validateProWidget(
      mkProSuggestion({ type: 'counter', content: '' }),
      { proState: 'present' },
    );
    expect(issues.some((i) => i.code === 'missing_content')).toBe(true);
  });

  it('flags disallowed Pro widget', () => {
    const issues = validateProWidget(
      mkProSuggestion({ type: 'slider' }),
      { proState: 'present', disallowedProWidgets: new Set(['slider']) },
    );
    expect(issues.some((i) => i.code === 'disallowed_pro_widget')).toBe(true);
  });

  it('validateWidgets aggregates errors/warnings/info and computes ok flag', () => {
    const widgets: Array<V3Widget | ProWidgetSuggestion> = [
      { type: 'heading', source_selector: 'h1', settings: {} },
      mkProSuggestion({ type: 'slider' }),
      { type: 'button', source_selector: 'a.btn', settings: { text: 'Click' } },
    ];
    const r = validateWidgets(widgets, { proState: 'absent' });
    expect(r.errors).toBeGreaterThanOrEqual(2);
    expect(r.ok).toBe(false);
  });

  it('validateWidgets returns ok=true for clean batch', () => {
    const widgets: V3Widget[] = [
      { type: 'heading', source_selector: 'h1', settings: { title: 'Hi', header_size: 'H1' } },
      { type: 'text-editor', source_selector: 'p', settings: { editor: 'Hello' } },
    ];
    const r = validateWidgets(widgets, { proState: 'absent' });
    expect(r.ok).toBe(true);
    expect(r.errors).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-module integration
// ─────────────────────────────────────────────────────────────────────────────

describe('phase 5 integration', () => {
  it('detects Pro absent → degrades all Pro widgets → validates clean batch', () => {
    const detection = detectElementorPro({ scriptSrcs: ['https://x.com/elementor.js'] });
    expect(detection.hasPro).toBe(false);

    const pros: ProWidgetSuggestion[] = [
      detectProWidget({
        tag: 'div',
        selector: '.counter',
        classes: ['counter-stat'],
        content: '42',
      })!,
      detectProWidget({
        tag: 'form',
        selector: '.elementor-form',
        classes: ['elementor-form'],
        childStructure: [{ tag: 'input', selector: '.field-email' }],
      })!,
    ].filter((w): w is ProWidgetSuggestion => w !== null);

    const state: ProState = detection.hasPro ? 'present' : 'absent';
    const degraded = degradeProWidgets(pros, state);
    expect(degraded.degraded_count).toBe(2);

    const allWidgets: Array<V3Widget | ProWidgetSuggestion> = [
      ...degraded.fallbacks,
      ...degraded.kept,
    ];
    const validation = validateWidgets(allWidgets, { proState: state });
    expect(validation.ok).toBe(true);
  });

  it('detects Pro present → keeps Pro widgets → validation flags info only', () => {
    const detection = detectElementorPro({
      scriptSrcs: ['https://x.com/elementor-pro.min.js'],
    });
    expect(detection.hasPro).toBe(true);

    const pro = detectProWidget({
      tag: 'div',
      selector: '.elementor-widget-counter',
      classes: ['elementor-widget-counter'],
      content: '99',
    })!;

    const state: ProState = 'present';
    const degraded = degradeProWidgets([pro], state);
    expect(degraded.kept.length).toBe(1);

    const validation = validateWidgets(degraded.kept, { proState: state });
    expect(validation.ok).toBe(true);
    expect(validation.errors).toBe(0);
  });
});
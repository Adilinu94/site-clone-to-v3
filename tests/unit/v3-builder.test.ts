import { describe, it, expect } from 'vitest';
import { buildV3PageData } from '../../src/builder/v3-builder.js';
import type { SectionSpec } from '../../src/classifier/types.js';

const sampleSections: SectionSpec[] = [
  {
    id: 'sec-1',
    section_id: 'sec-1',
    selector: '#masthead',
    pattern: 'sticky-header',
    title: 'Header',
    layout: { padding: { top: 16, right: 24, bottom: 16, left: 24 } },
    containerWidth: 1200,
    classes: [],
    widgets: [
      { type: 'heading', settings: { title: 'Site Title', header_size: 'h1' }, classes: [] },
    ],
  },
  {
    id: 'sec-2',
    section_id: 'sec-2',
    selector: '#content',
    pattern: 'content',
    title: 'Content',
    layout: { padding: { top: 80, right: 24, bottom: 80, left: 24 } },
    containerWidth: 800,
    classes: [],
    widgets: [
      { type: 'text-editor', settings: { editor: '<p>Hello world</p>' }, classes: [] },
    ],
  },
];

describe('v3-builder', () => {
  it('builds V3 page data with sections', () => {
    const data = buildV3PageData(sampleSections, 'https://example.com', 'Test Page');
    expect(data.title).toBe('Test Page');
    expect(data.content).toHaveLength(2);
    expect(data.metadata.sectionCount).toBe(2);
  });

  it('wraps widgets in section + column', () => {
    const data = buildV3PageData(sampleSections, 'https://example.com');
    const firstSection = data.content[0];
    expect(firstSection.elType).toBe('section');
    expect(firstSection.elements).toHaveLength(1);
    const column = firstSection.elements![0];
    expect(column.elType).toBe('column');
    expect(column.elements).toHaveLength(1);
  });

  it('applies container width from spec', () => {
    const data = buildV3PageData(sampleSections, 'https://example.com');
    const firstSection = data.content[0];
    expect(firstSection.settings?.content_width).toEqual({ size: 1200, unit: 'px' });
  });

  it('includes metadata with source URL', () => {
    const data = buildV3PageData(sampleSections, 'https://example.com');
    expect(data.metadata.sourceUrl).toBe('https://example.com');
    expect(data.metadata.generatedAt).toBeTruthy();
  });

  it('counts widgets correctly', () => {
    const data = buildV3PageData(sampleSections, 'https://example.com');
    expect(data.metadata.widgetCount).toBe(2);
  });

  it('attaches section-* animation class to each section (Phase 7)', () => {
    const data = buildV3PageData(sampleSections, 'https://example.com');
    const first = data.content[0];
    const second = data.content[1];
    expect(first.settings?._css_classes).toBe('section-sec-1');
    expect(second.settings?._css_classes).toBe('section-sec-2');
    expect(first.settings?.custom_css).toContain('.section-sec-1');
    expect(second.settings?.custom_css).toContain('.section-sec-2');
  });

  it('matches V3 page-data structure snapshot (regression test)', () => {
    const data = buildV3PageData(sampleSections, 'https://example.com', 'Snapshot Test');
    // Snapshot the stable top-level shape (exclude timestamps + dynamic IDs).
    const stable = {
      title: data.title,
      type: data.type,
      content_length: data.content.length,
      first_section_shape: {
        elType: data.content[0].elType,
        settings_keys: Object.keys(data.content[0].settings ?? {}).sort(),
        element_count: data.content[0].elements?.length,
        first_column_elType: data.content[0].elements?.[0]?.elType,
        first_widget_type: data.content[0].elements?.[0]?.elements?.[0]?.elType,
        first_widget_settings_keys: Object.keys(
          data.content[0].elements?.[0]?.elements?.[0]?.settings ?? {},
        ).sort(),
      },
      metadata: {
        sourceUrl: data.metadata.sourceUrl,
        sectionCount: data.metadata.sectionCount,
        widgetCount: data.metadata.widgetCount,
      },
    };
    expect(stable).toMatchSnapshot('v3-page-data-stable-shape');
  });

  it('matches V3 section-id pattern snapshot (regression test)', () => {
    const data = buildV3PageData(sampleSections, 'https://example.com');
    const ids = data.content.map((s) => ({
      css_class: s.settings?._css_classes,
      custom_css_prefix: (s.settings?.custom_css as string | undefined)?.split(' ')[0],
    }));
    expect(ids).toMatchSnapshot('v3-section-id-pattern');
  });
});

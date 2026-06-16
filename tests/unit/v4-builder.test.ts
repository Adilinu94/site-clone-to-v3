import { describe, it, expect } from 'vitest';
import { buildV4Plan } from '../../src/builder/v4-builder.js';
import type { SectionSpec } from '../../src/classifier/types.js';

const sampleSections: SectionSpec[] = [
  {
    id: 'sec-1',
    selector: '#masthead',
    pattern: 'sticky-header',
    title: 'Header',
    layout: {},
    containerWidth: 1200,
    classes: ['cl-page-bg'],
    widgets: [
      { type: 'e-heading', settings: { text: 'Site Title' }, classes: ['cl-text'] },
    ],
  },
  {
    id: 'sec-2',
    selector: '#content',
    pattern: 'content',
    title: 'Content',
    layout: {},
    containerWidth: 800,
    classes: [],
    widgets: [
      { type: 'e-paragraph', settings: { text: 'Hello' }, classes: ['cl-text'] },
    ],
  },
];

describe('v4-builder', () => {
  it('builds V4 plan with atomic elements', () => {
    const plan = buildV4Plan(sampleSections, 'https://example.com', 'Test');
    expect(plan.elements).toHaveLength(2);
    for (const e of plan.elements) {
      expect(e.atomic).toBe(true);
    }
  });

  it('uses e-flexbox as section container', () => {
    const plan = buildV4Plan(sampleSections, 'https://example.com');
    for (const section of plan.elements) {
      expect(section.type).toBe('e-flexbox');
    }
  });

  it('preserves widget classes', () => {
    const plan = buildV4Plan(sampleSections, 'https://example.com');
    const allWidgetClasses = plan.elements.flatMap((s) =>
      (s.elements ?? []).flatMap((w) => w.classes ?? []),
    );
    expect(allWidgetClasses).toContain('cl-text');
  });

  it('aggregates classes in summary', () => {
    const plan = buildV4Plan(sampleSections, 'https://example.com');
    expect(plan.summary.classes).toContain('cl-text');
    expect(plan.summary.classes).toContain('cl-page-bg');
  });

  it('counts widgets in summary', () => {
    const plan = buildV4Plan(sampleSections, 'https://example.com');
    expect(plan.summary.widgetCount).toBe(2);
  });
});

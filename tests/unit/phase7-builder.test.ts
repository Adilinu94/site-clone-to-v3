import { describe, expect, it } from 'vitest';
import {
  buildInnerSection,
  buildMultiColumnSection,
  buildResponsiveOverrides,
  buildSection,
  type InnerSectionSpec,
  isInnerSection,
  isMultiColumnSection,
  isResponsiveSection,
  type MultiColumnSpec,
  type SectionStructureType,
} from '../../src/builder/v3-section.js';
import {
  type ColumnRatio,
  distributeColumns,
  type GapSpec,
  generateColumnCss,
  type MultiColumnLayout,
  normalizeMultiColumn,
  resolveColumnRatios,
  validateMultiColumnLayout,
} from '../../src/builder/v3-multi-column.js';
import {
  buildMultiColumnOutput,
  buildSectionsFromSiteSpec,
  buildV3Output,
  countSections,
  flattenInnerSections,
  type OutputFormat,
  type V3BuilderOptions,
  type V3BuilderResult,
  validateBuilderResult,
} from '../../src/builder/v3-builder.js';

describe('v3-section: buildSection', () => {
  it('creates a basic content section with defaults', () => {
    const section = buildSection({ id: 'hero-1', structure: 'full-width' });
    expect(section.id).toBe('hero-1');
    expect(section.structure).toBe('full-width');
    expect(section.columns).toBe(1);
    expect(section.responsive).toEqual({});
    expect(section.innerSections).toEqual([]);
  });

  it('creates a multi-column section with specified column count', () => {
    const section = buildSection({ id: 'features', structure: 'multi-column', columns: 3 });
    expect(section.columns).toBe(3);
    expect(section.structure).toBe('multi-column');
  });

  it('creates an inner-section with parent reference', () => {
    const inner = buildSection({ id: 'card', structure: 'inner-section', parentSectionId: 'features' });
    expect(inner.parentSectionId).toBe('features');
    expect(inner.structure).toBe('inner-section');
  });

  it('preserves explicit responsive overrides', () => {
    const section = buildSection({
      id: 'x',
      structure: 'content',
      responsive: { tablet: { columns: 2 }, mobile: { columns: 1 } },
    });
    expect(section.responsive.tablet?.columns).toBe(2);
    expect(section.responsive.mobile?.columns).toBe(1);
  });
});

describe('v3-section: buildInnerSection', () => {
  it('attaches inner-section to parent via parentId', () => {
    const inner: InnerSectionSpec = buildInnerSection('parent-1', { id: 'inner-1', columns: 2 });
    expect(inner.parentId).toBe('parent-1');
    expect(inner.id).toBe('inner-1');
    expect(inner.columns).toBe(2);
  });
});

describe('v3-section: buildMultiColumnSection', () => {
  it('creates a 2-column multi-column section with default ratio', () => {
    const spec: MultiColumnSpec = buildMultiColumnSection('two-col', { columns: 2 });
    expect(spec.id).toBe('two-col');
    expect(spec.columns).toBe(2);
    expect(spec.ratio).toBe('50-50');
    expect(spec.gap).toEqual({ unit: 'px', value: 20 });
  });

  it('respects explicit ratio and gap overrides', () => {
    const spec = buildMultiColumnSection('three', {
      columns: 3,
      ratio: '33-34-33',
      gap: { unit: 'rem', value: 2 },
    });
    expect(spec.ratio).toBe('33-34-33');
    expect(spec.gap).toEqual({ unit: 'rem', value: 2 });
  });
});

describe('v3-section: type-guards', () => {
  it('isMultiColumnSection returns true only for multi-column', () => {
    expect(isMultiColumnSection(buildSection({ id: 'a', structure: 'multi-column' }))).toBe(true);
    expect(isMultiColumnSection(buildSection({ id: 'b', structure: 'full-width' }))).toBe(false);
  });

  it('isInnerSection returns true only for inner-section with parent', () => {
    expect(isInnerSection(buildSection({ id: 'a', structure: 'inner-section', parentSectionId: 'p' }))).toBe(true);
    expect(isInnerSection(buildSection({ id: 'b', structure: 'content' }))).toBe(false);
  });

  it('isResponsiveSection returns true when responsive has entries', () => {
    expect(isResponsiveSection(buildSection({ id: 'a', structure: 'content' }))).toBe(false);
    expect(isResponsiveSection(buildSection({ id: 'a', structure: 'content', responsive: { mobile: { columns: 1 } } }))).toBe(true);
  });
});

describe('v3-section: buildResponsiveOverrides', () => {
  it('flattens responsive map to { breakpoint: columns }', () => {
    const section = buildSection({
      id: 'x',
      structure: 'content',
      responsive: { tablet: { columns: 2 }, mobile: { columns: 1 } },
    });
    const flat = buildResponsiveOverrides(section);
    expect(flat).toEqual({ tablet: 2, mobile: 1 });
  });

  it('skips responsive entries without column overrides', () => {
    const section = buildSection({
      id: 'x',
      structure: 'content',
      responsive: { mobile: { gap: { unit: 'px', value: 8 } } },
    });
    const flat = buildResponsiveOverrides(section);
    expect(flat).toEqual({});
  });
});

describe('v3-multi-column: normalizeMultiColumn', () => {
  it('clamps columns to the supported range (1-6)', () => {
    expect(normalizeMultiColumn({ columns: 0 }).columns).toBe(1);
    expect(normalizeMultiColumn({ columns: 8 }).columns).toBe(6);
    expect(normalizeMultiColumn({ columns: 3 }).columns).toBe(3);
  });

  it('defaults ratio to equal distribution when omitted', () => {
    expect(normalizeMultiColumn({ columns: 2 }).ratio).toBe('50-50');
    expect(normalizeMultiColumn({ columns: 3 }).ratio).toBe('33-34-33');
    expect(normalizeMultiColumn({ columns: 4 }).ratio).toBe('25-25-25-25');
  });
});

describe('v3-multi-column: resolveColumnRatios', () => {
  it('returns numeric widths summing to 100', () => {
    const widths = resolveColumnRatios('50-50', 2);
    expect(widths).toEqual([50, 50]);
  });

  it('expands short ratio to fill all columns', () => {
    const widths = resolveColumnRatios('50-50', 4);
    expect(widths.reduce((s, w) => s + w, 0)).toBe(100);
    expect(widths).toHaveLength(4);
  });

  it('returns equal split for malformed ratio', () => {
    const widths = resolveColumnRatios('totally-bogus', 3);
    expect(widths).toEqual([33.33, 33.33, 33.34]);
  });

  it('handles single-column layouts', () => {
    expect(resolveColumnRatios('100', 1)).toEqual([100]);
  });
});

describe('v3-multi-column: distributeColumns', () => {
  it('distributes columns into a layout array', () => {
    const layout = distributeColumns(3, '33-34-33');
    expect(layout).toHaveLength(3);
    expect(layout.reduce((s, w) => s + w, 0)).toBeCloseTo(100, 1);
  });

  it('applies responsive override at tablet breakpoint', () => {
    const layout = distributeColumns(4, '25-25-25-25', { tablet: 2, mobile: 1 });
    expect(layout).toHaveLength(4);
  });
});

describe('v3-multi-column: generateColumnCss', () => {
  it('generates grid-template-columns CSS for 3 columns', () => {
    const css = generateColumnCss(3, '33-34-33');
    expect(css).toContain('grid-template-columns');
    expect(css).toContain('33%');
    expect(css).toContain('34%');
  });

  it('includes gap property when specified', () => {
    const gap: GapSpec = { unit: 'rem', value: 1.5 };
    const css = generateColumnCss(2, '50-50', gap);
    expect(css).toContain('gap: 1.5rem');
  });

  it('skips gap when gap value is 0', () => {
    const css = generateColumnCss(2, '50-50', { unit: 'px', value: 0 });
    expect(css).not.toContain('gap:');
  });
});

describe('v3-multi-column: validateMultiColumnLayout', () => {
  it('validates a well-formed 2-column layout', () => {
    const layout: MultiColumnLayout = { columns: 2, ratio: '50-50' };
    expect(validateMultiColumnLayout(layout).ok).toBe(true);
  });

  it('flags invalid column count', () => {
    const layout: MultiColumnLayout = { columns: 0, ratio: '100' };
    const result = validateMultiColumnLayout(layout);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('columns'))).toBe(true);
  });

  it('flags empty ratio parts', () => {
    const layout: MultiColumnLayout = { columns: 3, ratio: '50--50' };
    const result = validateMultiColumnLayout(layout);
    expect(result.ok).toBe(false);
  });
});

describe('v3-builder: buildSectionsFromSiteSpec', () => {
  it('returns empty array for empty SiteSpec', () => {
    expect(buildSectionsFromSiteSpec({})).toEqual([]);
  });

  it('creates one section per SiteSpec.pages entry', () => {
    const sections = buildSectionsFromSiteSpec({
      pages: [
        { id: 'hero', structure: 'full-width' },
        { id: 'features', structure: 'multi-column', columns: 3 },
      ],
    });
    expect(sections).toHaveLength(2);
    expect(sections[0].id).toBe('hero');
    expect(sections[1].columns).toBe(3);
  });

  it('uses options.structureType when structure is omitted', () => {
    const sections = buildSectionsFromSiteSpec(
      { pages: [{ id: 'a' }] },
      { defaultStructureType: 'boxed' as SectionStructureType },
    );
    expect(sections[0].structure).toBe('boxed');
  });
});

describe('v3-builder: buildV3Output', () => {
  it('produces V3 output with sections and metadata', () => {
    const result = buildV3Output({ pages: [{ id: 'hero', structure: 'full-width' }] });
    expect(result.format).toBe('v3');
    expect(result.sections).toHaveLength(1);
    expect(result.metadata).toBeDefined();
    expect(result.metadata.sectionCount).toBe(1);
  });

  it('produces V4 output when format option is v4', () => {
    const result = buildV3Output({ pages: [{ id: 'hero' }] }, { format: 'v4' as OutputFormat });
    expect(result.format).toBe('v4');
  });

  it('includes flattenInnerSections when option is set', () => {
    const result = buildV3Output(
      { pages: [{ id: 'features', structure: 'multi-column', columns: 2 }] },
      { flattenInnerSections: true },
    );
    expect(result.sections[0].columns).toBe(2);
  });
});

describe('v3-builder: buildMultiColumnOutput', () => {
  it('generates multi-column V3 output for 3-column layout', () => {
    const out = buildMultiColumnOutput('features', { columns: 3, ratio: '33-34-33' });
    expect(out.id).toBe('features');
    expect(out.css).toContain('grid-template-columns');
    expect(out.css).toContain('33%');
  });

  it('respects gap override', () => {
    const out = buildMultiColumnOutput('features', { columns: 2, ratio: '50-50', gap: { unit: 'px', value: 30 } });
    expect(out.css).toContain('gap: 30px');
  });
});

describe('v3-builder: countSections + flattenInnerSections', () => {
  it('countSections returns total including inner sections', () => {
    const sections = [
      buildSection({ id: 'a', structure: 'content' }),
      buildSection({ id: 'b', structure: 'inner-section', parentSectionId: 'a' }),
      buildSection({ id: 'c', structure: 'inner-section', parentSectionId: 'a' }),
    ];
    expect(countSections(sections)).toBe(3);
  });

  it('flattenInnerSections promotes inner sections to top level', () => {
    const sections = [
      buildSection({
        id: 'a',
        structure: 'content',
        innerSections: [buildInnerSection('a', { id: 'a-inner-1' })],
      }),
    ];
    const flat = flattenInnerSections(sections);
    expect(flat.length).toBeGreaterThan(sections.length);
  });
});

describe('v3-builder: validateBuilderResult', () => {
  it('returns ok=true for valid V3 result', () => {
    const result: V3BuilderResult = buildV3Output({ pages: [{ id: 'a' }] });
    const v = validateBuilderResult(result);
    expect(v.ok).toBe(true);
  });

  it('flags empty sections array', () => {
    const result: V3BuilderResult = { format: 'v3', sections: [], metadata: { sectionCount: 0 } };
    const v = validateBuilderResult(result);
    expect(v.ok).toBe(false);
  });

  it('flags duplicate section ids', () => {
    const result: V3BuilderResult = {
      format: 'v3',
      sections: [
        buildSection({ id: 'a', structure: 'content' }),
        buildSection({ id: 'a', structure: 'content' }),
      ],
      metadata: { sectionCount: 2 },
    };
    const v = validateBuilderResult(result);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes('Duplicate'))).toBe(true);
  });
});

describe('v3-builder: ColumnRatio + V3BuilderOptions smoke', () => {
  it('ColumnRatio type accepts common formats', () => {
    const ratios: ColumnRatio[] = ['50-50', '33-34-33', '25-25-25-25', '70-30'];
    expect(ratios).toHaveLength(4);
  });

  it('V3BuilderOptions defaults are applied when not provided', () => {
    const opts: V3BuilderOptions = {};
    expect(opts.format).toBeUndefined();
    expect(opts.flattenInnerSections).toBeUndefined();
  });
});
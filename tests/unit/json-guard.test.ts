/**
 * Tests for src/validator/json-guard.ts
 *
 * Guards validate V3/V4 Elementor trees before WP push.
 * 25 tests across all 10 guards + score/threshold/format helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  runV3Guards,
  runV4Guards,
  runGuards,
  formatGuardReport,
  V3_GUARDS,
  V4_GUARDS,
} from '../../src/validator/json-guard.js';
import type { V4AtomicElement } from '../../src/builder/v4-builder.js';

// ============================================================================
// V3 Fixtures
// ============================================================================

function makeV3Widget(id: string, widgetType: string, settings: Record<string, unknown> = {}): V3Element {
  return { id, elType: 'widget', widgetType, settings };
}

function makeV3Column(id: string, widgets: V3Element[] = [], settings?: Record<string, unknown>): V3Element {
  return { id, elType: 'column', settings: settings ?? {}, elements: widgets };
}

function makeV3Section(id: string, columns: V3Element[] = [], settings?: Record<string, unknown>): V3Element {
  return { id, elType: 'section', settings: settings ?? {}, elements: columns };
}

const validV3Tree: V3Element[] = [
  makeV3Section('s1', [
    makeV3Column('c1', [
      makeV3Widget('w1', 'heading', { title: 'Hello' }),
      makeV3Widget('w2', 'image', { image: { url: 'https://example.com/img.jpg' } }),
    ]),
  ]),
  makeV3Section('s2', [
    makeV3Column('c2', [
      makeV3Widget('w3', 'text-editor', { editor: '<p>Content</p>' }),
    ]),
  ]),
];

// ============================================================================
// V4 Fixtures
// ============================================================================

function makeV4Element(
  id: string,
  type: string,
  overrides: Partial<V4AtomicElement> = {},
): V4AtomicElement {
  return {
    id,
    type,
    settings: {},
    styles: {},
    classes: [],
    elements: [],
    atomic: true,
    ...overrides,
  };
}

const validV4Tree: V4AtomicElement[] = [
  makeV4Element('e1', 'e-flexbox', {
    classes: ['heroSection'],
    elements: [
      makeV4Element('e2', 'e-heading', { classes: ['heroTitle'] }),
      makeV4Element('e3', 'e-text', { classes: ['heroBody'] }),
    ],
  }),
];

// ============================================================================
// runGuards — scoring engine
// ============================================================================

describe('runGuards — scoring engine', () => {
  it('score starts at 100 when all guards pass', () => {
    const report = runV3Guards(validV3Tree);
    expect(report.score).toBe(100);
    expect(report.passed).toBe(true);
    expect(report.threshold).toBe(85);
  });

  it('critical failure deducts 20 points', () => {
    // Duplicate IDs trigger G1 (critical)
    const tree: V3Element[] = [
      makeV3Section('s1', [makeV3Column('dup', [])]),
      makeV3Section('s2', [makeV3Column('dup', [])]), // 'dup' used twice
    ];
    const report = runV3Guards(tree);
    const g1 = report.results.find((r) => r.name === 'G1:unique-ids')!;
    expect(g1.result.passed).toBe(false);
    expect(report.score).toBeLessThanOrEqual(80); // 100 - 20 critical
  });

  it('warning failure deducts 5 points', () => {
    // Image with no URL triggers G5 (warning)
    const tree: V3Element[] = [
      makeV3Section('s1', [
        makeV3Column('c1', [
          makeV3Widget('w1', 'image', { image: { url: '' } }),
        ]),
      ]),
    ];
    const report = runV3Guards(tree);
    const g5 = report.results.find((r) => r.name === 'G5:image-url-present')!;
    expect(g5.result.passed).toBe(false);
    expect(g5.severity).toBe('warning');
    // Score should drop by 5 (warning penalty)
    expect(report.score).toBeLessThanOrEqual(95);
  });

  it('custom threshold works', () => {
    const report = runV3Guards(validV3Tree, 50);
    expect(report.threshold).toBe(50);
    expect(report.passed).toBe(true);
  });

  it('report contains one result per guard', () => {
    const v3Report = runV3Guards(validV3Tree);
    expect(v3Report.results).toHaveLength(V3_GUARDS.length);
    const v4Report = runV4Guards(validV4Tree);
    expect(v4Report.results).toHaveLength(V4_GUARDS.length);
  });
});

// ============================================================================
// G1 — unique IDs
// ============================================================================

describe('G1: unique-ids', () => {
  it('passes for tree with all unique IDs', () => {
    const report = runV3Guards(validV3Tree);
    const g1 = report.results.find((r) => r.name === 'G1:unique-ids')!;
    expect(g1.result.passed).toBe(true);
  });

  it('fails when two elements share an ID', () => {
    const tree: V3Element[] = [
      makeV3Section('same-id', []),
      makeV3Section('same-id', []),
    ];
    const report = runV3Guards(tree);
    const g1 = report.results.find((r) => r.name === 'G1:unique-ids')!;
    expect(g1.result.passed).toBe(false);
    expect(g1.result.message).toContain('1 duplicate');
  });

  it('detects duplicates in nested widgets', () => {
    const tree: V3Element[] = [
      makeV3Section('s1', [
        makeV3Column('c1', [makeV3Widget('dup', 'heading', { title: 'A' })]),
        makeV3Column('c2', [makeV3Widget('dup', 'heading', { title: 'B' })]), // same ID
      ]),
    ];
    const g1 = runV3Guards(tree).results.find((r) => r.name === 'G1:unique-ids')!;
    expect(g1.result.passed).toBe(false);
    expect(g1.result.details).toContain('dup');
  });
});

// ============================================================================
// G2 — no orphan columns
// ============================================================================

describe('G2: no-orphan-columns', () => {
  it('passes for columns inside sections', () => {
    const g2 = runV3Guards(validV3Tree).results.find((r) => r.name === 'G2:no-orphan-columns')!;
    expect(g2.result.passed).toBe(true);
  });

  it('fails for a column at root level', () => {
    // Column at root (not inside section) = orphan
    const tree: V3Element[] = [makeV3Column('orphan', [])];
    const g2 = runV3Guards(tree).results.find((r) => r.name === 'G2:no-orphan-columns')!;
    expect(g2.result.passed).toBe(false);
    expect(g2.result.message).toContain('1 orphan column');
  });

  it('fails for a column nested inside a widget', () => {
    const tree: V3Element[] = [
      makeV3Section('s1', [
        makeV3Column('c1', [
          { id: 'w1', elType: 'widget', widgetType: 'html', elements: [makeV3Column('nested-col', [])] },
        ]),
      ]),
    ];
    const g2 = runV3Guards(tree).results.find((r) => r.name === 'G2:no-orphan-columns')!;
    expect(g2.result.passed).toBe(false);
  });
});

// ============================================================================
// G3 — widget required settings
// ============================================================================

describe('G3: widget-required-settings', () => {
  it('passes for heading with title and image with url', () => {
    const g3 = runV3Guards(validV3Tree).results.find((r) => r.name === 'G3:widget-required-settings')!;
    expect(g3.result.passed).toBe(true);
  });

  it('flags heading widget missing title', () => {
    const tree: V3Element[] = [
      makeV3Section('s1', [
        makeV3Column('c1', [makeV3Widget('w1', 'heading', {})]), // no title
      ]),
    ];
    const g3 = runV3Guards(tree).results.find((r) => r.name === 'G3:widget-required-settings')!;
    expect(g3.result.passed).toBe(false);
    expect(g3.result.message).toContain('1 widget');
  });

  it('flags text-editor widget missing editor content', () => {
    const tree: V3Element[] = [
      makeV3Section('s1', [
        makeV3Column('c1', [makeV3Widget('w1', 'text-editor', {})]),
      ]),
    ];
    const g3 = runV3Guards(tree).results.find((r) => r.name === 'G3:widget-required-settings')!;
    expect(g3.result.passed).toBe(false);
  });
});

// ============================================================================
// G4 — breakpoint coverage
// ============================================================================

describe('G4: breakpoint-coverage', () => {
  it('passes when no breakpoint overrides exist', () => {
    const g4 = runV3Guards(validV3Tree).results.find((r) => r.name === 'G4:breakpoint-coverage')!;
    expect(g4.result.passed).toBe(true);
  });

  it('passes when both tablet and mobile overrides exist', () => {
    const tree: V3Element[] = [
      makeV3Section('s1', [makeV3Column('c1', [])], {
        padding_tablet: '20px',
        padding_mobile: '10px',
      }),
    ];
    const g4 = runV3Guards(tree).results.find((r) => r.name === 'G4:breakpoint-coverage')!;
    expect(g4.result.passed).toBe(true);
  });

  it('fails when tablet override exists but mobile is missing', () => {
    const tree: V3Element[] = [
      makeV3Section('s1', [makeV3Column('c1', [])], {
        padding_tablet: '20px',
        // no _mobile keys
      }),
    ];
    const g4 = runV3Guards(tree).results.find((r) => r.name === 'G4:breakpoint-coverage')!;
    expect(g4.result.passed).toBe(false);
    expect(g4.result.message).toContain('1 section');
  });
});

// ============================================================================
// G5 — image URL present
// ============================================================================

describe('G5: image-url-present', () => {
  it('passes when all image widgets have URLs', () => {
    const g5 = runV3Guards(validV3Tree).results.find((r) => r.name === 'G5:image-url-present')!;
    expect(g5.result.passed).toBe(true);
  });

  it('fails when image widget has empty URL', () => {
    const tree: V3Element[] = [
      makeV3Section('s1', [
        makeV3Column('c1', [makeV3Widget('w1', 'image', { image: { url: '' } })]),
      ]),
    ];
    const g5 = runV3Guards(tree).results.find((r) => r.name === 'G5:image-url-present')!;
    expect(g5.result.passed).toBe(false);
  });

  it('fails when image widget has no image setting at all', () => {
    const tree: V3Element[] = [
      makeV3Section('s1', [
        makeV3Column('c1', [makeV3Widget('w1', 'image', {})]),
      ]),
    ];
    const g5 = runV3Guards(tree).results.find((r) => r.name === 'G5:image-url-present')!;
    expect(g5.result.passed).toBe(false);
  });

  it('passes when no image widgets exist in tree', () => {
    const tree: V3Element[] = [
      makeV3Section('s1', [
        makeV3Column('c1', [makeV3Widget('w1', 'heading', { title: 'Hi' })]),
      ]),
    ];
    const g5 = runV3Guards(tree).results.find((r) => r.name === 'G5:image-url-present')!;
    expect(g5.result.passed).toBe(true);
  });
});

// ============================================================================
// G6 — valid $$type envelope
// ============================================================================

describe('G6: valid-dollar-type', () => {
  it('passes for tree with no $$type values', () => {
    const g6 = runV4Guards(validV4Tree).results.find((r) => r.name === 'G6:valid-dollar-type')!;
    expect(g6.result.passed).toBe(true);
  });

  it('passes for known $$type values', () => {
    const tree: V4AtomicElement[] = [
      makeV4Element('e1', 'e-flexbox', {
        styles: {
          bg: { '$$type': 'background-overlay', value: [] },
        },
      }),
    ];
    const g6 = runV4Guards(tree).results.find((r) => r.name === 'G6:valid-dollar-type')!;
    expect(g6.result.passed).toBe(true);
  });

  it('fails for unknown $$type value', () => {
    const tree: V4AtomicElement[] = [
      makeV4Element('e1', 'e-flexbox', {
        styles: { bg: { '$$type': 'magic-custom-type', value: [] } },
      }),
    ];
    const g6 = runV4Guards(tree).results.find((r) => r.name === 'G6:valid-dollar-type')!;
    expect(g6.result.passed).toBe(false);
    expect(g6.result.details).toContain('magic-custom-type');
  });
});

// ============================================================================
// G7 — no hyphen in class names
// ============================================================================

describe('G7: no-hyphen-in-class', () => {
  it('passes for camelCase class names', () => {
    const g7 = runV4Guards(validV4Tree).results.find((r) => r.name === 'G7:no-hyphen-in-class')!;
    expect(g7.result.passed).toBe(true);
  });

  it('fails when a class name contains a hyphen', () => {
    const tree: V4AtomicElement[] = [
      makeV4Element('e1', 'e-heading', { classes: ['my-heading'] }),
    ];
    const g7 = runV4Guards(tree).results.find((r) => r.name === 'G7:no-hyphen-in-class')!;
    expect(g7.result.passed).toBe(false);
    expect(g7.result.details).toContain('my-heading');
  });

  it('is severity: critical', () => {
    const g7 = runV4Guards(validV4Tree).results.find((r) => r.name === 'G7:no-hyphen-in-class')!;
    expect(g7.severity).toBe('critical');
  });
});

// ============================================================================
// G8 — max DOM depth
// ============================================================================

describe('G8: max-dom-depth', () => {
  it('passes for shallow V4 tree (depth ≤ 4)', () => {
    const g8 = runV4Guards(validV4Tree).results.find((r) => r.name === 'G8:max-dom-depth')!;
    expect(g8.result.passed).toBe(true);
  });

  it('fails for deeply nested V4 tree (depth > 4)', () => {
    const deep: V4AtomicElement = makeV4Element('d5', 'e-text');
    const d4 = makeV4Element('d4', 'e-flexbox', { elements: [deep] });
    const d3 = makeV4Element('d3', 'e-flexbox', { elements: [d4] });
    const d2 = makeV4Element('d2', 'e-flexbox', { elements: [d3] });
    const d1 = makeV4Element('d1', 'e-flexbox', { elements: [d2] });
    const d0 = makeV4Element('d0', 'e-flexbox', { elements: [d1] }); // depth 5
    const g8 = runV4Guards([d0]).results.find((r) => r.name === 'G8:max-dom-depth')!;
    expect(g8.result.passed).toBe(false);
  });
});

// ============================================================================
// G9 — no empty class
// ============================================================================

describe('G9: no-empty-class', () => {
  it('passes for tree with no empty class entries', () => {
    const g9 = runV4Guards(validV4Tree).results.find((r) => r.name === 'G9:no-empty-class')!;
    expect(g9.result.passed).toBe(true);
  });

  it('fails when classes array contains an empty string', () => {
    const tree: V4AtomicElement[] = [
      makeV4Element('e1', 'e-heading', { classes: ['heroTitle', ''] }),
    ];
    const g9 = runV4Guards(tree).results.find((r) => r.name === 'G9:no-empty-class')!;
    expect(g9.result.passed).toBe(false);
  });

  it('treats whitespace-only strings as empty', () => {
    const tree: V4AtomicElement[] = [
      makeV4Element('e1', 'e-heading', { classes: ['  '] }),
    ];
    const g9 = runV4Guards(tree).results.find((r) => r.name === 'G9:no-empty-class')!;
    expect(g9.result.passed).toBe(false);
  });
});

// ============================================================================
// G10 — known atomic type
// ============================================================================

describe('G10: known-atomic-type', () => {
  it('passes for known V4 types', () => {
    const g10 = runV4Guards(validV4Tree).results.find((r) => r.name === 'G10:known-atomic-type')!;
    expect(g10.result.passed).toBe(true);
  });

  it('fails for unknown V4 type (e.g. V3 contamination)', () => {
    const tree: V4AtomicElement[] = [
      makeV4Element('e1', 'section'), // V3 type in V4 tree
    ];
    const g10 = runV4Guards(tree).results.find((r) => r.name === 'G10:known-atomic-type')!;
    expect(g10.result.passed).toBe(false);
    expect(g10.result.details).toContain('section');
  });

  it('flags "widget" as unknown (V3 contamination)', () => {
    const tree: V4AtomicElement[] = [makeV4Element('e1', 'widget')];
    const g10 = runV4Guards(tree).results.find((r) => r.name === 'G10:known-atomic-type')!;
    expect(g10.result.passed).toBe(false);
  });
});

// ============================================================================
// formatGuardReport
// ============================================================================

describe('formatGuardReport', () => {
  it('includes score and PASSED/FAILED status', () => {
    const report = runV3Guards(validV3Tree);
    const text = formatGuardReport(report);
    expect(text).toContain('100/100');
    expect(text).toContain('PASSED');
  });

  it('shows FAILED when score is below threshold', () => {
    const tree: V3Element[] = [
      makeV3Section('same', []),
      makeV3Section('same', []),
    ];
    const report = runV3Guards(tree);
    const text = formatGuardReport(report);
    expect(text).toContain('FAILED');
  });

  it('shows guard name in each line', () => {
    const report = runV3Guards(validV3Tree);
    const text = formatGuardReport(report);
    expect(text).toContain('G1:unique-ids');
    expect(text).toContain('G5:image-url-present');
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe('edge cases', () => {
  it('runV3Guards handles empty tree without throwing', () => {
    expect(() => runV3Guards([])).not.toThrow();
    const report = runV3Guards([]);
    expect(report.score).toBe(100); // empty tree passes all guards
  });

  it('runV4Guards handles empty tree without throwing', () => {
    expect(() => runV4Guards([])).not.toThrow();
  });

  it('runGuards with custom guard list works', () => {
    const alwaysFail = {
      name: 'custom-fail',
      severity: 'critical' as const,
      check: () => ({ passed: false, message: 'always fails' }),
    };
    const report = runGuards<V3Element[]>([], [alwaysFail], 85);
    expect(report.score).toBe(80);
    expect(report.passed).toBe(false);
  });

  it('score never goes below 0 even with many failures', () => {
    // 10 critical failures would = -200pts without floor
    const fails = Array.from({ length: 10 }, (_, i) => ({
      name: `fail-${i}`,
      severity: 'critical' as const,
      check: () => ({ passed: false, message: `fail ${i}` }),
    }));
    const report = runGuards<V3Element[]>([], fails, 85);
    expect(report.score).toBe(0);
    expect(report.passed).toBe(false);
  });
});

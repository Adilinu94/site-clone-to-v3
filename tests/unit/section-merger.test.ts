import { describe, it, expect } from 'vitest';
import {
  areMergeable,
  mergeSmallSections,
  DEFAULT_MERGE_THRESHOLD,
} from '../../src/extractor/section-detector.js';

describe('section-merger', () => {
  describe('areMergeable', () => {
    it('rule (a): both < 200px AND each < 2 children → merge', () => {
      expect(
        areMergeable(
          { heightPx: 150, childCount: 1 },
          { heightPx: 100, childCount: 1 },
        ),
      ).toBe(true);
    });

    it('rule (a) negative: 200px+ not merged', () => {
      expect(
        areMergeable(
          { heightPx: 250, childCount: 1 },
          { heightPx: 100, childCount: 1 },
        ),
      ).toBe(false);
    });

    it('rule (a) negative: 2+ children not merged', () => {
      expect(
        areMergeable(
          { heightPx: 150, childCount: 2 },
          { heightPx: 100, childCount: 1 },
        ),
      ).toBe(false);
    });

    it('rule (b): both < 100px AND same bg → merge', () => {
      expect(
        areMergeable(
          { heightPx: 80, childCount: 5, backgroundColor: 'rgb(255,0,0)' },
          { heightPx: 60, childCount: 5, backgroundColor: 'rgb(255,0,0)' },
        ),
      ).toBe(true);
    });

    it('rule (b) negative: different bg → not merge', () => {
      expect(
        areMergeable(
          { heightPx: 80, childCount: 5, backgroundColor: 'rgb(255,0,0)' },
          { heightPx: 60, childCount: 5, backgroundColor: 'rgb(0,0,255)' },
        ),
      ).toBe(false);
    });

    it('returns false when both rules fail', () => {
      expect(
        areMergeable(
          { heightPx: 300, childCount: 5, backgroundColor: 'rgb(0,0,0)' },
          { heightPx: 250, childCount: 5, backgroundColor: 'rgb(0,0,0)' },
        ),
      ).toBe(false);
    });

    it('honors custom threshold', () => {
      expect(
        areMergeable(
          { heightPx: 350, childCount: 1 },
          { heightPx: 300, childCount: 1 },
          { maxHeightPx: 400 },
        ),
      ).toBe(true);
    });
  });

  describe('mergeSmallSections', () => {
    const baseSection = (overrides: Partial<{
      section_id: string;
      selector: string;
      y_range: [number, number];
      child_count: number;
      tag: string;
      classes: string;
      backgroundColor?: string;
    }> = {}) => ({
      section_id: overrides.section_id ?? 's1',
      selector: overrides.selector ?? '.s1',
      y_range: overrides.y_range ?? [0, 100],
      layout: 'block',
      child_count: overrides.child_count ?? 1,
      tag: overrides.tag ?? 'div',
      id: undefined,
      classes: overrides.classes ?? 's1',
      backgroundColor: overrides.backgroundColor,
    });

    it('merges two adjacent tiny sections', () => {
      const merged = mergeSmallSections([
        baseSection({ section_id: 'a', y_range: [0, 100], child_count: 1 }),
        baseSection({ section_id: 'b', y_range: [102, 200], child_count: 1 }),
      ]);
      expect(merged).toHaveLength(1);
      expect(merged[0].y_range).toEqual([0, 200]);
      expect(merged[0].child_count).toBe(2);
      expect(merged[0].section_id).toBe('a+b');
    });

    it('keeps non-adjacent sections separate', () => {
      const merged = mergeSmallSections([
        baseSection({ section_id: 'a', y_range: [0, 100], child_count: 1 }),
        baseSection({ section_id: 'b', y_range: [500, 600], child_count: 1 }),
      ]);
      expect(merged).toHaveLength(2);
    });

    it('does not merge sections with large child-count', () => {
      const merged = mergeSmallSections([
        baseSection({ section_id: 'a', y_range: [0, 100], child_count: 5 }),
        baseSection({ section_id: 'b', y_range: [102, 200], child_count: 5 }),
      ]);
      expect(merged).toHaveLength(2);
    });

    it('does not merge sections separated by a "real" section', () => {
      const merged = mergeSmallSections([
        baseSection({ section_id: 'a', y_range: [0, 100], child_count: 1 }),
        baseSection({ section_id: 'big', y_range: [102, 500], child_count: 1 }),
        baseSection({ section_id: 'c', y_range: [502, 600], child_count: 1 }),
      ]);
      // `a` merges with `big` (both < 200px? no, big is 398 → rule a fails; bg missing → rule b fails)
      // so all three stay separate
      expect(merged).toHaveLength(3);
    });

    it('combines selectors with comma when merged', () => {
      const merged = mergeSmallSections([
        baseSection({ section_id: 'a', selector: '.a', y_range: [0, 100], child_count: 1 }),
        baseSection({ section_id: 'b', selector: '.b', y_range: [102, 200], child_count: 1 }),
      ]);
      expect(merged[0].selector).toBe('.a, .b');
    });

    it('returns empty array for empty input', () => {
      expect(mergeSmallSections([])).toEqual([]);
    });

    it('returns single section unchanged', () => {
      const single = [baseSection({ section_id: 'only' })];
      const merged = mergeSmallSections(single);
      expect(merged).toHaveLength(1);
      expect(merged[0].section_id).toBe('only');
    });

    it('uses DEFAULT_MERGE_THRESHOLD values that match the V2 spec', () => {
      expect(DEFAULT_MERGE_THRESHOLD.maxHeightPx).toBe(200);
      expect(DEFAULT_MERGE_THRESHOLD.maxChildCount).toBe(2);
      expect(DEFAULT_MERGE_THRESHOLD.maxHeightPxTight).toBe(100);
    });

    it('merges three adjacent tiny sections via rule (b) shared-bg', () => {
      // After a merge, the combined section's height grows. Rule (b) still
      // applies if the combined section stays < 100px. Use very small heights.
      const merged = mergeSmallSections([
        baseSection({
          section_id: 'a',
          y_range: [0, 30],
          child_count: 1,
          backgroundColor: 'rgb(0,0,0)',
        }),
        baseSection({
          section_id: 'b',
          y_range: [32, 60],
          child_count: 1,
          backgroundColor: 'rgb(0,0,0)',
        }),
        baseSection({
          section_id: 'c',
          y_range: [62, 90],
          child_count: 1,
          backgroundColor: 'rgb(0,0,0)',
        }),
      ]);
      expect(merged).toHaveLength(1);
      expect(merged[0].y_range).toEqual([0, 90]);
      expect(merged[0].child_count).toBe(3);
    });
  });
});
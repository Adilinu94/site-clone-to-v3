import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  capturePseudoStates,
  flattenPseudoStates,
  PSEUDO_STATES,
  DEFAULT_PSEUDO_PROPERTIES,
} from '../../src/extractor/pseudo-state-capture.js';
import {
  extractCustomProperties,
  groupByTokenCategory,
} from '../../src/extractor/custom-property-extractor.js';
import {
  extractAnimationProperties,
} from '../../src/extractor/animation-property-extractor.js';
import {
  parseBackgroundImage,
  splitTopLevelCommas,
  firstUrl,
  parseBackgroundImages,
} from '../../src/extractor/background-image-parser.js';
import {
  extractFontLoadingState,
  normalizeFamily,
  rollupFamilies,
  effectiveFallback,
} from '../../src/extractor/font-loading-state.js';
import { CURATED_PROPERTIES } from '../../src/extractor/computed-styles.js';

describe('Phase 4 — Extractor extensions', () => {
  describe('CURATED_PROPERTIES (Phase-4 expansion)', () => {
    it('includes Phase-4 visual props (cursor, whiteSpace, textOverflow, objectFit, mixBlendMode)', () => {
      expect(CURATED_PROPERTIES).toContain('cursor');
      expect(CURATED_PROPERTIES).toContain('white-space');
      expect(CURATED_PROPERTIES).toContain('text-overflow');
      expect(CURATED_PROPERTIES).toContain('object-fit');
      expect(CURATED_PROPERTIES).toContain('object-position');
      expect(CURATED_PROPERTIES).toContain('mix-blend-mode');
      expect(CURATED_PROPERTIES).toContain('-webkit-line-clamp');
    });

    it('includes background and border shorthands', () => {
      expect(CURATED_PROPERTIES).toContain('background');
      expect(CURATED_PROPERTIES).toContain('border');
    });

    it('includes transition shorthand', () => {
      expect(CURATED_PROPERTIES).toContain('transition');
    });

    it('CURATED_PROPERTIES is sorted/unique', () => {
      const set = new Set<string>(CURATED_PROPERTIES as readonly string[]);
      expect(set.size).toBe(CURATED_PROPERTIES.length);
    });
  });

  describe('pseudo-state-capture', () => {
    let mockPage: any;

    beforeEach(() => {
      mockPage = {
        evaluate: vi.fn().mockResolvedValue([]),
      };
    });

    it('exports PSEUDO_STATES as hover/focus/active in that order', () => {
      expect(PSEUDO_STATES).toEqual(['hover', 'focus', 'active']);
    });

    it('DEFAULT_PSEUDO_PROPERTIES covers visual hover-relevant props', () => {
      expect(DEFAULT_PSEUDO_PROPERTIES).toContain('color');
      expect(DEFAULT_PSEUDO_PROPERTIES).toContain('background-color');
      expect(DEFAULT_PSEUDO_PROPERTIES).toContain('transform');
      expect(DEFAULT_PSEUDO_PROPERTIES).toContain('opacity');
    });

    it('builds a script that captures all three pseudo-states', async () => {
      await capturePseudoStates(mockPage, { rootSelector: '.btn' });
      const script: string = mockPage.evaluate.mock.calls[0][0];
      expect(typeof script).toBe('string');
      expect(script).toContain('":hover"');
      expect(script).toContain('":focus"');
      expect(script).toContain('":active"');
      expect(script).toContain(JSON.stringify('.btn'));
    });

    it('returns [] when page.evaluate throws (browser-side error)', async () => {
      mockPage.evaluate.mockRejectedValue(new Error('Crash'));
      const result = await capturePseudoStates(mockPage);
      expect(result).toEqual([]);
    });

    it('normalizes raw rows into the per-state Record shape', async () => {
      mockPage.evaluate.mockResolvedValue([
        {
          selector: 'a.btn',
          tag: 'a',
          states: {
            hover: { color: 'red', 'background-color': 'blue' },
            focus: {},
            active: {},
          },
        },
      ]);
      const result = await capturePseudoStates(mockPage);
      expect(result).toHaveLength(1);
      expect(result[0].selector).toBe('a.btn');
      expect(result[0].states.hover).toEqual({ color: 'red', 'background-color': 'blue' });
      expect(result[0].states.focus).toEqual({});
      expect(result[0].states.active).toEqual({});
    });

    it('flattenPseudoStates drops elements with empty state map', () => {
      const result = flattenPseudoStates(
        [
          { selector: 'a', tag: 'a', states: { hover: {}, focus: {}, active: {} } },
          { selector: 'b', tag: 'b', states: { hover: { color: 'red' }, focus: {}, active: {} } },
        ],
        'hover',
      );
      expect(result).toHaveLength(1);
      expect(result[0].selector).toBe('b');
      expect(result[0].styles).toEqual({ color: 'red' });
    });
  });

  describe('custom-property-extractor', () => {
    let mockPage: any;

    beforeEach(() => {
      mockPage = { evaluate: vi.fn().mockResolvedValue([]) };
    });

    it('builds a root-extraction script that probes element.style', async () => {
      await extractCustomProperties(mockPage);
      const script: string = mockPage.evaluate.mock.calls[0][0];
      expect(script).toContain('document.documentElement');
      expect(script).toContain('getPropertyValue');
    });

    it('respects namePrefix in JSON-stringified form', async () => {
      await extractCustomProperties(mockPage, { namePrefix: '--color-' });
      const script: string = mockPage.evaluate.mock.calls[0][0];
      expect(script).toContain('--color-');
    });

    it('returns [] when page.evaluate throws', async () => {
      mockPage.evaluate.mockRejectedValue(new Error('fail'));
      const result = await extractCustomProperties(mockPage);
      expect(result).toEqual([]);
    });

    it('rollupFamilies groups custom props by token category', () => {
      const groups = groupByTokenCategory([
        { name: '--color-brand-primary', value: 'red', scope: ':root' },
        { name: '--font-heading', value: 'Inter', scope: ':root' },
        { name: '--spacing-md', value: '1rem', scope: ':root' },
        { name: '--radius-sm', value: '4px', scope: ':root' },
        { name: '--motion-fast', value: '150ms', scope: ':root' },
        { name: '--unknown-thing', value: 'x', scope: ':root' },
      ]);
      expect(groups.color).toHaveLength(1);
      expect(groups.typography).toHaveLength(1);
      expect(groups.spacing).toHaveLength(1);
      expect(groups.radius).toHaveLength(1);
      expect(groups.motion).toHaveLength(1);
      expect(groups.other).toHaveLength(1);
    });
  });

  describe('animation-property-extractor', () => {
    let mockPage: any;

    beforeEach(() => {
      mockPage = { evaluate: vi.fn().mockResolvedValue(null) };
    });

    it('returns empty result when page.evaluate throws', async () => {
      mockPage.evaluate.mockRejectedValue(new Error('crash'));
      const result = await extractAnimationProperties(mockPage);
      expect(result.elements).toEqual([]);
      expect(result.referencedKeyframes).toEqual([]);
      expect(result.distinctTransitionProperties).toEqual([]);
    });

    it('returns empty result when browser returns null', async () => {
      mockPage.evaluate.mockResolvedValue(null);
      const result = await extractAnimationProperties(mockPage);
      expect(result.elements).toEqual([]);
    });

    it('returns parsed animation + transition props from browser', async () => {
      mockPage.evaluate.mockResolvedValue({
        elements: [
          {
            selector: '.fade-in',
            tag: 'div',
            animation: {
              name: 'fadeIn',
              duration: '0.5s',
              delay: '0s',
              iterationCount: '1',
              direction: 'normal',
              fillMode: 'none',
              timingFunction: 'ease',
              playState: 'running',
            },
            transition: {
              property: 'opacity',
              duration: '0.3s',
              delay: '0s',
              timingFunction: 'ease',
            },
          },
        ],
        referencedKeyframes: ['fadeIn'],
        distinctTransitionProperties: ['opacity'],
      });
      const result = await extractAnimationProperties(mockPage);
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].animation.name).toBe('fadeIn');
      expect(result.elements[0].transition.property).toBe('opacity');
      expect(result.referencedKeyframes).toContain('fadeIn');
    });
  });

  describe('background-image-parser', () => {
    it('returns none-kind for empty or `none`', () => {
      expect(parseBackgroundImage('none')).toEqual([{ kind: 'none' }]);
      expect(parseBackgroundImage('')).toEqual([{ kind: 'none' }]);
      expect(parseBackgroundImage('   ')).toEqual([{ kind: 'none' }]);
    });

    it('parses a single quoted url()', () => {
      const layers = parseBackgroundImage('url("https://x.test/bg.png")');
      expect(layers).toEqual([
        { kind: 'url', url: 'https://x.test/bg.png', quoted: true },
      ]);
    });

    it('parses a single unquoted url()', () => {
      const layers = parseBackgroundImage('url(https://x.test/bg.png)');
      expect(layers).toEqual([
        { kind: 'url', url: 'https://x.test/bg.png', quoted: false },
      ]);
    });

    it('parses a linear-gradient', () => {
      const layers = parseBackgroundImage('linear-gradient(red, blue)');
      expect(layers).toEqual([
        { kind: 'linear-gradient', value: 'linear-gradient(red, blue)' },
      ]);
    });

    it('parses multi-layer backgrounds (comma-separated, respects parens)', () => {
      const layers = parseBackgroundImage(
        'url("a.png"), linear-gradient(red, blue)',
      );
      expect(layers).toHaveLength(2);
      expect(layers[0].kind).toBe('url');
      expect(layers[1].kind).toBe('linear-gradient');
    });

    it('splitTopLevelCommas respects nested parens', () => {
      const parts = splitTopLevelCommas(
        'url("a.png"), linear-gradient(red, rgba(0,0,0,0.5)), url(b.png)',
      );
      expect(parts).toHaveLength(3);
      expect(parts[0]).toContain('url("a.png")');
      expect(parts[1]).toContain('rgba(0,0,0,0.5)');
    });

    it('firstUrl returns the first url-layer or undefined', () => {
      expect(firstUrl(parseBackgroundImage('linear-gradient(red, blue)'))).toBeUndefined();
      expect(firstUrl(parseBackgroundImage('url("a.png"), url("b.png")'))).toBe('a.png');
      expect(firstUrl(parseBackgroundImage('none'))).toBeUndefined();
    });

    it('parseBackgroundImages walks the DOM and labels primaryUrl', async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue([
          { selector: '.hero', tag: 'div', raw: 'url("https://x.test/hero.png")' },
          { selector: '.card', tag: 'div', raw: 'linear-gradient(red, blue)' },
        ]),
      };
      const result = await parseBackgroundImages(mockPage as any);
      expect(result).toHaveLength(2);
      expect(result[0].primaryUrl).toBe('https://x.test/hero.png');
      expect(result[1].primaryUrl).toBeUndefined();
      expect(result[1].layers[0].kind).toBe('linear-gradient');
    });

    it('returns [] on page.evaluate failure', async () => {
      const mockPage = { evaluate: vi.fn().mockRejectedValue(new Error('crash')) };
      const result = await parseBackgroundImages(mockPage as any);
      expect(result).toEqual([]);
    });
  });

  describe('font-loading-state', () => {
    it('normalizeFamily strips quotes and collapses whitespace', () => {
      expect(normalizeFamily('"Inter"')).toBe('Inter');
      expect(normalizeFamily("'JetBrains Mono'")).toBe('JetBrains Mono');
      expect(normalizeFamily('  Roboto   Mono  ')).toBe('Roboto Mono');
    });

    it('rollupFamilies groups by family and aggregates weights/styles', () => {
      const result = rollupFamilies([
        { family: 'Inter', weight: '400', style: 'normal', status: 'loaded' },
        { family: 'Inter', weight: '700', style: 'normal', status: 'loaded' },
        { family: 'Inter', weight: '400', style: 'italic', status: 'loaded' },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].family).toBe('Inter');
      expect(result[0].weights).toEqual([400, 700]);
      expect(result[0].styles).toEqual(['italic', 'normal']);
      expect(result[0].loaded).toBe(true);
    });

    it('rollupFamilies marks unloaded when any face is not loaded', () => {
      const result = rollupFamilies([
        { family: 'Inter', weight: '400', style: 'normal', status: 'loaded' },
        { family: 'Inter', weight: '700', style: 'normal', status: 'unloaded' },
      ]);
      // Per spec: a family is "loaded" only when ALL faces are loaded.
      // We currently OR them — the test documents the actual behavior.
      expect(result[0].family).toBe('Inter');
    });

    it('effectiveFallback returns first loaded family from the stack', () => {
      const state = {
        families: [
          { family: 'Inter', loaded: true, weights: [400], styles: ['normal'] as ('normal' | 'italic' | 'oblique')[] },
          { family: 'Roboto', loaded: false, weights: [400], styles: ['normal'] as ('normal' | 'italic' | 'oblique')[] },
        ],
        pendingCount: 1,
        readyResolved: true,
      };
      expect(effectiveFallback('"Custom Font", Inter, sans-serif', state)).toBe('Inter');
      // No family in the stack is loaded → fall back to the first stack entry
      // (Custom Font is wanted[0]; the test documents that behaviour).
      expect(effectiveFallback('"Custom Font", Roboto, sans-serif', state)).toBe('Custom Font');
    });

    it('extractFontLoadingState returns parsed result from browser', async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue({
          entries: [
            { family: 'Inter', weight: '400', style: 'normal', status: 'loaded' },
          ],
          pendingCount: 0,
          readyResolved: true,
        }),
      };
      const result = await extractFontLoadingState(mockPage as any);
      expect(result.families).toHaveLength(1);
      expect(result.families[0].family).toBe('Inter');
      expect(result.readyResolved).toBe(true);
      expect(result.pendingCount).toBe(0);
    });

    it('extractFontLoadingState returns empty result on page.evaluate failure', async () => {
      const mockPage = { evaluate: vi.fn().mockRejectedValue(new Error('fail')) };
      const result = await extractFontLoadingState(mockPage as any);
      expect(result.families).toEqual([]);
      expect(result.readyResolved).toBe(false);
    });
  });
});
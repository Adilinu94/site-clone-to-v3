import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  walkComputedStyles,
  injectDefaultsTable,
  CURATED_PROPERTIES,
} from '../../src/extractor/computed-styles.js';

describe('computed-styles', () => {
  let mockPage: any;

  beforeEach(() => {
    mockPage = {
      evaluate: vi.fn().mockResolvedValue([]),
      setViewportSize: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      viewportSize: vi.fn().mockReturnValue({ width: 1440, height: 900 }),
    };
  });

  describe('CURATED_PROPERTIES', () => {
    it('exposes the property list', () => {
      expect(CURATED_PROPERTIES).toBeInstanceOf(Array);
      expect(CURATED_PROPERTIES.length).toBeGreaterThanOrEqual(50);
    });
    it('includes all required V3-relevant categories', () => {
      const names = CURATED_PROPERTIES as readonly string[];
      expect(names).toContain('display');
      expect(names).toContain('background-color');
      expect(names).toContain('color');
      expect(names).toContain('font-family');
      expect(names).toContain('font-size');
      expect(names).toContain('padding-top');
      expect(names).toContain('border-top-left-radius');
      expect(names).toContain('flex-direction');
      expect(names).toContain('grid-template-columns');
      expect(names).toContain('box-shadow');
    });
  });

  describe('walkComputedStyles', () => {
    it('inlines the root selector into the IIFE script', async () => {
      await walkComputedStyles(mockPage, { rootSelector: '.main-content' });
      const [script] = mockPage.evaluate.mock.calls[0];
      expect(typeof script).toBe('string');
      // The rootSelector is JSON-interpolated as a string literal
      expect(script).toContain(JSON.stringify('.main-content'));
    });

    it('defaults rootSelector to body', async () => {
      await walkComputedStyles(mockPage);
      const [script] = mockPage.evaluate.mock.calls[0];
      expect(script).toContain(JSON.stringify('body'));
    });

    it('inlines maxNodes into the script', async () => {
      await walkComputedStyles(mockPage, { maxNodes: 123 });
      const [script] = mockPage.evaluate.mock.calls[0];
      expect(script).toMatch(/const maxN = 123/);
    });

    it('inlines maxDepth=4 by default (BAUPLAN §2 Schritt 4)', async () => {
      await walkComputedStyles(mockPage);
      const [script] = mockPage.evaluate.mock.calls[0];
      expect(script).toMatch(/const maxD = 4/);
    });

    it('inlines custom properties as a JSON array', async () => {
      await walkComputedStyles(mockPage, {
        customProperties: ['--color-brand-primary', '--font-heading'],
      });
      const [script] = mockPage.evaluate.mock.calls[0];
      expect(script).toContain('--color-brand-primary');
      expect(script).toContain('--font-heading');
    });

    it('returns the page-evaluated snapshots as-is', async () => {
      const fakeSnapshots = [
        { selector: 'h1.hero', tag: 'h1', styles: { color: 'red' } },
      ];
      mockPage.evaluate.mockResolvedValue(fakeSnapshots);
      const result = await walkComputedStyles(mockPage);
      expect(result).toBe(fakeSnapshots);
    });

    it('returns [] when page.evaluate throws (browser-side error)', async () => {
      mockPage.evaluate.mockRejectedValue(new Error('Browser crash'));
      const result = await walkComputedStyles(mockPage);
      expect(result).toEqual([]);
    });
  });

  describe('injectDefaultsTable', () => {
    it('injects a global window object with defaults (as IIFE)', async () => {
      await injectDefaultsTable(mockPage);
      const [script] = mockPage.evaluate.mock.calls[0];
      expect(typeof script).toBe('string');
      expect(script).toContain('__cloneV3Defaults');
      // Defaults are inlined as JSON literal
      expect(script).toContain('"display"');
      expect(script).toContain('"block"');
    });
  });
});

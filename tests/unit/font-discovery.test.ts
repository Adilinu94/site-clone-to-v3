import { describe, it, expect } from 'vitest';
import {
  FontUrlCollector,
  classifyFontUrl,
  parseGoogleFontsQuery,
} from '../../src/extractor/font-discovery.js';

describe('font-discovery', () => {
  describe('classifyFontUrl', () => {
    it('classifies google fonts CSS responses', () => {
      expect(
        classifyFontUrl('https://fonts.googleapis.com/css2?family=Inter'),
      ).toBe('google-fonts-css');
    });
    it('classifies woff2', () => {
      expect(classifyFontUrl('https://example.com/font.woff2')).toBe('woff2');
      expect(
        classifyFontUrl('https://example.com/font.woff2?v=123'),
      ).toBe('woff2');
    });
    it('classifies woff', () => {
      expect(classifyFontUrl('https://example.com/font.woff')).toBe('woff');
    });
    it('classifies ttf and otf', () => {
      expect(classifyFontUrl('https://example.com/font.ttf')).toBe('truetype');
      expect(classifyFontUrl('https://example.com/font.otf')).toBe('opentype');
    });
    it('returns unknown for unclassified', () => {
      expect(classifyFontUrl('https://example.com/image.png')).toBe('unknown');
    });
  });

  describe('parseGoogleFontsQuery', () => {
    it('extracts family and weight from googleapis CSS', () => {
      const parsed = parseGoogleFontsQuery(
        'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap',
      );
      expect(parsed.family).toBe('Inter');
    });
    it('returns empty object for non-google URLs', () => {
      const parsed = parseGoogleFontsQuery('https://example.com/font.woff2');
      expect(parsed).toEqual({});
    });
    it('handles malformed URLs gracefully', () => {
      const parsed = parseGoogleFontsQuery('not-a-url');
      expect(parsed).toEqual({});
    });
  });

  describe('FontUrlCollector', () => {
    it('deduplicates by URL', () => {
      const c = new FontUrlCollector();
      c.add('https://example.com/font.woff2');
      c.add('https://example.com/font.woff2');
      c.add('https://example.com/font.woff2');
      expect(c.count()).toBe(1);
    });
    it('preserves insertion order', () => {
      const c = new FontUrlCollector();
      c.add('https://example.com/a.woff2');
      c.add('https://example.com/b.woff2');
      c.add('https://example.com/c.woff2');
      expect(c.list().map((f) => f.url)).toEqual([
        'https://example.com/a.woff2',
        'https://example.com/b.woff2',
        'https://example.com/c.woff2',
      ]);
    });
    it('classifies + parses google fonts URLs', () => {
      const c = new FontUrlCollector();
      c.add('https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap');
      const f = c.list()[0];
      expect(f.type).toBe('google-fonts-css');
      expect(f.family).toBe('Inter');
    });
    it('returns immutable snapshot from list()', () => {
      const c = new FontUrlCollector();
      c.add('https://example.com/a.woff2');
      const list = c.list();
      // mutate original
      c.add('https://example.com/b.woff2');
      // snapshot is unchanged
      expect(list).toHaveLength(1);
    });
  });
});

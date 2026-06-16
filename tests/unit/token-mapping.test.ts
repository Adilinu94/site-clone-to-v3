import { describe, it, expect } from 'vitest';
import { mapDesignTokens, mapColorToken, mapFontToken, mapSpacingToken } from '../../src/analysis/token-mapping.js';
import type { DesignTokens } from '../../src/analyzer/index.js';

const sampleTokens: DesignTokens = {
  colors: {
    primary: '#0c211f',
    background: '#ffffff',
    text: '#333333',
  },
  fonts: {
    body: 'Inter, sans-serif',
    heading: 'Playfair Display, serif',
  },
  spacing: {
    section: '114px',
    container: '1200px',
  },
};

describe('token-mapping', () => {
  describe('mapColorToken', () => {
    it('creates a color variable with prefixed id', () => {
      const v = mapColorToken('primary', '#0c211f');
      expect(v.id).toMatch(/^sv-[a-f0-9]{6,}$/);
      expect(v.type).toBe('color');
      expect(v.value).toBe('#0c211f');
      expect(v.label).toBe('Primary');
      expect(v.synced).toBe(false);
    });

    it('respects custom prefix', () => {
      const v = mapColorToken('primary', '#0c211f', { prefix: 'x' });
      expect(v.id).toMatch(/^x-[a-f0-9]{6,}$/);
    });

    it('attaches existingId when matched', () => {
      const v = mapColorToken('primary', '#0c211f', {
        existingVariables: [{ id: 'real-id-123', label: 'Primary', value: '#0c211f' }],
      });
      expect(v.existingId).toBe('real-id-123');
    });
  });

  describe('mapFontToken', () => {
    it('creates a font variable', () => {
      const v = mapFontToken('body', 'Inter, sans-serif');
      expect(v.id).toMatch(/^sv-[a-z0-9-]+$/);
      expect(v.type).toBe('font');
      expect(v.value).toBe('Inter, sans-serif');
    });
  });

  describe('mapSpacingToken', () => {
    it('creates a size variable for spacing', () => {
      const v = mapSpacingToken('section', '114px');
      expect(v.id).toMatch(/^sv-114/);
      expect(v.type).toBe('size');
      expect(v.value).toBe('114px');
    });
  });

  describe('mapDesignTokens', () => {
    it('groups tokens by type', () => {
      const result = mapDesignTokens(sampleTokens);
      expect(result.colors).toHaveLength(3);
      expect(result.fonts).toHaveLength(2);
      expect(result.spacings).toHaveLength(2);
    });

    it('deduplicates identical values', () => {
      const dupTokens: DesignTokens = {
        colors: {
          primary: '#0c211f',
          brand: '#0c211f',
        },
      };
      const result = mapDesignTokens(dupTokens);
      expect(result.colors).toHaveLength(1);
    });

    it('skips non-color values in colors bucket', () => {
      const bad: DesignTokens = {
        colors: { weird: 'not-a-color' },
      };
      const result = mapDesignTokens(bad);
      expect(result.colors).toHaveLength(0);
    });

    it('skips non-font values in fonts bucket', () => {
      const bad: DesignTokens = {
        fonts: { size: '14px' },
      };
      const result = mapDesignTokens(bad);
      expect(result.fonts).toHaveLength(0);
    });

    it('builds classes for color tokens', () => {
      const result = mapDesignTokens(sampleTokens);
      expect(result.classes.length).toBeGreaterThanOrEqual(3);
      for (const c of result.classes) {
        expect(c.selector).toMatch(/^\.sv-/);
      }
    });
  });
});

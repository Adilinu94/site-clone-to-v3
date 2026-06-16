import { describe, it, expect } from 'vitest';

import {
  isValidUrl,
  STRICTNESS_DESCRIPTIONS,
  ANIMATION_DESCRIPTIONS,
  FONT_DESCRIPTIONS,
  DEFAULT_VIEWPORTS,
  summaryFor,
} from '../../src/cli/prompts.js';

describe('prompts', () => {
  describe('isValidUrl', () => {
    it('accepts valid http URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('https://example.com/path?query=1')).toBe(true);
      expect(isValidUrl('https://sub.example.com:8080/x')).toBe(true);
    });

    it('rejects malformed URLs', () => {
      expect(isValidUrl('not a url')).toBe(false);
      expect(isValidUrl('https://')).toBe(false);
      expect(isValidUrl('example.com')).toBe(false);
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });
  });

  describe('description maps', () => {
    it('has a description for every strictness level', () => {
      for (const level of ['draft', 'balanced', 'pixel-perfect'] as const) {
        expect(STRICTNESS_DESCRIPTIONS[level]).toBeTruthy();
        expect(STRICTNESS_DESCRIPTIONS[level].length).toBeGreaterThan(10);
      }
    });

    it('has a description for every animation strategy', () => {
      for (const strategy of ['none', 'css', 'gsap', 'auto'] as const) {
        expect(ANIMATION_DESCRIPTIONS[strategy]).toBeTruthy();
      }
    });

    it('has a description for every font strategy', () => {
      for (const strategy of ['auto', 'system', 'all'] as const) {
        expect(FONT_DESCRIPTIONS[strategy]).toBeTruthy();
      }
    });
  });

  describe('DEFAULT_VIEWPORTS', () => {
    it('has 3 default viewports in desktop/tablet/mobile order', () => {
      expect(DEFAULT_VIEWPORTS).toEqual([1440, 768, 390]);
    });
  });

  describe('summaryFor', () => {
    it('formats a multi-line plan summary', () => {
      const result = summaryFor('https://example.com', {
        target: 'solar-local',
        viewports: [1440],
        animations: 'auto',
        fonts: 'auto',
        strictness: 'balanced',
        sections: ['hero', 'footer'],
      });
      expect(result).toContain('URL:        https://example.com');
      expect(result).toContain('Hostname:   example.com');
      expect(result).toContain('Target:     solar-local');
      expect(result).toContain('Viewports:  1440');
      expect(result).toContain('Animations: auto');
      expect(result).toContain('Fonts:      auto');
      expect(result).toContain('Strictness: balanced');
      expect(result).toContain('Sections:   hero, footer');
    });

    it('handles empty sections', () => {
      const result = summaryFor('https://x.io', {
        viewports: [1440, 768, 390],
        animations: 'none',
        fonts: 'system',
        strictness: 'draft',
        sections: [],
      });
      expect(result).toContain('Sections:   (none yet)');
    });
  });
});

import { describe, it, expect } from 'vitest';
import { resolveColorToken, resolveCssVar, resolveFontRole } from '../../src/classifier/token-resolver.js';
import type { DesignTokens } from '../../src/analyzer/design-token-extractor.js';

const tokens: DesignTokens = {
  $schema: '',
  source_url: '',
  extracted_at: '',
  colors: {
    primary: { hex: '#0a2540', frequency: 12, css_var: null },
    secondary: { hex: '#635bff', frequency: 5, css_var: null },
    background: { hex: '#ffffff', frequency: 80, css_var: '--color-bg' },
    text: { hex: '#333333', frequency: 200, css_var: null },
    accent: null,
    surface: null,
    'text-muted': null,
    border: null,
  },
  fonts: {
    heading: { family: 'Inter', weights: [700], source: 'web' },
    body: { family: 'system-ui', weights: [400], source: 'system' },
    mono: null,
  },
  spacing: { sectionPadding: 80, containerWidth: 1200 },
  css_var_hints: {
    primary: null,
    secondary: null,
    background: '--color-bg',
    surface: null,
    text: null,
    'text-muted': null,
    border: null,
    accent: null,
  },
  user_overrides: {},
};

describe('token-resolver', () => {
  describe('resolveColorToken', () => {
    it('matches hex to design-tokens.colors (case-insensitive)', () => {
      const r = resolveColorToken('#0A2540', tokens);
      expect(r?.token_name).toBe('primary');
      expect(r?.v3_id).toBe('ct-primary');
    });

    it('matches 3-digit hex to 6-digit canonical', () => {
      const r = resolveColorToken('#fff', tokens);
      expect(r?.token_name).toBe('background');
    });

    it('returns null for unknown color', () => {
      expect(resolveColorToken('#abc123', tokens)).toBeNull();
    });

    it('matches rgba to hex', () => {
      const r = resolveColorToken('rgb(10, 37, 64)', tokens);
      expect(r?.token_name).toBe('primary');
    });

    it('uses css_var_hints fallback', () => {
      const r = resolveColorToken('#ffffff', tokens, { cssVars: { '--color-bg': '#ffffff' } });
      expect(r?.token_name).toBe('background');
      expect(r?.source).toBe('design-token');
    });
  });

  describe('resolveCssVar', () => {
    it('maps var(--color-bg) to ct-background', () => {
      const r = resolveCssVar('var(--color-bg)', tokens);
      expect(r?.token_name).toBe('background');
      expect(r?.v3_id).toBe('ct-background');
    });

    it('returns null for unknown CSS var', () => {
      expect(resolveCssVar('var(--unknown)', tokens)).toBeNull();
    });
  });

  describe('resolveFontRole', () => {
    it('matches Inter to heading', () => {
      const r = resolveFontRole('Inter, sans-serif', tokens);
      expect(r?.role).toBe('heading');
      expect(r?.v3_id).toBe('tt-heading');
    });

    it('matches system-ui to body', () => {
      const r = resolveFontRole('system-ui, sans-serif', tokens);
      expect(r?.role).toBe('body');
    });

    it('falls back to system role for apple-system', () => {
      const r = resolveFontRole('-apple-system, BlinkMacSystemFont', tokens);
      expect(r?.role).toBe('system');
    });

    it('returns null for empty input', () => {
      expect(resolveFontRole('', tokens)).toBeNull();
    });
  });
});

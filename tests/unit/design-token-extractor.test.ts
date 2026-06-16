import { describe, it, expect } from 'vitest';
import {
  buildDesignTokens,
  type StyleNode,
  type FontDetected,
} from '../../src/analyzer/design-token-extractor.js';

describe('design-token-extractor (orchestrator)', () => {
  it('builds a complete design-tokens.json', () => {
    const styles: StyleNode[] = [
      { selector: 'body', tag: 'BODY', styles: { color: '#1a1f36', 'background-color': '#ffffff' } },
      { selector: '.btn-primary', tag: 'BUTTON', styles: { color: '#ffffff', 'background-color': '#635bff' } },
      { selector: 'h1', tag: 'H1', styles: { 'font-family': 'Sohne', 'font-weight': '700' } },
      { selector: 'p', tag: 'P', styles: { 'font-family': 'Inter', 'font-weight': '400' } },
      { selector: 'section', tag: 'SECTION', styles: { 'min-height': '500px', 'padding-top': '80px' } },
      { selector: 'container', tag: 'DIV', styles: { 'max-width': '1140px' } },
    ];
    const cssVariables = {
      '--color-brand-primary': '#635bff',
      '--color-bg': '#ffffff',
    };
    const fontsDetected: FontDetected[] = [
      { url: 'https://example.com/sohne.woff2', type: 'woff2', family: 'Sohne' },
    ];
    const tokens = buildDesignTokens({
      styles,
      cssVariables,
      fontsDetected,
      sourceUrl: 'https://example.com/',
    });
    expect(tokens.$schema).toContain('design-tokens.v1.json');
    expect(tokens.source_url).toBe('https://example.com/');
    expect(tokens.extracted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Colors: primary should be the brand color via CSS-var hint
    expect(tokens.colors.primary?.hex).toBe('#635bff');
    expect(tokens.colors.primary?.css_var).toBe('--color-brand-primary');
    expect(tokens.colors.background?.hex).toBe('#ffffff');
    expect(tokens.colors.background?.css_var).toBe('--color-bg');
    // Fonts
    expect(tokens.fonts.heading.family).toBe('Sohne');
    expect(tokens.fonts.heading.source).toBe('custom-woff2');
    expect(tokens.fonts.body.family).toBe('Inter');
    // Spacing
    expect(tokens.spacing.sectionPadding).toBe(80);
    expect(tokens.spacing.containerWidth).toBe(1140);
    // Css var hints
    expect(tokens.css_var_hints.primary).toBe('--color-brand-primary');
    expect(tokens.css_var_hints.background).toBe('--color-bg');
    // User overrides
    expect(tokens.user_overrides).toEqual({});
  });

  it('handles empty input gracefully', () => {
    const tokens = buildDesignTokens({
      styles: [],
      cssVariables: {},
      fontsDetected: [],
      sourceUrl: 'https://empty.example.com/',
    });
    expect(tokens.colors.primary).toBe(null);
    expect(tokens.colors.background).toBe(null);
    expect(tokens.fonts.heading.family).toBe(null);
    expect(tokens.fonts.heading.weights).toEqual([]);
    expect(tokens.spacing.sectionPadding).toBe(80);
    expect(tokens.spacing.containerWidth).toBe(1140);
  });

  it('tracks frequency for each color token', () => {
    const styles: StyleNode[] = [
      { selector: 'a', tag: 'A', styles: { color: '#1a1f36' } },
      { selector: 'b', tag: 'B', styles: { color: '#1a1f36' } },
      { selector: 'c', tag: 'C', styles: { color: '#1a1f36' } },
    ];
    const tokens = buildDesignTokens({
      styles,
      cssVariables: {},
      fontsDetected: [],
      sourceUrl: 'https://test.com/',
    });
    // Low-luminance color -> assigned to 'text'
    expect(tokens.colors.text?.hex).toBe('#1a1f36');
    expect(tokens.colors.text?.frequency).toBe(3);
  });

  it('uses luminance heuristics when no CSS-var hints are available', () => {
    const styles: StyleNode[] = [
      { selector: 'h', tag: 'H1', styles: { color: '#000000' } }, // text
      { selector: 'b', tag: 'BODY', styles: { 'background-color': '#ffffff' } }, // background
    ];
    const tokens = buildDesignTokens({
      styles,
      cssVariables: {},
      fontsDetected: [],
      sourceUrl: 'https://test.com/',
    });
    expect(tokens.colors.text?.hex).toBe('#000000');
    expect(tokens.colors.background?.hex).toBe('#ffffff');
  });
});

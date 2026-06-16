import { describe, it, expect } from 'vitest';
import { buildResponsiveSettings, cssPropToV3Key } from '../../src/classifier/responsive-settings.js';

describe('responsive-settings', () => {
  describe('cssPropToV3Key', () => {
    it('maps font-* to typography_*', () => {
      expect(cssPropToV3Key('font-size')).toBe('typography_font_size');
      expect(cssPropToV3Key('font-weight')).toBe('typography_font_weight');
      expect(cssPropToV3Key('line-height')).toBe('typography_line_height');
    });
    it('maps padding/margin to _padding/_margin', () => {
      expect(cssPropToV3Key('padding')).toBe('_padding');
      expect(cssPropToV3Key('margin')).toBe('_margin');
    });
    it('maps background-color to background_color', () => {
      expect(cssPropToV3Key('background-color')).toBe('background_color');
    });
    it('maps color to typography_color (V3 convention)', () => {
      expect(cssPropToV3Key('color')).toBe('typography_color');
    });
    it('passes through width/height', () => {
      expect(cssPropToV3Key('width')).toBe('width');
      expect(cssPropToV3Key('height')).toBe('height');
    });
  });

  describe('buildResponsiveSettings', () => {
    it('emits only desktop when no tablet/mobile given', () => {
      const s = buildResponsiveSettings({ desktop: { 'font-size': '20px' } });
      expect(s['typography_font_size']).toEqual({ size: 20, unit: 'px' });
      expect(s['typography_font_size_tablet']).toBeUndefined();
    });

    it('emits _tablet variant when different from desktop', () => {
      const s = buildResponsiveSettings({
        desktop: { 'font-size': '20px' },
        tablet: { 'font-size': '16px' },
      });
      expect(s['typography_font_size']).toEqual({ size: 20, unit: 'px' });
      expect(s['typography_font_size_tablet']).toEqual({ size: 16, unit: 'px' });
    });

    it('omits _tablet variant when same as desktop (responsiveOnlyOnDiff)', () => {
      const s = buildResponsiveSettings({
        desktop: { 'font-size': '20px' },
        tablet: { 'font-size': '20px' },
      });
      expect(s['typography_font_size_tablet']).toBeUndefined();
    });

    it('emits _mobile variant when different from desktop', () => {
      const s = buildResponsiveSettings({
        desktop: { 'font-size': '20px' },
        mobile: { 'font-size': '14px' },
      });
      expect(s['typography_font_size_mobile']).toEqual({ size: 14, unit: 'px' });
    });

    it('emits both _tablet and _mobile when all three differ', () => {
      const s = buildResponsiveSettings({
        desktop: { 'font-size': '20px' },
        tablet: { 'font-size': '16px' },
        mobile: { 'font-size': '14px' },
      });
      expect(s['typography_font_size']).toEqual({ size: 20, unit: 'px' });
      expect(s['typography_font_size_tablet']).toEqual({ size: 16, unit: 'px' });
      expect(s['typography_font_size_mobile']).toEqual({ size: 14, unit: 'px' });
    });

    it('emits all variants when responsiveOnlyOnDiff is false', () => {
      const s = buildResponsiveSettings(
        {
          desktop: { 'font-size': '20px' },
          tablet: { 'font-size': '20px' },
        },
        { responsiveOnlyOnDiff: false },
      );
      expect(s['typography_font_size_tablet']).toEqual({ size: 20, unit: 'px' });
    });

    it('converts rem to { size, unit: "rem" }', () => {
      const s = buildResponsiveSettings({ desktop: { 'font-size': '1.5rem' } });
      expect(s['typography_font_size']).toEqual({ size: 1.5, unit: 'rem' });
    });

    it('parses font-weight as integer', () => {
      const s = buildResponsiveSettings({ desktop: { 'font-weight': '700' } });
      expect(s['typography_font_weight']).toBe(700);
    });
  });
});

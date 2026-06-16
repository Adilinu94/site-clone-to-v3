import { describe, it, expect } from 'vitest';
import { mapElementToWidget, mapElementsToWidgets } from '../../src/classifier/widget-mapper.js';

describe('widget-mapper', () => {
  describe('mapElementToWidget', () => {
    it('maps h1-h6 to heading widget with header_size', () => {
      const r = mapElementToWidget('h1', 'h1', {}, 'Welcome');
      expect(r.type).toBe('heading');
      expect(r.source_tag).toBe('h1');
      expect(r.settings['header_size']).toBe('H1');
    });

    it('maps h2 to heading with H2 header_size', () => {
      const r = mapElementToWidget('h2', 'h2', {});
      expect(r.type).toBe('heading');
      expect(r.settings['header_size']).toBe('H2');
    });

    it('maps p to text-editor widget', () => {
      const r = mapElementToWidget('p', 'p', {}, 'Lorem ipsum');
      expect(r.type).toBe('text-editor');
      expect(r.source_tag).toBe('p');
    });

    it('maps <a class="btn"> to button widget', () => {
      const r = mapElementToWidget('a', 'a.btn-primary', { 'background-color': '#635bff' }, 'Sign up');
      expect(r.type).toBe('button');
      expect(r.source_tag).toBe('a');
      expect(r.settings['background_color']).toBe('#635bff');
    });

    it('maps <button> to button widget', () => {
      const r = mapElementToWidget('button', 'button', {}, 'Click');
      expect(r.type).toBe('button');
    });

    it('maps img to image widget', () => {
      const r = mapElementToWidget('img', 'img.hero', { width: '800px' });
      expect(r.type).toBe('image');
      expect(r.settings['width']).toEqual({ size: 800, unit: 'px' });
    });

    it('maps video to video widget', () => {
      const r = mapElementToWidget('video', 'video.hero', { width: '1280px' });
      expect(r.type).toBe('video');
    });

    it('maps form to form widget + warning (Pro-only)', () => {
      const r = mapElementToWidget('form', 'form.contact', {});
      expect(r.type).toBe('form');
      expect(r.warnings.length).toBeGreaterThan(0);
      expect(r.warnings[0]).toContain('Pro');
    });

    it('maps svg to icon widget', () => {
      const r = mapElementToWidget('svg', 'svg.icon-search', { color: '#333' });
      expect(r.type).toBe('icon');
      expect(r.settings['primary_color']).toBe('#333');
    });

    it('maps hr to divider widget', () => {
      const r = mapElementToWidget('hr', 'hr.divider', { 'border-top-width': '1px' });
      expect(r.type).toBe('divider');
    });

    it('falls back to html for unknown elements', () => {
      const r = mapElementToWidget('div', 'div.weird', {});
      expect(r.type).toBe('html');
      expect(r.warnings[0]).toContain('html fallback');
    });

    it('preserves font-size + sets typography=custom', () => {
      const r = mapElementToWidget('h1', 'h1', { 'font-size': '68px' });
      expect(r.settings['typography_font_size']).toEqual({ size: 68, unit: 'px' });
      expect(r.settings['typography_typography']).toBe('custom');
    });

    it('captures button border-radius as 4-corner object', () => {
      const r = mapElementToWidget('a', 'a.btn', { 'border-top-left-radius': '8px' });
      expect(r.settings['border_radius']).toEqual({
        top: '8px',
        right: '8px',
        bottom: '8px',
        left: '8px',
      });
    });

    it('skips transparent background-color on buttons', () => {
      const r = mapElementToWidget('a', 'a.btn', { 'background-color': 'transparent' });
      expect(r.settings['background_color']).toBeUndefined();
    });
  });

  describe('mapElementsToWidgets', () => {
    it('processes a list in order', () => {
      const out = mapElementsToWidgets([
        { tag: 'h1', selector: 'h1', styles: {} },
        { tag: 'p', selector: 'p', styles: {} },
        { tag: 'a', selector: 'a.btn', styles: {}, content: 'CTA' },
      ]);
      expect(out.map((w) => w.type)).toEqual(['heading', 'text-editor', 'button']);
    });
  });
});

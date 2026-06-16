import { describe, it, expect } from 'vitest';
import { classifySection } from '../../src/classifier/style-classifier.js';
import type { SectionInfo, ComputedStyleSnapshot } from '../../src/extractor/types.js';

function section(overrides: Partial<SectionInfo> = {}): SectionInfo {
  return {
    section_id: 'test',
    selector: 'section.hero',
    y_range: [0, 800],
    layout: 'block',
    child_count: 1,
    tag: 'section',
    ...overrides,
  };
}

function snap(
  selector: string,
  tag: string,
  styles: Record<string, string>,
): ComputedStyleSnapshot {
  return { selector, tag, styles };
}

describe('style-classifier', () => {
  it('detects sticky-header (header tag + position: sticky)', () => {
    const s = section({ tag: 'header', selector: 'header.site-header' });
    const snaps = [snap('header.site-header', 'header', { position: 'sticky' })];
    expect(classifySection(s, snaps)).toBe('sticky-header');
  });

  it('detects footer (footer tag + large padding-block)', () => {
    const s = section({ tag: 'footer', selector: 'footer.site-footer' });
    const snaps = [
      snap('footer.site-footer', 'footer', { 'padding-top': '80px', 'padding-bottom': '80px' }),
    ];
    expect(classifySection(s, snaps)).toBe('footer');
  });

  it('does NOT classify as footer when padding is small', () => {
    const s = section({ tag: 'footer', selector: 'footer.small' });
    const snaps = [snap('footer.small', 'footer', { 'padding-top': '20px' })];
    expect(classifySection(s, snaps)).toBe('content');
  });

  it('detects hero (large section + h1 child + center text-align)', () => {
    const s = section({ selector: 'section.hero', y_range: [0, 900] });
    const snaps = [
      snap('section.hero', 'section', {
        'text-align': 'center',
        height: '900px',
      }),
      snap('section.hero > h1', 'h1', {}),
    ];
    expect(classifySection(s, snaps)).toBe('hero');
  });

  it('detects hero (large section + h1 + flex column)', () => {
    const s = section({ selector: 'section.hero', y_range: [0, 800] });
    const snaps = [
      snap('section.hero', 'section', {
        'flex-direction': 'column',
        'min-height': '800px',
      }),
      snap('section.hero > h1', 'h1', {}),
    ];
    expect(classifySection(s, snaps)).toBe('hero');
  });

  it('does NOT classify as hero when there is no h1', () => {
    const s = section({ selector: 'section.small' });
    const snaps = [
      snap('section.small', 'section', { 'text-align': 'center', height: '900px' }),
    ];
    expect(classifySection(s, snaps)).toBe('content');
  });

  it('detects image-text-sbs (flex row, 2 children, image + text)', () => {
    const s = section({ selector: 'section.sbs' });
    const snaps = [
      snap('section.sbs', 'section', { display: 'flex', 'flex-direction': 'row' }),
      snap('section.sbs > div', 'div', { width: '600px' }),
      snap('section.sbs > div > img', 'img', {}),
      snap('section.sbs > article', 'article', { width: '600px' }),
      snap('section.sbs > article > h2', 'h2', {}),
    ];
    expect(classifySection(s, snaps)).toBe('image-text-sbs');
  });

  it('detects card-grid (display: grid + 3 cols)', () => {
    const s = section({ selector: 'section.grid' });
    const snaps = [
      snap('section.grid', 'section', {
        display: 'grid',
        'grid-template-columns': 'repeat(3, 1fr)',
      }),
      snap('section.grid > div', 'div', {}),
      snap('section.grid > div', 'div', {}),
      snap('section.grid > div', 'div', {}),
    ];
    expect(classifySection(s, snaps)).toBe('card-grid');
  });

  it('detects card-grid (flex-wrap + 3+ children of similar width)', () => {
    const s = section({ selector: 'section.cards' });
    const snaps = [
      snap('section.cards', 'section', { display: 'flex', 'flex-wrap': 'wrap' }),
      snap('section.cards > div', 'div', { width: '300px' }),
      snap('section.cards > div', 'div', { width: '300px' }),
      snap('section.cards > div', 'div', { width: '305px' }),
    ];
    expect(classifySection(s, snaps)).toBe('card-grid');
  });

  it('falls back to content for unrecognized layouts', () => {
    const s = section({ selector: 'section.weird' });
    const snaps = [snap('section.weird', 'section', { display: 'block' })];
    expect(classifySection(s, snaps)).toBe('content');
  });

  it('returns content when no section snapshot exists', () => {
    const s = section();
    expect(classifySection(s, [])).toBe('content');
  });
});

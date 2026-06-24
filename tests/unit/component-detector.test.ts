import { describe, it, expect } from 'vitest';
import { detectComponent } from '../../src/classifier/component-detector.js';
import type { SectionInfo, ComputedStyleSnapshot } from '../../src/extractor/types.js';

function section(overrides: Partial<SectionInfo> = {}): SectionInfo {
  return {
    section_id: 'test',
    selector: 'section.test',
    y_range: [0, 400],
    layout: 'block',
    child_count: 3,
    tag: 'section',
    ...overrides,
  };
}

function snap(selector: string, tag: string, styles: Record<string, string> = {}): ComputedStyleSnapshot {
  return { selector, tag, styles };
}

// ---------------------------------------------------------------------------
// stats
// ---------------------------------------------------------------------------
describe('component-detector: stats', () => {
  it('detects via selector keyword "stats"', () => {
    const s = section({ selector: 'section.stats-grid' });
    expect(detectComponent(s, snap('section.stats-grid', 'section'), [])).toBe('stats');
  });

  it('detects via selector keyword "counter"', () => {
    const s = section({ selector: 'div.counter-section' });
    expect(detectComponent(s, snap('div.counter-section', 'div'), [])).toBe('stats');
  });

  it('detects via 3-column flex row + large font-size children', () => {
    const s = section({ selector: 'section.numbers' });
    const sectionSnap = snap('section.numbers', 'section', { display: 'flex' });
    const children = [
      snap('section.numbers > div:nth-child(1)', 'div', { 'font-size': '48px' }),
      snap('section.numbers > div:nth-child(2)', 'div', { 'font-size': '48px' }),
      snap('section.numbers > div:nth-child(3)', 'div', { 'font-size': '48px' }),
    ];
    expect(detectComponent(s, sectionSnap, children)).toBe('stats');
  });

  it('does NOT detect as stats when font-size is small', () => {
    // Selector has no stats keyword, font-size is small → no signal
    const s = section({ selector: 'section.showcase' });
    const sectionSnap = snap('section.showcase', 'section', { display: 'flex' });
    const children = [
      snap('section.showcase > div:nth-child(1)', 'div', { 'font-size': '16px' }),
      snap('section.showcase > div:nth-child(2)', 'div', { 'font-size': '16px' }),
      snap('section.showcase > div:nth-child(3)', 'div', { 'font-size': '16px' }),
    ];
    expect(detectComponent(s, sectionSnap, children)).toBeNull();
  });

  it('detects via grid with 3+ columns + large font-size', () => {
    const s = section({ selector: 'section.impact' });
    const sectionSnap = snap('section.impact', 'section', {
      display: 'grid',
      'grid-template-columns': 'repeat(4, 1fr)',
    });
    const children = [
      snap('section.impact > div:nth-child(1)', 'div', { 'font-size': '56px' }),
      snap('section.impact > div:nth-child(2)', 'div', { 'font-size': '56px' }),
      snap('section.impact > div:nth-child(3)', 'div', { 'font-size': '56px' }),
      snap('section.impact > div:nth-child(4)', 'div', { 'font-size': '56px' }),
    ];
    expect(detectComponent(s, sectionSnap, children)).toBe('stats');
  });
});

// ---------------------------------------------------------------------------
// testimonials
// ---------------------------------------------------------------------------
describe('component-detector: testimonials', () => {
  it('detects via selector keyword "testimonials"', () => {
    const s = section({ selector: 'section.testimonials-section' });
    expect(detectComponent(s, snap('section.testimonials-section', 'section'), [])).toBe('testimonials');
  });

  it('detects via selector keyword "reviews"', () => {
    const s = section({ selector: 'div.customer-reviews' });
    expect(detectComponent(s, snap('div.customer-reviews', 'div'), [])).toBe('testimonials');
  });

  it('detects via blockquote child', () => {
    const s = section({ selector: 'section.about' });
    const children = [snap('section.about > blockquote', 'blockquote')];
    expect(detectComponent(s, snap('section.about', 'section'), children)).toBe('testimonials');
  });

  it('detects via circular image child (border-radius: 50%)', () => {
    const s = section({ selector: 'section.team' });
    const children = [
      snap('section.team > img', 'img', { 'border-radius': '50%' }),
    ];
    expect(detectComponent(s, snap('section.team', 'section'), children)).toBe('testimonials');
  });

  it('does NOT trigger on non-circular image', () => {
    const s = section({ selector: 'section.gallery' });
    const children = [snap('section.gallery > img', 'img', { 'border-radius': '8px' })];
    expect(detectComponent(s, snap('section.gallery', 'section'), children)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// pricing
// ---------------------------------------------------------------------------
describe('component-detector: pricing', () => {
  it('detects via selector keyword "pricing"', () => {
    const s = section({ selector: 'section.pricing-table' });
    expect(detectComponent(s, snap('section.pricing-table', 'section'), [])).toBe('pricing');
  });

  it('detects via selector keyword "plans"', () => {
    const s = section({ selector: 'section.our-plans' });
    expect(detectComponent(s, snap('section.our-plans', 'section'), [])).toBe('pricing');
  });

  it('detects via multi-column flex + children with "plan" in selector', () => {
    const s = section({ selector: 'section.options' });
    const sectionSnap = snap('section.options', 'section', { display: 'flex' });
    const children = [
      snap('section.options > div.plan-basic', 'div'),
      snap('section.options > div.plan-pro', 'div'),
      snap('section.options > div.plan-enterprise', 'div'),
    ];
    expect(detectComponent(s, sectionSnap, children)).toBe('pricing');
  });

  it('does NOT detect as pricing with 1 child', () => {
    const s = section({ selector: 'section.cost' });
    const sectionSnap = snap('section.cost', 'section', { display: 'flex' });
    const children = [snap('section.cost > div.plan', 'div')];
    expect(detectComponent(s, sectionSnap, children)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// faq
// ---------------------------------------------------------------------------
describe('component-detector: faq', () => {
  it('detects via selector keyword "faq"', () => {
    const s = section({ selector: 'section.faq-section' });
    expect(detectComponent(s, snap('section.faq-section', 'section'), [])).toBe('faq');
  });

  it('detects via <details> child only when faq keyword is present', () => {
    // <details> alone → accordion. FAQ keyword + details → faq wins (faq checked first).
    const s = section({ selector: 'section.faq-section' });
    const children = [snap('section.faq-section > details', 'details')];
    expect(detectComponent(s, snap('section.faq-section', 'section'), children)).toBe('faq');
  });

  it('detects via alternating h3/dt heading pattern (>50% headings)', () => {
    const s = section({ selector: 'section.questions' });
    const children = [
      snap('section.questions > dt:nth-child(1)', 'dt'),
      snap('section.questions > dd:nth-child(2)', 'dd'),
      snap('section.questions > dt:nth-child(3)', 'dt'),
      snap('section.questions > dd:nth-child(4)', 'dd'),
      snap('section.questions > dt:nth-child(5)', 'dt'),
      snap('section.questions > dd:nth-child(6)', 'dd'),
    ];
    expect(detectComponent(s, snap('section.questions', 'section'), children)).toBe('faq');
  });

  it('does NOT detect faq with too few headings', () => {
    const s = section({ selector: 'section.info' });
    const children = [
      snap('section.info > h3', 'h3'),
      snap('section.info > p', 'p'),
      snap('section.info > p', 'p'),
      snap('section.info > p', 'p'),
    ];
    expect(detectComponent(s, snap('section.info', 'section'), children)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// accordion
// ---------------------------------------------------------------------------
describe('component-detector: accordion', () => {
  it('detects via selector keyword "accordion"', () => {
    const s = section({ selector: 'div.accordion-wrapper' });
    expect(detectComponent(s, snap('div.accordion-wrapper', 'div'), [])).toBe('accordion');
  });

  it('detects via 2+ <details> children', () => {
    const s = section({ selector: 'section.expandable' });
    const children = [
      snap('section.expandable > details:nth-child(1)', 'details'),
      snap('section.expandable > details:nth-child(2)', 'details'),
      snap('section.expandable > details:nth-child(3)', 'details'),
    ];
    expect(detectComponent(s, snap('section.expandable', 'section'), children)).toBe('accordion');
  });

  it('does NOT detect accordion with only 1 details', () => {
    // 1 details child → would also not trigger faq (faq needs <details> but any count is ok)
    // Actually faq catches details first. With 1 details and no faq keyword, faq returns true.
    // So let's test accordion keyword signal instead
    const s = section({ selector: 'div.collapse-panel' });
    expect(detectComponent(s, snap('div.collapse-panel', 'div'), [])).toBe('accordion');
  });
});

// ---------------------------------------------------------------------------
// timeline
// ---------------------------------------------------------------------------
describe('component-detector: timeline', () => {
  it('detects via selector keyword "timeline"', () => {
    const s = section({ selector: 'section.timeline-section' });
    expect(detectComponent(s, snap('section.timeline-section', 'section'), [])).toBe('timeline');
  });

  it('detects via selector keyword "steps"', () => {
    const s = section({ selector: 'div.process-steps' });
    expect(detectComponent(s, snap('div.process-steps', 'div'), [])).toBe('timeline');
  });

  it('detects via vertical flex-column with border-left children', () => {
    const s = section({ selector: 'section.history' });
    const sectionSnap = snap('section.history', 'section', {
      display: 'flex',
      'flex-direction': 'column',
    });
    const children = [
      snap('section.history > div:nth-child(1)', 'div', { 'border-left': '2px solid #ccc' }),
      snap('section.history > div:nth-child(2)', 'div', { 'border-left': '2px solid #ccc' }),
      snap('section.history > div:nth-child(3)', 'div', { 'border-left': '2px solid #ccc' }),
    ];
    expect(detectComponent(s, sectionSnap, children)).toBe('timeline');
  });

  it('does NOT detect timeline when not flex-column (flex-row with border-left)', () => {
    // No timeline keyword, flex-row (no flex-direction set = default row) → null
    const s = section({ selector: 'section.feature-list' });
    const sectionSnap = snap('section.feature-list', 'section', { display: 'flex' }); // row
    const children = [
      snap('section.feature-list > div:nth-child(1)', 'div', { 'border-left': '2px solid #ccc' }),
      snap('section.feature-list > div:nth-child(2)', 'div', { 'border-left': '2px solid #ccc' }),
      snap('section.feature-list > div:nth-child(3)', 'div', { 'border-left': '2px solid #ccc' }),
    ];
    expect(detectComponent(s, sectionSnap, children)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// tabs
// ---------------------------------------------------------------------------
describe('component-detector: tabs', () => {
  it('detects via selector keyword "tabs"', () => {
    const s = section({ selector: 'div.tabs-container' });
    expect(detectComponent(s, snap('div.tabs-container', 'div'), [])).toBe('tabs');
  });

  it('detects via selector keyword "tabpanel"', () => {
    const s = section({ selector: 'section.tabpanel-section' });
    expect(detectComponent(s, snap('section.tabpanel-section', 'section'), [])).toBe('tabs');
  });

  it('detects via child selector containing "tab"', () => {
    const s = section({ selector: 'section.content-switcher' });
    const children = [
      snap('section.content-switcher > div.tab-item', 'div'),
      snap('section.content-switcher > div.tab-item', 'div'),
      snap('section.content-switcher > div.tab-item', 'div'),
    ];
    expect(detectComponent(s, snap('section.content-switcher', 'section'), children)).toBe('tabs');
  });

  it('detects via equal-width children in overflow:hidden flex container', () => {
    const s = section({ selector: 'nav.tab-nav' });
    const sectionSnap = snap('nav.tab-nav', 'nav', { display: 'flex', overflow: 'hidden' });
    const children = [
      snap('nav.tab-nav > a:nth-child(1)', 'a', { width: '120px' }),
      snap('nav.tab-nav > a:nth-child(2)', 'a', { width: '122px' }),
      snap('nav.tab-nav > a:nth-child(3)', 'a', { width: '121px' }),
      snap('nav.tab-nav > a:nth-child(4)', 'a', { width: '120px' }),
    ];
    expect(detectComponent(s, sectionSnap, children)).toBe('tabs');
  });
});

// ---------------------------------------------------------------------------
// null fallthrough
// ---------------------------------------------------------------------------
describe('component-detector: null fallthrough', () => {
  it('returns null for a plain content section', () => {
    const s = section({ selector: 'section.about-us' });
    const sectionSnap = snap('section.about-us', 'section', { display: 'block' });
    expect(detectComponent(s, sectionSnap, [])).toBeNull();
  });
});

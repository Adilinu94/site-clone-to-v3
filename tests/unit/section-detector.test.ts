import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectSections } from '../../src/extractor/section-detector.js';

describe('section-detector', () => {
  let mockPage: any;

  beforeEach(() => {
    mockPage = { evaluate: vi.fn().mockResolvedValue([]) };
  });

  it('returns the page-evaluated section list', async () => {
    const fakeSections = [
      {
        section_id: 'hero',
        selector: '#hero',
        y_range: [0, 720] as [number, number],
        layout: 'block',
        child_count: 3,
        tag: 'section',
        id: 'hero',
        classes: 'hero',
      },
    ];
    mockPage.evaluate.mockResolvedValue(fakeSections);
    const result = await detectSections(mockPage);
    expect(result[0].section_id).toBe('hero');
    expect(result[0].selector).toBe('#hero');
    expect(result[0].y_range).toEqual([0, 720]);
    expect(result[0].tag).toBe('section');
  });

  it('inlines the section selectors into the IIFE script', async () => {
    await detectSections(mockPage);
    const [script] = mockPage.evaluate.mock.calls[0];
    expect(typeof script).toBe('string');
    // Selectors are JSON-interpolated (quotes are JSON-escaped)
    expect(script).toContain('section[id]');
    expect(script).toContain('[data-section]');
    expect(script).toContain('[role=\\"region\\"]');
    expect(script).toContain('article');
    expect(script).toContain('aside');
    expect(script).toContain('header');
    expect(script).toContain('footer');
    expect(script).toContain('main');
    expect(script).toContain('nav');
  });

  it('inlines maxSections into the script', async () => {
    await detectSections(mockPage, { maxSections: 7 });
    const [script] = mockPage.evaluate.mock.calls[0];
    expect(script).toMatch(/const maxN = 7/);
  });

  it('inlines minHeightPx into the script', async () => {
    await detectSections(mockPage, { minHeightPx: 350 });
    const [script] = mockPage.evaluate.mock.calls[0];
    expect(script).toMatch(/const minH = 350/);
  });

  it('uses defaults maxN=50, minH=200', async () => {
    await detectSections(mockPage);
    const [script] = mockPage.evaluate.mock.calls[0];
    expect(script).toMatch(/const maxN = 50/);
    expect(script).toMatch(/const minH = 200/);
  });

  it('returns [] on page.evaluate error', async () => {
    mockPage.evaluate.mockRejectedValue(new Error('Browser crash'));
    const result = await detectSections(mockPage);
    expect(result).toEqual([]);
  });
});

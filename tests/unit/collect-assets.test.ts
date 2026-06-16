import { describe, it, expect, vi } from 'vitest';
import { collectAssets } from '../../src/extractor/playwright-extractor.js';
import type {
  DiscoveredImage,
  DiscoveredSvg,
  DiscoveredFavicon,
} from '../../src/extractor/types.js';

/**
 * Helper: creates a mock Playwright Page with a fake evaluate().
 * collectAssets() calls page.evaluate(callback) and returns its result.
 */
function mockPage(evaluateResult: {
  images: DiscoveredImage[];
  svgs: DiscoveredSvg[];
  favicons: DiscoveredFavicon[];
}) {
  return {
    evaluate: vi.fn().mockResolvedValue(evaluateResult),
  } as any;
}

describe('collectAssets', () => {
  // ── Images ──

  it('returns images from the DOM', async () => {
    const page = mockPage({
      images: [
        { url: 'https://example.com/hero.jpg', alt: 'Hero banner' },
        { url: 'https://example.com/logo.png' },
      ],
      svgs: [],
      favicons: [],
    });
    const result = await collectAssets(page);
    expect(result.images).toHaveLength(2);
    expect(result.images[0].url).toBe('https://example.com/hero.jpg');
    expect(result.images[0].alt).toBe('Hero banner');
    expect(result.images[1].url).toBe('https://example.com/logo.png');
    expect(result.images[1].alt).toBeUndefined();
  });

  it('returns empty images array when no images found', async () => {
    const page = mockPage({ images: [], svgs: [], favicons: [] });
    const result = await collectAssets(page);
    expect(result.images).toEqual([]);
  });

  it('preserves image URLs with query parameters', async () => {
    const page = mockPage({
      images: [{ url: 'https://cdn.example.com/img.jpg?w=800&q=90', alt: 'CDN image' }],
      svgs: [],
      favicons: [],
    });
    const result = await collectAssets(page);
    expect(result.images[0].url).toBe('https://cdn.example.com/img.jpg?w=800&q=90');
  });

  // ── SVGs ──

  it('returns inline SVGs from the DOM', async () => {
    const page = mockPage({
      images: [],
      svgs: [
        {
          kind: 'inline',
          markup: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>',
          existingId: 'logo',
          sourceElement: 'svg#logo.logo-icon',
        },
      ],
      favicons: [],
    });
    const result = await collectAssets(page);
    expect(result.svgs).toHaveLength(1);
    expect(result.svgs[0].kind).toBe('inline');
    expect(result.svgs[0].markup).toContain('<circle');
    expect(result.svgs[0].existingId).toBe('logo');
  });

  it('returns external SVGs (img[src$=".svg"])', async () => {
    const page = mockPage({
      images: [],
      svgs: [
        { kind: 'external', url: 'https://example.com/icons/star.svg' },
        { kind: 'external', url: 'https://example.com/icons/star.svg?v=2' },
      ],
      favicons: [],
    });
    const result = await collectAssets(page);
    expect(result.svgs).toHaveLength(2);
    expect(result.svgs[0].kind).toBe('external');
    expect(result.svgs[0].url).toBe('https://example.com/icons/star.svg');
    expect(result.svgs[1].url).toBe('https://example.com/icons/star.svg?v=2');
  });

  it('handles SVGs with no id or class', async () => {
    const page = mockPage({
      images: [],
      svgs: [
        {
          kind: 'inline',
          markup: '<svg viewBox="0 0 50 50"><rect width="50" height="50"/></svg>',
          existingId: undefined,
          sourceElement: 'svg',
        },
      ],
      favicons: [],
    });
    const result = await collectAssets(page);
    expect(result.svgs[0].existingId).toBeUndefined();
    expect(result.svgs[0].sourceElement).toBe('svg');
  });

  // ── Favicons ──

  it('returns favicons from <link rel="icon">', async () => {
    const page = mockPage({
      images: [],
      svgs: [],
      favicons: [
        { url: 'https://example.com/favicon.ico', kind: 'icon' },
        { url: 'https://example.com/favicon-32x32.png', kind: 'icon', sizes: '32x32', type: 'image/png' },
      ],
    });
    const result = await collectAssets(page);
    expect(result.favicons).toHaveLength(2);
    expect(result.favicons[0].kind).toBe('icon');
    expect(result.favicons[0].url).toBe('https://example.com/favicon.ico');
    expect(result.favicons[1].sizes).toBe('32x32');
    expect(result.favicons[1].type).toBe('image/png');
  });

  it('returns apple-touch-icon favicons', async () => {
    const page = mockPage({
      images: [],
      svgs: [],
      favicons: [
        { url: 'https://example.com/apple-touch-icon.png', kind: 'apple-touch-icon', sizes: '180x180' },
      ],
    });
    const result = await collectAssets(page);
    expect(result.favicons[0].kind).toBe('apple-touch-icon');
    expect(result.favicons[0].sizes).toBe('180x180');
  });

  it('returns shortcut icon favicons', async () => {
    const page = mockPage({
      images: [],
      svgs: [],
      favicons: [{ url: 'https://example.com/favicon.ico', kind: 'shortcut-icon' }],
    });
    const result = await collectAssets(page);
    expect(result.favicons[0].kind).toBe('shortcut-icon');
  });

  it('returns manifest icons', async () => {
    const page = mockPage({
      images: [],
      svgs: [],
      favicons: [{ url: 'https://example.com/site.webmanifest', kind: 'manifest-icon' }],
    });
    const result = await collectAssets(page);
    expect(result.favicons[0].kind).toBe('manifest-icon');
  });

  // ── OG / Twitter meta ──

  it('returns og:image from meta tags', async () => {
    const page = mockPage({
      images: [],
      svgs: [],
      favicons: [
        { url: 'https://example.com/og-image.jpg', kind: 'og-image' },
        { url: 'https://example.com/og-secure.jpg', kind: 'og-image-secure' },
      ],
    });
    const result = await collectAssets(page);
    expect(result.favicons).toHaveLength(2);
    expect(result.favicons[0].kind).toBe('og-image');
    expect(result.favicons[1].kind).toBe('og-image-secure');
  });

  it('returns twitter:image from meta tags', async () => {
    const page = mockPage({
      images: [],
      svgs: [],
      favicons: [{ url: 'https://example.com/twitter-card.jpg', kind: 'twitter-image' }],
    });
    const result = await collectAssets(page);
    expect(result.favicons[0].kind).toBe('twitter-image');
  });

  // ── Mixed assets ──

  it('returns all three categories simultaneously', async () => {
    const page = mockPage({
      images: [
        { url: 'https://example.com/a.jpg' },
        { url: 'https://example.com/b.png', alt: 'B' },
      ],
      svgs: [
        { kind: 'inline', markup: '<svg>...</svg>', existingId: 'icon1', sourceElement: 'svg#icon1' },
        { kind: 'external', url: 'https://example.com/logo.svg' },
      ],
      favicons: [
        { url: 'https://example.com/favicon.ico', kind: 'icon' },
        { url: 'https://example.com/og.jpg', kind: 'og-image' },
      ],
    });
    const result = await collectAssets(page);
    expect(result.images).toHaveLength(2);
    expect(result.svgs).toHaveLength(2);
    expect(result.favicons).toHaveLength(2);
  });

  // ── Empty / no assets ──

  it('returns empty arrays when DOM has no assets', async () => {
    const page = mockPage({ images: [], svgs: [], favicons: [] });
    const result = await collectAssets(page);
    expect(result.images).toEqual([]);
    expect(result.svgs).toEqual([]);
    expect(result.favicons).toEqual([]);
  });

  // ── Type safety ──

  it('returns correctly typed result shape', async () => {
    const page = mockPage({
      images: [{ url: 'https://example.com/x.jpg' }],
      svgs: [{ kind: 'inline', markup: '<svg/>', sourceElement: 'svg' }],
      favicons: [{ url: 'https://example.com/f.ico', kind: 'icon' }],
    });
    const result = await collectAssets(page);
    expect(result).toHaveProperty('images');
    expect(result).toHaveProperty('svgs');
    expect(result).toHaveProperty('favicons');
    expect(Array.isArray(result.images)).toBe(true);
    expect(Array.isArray(result.svgs)).toBe(true);
    expect(Array.isArray(result.favicons)).toBe(true);
  });

  // ── Edge cases ──

  it('handles favicons without optional sizes/type', async () => {
    const page = mockPage({
      images: [],
      svgs: [],
      favicons: [
        { url: 'https://example.com/favicon.ico', kind: 'icon' },
        { url: 'https://example.com/apple-touch-icon.png', kind: 'apple-touch-icon' },
      ],
    });
    const result = await collectAssets(page);
    expect(result.favicons[0].sizes).toBeUndefined();
    expect(result.favicons[0].type).toBeUndefined();
    expect(result.favicons[1].sizes).toBeUndefined();
  });

  it('handles images with empty alt text', async () => {
    const page = mockPage({
      images: [{ url: 'https://example.com/spacer.gif', alt: '' }],
      svgs: [],
      favicons: [],
    });
    const result = await collectAssets(page);
    expect(result.images[0].alt).toBe('');
  });

  it('handles a large number of assets without issues', async () => {
    const images: DiscoveredImage[] = Array.from({ length: 200 }, (_, i) => ({
      url: `https://example.com/gallery/img_${String(i).padStart(4, '0')}.jpg`,
      alt: `Image ${i}`,
    }));
    const page = mockPage({ images, svgs: [], favicons: [] });
    const result = await collectAssets(page);
    expect(result.images).toHaveLength(200);
  });
});

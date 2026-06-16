import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  extractFontFilename,
  sanitizeFilename,
  isFontFileUrl,
  downloadFonts,
} from '../../src/scraper/font-downloader.js';

function tmpDir(): string {
  return join(
    tmpdir(),
    'clone-v3-font-test-' + Math.random().toString(36).slice(2, 10),
  );
}

describe('font-downloader: extractFontFilename', () => {
  it('extracts filename from gstatic woff2', () => {
    expect(
      extractFontFilename(
        'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7.woff2',
      ),
    ).toMatch(/\.woff2$/);
  });

  it('derives filename when URL has no extension', () => {
    const fn = extractFontFilename('https://fonts.gstatic.com/s/inter/v12/');
    expect(fn).toMatch(/\.woff2$/);
  });

  it('strips query string from filename', () => {
    expect(
      extractFontFilename('https://example.com/inter.woff2?v=1.0'),
    ).toBe('inter.woff2');
  });
});

describe('font-downloader: sanitizeFilename', () => {
  it('removes / \\ : * ? " < > |', () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
  });
  it('collapses multiple underscores', () => {
    expect(sanitizeFilename('a___b')).toBe('a_b');
  });
  it('returns "font" for empty', () => {
    expect(sanitizeFilename('')).toBe('font');
    expect(sanitizeFilename('////')).toBe('font');
  });
});

describe('font-downloader: isFontFileUrl', () => {
  it('rejects google-fonts-css', () => {
    expect(
      isFontFileUrl(
        'https://fonts.googleapis.com/css?family=Inter',
        'google-fonts-css',
      ),
    ).toBe(false);
  });
  it('accepts woff2 from intercept type', () => {
    expect(
      isFontFileUrl(
        'https://fonts.gstatic.com/s/inter.woff2',
        'woff2',
      ),
    ).toBe(true);
  });
  it('accepts unknown if extension recognizable', () => {
    expect(isFontFileUrl('https://x.com/a.woff2', 'unknown')).toBe(true);
    expect(isFontFileUrl('https://x.com/a.bin', 'unknown')).toBe(false);
  });
});

describe('font-downloader: downloadFonts (skip-fallback)', () => {
  it('skips google-fonts-css and unknown urls', async () => {
    const dir = tmpDir();
    const result = await downloadFonts(
      [
        { url: 'https://fonts.googleapis.com/css?family=Inter', type: 'google-fonts-css' },
        { url: 'https://x.com/asset', type: 'unknown' },
      ],
      { hostname: 'example.com', outputRoot: dir },
    );
    expect(Object.keys(result.manifest)).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('honours allowedFormats filter', async () => {
    const dir = tmpDir();
    const result = await downloadFonts(
      [{ url: 'https://x.com/inter.ttf', type: 'truetype' }],
      { hostname: 'example.com', outputRoot: dir, allowedFormats: ['woff2'] },
    );
    expect(Object.keys(result.manifest)).toHaveLength(0);
    expect(result.errors[0].reason).toContain('format_not_allowed');
  });
});

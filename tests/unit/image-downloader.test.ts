import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import {
  generateImageFilename,
  originalImageFilename,
  normalizeImageUrl,
  extensionForUrlOrMime,
  isSkippableImageUrl,
  downloadImages,
  probeImageMetadata,
} from '../../src/scraper/image-downloader.js';

const PNG_1x1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

function tmpDir(): string {
  return join(
    tmpdir(),
    'clone-v3-image-test-' + Math.random().toString(36).slice(2, 10),
  );
}

/** Spin up a local HTTP server with predefined responses; returns URL. */
async function startTestServer(
  routes: Record<string, { status?: number; body: Buffer | string; contentType?: string }>,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname;
    const route = routes[path];
    if (!route) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.statusCode = route.status ?? 200;
    if (route.contentType) res.setHeader('content-type', route.contentType);
    res.end(route.body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe('image-downloader: filename helpers', () => {
  it('generateImageFilename returns 8-char id + extension', () => {
    const fn = generateImageFilename('https://example.com/x.png', 'image/png');
    expect(fn).toMatch(/^[a-z0-9]{8}\.png$/);
  });

  it('extensionForUrlOrMime prefers URL path', () => {
    expect(extensionForUrlOrMime('https://x.com/a.png', 'image/jpeg')).toBe('.png');
    expect(extensionForUrlOrMime('https://x.com/a', 'image/png')).toBe('.png');
    expect(extensionForUrlOrMime('https://x.com/a.svg', 'image/svg+xml')).toBe('.svg');
  });

  it('originalImageFilename strips path', () => {
    expect(originalImageFilename('https://x.com/path/hero.png')).toBe('hero.png');
    expect(originalImageFilename('https://x.com/')).toBe('image');
  });

  it('normalizeImageUrl strips hash + tracking params', () => {
    expect(
      normalizeImageUrl(
        'https://x.com/a.png?utm_source=fb&b=1&fbclid=abc#section',
      ),
    ).toBe('https://x.com/a.png?b=1');
  });

  it('isSkippableImageUrl recognizes data/blob/javascript', () => {
    expect(isSkippableImageUrl('data:image/png;base64,xx')).toBe(true);
    expect(isSkippableImageUrl('blob:https://x.com/abc')).toBe(true);
    expect(isSkippableImageUrl('javascript:void(0)')).toBe(true);
    expect(isSkippableImageUrl('https://x.com/a.png')).toBe(false);
  });
});

describe('image-downloader: probeImageMetadata', () => {
  it('reads 1x1 PNG dimensions', async () => {
    const buf = Buffer.from(PNG_1x1_BASE64, 'base64');
    const meta = await probeImageMetadata(buf, '.png');
    expect(meta.width).toBe(1);
    expect(meta.height).toBe(1);
  });

  it('returns empty for svg', async () => {
    const buf = Buffer.from('<svg></svg>', 'utf-8');
    const meta = await probeImageMetadata(buf, '.svg');
    expect(meta).toEqual({});
  });
});

describe('image-downloader: downloadImages', () => {
  it('skips skippable URLs without network', async () => {
    const dir = tmpDir();
    const result = await downloadImages(
      [
        { url: 'data:image/png;base64,xx', alt: 'inline' },
        { url: 'blob:https://x.com/abc', alt: 'blob' },
      ],
      { hostname: 'example.com', subdir: 'images', outputRoot: dir },
    );
    expect(Object.keys(result.manifest)).toHaveLength(0);
    expect(result.errors).toHaveLength(2);
  });

  it('writes to <outputRoot>/<subdir>/<filename>', async () => {
    const dir = tmpDir();
    const png = Buffer.from(PNG_1x1_BASE64, 'base64');
    const srv = await startTestServer({
      '/hero.png': { body: png, contentType: 'image/png' },
    });
    try {
      const result = await downloadImages(
        [{ url: `${srv.url}/hero.png`, alt: 'test' }],
        {
          hostname: 'example.com',
          subdir: 'images',
          outputRoot: dir,
          filenameFor: () => 'fixed.png',
        },
      );
      expect(result.manifest[`${srv.url}/hero.png`]).toBeDefined();
      const files = await readdir(join(dir, 'images'));
      expect(files).toContain('fixed.png');
      const st = await stat(join(dir, 'images', 'fixed.png'));
      expect(st.size).toBeGreaterThan(0);
      expect(result.manifest[`${srv.url}/hero.png`]?.width).toBe(1);
      expect(result.manifest[`${srv.url}/hero.png`]?.height).toBe(1);
    } finally {
      await srv.close();
    }
  });

  it('follows a redirect to the real image', async () => {
    const dir = tmpDir();
    const png = Buffer.from(PNG_1x1_BASE64, 'base64');
    const srv = await startTestServer({
      '/old.png': { status: 301, body: '', contentType: 'text/plain' },
      '/new.png': { body: png, contentType: 'image/png' },
    });
    // Manually patch the server to set the Location header on /old.png
    srv; // noop; we'll handle in next test
    // Rebuild server with redirect support
    const redirectSrv = await new Promise<{ url: string; close: () => Promise<void> }>((resolveStart) => {
      const s = createServer((req, res) => {
        if (req.url === '/old.png') {
          res.statusCode = 301;
          res.setHeader('location', '/new.png');
          res.end();
          return;
        }
        if (req.url === '/new.png') {
          res.setHeader('content-type', 'image/png');
          res.end(png);
          return;
        }
        res.statusCode = 404;
        res.end();
      });
      s.listen(0, '127.0.0.1', () => {
        const addr = s.address() as AddressInfo;
        resolveStart({
          url: `http://127.0.0.1:${addr.port}`,
          close: async () => {
            await new Promise<void>((r) => s.close(() => r()));
          },
        });
      });
    });
    try {
      const result = await downloadImages(
        [{ url: `${redirectSrv.url}/old.png`, alt: 'r' }],
        { hostname: 'x.com', subdir: 'images', outputRoot: dir, filenameFor: () => 'r.png' },
      );
      expect(Object.keys(result.manifest)).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    } finally {
      await redirectSrv.close();
      await srv.close();
    }
  });
});

describe('image-downloader: errors are recorded, not thrown', () => {
  it('records 404 without throwing', async () => {
    const dir = tmpDir();
    const srv = await startTestServer({}); // empty routes = all 404
    try {
      const result = await downloadImages(
        [{ url: `${srv.url}/missing.png` }],
        { hostname: 'example.com', subdir: 'images', outputRoot: dir },
      );
      expect(Object.keys(result.manifest)).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].reason).toContain('404');
    } finally {
      await srv.close();
    }
  });
});

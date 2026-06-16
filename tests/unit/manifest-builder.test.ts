import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFile } from 'node:fs/promises';
import {
  buildAssetManifest,
  buildAndWriteManifest,
  summarizeManifest,
  assetsRootFor,
  isValidSubdir,
  ASSETS_SUBDIRS,
} from '../../src/scraper/manifest-builder.js';

function tmpDir(): string {
  return join(
    tmpdir(),
    'clone-v3-manifest-test-' + Math.random().toString(36).slice(2, 10),
  );
}

describe('manifest-builder: buildAssetManifest (pure)', () => {
  it('counts entries + errors correctly', () => {
    const m = buildAssetManifest({
      hostname: 'x.com',
      url: 'https://x.com',
      images: {
        manifest: { 'a': { local_path: 'images/a.png', mime: 'image/png', filesize: 1, downloaded_at: 'now' } },
        errors: [{ url: 'b', reason: '404' }],
      },
      fonts: {
        manifest: {
          'c': { local_path: 'fonts/c.woff2', family: 'Inter', weight: 400, style: 'normal', filesize: 1, downloaded_at: 'now', original_name: 'c.woff2', format: 'woff2' },
        },
        errors: [],
      },
    });
    expect(m.counts.images).toBe(1);
    expect(m.counts.fonts).toBe(1);
    expect(m.counts.svgs).toBe(0);
    expect(m.counts.errors).toBe(1);
    expect(m.hostname).toBe('x.com');
  });

  it('handles missing sections as empty', () => {
    const m = buildAssetManifest({ hostname: 'y.com', url: 'https://y.com' });
    expect(m.counts).toEqual({ images: 0, fonts: 0, svgs: 0, favicons: 0, errors: 0 });
  });
});

describe('manifest-builder: buildAndWriteManifest', () => {
  it('writes valid JSON to <outputDir>/manifest.json', async () => {
    const dir = tmpDir();
    const { manifest, path } = await buildAndWriteManifest(
      { hostname: 'z.com', url: 'https://z.com' },
      dir,
    );
    expect(manifest.hostname).toBe('z.com');
    const raw = await readFile(path, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.hostname).toBe('z.com');
  });
});

describe('manifest-builder: summarizeManifest', () => {
  it('prints a multi-line summary', () => {
    const m = buildAssetManifest({ hostname: 'a.com', url: 'https://a.com' });
    const s = summarizeManifest(m);
    expect(s).toContain('a.com');
    expect(s).toContain('images:');
    expect(s).toContain('fonts:');
  });
});

describe('manifest-builder: helpers', () => {
  it('assetsRootFor returns research/assets', () => {
    // Use platform-agnostic path (path.join uses platform separator)
    const expected = join('/tmp/research/example.com', 'assets');
    expect(assetsRootFor('/tmp/research/example.com')).toBe(expected);
  });
  it('isValidSubdir accepts only known names', () => {
    expect(isValidSubdir('images')).toBe(true);
    expect(isValidSubdir('seo')).toBe(true);
    expect(isValidSubdir('xyz')).toBe(false);
  });
  it('ASSETS_SUBDIRS exposes the canonical list', () => {
    expect(ASSETS_SUBDIRS).toEqual(['images', 'fonts', 'svgs', 'seo']);
  });
});

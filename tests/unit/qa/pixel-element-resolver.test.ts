import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  buildPixelElementResolver,
  type V3PageData,
} from '../../../src/qa/pixel-element-resolver.js';
import type { Issue } from '../../../src/qa/issue-detector.js';

const makeIssue = (y: number, x: number = 100, height: number = 50, width: number = 200): Issue => ({
  type: 'color-mismatch',
  severity: 'medium',
  region: { x, y, width, height },
  diffPixels: 100,
  description: 'test',
  suggestedFix: 'test',
});

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixel-resolver-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writePageData(data: V3PageData): Promise<string> {
  const filePath = path.join(tmpDir, 'page-v3.json');
  await fs.writeFile(filePath, JSON.stringify(data), 'utf-8');
  return filePath;
}

describe('buildPixelElementResolver', () => {
  it('returns empty resolver when pageData file does not exist', async () => {
    const resolver = await buildPixelElementResolver({
      pageDataPath: path.join(tmpDir, 'nonexistent.json'),
    });
    expect(resolver.resolve(makeIssue(100))).toBeNull();
  });

  it('returns empty resolver when content array is empty', async () => {
    const filePath = await writePageData({ content: [] });
    const resolver = await buildPixelElementResolver({ pageDataPath: filePath });
    expect(resolver.resolve(makeIssue(100))).toBeNull();
  });

  it('resolves a region to the section covering its y-center', async () => {
    const filePath = await writePageData({
      content: [
        {
          id: 'sec-1',
          elType: 'section',
          settings: { _min_height: { size: 400, unit: 'px' } },
        },
        {
          id: 'sec-2',
          elType: 'section',
          settings: { _min_height: { size: 600, unit: 'px' } },
        },
      ],
    });
    const resolver = await buildPixelElementResolver({
      pageDataPath: filePath,
      defaultSectionHeightPx: 600,
    });

    expect(resolver.resolve(makeIssue(100))?.sectionId).toBe('sec-1');
    expect(resolver.resolve(makeIssue(450))?.sectionId).toBe('sec-2');
    expect(resolver.resolve(makeIssue(1000))).toBeNull();
  });

  it('uses defaultSectionHeightPx when section has no _min_height', async () => {
    const filePath = await writePageData({
      content: [
        { id: 'sec-default', elType: 'section' },
      ],
    });
    const resolver = await buildPixelElementResolver({
      pageDataPath: filePath,
      defaultSectionHeightPx: 800,
    });
    expect(resolver.resolve(makeIssue(400))?.sectionId).toBe('sec-default');
    expect(resolver.resolve(makeIssue(850))).toBeNull();
  });

  it('exposes colorIdLookup when provided', async () => {
    const filePath = await writePageData({ content: [] });
    const lookup = (hex: string) => `id-${hex}`;
    const resolver = await buildPixelElementResolver({
      pageDataPath: filePath,
    });
    const withLookup = new (resolver.constructor as any)([], new Map(), lookup);
    expect(withLookup.colorIdLookup?.('#ff0000')).toBe('id-#ff0000');
  });
});

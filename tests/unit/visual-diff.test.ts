import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';

function makePng(width: number, height: number, fillR = 255, fillG = 255, fillB = 255): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = fillR;
    png.data[i + 1] = fillG;
    png.data[i + 2] = fillB;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { diffScreenshots, classifyMatch } from '../../src/qa/visual-diff.js';

describe('visual-diff', () => {
  let tmpDir: string;
  let origPath: string;
  let clonePath: string;

  it('computes 100% match for identical images', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vdiff-'));
    origPath = path.join(tmpDir, 'a.png');
    clonePath = path.join(tmpDir, 'b.png');
    const img = makePng(100, 100, 50, 100, 150);
    await fs.writeFile(origPath, img);
    await fs.writeFile(clonePath, img);

    const r = await diffScreenshots({ originalPath: origPath, clonePath });
    expect(r.diffPixels).toBe(0);
    expect(r.diffPercent).toBe(0);
    expect(r.matchPercent).toBe(100);
  });

  it('detects pixel differences', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vdiff-'));
    origPath = path.join(tmpDir, 'a.png');
    clonePath = path.join(tmpDir, 'b.png');
    await fs.writeFile(origPath, makePng(100, 100, 0, 0, 0));
    await fs.writeFile(clonePath, makePng(100, 100, 255, 255, 255));
    const r = await diffScreenshots({ originalPath: origPath, clonePath });
    expect(r.diffPixels).toBe(10_000);
    expect(r.diffPercent).toBe(100);
  });

  it('handles different sizes (100% mismatch)', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vdiff-'));
    origPath = path.join(tmpDir, 'a.png');
    clonePath = path.join(tmpDir, 'b.png');
    await fs.writeFile(origPath, makePng(100, 100));
    await fs.writeFile(clonePath, makePng(50, 50));
    const r = await diffScreenshots({ originalPath: origPath, clonePath });
    expect(r.diffPercent).toBe(100);
  });

  it('classifies match as excellent for >=95%', () => {
    expect(classifyMatch(96)).toBe('excellent');
    expect(classifyMatch(95.1)).toBe('excellent');
  });

  it('classifies match as good for 85-94.99%', () => {
    expect(classifyMatch(90)).toBe('good');
    expect(classifyMatch(85.5)).toBe('good');
  });

  it('classifies match as fair for 70-84.99%', () => {
    expect(classifyMatch(75)).toBe('fair');
    expect(classifyMatch(80)).toBe('fair');
  });

  it('classifies match as poor for <70%', () => {
    expect(classifyMatch(50)).toBe('poor');
    expect(classifyMatch(0)).toBe('poor');
  });
});

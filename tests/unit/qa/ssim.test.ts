import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { computeSsim, classifySsim } from '../../../src/qa/ssim.js';
import { createTempDir, writePngFile, cleanup } from './helpers.js';

describe('computeSsim', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await createTempDir('ssim-test-');
  });
  afterEach(async () => {
    await cleanup(dir);
  });

  it('returns mssim ~1.0 for identical images', async () => {
    const original = await writePngFile(dir, 'orig.png', 64, 64, () => [128, 64, 200, 255]);
    const clone = await writePngFile(dir, 'clone.png', 64, 64, () => [128, 64, 200, 255]);
    const result = await computeSsim({ originalPath: original.path, clonePath: clone.path });
    expect(result.mssim).toBeGreaterThan(0.99);
    expect(result.matchPercent).toBeGreaterThan(99);
    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
  });

  it('returns lower mssim for different images', async () => {
    const original = await writePngFile(dir, 'orig.png', 64, 64, () => [0, 0, 0, 255]);
    const clone = await writePngFile(dir, 'clone.png', 64, 64, () => [255, 255, 255, 255]);
    const result = await computeSsim({ originalPath: original.path, clonePath: clone.path });
    expect(result.mssim).toBeLessThan(0.5);
    expect(result.matchPercent).toBeLessThan(50);
  });

  it('handles different dimensions by cropping to min size', async () => {
    const original = await writePngFile(dir, 'orig.png', 64, 64, () => [100, 100, 100, 255]);
    const clone = await writePngFile(dir, 'clone.png', 100, 100, () => [100, 100, 100, 255]);
    const result = await computeSsim({ originalPath: original.path, clonePath: clone.path });
    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
    expect(result.mssim).toBeGreaterThan(0.99);
  });

  it('returns matchPercent in 0-100 range for various inputs', async () => {
    const original = await writePngFile(dir, 'orig.png', 32, 32, () => [50, 50, 50, 255]);
    const clone = await writePngFile(dir, 'clone.png', 32, 32, (x, y) =>
      x < 16 ? [50, 50, 50, 255] : [150, 150, 150, 255],
    );
    const result = await computeSsim({ originalPath: original.path, clonePath: clone.path });
    expect(result.matchPercent).toBeGreaterThanOrEqual(0);
    expect(result.matchPercent).toBeLessThanOrEqual(100);
  });

  it('includes computedAt ISO timestamp', async () => {
    const original = await writePngFile(dir, 'orig.png', 32, 32);
    const clone = await writePngFile(dir, 'clone.png', 32, 32);
    const result = await computeSsim({ originalPath: original.path, clonePath: clone.path });
    expect(result.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('echoes input paths in result', async () => {
    const original = await writePngFile(dir, 'orig.png', 32, 32);
    const clone = await writePngFile(dir, 'clone.png', 32, 32);
    const result = await computeSsim({ originalPath: original.path, clonePath: clone.path });
    expect(result.originalPath).toBe(path.resolve(original.path));
    expect(result.clonePath).toBe(path.resolve(clone.path));
  });
});

describe('classifySsim', () => {
  it('95-100% = near-identical', () => {
    expect(classifySsim(100)).toBe('near-identical');
    expect(classifySsim(99)).toBe('near-identical');
    expect(classifySsim(97)).toBe('near-identical');
    expect(classifySsim(95)).toBe('near-identical');
  });

  it('85-94% = similar', () => {
    expect(classifySsim(94)).toBe('similar');
    expect(classifySsim(90)).toBe('similar');
    expect(classifySsim(85)).toBe('similar');
  });

  it('70-84% = different', () => {
    expect(classifySsim(84)).toBe('different');
    expect(classifySsim(75)).toBe('different');
    expect(classifySsim(70)).toBe('different');
  });

  it('<70% = mismatch', () => {
    expect(classifySsim(69)).toBe('mismatch');
    expect(classifySsim(0)).toBe('mismatch');
  });
});

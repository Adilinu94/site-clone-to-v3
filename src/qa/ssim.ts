import { promises as fs } from 'node:fs';
import { PNG } from 'pngjs';
import ssim from 'ssim.js';

export interface SsimOptions {
  originalPath: string;
  clonePath: string;
}

export interface SsimResult {
  originalPath: string;
  clonePath: string;
  width: number;
  height: number;
  mssim: number;
  matchPercent: number;
  computedAt: string;
}

export async function computeSsim(options: SsimOptions): Promise<SsimResult> {
  const original = PNG.sync.read(await fs.readFile(options.originalPath));
  const clone = PNG.sync.read(await fs.readFile(options.clonePath));

  if (original.width === 0 || original.height === 0 || clone.width === 0 || clone.height === 0) {
    return {
      originalPath: options.originalPath,
      clonePath: options.clonePath,
      width: Math.min(original.width, clone.width),
      height: Math.min(original.height, clone.height),
      mssim: 0,
      matchPercent: 0,
      computedAt: new Date().toISOString(),
    };
  }

  const width = Math.min(original.width, clone.width);
  const height = Math.min(original.height, clone.height);

  if (original.width !== clone.width || original.height !== clone.height) {
    const cropOriginal = cropPng(original, 0, 0, width, height);
    const cropClone = cropPng(clone, 0, 0, width, height);
    return runSsim(cropOriginal, cropClone, options, width, height);
  }

  return runSsim(original, clone, options, width, height);
}

function runSsim(
  original: PNG,
  clone: PNG,
  options: SsimOptions,
  width: number,
  height: number,
): SsimResult {
  const a = toImageData(original);
  const b = toImageData(clone);
  const result = ssim(a, b);
  const matchPercent = Math.max(0, Math.min(100, result.mssim * 100));
  return {
    originalPath: options.originalPath,
    clonePath: options.clonePath,
    width,
    height,
    mssim: result.mssim,
    matchPercent,
    computedAt: new Date().toISOString(),
  };
}

function toImageData(png: PNG): { data: Uint8ClampedArray; width: number; height: number } {
  return {
    data: new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.byteLength),
    width: png.width,
    height: png.height,
  };
}

function cropPng(png: PNG, x: number, y: number, w: number, h: number): PNG {
  const out = new PNG({ width: w, height: h });
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const srcIdx = ((y + row) * png.width + (x + col)) * 4;
      const dstIdx = (row * w + col) * 4;
      out.data[dstIdx] = png.data[srcIdx];
      out.data[dstIdx + 1] = png.data[srcIdx + 1];
      out.data[dstIdx + 2] = png.data[srcIdx + 2];
      out.data[dstIdx + 3] = png.data[srcIdx + 3];
    }
  }
  return out;
}

export function classifySsim(percent: number): 'near-identical' | 'similar' | 'different' | 'mismatch' {
  if (percent >= 95) return 'near-identical';
  if (percent >= 85) return 'similar';
  if (percent >= 70) return 'different';
  return 'mismatch';
}

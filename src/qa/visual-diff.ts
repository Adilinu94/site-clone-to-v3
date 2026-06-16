import { promises as fs } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export interface DiffOptions {
  originalPath: string;
  clonePath: string;
  outputDiffPath?: string;
  threshold?: number;
  includeAntiAliasing?: boolean;
}

export interface DiffResult {
  originalPath: string;
  clonePath: string;
  width: number;
  height: number;
  totalPixels: number;
  diffPixels: number;
  diffPercent: number;
  matchPercent: number;
  diffPath?: string;
  computedAt: string;
}

const DEFAULT_THRESHOLD = 0.1;

export async function diffScreenshots(
  options: DiffOptions,
): Promise<DiffResult> {
  const original = PNG.sync.read(await fs.readFile(options.originalPath));
  const clone = PNG.sync.read(await fs.readFile(options.clonePath));

  if (original.width !== clone.width || original.height !== clone.height) {
    return {
      originalPath: options.originalPath,
      clonePath: options.clonePath,
      width: Math.min(original.width, clone.width),
      height: Math.min(original.height, clone.height),
      totalPixels: Math.min(original.width, clone.width) * Math.min(original.height, clone.height),
      diffPixels: Math.min(original.width, clone.width) * Math.min(original.height, clone.height),
      diffPercent: 100,
      matchPercent: 0,
      computedAt: new Date().toISOString(),
    };
  }

  const { width, height } = original;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(
    original.data,
    clone.data,
    diff.data,
    width,
    height,
    {
      threshold: options.threshold ?? DEFAULT_THRESHOLD,
      includeAA: options.includeAntiAliasing ?? false,
    },
  );

  if (options.outputDiffPath) {
    await fs.mkdir(require('node:path').dirname(options.outputDiffPath), { recursive: true });
    await fs.writeFile(options.outputDiffPath, PNG.sync.write(diff));
  }

  const totalPixels = width * height;
  const diffPercent = (diffPixels / totalPixels) * 100;
  return {
    originalPath: options.originalPath,
    clonePath: options.clonePath,
    width,
    height,
    totalPixels,
    diffPixels,
    diffPercent,
    matchPercent: 100 - diffPercent,
    diffPath: options.outputDiffPath,
    computedAt: new Date().toISOString(),
  };
}

export function classifyMatch(percent: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (percent >= 95) return 'excellent';
  if (percent >= 85) return 'good';
  if (percent >= 70) return 'fair';
  return 'poor';
}

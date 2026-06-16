import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';

export interface SyntheticPng {
  buffer: Buffer;
  width: number;
  height: number;
  path: string;
}

export async function createTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export function makePng(width: number, height: number, fill?: (x: number, y: number) => [number, number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const px = fill ? fill(x, y) : [255, 255, 255, 255];
      png.data[idx] = px[0];
      png.data[idx + 1] = px[1];
      png.data[idx + 2] = px[2];
      png.data[idx + 3] = px[3];
    }
  }
  return PNG.sync.write(png);
}

export async function writePngFile(dir: string, name: string, width: number, height: number, fill?: (x: number, y: number) => [number, number, number, number]): Promise<SyntheticPng> {
  const buffer = makePng(width, height, fill);
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, buffer);
  return { buffer, width, height, path: filePath };
}

export async function cleanup(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

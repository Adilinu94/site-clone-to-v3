import { chromium, type Browser, type Page } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface CaptureOptions {
  url: string;
  outputPath: string;
  viewport?: { width: number; height: number };
  fullPage?: boolean;
  waitForSelector?: string;
  waitMs?: number;
}

export interface CaptureResult {
  url: string;
  outputPath: string;
  width: number;
  height: number;
  bytes: number;
  capturedAt: string;
}

const DEFAULT_VIEWPORT = { width: 1440, height: 900 };

export async function captureScreenshot(
  options: CaptureOptions,
): Promise<CaptureResult> {
  const browser: Browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: options.viewport ?? DEFAULT_VIEWPORT,
    });
    const page: Page = await context.newPage();
    await page.goto(options.url, { waitUntil: 'networkidle', timeout: 60_000 });
    if (options.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, { timeout: 30_000 });
    }
    if (options.waitMs) {
      await new Promise((resolve) => setTimeout(resolve, options.waitMs));
    }
    const buffer = await page.screenshot({ fullPage: options.fullPage ?? true });
    await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
    await fs.writeFile(options.outputPath, buffer);

    return {
      url: options.url,
      outputPath: options.outputPath,
      width: options.viewport?.width ?? DEFAULT_VIEWPORT.width,
      height: options.viewport?.height ?? DEFAULT_VIEWPORT.height,
      bytes: buffer.length,
      capturedAt: new Date().toISOString(),
    };
  } finally {
    await browser.close();
  }
}

export async function captureOriginalAndClone(
  originalUrl: string,
  cloneUrl: string,
  outputDir: string,
): Promise<{ original: CaptureResult; clone: CaptureResult }> {
  const original = await captureScreenshot({
    url: originalUrl,
    outputPath: path.join(outputDir, 'original.png'),
    fullPage: true,
  });
  const clone = await captureScreenshot({
    url: cloneUrl,
    outputPath: path.join(outputDir, 'clone.png'),
    fullPage: true,
  });
  return { original, clone };
}

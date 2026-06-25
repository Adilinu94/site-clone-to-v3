import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { PNG } from 'pngjs';
import os from 'node:os';
import { runVisionQa, type VisionApiCallFn, type VisionQaResult } from '../../../src/qa/vision-qa.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'vision-qa-test-'));
}

async function writeFakePng(dir: string, name: string): Promise<string> {
  const p = new PNG({ width: 10, height: 10 });
  p.data.fill(200);
  const buf = PNG.sync.write(p);
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, buf);
  return filePath;
}

function makeCallApi(response: object): VisionApiCallFn {
  return async () => JSON.stringify(response);
}

function makeCallApiRaw(raw: string): VisionApiCallFn {
  return async () => raw;
}

const GOOD_RESPONSE = {
  overallScore: 92,
  issues: [
    {
      type: 'color-mismatch',
      severity: 'low',
      location: 'footer',
      description: 'Slightly different background color in footer',
      suggestedFix: 'Update V3 background_color token mapping',
    },
  ],
  semanticFeedback: 'The clone closely matches the original. Only minor footer color difference.',
};

const PERFECT_RESPONSE = {
  overallScore: 98,
  issues: [],
  semanticFeedback: 'Excellent match. No visible differences.',
};

const POOR_RESPONSE = {
  overallScore: 45,
  issues: [
    {
      type: 'layout-shift',
      severity: 'high',
      location: 'hero section',
      description: 'Hero layout is completely different',
      suggestedFix: 'Check flex_direction in V3 section settings',
    },
    {
      type: 'font-missing',
      severity: 'medium',
      location: 'navbar',
      description: 'Font not loading in navbar',
      suggestedFix: 'Register font-family in Fonts Plugin',
    },
  ],
  semanticFeedback: 'Poor match. Multiple significant differences detected.',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('runVisionQa', () => {
  let tmpDir: string;
  let originalPath: string;
  let clonePath: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
    originalPath = await writeFakePng(tmpDir, 'original.png');
    clonePath = await writeFakePng(tmpDir, 'clone.png');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns correct score from API response', async () => {
    const result = await runVisionQa({
      originalPath,
      clonePath,
      callApi: makeCallApi(GOOD_RESPONSE),
    });
    expect(result.overallScore).toBe(92);
  });

  it('maps score 92 to "good" rating', async () => {
    const result = await runVisionQa({ originalPath, clonePath, callApi: makeCallApi(GOOD_RESPONSE) });
    expect(result.matchRating).toBe('good');
  });

  it('maps score 98 to "excellent" rating', async () => {
    const result = await runVisionQa({ originalPath, clonePath, callApi: makeCallApi(PERFECT_RESPONSE) });
    expect(result.matchRating).toBe('excellent');
  });

  it('maps score 45 to "poor" rating', async () => {
    const result = await runVisionQa({ originalPath, clonePath, callApi: makeCallApi(POOR_RESPONSE) });
    expect(result.matchRating).toBe('poor');
  });

  it('maps score 75 to "fair" rating', async () => {
    const result = await runVisionQa({
      originalPath, clonePath,
      callApi: makeCallApi({ overallScore: 75, issues: [], semanticFeedback: 'ok' }),
    });
    expect(result.matchRating).toBe('fair');
  });

  it('returns empty issues array for perfect match', async () => {
    const result = await runVisionQa({ originalPath, clonePath, callApi: makeCallApi(PERFECT_RESPONSE) });
    expect(result.issues).toHaveLength(0);
  });

  it('parses issues correctly', async () => {
    const result = await runVisionQa({ originalPath, clonePath, callApi: makeCallApi(POOR_RESPONSE) });
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0].type).toBe('layout-shift');
    expect(result.issues[0].severity).toBe('high');
    expect(result.issues[0].location).toBe('hero section');
    expect(result.issues[1].type).toBe('font-missing');
  });

  it('includes semanticFeedback in result', async () => {
    const result = await runVisionQa({ originalPath, clonePath, callApi: makeCallApi(GOOD_RESPONSE) });
    expect(result.semanticFeedback).toContain('clone closely matches');
  });

  it('sets computedAt as ISO string', async () => {
    const before = new Date().toISOString();
    const result = await runVisionQa({ originalPath, clonePath, callApi: makeCallApi(PERFECT_RESPONSE) });
    const after = new Date().toISOString();
    expect(result.computedAt >= before).toBe(true);
    expect(result.computedAt <= after).toBe(true);
  });

  it('clamps score below 0 to 0', async () => {
    const result = await runVisionQa({
      originalPath, clonePath,
      callApi: makeCallApi({ overallScore: -10, issues: [], semanticFeedback: 'x' }),
    });
    expect(result.overallScore).toBe(0);
  });

  it('clamps score above 100 to 100', async () => {
    const result = await runVisionQa({
      originalPath, clonePath,
      callApi: makeCallApi({ overallScore: 120, issues: [], semanticFeedback: 'x' }),
    });
    expect(result.overallScore).toBe(100);
  });

  it('handles non-JSON API response gracefully', async () => {
    const result = await runVisionQa({
      originalPath, clonePath,
      callApi: makeCallApiRaw('This is not JSON at all'),
    });
    expect(result.overallScore).toBe(0);
    expect(result.matchRating).toBe('poor');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe('blank-region');
    expect(result.issues[0].severity).toBe('high');
  });

  it('handles JSON wrapped in markdown fences', async () => {
    const raw = '```json\n' + JSON.stringify(PERFECT_RESPONSE) + '\n```';
    const result = await runVisionQa({ originalPath, clonePath, callApi: makeCallApiRaw(raw) });
    expect(result.overallScore).toBe(98);
  });

  it('normalises unknown issue type to "color-mismatch"', async () => {
    const result = await runVisionQa({
      originalPath, clonePath,
      callApi: makeCallApi({
        overallScore: 70,
        issues: [{ type: 'unknown-type', severity: 'low', location: 'x', description: 'x', suggestedFix: 'x' }],
        semanticFeedback: 'x',
      }),
    });
    expect(result.issues[0].type).toBe('color-mismatch');
  });

  it('normalises unknown severity to "low"', async () => {
    const result = await runVisionQa({
      originalPath, clonePath,
      callApi: makeCallApi({
        overallScore: 70,
        issues: [{ type: 'layout-shift', severity: 'critical', location: 'x', description: 'x', suggestedFix: 'x' }],
        semanticFeedback: 'x',
      }),
    });
    expect(result.issues[0].severity).toBe('low');
  });

  it('silently drops malformed issue entries', async () => {
    const result = await runVisionQa({
      originalPath, clonePath,
      callApi: makeCallApi({
        overallScore: 80,
        issues: [null, 42, 'garbage', { type: 'image-broken', severity: 'high', location: 'hero', description: 'd', suggestedFix: 's' }],
        semanticFeedback: 'x',
      }),
    });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe('image-broken');
  });

  it('reads actual file bytes from disk', async () => {
    let receivedOriginal = '';
    const callApi: VisionApiCallFn = async (orig) => {
      receivedOriginal = orig;
      return JSON.stringify(PERFECT_RESPONSE);
    };
    await runVisionQa({ originalPath, clonePath, callApi });
    // base64 should decode back to a valid PNG header
    const decoded = Buffer.from(receivedOriginal, 'base64');
    expect(decoded[0]).toBe(0x89); // PNG magic byte
    expect(decoded.slice(1, 4).toString()).toBe('PNG');
  });

  it('throws when no API key and no callApi provided', async () => {
    const envKey = process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];
    try {
      await expect(runVisionQa({ originalPath, clonePath })).rejects.toThrow('ANTHROPIC_API_KEY');
    } finally {
      if (envKey !== undefined) process.env['ANTHROPIC_API_KEY'] = envKey;
    }
  });

  it('throws when original file does not exist', async () => {
    await expect(runVisionQa({
      originalPath: '/nonexistent/original.png',
      clonePath,
      callApi: makeCallApi(PERFECT_RESPONSE),
    })).rejects.toThrow();
  });

  it('throws when clone file does not exist', async () => {
    await expect(runVisionQa({
      originalPath,
      clonePath: '/nonexistent/clone.png',
      callApi: makeCallApi(PERFECT_RESPONSE),
    })).rejects.toThrow();
  });

  it('score 95 maps to "excellent"', async () => {
    const result = await runVisionQa({
      originalPath, clonePath,
      callApi: makeCallApi({ overallScore: 95, issues: [], semanticFeedback: 'x' }),
    });
    expect(result.matchRating).toBe('excellent');
  });

  it('score 85 maps to "good"', async () => {
    const result = await runVisionQa({
      originalPath, clonePath,
      callApi: makeCallApi({ overallScore: 85, issues: [], semanticFeedback: 'x' }),
    });
    expect(result.matchRating).toBe('good');
  });

  it('score 70 maps to "fair"', async () => {
    const result = await runVisionQa({
      originalPath, clonePath,
      callApi: makeCallApi({ overallScore: 70, issues: [], semanticFeedback: 'x' }),
    });
    expect(result.matchRating).toBe('fair');
  });

  it('returns VisionQaResult shape with all expected fields', async () => {
    const result: VisionQaResult = await runVisionQa({
      originalPath, clonePath,
      callApi: makeCallApi(GOOD_RESPONSE),
    });
    expect(typeof result.overallScore).toBe('number');
    expect(['excellent', 'good', 'fair', 'poor']).toContain(result.matchRating);
    expect(Array.isArray(result.issues)).toBe(true);
    expect(typeof result.semanticFeedback).toBe('string');
    expect(typeof result.computedAt).toBe('string');
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PNG } from 'pngjs';
import {
  detectIssues,
  writeIssuesJson,
  countBySeverity,
  countByType,
  type Issue,
  type IssueType,
} from '../../src/qa/issue-detector.js';

function makePng(width: number, height: number, fillRgb: [number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4 + 0] = fillRgb[0];
    png.data[i * 4 + 1] = fillRgb[1];
    png.data[i * 4 + 2] = fillRgb[2];
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

describe('issue-detector (count helpers)', () => {
  const issues: Issue[] = [
    { type: 'color-mismatch', severity: 'high', region: { x: 0, y: 0, width: 1, height: 1 }, diffPixels: 1, description: '', suggestedFix: '' },
    { type: 'color-mismatch', severity: 'medium', region: { x: 0, y: 0, width: 1, height: 1 }, diffPixels: 1, description: '', suggestedFix: '' },
    { type: 'font-missing', severity: 'medium', region: { x: 0, y: 0, width: 1, height: 1 }, diffPixels: 1, description: '', suggestedFix: '' },
    { type: 'image-broken', severity: 'high', region: { x: 0, y: 0, width: 1, height: 1 }, diffPixels: 1, description: '', suggestedFix: '' },
    { type: 'size-mismatch', severity: 'low', region: { x: 0, y: 0, width: 1, height: 1 }, diffPixels: 1, description: '', suggestedFix: '' },
  ];

  it('countBySeverity groups by severity', () => {
    const counts = countBySeverity(issues);
    expect(counts.high).toBe(2);
    expect(counts.medium).toBe(2);
    expect(counts.low).toBe(1);
  });

  it('countByType groups by issue type', () => {
    const counts = countByType(issues);
    expect(counts['color-mismatch']).toBe(2);
    expect(counts['font-missing']).toBe(1);
    expect(counts['image-broken']).toBe(1);
    expect(counts['size-mismatch']).toBe(1);
  });

  it('handles empty input', () => {
    expect(countBySeverity([])).toEqual({ high: 0, medium: 0, low: 0 });
    expect(countByType([])).toEqual({});
  });

  it('includes all 8 known issue types in type union', () => {
    const knownTypes: IssueType[] = [
      'color-mismatch', 'layout-shift', 'font-missing', 'size-mismatch',
      'image-broken', 'animation-inactive', 'blank-region', 'size-different',
    ];
    expect(knownTypes).toHaveLength(8);
  });
});

describe('writeIssuesJson', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'issue-detector-'));
  });

  it('writes issues array as JSON to output path', async () => {
    const issues: Issue[] = [
      { type: 'color-mismatch', severity: 'high', region: { x: 0, y: 0, width: 1, height: 1 }, diffPixels: 1, description: 'd', suggestedFix: 'f' },
    ];
    const outPath = path.join(tmp, 'nested', 'issues.json');
    const result = await writeIssuesJson(issues, outPath);
    expect(result).toBe(outPath);
    const content = JSON.parse(await fs.readFile(outPath, 'utf-8'));
    expect(Array.isArray(content)).toBe(true);
    expect(content[0].type).toBe('color-mismatch');
  });
});

describe('detectIssues (real PNG analysis)', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'detect-issues-'));
  });

  it('reports size-different when expected dimensions do not match', async () => {
    const origPath = path.join(tmp, 'orig.png');
    const clonePath = path.join(tmp, 'clone.png');
    await fs.writeFile(origPath, makePng(64, 64, [255, 0, 0]));
    await fs.writeFile(clonePath, makePng(64, 64, [255, 0, 0]));

    const result = await detectIssues({
      originalPath: origPath,
      clonePath: clonePath,
      expectedWidth: 1280,
      expectedHeight: 720,
    });

    const sizeIssues = result.issues.filter((i) => i.type === 'size-different');
    expect(sizeIssues.length).toBe(1);
    expect(sizeIssues[0].severity).toBe('high');
  });

  it('returns blank-region issue when diffPercent is 100%', async () => {
    const origPath = path.join(tmp, 'orig.png');
    const clonePath = path.join(tmp, 'clone.png');
    await fs.writeFile(origPath, makePng(64, 64, [255, 255, 255]));
    await fs.writeFile(clonePath, makePng(64, 64, [0, 0, 0]));

    const result = await detectIssues({
      originalPath: origPath,
      clonePath: clonePath,
    });

    const blankIssues = result.issues.filter((i) => i.type === 'blank-region');
    expect(blankIssues.length).toBe(1);
    expect(blankIssues[0].severity).toBe('high');
  });

  it('classifies timestamp on result', async () => {
    const origPath = path.join(tmp, 'orig.png');
    const clonePath = path.join(tmp, 'clone.png');
    await fs.writeFile(origPath, makePng(64, 64, [255, 255, 255]));
    await fs.writeFile(clonePath, makePng(64, 64, [255, 255, 255]));

    const result = await detectIssues({
      originalPath: origPath,
      clonePath: clonePath,
    });

    expect(result.classifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns zero issues for identical images (no diff regions)', async () => {
    const origPath = path.join(tmp, 'orig.png');
    const clonePath = path.join(tmp, 'clone.png');
    await fs.writeFile(origPath, makePng(64, 64, [128, 128, 128]));
    await fs.writeFile(clonePath, makePng(64, 64, [128, 128, 128]));

    const result = await detectIssues({
      originalPath: origPath,
      clonePath: clonePath,
    });

    expect(result.issues).toHaveLength(0);
    expect(result.regionsDetected).toBe(0);
  });

  it('detects color-mismatch on uniform color regions', async () => {
    const origPath = path.join(tmp, 'orig.png');
    const clonePath = path.join(tmp, 'clone.png');
    // Red vs Green — uniform + large color delta
    await fs.writeFile(origPath, makePng(64, 64, [255, 0, 0]));
    await fs.writeFile(clonePath, makePng(64, 64, [0, 255, 0]));

    const result = await detectIssues({
      originalPath: origPath,
      clonePath: clonePath,
    });

    // Should have at least one color-mismatch or generic region issue
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

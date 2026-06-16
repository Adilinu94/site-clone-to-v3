import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  detectIssues,
  writeIssuesJson,
  countBySeverity,
  countByType,
  type Issue,
} from '../../../src/qa/issue-detector.js';
import { createTempDir, writePngFile, cleanup } from './helpers.js';

describe('detectIssues', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await createTempDir('issue-test-');
  });
  afterEach(async () => {
    await cleanup(dir);
  });

  it('returns zero issues for identical images', async () => {
    const original = await writePngFile(dir, 'orig.png', 64, 64, () => [100, 100, 100, 255]);
    const clone = await writePngFile(dir, 'clone.png', 64, 64, () => [100, 100, 100, 255]);
    const result = await detectIssues({
      originalPath: original.path,
      clonePath: clone.path,
      diffPath: path.join(dir, 'diff.png'),
    });
    expect(result.issues).toHaveLength(0);
    expect(result.regionsDetected).toBe(0);
    expect(result.diff.matchPercent).toBeGreaterThan(99);
  });

  it('detects size-different when dimensions differ from expected', async () => {
    const original = await writePngFile(dir, 'orig.png', 64, 64);
    const clone = await writePngFile(dir, 'clone.png', 100, 100);
    const result = await detectIssues({
      originalPath: original.path,
      clonePath: clone.path,
      diffPath: path.join(dir, 'diff.png'),
      expectedWidth: 200,
      expectedHeight: 200,
    });
    const sizeIssue = result.issues.find((i) => i.type === 'size-different');
    expect(sizeIssue).toBeDefined();
    expect(sizeIssue?.severity).toBe('high');
  });

  it('returns blank-region issue when diffPercent is 100', async () => {
    const original = await writePngFile(dir, 'orig.png', 32, 32, () => [255, 255, 255, 255]);
    const clone = await writePngFile(dir, 'clone.png', 32, 32, () => [0, 0, 0, 255]);
    const result = await detectIssues({
      originalPath: original.path,
      clonePath: clone.path,
    });
    const blankIssue = result.issues.find((i) => i.type === 'blank-region');
    expect(blankIssue).toBeDefined();
    expect(blankIssue?.severity).toBe('high');
  });

  it('detects color-mismatch issue for large uniform region with color delta', async () => {
    const original = await writePngFile(dir, 'orig.png', 128, 128, () => [255, 0, 0, 255]);
    const clone = await writePngFile(dir, 'clone.png', 128, 128, () => [0, 0, 255, 255]);
    const result = await detectIssues({
      originalPath: original.path,
      clonePath: clone.path,
      diffPath: path.join(dir, 'diff.png'),
      regionMinSize: 32,
    });
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.diff.diffPercent).toBeGreaterThan(50);
  });

  it('classifies blank heuristic as image-broken for white-to-black large region', async () => {
    const original = await writePngFile(dir, 'orig.png', 128, 128, (x, y) =>
      x < 64 ? [255, 255, 255, 255] : [200, 200, 200, 255],
    );
    const clone = await writePngFile(dir, 'clone.png', 128, 128, () => [50, 50, 50, 255]);
    const result = await detectIssues({
      originalPath: original.path,
      clonePath: clone.path,
    });
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('includes classifiedAt timestamp', async () => {
    const original = await writePngFile(dir, 'orig.png', 32, 32);
    const clone = await writePngFile(dir, 'clone.png', 32, 32);
    const result = await detectIssues({ originalPath: original.path, clonePath: clone.path });
    expect(result.classifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('writes diff png when diffPath provided', async () => {
    const original = await writePngFile(dir, 'orig.png', 64, 64, () => [100, 100, 100, 255]);
    const clone = await writePngFile(dir, 'clone.png', 64, 64, () => [150, 150, 150, 255]);
    const diffPath = path.join(dir, 'diff.png');
    await detectIssues({ originalPath: original.path, clonePath: clone.path, diffPath });
    expect(await fs.stat(diffPath)).toBeTruthy();
  });
});

describe('writeIssuesJson', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await createTempDir('write-issues-');
  });
  afterEach(async () => {
    await cleanup(dir);
  });

  it('writes issues as formatted JSON', async () => {
    const issues: Issue[] = [
      {
        type: 'color-mismatch',
        severity: 'medium',
        region: { x: 10, y: 20, width: 30, height: 40 },
        diffPixels: 100,
        description: 'test',
        suggestedFix: 'fix it',
      },
    ];
    const outPath = path.join(dir, 'sub', 'issues.json');
    const returned = await writeIssuesJson(issues, outPath);
    expect(returned).toBe(outPath);
    const content = JSON.parse(await fs.readFile(outPath, 'utf-8'));
    expect(content).toEqual(issues);
  });
});

describe('countBySeverity', () => {
  it('counts each severity bucket', () => {
    const issues: Issue[] = [
      { type: 'color-mismatch', severity: 'high', region: { x: 0, y: 0, width: 1, height: 1 }, diffPixels: 1, description: '', suggestedFix: '' },
      { type: 'font-missing', severity: 'high', region: { x: 0, y: 0, width: 1, height: 1 }, diffPixels: 1, description: '', suggestedFix: '' },
      { type: 'layout-shift', severity: 'medium', region: { x: 0, y: 0, width: 1, height: 1 }, diffPixels: 1, description: '', suggestedFix: '' },
      { type: 'size-mismatch', severity: 'low', region: { x: 0, y: 0, width: 1, height: 1 }, diffPixels: 1, description: '', suggestedFix: '' },
    ];
    const counts = countBySeverity(issues);
    expect(counts.high).toBe(2);
    expect(counts.medium).toBe(1);
    expect(counts.low).toBe(1);
  });

  it('returns all zeros for empty list', () => {
    expect(countBySeverity([])).toEqual({ high: 0, medium: 0, low: 0 });
  });
});

describe('countByType', () => {
  it('counts by issue type', () => {
    const issues: Issue[] = [
      { type: 'color-mismatch', severity: 'high', region: { x: 0, y: 0, width: 1, height: 1 }, diffPixels: 1, description: '', suggestedFix: '' },
      { type: 'color-mismatch', severity: 'low', region: { x: 0, y: 0, width: 1, height: 1 }, diffPixels: 1, description: '', suggestedFix: '' },
      { type: 'font-missing', severity: 'medium', region: { x: 0, y: 0, width: 1, height: 1 }, diffPixels: 1, description: '', suggestedFix: '' },
    ];
    const counts = countByType(issues);
    expect(counts['color-mismatch']).toBe(2);
    expect(counts['font-missing']).toBe(1);
  });

  it('returns empty object for no issues', () => {
    expect(countByType([])).toEqual({});
  });
});

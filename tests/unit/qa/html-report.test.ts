import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { renderHtml, writeHtmlReport, escapeHtml } from '../../../src/qa/html-report.js';
import type { AutoFixReport } from '../../../src/qa/auto-fix.js';
import type { Issue } from '../../../src/qa/issue-detector.js';
import { createTempDir, cleanup } from './helpers.js';

const sampleIssue: Issue = {
  type: 'color-mismatch',
  severity: 'medium',
  region: { x: 10, y: 20, width: 100, height: 50 },
  diffPixels: 250,
  description: 'Color difference detected',
  suggestedFix: 'Update token mapping',
};

const sampleReport: AutoFixReport = {
  strictness: 'balanced',
  profile: {
    name: 'balanced',
    minMatchPercent: 85,
    maxRounds: 2,
    maxFixesPerRound: 5,
    severitiesToFix: ['high', 'medium'],
    label: 'Balanced',
    description: 'Balanced profile',
  },
  targetReached: false,
  totalRounds: 2,
  finalMatchPercent: 82.5,
  finalSsim: 85.3,
  initialMatchPercent: 60,
  initialSsim: 62,
  rounds: [
    {
      round: 1,
      issuesDetected: 5,
      issuesFixed: 3,
      issuesSkipped: 2,
      matchPercentBefore: 60,
      matchPercentAfter: 75,
      ssimBefore: 62,
      ssimAfter: 78,
      fixes: [
        { issue: sampleIssue, ok: true, message: 'Applied fix' },
      ],
      diffResult: {} as never,
      ssimResult: {} as never,
      detectionResult: {} as never,
      startedAt: '2026-06-16T10:00:00.000Z',
      finishedAt: '2026-06-16T10:00:05.000Z',
    },
  ],
  outstandingIssues: [sampleIssue],
  generatedAt: '2026-06-16T10:00:10.000Z',
  startedAt: '2026-06-16T10:00:00.000Z',
};

describe('renderHtml', () => {
  it('includes hostname, strictness and verdict', () => {
    const html = renderHtml({
      report: sampleReport,
      outputPath: '/tmp/x.html',
      hostname: 'example.com',
      strictnessLabel: 'Balanced',
    });
    expect(html).toContain('example.com');
    expect(html).toContain('balanced');
    expect(html).toContain('TARGET NOT REACHED');
  });

  it('shows TARGET REACHED when targetReached=true', () => {
    const html = renderHtml({
      report: { ...sampleReport, targetReached: true },
      outputPath: '/tmp/x.html',
      hostname: 'example.com',
      strictnessLabel: 'Balanced',
    });
    expect(html).toContain('TARGET REACHED');
  });

  it('renders metric values from report', () => {
    const html = renderHtml({
      report: sampleReport,
      outputPath: '/tmp/x.html',
      hostname: 'example.com',
      strictnessLabel: 'Balanced',
    });
    expect(html).toContain('82.50%');
    expect(html).toContain('85.30%');
    expect(html).toContain('60.00%');
  });

  it('renders outstanding issues section', () => {
    const html = renderHtml({
      report: sampleReport,
      outputPath: '/tmp/x.html',
      hostname: 'example.com',
      strictnessLabel: 'Balanced',
    });
    expect(html).toContain('Color Mismatch');
    expect(html).toContain('Color difference detected');
    expect(html).toContain('Update token mapping');
  });

  it('renders "No outstanding issues" when list is empty', () => {
    const html = renderHtml({
      report: { ...sampleReport, outstandingIssues: [], targetReached: true },
      outputPath: '/tmp/x.html',
      hostname: 'example.com',
      strictnessLabel: 'Balanced',
    });
    expect(html).toContain('No outstanding issues.');
  });

  it('embeds base64 screenshots when provided', () => {
    const html = renderHtml({
      report: sampleReport,
      outputPath: '/tmp/x.html',
      hostname: 'example.com',
      strictnessLabel: 'Balanced',
      originalScreenshotBase64: 'iVBORw0KGgo=',
      cloneScreenshotBase64: 'iVBORw0KGgo=',
      diffScreenshotBase64: 'iVBORw0KGgo=',
    });
    expect(html).toContain('data:image/png;base64,iVBORw0KGgo=');
    expect(html).toContain('Original');
    expect(html).toContain('Final Clone');
    expect(html).toContain('Diff');
  });

  it('renders round details', () => {
    const html = renderHtml({
      report: sampleReport,
      outputPath: '/tmp/x.html',
      hostname: 'example.com',
      strictnessLabel: 'Balanced',
    });
    expect(html).toContain('Round 1');
    expect(html).toContain('Detected: 5');
    expect(html).toContain('Fixed: 3');
    expect(html).toContain('Applied fix');
  });

  it('escapes HTML in hostname and messages', () => {
    const html = renderHtml({
      report: sampleReport,
      outputPath: '/tmp/x.html',
      hostname: '<script>alert(1)</script>',
      strictnessLabel: 'Balanced',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('falls back to report.strictness when options.strictness undefined', () => {
    const html = renderHtml({
      report: sampleReport,
      outputPath: '/tmp/x.html',
      hostname: 'example.com',
      strictnessLabel: 'Balanced',
    });
    expect(html).toContain('balanced');
  });
});

describe('escapeHtml', () => {
  it('escapes all HTML-dangerous characters', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });

  it('escapes full XSS payload', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
  });

  it('passes plain text through unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('writeHtmlReport', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await createTempDir('html-report-');
  });
  afterEach(async () => {
    await cleanup(dir);
  });

  it('writes rendered HTML to outputPath', async () => {
    const outputPath = path.join(dir, 'sub', 'report.html');
    const returned = await writeHtmlReport({
      report: sampleReport,
      outputPath,
      hostname: 'example.com',
      strictnessLabel: 'Balanced',
    });
    expect(returned).toBe(outputPath);
    const content = await fs.readFile(outputPath, 'utf-8');
    expect(content).toContain('<!doctype html>');
    expect(content).toContain('example.com');
  });

  it('creates parent directories as needed', async () => {
    const outputPath = path.join(dir, 'a', 'b', 'c', 'report.html');
    await writeHtmlReport({
      report: sampleReport,
      outputPath,
      hostname: 'example.com',
      strictnessLabel: 'Balanced',
    });
    expect(await fs.stat(outputPath)).toBeTruthy();
  });
});

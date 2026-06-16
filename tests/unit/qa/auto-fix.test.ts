import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  runAutoFix,
  summarizeReport,
  buildDefaultFixers,
  type AutoFixFixer,
  type AutoFixReport,
} from '../../../src/qa/auto-fix.js';
import { createTempDir, writePngFile, cleanup } from './helpers.js';

function makePixelPerfectCapture(stage: 'identical' | 'slightly-off' | 'very-off'): (
  originalUrl: string,
  cloneUrl: string,
  outputDir: string,
  label: string,
) => Promise<{
  capture: { outputPath: string; url: string; width: number; height: number; capturedAt: string };
  diff: {
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
  };
  ssim: {
    originalPath: string;
    clonePath: string;
    width: number;
    height: number;
    mssim: number;
    matchPercent: number;
    computedAt: string;
  };
}> {
  return async (originalUrl, cloneUrl, outputDir, label) => {
    const matchMap = { identical: 99, 'slightly-off': 80, 'very-off': 50 } as const;
    const match = matchMap[stage];
    const width = 64;
    const height = 64;
    const originalPath = path.join(outputDir, `original-${label}.png`);
    const clonePath = path.join(outputDir, `clone-${label}.png`);
    await writePngFile(outputDir, `original-${label}.png`, width, height, () => [240, 240, 240, 255]);
    await writePngFile(outputDir, `clone-${label}.png`, width, height, () =>
      match < 60 ? [20, 20, 20, 255] : [240, 240, 240, 255],
    );
    const diffPixels = Math.round(((100 - match) / 100) * width * height);
    const now = new Date().toISOString();
    return {
      capture: { outputPath: clonePath, url: cloneUrl, width, height, capturedAt: now },
      diff: {
        originalPath,
        clonePath,
        width,
        height,
        totalPixels: width * height,
        diffPixels,
        diffPercent: 100 - match,
        matchPercent: match,
        computedAt: now,
      },
      ssim: {
        originalPath,
        clonePath,
        width,
        height,
        mssim: match / 100,
        matchPercent: match,
        computedAt: now,
      },
    };
  };
}

describe('runAutoFix', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await createTempDir('autofix-');
  });
  afterEach(async () => {
    await cleanup(dir);
  });

  it('returns targetReached=true when initial capture already passes', async () => {
    const report = await runAutoFix({
      originalUrl: 'https://example.com',
      cloneUrl: 'https://clone.example.com',
      outputDir: dir,
      strictness: 'draft',
      fixers: [],
      captureAndDiff: makePixelPerfectCapture('identical'),
    });
    expect(report.targetReached).toBe(true);
    expect(report.totalRounds).toBe(0);
    expect(report.finalMatchPercent).toBeGreaterThanOrEqual(70);
    expect(report.outstandingIssues).toEqual([]);
  });

  it('runs rounds when initial capture below target', async () => {
    const report = await runAutoFix({
      originalUrl: 'https://example.com',
      cloneUrl: 'https://clone.example.com',
      outputDir: dir,
      strictness: 'draft',
      fixers: [],
      captureAndDiff: makePixelPerfectCapture('very-off'),
    });
    expect(report.totalRounds).toBeGreaterThanOrEqual(1);
    expect(report.totalRounds).toBeLessThanOrEqual(1);
    expect(report.finalMatchPercent).toBeLessThan(70);
  });

  it('respects maxRounds from profile', async () => {
    const report = await runAutoFix({
      originalUrl: 'https://example.com',
      cloneUrl: 'https://clone.example.com',
      outputDir: dir,
      strictness: 'pixel-perfect',
      fixers: [],
      captureAndDiff: makePixelPerfectCapture('very-off'),
    });
    expect(report.totalRounds).toBeLessThanOrEqual(report.profile.maxRounds);
    expect(report.profile.maxRounds).toBe(3);
  });

  it('writes auto-fix-report.json', async () => {
    await runAutoFix({
      originalUrl: 'https://example.com',
      cloneUrl: 'https://clone.example.com',
      outputDir: dir,
      strictness: 'balanced',
      fixers: [],
      captureAndDiff: makePixelPerfectCapture('slightly-off'),
    });
    const reportPath = path.join(dir, 'auto-fix-report.json');
    const content = await fs.readFile(reportPath, 'utf-8');
    const parsed = JSON.parse(content) as AutoFixReport;
    expect(parsed.strictness).toBe('balanced');
    expect(parsed.rounds).toBeDefined();
  });

  it('invokes onRoundComplete for each round', async () => {
    const rounds: number[] = [];
    await runAutoFix({
      originalUrl: 'https://example.com',
      cloneUrl: 'https://clone.example.com',
      outputDir: dir,
      strictness: 'pixel-perfect',
      fixers: [],
      captureAndDiff: makePixelPerfectCapture('very-off'),
      onRoundComplete: async (round) => {
        rounds.push(round.round);
      },
    });
    expect(rounds.length).toBeGreaterThanOrEqual(1);
    expect(rounds.length).toBeLessThanOrEqual(3);
  });

  it('invokes fixers when issues detected', async () => {
    let fixAttempts = 0;
    let capturedDetection: { issues: number; types: string[] } | null = null;
    const noopFixer: AutoFixFixer = {
      type: 'blank-region',
      name: 'noop-test',
      apply: async () => {
        fixAttempts++;
        return { ok: false, message: 'noop' };
      },
    };
    const report = await runAutoFix({
      originalUrl: 'https://example.com',
      cloneUrl: 'https://clone.example.com',
      outputDir: dir,
      strictness: 'pixel-perfect',
      fixers: [noopFixer],
      captureAndDiff: makePixelPerfectCapture('very-off'),
      onRoundComplete: async (r) => {
        capturedDetection = { issues: r.issuesDetected, types: r.detectionResult.issues.map((i) => i.type) };
      },
    });
    expect(report.rounds.length).toBeGreaterThan(0);
    expect(capturedDetection?.issues).toBeGreaterThan(0);
    expect(fixAttempts).toBeGreaterThan(0);
  });
});

describe('summarizeReport', () => {
  it('computes totals from rounds', () => {
    const report: AutoFixReport = {
      strictness: 'balanced',
      profile: {
        name: 'balanced',
        minMatchPercent: 85,
        maxRounds: 2,
        maxFixesPerRound: 5,
        severitiesToFix: ['high', 'medium'],
        label: 'Balanced',
        description: '',
      },
      targetReached: false,
      totalRounds: 2,
      finalMatchPercent: 80,
      finalSsim: 80,
      initialMatchPercent: 60,
      initialSsim: 60,
      rounds: [
        {
          round: 1,
          issuesDetected: 3,
          issuesFixed: 2,
          issuesSkipped: 1,
          matchPercentBefore: 60,
          matchPercentAfter: 70,
          ssimBefore: 60,
          ssimAfter: 70,
          fixes: [
            { issue: { type: 'color-mismatch', severity: 'high', region: { x: 0, y: 0, width: 1, height: 1 }, diffPixels: 1, description: '', suggestedFix: '' }, ok: true, message: 'ok' },
            { issue: { type: 'font-missing', severity: 'medium', region: { x: 0, y: 0, width: 1, height: 1 }, diffPixels: 1, description: '', suggestedFix: '' }, ok: true, message: 'ok' },
            { issue: { type: 'layout-shift', severity: 'low', region: { x: 0, y: 0, width: 1, height: 1 }, diffPixels: 1, description: '', suggestedFix: '' }, ok: false, message: 'fail' },
          ],
          diffResult: {} as never,
          ssimResult: {} as never,
          detectionResult: {} as never,
          startedAt: '',
          finishedAt: '',
        },
        {
          round: 2,
          issuesDetected: 2,
          issuesFixed: 1,
          issuesSkipped: 1,
          matchPercentBefore: 70,
          matchPercentAfter: 80,
          ssimBefore: 70,
          ssimAfter: 80,
          fixes: [
            { issue: { type: 'color-mismatch', severity: 'high', region: { x: 0, y: 0, width: 1, height: 1 }, diffPixels: 1, description: '', suggestedFix: '' }, ok: true, message: 'ok' },
            { issue: { type: 'font-missing', severity: 'medium', region: { x: 0, y: 0, width: 1, height: 1 }, diffPixels: 1, description: '', suggestedFix: '' }, ok: false, message: 'fail' },
          ],
          diffResult: {} as never,
          ssimResult: {} as never,
          detectionResult: {} as never,
          startedAt: '',
          finishedAt: '',
        },
      ],
      outstandingIssues: [
        { type: 'color-mismatch', severity: 'high', region: { x: 0, y: 0, width: 1, height: 1 }, diffPixels: 1, description: '', suggestedFix: '' },
      ],
      generatedAt: '',
      startedAt: '',
    };
    const summary = summarizeReport(report);
    expect(summary.totalFixes).toBe(3);
    expect(summary.failedFixes).toBe(2);
    expect(summary.roundsUsed).toBe(2);
    expect(summary.roundsAvailable).toBe(2);
    expect(summary.matchImprovement).toBe(20);
    expect(summary.issuesBySeverity.high).toBe(1);
  });
});

describe('buildDefaultFixers', () => {
  it('returns one fixer per issue type', () => {
    const fixers = buildDefaultFixers();
    expect(fixers.length).toBeGreaterThanOrEqual(6);
    const types = fixers.map((f) => f.type);
    expect(types).toContain('color-mismatch');
    expect(types).toContain('font-missing');
    expect(types).toContain('layout-shift');
    expect(types).toContain('image-broken');
    expect(types).toContain('size-mismatch');
    expect(types).toContain('animation-inactive');
  });

  it('all default fixers return ok=false (placeholders)', async () => {
    const fixers = buildDefaultFixers();
    for (const fixer of fixers) {
      const result = await fixer.apply({
        issue: { type: fixer.type, severity: 'high', region: { x: 0, y: 0, width: 1, height: 1 }, diffPixels: 1, description: '', suggestedFix: '' },
        round: 1,
        attempt: 1,
        previousAttempts: 0,
      });
      expect(result.ok).toBe(false);
      expect(result.message).toContain('requires');
    }
  });
});

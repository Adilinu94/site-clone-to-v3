import { describe, it, expect } from 'vitest';
import {
  PHASE8_ISSUE_TYPE_HINTS,
  ALL_ISSUE_TYPES,
  PHASE8_ISSUE_TYPE_COUNT,
  TOTAL_ISSUE_TYPE_COUNT,
  getIssueTypeHint,
  groupByCategory,
  type ExtendedIssueType,
} from '../../src/qa/phase8-issue-types.js';
import {
  batchIssuesByType,
  pickBatchesForRound,
  hasReachedTarget,
  runBatchedFix,
  countBatchedFixByType,
  type BatchedFixer,
  type IssueBatch,
} from '../../src/qa/phase8-batched-fix.js';
import {
  renderAndCapture,
  withTimeout,
  mockCapture,
  summarizeRenderResults,
  DEFAULT_PHASE8_RENDER_CONFIG,
  type Phase8RenderResult,
} from '../../src/qa/phase8-render-capture.js';
import type { Issue, IssueSeverity } from '../../src/qa/issue-detector.js';
import type { Strictness } from '../../src/qa/strictness.js';

function makeIssue(
  type: Issue['type'],
  overrides: Partial<Issue> = {},
): Issue {
  return {
    type,
    severity: 'medium',
    region: { x: 0, y: 0, width: 100, height: 100 },
    diffPixels: 50,
    description: `${type} issue`,
    suggestedFix: `Fix ${type}`,
    ...overrides,
  };
}

describe('Phase 8 — Issue-Type Catalog (28 total)', () => {
  it('has exactly 20 Phase-8 types', () => {
    expect(PHASE8_ISSUE_TYPE_COUNT).toBe(20);
  });

  it('has exactly 28 total types', () => {
    expect(TOTAL_ISSUE_TYPE_COUNT).toBe(28);
    expect(ALL_ISSUE_TYPES.length).toBe(28);
  });

  it('all 20 Phase-8 hints are defined', () => {
    const definedTypes = Object.keys(PHASE8_ISSUE_TYPE_HINTS);
    expect(definedTypes.length).toBe(20);
  });

  it('typography types belong to typography category', () => {
    const hint = getIssueTypeHint('line-height-mismatch');
    expect(hint?.category).toBe('typography');
  });

  it('typography and motion both have ssim threshold >= 0.92', () => {
    const typo = getIssueTypeHint('line-height-mismatch');
    const motion = getIssueTypeHint('animation-duration-mismatch');
    expect(typo?.ssimThreshold).toBeGreaterThanOrEqual(0.92);
    expect(motion?.ssimThreshold).toBeGreaterThanOrEqual(0.92);
  });

  it('contrast-violation has high severity', () => {
    const hint = getIssueTypeHint('contrast-violation');
    expect(hint?.defaultSeverity).toBe('high');
  });

  it('V1 types return sensible defaults via fallback', () => {
    const hint = getIssueTypeHint('color-mismatch');
    expect(hint?.type).toBe('color-mismatch');
    expect(hint?.defaultSeverity).toBe('medium');
  });

  it('unknown type returns sensible defaults', () => {
    const hint = getIssueTypeHint('totally-unknown' as ExtendedIssueType);
    expect(hint).not.toBeNull();
    expect(hint?.defaultSeverity).toBe('medium');
  });

  it('groups types by category correctly', () => {
    const groups = groupByCategory([
      'line-height-mismatch',
      'font-weight-mismatch',
      'contrast-violation',
      'flex-direction-changed',
      'pro-widget-degraded',
    ]);
    expect(groups.get('typography')?.length).toBe(2);
    expect(groups.get('color')?.length).toBe(1);
    expect(groups.get('layout')?.length).toBe(1);
    expect(groups.get('elementor')?.length).toBe(1);
  });

  it('suggested-fix template substitutes {selector}', () => {
    const hint = getIssueTypeHint('gap-mismatch');
    expect(hint?.suggestedFixTemplate).toContain('{selector}');
    const applied = hint!.suggestedFixTemplate.replace('{selector}', '.my-div');
    expect(applied).toContain('.my-div');
  });
});

describe('Phase 8 — Batched-Fix Scheduler', () => {
  function makeIssues(...types: Issue['type'][]): Issue[] {
    return types.map((t, i) => makeIssue(t, { region: { x: i * 10, y: 0, width: 100, height: 100 } }));
  }

  it('groups issues by type into batches', () => {
    const issues = makeIssues('line-height-mismatch', 'line-height-mismatch', 'gap-mismatch');
    const fixers: Partial<Record<ExtendedIssueType, BatchedFixer>> = {
      'line-height-mismatch': async () => ({ ok: true, message: 'fixed', fixedIssueIds: [] }),
      'gap-mismatch': async () => ({ ok: true, message: 'fixed', fixedIssueIds: [] }),
    };
    const batches = batchIssuesByType(issues, fixers);
    expect(batches.length).toBe(2);
    const lhBatch = batches.find((b) => b.type === 'line-height-mismatch');
    expect(lhBatch?.issues.length).toBe(2);
  });

  it('skips types without a fixer', () => {
    const issues = makeIssues('line-height-mismatch', 'contrast-violation');
    const fixers: Partial<Record<ExtendedIssueType, BatchedFixer>> = {
      'line-height-mismatch': async () => ({ ok: true, message: 'fixed', fixedIssueIds: [] }),
    };
    const batches = batchIssuesByType(issues, fixers);
    expect(batches.length).toBe(1);
    expect(batches[0]?.type).toBe('line-height-mismatch');
  });

  it('sorts batches by severity (high first)', () => {
    const issues = makeIssues('gap-mismatch', 'flex-direction-changed', 'line-height-mismatch');
    const fixers: Partial<Record<ExtendedIssueType, BatchedFixer>> = {
      'gap-mismatch': async () => ({ ok: true, message: '', fixedIssueIds: [] }),
      'flex-direction-changed': async () => ({ ok: true, message: '', fixedIssueIds: [] }),
      'line-height-mismatch': async () => ({ ok: true, message: '', fixedIssueIds: [] }),
    };
    const batches = batchIssuesByType(issues, fixers);
    expect(batches[0]?.hint.defaultSeverity).toBe('high');
    expect(batches[1]?.hint.defaultSeverity).toBe('low');
  });

  it('picks max 4 batches per round', () => {
    const batches: IssueBatch[] = [
      { type: 'line-height-mismatch', hint: PHASE8_ISSUE_TYPE_HINTS['line-height-mismatch'], issues: [] },
      { type: 'gap-mismatch', hint: PHASE8_ISSUE_TYPE_HINTS['gap-mismatch'], issues: [] },
      { type: 'padding-mismatch', hint: PHASE8_ISSUE_TYPE_HINTS['padding-mismatch'], issues: [] },
      { type: 'margin-mismatch', hint: PHASE8_ISSUE_TYPE_HINTS['margin-mismatch'], issues: [] },
      { type: 'flex-direction-changed', hint: PHASE8_ISSUE_TYPE_HINTS['flex-direction-changed'], issues: [] },
    ];
    const picked = pickBatchesForRound(batches, 4);
    expect(picked.length).toBe(4);
  });

  it('hasReachedTarget returns true when no high-severity issues remain', () => {
    const issues = makeIssues('gap-mismatch', 'line-height-mismatch');
    expect(hasReachedTarget(issues)).toBe(true);
  });

  it('hasReachedTarget returns false when high-severity issues remain', () => {
    const issues = [
      makeIssue('gap-mismatch', { severity: 'low' }),
      makeIssue('contrast-violation', { severity: 'high' }),
    ];
    expect(hasReachedTarget(issues)).toBe(false);
  });

  it('runs batched-fix loop until converged', async () => {
    const initialIssues = makeIssues('gap-mismatch', 'gap-mismatch', 'line-height-mismatch');
    const fixers: Partial<Record<ExtendedIssueType, BatchedFixer>> = {
      'gap-mismatch': async (batch) => ({
        ok: true,
        message: 'fixed gap',
        fixedIssueIds: batch.issues.map((i) => `${i.type}:${i.region.x}:${i.region.y}:${i.region.width}:${i.region.height}`),
      }),
      'line-height-mismatch': async (batch) => ({
        ok: true,
        message: 'fixed lh',
        fixedIssueIds: batch.issues.map((i) => `${i.type}:${i.region.x}:${i.region.y}:${i.region.width}:${i.region.height}`),
      }),
    };

    const report = await runBatchedFix({
      initialIssues,
      strictness: 'standard' as Strictness,
      fixers,
      maxRounds: 3,
    });

    expect(report.converged).toBe(true);
    expect(report.finalIssueCount).toBe(0);
    expect(report.totalRounds).toBe(1);
  });

  it('stops at maxRounds if not converged', async () => {
    const initialIssues = makeIssues('contrast-violation');
    const fixers: Partial<Record<ExtendedIssueType, BatchedFixer>> = {
      'contrast-violation': async () => ({ ok: false, message: 'cannot fix', fixedIssueIds: [] }),
    };

    const report = await runBatchedFix({
      initialIssues,
      strictness: 'standard' as Strictness,
      fixers,
      maxRounds: 2,
    });

    expect(report.totalRounds).toBeLessThanOrEqual(2);
    expect(report.finalIssueCount).toBe(1);
  });

  it('calls detectAfterRound when provided', async () => {
    let detectCalls = 0;
    const initialIssues = makeIssues('gap-mismatch');
    const fixers: Partial<Record<ExtendedIssueType, BatchedFixer>> = {
      'gap-mismatch': async (batch) => ({
        ok: true,
        message: 'fixed',
        fixedIssueIds: batch.issues.map((i) => `${i.type}:${i.region.x}:${i.region.y}:${i.region.width}:${i.region.height}`),
      }),
    };

    const report = await runBatchedFix({
      initialIssues,
      strictness: 'standard' as Strictness,
      fixers,
      detectAfterRound: async () => {
        detectCalls += 1;
        return [];
      },
    });

    expect(detectCalls).toBeGreaterThan(0);
    expect(report.converged).toBe(true);
  });

  it('handles fixer that throws gracefully', async () => {
    const initialIssues = makeIssues('gap-mismatch');
    const fixers: Partial<Record<ExtendedIssueType, BatchedFixer>> = {
      'gap-mismatch': async () => {
        throw new Error('explosion');
      },
    };

    const report = await runBatchedFix({
      initialIssues,
      strictness: 'standard' as Strictness,
      fixers,
      maxRounds: 1,
    });

    expect(report.rounds[0]?.batches[0]?.ok).toBe(false);
    expect(report.rounds[0]?.batches[0]?.message).toContain('explosion');
  });

  it('countBatchedFixByType aggregates per-type stats', async () => {
    const initialIssues = makeIssues('gap-mismatch', 'line-height-mismatch');
    const fixers: Partial<Record<ExtendedIssueType, BatchedFixer>> = {
      'gap-mismatch': async (batch) => ({
        ok: true,
        message: '',
        fixedIssueIds: batch.issues.map((i) => `${i.type}:${i.region.x}:${i.region.y}:${i.region.width}:${i.region.height}`),
      }),
      'line-height-mismatch': async (batch) => ({
        ok: true,
        message: '',
        fixedIssueIds: batch.issues.map((i) => `${i.type}:${i.region.x}:${i.region.y}:${i.region.width}:${i.region.height}`),
      }),
    };

    const report = await runBatchedFix({
      initialIssues,
      strictness: 'standard' as Strictness,
      fixers,
    });

    const counts = countBatchedFixByType(report);
    expect(counts.size).toBeGreaterThan(0);
  });
});

describe('Phase 8 — renderAndCapture (Timeout, Retry, Fallback)', () => {
  it('withTimeout resolves when promise resolves first', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000);
    expect(result).toBe('ok');
  });

  it('withTimeout rejects when timeout fires first', async () => {
    const slow = new Promise<string>((resolve) => {
      setTimeout(() => resolve('too-late'), 2000);
    });
    await expect(withTimeout(slow, 50)).rejects.toThrow(/timed out/);
  });

  it('returns capture on first successful attempt', async () => {
    const result = await renderAndCapture({
      url: 'http://test.local',
      outputPath: '/tmp/phase8-test-1.png',
      config: { timeoutMs: 1000, retries: 2, backoffMs: 10, fallback: 'mock' },
      captureImpl: async () => ({
        url: 'http://test.local',
        outputPath: '/tmp/phase8-test-1.png',
        width: 1440,
        height: 900,
        bytes: 100,
        capturedAt: new Date().toISOString(),
      }),
    });

    expect(result.attemptCount).toBe(1);
    expect(result.fallbackUsed).toBe(false);
  });

  it('retries on failure and eventually succeeds', async () => {
    let calls = 0;
    const result = await renderAndCapture({
      url: 'http://test.local',
      outputPath: '/tmp/phase8-test-2.png',
      config: { timeoutMs: 500, retries: 2, backoffMs: 10, fallback: 'mock' },
      captureImpl: async () => {
        calls += 1;
        if (calls < 3) throw new Error('flaky');
        return {
          url: 'http://test.local',
          outputPath: '/tmp/phase8-test-2.png',
          width: 1440,
          height: 900,
          bytes: 100,
          capturedAt: new Date().toISOString(),
        };
      },
    });

    expect(result.attemptCount).toBe(3);
    expect(result.fallbackUsed).toBe(false);
  });

  it('falls back to mock when all retries fail', async () => {
    const result = await renderAndCapture({
      url: 'http://test.local',
      outputPath: '/tmp/phase8-test-3.png',
      config: { timeoutMs: 100, retries: 1, backoffMs: 5, fallback: 'mock' },
      captureImpl: async () => {
        throw new Error('always fails');
      },
    });

    expect(result.fallbackUsed).toBe(true);
    expect(result.errorMessage).toContain('always fails');
    expect(result.capture.bytes).toBeGreaterThan(0);
  });

  it('throws last error when fallback=skip', async () => {
    await expect(
      renderAndCapture({
        url: 'http://test.local',
        outputPath: '/tmp/phase8-test-4.png',
        config: { timeoutMs: 100, retries: 1, backoffMs: 5, fallback: 'skip' },
        captureImpl: async () => {
          throw new Error('fatal');
        },
      }),
    ).rejects.toThrow(/fatal/);
  });

  it('respects timeoutMs via withTimeout', async () => {
    const result = await renderAndCapture({
      url: 'http://test.local',
      outputPath: '/tmp/phase8-test-5.png',
      config: { timeoutMs: 50, retries: 1, backoffMs: 5, fallback: 'mock' },
      captureImpl: async () => {
        await new Promise<void>((r) => setTimeout(r, 200));
        return {
          url: 'http://test.local',
          outputPath: '/tmp/phase8-test-5.png',
          width: 1440,
          height: 900,
          bytes: 100,
          capturedAt: new Date().toISOString(),
        };
      },
    });

    expect(result.fallbackUsed).toBe(true);
  });

  it('mockCapture produces valid PNG output', async () => {
    const result = await mockCapture('/tmp/phase8-mock.png');
    expect(result.outputPath).toBe('/tmp/phase8-mock.png');
    expect(result.width).toBe(1440);
    expect(result.height).toBe(900);
    expect(result.bytes).toBeGreaterThan(0);
  });

  it('default config is sensible (60s timeout, 2 retries, mock fallback)', () => {
    expect(DEFAULT_PHASE8_RENDER_CONFIG.timeoutMs).toBe(60_000);
    expect(DEFAULT_PHASE8_RENDER_CONFIG.retries).toBe(2);
    expect(DEFAULT_PHASE8_RENDER_CONFIG.fallback).toBe('mock');
  });

  it('summarizeRenderResults aggregates correctly', () => {
    const results: Phase8RenderResult[] = [
      { capture: {} as never, attemptCount: 1, fallbackUsed: false, durationMs: 100 },
      { capture: {} as never, attemptCount: 2, fallbackUsed: true, durationMs: 200 },
      { capture: {} as never, attemptCount: 1, fallbackUsed: false, durationMs: 300 },
    ];
    const summary = summarizeRenderResults(results);
    expect(summary.successfulFirstTry).toBe(2);
    expect(summary.fallbackUsed).toBe(1);
    expect(summary.totalAttempts).toBe(4);
    expect(summary.averageDurationMs).toBe(200);
  });
});
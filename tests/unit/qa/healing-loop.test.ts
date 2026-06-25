import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { PNG } from 'pngjs';
import os from 'node:os';
import { runHealingLoop, type HealingLoopReport, type CaptureFn } from '../../../src/qa/healing-loop.js';
import type { VisionApiCallFn } from '../../../src/qa/vision-qa.js';
import type { AutoFixFixer } from '../../../src/qa/auto-fix.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'healing-loop-test-'));
}

async function writeFakePng(dir: string, name: string): Promise<string> {
  const p = new PNG({ width: 10, height: 10 });
  p.data.fill(200);
  const buf = PNG.sync.write(p);
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, buf);
  return filePath;
}

function makeCallApi(score: number, issueCount = 0): VisionApiCallFn {
  return async () => JSON.stringify({
    overallScore: score,
    issues: Array.from({ length: issueCount }, (_, idx) => ({
      type: 'color-mismatch',
      severity: 'medium',
      location: `section-${idx}`,
      description: `Color diff in section ${idx}`,
      suggestedFix: 'Fix token mapping',
    })),
    semanticFeedback: `Score: ${score}`,
  });
}

/** callApi that returns increasing scores on each call */
function makeProgressingCallApi(scores: number[]): VisionApiCallFn {
  let call = 0;
  return async () => {
    const score = scores[Math.min(call++, scores.length - 1)];
    return JSON.stringify({ overallScore: score, issues: [], semanticFeedback: `call ${call}` });
  };
}

const noCaptureClone: CaptureFn = async (_url, outputPath) => outputPath;

function makeOkFixer(type: string): AutoFixFixer {
  return {
    type: type as AutoFixFixer['type'],
    name: `test-fixer-${type}`,
    apply: async () => ({ ok: true, message: 'fixed' }),
  };
}

function makeFailFixer(type: string): AutoFixFixer {
  return {
    type: type as AutoFixFixer['type'],
    name: `test-fixer-fail-${type}`,
    apply: async () => ({ ok: false, message: 'failed' }),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('runHealingLoop', () => {
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

  it('returns immediately if initial score >= target', async () => {
    const report = await runHealingLoop({
      originalPath, clonePath, outputDir: tmpDir,
      targetScore: 90, maxIterations: 3,
      callApi: makeCallApi(95),
      captureClone: noCaptureClone,
    });
    expect(report.targetReached).toBe(true);
    expect(report.totalIterations).toBe(0);
    expect(report.initialScore).toBe(95);
    expect(report.finalScore).toBe(95);
  });

  it('sets initialScore from first Vision QA', async () => {
    const report = await runHealingLoop({
      originalPath, clonePath, outputDir: tmpDir,
      targetScore: 95,
      callApi: makeCallApi(75),
      captureClone: noCaptureClone,
    });
    expect(report.initialScore).toBe(75);
  });

  it('runs iterations until target reached', async () => {
    const report = await runHealingLoop({
      originalPath, clonePath, outputDir: tmpDir,
      targetScore: 90, maxIterations: 5,
      callApi: makeProgressingCallApi([60, 80, 92]),
      captureClone: noCaptureClone,
    });
    expect(report.targetReached).toBe(true);
    expect(report.totalIterations).toBe(2);
    expect(report.finalScore).toBe(92);
  });

  it('stops at maxIterations even if target not reached', async () => {
    const report = await runHealingLoop({
      originalPath, clonePath, outputDir: tmpDir,
      targetScore: 99, maxIterations: 2,
      callApi: makeCallApi(50, 1),
      captureClone: noCaptureClone,
    });
    expect(report.targetReached).toBe(false);
    expect(report.totalIterations).toBe(2);
  });

  it('defaults to targetScore 90 and maxIterations 3', async () => {
    const report = await runHealingLoop({
      originalPath, clonePath, outputDir: tmpDir,
      callApi: makeCallApi(50),
      captureClone: noCaptureClone,
    });
    expect(report.targetScore).toBe(90);
    expect(report.totalIterations).toBeLessThanOrEqual(3);
  });

  it('writes healing-loop-report.json to outputDir', async () => {
    await runHealingLoop({
      originalPath, clonePath, outputDir: tmpDir,
      callApi: makeCallApi(95),
      captureClone: noCaptureClone,
    });
    const reportPath = path.join(tmpDir, 'healing-loop-report.json');
    const raw = await fs.readFile(reportPath, 'utf-8');
    const parsed = JSON.parse(raw) as HealingLoopReport;
    expect(parsed.finalScore).toBe(95);
  });

  it('calls onIterationComplete for each iteration', async () => {
    const calls: number[] = [];
    await runHealingLoop({
      originalPath, clonePath, outputDir: tmpDir,
      targetScore: 99, maxIterations: 3,
      callApi: makeCallApi(50),
      captureClone: noCaptureClone,
      onIterationComplete: (r) => { calls.push(r.iteration); },
    });
    expect(calls).toEqual([1, 2, 3]);
  });

  it('collects all vision results including initial', async () => {
    const report = await runHealingLoop({
      originalPath, clonePath, outputDir: tmpDir,
      targetScore: 99, maxIterations: 2,
      callApi: makeCallApi(50),
      captureClone: noCaptureClone,
    });
    // initial + 2 iterations = 3 vision results
    expect(report.visionResults).toHaveLength(3);
  });

  it('applies fixers matching issue types', async () => {
    let fixerCalled = false;
    const fixer = makeOkFixer('color-mismatch');
    const origApply = fixer.apply;
    fixer.apply = async (ctx) => {
      fixerCalled = true;
      return origApply(ctx);
    };

    await runHealingLoop({
      originalPath, clonePath, outputDir: tmpDir,
      targetScore: 99, maxIterations: 1,
      callApi: makeCallApi(50, 1), // 1 color-mismatch issue
      captureClone: noCaptureClone,
      fixers: [fixer],
    });
    expect(fixerCalled).toBe(true);
  });

  it('tracks fixesApplied and fixesSucceeded in iteration result', async () => {
    const report = await runHealingLoop({
      originalPath, clonePath, outputDir: tmpDir,
      targetScore: 99, maxIterations: 1,
      callApi: makeCallApi(50, 2), // 2 color-mismatch issues
      captureClone: noCaptureClone,
      fixers: [makeOkFixer('color-mismatch')],
    });
    const iter = report.iterations[0];
    expect(iter).toBeDefined();
    expect(iter!.fixesApplied).toBe(2);
    expect(iter!.fixesSucceeded).toBe(2);
  });

  it('counts failed fixes separately', async () => {
    const report = await runHealingLoop({
      originalPath, clonePath, outputDir: tmpDir,
      targetScore: 99, maxIterations: 1,
      callApi: makeCallApi(50, 1),
      captureClone: noCaptureClone,
      fixers: [makeFailFixer('color-mismatch')],
    });
    const iter = report.iterations[0];
    expect(iter).toBeDefined();
    expect(iter!.fixesApplied).toBe(1);
    expect(iter!.fixesSucceeded).toBe(0);
  });

  it('skips issues with no matching fixer', async () => {
    const report = await runHealingLoop({
      originalPath, clonePath, outputDir: tmpDir,
      targetScore: 99, maxIterations: 1,
      callApi: makeCallApi(50, 1), // color-mismatch issue
      captureClone: noCaptureClone,
      fixers: [makeOkFixer('font-missing')], // no color-mismatch fixer
    });
    const iter = report.iterations[0];
    expect(iter!.fixesApplied).toBe(0);
  });

  it('works without any fixers (monitor mode)', async () => {
    const report = await runHealingLoop({
      originalPath, clonePath, outputDir: tmpDir,
      targetScore: 99, maxIterations: 2,
      callApi: makeCallApi(60, 1),
      captureClone: noCaptureClone,
      fixers: [],
    });
    expect(report.totalIterations).toBe(2);
    expect(report.iterations[0]!.fixesApplied).toBe(0);
  });

  it('records scoreBefore and scoreAfter per iteration', async () => {
    const report = await runHealingLoop({
      originalPath, clonePath, outputDir: tmpDir,
      targetScore: 99, maxIterations: 1,
      callApi: makeProgressingCallApi([60, 80]),
      captureClone: noCaptureClone,
    });
    const iter = report.iterations[0]!;
    expect(iter.scoreBefore).toBe(60);
    expect(iter.scoreAfter).toBe(80);
  });

  it('records issueTypes from each iteration', async () => {
    const report = await runHealingLoop({
      originalPath, clonePath, outputDir: tmpDir,
      targetScore: 99, maxIterations: 1,
      callApi: makeCallApi(50, 1),
      captureClone: noCaptureClone,
    });
    expect(report.iterations[0]!.issueTypes).toContain('color-mismatch');
  });

  it('iteration result has valid ISO startedAt and finishedAt', async () => {
    const report = await runHealingLoop({
      originalPath, clonePath, outputDir: tmpDir,
      targetScore: 99, maxIterations: 1,
      callApi: makeCallApi(50),
      captureClone: noCaptureClone,
    });
    const iter = report.iterations[0]!;
    expect(() => new Date(iter.startedAt)).not.toThrow();
    expect(() => new Date(iter.finishedAt)).not.toThrow();
  });

  it('report has valid generatedAt and startedAt', async () => {
    const report = await runHealingLoop({
      originalPath, clonePath, outputDir: tmpDir,
      callApi: makeCallApi(95),
      captureClone: noCaptureClone,
    });
    expect(() => new Date(report.generatedAt)).not.toThrow();
    expect(() => new Date(report.startedAt)).not.toThrow();
  });

  it('uses captureClone to update clone path between iterations', async () => {
    const capturedPaths: string[] = [];
    const capture: CaptureFn = async (_url, outputPath) => {
      // write a tiny PNG so vision-qa can read it
      const p = new PNG({ width: 10, height: 10 });
      p.data.fill(100);
      await fs.writeFile(outputPath, PNG.sync.write(p));
      capturedPaths.push(outputPath);
      return outputPath;
    };

    await runHealingLoop({
      originalPath, clonePath, outputDir: tmpDir,
      cloneUrl: 'https://example.com',
      targetScore: 99, maxIterations: 2,
      callApi: makeCallApi(50),
      captureClone: capture,
    });
    expect(capturedPaths.length).toBeGreaterThan(0);
    expect(capturedPaths[0]).toContain('clone-iter-1.png');
  });
});

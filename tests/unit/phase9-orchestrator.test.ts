import { describe, it, expect, vi } from 'vitest';
import {
  reconcileState,
  runManagerWorkflow,
  flattenIterationResults,
  summarizeManagerWorkflow,
  DEFAULT_MANAGER_WORKFLOW_OPTIONS,
  STATE_RECONCILER_KIND,
  type SectionSnapshot,
  type SectionProcessor,
  type SectionProcessingResult,
} from '../../src/orchestrator/manager-workflow.js';
import {
  PHASE_ID,
  runStage,
  runPhase3Assembly,
  runPhase4Builder,
  runPhase5Qa,
  definePhasePipeline,
  createPerSectionProcessor,
  isPhaseSuccessful,
  getPhaseError,
  DEFAULT_PHASE_PIPELINE_OPTIONS,
  type StageResult,
  type StageHandler,
} from '../../src/orchestrator/phase-orchestrator.js';
import {
  buildRunReport,
  formatRunReport,
  getReportSummary,
  isRunReportComplete,
} from '../../src/orchestrator/run-report.js';

function makeSnapshot(sectionId: string, specVersion = 1): SectionSnapshot {
  return {
    sectionId,
    state: { specVersion, hash: `hash-${sectionId}`, updatedAt: Date.now() },
    dependencies: [],
  };
}

function makeOkResult(sectionId: string, hash = `hash-${sectionId}`): SectionProcessingResult {
  return {
    sectionId,
    ok: true,
    newState: { specVersion: 2, hash, updatedAt: Date.now() },
    outputHash: `output-${sectionId}`,
    warnings: [],
    errors: [],
  };
}

describe('Phase 9 — manager-workflow.reconcileState', () => {
  it('returns INITIAL kind when no previous results', () => {
    const decision = reconcileState([], [], { iteration: 0, maxIterations: 4 });
    expect(decision.kind).toBe(STATE_RECONCILER_KIND.INITIAL);
    expect(decision.driftedSections).toEqual([]);
    expect(decision.nextIteration).toBe(1);
  });

  it('returns CONVERGED when no drift', () => {
    const a = makeOkResult('a', 'h1');
    const decision = reconcileState([a], [a], { iteration: 1, maxIterations: 4 });
    expect(decision.kind).toBe(STATE_RECONCILER_KIND.CONVERGED);
  });

  it('detects hash drift', () => {
    const prev = makeOkResult('a', 'h1');
    const next = makeOkResult('a', 'h2');
    const decision = reconcileState([prev], [next], { iteration: 1, maxIterations: 4 });
    expect(decision.kind).toBe(STATE_RECONCILER_KIND.DRIFT);
    expect(decision.driftedSections).toEqual(['a']);
  });

  it('detects ok-flag flip', () => {
    const prev = makeOkResult('a', 'h1');
    const next: SectionProcessingResult = { ...prev, ok: false, errors: ['boom'] };
    const decision = reconcileState([prev], [next], { iteration: 1, maxIterations: 4 });
    expect(decision.kind).toBe(STATE_RECONCILER_KIND.DRIFT);
  });

  it('converges at max-iterations even with drift', () => {
    const prev = makeOkResult('a', 'h1');
    const next = makeOkResult('a', 'h2');
    const decision = reconcileState([prev], [next], { iteration: 4, maxIterations: 4 });
    expect(decision.kind).toBe(STATE_RECONCILER_KIND.CONVERGED);
    expect(decision.reason).toBe('max-iterations-reached');
  });
});

describe('Phase 9 — manager-workflow.runManagerWorkflow', () => {
  it('runs single iteration when stable', async () => {
    const snapshots = [makeSnapshot('s1')];
    const processor: SectionProcessor = vi.fn(async (s) => makeOkResult(s.sectionId));
    const iterations = await runManagerWorkflow(snapshots, processor);
    expect(iterations.length).toBe(1);
    expect(iterations[0]?.converged).toBe(true);
    expect(processor).toHaveBeenCalledTimes(1);
  });

  it('handles processor-throws gracefully', async () => {
    const snapshots = [makeSnapshot('s1')];
    const processor: SectionProcessor = vi.fn(async () => {
      throw new Error('boom');
    });
    const iterations = await runManagerWorkflow(snapshots, processor);
    expect(iterations[0]?.results[0]?.ok).toBe(false);
    expect(iterations[0]?.results[0]?.errors).toEqual(['boom']);
  });

  it('stops at maxIterations cap', async () => {
    const snapshots = [makeSnapshot('s1')];
    let counter = 0;
    const processor: SectionProcessor = async (s) => {
      counter += 1;
      return makeOkResult(s.sectionId, `hash-${counter}`);
    };
    const iterations = await runManagerWorkflow(snapshots, processor, { maxIterations: 2 });
    expect(iterations.length).toBeLessThanOrEqual(2);
  });

  it('uses default options when not provided', () => {
    expect(DEFAULT_MANAGER_WORKFLOW_OPTIONS.maxIterations).toBe(4);
    expect(DEFAULT_MANAGER_WORKFLOW_OPTIONS.maxConsecutiveDrifts).toBe(2);
  });

  it('calls onIterationStart and onSectionProcessed callbacks', async () => {
    const snapshots = [makeSnapshot('s1')];
    const processor: SectionProcessor = async (s) => makeOkResult(s.sectionId);
    const onStart = vi.fn();
    const onProcessed = vi.fn();
    await runManagerWorkflow(snapshots, processor, {
      onIterationStart: onStart,
      onSectionProcessed: onProcessed,
    });
    expect(onStart).toHaveBeenCalled();
    expect(onProcessed).toHaveBeenCalled();
  });
});

describe('Phase 9 — manager-workflow helpers', () => {
  it('flattenIterationResults returns empty for no iterations', () => {
    expect(flattenIterationResults([])).toEqual([]);
  });

  it('flattenIterationResults returns last iteration results', async () => {
    const snapshots = [makeSnapshot('s1')];
    const processor: SectionProcessor = async (s) => makeOkResult(s.sectionId);
    const iterations = await runManagerWorkflow(snapshots, processor);
    const flat = flattenIterationResults(iterations);
    expect(flat.length).toBe(1);
    expect(flat[0]?.sectionId).toBe('s1');
  });

  it('summarizeManagerWorkflow counts ok/error', async () => {
    const snapshots = [makeSnapshot('s1'), makeSnapshot('s2')];
    const processor: SectionProcessor = async (s) => makeOkResult(s.sectionId);
    const iterations = await runManagerWorkflow(snapshots, processor);
    const summary = summarizeManagerWorkflow(iterations);
    expect(summary.okCount).toBe(2);
    expect(summary.errorCount).toBe(0);
    expect(summary.converged).toBe(true);
  });
});

describe('Phase 9 — phase-orchestrator.PHASE_ID', () => {
  it('defines 6 phases', () => {
    expect(Object.keys(PHASE_ID).length).toBe(6);
    expect(PHASE_ID.PHASE_0_PRE_FLIGHT).toBe('phase-0');
    expect(PHASE_ID.PHASE_5_QA).toBe('phase-5');
  });
});

describe('Phase 9 — phase-orchestrator.runStage', () => {
  it('returns ok on first successful attempt', async () => {
    const handler: StageHandler<{ x: number }, { y: number }> = async (input) => ({
      stageId: PHASE_ID.PHASE_1_SPEC,
      ok: true,
      output: { y: input.x * 2 },
      warnings: [],
      errors: [],
      durationMs: 0,
    });
    const result = await runStage(handler, { x: 5 }, { url: 'u', target: 't', stageId: PHASE_ID.PHASE_1_SPEC });
    expect(result.ok).toBe(true);
    expect(result.output?.y).toBe(10);
  });

  it('retries on failure and returns error after maxRetries', async () => {
    let attempts = 0;
    const handler: StageHandler = async () => {
      attempts += 1;
      throw new Error(`attempt-${attempts}`);
    };
    const result = await runStage(handler, {}, { url: 'u', target: 't', stageId: PHASE_ID.PHASE_2_SECTION }, { maxRetries: 2 });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBe(3);
    expect(attempts).toBe(3);
  });

  it('respects maxRetries=0', async () => {
    const handler: StageHandler = async () => {
      throw new Error('fail');
    };
    const result = await runStage(handler, {}, { url: 'u', target: 't', stageId: PHASE_ID.PHASE_1_SPEC }, { maxRetries: 0 });
    expect(result.ok).toBe(false);
  });

  it('uses default maxRetries', () => {
    expect(DEFAULT_PHASE_PIPELINE_OPTIONS.maxRetries).toBe(3);
  });
});

describe('Phase 9 — phase-orchestrator.definePhasePipeline', () => {
  it('returns pipeline with phases and maxRetries', () => {
    const pipeline = definePhasePipeline([PHASE_ID.PHASE_0_PRE_FLIGHT, PHASE_ID.PHASE_5_QA]);
    expect(pipeline.phases.length).toBe(2);
    expect(pipeline.maxRetries).toBe(3);
  });

  it('respects custom maxRetries', () => {
    const pipeline = definePhasePipeline([PHASE_ID.PHASE_3_ASSEMBLY], { maxRetries: 10 });
    expect(pipeline.maxRetries).toBe(10);
  });
});

describe('Phase 9 — phase-orchestrator.runPhase3Assembly / runPhase4Builder / runPhase5Qa', () => {
  it('runPhase3Assembly calls handler with assembly input', async () => {
    const handler: StageHandler = async () => ({
      stageId: PHASE_ID.PHASE_3_ASSEMBLY,
      ok: true,
      warnings: [],
      errors: [],
      durationMs: 0,
    });
    const result = await runPhase3Assembly({ sections: [], managerIterations: [], url: 'u' }, handler);
    expect(result.ok).toBe(true);
  });

  it('runPhase4Builder calls handler with builder input', async () => {
    const handler: StageHandler = async () => ({
      stageId: PHASE_ID.PHASE_4_BUILDER,
      ok: true,
      warnings: [],
      errors: [],
      durationMs: 0,
    });
    const result = await runPhase4Builder({ sections: [], assembly: { sectionOrder: [], globalTokens: {}, assembledAt: 0 } }, handler);
    expect(result.ok).toBe(true);
  });

  it('runPhase5Qa calls handler with qa input', async () => {
    const handler: StageHandler = async () => ({
      stageId: PHASE_ID.PHASE_5_QA,
      ok: true,
      warnings: [],
      errors: [],
      durationMs: 0,
    });
    const result = await runPhase5Qa({ url: 'u', target: 't' }, handler);
    expect(result.ok).toBe(true);
  });
});

describe('Phase 9 — phase-orchestrator.createPerSectionProcessor + helpers', () => {
  it('createPerSectionProcessor delegates to manager workflow', async () => {
    const processor = createPerSectionProcessor();
    const result = await processor(makeSnapshot('s1'));
    expect(result.ok).toBe(true);
    expect(result.sectionId).toBe('s1');
  });

  it('isPhaseSuccessful returns true only when ok and not skipped', () => {
    expect(isPhaseSuccessful({ ok: true, stageId: PHASE_ID.PHASE_1_SPEC, warnings: [], errors: [], durationMs: 0 })).toBe(true);
    expect(isPhaseSuccessful({ ok: true, skipped: true, stageId: PHASE_ID.PHASE_1_SPEC, warnings: [], errors: [], durationMs: 0 })).toBe(false);
    expect(isPhaseSuccessful({ ok: false, stageId: PHASE_ID.PHASE_1_SPEC, warnings: [], errors: [], durationMs: 0 })).toBe(false);
  });

  it('getPhaseError returns first error for failed stages', () => {
    const result: StageResult = { ok: false, stageId: PHASE_ID.PHASE_1_SPEC, warnings: [], errors: ['boom'], durationMs: 0 };
    expect(getPhaseError(result)).toBe('boom');
    const ok: StageResult = { ok: true, stageId: PHASE_ID.PHASE_1_SPEC, warnings: [], errors: [], durationMs: 0 };
    expect(getPhaseError(ok)).toBeUndefined();
  });
});

describe('Phase 9 — run-report.buildRunReport', () => {
  it('produces 24-field report with sensible defaults', () => {
    const iterations = [
      { iteration: 0, results: [makeOkResult('a')], converged: true, driftCount: 0 },
    ];
    const stageResults: StageResult[] = [
      { ok: true, stageId: PHASE_ID.PHASE_3_ASSEMBLY, warnings: [], errors: [], durationMs: 100 },
    ];
    const sectionResults: StageResult[] = [
      { ok: true, stageId: PHASE_ID.PHASE_2_SECTION, warnings: [], errors: [], durationMs: 50 },
    ];
    const qaResult: StageResult<{ issueCount: number; highSeverityCount: number }> = {
      ok: true,
      stageId: PHASE_ID.PHASE_5_QA,
      warnings: [],
      errors: [],
      durationMs: 200,
      output: { issueCount: 10, highSeverityCount: 2 },
    };
    const report = buildRunReport({
      runId: 'run-1',
      startedAt: Date.now() - 1000,
      url: 'https://example.com',
      target: 'wp-target',
      phaseVersion: 'v2.0.0',
      managerIterations: iterations,
      stageResults,
      sectionSectionResults: sectionResults,
      qaResult,
    });
    expect(report.runId).toBe('run-1');
    expect(report.converged).toBe(true);
    expect(report.totalIterations).toBe(1);
    expect(report.totalIssues).toBe(10);
    expect(report.highSeverityIssues).toBe(2);
    expect(report.successfulSections).toBe(1);
    expect(report.totalSections).toBe(1);
    expect(report.averageSectionDurationMs).toBe(50);
  });

  it('handles missing qa and builder results gracefully', () => {
    const iterations = [{ iteration: 0, results: [], converged: true, driftCount: 0 }];
    const report = buildRunReport({
      runId: 'r',
      startedAt: Date.now() - 100,
      url: 'u',
      target: 't',
      phaseVersion: 'v1',
      managerIterations: iterations,
      stageResults: [],
      sectionSectionResults: [],
    });
    expect(report.totalIssues).toBe(0);
    expect(report.highSeverityIssues).toBe(0);
    expect(report.pageDataBytes).toBeUndefined();
  });
});

describe('Phase 9 — run-report.formatRunReport', () => {
  it('formats with all required fields', () => {
    const iterations = [{ iteration: 0, results: [], converged: true, driftCount: 0 }];
    const report = buildRunReport({
      runId: 'r',
      startedAt: Date.now() - 100,
      url: 'https://test.com',
      target: 'wp',
      phaseVersion: 'v2.0',
      managerIterations: iterations,
      stageResults: [],
      sectionSectionResults: [],
    });
    const output = formatRunReport(report);
    expect(output).toContain('Run-Report');
    expect(output).toContain('https://test.com');
    expect(output).toContain('Converged');
  });

  it('includes optional fields when requested', () => {
    const iterations = [{ iteration: 0, results: [], converged: true, driftCount: 0 }];
    const builderResult: StageResult<{ pageDataBytes?: number; sectionCountInOutput?: number }> = {
      ok: true,
      stageId: PHASE_ID.PHASE_4_BUILDER,
      warnings: [],
      errors: [],
      durationMs: 0,
      output: { pageDataBytes: 4096, sectionCountInOutput: 8 },
    };
    const report = buildRunReport({
      runId: 'r',
      startedAt: Date.now() - 100,
      url: 'u',
      target: 't',
      phaseVersion: 'v1',
      managerIterations: iterations,
      stageResults: [],
      sectionSectionResults: [],
      builderResult,
    });
    const output = formatRunReport(report, { includeOptionalFields: true });
    expect(output).toContain('Page-Data-Bytes');
    expect(output).toContain('Sections-In-Output');
  });
});

describe('Phase 9 — run-report.getReportSummary + isRunReportComplete', () => {
  it('summary is OK when converged, no failures, no high-severity', () => {
    const iterations = [{ iteration: 0, results: [], converged: true, driftCount: 0 }];
    const qaResult: StageResult<{ issueCount: number; highSeverityCount: number }> = {
      ok: true,
      stageId: PHASE_ID.PHASE_5_QA,
      warnings: [],
      errors: [],
      durationMs: 0,
      output: { issueCount: 5, highSeverityCount: 0 },
    };
    const report = buildRunReport({
      runId: 'r',
      startedAt: Date.now() - 100,
      url: 'u',
      target: 't',
      phaseVersion: 'v1',
      managerIterations: iterations,
      stageResults: [],
      sectionSectionResults: [],
      qaResult,
    });
    const summary = getReportSummary(report);
    expect(summary.success).toBe(true);
    expect(summary.headline).toContain('OK');
  });

  it('summary is FAIL when high-severity issues remain', () => {
    const iterations = [{ iteration: 0, results: [], converged: true, driftCount: 0 }];
    const qaResult: StageResult<{ issueCount: number; highSeverityCount: number }> = {
      ok: true,
      stageId: PHASE_ID.PHASE_5_QA,
      warnings: [],
      errors: [],
      durationMs: 0,
      output: { issueCount: 5, highSeverityCount: 3 },
    };
    const report = buildRunReport({
      runId: 'r',
      startedAt: Date.now() - 100,
      url: 'u',
      target: 't',
      phaseVersion: 'v1',
      managerIterations: iterations,
      stageResults: [],
      sectionSectionResults: [],
      qaResult,
    });
    const summary = getReportSummary(report);
    expect(summary.success).toBe(false);
    expect(summary.headline).toContain('FAIL');
  });

  it('isRunReportComplete validates required fields', () => {
    const iterations = [{ iteration: 0, results: [], converged: true, driftCount: 0 }];
    const complete = buildRunReport({
      runId: 'r',
      startedAt: Date.now() - 100,
      url: 'u',
      target: 't',
      phaseVersion: 'v1',
      managerIterations: iterations,
      stageResults: [],
      sectionSectionResults: [],
    });
    expect(isRunReportComplete(complete)).toBe(true);

    const incomplete = buildRunReport({
      runId: '',
      startedAt: Date.now(),
      url: '',
      target: '',
      phaseVersion: '',
      managerIterations: [],
      stageResults: [],
      sectionSectionResults: [],
    });
    expect(isRunReportComplete(incomplete)).toBe(false);
  });
});
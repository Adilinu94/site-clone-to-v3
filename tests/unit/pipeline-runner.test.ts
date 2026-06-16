import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInitialState } from '../../src/cli/state-manager.js';
import type { WizardResult } from '../../src/cli/wizard.js';
import type { PipelineResult, StageResult } from '../../src/analysis/pipeline.js';
import type { ExtractionResult } from '../../src/extractor/types.js';
import type { SectionInfo } from '../../src/extractor/types.js';
import type { ClassifyAllResult, SectionSpec } from '../../src/classifier/section-picker.js';

// ── Mock runPipeline ──
// The module under test imports from '../analysis/pipeline.js'.
// We mock it so we can verify call patterns without real Playwright/network.
const mockRunPipeline = vi.fn();
vi.mock('../../src/analysis/pipeline.js', () => ({
  runPipeline: (...args: unknown[]) => mockRunPipeline(...args),
}));

// ── Mock prompts (interactive review) ──
const mockPromptAutoPick = vi.fn();
const mockPromptSections = vi.fn();
vi.mock('../../src/cli/prompts.js', () => ({
  promptAutoPick: () => mockPromptAutoPick(),
  promptSections: (choices: unknown[]) => mockPromptSections(choices),
}));

// ── Import the module under test AFTER mocks are set up ──
const { runWizardPipeline } = await import('../../src/cli/pipeline-runner.js');

// ── Helpers ──

function fixtureOptions() {
  return {
    target: 'solar-local',
    viewports: [1440, 768, 390],
    animations: 'auto' as const,
    fonts: 'auto' as const,
    strictness: 'balanced' as const,
  };
}

function makeState(overrides?: Partial<ReturnType<typeof createInitialState>>) {
  const state = createInitialState('https://example.com', './research', fixtureOptions());
  return { ...state, ...overrides };
}

function makeWizardResult(overrides?: Partial<WizardResult>): WizardResult {
  return {
    state: makeState(),
    resumeMode: false,
    dryRun: false,
    interactive: true,
    ...overrides,
  };
}

/** Creates a minimal mock ExtractionResult. */
function makeExtraction(): ExtractionResult {
  return {
    url: 'https://example.com',
    hostname: 'example.com',
    extracted_at: new Date().toISOString(),
    viewports: [{ config: { label: 'desktop', width: 1440, height: 900 } }],
    fontsIntercepted: [],
    cssVariables: {},
    sections: [],
    animations: { has_keyframes: false, keyframe_names: [], has_gsap: false, has_scrolltrigger: false, has_framer_motion: false, has_lenis: false },
    images: [],
    svgs: [],
    favicons: [],
  };
}

/** Creates mock section info for classification. */
function makeSectionInfo(id: string, overrides?: Partial<SectionInfo>): SectionInfo {
  return {
    section_id: id,
    selector: `section#${id}`,
    y_range: [0, 800] as [number, number],
    layout: 'stack',
    child_count: 5,
    ...overrides,
  };
}

/** Creates a mock SectionSpec. */
function makeSectionSpec(id: string): SectionSpec {
  return {
    $schema: 'v1',
    section_id: id,
    source: { url: 'https://example.com', selector: `section#${id}`, y_range: [0, 800] as [number, number] },
    pattern: 'hero' as any,
    v3_section: { section_id: id, title: id, columns: [] } as any,
  };
}

/** Creates a mock ClassifyAllResult with given section specs. */
function makeClassification(specs: SectionSpec[]): ClassifyAllResult {
  return {
    specs,
    selectedManifest: {
      approved_count: specs.length,
      skipped_count: 0,
    } as any,
  };
}

/** Creates a mock PipelineResult from a list of StageResults. */
function makePipelineResult(stages: StageResult[], overrides?: Partial<PipelineResult>): PipelineResult {
  return {
    url: 'https://example.com',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    dryRun: false,
    stages,
    artifacts: {},
    ...overrides,
  };
}

function okStage(name: string): StageResult {
  return { name: name as any, status: 'ok', durationMs: 100, outputPaths: [], summary: {} };
}

function skippedStage(name: string): StageResult {
  return { name: name as any, status: 'skipped', durationMs: 0, outputPaths: [], summary: {} };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════
//  Interactive (step-by-step) mode
// ═══════════════════════════════════════════════════════════

describe('runWizardPipeline — interactive mode', () => {
  it('runs phase 1 (stages 1-2) then phase 2 (stages 3-6)', async () => {
    // Phase 1 returns extraction + classification
    const extraction = makeExtraction();
    extraction.sections = [makeSectionInfo('hero'), makeSectionInfo('features'), makeSectionInfo('footer')];

    const specs = [makeSectionSpec('hero'), makeSectionSpec('features'), makeSectionSpec('footer')];
    const classification = makeClassification(specs);

    const phase1Result = makePipelineResult(
      [okStage('extract'), okStage('classify')],
      { extraction, classification },
    );

    // Phase 2 returns assets + tokens + build + animations
    const phase2Result = makePipelineResult([
      okStage('assets'),
      skippedStage('tokens'),
      okStage('build'),
      okStage('animations'),
    ]);

    // Mock: first call = phase 1, second call = phase 2
    mockRunPipeline
      .mockResolvedValueOnce(phase1Result)
      .mockResolvedValueOnce(phase2Result);

    // User auto-picks all sections
    mockPromptAutoPick.mockResolvedValueOnce(true);

    const wizardResult = makeWizardResult({ interactive: true });
    const result = await runWizardPipeline(wizardResult);

    // Verify two calls to runPipeline
    expect(mockRunPipeline).toHaveBeenCalledTimes(2);

    // Phase 1 call: skipStages = [3,4,5,6]
    const phase1Call = mockRunPipeline.mock.calls[0][1];
    expect(phase1Call.skipStages).toEqual([3, 4, 5, 6]);
    expect(phase1Call.preloadedExtraction).toBeUndefined();

    // Phase 2 call: skipStages = [1,2], has preloaded data
    const phase2Call = mockRunPipeline.mock.calls[1][1];
    expect(phase2Call.skipStages).toEqual([1, 2]);
    expect(phase2Call.preloadedExtraction).toBe(extraction);
    expect(phase2Call.preloadedClassification).toBeDefined();

    // Result has merged stages (6 total: 2 from phase 1 + 4 from phase 2)
    expect(result.pipelineResult?.stages).toHaveLength(6);
    expect(result.pipelineResult?.extraction).toBe(extraction);
    expect(result.pipelineResult?.classification).toBe(classification);

    // Approved section IDs are returned
    expect(result.approvedSectionIds).toEqual(['hero', 'features', 'footer']);
  });

  it('filters classification specs by approved sections in phase 2', async () => {
    const extraction = makeExtraction();
    extraction.sections = [
      makeSectionInfo('hero'),
      makeSectionInfo('features'),
      makeSectionInfo('footer'),
      makeSectionInfo('cta'),
    ];

    const specs = [
      makeSectionSpec('hero'),
      makeSectionSpec('features'),
      makeSectionSpec('footer'),
      makeSectionSpec('cta'),
    ];

    const phase1Result = makePipelineResult(
      [okStage('extract'), okStage('classify')],
      { extraction, classification: makeClassification(specs) },
    );

    const phase2Result = makePipelineResult([
      okStage('assets'), okStage('build'), okStage('animations'),
    ]);

    mockRunPipeline
      .mockResolvedValueOnce(phase1Result)
      .mockResolvedValueOnce(phase2Result);

    // User manually selects only hero and footer (rejects features and cta)
    mockPromptAutoPick.mockResolvedValueOnce(false);
    mockPromptSections.mockResolvedValueOnce(['hero', 'footer']);

    const wizardResult = makeWizardResult({ interactive: true });
    const result = await runWizardPipeline(wizardResult);

    // Phase 2 preloaded classification should only have approved specs
    const phase2Call = mockRunPipeline.mock.calls[1][1];
    const preloaded = phase2Call.preloadedClassification as ClassifyAllResult;
    expect(preloaded.specs).toHaveLength(2);
    expect(preloaded.specs.map((s) => s.section_id)).toEqual(['hero', 'footer']);

    expect(result.approvedSectionIds).toEqual(['hero', 'footer']);
  });

  it('aborts if phase 1 has no extraction result', async () => {
    const phase1Result = makePipelineResult(
      [okStage('extract'), okStage('classify')],
      { extraction: undefined }, // extraction not set
    );

    mockRunPipeline.mockResolvedValueOnce(phase1Result);

    const wizardResult = makeWizardResult({ interactive: true });
    const result = await runWizardPipeline(wizardResult);

    // Should return after phase 1 without calling phase 2
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
    expect(result.pipelineResult).toBe(phase1Result);
  });

  it('returns approvedSectionIds from auto-pick', async () => {
    const extraction = makeExtraction();
    extraction.sections = [makeSectionInfo('a'), makeSectionInfo('b')];
    const specs = [makeSectionSpec('a'), makeSectionSpec('b')];

    const phase1Result = makePipelineResult(
      [okStage('extract'), okStage('classify')],
      { extraction, classification: makeClassification(specs) },
    );
    const phase2Result = makePipelineResult([okStage('build')]);

    mockRunPipeline
      .mockResolvedValueOnce(phase1Result)
      .mockResolvedValueOnce(phase2Result);
    mockPromptAutoPick.mockResolvedValueOnce(true);

    const result = await runWizardPipeline(makeWizardResult({ interactive: true }));
    expect(result.approvedSectionIds).toEqual(['a', 'b']);
  });

  it('returns approvedSectionIds from manual selection', async () => {
    const extraction = makeExtraction();
    extraction.sections = [makeSectionInfo('a'), makeSectionInfo('b'), makeSectionInfo('c')];
    const specs = [makeSectionSpec('a'), makeSectionSpec('b'), makeSectionSpec('c')];

    const phase1Result = makePipelineResult(
      [okStage('extract'), okStage('classify')],
      { extraction, classification: makeClassification(specs) },
    );
    const phase2Result = makePipelineResult([okStage('build')]);

    mockRunPipeline
      .mockResolvedValueOnce(phase1Result)
      .mockResolvedValueOnce(phase2Result);
    mockPromptAutoPick.mockResolvedValueOnce(false);
    mockPromptSections.mockResolvedValueOnce(['a', 'c']);

    const result = await runWizardPipeline(makeWizardResult({ interactive: true }));
    expect(result.approvedSectionIds).toEqual(['a', 'c']);
  });

  it('handles empty section selection (no sections approved)', async () => {
    const extraction = makeExtraction();
    extraction.sections = [makeSectionInfo('hero')];
    const specs = [makeSectionSpec('hero')];

    const phase1Result = makePipelineResult(
      [okStage('extract'), okStage('classify')],
      { extraction, classification: makeClassification(specs) },
    );
    const phase2Result = makePipelineResult([okStage('build')]);

    mockRunPipeline
      .mockResolvedValueOnce(phase1Result)
      .mockResolvedValueOnce(phase2Result);
    mockPromptAutoPick.mockResolvedValueOnce(false);
    mockPromptSections.mockResolvedValueOnce([]); // user picks nothing

    const result = await runWizardPipeline(makeWizardResult({ interactive: true }));

    // Phase 2 classification should have empty specs
    const phase2Call = mockRunPipeline.mock.calls[1][1];
    const preloaded = phase2Call.preloadedClassification as ClassifyAllResult;
    expect(preloaded.specs).toHaveLength(0);

    expect(result.approvedSectionIds).toEqual([]);
    // syncToMcp should be false when no sections approved
    expect(phase2Call.syncToMcp).toBe(false);
  });

  it('syncToMcp is true when target is set and sections are approved', async () => {
    const extraction = makeExtraction();
    extraction.sections = [makeSectionInfo('hero')];
    const specs = [makeSectionSpec('hero')];

    mockRunPipeline
      .mockResolvedValueOnce(makePipelineResult(
        [okStage('extract'), okStage('classify')],
        { extraction, classification: makeClassification(specs) },
      ))
      .mockResolvedValueOnce(makePipelineResult([okStage('build')]));
    mockPromptAutoPick.mockResolvedValueOnce(true);

    const wizardResult = makeWizardResult({ interactive: true });
    wizardResult.state.options.target = 'solar-local';

    await runWizardPipeline(wizardResult);

    const phase2Call = mockRunPipeline.mock.calls[1][1];
    expect(phase2Call.syncToMcp).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
//  Non-interactive mode
// ═══════════════════════════════════════════════════════════

describe('runWizardPipeline — non-interactive mode', () => {
  it('runs all stages in one shot', async () => {
    const result = makePipelineResult([
      okStage('extract'), okStage('classify'), okStage('assets'),
      okStage('tokens'), okStage('build'), okStage('animations'),
    ]);
    mockRunPipeline.mockResolvedValueOnce(result);

    const wizardResult = makeWizardResult({ interactive: false });
    const output = await runWizardPipeline(wizardResult);

    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
    // No skipStages (runs all 6)
    const call = mockRunPipeline.mock.calls[0][1];
    expect(call.skipStages).toBeUndefined();

    expect(output.pipelineResult?.stages).toHaveLength(6);
    expect(output.approvedSectionIds).toBeUndefined();
  });

  it('does not call promptAutoPick or promptSections', async () => {
    mockRunPipeline.mockResolvedValueOnce(
      makePipelineResult([okStage('extract'), okStage('build')]),
    );

    await runWizardPipeline(makeWizardResult({ interactive: false }));

    expect(mockPromptAutoPick).not.toHaveBeenCalled();
    expect(mockPromptSections).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════
//  Resume mode
// ═══════════════════════════════════════════════════════════

describe('runWizardPipeline — resume mode', () => {
  it('skips completed phases and runs remaining stages in one shot', async () => {
    const state = makeState();
    // Mark extract and classify as already completed
    state.phases.extract = { status: 'completed', startedAt: '2024-01-01T00:00:00Z', completedAt: '2024-01-01T00:01:00Z' };
    state.phases.classify = { status: 'completed', startedAt: '2024-01-01T00:01:00Z', completedAt: '2024-01-01T00:02:00Z' };

    const result = makePipelineResult([
      okStage('assets'), okStage('tokens'), okStage('build'), okStage('animations'),
    ]);
    mockRunPipeline.mockResolvedValueOnce(result);

    const wizardResult = makeWizardResult({
      state,
      resumeMode: true,
      interactive: true,
    });

    const output = await runWizardPipeline(wizardResult);

    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
    const call = mockRunPipeline.mock.calls[0][1];
    // Should skip stages 1 and 2 (extract + classify are done)
    expect(call.skipStages).toContain(1);
    expect(call.skipStages).toContain(2);

    expect(output.pipelineResult?.stages).toHaveLength(4);
  });

  it('runs in single-shot even when interactive=true', async () => {
    // Resume mode overrides interactive — no two-phase flow
    const state = makeState();
    state.phases.extract = { status: 'completed' };

    mockRunPipeline.mockResolvedValueOnce(
      makePipelineResult([okStage('classify'), okStage('build')]),
    );

    await runWizardPipeline(makeWizardResult({
      state,
      resumeMode: true,
      interactive: true, // would be two-phase, but resume overrides
    }));

    // Only one call to runPipeline
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
    expect(mockPromptAutoPick).not.toHaveBeenCalled();
  });

  it('runs all stages when nothing is completed', async () => {
    const state = makeState(); // all phases pending
    mockRunPipeline.mockResolvedValueOnce(
      makePipelineResult([okStage('extract'), okStage('classify'), okStage('build')]),
    );

    await runWizardPipeline(makeWizardResult({
      state,
      resumeMode: true,
      interactive: true,
    }));

    const call = mockRunPipeline.mock.calls[0][1];
    // No skipStages since nothing was completed
    expect(call.skipStages).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════
//  Error handling
// ═══════════════════════════════════════════════════════════

describe('runWizardPipeline — error handling', () => {
  it('re-throws pipeline errors after marking phase as failed', async () => {
    const error = new Error('Playwright crashed');
    mockRunPipeline.mockRejectedValueOnce(error);

    const wizardResult = makeWizardResult({ interactive: false });
    await expect(runWizardPipeline(wizardResult)).rejects.toThrow('Playwright crashed');

    // The phase should be marked as failed
    const state = wizardResult.state;
    // reconcile returns the first pending phase — since nothing ran, it should be 'extract'
    // but markFailed is called inside runPhase's catch, let's verify state was updated
    expect(state.phases.extract.status).toBe('failed');
  });
});

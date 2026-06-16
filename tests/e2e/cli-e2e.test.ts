/**
 * Phase 10 — E2E CLI Tests (no live dependencies).
 *
 * Tests the full wizard → pipeline flow end-to-end using mocked pipeline.
 * No MCP calls, no Playwright, no network — pure logic + filesystem.
 * All tests use temp directories to avoid writing to the real filesystem.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createInitialState } from '../../src/cli/state-manager.js';
import type { WizardResult } from '../../src/cli/wizard.js';
import type { StageResult } from '../../src/analysis/pipeline.js';
import type { ExtractionResult } from '../../src/extractor/types.js';
import type { ClassifyAllResult, SectionSpec } from '../../src/classifier/section-picker.js';

// ── Mock runPipeline ──
const mockRunPipeline = vi.fn();
vi.mock('../../src/analysis/pipeline.js', () => ({
  runPipeline: (...args: unknown[]) => mockRunPipeline(...args),
}));

// ── Mock prompts (auto-approve for E2E flow) ──
vi.mock('../../src/cli/prompts.js', () => ({
  promptAutoPick: () => Promise.resolve(true),
  promptSections: () => Promise.resolve([]),
}));

const { runWizardPipeline } = await import('../../src/cli/pipeline-runner.js');

// ── Helpers ──

let tmpDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clone-v3-e2e-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

function fixtureOptions() {
  return {
    target: 'test4',
    viewports: [1440, 768, 390] as number[],
    animations: 'auto' as const,
    fonts: 'auto' as const,
    strictness: 'balanced' as const,
  };
}

function makeWizardResult(overrides?: Partial<WizardResult>): WizardResult {
  return {
    state: createInitialState('https://example.com', tmpDir, fixtureOptions()),
    resumeMode: false,
    dryRun: false,
    interactive: true,
    ...overrides,
  };
}

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

function makeSectionInfo(id: string) {
  return { section_id: id, selector: `#${id}`, y_range: [0, 800] as [number, number], layout: 'stack', child_count: 3 };
}

function makeSectionSpec(id: string): SectionSpec {
  return {
    $schema: 'v1',
    section_id: id,
    source: { url: 'https://example.com', selector: `#${id}`, y_range: [0, 800] as [number, number] },
    pattern: 'hero' as any,
    v3_section: { section_id: id, title: id, columns: [] } as any,
  };
}

function okStage(name: string): StageResult {
  return { name: name as any, status: 'ok', durationMs: 50, outputPaths: [], summary: {} };
}

// ═══════════════════════════════════════════════════════════
//  Full Wizard → Pipeline E2E
// ═══════════════════════════════════════════════════════════

describe('E2E: Wizard → Pipeline (no live deps)', () => {
  it('completes the full 6-stage pipeline in interactive mode', async () => {
    const extraction = makeExtraction();
    extraction.sections = [makeSectionInfo('hero'), makeSectionInfo('features')];

    const specs = [makeSectionSpec('hero'), makeSectionSpec('features')];
    const classification: ClassifyAllResult = {
      specs,
      selectedManifest: { approved_count: 2, skipped_count: 0 } as any,
    };

    mockRunPipeline.mockResolvedValueOnce({
      url: 'https://example.com', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      dryRun: false, stages: [okStage('extract'), okStage('classify')], artifacts: {},
      extraction, classification,
    });
    mockRunPipeline.mockResolvedValueOnce({
      url: 'https://example.com', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      dryRun: false,
      stages: [okStage('assets'), okStage('tokens'), okStage('build'), okStage('animations')],
      artifacts: { 'v3-build': '/tmp/v3.json', 'v4-build': '/tmp/v4.json' },
    });

    const result = await runWizardPipeline(makeWizardResult({ interactive: true }));

    expect(mockRunPipeline).toHaveBeenCalledTimes(2);
    expect(result.pipelineResult?.stages).toHaveLength(6);
    const stageNames = result.pipelineResult!.stages.map((s) => s.name);
    expect(stageNames).toEqual(['extract', 'classify', 'assets', 'tokens', 'build', 'animations']);
    expect(result.pipelineResult!.stages.every((s) => s.status === 'ok')).toBe(true);
    expect(result.pipelineResult?.extraction).toBe(extraction);
    expect(result.pipelineResult?.artifacts['v3-build']).toBe('/tmp/v3.json');
  });

  it('completes all 6 stages in non-interactive mode', async () => {
    mockRunPipeline.mockResolvedValueOnce({
      url: 'https://example.com', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      dryRun: false,
      stages: [okStage('extract'), okStage('classify'), okStage('assets'), okStage('tokens'), okStage('build'), okStage('animations')],
      artifacts: {},
    });
    const result = await runWizardPipeline(makeWizardResult({ interactive: false }));
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
    expect(result.pipelineResult?.stages).toHaveLength(6);
  });

  it('returns approved section IDs from auto-pick', async () => {
    const extraction = makeExtraction();
    extraction.sections = [makeSectionInfo('hero'), makeSectionInfo('cta')];
    const specs = [makeSectionSpec('hero'), makeSectionSpec('cta')];
    mockRunPipeline.mockResolvedValueOnce({
      url: 'https://example.com', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      dryRun: false, stages: [okStage('extract'), okStage('classify')], artifacts: {},
      extraction, classification: { specs, selectedManifest: {} as any },
    });
    mockRunPipeline.mockResolvedValueOnce({
      url: 'https://example.com', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      dryRun: false, stages: [okStage('build')], artifacts: {},
    });
    const result = await runWizardPipeline(makeWizardResult({ interactive: true }));
    expect(result.approvedSectionIds).toEqual(['hero', 'cta']);
  });

  it('handles failed stages in the pipeline result', async () => {
    mockRunPipeline.mockResolvedValueOnce({
      url: 'https://example.com', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      dryRun: false,
      stages: [okStage('extract'), okStage('classify'), okStage('assets'),
              { name: 'tokens' as any, status: 'failed', durationMs: 200, outputPaths: [], summary: {}, error: 'MCP unreachable' },
              okStage('build'), okStage('animations')],
      artifacts: {},
    });
    const result = await runWizardPipeline(makeWizardResult({ interactive: false }));
    expect(result.pipelineResult?.stages).toHaveLength(6);
    const tokensStage = result.pipelineResult?.stages.find((s) => s.name === 'tokens');
    expect(tokensStage?.status).toBe('failed');
    expect(tokensStage?.error).toBe('MCP unreachable');
  });

  it('handles skipped stages correctly', async () => {
    mockRunPipeline.mockResolvedValueOnce({
      url: 'https://example.com', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      dryRun: false,
      stages: [
        okStage('extract'), okStage('classify'),
        { name: 'assets' as any, status: 'skipped', durationMs: 0, outputPaths: [], summary: { reason: 'no assets' } },
        okStage('build'), okStage('animations'),
      ],
      artifacts: {},
    });
    const result = await runWizardPipeline(makeWizardResult({ interactive: false }));
    const okCount = result.pipelineResult!.stages.filter((s) => s.status === 'ok').length;
    const skippedCount = result.pipelineResult!.stages.filter((s) => s.status === 'skipped').length;
    expect(okCount).toBe(4);
    expect(skippedCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════
//  Resume E2E
// ═══════════════════════════════════════════════════════════

describe('E2E: Resume flow', () => {
  it('resumes from completed phases and runs remaining', async () => {
    const state = createInitialState('https://example.com', tmpDir, fixtureOptions());
    state.phases.extract = { status: 'completed', startedAt: '2024-01-01T00:00:00Z', completedAt: '2024-01-01T00:01:00Z' };
    state.phases.classify = { status: 'completed', startedAt: '2024-01-01T00:01:00Z', completedAt: '2024-01-01T00:02:00Z' };

    mockRunPipeline.mockResolvedValueOnce({
      url: 'https://example.com', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      dryRun: false, stages: [okStage('assets'), okStage('tokens'), okStage('build'), okStage('animations')], artifacts: {},
    });

    const result = await runWizardPipeline(makeWizardResult({ state, resumeMode: true, interactive: true }));
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
    const call = mockRunPipeline.mock.calls[0][1];
    expect(call.skipStages).toContain(1);
    expect(call.skipStages).toContain(2);
    expect(result.pipelineResult?.stages).toHaveLength(4);
  });

  it('resumes from a failed phase and re-runs it', async () => {
    const state = createInitialState('https://example.com', tmpDir, fixtureOptions());
    state.phases.extract = { status: 'completed', startedAt: '2024-01-01T00:00:00Z', completedAt: '2024-01-01T00:01:00Z' };
    state.phases.classify = { status: 'failed', startedAt: '2024-01-01T00:01:00Z', error: 'classifier crash' };

    mockRunPipeline.mockResolvedValueOnce({
      url: 'https://example.com', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      dryRun: false, stages: [okStage('classify'), okStage('assets'), okStage('build')], artifacts: {},
    });

    const result = await runWizardPipeline(makeWizardResult({ state, resumeMode: true, interactive: true }));
    const call = mockRunPipeline.mock.calls[0][1];
    expect(call.skipStages).toContain(1);
    expect(call.skipStages).not.toContain(2);
    expect(result.pipelineResult?.stages).toHaveLength(3);
  });
});

// ═══════════════════════════════════════════════════════════
//  State.json Persistence E2E
// ═══════════════════════════════════════════════════════════

describe('E2E: State persistence', () => {
  it('saves state.json with completed phases after pipeline run', async () => {
    const state = createInitialState('https://e2e-test.example.com', tmpDir, fixtureOptions());
    const hostname = 'e2e-test.example.com';
    const stateFile = path.join(tmpDir, hostname, 'state.json');

    const extraction = makeExtraction();
    const specs = [makeSectionSpec('hero')];

    mockRunPipeline.mockResolvedValueOnce({
      url: 'https://e2e-test.example.com', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      dryRun: false, stages: [okStage('extract'), okStage('classify')], artifacts: {},
      extraction, classification: { specs, selectedManifest: {} as any },
    });
    mockRunPipeline.mockResolvedValueOnce({
      url: 'https://e2e-test.example.com', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      dryRun: false,
      stages: [okStage('assets'), okStage('build'), okStage('animations')],
      artifacts: { 'v3-build': '/tmp/page-v3.json' },
    });

    await runWizardPipeline(makeWizardResult({ state, interactive: true }));

    const raw = await fs.readFile(stateFile, 'utf8');
    const saved = JSON.parse(raw);

    expect(saved.schemaVersion).toBe(1);
    expect(saved.sourceUrl).toBe('https://e2e-test.example.com');
    expect(saved.phases.extract.status).toBe('completed');
    expect(saved.phases.classify.status).toBe('completed');
    expect(saved.phases.assets.status).toBe('completed');
    expect(saved.phases.build.status).toBe('completed');
    expect(saved.phases.animations.status).toBe('completed');
    expect(saved.phases.extract.artifacts).toBeDefined();
  });
});

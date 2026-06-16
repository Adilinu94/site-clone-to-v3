import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

vi.mock('../../src/extractor/playwright-extractor.js', () => ({
  extractFromUrl: vi.fn(async () => ({
    url: 'https://example.com',
    hostname: 'example.com',
    sections: [{ id: 's1', selector: '.hero', tag: 'section', rect: { x: 0, y: 0, width: 1440, height: 600 } }],
    fontsIntercepted: [],
    cssVariables: {},
    images: [],
    svgs: [],
    favicons: [],
    designTokens: {
      colors: { primary: '#3366ff' },
      fonts: { heading: { family: 'Inter', weight: 700, size: '32px' }, body: { family: 'Inter', weight: 400, size: '16px' } },
      spacing: { sectionPadding: '64px', containerWidth: '1200px' },
    },
    capturedAt: '2026-06-16T00:00:00Z',
  })),
}));

vi.mock('../../src/classifier/section-picker.js', () => ({
  classifyAll: vi.fn(async () => ({
    specs: [],
    selectedManifest: { approved_count: 0, skipped_count: 0, sections: [] },
  })),
}));

vi.mock('../../src/scraper/image-downloader.js', () => ({
  downloadImages: vi.fn(async () => ({ manifest: { images: [] }, errors: [] })),
}));

vi.mock('../../src/scraper/font-downloader.js', () => ({
  downloadFonts: vi.fn(async () => ({ manifest: { fonts: [] }, errors: [] })),
}));

vi.mock('../../src/scraper/svg-downloader.js', () => ({
  downloadSvgs: vi.fn(async () => ({ manifest: { svgs: [] }, errors: [] })),
}));

vi.mock('../../src/scraper/favicon-og-downloader.js', () => ({
  downloadFavicons: vi.fn(async () => ({ manifest: { favicons: [] }, errors: [] })),
}));

vi.mock('../../src/scraper/manifest-builder.js', () => ({
  buildAndWriteManifest: vi.fn(async () => ({ images: [], fonts: [], svgs: [], favicons: [] })),
}));

vi.mock('../../src/builder/v3-builder.js', () => ({
  writeV3PageData: vi.fn(async () => undefined),
  buildV3PageData: vi.fn(() => ({ elements: [], v3Path: '/tmp/v3.json' })),
}));

vi.mock('../../src/builder/v4-builder.js', () => ({
  writeV4Plan: vi.fn(async () => undefined),
  buildV4Plan: vi.fn(() => ({
    elements: [],
    v4Path: '/tmp/v4.json',
    summary: { sectionCount: 0, widgetCount: 0, classes: [] },
  })),
}));

vi.mock('../../src/builder/animation-injector.js', () => ({
  buildAnimationPlan: vi.fn(() => ({
    animations: [],
    snippets: [],
    sectionTargets: [],
    hasAnimations: false,
  })),
  writeAnimationPlan: vi.fn(async () => undefined),
}));

vi.mock('../../src/analysis/token-sync.js', () => ({
  syncTokens: vi.fn(async () => ({
    tokens: { variables: [], classes: [] },
    artifactPath: '/tmp/tokens.json',
    newVariables: [],
    newClasses: [],
    reusedVariables: 0,
    reusedClasses: 0,
    cacheHits: 0,
  })),
}));

vi.mock('../../src/mcp/mcp-adapter.js', () => ({
  McpAdapter: vi.fn(),
}));

import { runPipeline, type PipelineOptions, type StageName } from '../../src/analysis/pipeline.js';
import { extractFromUrl } from '../../src/extractor/playwright-extractor.js';
import { classifyAll } from '../../src/classifier/section-picker.js';
import { syncTokens } from '../../src/analysis/token-sync.js';

const extractMock = vi.mocked(extractFromUrl);
const classifyMock = vi.mocked(classifyAll);
const syncMock = vi.mocked(syncTokens);

describe('pipeline', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-'));
    extractMock.mockClear();
    classifyMock.mockClear();
    syncMock.mockClear();
  });

  const baseOptions: PipelineOptions = {
    outputDir: '',
    url: 'https://example.com',
  } as PipelineOptions;

  it('runs all stages and writes artifacts', async () => {
    const opts = { ...baseOptions, outputDir: tmp };
    const result = await runPipeline('https://example.com', opts);

    // Default flow: extract, classify, assets, build, animations (tokens only if syncToMcp)
    expect(result.stages).toHaveLength(5);
    expect(result.stages.map((s) => s.name)).toEqual<StageName[]>([
      'extract', 'classify', 'assets', 'build', 'animations',
    ]);

    // Verify all 4 sub-dirs were created
    const entries = await fs.readdir(tmp);
    expect(entries).toContain('extraction-result.json');
    expect(entries).toContain('selected-sections.json');
  });

  it('includes tokens stage when syncToMcp is true', async () => {
    const opts = { ...baseOptions, outputDir: tmp, syncToMcp: true, mcpUrl: 'https://mcp.test' };
    const result = await runPipeline('https://example.com', opts);
    const stageNames = result.stages.map((s) => s.name);
    expect(stageNames).toContain('tokens');
  });

  it('skips stages specified in skipStages', async () => {
    const opts = { ...baseOptions, outputDir: tmp, skipStages: [1, 4, 6] };
    const result = await runPipeline('https://example.com', opts);

    const executed = result.stages.filter((s) => s.status === 'ok');
    const skippedOrAbsent = result.stages.filter((s) => s.name === 'extract' || s.name === 'build' || s.name === 'animations');
    // extract, build, animations should NOT appear as 'ok'
    expect(skippedOrAbsent.every((s) => s.status !== 'ok')).toBe(true);
    expect(extractMock).not.toHaveBeenCalled();
  });

  it('marks assets stage as skipped when no assets discovered', async () => {
    const opts = { ...baseOptions, outputDir: tmp };
    const result = await runPipeline('https://example.com', opts);
    const assetsStage = result.stages.find((s) => s.name === 'assets');
    expect(assetsStage).toBeDefined();
    expect(assetsStage!.status).toBe('skipped');
    expect(assetsStage!.summary.reason).toContain('no assets');
  });

  it('skips MCP sync when syncToMcp is false', async () => {
    const opts = { ...baseOptions, outputDir: tmp, syncToMcp: false };
    await runPipeline('https://example.com', opts);
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('invokes MCP sync when syncToMcp is true and mcpUrl provided', async () => {
    const opts = { ...baseOptions, outputDir: tmp, syncToMcp: true, mcpUrl: 'https://mcp.test' };
    await runPipeline('https://example.com', opts);
    expect(syncMock).toHaveBeenCalled();
  });

  it('records durationMs for executed stages', async () => {
    const opts = { ...baseOptions, outputDir: tmp };
    const result = await runPipeline('https://example.com', opts);
    const extractStage = result.stages.find((s) => s.name === 'extract');
    expect(extractStage).toBeDefined();
    expect(extractStage!.durationMs).toBeGreaterThanOrEqual(0);
    expect(extractStage!.status).toBe('ok');
  });

  it('writes extraction artifact with full content', async () => {
    const opts = { ...baseOptions, outputDir: tmp };
    await runPipeline('https://example.com', opts);
    const extractionPath = path.join(tmp, 'extraction-result.json');
    const content = JSON.parse(await fs.readFile(extractionPath, 'utf-8'));
    expect(content.url).toBe('https://example.com');
    expect(content.hostname).toBe('example.com');
  });

  it('includes startedAt and finishedAt timestamps', async () => {
    const opts = { ...baseOptions, outputDir: tmp };
    const result = await runPipeline('https://example.com', opts);
    expect(result.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(result.finishedAt).getTime()).toBeGreaterThanOrEqual(new Date(result.startedAt).getTime());
  });
});

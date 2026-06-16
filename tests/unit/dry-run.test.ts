import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { runDryRun, formatDryRunReport } from '../../src/cli/dry-run.js';
import { makeExtractionResultJson, makeSection } from './cli-fixtures.js';
import type { ClassifyAllResult } from '../../src/classifier/section-picker.js';
import type { ExtractionResult } from '../../src/extractor/types.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clone-v3-dryrun-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeExtraction(sections: ReturnType<typeof makeSection>[]): Promise<string> {
  const dir = path.join(tmpDir, 'example.com');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'extraction-result.json');
  await fs.writeFile(file, makeExtractionResultJson(sections), 'utf8');
  return dir;
}

function mockClassify(sections: ReturnType<typeof makeSection>[]): ClassifyAllResult {
  return {
    url: 'https://example.com',
    specs: sections.map((s) => ({
      section_id: s.section_id,
      selector: s.selector,
      tag: s.tag,
      widget_type: 'e-flexbox',
      settings: {},
      detected_styles: {},
      css_classes: [],
      container_width: 1200,
      is_global_section: false,
    } as unknown as ClassifyAllResult['specs'][number])),
    selectedManifest: {
      approved_count: sections.length,
      skipped_count: 0,
      sections: sections.map((s) => ({ section_id: s.section_id, status: 'approved' })),
    },
    classificationLog: [],
  };
}

describe('dry-run', () => {
  it('generates v3+v4+animation specs without MCP', async () => {
    const dir = await writeExtraction([makeSection('hero'), makeSection('footer')]);
    const report = await runDryRun(
      { researchDir: dir, url: 'https://example.com' },
      { classify: async () => mockClassify([makeSection('hero'), makeSection('footer')]) },
    );
    expect(report.extracted.sections).toBe(2);
    expect(report.wouldBuild.v3Sections).toBe(2);
    expect(report.wouldBuild.v4Sections).toBe(2);
    expect(report.artifacts).toContain(path.join(dir, 'dryrun-page-v3.json'));
    expect(report.artifacts).toContain(path.join(dir, 'dryrun-page-v4.json'));
    expect(report.artifacts).toContain(path.join(dir, 'dryrun-build-summary.json'));
  });

  it('writes valid JSON artifacts', async () => {
    const dir = await writeExtraction([makeSection('hero')]);
    await runDryRun(
      { researchDir: dir, url: 'https://example.com' },
      { classify: async () => mockClassify([makeSection('hero')]) },
    );
    const v3 = JSON.parse(
      await fs.readFile(path.join(dir, 'dryrun-page-v3.json'), 'utf8'),
    );
    expect(v3.content).toBeDefined();
    expect(Array.isArray(v3.content)).toBe(true);

    const summary = JSON.parse(
      await fs.readFile(path.join(dir, 'dryrun-build-summary.json'), 'utf8'),
    );
    expect(summary.dryRun).toBe(true);
    expect(summary.v3.sectionCount).toBe(1);
  });

  it('reports zero sections when extraction is empty', async () => {
    const dir = await writeExtraction([]);
    const report = await runDryRun(
      { researchDir: dir, url: 'https://example.com' },
      { classify: async () => mockClassify([]) },
    );
    expect(report.extracted.sections).toBe(0);
    expect(report.wouldBuild.v3Sections).toBe(0);
    expect(report.warnings).toContain('No sections detected — build would produce an empty page.');
  });

  it('warns when no design tokens present', async () => {
    const dir = await writeExtraction([makeSection('hero')]);
    const report = await runDryRun(
      { researchDir: dir, url: 'https://example.com' },
      { classify: async () => mockClassify([makeSection('hero')]) },
    );
    expect(report.wouldBuild.syncOperations).toBe(0);
    expect(report.warnings).toContain('No design tokens in extraction — Phase 5 token-sync would be a no-op.');
  });

  it('counts sync operations from design tokens', async () => {
    const dir = tmpDir;
    await fs.mkdir(path.join(dir, 'example.com'), { recursive: true });
    const result: ExtractionResult = {
      ...JSON.parse(makeExtractionResultJson([makeSection('hero')])),
      designTokens: {
        colors: { primary: '#fff', secondary: '#000' },
        typography: {},
        spacing: {},
        radii: {},
        shadows: {},
        breakpoints: {},
      },
    };
    await fs.writeFile(
      path.join(dir, 'example.com', 'extraction-result.json'),
      JSON.stringify(result),
      'utf8',
    );
    const report = await runDryRun(
      { researchDir: path.join(dir, 'example.com'), url: 'https://example.com' },
      { classify: async () => mockClassify([makeSection('hero')]) },
    );
    expect(report.extracted.hasDesignTokens).toBe(true);
    expect(report.wouldBuild.syncOperations).toBeGreaterThan(0);
  });

  it('throws when extraction-result.json missing', async () => {
    await expect(
      runDryRun({ researchDir: tmpDir, url: 'https://example.com' }),
    ).rejects.toThrow(/extraction-result\.json/);
  });

  it('counts assets correctly', async () => {
    const dir = tmpDir;
    await fs.mkdir(path.join(dir, 'example.com'), { recursive: true });
    const result: ExtractionResult = JSON.parse(makeExtractionResultJson([makeSection('hero')]));
    result.images = [{ url: 'https://x.com/a.png' }, { url: 'https://x.com/b.png' }];
    result.fontsIntercepted = [
      { url: 'https://fonts.com/r.ttf', type: 'truetype' },
    ];
    result.svgs = [{ kind: 'inline', markup: '<svg></svg>' }];
    result.favicons = [{ url: 'https://x.com/fav.ico', kind: 'icon' }];
    await fs.writeFile(
      path.join(dir, 'example.com', 'extraction-result.json'),
      JSON.stringify(result),
      'utf8',
    );
    const report = await runDryRun(
      { researchDir: path.join(dir, 'example.com'), url: 'https://example.com' },
      { classify: async () => mockClassify([makeSection('hero')]) },
    );
    expect(report.extracted.assets).toEqual({
      images: 2,
      fonts: 1,
      svgs: 1,
      favicons: 1,
    });
  });
});

describe('formatDryRunReport', () => {
  it('renders a human-readable plan', () => {
    const text = formatDryRunReport({
      url: 'https://example.com',
      researchDir: '/tmp/x',
      timestamp: '2026-06-16T18:00:00.000Z',
      extracted: {
        sections: 3,
        assets: { images: 5, fonts: 2, svgs: 1, favicons: 1 },
        hasDesignTokens: true,
        hasAnimations: true,
      },
      wouldBuild: {
        v3Sections: 3,
        v4Sections: 3,
        v4Widgets: 12,
        v4Classes: 5,
        animationSnippets: 2,
        syncOperations: 8,
      },
      artifacts: ['/tmp/x/dryrun-page-v3.json'],
      warnings: [],
    });
    expect(text).toContain('=== Dry-Run Build Plan ===');
    expect(text).toContain('Sections:    3');
    expect(text).toContain('V3 sections: 3');
    expect(text).toContain('V4 widgets:  12');
    expect(text).toContain('Animations:  2 snippet(s)');
    expect(text).toContain('Token sync:  8 operation(s)');
  });

  it('renders warnings when present', () => {
    const text = formatDryRunReport({
      url: 'https://example.com',
      researchDir: '/tmp/x',
      timestamp: '2026-06-16T18:00:00.000Z',
      extracted: {
        sections: 0,
        assets: { images: 0, fonts: 0, svgs: 0, favicons: 0 },
        hasDesignTokens: false,
        hasAnimations: false,
      },
      wouldBuild: {
        v3Sections: 0,
        v4Sections: 0,
        v4Widgets: 0,
        v4Classes: 0,
        animationSnippets: 0,
        syncOperations: 0,
      },
      artifacts: [],
      warnings: ['No sections detected'],
    });
    expect(text).toContain('--- Warnings ---');
    expect(text).toContain('⚠ No sections detected');
  });
});

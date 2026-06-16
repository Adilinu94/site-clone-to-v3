import { promises as fs } from 'node:fs';
import path from 'node:path';
import { extractFromUrl, type ExtractionResult, type ExtractionOptions } from '../extractor/playwright-extractor.js';
import { classifyAll, type ClassifyResult } from '../classifier/section-picker.js';
import { writeV3PageData, buildV3PageData } from '../builder/v3-builder.js';
import { writeV4Plan, buildV4Plan } from '../builder/v4-builder.js';
import {
  downloadImages,
  downloadFonts,
  downloadSvgs,
  downloadFavicons,
  buildAndWriteManifest,
  type AssetManifest,
  type ImageManifestEntry,
  type FontManifestEntry,
  type SvgManifestEntry,
  type FaviconManifestEntry,
} from '../scraper/index.js';
import { syncTokens, type SyncResult } from './token-sync.js';
import { McpAdapter } from '../mcp/mcp-adapter.js';

export interface PipelineOptions extends ExtractionOptions {
  outputDir: string;
  dryRun?: boolean;
  syncToMcp?: boolean;
  mcpUrl?: string;
  mcpAuth?: string;
  skipStages?: number[];
}

export type StageName = 'extract' | 'classify' | 'assets' | 'tokens' | 'build';

export interface StageResult {
  name: StageName;
  status: 'ok' | 'skipped' | 'failed';
  durationMs: number;
  outputPaths: string[];
  summary: Record<string, unknown>;
  error?: string;
}

export interface PipelineResult {
  url: string;
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  stages: StageResult[];
  extraction?: ExtractionResult;
  classification?: ClassifyResult;
  sync?: SyncResult;
  assets?: AssetManifest;
  artifacts: Record<string, string>;
}

async function time<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
}

export async function runPipeline(
  url: string,
  options: PipelineOptions,
): Promise<PipelineResult> {
  const startedAt = new Date().toISOString();
  const outputDir = options.outputDir;
  const skip = new Set(options.skipStages ?? []);
  const stages: StageResult[] = [];
  const artifacts: Record<string, string> = {};

  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(path.join(outputDir, 'sections'), { recursive: true });
  await fs.mkdir(path.join(outputDir, 'assets'), { recursive: true });
  await fs.mkdir(path.join(outputDir, 'tokens'), { recursive: true });

  let extraction: ExtractionResult | undefined;
  let classification: ClassifyResult | undefined;
  let sync: SyncResult | undefined;
  let assets: AssetManifest | undefined;

  // Stage 1: extract
  if (!skip.has(1)) {
    const { result, ms } = await time(async () => extractFromUrl(url, options));
    extraction = result;
    const extractionPath = path.join(outputDir, 'extraction-result.json');
    await fs.writeFile(extractionPath, JSON.stringify(result, null, 2), 'utf-8');
    artifacts.extraction = extractionPath;
    stages.push({
      name: 'extract',
      status: 'ok',
      durationMs: ms,
      outputPaths: [extractionPath],
      summary: {
        sectionCount: result.sections.length,
        fontCount: Object.keys(result.fontsIntercepted ?? {}).length,
        hasDesignTokens: !!result.designTokens,
        hasComputedStyles: !!result.computedStyles,
      },
    });
  }

  // Stage 2: classify
  if (!skip.has(2) && extraction) {
    const { result, ms } = await time(async () => {
      const r = await classifyAll(extraction!);
      await r.writeSpecs(path.join(outputDir, 'sections'));
      return r;
    });
    classification = result;
    artifacts.classification = path.join(outputDir, 'sections', 'manifest.json');
    stages.push({
      name: 'classify',
      status: 'ok',
      durationMs: ms,
      outputPaths: [artifacts.classification],
      summary: {
        totalSections: result.sections.length,
        kept: result.sections.filter((s) => !s.autoSkipped).length,
        autoSkipped: result.sections.filter((s) => s.autoSkipped).length,
      },
    });
  }

  // Stage 3: assets
  if (!skip.has(3) && extraction) {
    const { result, ms } = await time(async () => {
      const imageOpts = {
        baseUrl: url,
        outputRoot: path.join(outputDir, 'assets'),
        images: extraction!.extractedImages ?? [],
      };
      const imageResult = await downloadImages(imageOpts);
      const fontResult = await downloadFonts({
        baseUrl: url,
        outputRoot: path.join(outputDir, 'assets'),
        fonts: Object.values(extraction!.fontsIntercepted ?? {}),
      });
      const svgResult = await downloadSvgs({
        outputRoot: path.join(outputDir, 'assets'),
        sources: extraction!.extractedSvgs ?? [],
      });
      const faviconResult = await downloadFavicons({
        baseUrl: url,
        outputRoot: path.join(outputDir, 'assets'),
        links: extraction!.faviconLinks ?? [],
      });
      const manifest = await buildAndWriteManifest({
        outputRoot: path.join(outputDir, 'assets'),
        images: imageResult.entries,
        fonts: fontResult.entries,
        svgs: svgResult.entries,
        favicons: faviconResult.entries,
      });
      return manifest;
    });
    assets = result;
    const manifestPath = path.join(outputDir, 'assets', 'manifest.json');
    artifacts.assets = manifestPath;
    stages.push({
      name: 'assets',
      status: 'ok',
      durationMs: ms,
      outputPaths: [manifestPath],
      summary: {
        totalAssets: result.entries.length,
        imageCount: result.entries.filter((e) => e.type === 'image').length,
        fontCount: result.entries.filter((e) => e.type === 'font').length,
      },
    });
  }

  // Stage 4: tokens (requires MCP)
  if (!skip.has(4) && extraction?.designTokens && options.syncToMcp) {
    const { result, ms } = await time(async () => {
      const mcp = new McpAdapter({
        url: options.mcpUrl ?? 'https://test4.nick-webdesign.de/wp-json/mcp/novamira',
        auth: options.mcpAuth,
      });
      return syncTokens(extraction.designTokens!, mcp, path.join(outputDir, 'tokens'), {
        dryRun: options.dryRun,
      });
    });
    sync = result;
    artifacts.sync = result.artifactPath;
    stages.push({
      name: 'tokens',
      status: 'ok',
      durationMs: ms,
      outputPaths: [result.artifactPath],
      summary: {
        newVariables: result.newVariables.length,
        newClasses: result.newClasses.length,
        reusedVariables: result.reusedVariables,
        cacheHits: result.cacheHits,
      },
    });
  }

  // Stage 5: build (V3 + V4)
  if (!skip.has(5) && classification) {
    const kept = classification.sections.filter((s) => !s.autoSkipped);
    const v3Data = buildV3PageData(kept, url);
    const v3Path = path.join(outputDir, 'page-v3.json');
    await writeV3PageData(v3Data, v3Path);
    artifacts['v3-build'] = v3Path;

    const v4Plan = buildV4Plan(kept, url);
    const v4Path = path.join(outputDir, 'page-v4.json');
    await writeV4Plan(v4Plan, v4Path);
    artifacts['v4-build'] = v4Path;

    stages.push({
      name: 'build',
      status: 'ok',
      durationMs: 0,
      outputPaths: [v3Path, v4Path],
      summary: {
        sectionCount: v4Plan.summary.sectionCount,
        widgetCount: v4Plan.summary.widgetCount,
        classCount: v4Plan.summary.classes.length,
      },
    });
  }

  return {
    url,
    startedAt,
    finishedAt: new Date().toISOString(),
    dryRun: options.dryRun ?? false,
    stages,
    extraction,
    classification,
    sync,
    assets,
    artifacts,
  };
}

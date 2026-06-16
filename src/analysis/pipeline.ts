/**
 * Pipeline orchestrator (Phase 4 + 5 + 6 + 7).
 *
 * 6-Stage-Pipeline:
 *   Stage 1 (extract): Playwright → ExtractionResult + JSON-Outputs
 *   Stage 2 (classify): Section-Picker → SectionSpec[] + Manifest
 *   Stage 3 (assets): Font-Downloader → manifest.json (fonts from extraction.fontsIntercepted)
 *   Stage 4 (tokens, optional): Design-Token-Sync via MCP
 *   Stage 5 (build): V3 + V4 page-data writers
 *   Stage 6 (animations, Phase 7): WPCode-Snippet-Plan aus Animations
 *
 * The asset-downloader (fonts) is now integrated as Stage 3.
 * Images, SVGs, and favicons require DOM extraction enhancement
 * (ExtractionResult.dom cheerio-parsing) — see BAUPLAN §Phase 4.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  extractFromUrl,
  type ExtractionResult,
  type ExtractionOptions,
} from '../extractor/playwright-extractor.js';
import {
  classifyAll,
  type ClassifyAllResult,
  type ClassifyResult,
} from '../classifier/section-picker.js';
import { writeV3PageData, buildV3PageData } from '../builder/v3-builder.js';
import { writeV4Plan, buildV4Plan } from '../builder/v4-builder.js';
import { syncTokens, type SyncResult } from './token-sync.js';
import { McpAdapter } from '../mcp/mcp-adapter.js';
import {
  buildAnimationPlan,
  writeAnimationPlan,
  type AnimationPlan,
} from '../builder/animation-injector.js';
import {
  downloadFonts,
  type DownloadFontsResult,
} from '../scraper/font-downloader.js';
import {
  buildAndWriteManifest,
  summarizeManifest,
  type AssetManifest,
} from '../scraper/manifest-builder.js';

export interface PipelineOptions extends ExtractionOptions {
  outputDir: string;
  dryRun?: boolean;
  syncToMcp?: boolean;
  mcpUrl?: string;
  mcpAuth?: string;
  skipStages?: number[];
}

export type StageName = 'extract' | 'classify' | 'assets' | 'tokens' | 'build' | 'animations';

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
  assetManifest?: AssetManifest;
  sync?: SyncResult;
  animationPlan?: AnimationPlan;
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
  await fs.mkdir(path.join(outputDir, 'tokens'), { recursive: true });
  await fs.mkdir(path.join(outputDir, 'animations'), { recursive: true });

  let extraction: ExtractionResult | undefined;
  let classification: ClassifyAllResult | undefined;
  let assetManifest: AssetManifest | undefined;
  let sync: SyncResult | undefined;
  let animationPlan: AnimationPlan | undefined;

  // Stage 1: extract
  if (!skip.has(1)) {
    const { result, ms } = await time(async () => extractFromUrl(options));
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
        fontCount: result.fontsIntercepted.length,
        hasDesignTokens: !!result.designTokens,
        hasComputedStyles: !!result.computedStyles,
      },
    });
  }

  // Stage 2: classify
  if (!skip.has(2) && extraction) {
    const { result, ms } = await time(async () => {
      const r = await classifyAll({
        url,
        outputDir,
        sections: extraction!.sections,
        computedStyles: extraction!.computedStyles ?? { desktop: [] },
        designTokens: extraction!.designTokens,
        cssVars: extraction!.cssVariables,
        autoApprove: true,
      });
      return r;
    });
    classification = result;
    const classificationPath = path.join(outputDir, 'selected-sections.json');
    await fs.writeFile(classificationPath, JSON.stringify(result.selectedManifest, null, 2), 'utf-8');
    artifacts.classification = classificationPath;
    stages.push({
      name: 'classify',
      status: 'ok',
      durationMs: ms,
      outputPaths: [classificationPath],
      summary: {
        totalSections: result.specs.length,
        approved: result.selectedManifest.approved_count,
        skipped: result.selectedManifest.skipped_count,
      },
    });
  }

  // Stage 3: assets (fonts from extraction.fontsIntercepted)
  if (!skip.has(3) && extraction?.fontsIntercepted?.length) {
    const assetsRoot = path.join(outputDir, 'assets');
    await fs.mkdir(assetsRoot, { recursive: true });

    const { result, ms } = await time(async () => {
      const fontsResult: DownloadFontsResult = await downloadFonts(
        extraction!.fontsIntercepted,
        {
          hostname: extraction!.hostname,
          outputRoot: assetsRoot,
        },
      );
      const { manifest } = await buildAndWriteManifest(
        {
          hostname: extraction!.hostname,
          url,
          fonts: fontsResult,
        },
        assetsRoot,
      );
      const summary = summarizeManifest(manifest);
      return { fontsResult, manifest, summary };
    });

    assetManifest = result.manifest;
    const manifestPath = path.join(assetsRoot, 'manifest.json');
    artifacts['asset-manifest'] = manifestPath;

    stages.push({
      name: 'assets',
      status: 'ok',
      durationMs: ms,
      outputPaths: [manifestPath],
      summary: {
        fonts: Object.keys(result.fontsResult.manifest).length,
        fontErrors: result.fontsResult.errors.length,
        images: 0,
        svgs: 0,
        favicons: 0,
        manifest: result.summary,
      },
    });
  } else if (!skip.has(3)) {
    stages.push({
      name: 'assets',
      status: 'skipped',
      durationMs: 0,
      outputPaths: [],
      summary: { reason: 'no font intercepts in extraction result' },
    });
  }

  // Stage 4: tokens (requires MCP + extraction.designTokens)
  if (!skip.has(4) && extraction?.designTokens && options.syncToMcp) {
    const { result, ms } = await time(async () => {
      const mcp = new McpAdapter({
        baseUrl: options.mcpUrl ?? 'https://test4.nick-webdesign.de/wp-json/mcp/novamira',
        authHeader: options.mcpAuth ? `Basic ${Buffer.from(options.mcpAuth).toString('base64')}` : '',
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
    const { result, ms } = await time(async () => {
      const kept = classification.specs;
      const v3Data = buildV3PageData(kept, url);
      const v3Path = path.join(outputDir, 'page-v3.json');
      await writeV3PageData(v3Data, v3Path);
      artifacts['v3-build'] = v3Path;

      const v4Plan = buildV4Plan(kept, url);
      const v4Path = path.join(outputDir, 'page-v4.json');
      await writeV4Plan(v4Plan, v4Path);
      artifacts['v4-build'] = v4Path;

      return { v3Path, v4Path, v4Plan };
    });

    stages.push({
      name: 'build',
      status: 'ok',
      durationMs: ms,
      outputPaths: [result.v3Path, result.v4Path],
      summary: {
        sectionCount: result.v4Plan.summary.sectionCount,
        widgetCount: result.v4Plan.summary.widgetCount,
        classCount: result.v4Plan.summary.classes.length,
      },
    });
  }

  // Stage 6: animations (Phase 7) — WPCode snippet plan
  if (!skip.has(6) && extraction) {
    const { result, ms } = await time(async () => {
      const plan = buildAnimationPlan({
        url,
        animations: extraction!.animations,
        sections: extraction!.sections,
      });
      await writeAnimationPlan(plan, path.join(outputDir, 'animations'));
      return plan;
    });
    animationPlan = result;
    artifacts.animations = path.join(outputDir, 'animations', 'animation-plan.json');
    stages.push({
      name: 'animations',
      status: 'ok',
      durationMs: ms,
      outputPaths: [artifacts.animations],
      summary: {
        snippetCount: result.snippets.length,
        sectionTargets: result.sectionTargets.length,
        hasAnimations: result.hasAnimations,
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
    assetManifest,
    sync,
    animationPlan,
    artifacts,
  };
}

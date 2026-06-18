/**
 * Pipeline orchestrator (Phase 4 + 5 + 6 + 7).
 *
 * 7-Stage-Pipeline:
 *   Stage 1 (extract): Playwright → ExtractionResult + JSON-Outputs
 *   Stage 2 (classify): Section-Picker → SectionSpec[] + Manifest
 *   Stage 3 (assets): Downloads all 4 asset types (images, fonts, SVGs, favicons) → manifest.json
 *   Stage 4 (tokens, optional): Design-Token-Sync via MCP
 *   Stage 5 (build): V3 + V4 page-data writers
 *   Stage 6 (animations, Phase 7): WPCode-Snippet-Plan aus Animations
 *   Stage 7 (qa, Phase 8): Visual QA via pixel-diff + SSIM (optional, requires cloneUrl)
 *
 * The asset-downloader is now integrated as Stage 3.
 * Images, SVGs, and favicons are collected by the extractor
 * via collectAssets() from the live DOM.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  extractFromUrl,
  type ExtractionResult,
  type ExtractionOptions,
} from '../extractor/playwright-extractor.js';
import { runExtractPipeline } from '../extractor/extract-pipeline.js';
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
} from '../scraper/font-downloader.js';
import {
  downloadImages,
} from '../scraper/image-downloader.js';
import {
  downloadSvgs,
} from '../scraper/svg-downloader.js';
import {
  downloadFavicons,
} from '../scraper/favicon-og-downloader.js';
import {
  buildAndWriteManifest,
  type AssetManifest,
} from '../scraper/manifest-builder.js';
import {
  runAcceptance,
} from '../qa/acceptance.js';
import {
  runAutoFix,
} from '../qa/auto-fix.js';
import {
  createRealFixers,
  type McpCallFn,
} from '../qa/real-fixers.js';
import {
  buildPixelElementResolver,
} from '../qa/pixel-element-resolver.js';

export interface PipelineOptions extends ExtractionOptions {
  outputDir: string;
  dryRun?: boolean;
  syncToMcp?: boolean;
  mcpUrl?: string;
  mcpAuth?: string;
  skipStages?: number[];
  /** Pre-loaded extraction result — used when Stage 1 is skipped (step-by-step mode). */
  preloadedExtraction?: ExtractionResult;
  /** Pre-loaded classification result — used when Stage 2 is skipped (step-by-step mode). */
  preloadedClassification?: ClassifyAllResult;
  /** Clone URL for QA stage (the deployed page to compare against original). */
  cloneUrl?: string;
  /** Minimum acceptable match score for QA acceptance (0–1, default 0.85). */
  qaMinScore?: number;
  /** Enable Auto-Fix-Loop after QA (requires postId + mcpUrl). Default: false. */
  qaAutoFix?: boolean;
  /** Post-ID of the deployed Elementor page for Auto-Fix elementor-edit-element calls. */
  postId?: number;
}

export type StageName = 'extract' | 'classify' | 'assets' | 'tokens' | 'build' | 'animations' | 'qa';

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

  // Stage 1: extract (V2 — runExtractPipeline with robots.txt, rate-limit, section-merge, spec.json)
  //   runExtractPipeline internally calls extractFromUrl(), applies mergeSmallSections(),
  //   writes spec.json + sections-merged.json, returns the spec. We re-derive extraction
  //   from extractFromUrl() to keep downstream stage shapes stable.
  if (!skip.has(1)) {
    const { result, ms } = await time(async () => {
      const extraction = await extractFromUrl(options);
      const v2 = await runExtractPipeline({
        url: options.url,
        outputDir,
        skipRobotsCheck: true, // CI/local default; wire real robots check later
      }).catch((v2err) => {
        // Non-fatal: if V2 path fails (e.g. a regression), continue with V1 extraction
        console.warn(`[pipeline] runExtractPipeline failed (V1 fallback): ${v2err instanceof Error ? v2err.message : String(v2err)}`);
        return null;
      });
      return { extraction, v2 };
    });

    extraction = result.extraction;
    const extractionPath = path.join(outputDir, 'extraction-result.json');
    await fs.writeFile(extractionPath, JSON.stringify(result.extraction, null, 2), 'utf-8');
    artifacts.extraction = extractionPath;

    const outputPaths = [extractionPath];
    const summary: Record<string, unknown> = {
      sectionCount: result.extraction.sections.length,
      fontCount: result.extraction.fontsIntercepted.length,
      hasDesignTokens: !!result.extraction.designTokens,
      hasComputedStyles: !!result.extraction.computedStyles,
      v2Spec: !!result.v2,
    };
    if (result.v2) {
      const specPath = path.join(outputDir, 'spec.json');
      const mergedPath = path.join(outputDir, 'sections-merged.json');
      outputPaths.push(specPath, mergedPath);
      artifacts.spec = specPath;
      artifacts.sectionsMerged = mergedPath;
      summary.sectionMergeStats = result.v2.sectionMergeStats;
      summary.preFlight = result.v2.preFlight;
    }

    stages.push({
      name: 'extract',
      status: 'ok',
      durationMs: ms,
      outputPaths,
      summary,
    });
  } else if (options.preloadedExtraction) {
    // Step-by-step mode: reuse extraction from previous pipeline run
    extraction = options.preloadedExtraction;
    stages.push({
      name: 'extract',
      status: 'skipped',
      durationMs: 0,
      outputPaths: [],
      summary: { reason: 'reused from step-by-step phase 1' },
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
  } else if (options.preloadedClassification) {
    // Step-by-step mode: reuse classification from previous pipeline run
    classification = options.preloadedClassification;
    stages.push({
      name: 'classify',
      status: 'skipped',
      durationMs: 0,
      outputPaths: [],
      summary: { reason: 'reused from step-by-step phase 1' },
    });
  }

  // Stage 3: assets (images, fonts, SVGs, favicons from extraction)
  if (!skip.has(3) && extraction) {
    const hasAnyAssets =
      (extraction.images?.length ?? 0) > 0 ||
      (extraction.fontsIntercepted?.length ?? 0) > 0 ||
      (extraction.svgs?.length ?? 0) > 0 ||
      (extraction.favicons?.length ?? 0) > 0;

    if (!hasAnyAssets) {
      stages.push({
        name: 'assets',
        status: 'skipped',
        durationMs: 0,
        outputPaths: [],
        summary: { reason: 'no assets discovered in extraction' },
      });
    } else {
      const assetsRoot = path.join(outputDir, 'assets');
      await fs.mkdir(assetsRoot, { recursive: true });

      const { result, ms } = await time(async () => {
        // Download all four asset categories in parallel
        const [imagesResult, fontsResult, svgsResult, faviconsResult] = await Promise.all([
          extraction!.images?.length
            ? downloadImages(
                extraction!.images.map((img) => ({ url: img.url, alt: img.alt })),
                { hostname: extraction!.hostname, outputRoot: assetsRoot, subdir: 'images' },
              )
            : Promise.resolve({ manifest: {} as Record<string, import('../scraper/image-downloader.js').ImageManifestEntry>, errors: [] }),

          extraction!.fontsIntercepted?.length
            ? downloadFonts(extraction!.fontsIntercepted, {
                hostname: extraction!.hostname,
                outputRoot: assetsRoot,
              })
            : Promise.resolve({ manifest: {} as Record<string, import('../scraper/font-downloader.js').FontManifestEntry>, errors: [] }),

          extraction!.svgs?.length
            ? downloadSvgs(
                extraction!.svgs.map((s) =>
                  s.kind === 'inline'
                    ? { kind: 'inline' as const, markup: s.markup!, sourceElement: s.sourceElement, existingId: s.existingId }
                    : { kind: 'external' as const, url: s.url! },
                ),
                { hostname: extraction!.hostname, outputRoot: assetsRoot },
              )
            : Promise.resolve({ manifest: {}, errors: [] }),

          extraction!.favicons?.length
            ? downloadFavicons(
                extraction!.favicons.map((f) => ({
                  url: f.url,
                  kind: f.kind,
                  sizes: f.sizes,
                  type: f.type,
                })),
                { hostname: extraction!.hostname, outputRoot: assetsRoot },
              )
            : Promise.resolve({ manifest: {}, errors: [] }),
        ]);

        const { manifest } = await buildAndWriteManifest(
          {
            hostname: extraction!.hostname,
            url,
            images: imagesResult,
            fonts: fontsResult,
            svgs: svgsResult,
            favicons: faviconsResult,
          },
          assetsRoot,
        );
        return { imagesResult, fontsResult, svgsResult, faviconsResult, manifest };
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
          images: Object.keys(result.imagesResult.manifest).length,
          imageErrors: result.imagesResult.errors.length,
          fonts: Object.keys(result.fontsResult.manifest).length,
          fontErrors: result.fontsResult.errors.length,
          svgs: Object.keys(result.svgsResult.manifest).length,
          svgErrors: result.svgsResult.errors.length,
          favicons: Object.keys(result.faviconsResult.manifest).length,
          faviconErrors: result.faviconsResult.errors.length,
          manifest: path.join(assetsRoot, 'manifest.json'),
        },
      });
    }
  } else if (!skip.has(3)) {
    stages.push({
      name: 'assets',
      status: 'skipped',
      durationMs: 0,
      outputPaths: [],
      summary: { reason: 'extraction stage did not run' },
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

  // Stage 7: qa (Phase 8) — Visual QA via pixel-diff + SSIM + optional Auto-Fix loop
  if (!skip.has(7) && options.cloneUrl) {
    const { result, ms } = await time(async () => {
      const qaOutputDir = path.join(outputDir, 'qa');
      const report = await runAcceptance({
        originalUrl: url,
        cloneUrl: options.cloneUrl!,
        outputDir: qaOutputDir,
        minAcceptableScore: options.qaMinScore,
      });
      return report;
    });
    const qaReport = result;
    artifacts['qa-report'] = path.join(outputDir, 'qa', 'acceptance-report.json');
    const stageSummary: Record<string, unknown> = {
      verdict: qaReport.verdict,
      matchPercent: qaReport.matchPercent,
      score: qaReport.score,
      recommendations: qaReport.recommendations,
    };
    const outputPaths = [
      path.join(outputDir, 'qa', 'acceptance-report.json'),
      path.join(outputDir, 'qa', 'original.png'),
      path.join(outputDir, 'qa', 'clone.png'),
      path.join(outputDir, 'qa', 'diff.png'),
    ];

    // Auto-Fix-Loop (Phase 8-Lueckenschluss): requires postId + mcpUrl.
    // Calls real MCP abilities via novamira/elementor-edit-element, novamira/execute-php,
    // novamira/upload_asset, and PixelElementResolver from page-v3.json.
    if (
      options.qaAutoFix &&
      qaReport.verdict !== 'pass' &&
      options.postId !== undefined &&
      options.mcpUrl
    ) {
      const autoFixMs = Date.now();
      try {
        const mcpAdapter = new McpAdapter({
          baseUrl: options.mcpUrl,
          authHeader: options.mcpAuth ? `Basic ${Buffer.from(options.mcpAuth).toString('base64')}` : '',
        });
        const mcpCallFn: McpCallFn = async (abilityName, parameters) => {
          return mcpAdapter.executeAbility(abilityName, parameters);
        };

        const pageDataPath = path.join(outputDir, 'page-v3.json');
        const resolver = await buildPixelElementResolver({
          pageDataPath,
          viewportWidth: 1440,
          defaultSectionHeightPx: 600,
        });

        const fixers = createRealFixers({
          mcp: mcpCallFn,
          postId: options.postId!,
          resolver,
          dryRun: options.dryRun ?? false,
          originalUrl: url,
        });

        const autoFixOutputDir = path.join(outputDir, 'qa', 'auto-fix');
        const autoFixReport = await runAutoFix({
          originalUrl: url,
          cloneUrl: options.cloneUrl!,
          outputDir: autoFixOutputDir,
          strictness: 'pixel-perfect',
          fixers,
        });

        artifacts['auto-fix-report'] = path.join(autoFixOutputDir, 'auto-fix-report.json');
        outputPaths.push(path.join(autoFixOutputDir, 'auto-fix-report.json'));
        stageSummary.autoFix = {
          totalRounds: autoFixReport.totalRounds,
          finalMatchPercent: autoFixReport.finalMatchPercent,
          issuesFixed: autoFixReport.rounds.reduce((sum, r) => sum + r.issuesFixed, 0),
          issuesSkipped: autoFixReport.rounds.reduce((sum, r) => sum + r.issuesSkipped, 0),
          targetReached: autoFixReport.targetReached,
        };
        stageSummary.autoFixDurationMs = Date.now() - autoFixMs;
      } catch (err) {
        stageSummary.autoFixError = (err as Error).message ?? String(err);
      }
    } else if (options.qaAutoFix) {
      stageSummary.autoFixNote =
        'auto-fix requested but skipped — requires postId + mcpUrl';
    }

    stages.push({
      name: 'qa',
      status: qaReport.verdict === 'fail' ? 'failed' : 'ok',
      durationMs: ms,
      outputPaths,
      summary: stageSummary,
    });
  } else if (!skip.has(7)) {
    stages.push({
      name: 'qa',
      status: 'skipped',
      durationMs: 0,
      outputPaths: [],
      summary: { reason: 'no clone URL provided — QA requires a deployed page to compare' },
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

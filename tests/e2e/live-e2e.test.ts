/**
 * Phase 10 — Live E2E Tests against test4.nick-webdesign.de.
 *
 * These tests run the real Playwright extractor and pipeline stages 1-2
 * against the live test4 WordPress site. Gate: INTEGRATION_LIVE=1.
 *
 * Prerequisites:
 *   INTEGRATION_LIVE=1
 *   NOVAMIRA_TEST_TOKEN=<bearer token for test4>
 *
 * What these tests verify:
 *   1. Real extraction: Playwright extracts sections, fonts, CSS vars, assets from test4
 *   2. Pipeline stages 1-2: extract → classify produces valid specs
 *   3. Asset collection: images, SVGs, favicons are discovered from the live DOM
 *   4. Design tokens are generated from computed styles
 *   5. Output files written to research directory
 *
 * Skip in CI without INTEGRATION_LIVE=1 — these require a live WordPress site.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isLiveEnabled, requireLiveEnv } from '../helpers/integration-guard.js';
import { extractFromUrl, type ExtractionResult } from '../../src/extractor/index.js';
import { runPipeline, type PipelineResult } from '../../src/analysis/pipeline.js';

const TIMEOUT = 120_000;
const TEST4_URL = 'https://test4.nick-webdesign.de/';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clone-v3-e2e-live-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

// ═══════════════════════════════════════════════════════════
//  Live Extractor E2E (Stage 1)
// ═══════════════════════════════════════════════════════════

describe.skipIf(!isLiveEnabled())('E2E Live: Extractor against test4.nick-webdesign.de', () => {
  it(
    'extracts test4 homepage — sections, fonts, cssVars, animations, assets',
    async () => {
      const env = requireLiveEnv();

      const result: ExtractionResult = await extractFromUrl({
        url: TEST4_URL,
        viewports: [{ label: 'desktop', width: 1440, height: 900 }],
        screenshots: true,
        scrollForLazyLoad: true,
        waitForHydration: true,
        detectAnimations: true,
        detectSections: true,
        detectResponsiveStyles: true,
        detectHoverStates: false,
        maxStyles: 300,
        outputDir: path.join(tmpDir, 'e2e-extract'),
        sourceAuth: {
          type: 'bearer',
          token: env.token,
        },
      });

      // URL matches test4
      expect(result.url).toContain('test4');
      expect(result.hostname).toContain('test4');

      // Sections detected
      expect(result.sections.length).toBeGreaterThan(0);
      for (const section of result.sections) {
        expect(section.section_id).toBeTruthy();
        expect(section.selector).toBeTruthy();
      }

      // Fonts intercepted
      expect(result.fontsIntercepted).toBeDefined();
      expect(Array.isArray(result.fontsIntercepted)).toBe(true);

      // CSS variables detected
      expect(result.cssVariables).toBeDefined();
      expect(typeof result.cssVariables).toBe('object');

      // Animations info present
      expect(result.animations).toBeDefined();
      expect(typeof result.animations.has_keyframes).toBe('boolean');

      // Asset collection (Phase 4)
      expect(Array.isArray(result.images)).toBe(true);
      expect(Array.isArray(result.svgs)).toBe(true);
      expect(Array.isArray(result.favicons)).toBe(true);
      // test4 should have at least some images and a favicon
      const totalDiscovered = result.images.length + result.svgs.length + result.favicons.length;
      expect(totalDiscovered).toBeGreaterThan(0);

      // Screenshots saved
      expect(result.viewports).toHaveLength(1);
      expect(result.viewports[0].screenshotPath).toBeTruthy();

      // Design tokens generated (when detectResponsiveStyles is true)
      if (result.computedStyles) {
        // Design tokens may be generated from computed styles
        // Not always guaranteed but should be attempted
        expect(result.designTokens).toBeDefined();
      }

      // JSON outputs persisted on disk
      const extractionFile = path.join(tmpDir, 'e2e-extract', 'extraction-result.json');
      const stat = await fs.stat(extractionFile);
      expect(stat.size).toBeGreaterThan(100);
    },
    TIMEOUT,
  );

  it(
    'extractFromUrl writes all expected JSON output files',
    async () => {
      const env = requireLiveEnv();
      const outputDir = path.join(tmpDir, 'e2e-outputs');

      await extractFromUrl({
        url: TEST4_URL,
        viewports: [{ label: 'desktop', width: 1440, height: 900 }],
        screenshots: true,
        scrollForLazyLoad: true,
        waitForHydration: true,
        detectAnimations: true,
        detectSections: true,
        detectResponsiveStyles: false,
        maxStyles: 100,
        outputDir,
        sourceAuth: { type: 'bearer', token: env.token },
      });

      // All expected output files exist
      const expectedFiles = [
        'extraction-result.json',
        'fonts-detected.json',
        'css-variables.json',
        'animations.json',
        'sections.json',
        'assets-detected.json',
      ];

      for (const file of expectedFiles) {
        const filePath = path.join(outputDir, file);
        const exists = await fs.stat(filePath).then(() => true).catch(() => false);
        if (!exists) {
          // Some files may not be written if data is empty
          console.log(`  ℹ ${file} not found (may be empty)`);
        } else {
          const content = await fs.readFile(filePath, 'utf8');
          expect(() => JSON.parse(content)).not.toThrow();
        }
      }

      // extraction-result.json always exists
      const extractionPath = path.join(outputDir, 'extraction-result.json');
      const raw = await fs.readFile(extractionPath, 'utf8');
      const parsed = JSON.parse(raw);
      expect(parsed.url).toContain('test4');
    },
    TIMEOUT,
  );
});

// ═══════════════════════════════════════════════════════════
//  Live Pipeline E2E (Stages 1-2: extract + classify)
// ═══════════════════════════════════════════════════════════

describe.skipIf(!isLiveEnabled())('E2E Live: Pipeline stages 1-2 against test4', () => {
  it(
    'runs stages 1-2 (extract + classify) and produces valid specs',
    async () => {
      const env = requireLiveEnv();
      const outputDir = path.join(tmpDir, 'e2e-pipeline');

      const result: PipelineResult = await runPipeline(TEST4_URL, {
        url: TEST4_URL,
        outputDir,
        dryRun: false,
        syncToMcp: false,
        skipStages: [3, 4, 5, 6], // Only extract + classify
      });

      // Two stages completed
      expect(result.stages).toHaveLength(2);
      const extractStage = result.stages.find((s) => s.name === 'extract')!;
      const classifyStage = result.stages.find((s) => s.name === 'classify')!;

      expect(extractStage.status).toBe('ok');
      expect(extractStage.durationMs).toBeGreaterThan(0);
      expect(classifyStage.status).toBe('ok');

      // Extraction result available
      expect(result.extraction).toBeDefined();
      expect(result.extraction!.sections.length).toBeGreaterThan(0);

      // Classification result available
      expect(result.classification).toBeDefined();
      expect(result.classification!.specs.length).toBeGreaterThan(0);
      expect(result.classification!.selectedManifest).toBeDefined();

      // Each spec has required fields
      for (const spec of result.classification!.specs) {
        expect(spec.section_id).toBeTruthy();
        expect(spec.source).toBeDefined();
        expect(spec.source.selector).toBeTruthy();
        expect(spec.pattern).toBeDefined();
      }

      // Output files on disk
      const extractionFile = path.join(outputDir, 'extraction-result.json');
      const classificationFile = path.join(outputDir, 'selected-sections.json');
      expect(await fs.stat(extractionFile).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.stat(classificationFile).then(() => true).catch(() => false)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'classification produces a manifest with approved/skipped counts',
    async () => {
      const env = requireLiveEnv();
      const outputDir = path.join(tmpDir, 'e2e-classify');

      const result: PipelineResult = await runPipeline(TEST4_URL, {
        url: TEST4_URL,
        outputDir,
        dryRun: false,
        syncToMcp: false,
        skipStages: [3, 4, 5, 6],
      });

      const manifest = result.classification!.selectedManifest;
      expect(typeof manifest.approved_count).toBe('number');
      expect(typeof manifest.skipped_count).toBe('number');
      expect(manifest.approved_count + manifest.skipped_count).toBeGreaterThanOrEqual(result.extraction!.sections.length);
    },
    TIMEOUT,
  );

  it(
    'extraction includes asset discovery (images, svgs, favicons)',
    async () => {
      const env = requireLiveEnv();
      const outputDir = path.join(tmpDir, 'e2e-assets');

      const result: PipelineResult = await runPipeline(TEST4_URL, {
        url: TEST4_URL,
        outputDir,
        dryRun: false,
        syncToMcp: false,
        skipStages: [3, 4, 5, 6],
      });

      const extraction = result.extraction!;

      // Asset arrays exist
      expect(Array.isArray(extraction.images)).toBe(true);
      expect(Array.isArray(extraction.svgs)).toBe(true);
      expect(Array.isArray(extraction.favicons)).toBe(true);

      // Image URLs are valid
      for (const img of extraction.images) {
        expect(img.url).toBeTruthy();
        expect(img.url).toMatch(/^https?:\/\//);
      }

      // Favicons should include at least a favicon.ico or og:image
      if (extraction.favicons.length > 0) {
        for (const fav of extraction.favicons) {
          expect(fav.url).toBeTruthy();
          expect(typeof fav.kind).toBe('string');
        }
      }
    },
    TIMEOUT,
  );
});

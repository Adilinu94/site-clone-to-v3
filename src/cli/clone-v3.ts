#!/usr/bin/env node
/**
 * clone-v3 — Site-Clone to Elementor V3
 *
 * Sub-commands (Plan §1):
 *   clone          Full pipeline (all phases)
 *   extract        Phase 2 only (Playwright extraction)
 *   extract-tokens Phase 2 + 2.5 (Design-Tokens only, no build)
 *   apply-kit      Phase 5 standalone (Kit on existing WP)
 *   build          Phase 6-8 (Build + QA from existing extraction)
 *   diff           Original vs existing V3-Page without build
 *
 * Flags (Plan §3):
 *   --url, --target, --viewports, --animations, --fonts,
 *   --strictness, --auto-pick-sections, --sections, --no-wizard,
 *   --resume, --output, --dry-run, --merge, --source-auth,
 *   --version, --help
 */
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';

import { PACKAGE_VERSION } from '../lib/version.js';
import { runWizard, type WizardOptions } from './wizard.js';
import type { AnimationStrategy, FontStrategy, StrictnessLevel } from './prompts.js';
import { runWizardPipeline, reviewDesignTokens, reviewSections } from './pipeline-runner.js';
import { runDryRun, formatDryRunReport } from './dry-run.js';
import { runDiffOnly, formatDiffReport, saveSnapshots, snapshotSections } from './diff-only.js';
import { runIncremental, formatIncrementalReport } from './incremental.js';
import { hostnameFromUrl } from '../lib/paths.js';

const program = new Command();

program
  .name('clone-v3')
  .description('Clone any live website to Elementor V3 — pixel-accurate, on any WordPress with the Novamira plugin.')
  .version(PACKAGE_VERSION);

program
  .command('clone [url]')
  .description('Full pipeline: extract → design-tokens → section-picker → assets → design-system → build → QA')
  .option('-u, --url <url>', 'Source URL (alias for positional arg, useful for non-interactive)')
  .option('-t, --target <name>', 'WP target profile name (e.g. solar-local)')
  .option('--viewports <list>', 'Comma-separated viewport widths (e.g. 1440,768,390)')
  .option('-a, --animations <strategy>', 'Animation strategy: none|css|gsap|auto')
  .option('-f, --fonts <strategy>', 'Font strategy: auto|system|all')
  .option('-s, --strictness <level>', 'Pixel-match strictness: draft|balanced|pixel-perfect')
  .option('--auto-pick-sections', 'Skip interactive section picker, pick all detected sections', false)
  .option('--sections <list>', 'Comma-separated section IDs to build (overrides picker)')
  .option('--source-auth <name>', 'Use named source auth from source-auth.json')
  .option('--no-wizard', 'Run non-interactively (CI/CD mode)')
  .option('--resume <state.json>', 'Resume from a saved state file')
  .option('-o, --output <dir>', 'Research output directory', './research')
  .option('--dry-run', 'Generate specs only, no MCP calls', false)
  .option('--diff-only', 'Compare against existing V3 page, do not build', false)
  .option('--incremental', 'Only rebuild changed sections (requires previous build)', false)
  .action(async (url: string | undefined, options) => {
    console.log(chalk.cyan(`[clone-v3 v${PACKAGE_VERSION}] full pipeline`));
    try {
      const wizardOpts: WizardOptions = {
        url: options.url ?? url,
        target: options.target,
        viewports: options.viewports
          ?.split(',')
          .map((s: string) => parseInt(s.trim(), 10))
          .filter(Number.isFinite),
        animations: options.animations as AnimationStrategy | undefined,
        fonts: options.fonts as FontStrategy | undefined,
        strictness: options.strictness as StrictnessLevel | undefined,
        autoPickSections: !!options.autoPickSections,
        sections: options.sections?.split(',').map((s: string) => s.trim()).filter(Boolean),
        sourceAuth: options.sourceAuth,
        resume: options.resume,
        output: options.output ?? './research',
        interactive: options.wizard !== false,
      };
      const result = await runWizard(wizardOpts);
      const researchDir = `${wizardOpts.output}/${result.state.hostname}`;
      console.log(chalk.cyan(`\n[clone-v3] State saved to ${wizardOpts.resume ?? `research/${result.state.hostname}/state.json`}`));

      const sourceUrl = result.state.sourceUrl;
      const modeCount = [options.dryRun, options.diffOnly, options.incremental].filter(Boolean).length;
      if (modeCount > 1) {
        console.error(chalk.red('Error: --dry-run, --diff-only, and --incremental are mutually exclusive.'));
        process.exit(2);
      }

      if (options.dryRun) {
        console.log(chalk.yellow('[DRY-RUN] Generating specs without MCP calls...'));
        const report = await runDryRun({ researchDir, url: sourceUrl });
        console.log(chalk.cyan(formatDryRunReport(report)));
        process.exit(0);
      }

      if (options.diffOnly) {
        console.log(chalk.yellow('[DIFF-ONLY] Comparing current extraction against previous build...'));
        const report = await runDiffOnly({ researchDir, url: sourceUrl });
        console.log(chalk.cyan(formatDiffReport(report)));
        process.exit(0);
      }

      if (options.incremental) {
        console.log(chalk.yellow('[INCREMENTAL] Computing change set vs previous build...'));
        const report = await runIncremental({ researchDir, url: sourceUrl });
        console.log(chalk.cyan(formatIncrementalReport(report)));
        process.exit(0);
      }

      // ── Phase 9: Run the full pipeline with state tracking ──
      const runResult = await runWizardPipeline(result);

      // Post-extraction review (interactive mode only)
      if (wizardOpts.interactive && runResult.pipelineResult) {
        await reviewDesignTokens(wizardOpts, runResult.pipelineResult);
        await reviewSections(wizardOpts, runResult.pipelineResult);
      }

      console.log(chalk.green(`\n✓ Clone complete: ${result.state.hostname}`));
      console.log(chalk.gray(`  State saved → ${runResult.stateFile}`));
      console.log(chalk.gray(`  Run 'clone-v3 diff --url ${sourceUrl}' to compare against previous builds.`));
    } catch (err) {
      console.error(chalk.red('Clone failed:'), err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command('extract <url>')
  .description('Phase 2: Playwright extraction (screenshots, DOM, styles, animations, fonts, css-vars)')
  .option('-o, --output <dir>', 'Research output directory', './research')
  .option('--viewports <list>', 'Comma-separated viewport widths', '1440,768,390')
  .option('--source-auth <name>', 'Use named source auth from source-auth.json')
  .option('--no-wizard', 'Run non-interactively')
  .action(async (url: string, _options) => {
    console.log(chalk.cyan(`[clone-v3 v${PACKAGE_VERSION}] extract`));
    console.log(chalk.gray(`URL: ${url}`));
    console.log(chalk.gray('Extraction not yet implemented — see Phase 2'));
  });

program
  .command('extract-tokens [url]')
  .description('Phase 2 + 2.5: extract + design-token intelligence (no build)')
  .option('--from <research-dir>', 'Reuse existing research dir, skip extraction')
  .option('-o, --output <dir>', 'Research output directory', './research')
  .action(async (url, _options) => {
    console.log(chalk.cyan(`[clone-v3 v${PACKAGE_VERSION}] extract-tokens`));
    console.log(chalk.gray(`URL: ${url ?? '(reuse --from)'}`));
    console.log(chalk.gray('Token extraction not yet implemented — see Phase 2.5'));
  });

program
  .command('apply-kit')
  .description('Phase 5 standalone: apply a design-tokens.json as V3 Kit to an existing WP')
  .requiredOption('--tokens <path>', 'Path to design-tokens.json')
  .requiredOption('-t, --target <name>', 'WP target profile name')
  .option('--merge', 'Only create new tokens, do not overwrite existing', false)
  .action(async (options) => {
    console.log(chalk.cyan(`[clone-v3 v${PACKAGE_VERSION}] apply-kit`));
    console.log(chalk.gray(`Tokens: ${options.tokens}`));
    console.log(chalk.gray(`Target: ${options.target}`));
    console.log(chalk.gray(`Mode:   ${options.merge ? 'merge' : 'overwrite'}`));
    console.log(chalk.gray('Kit-apply not yet implemented — see Phase 5'));
  });

program
  .command('build <research-dir>')
  .description('Phase 6-8: build V3 page from existing extraction (specs in research-dir)')
  .requiredOption('-t, --target <name>', 'WP target profile name')
  .option('-s, --strictness <level>', 'Pixel-match strictness: draft|balanced|pixel-perfect', 'balanced')
  .option('--dry-run', 'Generate specs only, no MCP calls', false)
  .action(async (researchDir, options) => {
    console.log(chalk.cyan(`[clone-v3 v${PACKAGE_VERSION}] build`));
    console.log(chalk.gray(`Research: ${researchDir}`));
    console.log(chalk.gray(`Target:   ${options.target}`));
    console.log(chalk.gray('Build not yet implemented — see Phase 6-8'));
  });

program
  .command('diff [url]')
  .description('Compare source extraction vs previous build (no MCP, no Playwright)')
  .option('-u, --url <url>', 'Source URL (or read from state.json)')
  .option('-o, --output <dir>', 'Research output directory', './research')
  .option('--save-snapshots', 'Save current extraction as new baseline (previous-sections.json)', false)
  .action(async (url: string | undefined, options) => {
    console.log(chalk.cyan(`[clone-v3 v${PACKAGE_VERSION}] diff`));
    try {
      const sourceUrl = options.url ?? url;
      if (!sourceUrl) {
        console.error(chalk.red('Error: URL required (--url or positional arg).'));
        process.exit(2);
      }
      const hostname = hostnameFromUrl(sourceUrl);
      const researchDir = path.join(options.output, hostname);
      const report = await runDiffOnly({ researchDir, url: sourceUrl });
      console.log(chalk.cyan(formatDiffReport(report)));
      if (options.saveSnapshots) {
        const { loadExtractionResult } = await import('./diff-only.js');
        const extraction = await loadExtractionResult(researchDir);
        const snapshots = snapshotSections(extraction);
        const savedPath = await saveSnapshots(researchDir, snapshots);
        console.log(chalk.green(`[diff] saved new baseline → ${savedPath}`));
      }
    } catch (err) {
      console.error(chalk.red('Diff failed:'), err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command('add-target')
  .description('Interactively add a WP target profile (saves to ~/.clone-v3/profiles.json)')
  .action(async () => {
    console.log(chalk.cyan(`[clone-v3 v${PACKAGE_VERSION}] add-target`));
    console.log(chalk.gray('Target setup not yet implemented — see Phase 1'));
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red('Error:'), err);
  process.exit(1);
});

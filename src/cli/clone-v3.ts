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

import { PACKAGE_VERSION } from '../lib/version.js';

const program = new Command();

program
  .name('clone-v3')
  .description('Clone any live website to Elementor V3 — pixel-accurate, on any WordPress with the Novamira plugin.')
  .version(PACKAGE_VERSION);

// Top-level clone command — full pipeline.
program
  .command('clone [url]')
  .description('Full pipeline: extract → design-tokens → section-picker → assets → design-system → build → QA')
  .option('-t, --target <name>', 'WP target profile name (e.g. solar-local)')
  .option('--viewports <list>', 'Comma-separated viewport widths (e.g. 1440,768,390)', '1440,768,390')
  .option('-a, --animations <strategy>', 'Animation strategy: none|css|gsap|auto', 'auto')
  .option('-f, --fonts <strategy>', 'Font strategy: auto|system|all', 'auto')
  .option('-s, --strictness <level>', 'Pixel-match strictness: draft|balanced|pixel-perfect', 'balanced')
  .option('--auto-pick-sections', 'Skip interactive section picker, pick all detected sections', false)
  .option('--sections <list>', 'Comma-separated section IDs to build (overrides picker)')
  .option('--source-auth <name>', 'Use named source auth from source-auth.json')
  .option('--no-wizard', 'Run non-interactively (CI/CD mode)')
  .option('--resume <state.json>', 'Resume from a saved state file')
  .option('-o, --output <dir>', 'Research output directory', './research')
  .option('--dry-run', 'Generate specs only, no MCP calls', false)
  .option('--diff-only', 'Compare against existing V3 page, do not build', false)
  .action(async (url, options) => {
    console.log(chalk.cyan(`[clone-v3 v${PACKAGE_VERSION}] full pipeline`));
    console.log(chalk.gray(`URL: ${url ?? '(from --resume or wizard)'}`));
    console.log(chalk.gray('Full pipeline not yet implemented — see BAUPLAN-SITE-CLONE-TO-V3.md Phase 1-8'));
    if (options.dryRun) {
      console.log(chalk.yellow('[dry-run] would generate specs without MCP calls'));
    }
  });

// extract — Phase 2 only.
program
  .command('extract <url>')
  .description('Phase 2: Playwright extraction (screenshots, DOM, styles, animations, fonts, css-vars)')
  .option('-o, --output <dir>', 'Research output directory', './research')
  .option('--viewports <list>', 'Comma-separated viewport widths', '1440,768,390')
  .option('--source-auth <name>', 'Use named source auth from source-auth.json')
  .action(async (url, _options) => {
    console.log(chalk.cyan(`[clone-v3 v${PACKAGE_VERSION}] extract`));
    console.log(chalk.gray(`URL: ${url}`));
    console.log(chalk.gray('Extraction not yet implemented — see Phase 2'));
  });

// extract-tokens — Phase 2 + 2.5.
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

// apply-kit — Phase 5 standalone.
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

// build — Phase 6-8.
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

// diff — comparison mode.
program
  .command('diff <url>')
  .description('Compare original vs existing V3 page without rebuilding')
  .requiredOption('-t, --target <name>', 'WP target profile name')
  .requiredOption('--post <id>', 'Existing WP post ID to compare against', parseInt)
  .action(async (url, options) => {
    console.log(chalk.cyan(`[clone-v3 v${PACKAGE_VERSION}] diff`));
    console.log(chalk.gray(`URL:        ${url}`));
    console.log(chalk.gray(`Target:     ${options.target}`));
    console.log(chalk.gray(`Post:       ${options.post}`));
    console.log(chalk.gray('Diff not yet implemented — see Phase 8'));
  });

// add-target — Phase 1 (WP target profile setup).
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

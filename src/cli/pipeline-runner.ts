/**
 * Pipeline Runner (Phase 9 — Wizard-Integration)
 *
 * Wraps runPipeline() from analysis/pipeline.ts with:
 *   - CloneState integration (save state.json after each phase)
 *   - Resume support (skip phases marked 'completed' in state.json)
 *   - chalk-based progress reporting (color-coded per stage)
 *   - Error recovery (mark failed phases, allow resume from last good state)
 *
 * Used by the `clone` command in clone-v3.ts after the wizard gathers config.
 */
import { runPipeline, type PipelineResult, type StageName } from '../analysis/pipeline.js';
import type { WizardOptions, WizardResult } from './wizard.js';
import type { CloneState } from './state-manager.js';
import {
  saveState,
  stateFileFor,
  markCompleted,
  markFailed,
  markSkipped,
  isPhaseDone,
  reconcile,
  type PhaseName,
} from './state-manager.js';
import chalk from 'chalk';

/** Maps pipeline StageName to state-manager PhaseName. */
const STAGE_TO_PHASE: Record<StageName, PhaseName> = {
  extract: 'extract',
  classify: 'classify',
  assets: 'assets',
  tokens: 'tokens',
  build: 'build',
  animations: 'auto-fix', // animations → auto-fix (closest match in PhaseName; see BAUPLAN §9)
};

const PHASE_LABELS: Record<PhaseName, string> = {
  extract: 'Extract (Playwright)',
  classify: 'Classify (Section Picker)',
  assets: 'Assets (Download)',
  tokens: 'Design Tokens (MCP Sync)',
  'design-system': 'Design System',
  build: 'Build (V3 + V4)',
  qa: 'QA (Visual Diff)',
  'auto-fix': 'Animations (WPCode)',
};

export interface PipelineRunOptions extends WizardOptions {
  state: CloneState;
  stateFile: string;
  resumeMode: boolean;
}

export interface PipelineRunResult {
  pipelineResult?: PipelineResult;
  state: CloneState;
  stateFile: string;
}

/**
 * Runs the full pipeline with state tracking.
 *
 * On resume: skips phases already marked 'completed' in state.json.
 * On error: marks the phase as 'failed', saves state, and re-throws.
 */
export async function runWizardPipeline(
  wizardResult: WizardResult,
): Promise<PipelineRunResult> {
  const { state, resumeMode } = wizardResult;
  const stateFile = stateFileFor(state.outputDir, state.hostname);

  console.log(chalk.bold.cyan(`\n╭${'─'.repeat(56)}╮`));
  console.log(chalk.bold.cyan(`│  site-clone-to-v3 — Pipeline Execution${' '.repeat(22)}│`));
  console.log(chalk.bold.cyan(`╰${'─'.repeat(56)}╯`));
  console.log(chalk.gray(`  URL:      ${state.sourceUrl}`));
  console.log(chalk.gray(`  Output:   ${state.outputDir}/${state.hostname}`));
  if (resumeMode) {
    const nextPhase = reconcile(state);
    console.log(chalk.yellow(`  Resume:   from phase "${nextPhase}"`));
  }
  console.log('');

  // Determine which stages to skip based on state.json phase status
  const skipStages = new Set<number>();
  const stageNumbers: Record<StageName, number> = {
    extract: 1,
    classify: 2,
    assets: 3,
    tokens: 4,
    build: 5,
    animations: 6,
  };

  if (resumeMode) {
    for (const [stage, num] of Object.entries(stageNumbers)) {
      const phase = STAGE_TO_PHASE[stage as StageName];
      if (isPhaseDone(state, phase)) {
        skipStages.add(num);
        console.log(chalk.gray(`  ⏭ Skip stage ${num} (${stage}) — already completed`));
      }
    }
    console.log('');
  }

  // Run pipeline
  let pipelineResult: PipelineResult;
  try {
    pipelineResult = await runPipeline(state.sourceUrl, {
      url: state.sourceUrl,
      outputDir: `${state.outputDir}/${state.hostname}`,
      dryRun: false,
      syncToMcp: !!state.options.target, // Only sync if WP target configured
      skipStages: skipStages.size > 0 ? [...skipStages] : undefined,
    });
  } catch (err) {
    console.error(chalk.red(`\n✗ Pipeline failed: ${err instanceof Error ? err.message : err}`));

    // Mark the failing phase
    const nextPhase = reconcile(state);
    if (nextPhase) {
      markFailed(state, nextPhase, err instanceof Error ? err.message : String(err));
      await saveState(stateFile, state);
      console.log(chalk.gray(`  State saved → ${stateFile} (resume from "${nextPhase}")`));
    }

    throw err;
  }

  // Update state.json after successful pipeline run
  await syncStateFromPipeline(state, stateFile, pipelineResult);

  // ── Print pipeline summary ──
  printPipelineSummary(pipelineResult);

  return { pipelineResult, state, stateFile };
}

/**
 * Syncs CloneState phases with pipeline stage results.
 * Marks each stage as completed/skipped and saves state.json.
 */
async function syncStateFromPipeline(
  state: CloneState,
  stateFile: string,
  pipelineResult: PipelineResult,
): Promise<void> {
  for (const stage of pipelineResult.stages) {
    const phase = STAGE_TO_PHASE[stage.name];

    switch (stage.status) {
      case 'ok':
        markCompleted(state, phase, { ...pipelineResult.artifacts });
        break;
      case 'skipped':
        markSkipped(state, phase);
        break;
      case 'failed':
        markFailed(state, phase, stage.error ?? 'unknown error');
        break;
    }
  }

  await saveState(stateFile, state);
}

function printPipelineSummary(result: PipelineResult): void {
  const totalMs = result.stages.reduce((sum, s) => sum + s.durationMs, 0);
  const okCount = result.stages.filter((s) => s.status === 'ok').length;
  const skippedCount = result.stages.filter((s) => s.status === 'skipped').length;
  const failedCount = result.stages.filter((s) => s.status === 'failed').length;

  console.log(chalk.bold.cyan(`\n╭${'─'.repeat(56)}╮`));
  console.log(chalk.bold.cyan(`│  Pipeline Complete${' '.repeat(39)}│`));
  console.log(chalk.bold.cyan(`╰${'─'.repeat(56)}╯`));
  console.log(
    chalk.gray(
      `  ${okCount} ok · ${skippedCount} skipped · ${failedCount} failed · ${totalMs}ms total`,
    ),
  );
  console.log('');

  for (const stage of result.stages) {
    const label = PHASE_LABELS[STAGE_TO_PHASE[stage.name]] ?? stage.name;
    const icon =
      stage.status === 'ok'
        ? chalk.green('✓')
        : stage.status === 'skipped'
          ? chalk.gray('⏭')
          : chalk.red('✗');
    const timing = chalk.gray(`(${stage.durationMs}ms)`);
    console.log(`  ${icon} ${chalk.white(label)} ${timing}`);

    if (stage.status === 'failed' && stage.error) {
      console.log(chalk.red(`    Error: ${stage.error}`));
    }
  }

  console.log('');
  console.log(chalk.bold('Artifacts:'));
  for (const [key, filepath] of Object.entries(result.artifacts)) {
    console.log(chalk.gray(`  ${key}: ${filepath}`));
  }
  console.log('');
}

/**
 * Post-extraction review: show detected design tokens for user approval.
 * Called after Stage 1 (extract) completes, before proceeding to remaining stages.
 *
 * DesignTokens uses a semantic record model (colors is Record<SemanticColor, ColorToken|null>,
 * fonts is {heading, body, mono}, spacing is {sectionPadding, containerWidth}).
 */
export async function reviewDesignTokens(
  _wizardOpts: WizardOptions,
  pipelineResult: PipelineResult,
): Promise<void> {
  const extraction = pipelineResult.extraction;
  if (!extraction?.designTokens) {
    console.log(chalk.gray('  No design tokens detected — skipping review.'));
    return;
  }

  const tokens = extraction.designTokens;
  const colorKeys = Object.keys(tokens.colors).filter(
    (k) => tokens.colors[k as keyof typeof tokens.colors] !== null,
  );
  const fontKeys = Object.keys(tokens.fonts).filter(
    (k) => tokens.fonts[k as keyof typeof tokens.fonts] !== undefined,
  );
  const spacing = tokens.spacing;

  console.log(chalk.bold.cyan('\n╭── Design Token Review ──╮'));
  console.log(
    chalk.gray(
      `  ${colorKeys.length} colors · ${fontKeys.length} fonts · spacing detected`,
    ),
  );

  if (colorKeys.length > 0) {
    console.log(chalk.white('\n  Colors:'));
    for (const key of colorKeys.slice(0, 12)) {
      const token = tokens.colors[key as keyof typeof tokens.colors];
      const hex = token?.hex ?? '';
      console.log(`    ${chalk.hex(hex || '#888')('■')} ${key}  ${chalk.gray(hex)}`);
    }
    if (colorKeys.length > 12) {
      console.log(chalk.gray(`    ... and ${colorKeys.length - 12} more`));
    }
  }

  if (fontKeys.length > 0) {
    console.log(chalk.white('\n  Fonts:'));
    for (const key of fontKeys) {
      const font = tokens.fonts[key as keyof typeof tokens.fonts];
      console.log(chalk.gray(`    ${key}: ${font?.family ?? 'system'}`));
    }
  }

  console.log(
    chalk.gray(
      `\n  Spacing: section-padding=${spacing.sectionPadding}px, container-width=${spacing.containerWidth}px`,
    ),
  );
  console.log(chalk.gray('  (Token sync runs in Stage 4 with --sync-to-mcp)'));
  console.log('');
}

/**
 * Post-classification review: show detected sections.
 * Called after Stage 2 (classify) completes, if running interactively.
 */
export async function reviewSections(
  _wizardOpts: WizardOptions,
  pipelineResult: PipelineResult,
): Promise<void> {
  const classification = pipelineResult.classification;
  if (!classification?.specs || classification.specs.length === 0) {
    console.log(chalk.gray('  No sections detected — skipping review.'));
    return;
  }

  console.log(chalk.bold.cyan('\n╭── Section Review ──╮'));
  console.log(chalk.gray(`  ${classification.specs.length} sections classified:`));
  console.log('');

  for (const spec of classification.specs.slice(0, 15)) {
    const id = spec.section_id ?? '?';
    const selector = spec.source?.selector ?? id;
    console.log(chalk.gray(`  [${id}] ${selector}`));
  }

  if (classification.specs.length > 15) {
    console.log(chalk.gray(`  ... and ${classification.specs.length - 15} more`));
  }

  console.log(
    chalk.gray(
      `\n  Approved: ${classification.selectedManifest?.approved_count ?? classification.specs.length}`,
    ),
  );
  console.log(
    chalk.gray(
      `  Skipped:  ${classification.selectedManifest?.skipped_count ?? 0}`,
    ),
  );
  console.log('');
}

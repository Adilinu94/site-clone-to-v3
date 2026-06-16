import chalk from 'chalk';
import { confirm } from '@inquirer/prompts';
import { hostnameFromUrl } from '../lib/paths.js';
import {
  createInitialState,
  loadState,
  saveState,
  stateFileFor,
  reconcile,
  approvedSectionIds,
  type CloneState,
  type PhaseName,
} from './state-manager.js';
import {
  promptUrl,
  promptTarget,
  promptViewports,
  promptAnimation,
  promptFonts,
  promptStrictness,
  promptSections,
  promptAutoPick,
  promptResume,
  summaryFor,
  type AnimationStrategy,
  type FontStrategy,
  type StrictnessLevel,
  type SectionChoice,
  type TargetOption,
} from './prompts.js';

export interface WizardOptions {
  url?: string;
  target?: string;
  viewports?: number[];
  animations?: AnimationStrategy;
  fonts?: FontStrategy;
  strictness?: StrictnessLevel;
  autoPickSections?: boolean;
  sections?: string[];
  sourceAuth?: string;
  resume?: string;
  output: string;
  interactive: boolean;
  detectedSections?: SectionChoice[];
  targets?: TargetOption[];
  /** Deployed clone page URL for QA stage (e.g. https://solar.local/?p=1234). */
  cloneUrl?: string;
}

export interface WizardResult {
  state: CloneState;
  resumeMode: boolean;
  dryRun: boolean;
  interactive: boolean;
  /** Deployed clone page URL for QA stage. */
  cloneUrl?: string;
}

export interface LoadedState {
  state: CloneState;
  stateFile: string;
}

async function step1Url(opts: WizardOptions): Promise<string> {
  if (opts.url) return opts.url;
  return promptUrl();
}

async function step2Target(opts: WizardOptions): Promise<string | undefined> {
  if (opts.target) return opts.target;
  if (!opts.interactive) return undefined;
  return promptTarget(opts.targets ?? []);
}

async function step3Viewports(opts: WizardOptions): Promise<number[]> {
  if (opts.viewports) return opts.viewports;
  if (!opts.interactive) return [1440, 768, 390];
  return promptViewports();
}

async function step4Animations(opts: WizardOptions): Promise<AnimationStrategy> {
  if (opts.animations) return opts.animations;
  if (!opts.interactive) return 'auto';
  return promptAnimation();
}

async function step5Fonts(opts: WizardOptions): Promise<FontStrategy> {
  if (opts.fonts) return opts.fonts;
  if (!opts.interactive) return 'auto';
  return promptFonts();
}

async function step6Strictness(opts: WizardOptions): Promise<StrictnessLevel> {
  if (opts.strictness) return opts.strictness;
  if (!opts.interactive) return 'balanced';
  return promptStrictness();
}

async function step7Sections(
  opts: WizardOptions,
  state: CloneState,
): Promise<string[]> {
  if (opts.sections && opts.sections.length > 0) return opts.sections;
  if (opts.autoPickSections) return opts.detectedSections?.map((s) => s.id) ?? [];
  if (!opts.interactive) return [];
  if (!opts.detectedSections || opts.detectedSections.length === 0) return [];

  const autoPick = await promptAutoPick();
  if (autoPick) {
    return opts.detectedSections.map((s) => s.id);
  }
  const selected = await promptSections(opts.detectedSections);
  for (const s of selected) {
    if (!approvedSectionIds(state).includes(s)) {
      state.approvedSections.push({ sectionId: s, approved: true });
    }
  }
  return selected;
}

export async function runWizard(opts: WizardOptions): Promise<WizardResult> {
  const url = await step1Url(opts);
  const hostname = hostnameFromUrl(url);
  const stateFile = opts.resume ?? stateFileFor(opts.output, hostname);

  let state: CloneState;
  let resumeMode = false;

  if (opts.resume) {
    try {
      state = await loadState(opts.resume);
      resumeMode = true;
      console.log(chalk.cyan(`[wizard] Resuming from ${opts.resume}`));
    } catch (err) {
      throw new Error(
        `Could not load resume file: ${err instanceof Error ? err.message : err}`,
      );
    }
  } else {
    try {
      await loadState(stateFile);
      if (opts.interactive) {
        const useExisting = await promptResume(hostname);
        if (useExisting) {
          state = await loadState(stateFile);
          resumeMode = true;
          console.log(chalk.cyan(`[wizard] Resumed existing state for ${hostname}`));
        } else {
          state = await buildFreshState(opts, url);
        }
      } else {
        state = await buildFreshState(opts, url);
      }
    } catch {
      state = await buildFreshState(opts, url);
    }
  }

  const target = await step2Target(opts);
  if (target) state.options.target = target;

  const viewports = await step3Viewports(opts);
  state.options.viewports = viewports;

  const animations = await step4Animations(opts);
  state.options.animations = animations;

  const fonts = await step5Fonts(opts);
  state.options.fonts = fonts;

  const strictness = await step6Strictness(opts);
  state.options.strictness = strictness;

  const sections = await step7Sections(opts, state);
  state.approvedSections = sections.map((id) => ({ sectionId: id, approved: true }));

  await saveState(stateFile, state);

  const resumePhase: PhaseName | null = resumeMode ? reconcile(state) : null;

  if (opts.interactive) {
    console.log(chalk.bold('\n=== Clone Plan ==='));
    console.log(summaryFor(url, {
      target: state.options.target,
      viewports: state.options.viewports,
      animations: state.options.animations,
      fonts: state.options.fonts,
      strictness: state.options.strictness,
      sections,
    }));
    if (resumePhase) {
      console.log(chalk.yellow(`\nResume from phase: ${resumePhase}`));
    }
    const ok = await confirm({
      message: 'Proceed with this plan?',
      default: true,
    });
    if (!ok) {
      throw new Error('Aborted by user');
    }
  }

  // Wire cloneUrl into state for QA stage
  if (opts.cloneUrl) state.options.cloneUrl = opts.cloneUrl;

  return { state, resumeMode, dryRun: false, interactive: opts.interactive, cloneUrl: opts.cloneUrl };
}

async function buildFreshState(opts: WizardOptions, url: string): Promise<CloneState> {
  return createInitialState(url, opts.output, {
    target: opts.target,
    viewports: opts.viewports ?? [1440, 768, 390],
    animations: opts.animations ?? 'auto',
    fonts: opts.fonts ?? 'auto',
    strictness: opts.strictness ?? 'balanced',
    cloneUrl: opts.cloneUrl,
  });
}

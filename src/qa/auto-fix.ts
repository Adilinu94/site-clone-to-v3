import { promises as fs } from 'node:fs';
import path from 'node:path';
import { captureScreenshot, type CaptureResult } from './visual-capture.js';
import { diffScreenshots, type DiffResult } from './visual-diff.js';
import { computeSsim, type SsimResult } from './ssim.js';
import {
  detectIssues,
  type Issue,
  type DetectionResult,
  countBySeverity,
  countByType,
} from './issue-detector.js';
import {
  type Strictness,
  type StrictnessProfile,
  getProfile,
  shouldFix,
  passesTarget,
} from './strictness.js';

export interface AutoFixFixerContext {
  issue: Issue;
  round: number;
  attempt: number;
  previousAttempts: number;
}

export interface AutoFixFixer {
  type: Issue['type'];
  name: string;
  apply: (context: AutoFixFixerContext) => Promise<{ ok: boolean; message: string }>;
}

export interface AutoFixOptions {
  originalUrl: string;
  cloneUrl: string;
  outputDir: string;
  strictness: Strictness;
  fixers: AutoFixFixer[];
  captureAndDiff?: (
    originalUrl: string,
    cloneUrl: string,
    outputDir: string,
    label: string,
  ) => Promise<{ capture: CaptureResult; diff: DiffResult; ssim: SsimResult }>;
  onRoundComplete?: (round: RoundResult) => Promise<void> | void;
}

export interface RoundResult {
  round: number;
  issuesDetected: number;
  issuesFixed: number;
  issuesSkipped: number;
  matchPercentBefore: number;
  matchPercentAfter: number;
  ssimBefore: number;
  ssimAfter: number;
  fixes: Array<{ issue: Issue; ok: boolean; message: string }>;
  diffResult: DiffResult;
  ssimResult: SsimResult;
  detectionResult: DetectionResult;
  startedAt: string;
  finishedAt: string;
}

export interface AutoFixReport {
  strictness: Strictness;
  profile: StrictnessProfile;
  targetReached: boolean;
  totalRounds: number;
  finalMatchPercent: number;
  finalSsim: number;
  initialMatchPercent: number;
  initialSsim: number;
  rounds: RoundResult[];
  outstandingIssues: Issue[];
  generatedAt: string;
  startedAt: string;
}

const DEFAULT_CAPTURE_AND_DIFF = async (
  originalUrl: string,
  cloneUrl: string,
  outputDir: string,
  label: string,
): Promise<{ capture: CaptureResult; diff: DiffResult; ssim: SsimResult }> => {
  const capture = await captureScreenshot({
    url: cloneUrl,
    outputPath: path.join(outputDir, `${label}.png`),
    fullPage: true,
  });
  const originalCapture = await captureScreenshot({
    url: originalUrl,
    outputPath: path.join(outputDir, `original-${label}.png`),
    fullPage: true,
  });
  const diff = await diffScreenshots({
    originalPath: originalCapture.outputPath,
    clonePath: capture.outputPath,
    outputDiffPath: path.join(outputDir, `diff-${label}.png`),
  });
  const ssim = await computeSsim({
    originalPath: originalCapture.outputPath,
    clonePath: capture.outputPath,
  });
  return { capture, diff, ssim };
};

export async function runAutoFix(options: AutoFixOptions): Promise<AutoFixReport> {
  const profile = getProfile(options.strictness);
  await fs.mkdir(options.outputDir, { recursive: true });
  const captureAndDiff = options.captureAndDiff ?? DEFAULT_CAPTURE_AND_DIFF;

  const startedAt = new Date().toISOString();
  const rounds: RoundResult[] = [];
  const outstandingIssues: Issue[] = [];

  const initial = await captureAndDiff(options.originalUrl, options.cloneUrl, options.outputDir, 'round-0');
  const initialMatchPercent = initial.diff.matchPercent;
  const initialSsim = initial.ssim.matchPercent;

  let currentMatch = initialMatchPercent;
  let currentSsimResult: SsimResult = initial.ssim;
  let currentCapture = initial.capture;
  let currentDiff = initial.diff;

  if (passesTarget(currentMatch, options.strictness)) {
    return {
      strictness: options.strictness,
      profile,
      targetReached: true,
      totalRounds: 0,
      finalMatchPercent: currentMatch,
      finalSsim: currentSsimResult.matchPercent,
      initialMatchPercent,
      initialSsim,
      rounds: [
        {
          round: 0,
          issuesDetected: 0,
          issuesFixed: 0,
          issuesSkipped: 0,
          matchPercentBefore: currentMatch,
          matchPercentAfter: currentMatch,
          ssimBefore: currentSsimResult.matchPercent,
          ssimAfter: currentSsimResult.matchPercent,
          fixes: [],
          diffResult: currentDiff,
          ssimResult: currentSsimResult,
          detectionResult: {
            diff: currentDiff,
            issues: [],
            regionsDetected: 0,
            classifiedAt: startedAt,
          },
          startedAt,
          finishedAt: new Date().toISOString(),
        },
      ],
      outstandingIssues: [],
      generatedAt: new Date().toISOString(),
      startedAt,
    };
  }

  const fixAttempts = new Map<string, number>();

  for (let round = 1; round <= profile.maxRounds; round++) {
    const roundStart = new Date().toISOString();
    const matchBefore = currentMatch;
    const ssimBefore = currentSsimResult.matchPercent;

    const detection = await detectIssues({
      originalPath: path.join(options.outputDir, 'original-round-0.png'),
      clonePath: currentCapture.outputPath,
      diffPath: path.join(options.outputDir, `diff-detection-r${round}.png`),
    });

    const eligibleIssues = detection.issues.filter((issue) => {
      const key = `${issue.type}@${issue.region.x},${issue.region.y}`;
      const attempts = fixAttempts.get(key) ?? 0;
      return shouldFix(issue.severity, options.strictness) && attempts < 2;
    });

    const fixes: RoundResult['fixes'] = [];
    let issuesFixed = 0;
    let issuesSkipped = 0;

    for (const issue of eligibleIssues.slice(0, profile.maxFixesPerRound)) {
      const key = `${issue.type}@${issue.region.x},${issue.region.y}`;
      const attempts = fixAttempts.get(key) ?? 0;
      const fixer = options.fixers.find((f) => f.type === issue.type);
      if (!fixer) {
        issuesSkipped++;
        continue;
      }
      const result = await fixer.apply({
        issue,
        round,
        attempt: attempts + 1,
        previousAttempts: attempts,
      });
      fixAttempts.set(key, attempts + 1);
      fixes.push({ issue, ok: result.ok, message: result.message });
      if (result.ok) {
        issuesFixed++;
      } else {
        issuesSkipped++;
      }
    }

    const reMeasure = await captureAndDiff(
      options.originalUrl,
      options.cloneUrl,
      options.outputDir,
      `round-${round}`,
    );
    currentCapture = reMeasure.capture;
    currentDiff = reMeasure.diff;
    currentSsimResult = reMeasure.ssim;
    currentMatch = currentDiff.matchPercent;
    const ssimAfter = currentSsimResult.matchPercent;

    const roundResult: RoundResult = {
      round,
      issuesDetected: detection.issues.length,
      issuesFixed,
      issuesSkipped,
      matchPercentBefore: matchBefore,
      matchPercentAfter: currentMatch,
      ssimBefore,
      ssimAfter,
      fixes,
      diffResult: currentDiff,
      ssimResult: currentSsimResult,
      detectionResult: detection,
      startedAt: roundStart,
      finishedAt: new Date().toISOString(),
    };
    rounds.push(roundResult);

    if (options.onRoundComplete) {
      await options.onRoundComplete(roundResult);
    }

    if (passesTarget(currentMatch, options.strictness)) {
      break;
    }
  }

  const finalDetection = await detectIssues({
    originalPath: path.join(options.outputDir, 'original-round-0.png'),
    clonePath: currentCapture.outputPath,
    diffPath: path.join(options.outputDir, 'diff-final.png'),
  });
  outstandingIssues.push(...finalDetection.issues);

  const report: AutoFixReport = {
    strictness: options.strictness,
    profile,
    targetReached: passesTarget(currentMatch, options.strictness),
    totalRounds: rounds.length,
    finalMatchPercent: currentMatch,
    finalSsim: currentSsimResult.matchPercent,
    initialMatchPercent,
    initialSsim,
    rounds,
    outstandingIssues,
    generatedAt: new Date().toISOString(),
    startedAt,
  };

  await fs.writeFile(
    path.join(options.outputDir, 'auto-fix-report.json'),
    JSON.stringify(report, null, 2),
    'utf-8',
  );

  return report;
}

export function summarizeReport(report: AutoFixReport): {
  totalFixes: number;
  failedFixes: number;
  issuesByType: ReturnType<typeof countByType>;
  issuesBySeverity: ReturnType<typeof countBySeverity>;
  matchImprovement: number;
  roundsUsed: number;
  roundsAvailable: number;
} {
  const totalFixes = report.rounds.reduce((sum, r) => sum + r.issuesFixed, 0);
  const failedFixes = report.rounds.reduce(
    (sum, r) => sum + r.fixes.filter((f) => !f.ok).length,
    0,
  );
  return {
    totalFixes,
    failedFixes,
    issuesByType: countByType(report.outstandingIssues),
    issuesBySeverity: countBySeverity(report.outstandingIssues),
    matchImprovement: report.finalMatchPercent - report.initialMatchPercent,
    roundsUsed: report.totalRounds,
    roundsAvailable: report.profile.maxRounds,
  };
}

export function buildDefaultFixers(): AutoFixFixer[] {
  return [
    {
      type: 'color-mismatch',
      name: 'placeholder-color-fix',
      apply: async (ctx) => ({
        ok: false,
        message: `Color fix requires live MCP context — skipped (round=${ctx.round}, issue=${ctx.issue.type})`,
      }),
    },
    {
      type: 'font-missing',
      name: 'placeholder-font-fix',
      apply: async (ctx) => ({
        ok: false,
        message: `Font fix requires Fonts-Plugin MCP call — skipped (round=${ctx.round}, issue=${ctx.issue.type})`,
      }),
    },
    {
      type: 'layout-shift',
      name: 'placeholder-layout-fix',
      apply: async (ctx) => ({
        ok: false,
        message: `Layout fix requires elementor-edit-element MCP call — skipped (round=${ctx.round}, issue=${ctx.issue.type})`,
      }),
    },
    {
      type: 'image-broken',
      name: 'placeholder-image-fix',
      apply: async (ctx) => ({
        ok: false,
        message: `Image fix requires media upload MCP call — skipped (round=${ctx.round}, issue=${ctx.issue.type})`,
      }),
    },
    {
      type: 'size-mismatch',
      name: 'placeholder-size-fix',
      apply: async (ctx) => ({
        ok: false,
        message: `Size fix requires elementor-edit-element MCP call — skipped (round=${ctx.round}, issue=${ctx.issue.type})`,
      }),
    },
    {
      type: 'animation-inactive',
      name: 'placeholder-animation-fix',
      apply: async (ctx) => ({
        ok: false,
        message: `Animation fix requires WPCode execute-php MCP call — skipped (round=${ctx.round}, issue=${ctx.issue.type})`,
      }),
    },
  ];
}

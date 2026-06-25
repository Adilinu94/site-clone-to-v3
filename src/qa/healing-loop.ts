/**
 * Self-Healing Loop — Vision-QA-getriebene Iterations-Orchestrierung.
 *
 * Unterschied zu `auto-fix.ts` (pixel-diff-getrieben):
 * - Nutzt `runVisionQa` als primäres Qualitäts-Signal (semantisch, 0–100).
 * - Jede Iteration: Vision QA → Fixer anwenden → Screenshot neu aufnehmen → re-evaluate.
 * - Bricht ab wenn Score >= targetScore oder maxIterations erreicht.
 *
 * Design:
 * - `captureClone` ist injizierbar → Tests ohne Browser.
 * - Fixers sind optional — ohne Fixer läuft der Loop als reines Monitor-Tool.
 * - `onIterationComplete` Callback für Logging/Progress-UI.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { runVisionQa, type VisionQaResult, type VisionApiCallFn, type VisionIssue } from './vision-qa.js';
import type { AutoFixFixer, AutoFixFixerContext } from './auto-fix.js';
import type { IssueSeverity } from './strictness.js';
import type { IssueType } from './issue-detector.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HealingIterationResult {
  iteration: number;
  scoreBefore: number;
  scoreAfter: number;
  issuesFound: number;
  issueTypes: IssueType[];
  fixesApplied: number;
  fixesSucceeded: number;
  startedAt: string;
  finishedAt: string;
}

export interface HealingLoopReport {
  totalIterations: number;
  initialScore: number;
  finalScore: number;
  targetScore: number;
  targetReached: boolean;
  iterations: HealingIterationResult[];
  visionResults: VisionQaResult[];
  generatedAt: string;
  startedAt: string;
}

/**
 * Injectable Screenshot-Capture-Funktion für Tests.
 * Schreibt das Screenshot-PNG in `outputPath` und gibt diesen Pfad zurück.
 */
export type CaptureFn = (cloneUrl: string, outputPath: string) => Promise<string>;

export interface HealingLoopOptions {
  /** URL der Original-Seite (für Vision QA Kontext). */
  originalPath: string;
  /** Aktueller Clone-Screenshot-Pfad (wird nach jeder Iteration aktualisiert). */
  clonePath: string;
  /** Clone-URL — wird von captureClone genutzt, um nach Fixes neu zu capturen. */
  cloneUrl?: string;
  /** Verzeichnis für Zwischen-Screenshots + Report. */
  outputDir: string;
  /** Ziel-Score (0–100). Default: 90. */
  targetScore?: number;
  /** Max. Iterationen. Default: 3. */
  maxIterations?: number;
  /** Fixer-Array (kompatibel mit AutoFixFixer). Ohne Fixer: reiner Monitor-Modus. */
  fixers?: AutoFixFixer[];
  /** API-Key für Vision QA. Default: ANTHROPIC_API_KEY env var. */
  visionApiKey?: string;
  /** Override für Vision-API-Call (Tests). */
  callApi?: VisionApiCallFn;
  /** Override für Screenshot-Capture nach Fixes (Tests). */
  captureClone?: CaptureFn;
  /** Callback nach jeder Iteration. */
  onIterationComplete?: (result: HealingIterationResult) => void | Promise<void>;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Konvertiert einen VisionIssue in den AutoFixFixerContext.
 * Da Vision-Issues keine Pixel-Regionen haben, wird eine Schätz-Region aus dem
 * Location-String abgeleitet (hinreichend für Fixer die nur type/severity brauchen).
 */
function toFixerContext(issue: VisionIssue, iteration: number): AutoFixFixerContext {
  return {
    issue: {
      type: issue.type,
      severity: issue.severity as IssueSeverity,
      region: { x: 0, y: 0, width: 1440, height: 100 },
      diffPixels: 0,
      description: `[${issue.location}] ${issue.description}`,
      suggestedFix: issue.suggestedFix,
    },
    round: iteration,
    attempt: 1,
    previousAttempts: 0,
  };
}

async function defaultCaptureClone(cloneUrl: string, outputPath: string): Promise<string> {
  // Lazy import to avoid requiring playwright in test environments
  const { chromium } = await import('playwright');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(cloneUrl, { waitUntil: 'networkidle', timeout: 60_000 });
    const buf = await page.screenshot({ fullPage: true });
    await fs.writeFile(outputPath, buf);
    return outputPath;
  } finally {
    await browser.close();
  }
}

// ─── Core ────────────────────────────────────────────────────────────────────

/**
 * Führt den Self-Healing Loop aus.
 *
 * @example
 * const report = await runHealingLoop({
 *   originalPath: 'qa/original.png',
 *   clonePath: 'qa/clone.png',
 *   cloneUrl: 'https://test4.nick-webdesign.de/?p=1989',
 *   outputDir: 'qa/healing',
 *   targetScore: 90,
 *   maxIterations: 3,
 *   fixers: createRealFixers({ mcp: mcpCallFn, postId: 1989, resolver }),
 * });
 */
export async function runHealingLoop(options: HealingLoopOptions): Promise<HealingLoopReport> {
  const targetScore = options.targetScore ?? 90;
  const maxIterations = options.maxIterations ?? 3;
  const fixers = options.fixers ?? [];
  const captureClone = options.captureClone ?? (options.cloneUrl
    ? (url: string, out: string) => defaultCaptureClone(url, out)
    : null);

  await fs.mkdir(options.outputDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const iterations: HealingIterationResult[] = [];
  const visionResults: VisionQaResult[] = [];

  // Initial Vision QA
  const initial = await runVisionQa({
    originalPath: options.originalPath,
    clonePath: options.clonePath,
    apiKey: options.visionApiKey,
    callApi: options.callApi,
  });
  visionResults.push(initial);

  const initialScore = initial.overallScore;
  let currentScore = initialScore;
  let currentClonePath = options.clonePath;

  if (currentScore >= targetScore) {
    const report: HealingLoopReport = {
      totalIterations: 0,
      initialScore,
      finalScore: currentScore,
      targetScore,
      targetReached: true,
      iterations: [],
      visionResults,
      generatedAt: new Date().toISOString(),
      startedAt,
    };
    await writeReport(report, options.outputDir);
    return report;
  }

  for (let i = 1; i <= maxIterations; i++) {
    const iterStart = new Date().toISOString();
    const scoreBefore = currentScore;
    const currentVision = visionResults[visionResults.length - 1];

    // Apply fixers for all issues in current vision result
    let fixesApplied = 0;
    let fixesSucceeded = 0;

    for (const issue of currentVision.issues) {
      const fixer = fixers.find((f) => f.type === issue.type);
      if (!fixer) continue;
      const ctx = toFixerContext(issue, i);
      try {
        const result = await fixer.apply(ctx);
        fixesApplied++;
        if (result.ok) fixesSucceeded++;
      } catch {
        fixesApplied++;
      }
    }

    // Re-capture clone after fixes (only if captureClone is available)
    if (captureClone && options.cloneUrl) {
      const newClonePath = path.join(options.outputDir, `clone-iter-${i}.png`);
      currentClonePath = await captureClone(options.cloneUrl, newClonePath);
    }

    // Re-evaluate with Vision QA
    const newVision = await runVisionQa({
      originalPath: options.originalPath,
      clonePath: currentClonePath,
      apiKey: options.visionApiKey,
      callApi: options.callApi,
    });
    visionResults.push(newVision);
    currentScore = newVision.overallScore;

    const iterResult: HealingIterationResult = {
      iteration: i,
      scoreBefore,
      scoreAfter: currentScore,
      issuesFound: currentVision.issues.length,
      issueTypes: currentVision.issues.map((iss) => iss.type),
      fixesApplied,
      fixesSucceeded,
      startedAt: iterStart,
      finishedAt: new Date().toISOString(),
    };
    iterations.push(iterResult);

    if (options.onIterationComplete) {
      await options.onIterationComplete(iterResult);
    }

    if (currentScore >= targetScore) break;
  }

  const report: HealingLoopReport = {
    totalIterations: iterations.length,
    initialScore,
    finalScore: currentScore,
    targetScore,
    targetReached: currentScore >= targetScore,
    iterations,
    visionResults,
    generatedAt: new Date().toISOString(),
    startedAt,
  };

  await writeReport(report, options.outputDir);
  return report;
}

async function writeReport(report: HealingLoopReport, outputDir: string): Promise<void> {
  await fs.writeFile(
    path.join(outputDir, 'healing-loop-report.json'),
    JSON.stringify(report, null, 2),
    'utf-8',
  );
}

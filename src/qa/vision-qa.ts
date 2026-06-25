/**
 * Vision QA — semantische Screenshot-Analyse via Anthropic Vision API.
 *
 * Vergleicht zwei Screenshots (Original vs. Clone) und gibt strukturiertes
 * Feedback zurück: Score 0–100, typisierte Issues, freier Kommentar.
 *
 * Design:
 * - `callApi` ist injizierbar → echte Tests ohne HTTP.
 * - API-Key kommt aus `options.apiKey` oder `process.env.ANTHROPIC_API_KEY`.
 * - Alle Issue-Types/Severities sind kompatibel mit `issue-detector.ts`.
 */

import { promises as fs } from 'node:fs';
import type { IssueType } from './issue-detector.js';
import type { IssueSeverity } from './strictness.js';

export type VisionMatchRating = 'excellent' | 'good' | 'fair' | 'poor';

export interface VisionIssue {
  type: IssueType;
  severity: IssueSeverity;
  location: string;
  description: string;
  suggestedFix: string;
}

export interface VisionQaResult {
  overallScore: number;
  matchRating: VisionMatchRating;
  issues: VisionIssue[];
  semanticFeedback: string;
  computedAt: string;
}

/**
 * Injectable API-Funktion für Tests.
 * Erhält beide Bilder als base64-Strings und gibt den rohen Modell-Text zurück.
 */
export type VisionApiCallFn = (
  originalBase64: string,
  cloneBase64: string,
  mediaType: 'image/png' | 'image/jpeg',
) => Promise<string>;

export interface VisionQaOptions {
  originalPath: string;
  clonePath: string;
  sourceUrl?: string;
  cloneUrl?: string;
  apiKey?: string;
  /** Override für Tests — wenn gesetzt, wird kein echter API-Call gemacht. */
  callApi?: VisionApiCallFn;
}

// ─── Prompts ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a visual QA expert for website cloning pipelines.
You receive two screenshots: the FIRST image is the ORIGINAL website, the SECOND is the CLONE built in WordPress/Elementor.
Respond ONLY with a JSON object — no markdown fences, no preamble, no trailing text.

JSON schema (strict):
{
  "overallScore": <integer 0-100, how well the clone matches the original>,
  "issues": [
    {
      "type": <one of: "color-mismatch"|"layout-shift"|"font-missing"|"size-mismatch"|"image-broken"|"animation-inactive"|"blank-region"|"size-different">,
      "severity": <"high"|"medium"|"low">,
      "location": <short string: e.g. "hero section", "navigation", "footer CTA">,
      "description": <one sentence describing the difference>,
      "suggestedFix": <one sentence suggesting a fix>
    }
  ],
  "semanticFeedback": <2-3 sentences overall assessment>
}

Scoring guide:
- 95-100: Nearly identical, only micro-differences
- 85-94: Good match, minor visual differences
- 70-84: Acceptable, noticeable differences in specific areas
- 0-69: Poor, significant layout/color/content differences

Return issues only for visible, meaningful differences. Return an empty array if the match is excellent.`;

const USER_PROMPT = `First image = ORIGINAL. Second image = CLONE. Analyze and return JSON.`;

// ─── Core ────────────────────────────────────────────────────────────────────

function ratingFromScore(score: number): VisionMatchRating {
  if (score >= 95) return 'excellent';
  if (score >= 85) return 'good';
  if (score >= 70) return 'fair';
  return 'poor';
}

function clampScore(score: unknown): number {
  const n = typeof score === 'number' ? score : Number(score);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.max(0, Math.min(100, n)));
}

const VALID_TYPES = new Set<string>([
  'color-mismatch', 'layout-shift', 'font-missing', 'size-mismatch',
  'image-broken', 'animation-inactive', 'blank-region', 'size-different',
]);
const VALID_SEVERITIES = new Set<string>(['high', 'medium', 'low']);

function parseIssues(raw: unknown): VisionIssue[] {
  if (!Array.isArray(raw)) return [];
  const issues: VisionIssue[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const type = typeof obj['type'] === 'string' && VALID_TYPES.has(obj['type'])
      ? (obj['type'] as IssueType)
      : 'color-mismatch';
    const severity = typeof obj['severity'] === 'string' && VALID_SEVERITIES.has(obj['severity'])
      ? (obj['severity'] as IssueSeverity)
      : 'low';
    issues.push({
      type,
      severity,
      location: typeof obj['location'] === 'string' ? obj['location'] : 'unknown',
      description: typeof obj['description'] === 'string' ? obj['description'] : '',
      suggestedFix: typeof obj['suggestedFix'] === 'string' ? obj['suggestedFix'] : '',
    });
  }
  return issues;
}

function parseModelResponse(text: string): { score: number; issues: VisionIssue[]; feedback: string } {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    // Fallback: return a poor score with a single issue
    return {
      score: 0,
      issues: [{
        type: 'blank-region',
        severity: 'high',
        location: 'unknown',
        description: `Vision API returned non-JSON response: ${text.slice(0, 120)}`,
        suggestedFix: 'Check ANTHROPIC_API_KEY and model availability.',
      }],
      feedback: 'Vision analysis failed — response was not valid JSON.',
    };
  }
  return {
    score: clampScore(parsed['overallScore']),
    issues: parseIssues(parsed['issues']),
    feedback: typeof parsed['semanticFeedback'] === 'string' ? parsed['semanticFeedback'] : '',
  };
}

async function defaultCallApi(
  originalBase64: string,
  cloneBase64: string,
  mediaType: 'image/png' | 'image/jpeg',
  apiKey: string,
): Promise<string> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: originalBase64 } },
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: cloneBase64 } },
            { type: 'text', text: USER_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    throw new Error(`Anthropic API error ${resp.status}: ${await resp.text().catch(() => resp.statusText)}`);
  }

  const data = await resp.json() as { content?: Array<{ type: string; text: string }> };
  const block = data.content?.find((b) => b.type === 'text');
  if (!block) throw new Error('No text block in Anthropic API response');
  return block.text;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Analysiert zwei Screenshot-Dateien semantisch via Anthropic Vision.
 *
 * @example
 * const result = await runVisionQa({
 *   originalPath: 'qa/original.png',
 *   clonePath: 'qa/clone.png',
 * });
 * console.log(result.overallScore, result.matchRating, result.issues.length);
 */
export async function runVisionQa(options: VisionQaOptions): Promise<VisionQaResult> {
  const [originalBuf, cloneBuf] = await Promise.all([
    fs.readFile(options.originalPath),
    fs.readFile(options.clonePath),
  ]);

  const originalBase64 = originalBuf.toString('base64');
  const cloneBase64 = cloneBuf.toString('base64');
  const mediaType = options.originalPath.toLowerCase().endsWith('.jpg') ? 'image/jpeg' : 'image/png';

  let rawText: string;
  if (options.callApi) {
    rawText = await options.callApi(originalBase64, cloneBase64, mediaType);
  } else {
    const apiKey = options.apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '';
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for Vision QA (set env var or pass options.apiKey)');
    }
    rawText = await defaultCallApi(originalBase64, cloneBase64, mediaType, apiKey);
  }

  const { score, issues, feedback } = parseModelResponse(rawText);
  return {
    overallScore: score,
    matchRating: ratingFromScore(score),
    issues,
    semanticFeedback: feedback,
    computedAt: new Date().toISOString(),
  };
}

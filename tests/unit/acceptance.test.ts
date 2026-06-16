import { describe, it, expect } from 'vitest';
import { generateRecommendations, summarizeBatch, type AcceptanceReport } from '../../src/qa/acceptance.js';

function makeReport(diffPercent: number, width = 1440, height = 900): AcceptanceReport {
  return {
    verdict: diffPercent <= 15 ? 'pass' : 'fail',
    score: 1 - diffPercent / 100,
    matchPercent: 100 - diffPercent,
    originalCapture: {
      url: 'https://orig',
      outputPath: '/tmp/o.png',
      width,
      height,
      bytes: 1000,
      capturedAt: '2026-01-01T00:00:00Z',
    },
    cloneCapture: {
      url: 'https://clone',
      outputPath: '/tmp/c.png',
      width,
      height,
      bytes: 1000,
      capturedAt: '2026-01-01T00:00:00Z',
    },
    diffResult: {
      originalPath: '/tmp/o.png',
      clonePath: '/tmp/c.png',
      width,
      height,
      totalPixels: width * height,
      diffPixels: (width * height * diffPercent) / 100,
      diffPercent,
      matchPercent: 100 - diffPercent,
      computedAt: '2026-01-01T00:00:00Z',
    },
    recommendations: [],
    generatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('acceptance (recommendations)', () => {
  it('warns on low match', () => {
    const recs = generateRecommendations(makeReport(30).diffResult, 0.85);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0]).toMatch(/below threshold/);
  });

  it('warns on zero dimensions', () => {
    const recs = generateRecommendations(makeReport(5, 0, 0).diffResult, 0.85);
    expect(recs.some((r) => r.match(/zero dimensions/))).toBe(true);
  });

  it('warns on 100% mismatch', () => {
    const recs = generateRecommendations(makeReport(100).diffResult, 0.85);
    expect(recs.some((r) => r.match(/Complete visual mismatch/))).toBe(true);
  });

  it('celebrates excellent match', () => {
    const recs = generateRecommendations(makeReport(2).diffResult, 0.85);
    expect(recs.some((r) => r.match(/Excellent visual match/))).toBe(true);
  });

  it('provides tuning advice for good match', () => {
    const recs = generateRecommendations(makeReport(10).diffResult, 0.85);
    expect(recs.some((r) => r.match(/Acceptable match|Fine-tune/))).toBe(true);
  });
});

describe('summarizeBatch', () => {
  it('returns zeros for empty batch', async () => {
    const result = await summarizeBatch([]);
    expect(result).toEqual({ total: 0, passed: 0, failed: 0, warnings: 0, averageScore: 0 });
  });

  it('aggregates pass/fail/warning counts and average score', async () => {
    const reports: AcceptanceReport[] = [
      { ...makeReport(5), verdict: 'pass' as const },     // score 0.95
      { ...makeReport(10), verdict: 'pass' as const },    // score 0.90
      { ...makeReport(20), verdict: 'warning' as const }, // score 0.80
      { ...makeReport(50), verdict: 'fail' as const },    // score 0.50
    ];
    const result = await summarizeBatch(reports);
    expect(result.total).toBe(4);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.warnings).toBe(1);
    // average = (0.95 + 0.90 + 0.80 + 0.50) / 4 = 0.7875
    expect(result.averageScore).toBeCloseTo(0.7875, 4);
  });
});

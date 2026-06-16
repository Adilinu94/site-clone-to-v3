import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitForHydration } from '../../src/extractor/hydration-wait.js';

describe('hydration-wait', () => {
  let mockPage: any;

  beforeEach(() => {
    mockPage = {
      waitForSelector: vi.fn(),
      evaluate: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('selector strategy', () => {
    it('returns strategy=selector when a known marker is found', async () => {
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(undefined);
      vi.useFakeTimers();
      const promise = waitForHydration(mockPage, { introAnimationSleepMs: 10 });
      // Advance fake timers so the internal sleep() resolves
      await vi.advanceTimersByTimeAsync(20);
      const result = await promise;
      expect(result.strategy).toBe('selector');
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('passes the combined selector list to waitForSelector', async () => {
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(undefined);
      vi.useFakeTimers();
      const promise = waitForHydration(mockPage, { introAnimationSleepMs: 5 });
      await vi.advanceTimersByTimeAsync(10);
      await promise;
      const [selectorArg] = mockPage.waitForSelector.mock.calls[0];
      expect(selectorArg).toContain('[data-hydrated="true"]');
      expect(selectorArg).toContain('#__next[data-hydrated]');
      expect(selectorArg).toContain('[ng-version]');
    });

    it('uses custom selectorTimeoutMs', async () => {
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(undefined);
      vi.useFakeTimers();
      const promise = waitForHydration(mockPage, {
        introAnimationSleepMs: 5,
        selectorTimeoutMs: 7777,
      });
      await vi.advanceTimersByTimeAsync(10);
      await promise;
      const [, opts] = mockPage.waitForSelector.mock.calls[0];
      expect(opts.timeout).toBe(7777);
    });
  });

  describe('observer fallback', () => {
    it('falls back to MutationObserver when selector times out', async () => {
      mockPage.waitForSelector.mockRejectedValue(new Error('Timeout'));
      mockPage.evaluate.mockResolvedValue(undefined);
      vi.useFakeTimers();
      const promise = waitForHydration(mockPage, {
        selectorTimeoutMs: 1,
        idleStabilizationMs: 100,
        introAnimationSleepMs: 5,
      });
      await vi.advanceTimersByTimeAsync(20);
      const result = await promise;
      expect(result.strategy).toBe('observer');
      expect(mockPage.evaluate).toHaveBeenCalled();
    });

    it('inlines idleStabilizationMs into the IIFE script', async () => {
      mockPage.waitForSelector.mockRejectedValue(new Error('Timeout'));
      mockPage.evaluate.mockResolvedValue(undefined);
      vi.useFakeTimers();
      const promise = waitForHydration(mockPage, {
        selectorTimeoutMs: 1,
        idleStabilizationMs: 2500,
        introAnimationSleepMs: 1,
      });
      await vi.advanceTimersByTimeAsync(10);
      await promise;
      const [script] = mockPage.evaluate.mock.calls[0];
      // Sprint 2B uses string-form to satisfy Playwright's EvaluationArgument
      expect(typeof script).toBe('string');
      expect(script).toContain('MutationObserver');
      expect(script).toContain('2500');
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { triggerLazyLoad } from '../../src/extractor/lazy-scroll.js';

describe('lazy-scroll', () => {
  let mockPage: any;

  beforeEach(() => {
    mockPage = {
      evaluate: vi.fn(),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('scans document height first', async () => {
    mockPage.evaluate
      .mockResolvedValueOnce(3000) // document height
      .mockResolvedValueOnce(15); // step count from rAF loop
    const result = await triggerLazyLoad(mockPage, {
      stepPx: 200,
      maxStepMs: 5_000,
      networkIdleTimeoutMs: 100,
    });
    expect(result.documentHeightPx).toBe(3000);
    expect(result.stepCount).toBe(15);
    expect(result.scrolledPx).toBe(15 * 200);
  });

  it('resets scroll to top by default', async () => {
    mockPage.evaluate
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(5);
    await triggerLazyLoad(mockPage, { networkIdleTimeoutMs: 100 });
    // The 3rd evaluate should be the scrollTo(0, 0)
    const allCalls = mockPage.evaluate.mock.calls.map((c: any) => c[0]?.toString() ?? '');
    expect(allCalls.some((s: string) => s.includes('scrollTo'))).toBe(true);
  });

  it('does NOT reset scroll to top when resetToTop=false', async () => {
    mockPage.evaluate
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(5);
    await triggerLazyLoad(mockPage, {
      resetToTop: false,
      networkIdleTimeoutMs: 100,
    });
    const allCalls = mockPage.evaluate.mock.calls.map((c: any) => c[0]?.toString() ?? '');
    expect(allCalls.some((s: string) => s.includes('scrollTo'))).toBe(false);
  });

  it('waits for networkidle by default', async () => {
    mockPage.evaluate
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(5);
    await triggerLazyLoad(mockPage, { networkIdleTimeoutMs: 7_777 });
    expect(mockPage.waitForLoadState).toHaveBeenCalledWith('networkidle', { timeout: 7_777 });
  });

  it('skips networkidle wait when waitForNetworkIdle=false', async () => {
    mockPage.evaluate
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(5);
    await triggerLazyLoad(mockPage, { waitForNetworkIdle: false });
    expect(mockPage.waitForLoadState).not.toHaveBeenCalled();
  });

  it('inlines step size and max wait into the IIFE script', async () => {
    mockPage.evaluate
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(10);
    await triggerLazyLoad(mockPage, {
      stepPx: 500,
      maxStepMs: 12_345,
      networkIdleTimeoutMs: 100,
    });
    const [script] = mockPage.evaluate.mock.calls[1];
    expect(typeof script).toBe('string');
    expect(script).toContain('scrollBy');
    expect(script).toContain('500');
    expect(script).toContain('12345');
  });

  it('reports elapsed time', async () => {
    mockPage.evaluate
      .mockResolvedValueOnce(500)
      .mockResolvedValueOnce(3);
    const result = await triggerLazyLoad(mockPage, { networkIdleTimeoutMs: 50 });
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});

import { beforeEach } from 'vitest';

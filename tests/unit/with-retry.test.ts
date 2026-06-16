import { describe, it, expect } from 'vitest';
import { withRetry } from '../../src/lib/with-retry.js';

describe('withRetry', () => {
  it('returns the result on first success', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries up to maxRetries and then throws', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error('boom');
        },
        { maxRetries: 3, baseDelayMs: 1 },
      ),
    ).rejects.toThrow('boom');
    expect(calls).toBe(3);
  });

  it('succeeds on the second attempt', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 2) throw new Error('first fails');
        return 'recovered';
      },
      { maxRetries: 3, baseDelayMs: 1 },
    );
    expect(result).toBe('recovered');
    expect(calls).toBe(2);
  });
});

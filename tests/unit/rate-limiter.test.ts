import { describe, it, expect } from 'vitest';
import { RateLimiter, createDomainRateLimiter } from '../../src/scraper/rate-limiter.js';

describe('rate-limiter', () => {
  it('first acquire is immediate (no wait)', async () => {
    const limiter = new RateLimiter({ minDelayMs: 500 });
    const start = Date.now();
    await limiter.acquire('example.com');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('second acquire on same host waits ~minDelayMs', async () => {
    const limiter = new RateLimiter({ minDelayMs: 200 });
    await limiter.acquire('example.com');
    const start = Date.now();
    await limiter.acquire('example.com');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(180);
  });

  it('different hosts do not block each other', async () => {
    const limiter = new RateLimiter({ minDelayMs: 300 });
    const start = Date.now();
    await limiter.acquire('host-a.com');
    await limiter.acquire('host-b.com');
    const elapsed = Date.now() - start;
    // Both buckets independent — total < 100ms
    expect(elapsed).toBeLessThan(100);
  });

  it('acquireUrl extracts host from URL string', async () => {
    const limiter = new RateLimiter({ minDelayMs: 100 });
    await limiter.acquireUrl('https://example.com/foo');
    expect(limiter.peek('example.com')).toBeGreaterThan(Date.now() - 200);
  });

  it('createDomainRateLimiter defaults to 500ms', async () => {
    const limiter = createDomainRateLimiter();
    await limiter.acquire('example.com');
    const start = Date.now();
    await limiter.acquire('example.com');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(450);
  });

  it('onWait callback fires with the waited amount', async () => {
    const waits: Array<{ host: string; ms: number }> = [];
    const limiter = new RateLimiter({
      minDelayMs: 100,
      onWait: (host, ms) => waits.push({ host, ms }),
    });
    await limiter.acquire('a.com');
    await limiter.acquire('a.com');
    expect(waits).toHaveLength(1);
    expect(waits[0].host).toBe('a.com');
    expect(waits[0].ms).toBeGreaterThanOrEqual(80);
  });

  it('reset() clears all buckets', async () => {
    const limiter = new RateLimiter({ minDelayMs: 500 });
    await limiter.acquire('example.com');
    limiter.reset();
    expect(limiter.peek('example.com')).toBeUndefined();
  });

  it('parallel acquires to same host serialize (not race)', async () => {
    const limiter = new RateLimiter({ minDelayMs: 100 });
    const start = Date.now();
    await Promise.all([
      limiter.acquire('example.com'),
      limiter.acquire('example.com'),
      limiter.acquire('example.com'),
    ]);
    const elapsed = Date.now() - start;
    // At least 2 buckets consumed → at least ~100ms wait for the 2nd/3rd
    expect(elapsed).toBeGreaterThanOrEqual(180);
  });
});
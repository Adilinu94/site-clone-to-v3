/**
 * Per-host rate limiter (V2 Pre-Flight).
 *
 * Token-bucket style: each domain gets its own bucket with `minDelayMs`
 * between consecutive calls. The bucket is "spent" as soon as we call
 * `acquire()`, so two calls to the same domain in quick succession will
 * force the second one to wait.
 *
 * Intended use:
 *   const limiter = createDomainRateLimiter({ minDelayMs: 500 });
 *   await limiter.acquire('https://example.com');
 *   await fetch(...);
 *
 * Phase 1 also uses this inside the Interaction Sweep to enforce a 500ms
 * delay between clicks/hovers (mitigates Cloudflare/Akamai bot-detection).
 */

export interface RateLimiterOptions {
  /** Minimum delay between consecutive requests to the same domain (ms). */
  minDelayMs?: number;
  /** Optional logger for skipped waits (helps debugging). */
  onWait?: (host: string, waitedMs: number) => void;
}

interface Bucket {
  nextAllowedAt: number;
  /** Pending acquire promise (so concurrent callers serialize). */
  pending?: Promise<void>;
}

export class RateLimiter {
  private readonly minDelayMs: number;
  private readonly onWait?: (host: string, waitedMs: number) => void;
  private readonly buckets = new Map<string, Bucket>();

  constructor(options: RateLimiterOptions = {}) {
    this.minDelayMs = Math.max(0, options.minDelayMs ?? 500);
    this.onWait = options.onWait;
  }

  /** Extract host from a URL. Returns '' for invalid URLs. */
  private hostOf(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }

  /**
   * Acquire permission to call `host`. Resolves when the bucket is full again.
   * Concurrent acquires to the same host are serialized via a per-host Promise chain.
   */
  async acquire(host: string): Promise<void> {
    const key = host || '*';
    const prev = this.buckets.get(key)?.pending ?? Promise.resolve();
    const next = prev.then(() => this.acquireOne(key));
    this.buckets.set(key, {
      nextAllowedAt: this.buckets.get(key)?.nextAllowedAt ?? 0,
      pending: next,
    });
    await next;
  }

  /** Single acquire (no chaining). */
  private async acquireOne(key: string): Promise<void> {
    const bucket = this.buckets.get(key) ?? { nextAllowedAt: 0 };
    const now = Date.now();
    const waitMs = bucket.nextAllowedAt - now;
    if (waitMs > 0) {
      this.onWait?.(key, waitMs);
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }
    bucket.nextAllowedAt = Date.now() + this.minDelayMs;
    this.buckets.set(key, bucket);
  }

  /** Convenience wrapper for URL strings. */
  async acquireUrl(url: string): Promise<void> {
    await this.acquire(this.hostOf(url));
  }

  /** Reset all buckets (test helper). */
  reset(): void {
    this.buckets.clear();
  }

  /** Inspect the current next-allowed-at for a host (test helper). */
  peek(host: string): number | undefined {
    return this.buckets.get(host)?.nextAllowedAt;
  }
}

/** Create a RateLimiter preset with the recommended defaults for V2 Pre-Flight. */
export function createDomainRateLimiter(options: RateLimiterOptions = {}): RateLimiter {
  return new RateLimiter({ minDelayMs: 500, ...options });
}
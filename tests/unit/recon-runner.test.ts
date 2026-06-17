import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildReconScript,
  parseReconResult,
  installReconListener,
  type PageLike,
} from '../../src/recon/index.js';
import { createMockWindow } from '../helpers/mock-window.js';

describe('recon/recon-runner', () => {
  describe('buildReconScript', () => {
    it('returns a stringified callable that returns events', () => {
      const script = buildReconScript({
        targetSelector: 'body',
        maxEvents: 100,
      });
      expect(typeof script).toBe('string');
      expect(script).toContain('MutationObserver');
    });

    it('includes config values in the emitted script', () => {
      const script = buildReconScript({
        targetSelector: '.hero',
        maxEvents: 50,
        watchedAttributes: ['class', 'data-state'],
      });
      expect(script).toContain('.hero');
      expect(script).toContain('50');
    });

    it('escapes quotes in targetSelector to prevent injection', () => {
      const script = buildReconScript({
        targetSelector: `body");alert("xss`,
        maxEvents: 10,
      });
      expect(script).not.toContain('alert("xss');
    });
  });

  describe('parseReconResult', () => {
    it('parses a serialized ReconResult JSON', () => {
      const json = JSON.stringify({
        events: [
          { type: 'mutation', selector: '.a', mutationType: 'attributes', attributeName: 'class' },
          { type: 'animation', selector: '.a', animationType: 'animationstart', animationName: 'fadeIn', elapsedTime: 0 },
        ],
        durationMs: 1234,
        error: null,
      });
      const result = parseReconResult(json);
      expect(result.events).toHaveLength(2);
      expect(result.durationMs).toBe(1234);
      expect(result.error).toBeNull();
    });

    it('returns empty result on malformed JSON', () => {
      const result = parseReconResult('not-json{');
      expect(result.events).toHaveLength(0);
      expect(result.error).toBeTruthy();
    });
  });

  describe('installReconListener (mock-page integration)', () => {
    it('returns result with durationMs when evaluator succeeds', async () => {
      const win = createMockWindow();
      const mockPage: PageLike = {
        evaluate: async <R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R> => {
          const script = arg as unknown as string;
          // minimal in-page eval: return a synthetic ReconResult JSON
          void win;
          void fn;
          return JSON.stringify({
            events: [{ type: 'mutation', selector: '.fade-in', mutationType: 'attributes' }],
            durationMs: 1234,
            error: null,
          }) as unknown as R;
          void script;
        },
      };
      const result = await installReconListener(mockPage, {
        targetSelector: '.fade-in',
        maxEvents: 50,
      });
      expect(result.events.length).toBeGreaterThan(0);
      expect(result.durationMs).toBe(1234);
    });

    it('returns empty result when evaluator throws', async () => {
      const errorPage: PageLike = {
        evaluate: async () => {
          throw new Error('Eval failed');
        },
      };
      const result = await installReconListener(errorPage, {
        targetSelector: '.x',
        maxEvents: 10,
      });
      expect(result.error).toContain('Eval failed');
    });
  });
});
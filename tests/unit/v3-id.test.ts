import { describe, it, expect } from 'vitest';
import { v3Id } from '../../src/lib/v3-id.js';

describe('v3Id', () => {
  it('generates a 7-character hex string', () => {
    const id = v3Id();
    expect(id).toMatch(/^[a-f0-9]{7}$/);
  });

  it('produces different IDs on consecutive calls', () => {
    const a = v3Id();
    const b = v3Id();
    const c = v3Id();
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('never contains URL-unsafe characters (no -, _, uppercase)', () => {
    for (let i = 0; i < 100; i++) {
      const id = v3Id();
      expect(id).toMatch(/^[a-f0-9]{7}$/);
    }
  });
});

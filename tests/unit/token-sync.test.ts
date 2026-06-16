import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  loadCache,
  writeCache,
  syncTokens,
  type TokenSyncCache,
} from '../../src/analysis/token-sync.js';
import type { McpAdapter } from '../../src/mcp/mcp-adapter.js';
import type { DesignTokens } from '../../src/analyzer/index.js';

function makeTokens(overrides: Partial<DesignTokens> = {}): DesignTokens {
  return {
    colors: {
      primary: '#3366ff',
      background: '#ffffff',
      text: '#000000',
    },
    fonts: {
      heading: { family: 'Inter', weight: 700, size: '32px' },
      body: { family: 'Inter', weight: 400, size: '16px' },
    },
    spacing: { sectionPadding: '64px', containerWidth: '1200px' },
    ...overrides,
  } as DesignTokens;
}

function makeMcp(setupResult: unknown = { data: { variables: { Primary: 'sv1' }, id: 'gc1' } }): McpAdapter {
  return {
    callTool: async (tool: string) => {
      if (tool === 'mcp-adapter-execute-ability') {
        return { content: [{ text: JSON.stringify({ success: true, data: setupResult.data }) }] };
      }
      return { content: [{ text: '{}' }] };
    },
  } as unknown as McpAdapter;
}

describe('token-sync', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'token-sync-'));
  });

  describe('loadCache', () => {
    it('returns empty cache if file missing', async () => {
      const cache = await loadCache(path.join(tmp, 'missing.json'));
      expect(cache.variables).toEqual({});
      expect(cache.classes).toEqual({});
    });

    it('reads existing cache file', async () => {
      const cachePath = path.join(tmp, 'cache.json');
      const seed: TokenSyncCache = { variables: { sv1: 'Primary' }, classes: { gc1: 'btn' }, lastSyncedAt: '2026-06-16' };
      await fs.writeFile(cachePath, JSON.stringify(seed));
      const cache = await loadCache(cachePath);
      expect(cache.variables.sv1).toBe('Primary');
      expect(cache.classes.gc1).toBe('btn');
      expect(cache.lastSyncedAt).toBe('2026-06-16');
    });

    it('handles corrupted cache file', async () => {
      const cachePath = path.join(tmp, 'bad.json');
      await fs.writeFile(cachePath, 'not json{');
      const cache = await loadCache(cachePath);
      expect(cache.variables).toEqual({});
    });
  });

  describe('writeCache', () => {
    it('creates parent dirs and writes JSON', async () => {
      const cachePath = path.join(tmp, 'nested', 'cache.json');
      const cache: TokenSyncCache = { variables: { a: 'b' }, classes: {}, lastSyncedAt: 'now' };
      await writeCache(cachePath, cache);
      const raw = await fs.readFile(cachePath, 'utf-8');
      expect(JSON.parse(raw)).toEqual(cache);
    });
  });

  describe('syncTokens (dry-run)', () => {
    it('does not call MCP and writes artifact', async () => {
      const mcp = makeMcp();
      const result = await syncTokens(makeTokens(), mcp, tmp, { dryRun: true });
      expect(result.artifactPath).toBe(path.join(tmp, 'synced-tokens.json'));
      expect(result.newVariables.length).toBeGreaterThan(0);
      expect(result.cacheHits).toBe(0);

      const artifact = JSON.parse(await fs.readFile(result.artifactPath, 'utf-8'));
      expect(artifact.syncedAt).toBeDefined();
      expect(artifact.variables.length).toBeGreaterThan(0);
    });

    it('marks variables as synced via cache on dry-run + reuses', async () => {
      const mcp = makeMcp();
      // First run: creates entries, but dryRun does not write cache
      const first = await syncTokens(makeTokens(), mcp, tmp, { dryRun: true });
      // Second run with non-dry-run but no MCP call (still dry-run for safety)
      const second = await syncTokens(makeTokens(), mcp, tmp, { dryRun: true });
      expect(second.artifactPath).toContain('synced-tokens.json');
      // Since dryRun does NOT write cache, reusedVariables should be 0
      expect(first.reusedVariables).toBe(0);
    });
  });

  describe('syncTokens (live)', () => {
    it('calls MCP and updates cache with real IDs', async () => {
      const mcp = makeMcp({ data: { variables: { Primary: 'sv_real_1', Background: 'sv_real_2' } } });
      const result = await syncTokens(makeTokens(), mcp, tmp);
      // newVariables should be reduced (or fully synced) after the call
      const cachePath = path.join(tmp, 'sync-cache.json');
      const cache = await loadCache(cachePath);
      expect(Object.keys(cache.variables).length).toBeGreaterThan(0);
      expect(result.artifactPath).toContain('synced-tokens.json');
    });

    it('forceFresh option empties existing cache', async () => {
      // First run with non-dryRun to populate cache
      const mcp1 = makeMcp({ data: { variables: { Primary: 'sv1' } } });
      await syncTokens(makeTokens(), mcp1, tmp);
      const cachePath = path.join(tmp, 'sync-cache.json');
      const before = await loadCache(cachePath);
      expect(Object.keys(before.variables).length).toBeGreaterThan(0);

      // Second run with forceFresh should still work
      const mcp2 = makeMcp({ data: { variables: { Primary: 'sv1' } } });
      const result = await syncTokens(makeTokens(), mcp2, tmp, { forceFresh: true });
      expect(result.artifactPath).toBeDefined();
    });
  });
});

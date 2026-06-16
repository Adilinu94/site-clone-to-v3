import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  compareVersions,
  readUpdateCache,
  writeUpdateCache,
  checkForUpdate,
  formatUpdateNotice,
} from '../../src/cli/update-checker';

describe('update-checker', () => {
  let cachePath: string;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'update-checker-'));
    cachePath = join(dir, 'cache.json');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('compareVersions', () => {
    it('detects newer major', () => {
      expect(compareVersions('0.1.0', '1.0.0')).toBe(-1);
    });
    it('detects newer minor', () => {
      expect(compareVersions('0.1.0', '0.2.0')).toBe(-1);
    });
    it('detects newer patch', () => {
      expect(compareVersions('0.1.0', '0.1.1')).toBe(-1);
    });
    it('treats equal as equal', () => {
      expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    });
    it('detects older', () => {
      expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    });
    it('strips v prefix', () => {
      expect(compareVersions('v1.0.0', '1.0.1')).toBe(-1);
    });
  });

  describe('cache', () => {
    it('returns null when no cache file', async () => {
      expect(await readUpdateCache(cachePath)).toBeNull();
    });

    it('writes and reads cache', async () => {
      const result = {
        current: '0.1.0',
        latest: '0.2.0',
        isOutdated: true,
        checkedAt: Date.now(),
        fromCache: false,
      };
      await writeUpdateCache(result, cachePath);
      const read = await readUpdateCache(cachePath);
      expect(read).toMatchObject({
        current: '0.1.0',
        latest: '0.2.0',
        isOutdated: true,
        fromCache: true,
      });
    });
  });

  describe('checkForUpdate', () => {
    it('returns cached result without network call', async () => {
      const cached = {
        current: '0.1.0',
        latest: '0.1.0',
        isOutdated: false,
        checkedAt: Date.now(),
        fromCache: false,
      };
      await writeUpdateCache(cached, cachePath);
      const fetchMock = vi.fn();
      const result = await checkForUpdate('0.1.0', { fetchImpl: fetchMock as any, cachePath });
      expect(result?.fromCache).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fetches from npm when no cache', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: '0.2.0' }),
      });
      const result = await checkForUpdate('0.1.0', { fetchImpl: fetchMock as any, cachePath });
      expect(result?.latest).toBe('0.2.0');
      expect(result?.isOutdated).toBe(true);
    });

    it('returns null on network failure', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
      const result = await checkForUpdate('0.1.0', { fetchImpl: fetchMock as any, cachePath });
      expect(result).toBeNull();
    });

    it('returns null on non-ok response', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false });
      const result = await checkForUpdate('0.1.0', { fetchImpl: fetchMock as any, cachePath });
      expect(result).toBeNull();
    });

    it('returns null on missing version field', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });
      const result = await checkForUpdate('0.1.0', { fetchImpl: fetchMock as any, cachePath });
      expect(result).toBeNull();
    });
  });

  describe('formatUpdateNotice', () => {
    it('returns null when null', () => {
      expect(formatUpdateNotice(null)).toBeNull();
    });
    it('returns null when up-to-date', () => {
      expect(
        formatUpdateNotice({
          current: '1.0.0',
          latest: '1.0.0',
          isOutdated: false,
          checkedAt: 0,
          fromCache: false,
        })
      ).toBeNull();
    });
    it('formats outdated notice', () => {
      const result = formatUpdateNotice({
        current: '0.1.0',
        latest: '0.2.0',
        isOutdated: true,
        checkedAt: 0,
        fromCache: false,
      });
      expect(result).toContain('0.1.0');
      expect(result).toContain('0.2.0');
      expect(result).toContain('npm i -g clone-v3');
    });
    it('marks cached notices', () => {
      const result = formatUpdateNotice({
        current: '0.1.0',
        latest: '0.2.0',
        isOutdated: true,
        checkedAt: 0,
        fromCache: true,
      });
      expect(result).toContain('(cached)');
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  loadSourceAuth,
  sourceAuthToHeaders,
  sourceAuthToPlaywrightBasic,
  sourceAuthToPlaywrightCookies,
} from '../../src/lib/source-auth.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clone-v3-auth-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('source-auth', () => {
  describe('loadSourceAuth', () => {
    it('returns null when file does not exist', async () => {
      const result = await loadSourceAuth('any', tmpDir);
      expect(result).toBeNull();
    });

    it('throws when profile not found in file', async () => {
      const dir = path.join(tmpDir, '.clone-v3');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, 'source-auth.json'),
        JSON.stringify({ profiles: { foo: { type: 'bearer', token: 'x' } } }),
      );
      await expect(loadSourceAuth('bar', tmpDir)).rejects.toThrow(/not found/);
    });

    it('loads bearer profile', async () => {
      const dir = path.join(tmpDir, '.clone-v3');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, 'source-auth.json'),
        JSON.stringify({
          profiles: {
            'staging-api': { type: 'bearer', token: 'secret-123' },
          },
        }),
      );
      const result = await loadSourceAuth('staging-api', tmpDir);
      expect(result).toEqual({ type: 'bearer', token: 'secret-123' });
    });

    it('loads basic profile', async () => {
      const dir = path.join(tmpDir, '.clone-v3');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, 'source-auth.json'),
        JSON.stringify({
          profiles: {
            'http-auth': {
              type: 'basic',
              username: 'admin',
              password: 'pw',
            },
          },
        }),
      );
      const result = await loadSourceAuth('http-auth', tmpDir);
      expect(result).toEqual({ type: 'basic', username: 'admin', password: 'pw' });
    });

    it('loads cookie profile', async () => {
      const dir = path.join(tmpDir, '.clone-v3');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, 'source-auth.json'),
        JSON.stringify({
          profiles: {
            'cookie-session': {
              type: 'cookie',
              cookies: { PHPSESSID: 'abc123', wp_user: 'admin' },
            },
          },
        }),
      );
      const result = await loadSourceAuth('cookie-session', tmpDir);
      expect(result).toEqual({
        type: 'cookie',
        cookies: { PHPSESSID: 'abc123', wp_user: 'admin' },
      });
    });
  });

  describe('sourceAuthToHeaders', () => {
    it('bearer -> Authorization: Bearer <token>', () => {
      const headers = sourceAuthToHeaders({ type: 'bearer', token: 'xyz' });
      expect(headers.Authorization).toBe('Bearer xyz');
    });

    it('basic -> Authorization: Basic <base64(user:pass)>', () => {
      const headers = sourceAuthToHeaders({
        type: 'basic',
        username: 'admin',
        password: 'pw',
      });
      const expected = `Basic ${Buffer.from('admin:pw').toString('base64')}`;
      expect(headers.Authorization).toBe(expected);
    });

    it('cookie -> Cookie: k1=v1; k2=v2', () => {
      const headers = sourceAuthToHeaders({
        type: 'cookie',
        cookies: { PHPSESSID: 'abc', wp_user: 'admin' },
      });
      expect(headers.Cookie).toBe('PHPSESSID=abc; wp_user=admin');
    });
  });

  describe('sourceAuthToPlaywrightBasic', () => {
    it('returns null for non-basic auth', () => {
      expect(
        sourceAuthToPlaywrightBasic({ type: 'bearer', token: 'x' }),
      ).toBeNull();
    });
    it('returns username/password for basic auth', () => {
      const result = sourceAuthToPlaywrightBasic({
        type: 'basic',
        username: 'u',
        password: 'p',
      });
      expect(result).toEqual({ username: 'u', password: 'p' });
    });
  });

  describe('sourceAuthToPlaywrightCookies', () => {
    it('returns [] for non-cookie auth', async () => {
      const result = await sourceAuthToPlaywrightCookies(
        { type: 'bearer', token: 'x' },
        'https://example.com',
      );
      expect(result).toEqual([]);
    });
    it('maps cookie map to playwright cookies array', async () => {
      const result = await sourceAuthToPlaywrightCookies(
        { type: 'cookie', cookies: { a: '1', b: '2' } },
        'https://example.com',
      );
      expect(result).toEqual([
        { name: 'a', value: '1', url: 'https://example.com' },
        { name: 'b', value: '2', url: 'https://example.com' },
      ]);
    });
  });
});

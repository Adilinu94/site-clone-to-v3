import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  loadProfiles,
  saveProfiles,
  getTarget,
  upsertTarget,
  deleteTarget,
  isElementorV3,
  isElementorV4,
  profilesPath,
  autoAddFromEnv,
  type TargetProfile,
} from '../../src/lib/wp-target.js';

let tmpDir: string;
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalTargetUrl = process.env.NOVAMIRA_TARGET_URL;
const originalToken = process.env.NOVAMIRA_TOKEN;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clone-v3-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
  if (originalTargetUrl === undefined) delete process.env.NOVAMIRA_TARGET_URL;
  else process.env.NOVAMIRA_TARGET_URL = originalTargetUrl;
  if (originalToken === undefined) delete process.env.NOVAMIRA_TOKEN;
  else process.env.NOVAMIRA_TOKEN = originalToken;
});

describe('wp-target', () => {
  describe('profilesPath', () => {
    it('uses os.homedir() not tilde expansion (Windows-fix)', () => {
      const p = profilesPath(tmpDir);
      expect(p).toBe(path.join(tmpDir, '.clone-v3', 'profiles.json'));
      expect(p).not.toContain('~');
    });
  });

  describe('loadProfiles', () => {
    it('returns empty file when profiles.json does not exist', async () => {
      const profiles = await loadProfiles(tmpDir);
      expect(profiles).toEqual({ targets: {} });
    });

    it('loads existing profiles.json', async () => {
      const dir = path.join(tmpDir, '.clone-v3');
      await fs.mkdir(dir, { recursive: true });
      const file = path.join(dir, 'profiles.json');
      const data: TargetProfile = {
        label: 'Test',
        url: 'https://test.example',
        mcp_endpoint: 'https://test.example/wp-json/mcp/novamira',
        auth_token: 'tok',
        elementor_version: '4.1.0',
        pro: false,
      };
      await fs.writeFile(file, JSON.stringify({ targets: { test: data } }));

      const profiles = await loadProfiles(tmpDir);
      expect(profiles.targets.test.label).toBe('Test');
    });
  });

  describe('saveProfiles / loadProfiles round-trip', () => {
    it('persists and reloads profiles', async () => {
      const profile: TargetProfile = {
        label: 'Solar',
        url: 'https://solar.local',
        mcp_endpoint: 'https://solar.local/wp-json/mcp/novamira',
        auth_token: 'bearer-xyz',
        elementor_version: '4.1.1',
        pro: true,
      };
      await upsertTarget('solar-local', profile, tmpDir);
      const loaded = await getTarget('solar-local', tmpDir);
      expect(loaded).toEqual(profile);
    });

    it('creates ~/.clone-v3/ directory if missing', async () => {
      const profile: TargetProfile = {
        label: 'X',
        url: 'https://x.example',
        mcp_endpoint: 'https://x.example/wp-json/mcp/novamira',
        auth_token: 't',
        elementor_version: '4.0.0',
        pro: false,
      };
      await upsertTarget('x', profile, tmpDir);
      const stat = await fs.stat(path.join(tmpDir, '.clone-v3'));
      expect(stat.isDirectory()).toBe(true);
    });

    it('deletes a target', async () => {
      const profile: TargetProfile = {
        label: 'X',
        url: 'https://x.example',
        mcp_endpoint: 'https://x.example/wp-json/mcp/novamira',
        auth_token: 't',
        elementor_version: '4.0.0',
        pro: false,
      };
      await upsertTarget('x', profile, tmpDir);
      const deleted = await deleteTarget('x', tmpDir);
      expect(deleted).toBe(true);
      expect(await getTarget('x', tmpDir)).toBeNull();
    });

    it('returns false when deleting non-existent target', async () => {
      expect(await deleteTarget('nope', tmpDir)).toBe(false);
    });
  });

  describe('Elementor version detection', () => {
    it('identifies V4 versions', () => {
      expect(isElementorV4('4.1.0')).toBe(true);
      expect(isElementorV4('4.0.0-beta1')).toBe(true);
      expect(isElementorV4('4.10.5')).toBe(true);
    });
    it('rejects V3 versions as not-V4', () => {
      expect(isElementorV4('3.30.0')).toBe(false);
    });
    it('identifies V3 versions', () => {
      expect(isElementorV3('3.30.0')).toBe(true);
      expect(isElementorV3('3.5.0')).toBe(true);
      expect(isElementorV3('4.0.0')).toBe(false);
    });
  });

  describe('autoAddFromEnv', () => {
    it('returns null when env vars not set', async () => {
      delete process.env.NOVAMIRA_TARGET_URL;
      delete process.env.NOVAMIRA_TOKEN;
      expect(await autoAddFromEnv(tmpDir)).toBeNull();
    });

    it('auto-creates profile from env vars', async () => {
      process.env.NOVAMIRA_TARGET_URL = 'https://env-target.example';
      process.env.NOVAMIRA_TOKEN = 'env-token';
      const result = await autoAddFromEnv(tmpDir);
      expect(result).not.toBeNull();
      expect(result!.added).toBe('env-target-example');
      expect(result!.profile.url).toBe('https://env-target.example');
      expect(result!.profile.mcp_endpoint).toBe(
        'https://env-target.example/wp-json/mcp/novamira',
      );
    });

    it('does not duplicate existing profile with same URL', async () => {
      const existing: TargetProfile = {
        label: 'Existing',
        url: 'https://env-target.example',
        mcp_endpoint: 'https://env-target.example/wp-json/mcp/novamira',
        auth_token: 'old',
        elementor_version: '4.0.0',
        pro: false,
      };
      await upsertTarget('env-target-example', existing, tmpDir);

      process.env.NOVAMIRA_TARGET_URL = 'https://env-target.example';
      process.env.NOVAMIRA_TOKEN = 'new-token';
      const result = await autoAddFromEnv(tmpDir);
      expect(result).toBeNull();
    });
  });
});

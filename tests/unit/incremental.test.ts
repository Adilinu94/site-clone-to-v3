import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  runIncremental,
  formatIncrementalReport,
  diffForIncremental,
  loadIncrementalState,
} from '../../src/cli/incremental.js';
import { saveSnapshots, snapshotSections } from '../../src/cli/diff-only.js';
import { makeExtractionResultJson, makeSection } from './cli-fixtures.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clone-v3-incr-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeExtraction(sections: ReturnType<typeof makeSection>[]): Promise<string> {
  const dir = path.join(tmpDir, 'example.com');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'extraction-result.json');
  await fs.writeFile(file, makeExtractionResultJson(sections), 'utf8');
  return dir;
}

describe('incremental', () => {
  describe('diffForIncremental', () => {
    it('skips when no previous build', () => {
      const result = diffForIncremental({}, { hero: 'aaa' });
      expect(result.skipped).toBe(true);
      expect(result.newSections).toEqual(['hero']);
    });

    it('skips when nothing changed', () => {
      const result = diffForIncremental({ hero: 'aaa' }, { hero: 'aaa' });
      expect(result.skipped).toBe(true);
      expect(result.rebuild).toHaveLength(0);
      expect(result.keep).toEqual(['hero']);
    });

    it('rebuilds when hash changed', () => {
      const result = diffForIncremental({ hero: 'aaa' }, { hero: 'bbb' });
      expect(result.skipped).toBe(false);
      expect(result.rebuild).toEqual(['hero']);
      expect(result.keep).toHaveLength(0);
    });

    it('treats new sections as rebuild targets', () => {
      const result = diffForIncremental(
        { hero: 'aaa' },
        { hero: 'aaa', footer: 'ccc' },
      );
      expect(result.rebuild).toEqual(['footer']);
      expect(result.newSections).toEqual(['footer']);
      expect(result.keep).toEqual(['hero']);
      expect(result.removed).toHaveLength(0);
    });

    it('detects removed sections', () => {
      const result = diffForIncremental(
        { hero: 'aaa', footer: 'bbb' },
        { hero: 'aaa' },
      );
      expect(result.removed).toEqual(['footer']);
      expect(result.rebuild).toHaveLength(0);
    });

    it('handles multiple changes at once', () => {
      const result = diffForIncremental(
        { hero: 'aaa', old1: 'x', old2: 'y' },
        { hero: 'aaa', new1: 'z', modified: 'w' },
      );
      expect(result.rebuild).toContain('new1');
      expect(result.rebuild).toContain('modified');
      expect(result.removed).toContain('old1');
      expect(result.removed).toContain('old2');
      expect(result.keep).toEqual(['hero']);
    });
  });

  describe('loadIncrementalState', () => {
    it('returns empty state when no files exist', async () => {
      const state = await loadIncrementalState(tmpDir);
      expect(state.previousHashes).toEqual({});
      expect(state.lastBuild).toBeUndefined();
    });

    it('reads previous-sections.json when present', async () => {
      const dir = await writeExtraction([makeSection('hero')]);
      await saveSnapshots(dir, snapshotSections({
        sections: [makeSection('hero')],
      } as unknown as Parameters<typeof snapshotSections>[0]));
      const state = await loadIncrementalState(dir);
      expect(state.previousHashes.hero).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  describe('runIncremental', () => {
    it('first build is skipped (no baseline)', async () => {
      const dir = await writeExtraction([makeSection('hero'), makeSection('footer')]);
      const report = await runIncremental({ researchDir: dir, url: 'https://example.com' });
      expect(report.skipped).toBe(true);
      expect(report.newSections).toHaveLength(2);
      expect(report.rebuildSections).toHaveLength(0);
    });

    it('detects no changes when source unchanged', async () => {
      const dir = await writeExtraction([makeSection('hero')]);
      await saveSnapshots(dir, snapshotSections({
        sections: [makeSection('hero')],
      } as unknown as Parameters<typeof snapshotSections>[0]));
      const report = await runIncremental({ researchDir: dir, url: 'https://example.com' });
      expect(report.skipped).toBe(true);
      expect(report.rebuildSections).toHaveLength(0);
    });

    it('identifies changed sections when source updated', async () => {
      const dir = await writeExtraction([makeSection('hero', { selector: '.v1' })]);
      await saveSnapshots(dir, snapshotSections({
        sections: [makeSection('hero', { selector: '.v1' })],
      } as unknown as Parameters<typeof snapshotSections>[0]));
      await fs.writeFile(
        path.join(dir, 'extraction-result.json'),
        makeExtractionResultJson([makeSection('hero', { selector: '.v2' })]),
        'utf8',
      );
      const report = await runIncremental({ researchDir: dir, url: 'https://example.com' });
      expect(report.skipped).toBe(false);
      expect(report.rebuildSections).toEqual(['hero']);
    });

    it('writes incremental-build.json', async () => {
      const dir = await writeExtraction([makeSection('hero')]);
      const report = await runIncremental({ researchDir: dir, url: 'https://example.com' });
      const written = JSON.parse(
        await fs.readFile(path.join(dir, 'incremental-build.json'), 'utf8'),
      );
      expect(written.url).toBe('https://example.com');
      expect(written.skipped).toBe(report.skipped);
    });
  });

  describe('formatIncrementalReport', () => {
    it('renders SKIPPED status', () => {
      const text = formatIncrementalReport({
        url: 'https://example.com',
        researchDir: '/tmp/x',
        timestamp: '2026-06-16T18:00:00.000Z',
        rebuildSections: [],
        keepSections: ['hero'],
        newSections: [],
        removedSections: [],
        skipped: true,
        reason: 'no changes detected',
      });
      expect(text).toContain('SKIPPED');
      expect(text).toContain('no changes detected');
    });

    it('renders rebuild plan when not skipped', () => {
      const text = formatIncrementalReport({
        url: 'https://example.com',
        researchDir: '/tmp/x',
        timestamp: '2026-06-16T18:00:00.000Z',
        rebuildSections: ['hero'],
        keepSections: ['footer'],
        newSections: ['new-section'],
        removedSections: ['old-section'],
        skipped: false,
      });
      expect(text).toContain('Rebuild:    1');
      expect(text).toContain('  ↻ hero');
      expect(text).toContain('Keep:       1');
      expect(text).toContain('  = footer');
      expect(text).toContain('New:        1');
      expect(text).toContain('  + new-section');
      expect(text).toContain('Removed:    1');
      expect(text).toContain('  - old-section');
    });
  });
});

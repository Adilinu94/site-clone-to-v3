import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  runDiffOnly,
  formatDiffReport,
  loadExtractionResult,
  snapshotSections,
  loadPreviousSnapshots,
  saveSnapshots,
  computeDiff,
} from '../../src/cli/diff-only.js';
import { makeExtractionResultJson, makeSection } from './cli-fixtures.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clone-v3-diff-'));
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

describe('diff-only', () => {
  describe('loadExtractionResult', () => {
    it('reads extraction-result.json from disk', async () => {
      const dir = await writeExtraction([makeSection('hero'), makeSection('footer')]);
      const result = await loadExtractionResult(dir);
      expect(result.sections).toHaveLength(2);
      expect(result.sections[0].section_id).toBe('hero');
    });
  });

  describe('snapshotSections', () => {
    it('produces MD5 hashes for each section', () => {
      const extraction = {
        sections: [makeSection('hero'), makeSection('footer')],
      } as unknown as Parameters<typeof snapshotSections>[0];
      const snaps = snapshotSections(extraction);
      expect(Object.keys(snaps)).toHaveLength(2);
      expect(snaps.hero.sectionId).toBe('hero');
      expect(snaps.hero.contentHash).toMatch(/^[a-f0-9]{32}$/);
    });

    it('different selectors produce different hashes', () => {
      const a = snapshotSections({
        sections: [makeSection('hero', { selector: '.a' })],
      } as unknown as Parameters<typeof snapshotSections>[0]);
      const b = snapshotSections({
        sections: [makeSection('hero', { selector: '.b' })],
      } as unknown as Parameters<typeof snapshotSections>[0]);
      expect(a.hero.contentHash).not.toBe(b.hero.contentHash);
    });
  });

  describe('saveSnapshots + loadPreviousSnapshots', () => {
    it('round-trips snapshots', async () => {
      const dir = await writeExtraction([makeSection('hero')]);
      const snapshots = snapshotSections({
        sections: [makeSection('hero')],
      } as unknown as Parameters<typeof snapshotSections>[0]);
      const savedPath = await saveSnapshots(dir, snapshots);
      const loaded = await loadPreviousSnapshots(dir);
      expect(loaded.hero.contentHash).toBe(snapshots.hero.contentHash);
      expect(savedPath).toContain('previous-sections.json');
    });

    it('returns empty object when no baseline exists', async () => {
      const dir = await writeExtraction([makeSection('hero')]);
      const loaded = await loadPreviousSnapshots(dir);
      expect(loaded).toEqual({});
    });
  });

  describe('computeDiff', () => {
    it('detects added sections', () => {
      const previous = {};
      const current = snapshotSections({
        sections: [makeSection('hero')],
      } as unknown as Parameters<typeof snapshotSections>[0]);
      const diff = computeDiff(previous, current);
      expect(diff.added).toHaveLength(1);
      expect(diff.added[0].sectionId).toBe('hero');
      expect(diff.modified).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
    });

    it('detects removed sections', () => {
      const previous = snapshotSections({
        sections: [makeSection('hero'), makeSection('footer')],
      } as unknown as Parameters<typeof snapshotSections>[0]);
      const current = snapshotSections({
        sections: [makeSection('hero')],
      } as unknown as Parameters<typeof snapshotSections>[0]);
      const diff = computeDiff(previous, current);
      expect(diff.removed).toHaveLength(1);
      expect(diff.removed[0].sectionId).toBe('footer');
    });

    it('detects modified sections', () => {
      const previous = snapshotSections({
        sections: [makeSection('hero', { selector: '.old' })],
      } as unknown as Parameters<typeof snapshotSections>[0]);
      const current = snapshotSections({
        sections: [makeSection('hero', { selector: '.new' })],
      } as unknown as Parameters<typeof snapshotSections>[0]);
      const diff = computeDiff(previous, current);
      expect(diff.modified).toHaveLength(1);
      expect(diff.modified[0].previousHash).not.toBe(diff.modified[0].currentHash);
    });

    it('detects unchanged sections', () => {
      const previous = snapshotSections({
        sections: [makeSection('hero')],
      } as unknown as Parameters<typeof snapshotSections>[0]);
      const current = snapshotSections({
        sections: [makeSection('hero')],
      } as unknown as Parameters<typeof snapshotSections>[0]);
      const diff = computeDiff(previous, current);
      expect(diff.unchanged).toEqual(['hero']);
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
    });
  });

  describe('runDiffOnly', () => {
    it('reports empty diff when no baseline', async () => {
      const dir = await writeExtraction([makeSection('hero'), makeSection('footer')]);
      const report = await runDiffOnly({ researchDir: dir, url: 'https://example.com' });
      expect(report.added).toHaveLength(2);
      expect(report.previous.sectionCount).toBe(0);
      expect(report.current.sectionCount).toBe(2);
    });

    it('reports modified section after snapshot update', async () => {
      const dir = await writeExtraction([makeSection('hero')]);
      await saveSnapshots(dir, snapshotSections({
        sections: [makeSection('hero', { selector: '.old' })],
      } as unknown as Parameters<typeof snapshotSections>[0]));
      const report = await runDiffOnly({ researchDir: dir, url: 'https://example.com' });
      expect(report.modified).toHaveLength(1);
    });

    it('throws when extraction-result.json missing', async () => {
      await expect(
        runDiffOnly({ researchDir: tmpDir, url: 'https://example.com' }),
      ).rejects.toThrow(/extraction-result\.json/);
    });
  });

  describe('formatDiffReport', () => {
    it('renders a human-readable diff', () => {
      const text = formatDiffReport({
        url: 'https://example.com',
        researchDir: '/tmp/x',
        timestamp: '2026-06-16T18:00:00.000Z',
        current: { sectionCount: 2, sectionHashes: { hero: 'aaa', footer: 'bbb' } },
        previous: { sectionCount: 1, sectionHashes: { hero: 'aaa' } },
        added: [{ sectionId: 'footer', selector: '.f', contentHash: 'bbb' }],
        removed: [],
        modified: [],
        unchanged: ['hero'],
      });
      expect(text).toContain('=== Source-Change Diff (no build) ===');
      expect(text).toContain('Added:      1');
      expect(text).toContain('+ footer');
      expect(text).toContain('Unchanged:  1');
    });
  });
});

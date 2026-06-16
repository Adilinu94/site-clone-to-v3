import { describe, it, expect } from 'vitest';
import {
  parseCommit,
  groupByType,
  buildChangelog,
  renderChangelogMarkdown,
  getCommitsSince,
  getLatestSemverTag,
} from '../../src/cli/changelog-generator';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('changelog-generator', () => {
  describe('parseCommit', () => {
    it('parses simple feat commit', () => {
      const parsed = parseCommit('feat: add new feature', 'abc1234');
      expect(parsed).toMatchObject({
        hash: 'abc1234',
        type: 'feat',
        subject: 'add new feature',
        breaking: false,
      });
    });

    it('parses commit with scope', () => {
      const parsed = parseCommit('fix(cli): handle empty url', 'def5678');
      expect(parsed).toMatchObject({
        type: 'fix',
        scope: 'cli',
        subject: 'handle empty url',
        breaking: false,
      });
    });

    it('detects breaking change marker', () => {
      const parsed = parseCommit('feat(api)!: rewrite response shape', 'ghi9012');
      expect(parsed?.breaking).toBe(true);
      expect(parsed?.type).toBe('feat');
    });

    it('returns null for non-conventional commits', () => {
      expect(parseCommit('WIP: something', 'jkl3456')).toBeNull();
      expect(parseCommit('Merge branch main', 'mno7890')).toBeNull();
    });

    it('captures body', () => {
      const msg = 'feat: multi-line\n\nThis is the body of the commit.';
      const parsed = parseCommit(msg, 'pqr1234');
      expect(parsed?.body).toContain('This is the body');
    });
  });

  describe('groupByType', () => {
    it('groups commits by type and sorts by canonical order', () => {
      const commits = [
        { hash: '1', type: 'chore', subject: 'a', breaking: false },
        { hash: '2', type: 'feat', subject: 'b', breaking: false },
        { hash: '3', type: 'fix', subject: 'c', breaking: false },
      ];
      const sections = groupByType(commits);
      expect(sections.map((s) => s.type)).toEqual(['feat', 'fix', 'chore']);
      expect(sections[0].label).toBe('Features');
    });

    it('uses unknown type as label fallback', () => {
      const commits = [{ hash: '1', type: 'weirdtype', subject: 'x', breaking: false }];
      const sections = groupByType(commits);
      expect(sections[0].label).toBe('weirdtype');
    });
  });

  describe('buildChangelog + renderChangelogMarkdown', () => {
    it('produces a Markdown document with sections', () => {
      const commits = [
        { hash: 'aaaaaaa', type: 'feat', scope: 'cli', subject: 'add update-checker', breaking: false },
        { hash: 'bbbbbbb', type: 'fix', subject: 'fix timeout', breaking: false },
        { hash: 'ccccccc', type: 'feat', subject: 'remove deprecated flag', breaking: true },
      ];
      const cl = buildChangelog(commits, '0.2.0', '2026-06-16');
      const md = renderChangelogMarkdown(cl);
      expect(md).toContain('## [0.2.0] - 2026-06-16');
      expect(md).toContain('### ⚠ BREAKING CHANGES');
      expect(md).toContain('### Features');
      expect(md).toContain('### Bug Fixes');
      expect(md).toContain('**cli**: add update-checker (`aaaaaaa`)');
      expect(md).toContain('fix timeout (`bbbbbbb`)');
      expect(md).toContain('remove deprecated flag');
    });

    it('handles changelog with no breaking changes', () => {
      const commits = [{ hash: 'a', type: 'docs', subject: 'update README', breaking: false }];
      const cl = buildChangelog(commits, '0.1.0', '2026-01-01');
      const md = renderChangelogMarkdown(cl);
      expect(md).not.toContain('BREAKING CHANGES');
      expect(md).toContain('### Documentation');
    });
  });

  describe('getLatestSemverTag', () => {
    it('returns undefined in a repo with no tags', () => {
      const dir = mkdtempSync(join(tmpdir(), 'no-tags-'));
      execFileSync('git', ['init', '-q'], { cwd: dir });
      try {
        expect(getLatestSemverTag(dir)).toBeUndefined();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('getCommitsSince', () => {
    it('returns empty array for a non-git dir', () => {
      const dir = mkdtempSync(join(tmpdir(), 'no-git-'));
      try {
        const result = getCommitsSince(dir, undefined, 5);
        expect(result).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});

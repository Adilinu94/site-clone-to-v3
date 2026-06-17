import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  createInitialState,
  loadState,
  saveState,
  stateFileFor,
  markRunning,
  markCompleted,
  markFailed,
  markSkipped,
  reconcile,
  approveSection,
  approvedSectionIds,
  isPhaseDone,
  emptyPhaseState,
  type CloneState,
} from '../../src/cli/state-manager.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clone-v3-state-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function fixtureOptions(): CloneState['options'] {
  return {
    target: 'solar-local',
    viewports: [1440, 768, 390],
    animations: 'auto',
    fonts: 'auto',
    strictness: 'balanced',
  };
}

describe('state-manager', () => {
  describe('createInitialState', () => {
    it('initializes all phases as pending', () => {
      const state = createInitialState('https://example.com', './research', fixtureOptions());
      const phases = ['extract', 'classify', 'assets', 'tokens', 'design-system', 'build', 'qa', 'animations'] as const;
      for (const p of phases) {
        expect(state.phases[p].status).toBe('pending');
      }
    });

    it('extracts hostname from URL', () => {
      const state = createInitialState('https://Stripe.com/Home', './research', fixtureOptions());
      expect(state.hostname).toBe('stripe.com');
    });

    it('sanitizes invalid URL hostnames', () => {
      const state = createInitialState('not a url', './research', fixtureOptions());
      expect(state.hostname).toBe('unknown-host');
    });

    it('sets timestamps', () => {
      const state = createInitialState('https://x.io', './research', fixtureOptions());
      expect(state.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(state.updatedAt).toBe(state.createdAt);
    });
  });

  describe('saveState + loadState', () => {
    it('round-trips state to disk', async () => {
      const state = createInitialState('https://example.com', tmpDir, fixtureOptions());
      markRunning(state, 'extract');
      markCompleted(state, 'extract', { sections: '/tmp/sections.json' });
      const file = stateFileFor(tmpDir, state.hostname);
      await saveState(file, state);

      const loaded = await loadState(file);
      expect(loaded.phases.extract.status).toBe('completed');
      expect(loaded.phases.extract.artifacts?.sections).toBe('/tmp/sections.json');
    });

    it('rejects unsupported schema versions', async () => {
      const file = path.join(tmpDir, 'state.json');
      await fs.writeFile(file, JSON.stringify({ schemaVersion: 99, sourceUrl: '', hostname: '', createdAt: '', updatedAt: '', outputDir: '', phases: {}, approvedSections: [], options: fixtureOptions() }));
      await expect(loadState(file)).rejects.toThrow(/schema version/);
    });

    it('backfills missing phases', async () => {
      const file = path.join(tmpDir, 'state.json');
      await fs.writeFile(file, JSON.stringify({ schemaVersion: 1, sourceUrl: 'https://x.io', hostname: 'x.io', createdAt: '', updatedAt: '', outputDir: '', phases: {}, approvedSections: [], options: fixtureOptions() }));
      const loaded = await loadState(file);
      expect(loaded.phases.extract.status).toBe('pending');
      expect(loaded.phases.autoFix).toBeUndefined();
    });
  });

  describe('phase transitions', () => {
    it('transitions pending → running → completed', () => {
      const state = createInitialState('https://x.io', tmpDir, fixtureOptions());
      markRunning(state, 'extract');
      expect(state.phases.extract.status).toBe('running');
      expect(state.phases.extract.startedAt).toBeTruthy();
      markCompleted(state, 'extract', { x: '/tmp/x' });
      expect(state.phases.extract.status).toBe('completed');
      expect(state.phases.extract.completedAt).toBeTruthy();
      expect(state.phases.extract.startedAt).toBeTruthy();
    });

    it('records failures', () => {
      const state = createInitialState('https://x.io', tmpDir, fixtureOptions());
      markRunning(state, 'extract');
      markFailed(state, 'extract', 'Playwright crashed');
      expect(state.phases.extract.status).toBe('failed');
      expect(state.phases.extract.error).toBe('Playwright crashed');
    });

    it('skips phases', () => {
      const state = createInitialState('https://x.io', tmpDir, fixtureOptions());
      markSkipped(state, 'qa');
      expect(state.phases.qa.status).toBe('skipped');
    });
  });

  describe('reconcile', () => {
    it('finds first pending phase', () => {
      const state = createInitialState('https://x.io', tmpDir, fixtureOptions());
      markCompleted(state, 'extract');
      markCompleted(state, 'classify');
      expect(reconcile(state)).toBe('assets');
    });

    it('resumes from failed phase', () => {
      const state = createInitialState('https://x.io', tmpDir, fixtureOptions());
      markCompleted(state, 'extract');
      markCompleted(state, 'classify');
      markFailed(state, 'assets', 'fail');
      expect(reconcile(state)).toBe('assets');
    });

    it('returns last phase when all complete', () => {
      const state = createInitialState('https://x.io', tmpDir, fixtureOptions());
      for (const p of ['extract', 'classify', 'assets', 'tokens', 'design-system', 'build', 'qa', 'animations'] as const) {
        markCompleted(state, p);
      }
      expect(reconcile(state)).toBe('animations');
    });
  });

  describe('section approval', () => {
    it('approves and queries sections', () => {
      const state = createInitialState('https://x.io', tmpDir, fixtureOptions());
      approveSection(state, 'hero', true, 'abc123');
      approveSection(state, 'footer', true);
      expect(approvedSectionIds(state)).toEqual(['hero', 'footer']);
    });

    it('updates existing approval', () => {
      const state = createInitialState('https://x.io', tmpDir, fixtureOptions());
      approveSection(state, 'hero', true, 'v1');
      approveSection(state, 'hero', false, 'v2');
      expect(state.approvedSections).toHaveLength(1);
      expect(state.approvedSections[0].approved).toBe(false);
      expect(state.approvedSections[0].hash).toBe('v2');
    });
  });

  describe('isPhaseDone', () => {
    it('returns true for completed/skipped', () => {
      const state = createInitialState('https://x.io', tmpDir, fixtureOptions());
      markCompleted(state, 'extract');
      markCompleted(state, 'classify');
      markSkipped(state, 'assets');
      expect(isPhaseDone(state, 'extract')).toBe(true);
      expect(isPhaseDone(state, 'classify')).toBe(true);
      expect(isPhaseDone(state, 'assets')).toBe(true);
      expect(isPhaseDone(state, 'tokens')).toBe(false);
    });
  });

  describe('emptyPhaseState', () => {
    it('returns pending phase', () => {
      expect(emptyPhaseState()).toEqual({ status: 'pending' });
    });
  });
});

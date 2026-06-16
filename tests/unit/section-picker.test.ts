import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { classifyAll, printPickerTable } from '../../src/classifier/section-picker.js';
import type { SectionInfo, ComputedStyleSnapshot } from '../../src/extractor/types.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scv3-picker-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function section(overrides: Partial<SectionInfo> = {}): SectionInfo {
  return {
    section_id: overrides.section_id ?? 'test',
    selector: overrides.selector ?? 'section.test',
    y_range: overrides.y_range ?? [0, 800],
    layout: overrides.layout ?? 'block',
    child_count: overrides.child_count ?? 1,
    tag: overrides.tag ?? 'section',
    id: overrides.id,
    classes: overrides.classes,
  };
}

function snap(
  selector: string,
  tag: string,
  styles: Record<string, string> = {},
): ComputedStyleSnapshot {
  return { selector, tag, styles };
}

describe('section-picker', () => {
  describe('classifyAll', () => {
    it('approves all sections by default and writes per-section spec files', async () => {
      const sections = [
        section({ section_id: 'hero', selector: 'section.hero' }),
        section({ section_id: 'features', selector: 'section.features' }),
      ];
      const computedStyles: Record<string, ComputedStyleSnapshot[]> = {
        desktop: [
          snap('section.hero', 'section', { 'text-align': 'center' }),
          snap('section.hero > h1', 'h1', {}),
          snap('section.features', 'section', { display: 'block' }),
          snap('section.features > p', 'p', {}),
        ],
      };

      const result = await classifyAll({
        url: 'https://example.com',
        outputDir: tmpDir,
        sections,
        computedStyles,
      });

      expect(result.specs.length).toBe(2);
      expect(result.selectedManifest.approved_count).toBe(2);
      expect(result.selectedManifest.skipped_count).toBe(0);

      const files = await fs.readdir(path.join(tmpDir, 'sections'));
      expect(files).toContain('01-hero.spec.json');
      expect(files).toContain('02-features.spec.json');
    });

    it('skips auto-detected non-content sections (cookie, modal, chat-widget)', async () => {
      const sections = [
        section({ section_id: 'hero', selector: 'section.hero' }),
        section({ section_id: 'cookie-banner', selector: 'div.cookie-banner' }),
        section({ section_id: 'chat-widget', selector: 'div.chat-widget' }),
        section({ section_id: 'modal', selector: 'div.modal' }),
      ];
      const computedStyles: Record<string, ComputedStyleSnapshot[]> = {
        desktop: [snap('section.hero', 'section', { display: 'block' })],
      };

      const result = await classifyAll({
        url: 'https://example.com',
        outputDir: tmpDir,
        sections,
        computedStyles,
      });

      expect(result.specs.length).toBe(1);
      expect(result.specs[0].section_id).toBe('hero');
      expect(result.selectedManifest.skipped_count).toBe(3);
    });

    it('skips <script> / <style> / <iframe> tags', async () => {
      const sections = [
        section({ section_id: 'hero', selector: 'section.hero' }),
        section({ section_id: 'tracker', selector: 'script#tracker', tag: 'script' }),
      ];
      const computedStyles: Record<string, ComputedStyleSnapshot[]> = {
        desktop: [snap('section.hero', 'section', { display: 'block' })],
      };

      const result = await classifyAll({
        url: 'https://example.com',
        outputDir: tmpDir,
        sections,
        computedStyles,
      });

      expect(result.specs.length).toBe(1);
    });

    it('marks all as review when autoApprove=false', async () => {
      const sections = [section({ section_id: 'hero', selector: 'section.hero' })];
      const result = await classifyAll({
        url: 'https://example.com',
        outputDir: tmpDir,
        sections,
        computedStyles: { desktop: [] },
        autoApprove: false,
      });
      expect(result.specs[0].section_id).toBe('hero');
      expect(result.selectedManifest.decisions[0].decision).toBe('review');
    });

    it('writes selected-sections.json manifest', async () => {
      const sections = [section({ section_id: 'hero', selector: 'section.hero' })];
      await classifyAll({
        url: 'https://example.com',
        outputDir: tmpDir,
        sections,
        computedStyles: { desktop: [] },
      });
      const manifestPath = path.join(tmpDir, 'selected-sections.json');
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
      expect(manifest.url).toBe('https://example.com');
      expect(manifest.decisions.length).toBe(1);
      expect(manifest.approved_count).toBe(1);
    });

    it('includes settings_provenance for color values', async () => {
      const sections = [section({ section_id: 'hero', selector: 'section.hero' })];
      const computedStyles: Record<string, ComputedStyleSnapshot[]> = {
        desktop: [snap('section.hero', 'section', { 'background-color': '#0a2540' })],
      };
      const result = await classifyAll({
        url: 'https://example.com',
        outputDir: tmpDir,
        sections,
        computedStyles,
      });
      expect(result.specs[0].settings_provenance['background-color']).toBeDefined();
      expect(result.specs[0].settings_provenance['background-color'].source).toBe('computed-style');
    });
  });

  describe('printPickerTable', () => {
    it('prints an ASCII table of detected sections', () => {
      const sections = [
        section({ section_id: 'hero', selector: 'section.hero', y_range: [0, 800] }),
        section({ section_id: 'features', selector: 'section.features', y_range: [800, 1600] }),
      ];
      // Just verify it runs without throwing and produces output
      const origLog = console.log;
      const captured: string[] = [];
      console.log = (...args: unknown[]) => captured.push(args.join(' '));
      try {
        printPickerTable(sections);
      } finally {
        console.log = origLog;
      }
      const output = captured.join('\n');
      expect(output).toContain('hero');
      expect(output).toContain('features');
      expect(output).toContain('Approve all');
    });
  });
});

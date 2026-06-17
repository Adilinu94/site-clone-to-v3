/**
 * V3 Builder — Top-level orchestrator
 *
 * Translates a generic `SiteSpec` (extracted pages + classified sections) into
 * a V3 (or V4) output structure containing resolved sections, generated CSS,
 * and metadata. No DOM dependency.
 *
 * Also preserves the V1 V3-PageData writer (buildV3PageData / writeV3PageData)
 * for the analysis pipeline (src/analysis/pipeline.ts, src/cli/dry-run.ts).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SectionSpec, WidgetSpec, SettingsMap } from '../classifier/types.js';
import { sectionClassName } from './animation-injector.js';
import { v3Id } from '../lib/v3-id.js';
import {
  buildSection,
  isInnerSection,
  type BuiltSection,
  type MultiColumnSpec,
  type SectionBase,
  type SectionStructureType,
} from './v3-section.js';
import {
  generateColumnCss,
  normalizeMultiColumn,
  validateMultiColumnLayout,
  type GapSpec,
  type MultiColumnLayout,
} from './v3-multi-column.js';

// ============================================================================
// Phase 7 — SiteSpec → V3/V4 output (new)
// ============================================================================

export type OutputFormat = 'v3' | 'v4';

export interface V3BuilderOptions {
  format?: OutputFormat;
  flattenInnerSections?: boolean;
  defaultStructureType?: SectionStructureType;
  defaultGap?: GapSpec;
}

export interface SiteSpec {
  pages?: Array<SectionBase & { children?: SectionBase[] }>;
}

export interface V3BuilderMetadata {
  sectionCount: number;
  multiColumnCount: number;
  innerSectionCount: number;
  format: OutputFormat;
  generatedAt?: string;
}

export interface MultiColumnOutput {
  id: string;
  columns: number;
  ratio: string;
  css: string;
  gap: GapSpec;
}

export interface V3BuilderResult {
  format: OutputFormat;
  sections: BuiltSection[];
  metadata: V3BuilderMetadata;
}

export function buildSectionsFromSiteSpec(
  spec: SiteSpec,
  options: V3BuilderOptions = {},
): BuiltSection[] {
  const pages = spec.pages ?? [];
  const out: BuiltSection[] = [];
  for (const page of pages) {
    const structure = page.structure ?? options.defaultStructureType ?? 'content';
    const section = buildSection({ ...page, structure });
    out.push(section);
    if (page.children && page.children.length > 0) {
      for (const child of page.children) {
        out.push(
          buildSection({
            ...child,
            structure: child.structure ?? 'inner-section',
            parentSectionId: section.id,
          }),
        );
      }
    }
  }
  return out;
}

export function buildV3Output(spec: SiteSpec, options: V3BuilderOptions = {}): V3BuilderResult {
  const format: OutputFormat = options.format ?? 'v3';
  let sections = buildSectionsFromSiteSpec(spec, options);
  if (options.flattenInnerSections) {
    sections = flattenInnerSections(sections);
  }
  return {
    format,
    sections,
    metadata: {
      sectionCount: sections.length,
      multiColumnCount: sections.filter((s) => s.structure === 'multi-column' || s.columns > 1).length,
      innerSectionCount: sections.filter((s) => isInnerSection(s)).length,
      format,
      generatedAt: new Date().toISOString(),
    },
  };
}

export function buildMultiColumnOutput(
  id: string,
  layout: MultiColumnLayout,
): MultiColumnOutput {
  const normalized = normalizeMultiColumn(layout);
  const gap = layout.gap ?? { unit: 'px' as const, value: 20 };
  const css = generateColumnCss(normalized.columns, normalized.ratio, gap);
  return {
    id,
    columns: normalized.columns,
    ratio: normalized.ratio,
    css,
    gap,
  };
}

export function countSections(sections: BuiltSection[]): number {
  return sections.length;
}

export function flattenInnerSections(sections: BuiltSection[]): BuiltSection[] {
  const out: BuiltSection[] = [];
  for (const s of sections) {
    out.push(s);
    if (s.innerSections && s.innerSections.length > 0) {
      for (const inner of s.innerSections) {
        out.push(
          buildSection({
            id: inner.id,
            structure: 'inner-section',
            parentSectionId: s.id,
            columns: inner.columns,
          }),
        );
      }
    }
  }
  return out;
}

export interface BuilderValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateBuilderResult(result: V3BuilderResult): BuilderValidationResult {
  const errors: string[] = [];
  if (!result.sections || result.sections.length === 0) {
    errors.push('sections array must not be empty');
  }
  const ids = new Set<string>();
  for (const s of result.sections) {
    if (!s.id) {
      errors.push('section.id is required');
    } else if (ids.has(s.id)) {
      errors.push(`Duplicate section id: ${s.id}`);
    } else {
      ids.add(s.id);
    }
  }
  for (const s of result.sections) {
    if (s.structure === 'multi-column' || s.columns > 1) {
      const layout: MultiColumnLayout = { columns: s.columns, ratio: '50-50' };
      const v = validateMultiColumnLayout(layout);
      if (!v.ok) {
        for (const err of v.errors) errors.push(`section ${s.id}: ${err}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export type { MultiColumnSpec };

// ============================================================================
// V1 — V3PageData writer (preserved for pipeline compatibility)
// ============================================================================

export interface V3Element {
  id: string;
  elType: 'section' | 'column' | 'widget';
  settings?: Record<string, unknown>;
  elements?: V3Element[];
  widgetType?: string;
}

export interface V3PageData {
  title: string;
  status: 'publish' | 'draft';
  type: 'page';
  content: V3Element[];
  version: string;
  metadata: {
    generatedAt: string;
    sourceUrl: string;
    sectionCount: number;
    widgetCount: number;
  };
}

const V3_VERSION = '0.4';

function applySettings(
  base: Record<string, unknown>,
  settings: SettingsMap,
  breakpoint: 'desktop' | 'tablet' | 'mobile',
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  const suffix = breakpoint === 'desktop' ? '' : `_${breakpoint}`;
  for (const [k, v] of Object.entries(settings)) {
    if (breakpoint === 'desktop') {
      result[k] = v;
    } else if (v !== undefined) {
      result[`${k}${suffix}`] = v;
    }
  }
  return result;
}

function buildWidget(widget: WidgetSpec, breakpoint: 'desktop' | 'tablet' | 'mobile'): V3Element {
  return {
    id: v3Id(),
    elType: 'widget',
    widgetType: widget.type,
    settings: applySettings({}, widget.settings, breakpoint),
  };
}

function buildSectionV1(section: SectionSpec, breakpoint: 'desktop' | 'tablet' | 'mobile'): V3Element {
  const animationClass = sectionClassName(section.section_id);
  const flatWidgets: WidgetSpec[] =
    section.widgets ?? section.v3_section?.columns?.flatMap((c) => c.widgets) ?? [];
  const widgets = flatWidgets.map((w) => buildWidget(w, breakpoint));
  const layout: SettingsMap = section.layout ?? section.v3_section?.settings ?? {};
  const containerWidth = section.containerWidth ?? 1200;

  return {
    id: v3Id(),
    elType: 'section',
    settings: applySettings(
      {
        content_width: { size: containerWidth, unit: 'px' },
        gap: 'no',
        _css_classes: animationClass,
        custom_css: `.${animationClass} { animation-fill-mode: both; }`,
      },
      layout,
      breakpoint,
    ),
    elements: [
      {
        id: v3Id(),
        elType: 'column',
        settings: { _column_size: 100, _inline_size: null },
        elements: widgets,
      },
    ],
  };
}

export function buildV3PageData(
  sections: SectionSpec[],
  sourceUrl: string,
  title = 'Cloned Page',
): V3PageData {
  const content = sections.map((s) => buildSectionV1(s, 'desktop'));
  return {
    title,
    status: 'draft',
    type: 'page',
    content,
    version: V3_VERSION,
    metadata: {
      generatedAt: new Date().toISOString(),
      sourceUrl,
      sectionCount: sections.length,
      widgetCount: content.reduce(
        (sum, s) => sum + (s.elements?.[0]?.elements?.length ?? 0),
        0,
      ),
    },
  };
}

export async function writeV3PageData(
  pageData: V3PageData,
  outputPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(pageData, null, 2), 'utf-8');
}
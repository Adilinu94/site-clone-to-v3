import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SectionSpec, WidgetSpec } from '../classifier/types.js';
import { v3Id } from '../lib/v3-id.js';

export interface V4AtomicElement {
  id: string;
  type: string;
  settings: Record<string, unknown>;
  styles: Record<string, unknown>;
  classes?: string[];
  elements?: V4AtomicElement[];
  atomic?: boolean;
}

export interface V4BuildPlan {
  pageId: string;
  title: string;
  version: string;
  generatedAt: string;
  sourceUrl: string;
  elements: V4AtomicElement[];
  summary: {
    sectionCount: number;
    widgetCount: number;
    classes: string[];
  };
}

const V4_VERSION = '0.1';
const ATOMIC = true;

function widgetToAtomic(widget: WidgetSpec): V4AtomicElement {
  return {
    id: v3Id(),
    type: widget.type,
    atomic: ATOMIC,
    settings: { ...widget.settings },
    styles: {},
    classes: widget.classes,
  };
}

function sectionToAtomic(section: SectionSpec): V4AtomicElement {
  const flatWidgets: WidgetSpec[] =
    section.widgets ?? section.v3_section?.columns?.flatMap((c) => c.widgets) ?? [];
  const widgets = flatWidgets.map(widgetToAtomic);
  const containerWidth = section.containerWidth ?? 1200;
  return {
    id: v3Id(),
    type: 'e-flexbox',
    atomic: ATOMIC,
    settings: {
      direction: 'column',
      gap: { size: 16, unit: 'px' },
      content_width: { size: containerWidth, unit: 'px' },
    },
    styles: {},
    classes: section.classes ?? [],
    elements: widgets,
  };
}

export function buildV4Plan(
  sections: SectionSpec[],
  sourceUrl: string,
  title = 'Cloned Page (V4)',
  pageId = 'clone-page-001',
): V4BuildPlan {
  const allClasses = new Set<string>();
  const elements = sections.map((s) => {
    const atomic = sectionToAtomic(s);
    for (const c of atomic.classes ?? []) allClasses.add(c);
    for (const w of atomic.elements ?? []) {
      for (const c of w.classes ?? []) allClasses.add(c);
    }
    return atomic;
  });

  return {
    pageId,
    title,
    version: V4_VERSION,
    generatedAt: new Date().toISOString(),
    sourceUrl,
    elements,
    summary: {
      sectionCount: sections.length,
      widgetCount: elements.reduce((sum, e) => sum + (e.elements?.length ?? 0), 0),
      classes: Array.from(allClasses),
    },
  };
}

export async function writeV4Plan(plan: V4BuildPlan, outputPath: string): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(plan, null, 2), 'utf-8');
}

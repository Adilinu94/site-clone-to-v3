import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SectionSpec, WidgetSpec } from '../classifier/types.js';

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

let idCounter = 0;
function genAtomicId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter.toString().padStart(7, '0')}`;
}

function widgetToAtomic(widget: WidgetSpec): V4AtomicElement {
  const id = genAtomicId(widget.type.slice(0, 4));
  return {
    id,
    type: widget.type,
    atomic: ATOMIC,
    settings: { ...widget.settings },
    styles: {},
    classes: widget.classes,
  };
}

function sectionToAtomic(section: SectionSpec, globalClasses: string[]): V4AtomicElement {
  const id = genAtomicId('sec');
  const widgets = section.widgets.map(widgetToAtomic);
  return {
    id,
    type: 'e-flexbox',
    atomic: ATOMIC,
    settings: {
      direction: 'column',
      gap: { size: 16, unit: 'px' },
      content_width: { size: section.containerWidth ?? 1200, unit: 'px' },
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
  idCounter = 0;
  const allClasses = new Set<string>();
  const elements = sections.map((s) => {
    const atomic = sectionToAtomic(s, []);
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

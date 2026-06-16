import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SectionSpec, WidgetSpec, SettingsMap } from '../classifier/types.js';
import { sectionClassName } from './animation-injector.js';

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

let idCounter = 0;
function genId(prefix: string): string {
  idCounter += 1;
  return `${prefix}${idCounter.toString().padStart(7, '0')}`;
}

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
    id: genId('e'),
    elType: 'widget',
    widgetType: widget.type,
    settings: applySettings({}, widget.settings, breakpoint),
  };
}

function buildSection(section: SectionSpec, breakpoint: 'desktop' | 'tablet' | 'mobile'): V3Element {
  // Phase 7: link V3 section to sectionClassName for animation targeting
  // (WPCode snippets target `.section-<section_id>` selectors).
  const animationClass = sectionClassName(section.section_id);

  // Prefer flat widgets[] (v3-builder compat), fall back to v3_section.columns.
  const flatWidgets: WidgetSpec[] =
    section.widgets ?? section.v3_section?.columns?.flatMap((c) => c.widgets) ?? [];

  const widgets = flatWidgets.map((w) => buildWidget(w, breakpoint));
  const layout: SettingsMap = section.layout ?? section.v3_section?.settings ?? {};
  const containerWidth = section.containerWidth ?? 1200;

  return {
    id: genId('s'),
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
        id: genId('c'),
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
  idCounter = 0;
  const content = sections.map((s) => buildSection(s, 'desktop'));
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

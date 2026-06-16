/**
 * Section-Picker — Phase 3 Sprint 3E
 * Orchestrates the user-driven section selection process.
 *
 * Spec: BAUPLAN-SITE-CLONE-TO-V3.md §Phase 3 — Tasks 5+6+7
 *
 * 1. `pickSections()` — produces an interactive ASCII table of detected
 *    sections, applies user decisions, and writes the selected-sections
 *    manifest. Used in interactive mode (terminal).
 *
 * 2. `autoPick()` — heuristic-based auto-approval (no user prompt). Used
 *    in non-interactive / CI mode. Filters out known non-content sections
 *    (cookie-banners, modals, chat-widgets) automatically.
 *
 * 3. `classifyAll()` — runs the Style-Classifier on every section in
 *    extraction-result, generates the V3 widget suggestions, and writes
 *    `sections/<n>.spec.json` per approved section.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { SectionInfo, ComputedStyleSnapshot } from '../extractor/types.js';
import type { DesignTokens } from '../analyzer/design-token-extractor.js';
import { classifySection } from './style-classifier.js';
import { mapElementsToWidgets } from './widget-mapper.js';
import { resolveColorToken, resolveFontRole } from './token-resolver.js';
import { buildResponsiveSettings } from './responsive-settings.js';
import type {
  PickerDecision,
  SectionSpec,
  SelectedSections,
  V3Column,
  V3LayoutPattern,
  V3Section,
  V3Widget,
} from './types.js';

const AUTO_SKIP_SELECTORS = [
  'cookie',
  'consent',
  'gdpr',
  'banner-cookie',
  'modal',
  'overlay',
  'popup',
  'chat-widget',
  'newsletter-modal',
  'subscribe-modal',
];

const AUTO_SKIP_TAGS = new Set(['script', 'style', 'noscript', 'iframe']);

export interface ClassifyAllInput {
  url: string;
  outputDir: string;
  sections: SectionInfo[];
  computedStyles: Record<string, ComputedStyleSnapshot[]>;
  designTokens?: DesignTokens;
  cssVars?: Record<string, string>;
  /** Run interactive prompt (default: false). */
  interactive?: boolean;
  /** Auto-approve all sections (default: true when non-interactive). */
  autoApprove?: boolean;
}

export interface ClassifyAllResult {
  specs: SectionSpec[];
  selectedManifest: SelectedSections;
}

/** Alias kept for back-compat with pipeline.ts. */
export type ClassifyResult = ClassifyAllResult;

/**
 * Classify all sections and write per-section spec files.
 */
export async function classifyAll(input: ClassifyAllInput): Promise<ClassifyAllResult> {
  const specs: SectionSpec[] = [];
  const decisions: PickerDecision[] = [];

  const sectionsDir = path.join(input.outputDir, 'sections');
  await mkdir(sectionsDir, { recursive: true });

  for (let i = 0; i < input.sections.length; i++) {
    const section = input.sections[i];
    const allSnapshots = input.computedStyles.desktop ?? [];
    const scoped = allSnapshots.filter(
      (s) =>
        s.selector === section.selector ||
        s.selector.startsWith(`${section.selector} >`),
    );

    const pattern = classifySection(section, scoped);
    const decision = makeAutoDecision(section, pattern, input.autoApprove);
    decisions.push(decision);

    if (decision.decision === 'skip') continue;

    const spec = buildSpec(
      section,
      pattern,
      scoped,
      input.designTokens,
      input.cssVars,
    );
    spec.source.url = input.url;
    specs.push(spec);

    const filename = `${String(i + 1).padStart(2, '0')}-${section.section_id}.spec.json`;
    await writeFile(
      path.join(sectionsDir, filename),
      JSON.stringify(spec, null, 2),
      'utf-8',
    );
  }

  const selectedManifest: SelectedSections = {
    url: input.url,
    extracted_at: new Date().toISOString(),
    decisions,
    approved_count: decisions.filter((d) => d.decision === 'approve').length,
    skipped_count: decisions.filter((d) => d.decision === 'skip').length,
  };

  await writeFile(
    path.join(input.outputDir, 'selected-sections.json'),
    JSON.stringify(selectedManifest, null, 2),
    'utf-8',
  );

  return { specs, selectedManifest };
}

function makeAutoDecision(
  section: SectionInfo,
  pattern: V3LayoutPattern,
  autoApprove?: boolean,
): PickerDecision {
  // Always skip obvious non-content
  if (section.tag && AUTO_SKIP_TAGS.has(section.tag)) {
    return {
      section_id: section.section_id,
      decision: 'skip',
      notes: `auto-skip: tag=${section.tag}`,
    };
  }
  if (
    AUTO_SKIP_SELECTORS.some((s) =>
      (section.selector + ' ' + section.id).toLowerCase().includes(s),
    )
  ) {
    return {
      section_id: section.section_id,
      decision: 'skip',
      notes: `auto-skip: non-content selector`,
    };
  }
  if (autoApprove === false) {
    return { section_id: section.section_id, decision: 'review' };
  }
  return {
    section_id: section.section_id,
    decision: 'approve',
    reviewed_at: new Date().toISOString(),
    notes: `auto-approve: pattern=${pattern}`,
  };
}

function buildSpec(
  section: SectionInfo,
  pattern: V3LayoutPattern,
  snapshots: ComputedStyleSnapshot[],
  tokens: DesignTokens | undefined,
  cssVars: Record<string, string> | undefined,
): SectionSpec {
  const sectionSnap = snapshots.find((s) => s.selector === section.selector);
  const children = snapshots.filter((s) =>
    s.selector.startsWith(`${section.selector} >`),
  );

  const v3Columns = mapToColumns(pattern, children, section, tokens, cssVars);
  const v3Section: V3Section = {
    pattern,
    columns: v3Columns,
    settings: sectionSnap ? buildResponsiveSettings({ desktop: sectionSnap.styles }) : {},
    animations: [], // TODO: pull from extraction.keyframes.transitions
  };

  const settings_provenance: SectionSpec['settings_provenance'] = {};
  if (sectionSnap) {
    for (const [prop, value] of Object.entries(sectionSnap.styles)) {
      const token =
        tokens && prop.includes('color') ? resolveColorToken(value, tokens, { cssVars }) : null;
      settings_provenance[prop] = token
        ? { source: 'design-token', value, token_name: token.token_name }
        : { source: 'computed-style', value };
    }
  }

  return {
    $schema: 'https://site-clone-to-v3.local/schemas/section-spec.v1.json',
    section_id: section.section_id,
    source: {
      url: '', // populated by caller
      selector: section.selector,
      y_range: section.y_range,
    },
    pattern,
    v3_section: v3Section,
    settings_provenance,
    assets_required: [], // populated by Phase 4
    animations_required: [], // populated by Phase 6
    user_overrides: {},
  };
}

function mapToColumns(
  pattern: V3LayoutPattern,
  children: ComputedStyleSnapshot[],
  section: SectionInfo,
  tokens: DesignTokens | undefined,
  cssVars: Record<string, string> | undefined,
): V3Column[] {
  switch (pattern) {
    case 'hero':
    case 'content':
    case 'sticky-header':
    case 'footer':
      return [
        {
          width: '100%',
          widgets: children.map((c) => mapChildToWidget(c, tokens, cssVars)),
        },
      ];
    case 'image-text-sbs':
      return distributeSbs(children).map((group) => ({
        width: '50%',
        widgets: group.map((c) => mapChildToWidget(c, tokens, cssVars)),
      }));
    case 'card-grid': {
      // Detect number of columns from grid-template-columns
      const sectionSnap = children[0]?.styles ?? {};
      const cols = detectGridColumns(children.length, sectionSnap);
      const perCol = Math.ceil(children.length / cols);
      const out: V3Column[] = [];
      for (let i = 0; i < cols; i++) {
        out.push({
          width: `${Math.floor(100 / cols * 100) / 100}%`,
          widgets: children.slice(i * perCol, (i + 1) * perCol).map((c) =>
            mapChildToWidget(c, tokens, cssVars),
          ),
        });
      }
      return out;
    }
    default:
      return [{ width: '100%', widgets: [] }];
  }
  void section;
}

function mapChildToWidget(
  snap: ComputedStyleSnapshot,
  tokens: DesignTokens | undefined,
  cssVars: Record<string, string> | undefined,
): V3Widget {
  const widget = mapElementsToWidgets([
    {
      tag: snap.tag,
      selector: snap.selector,
      styles: snap.styles,
    },
  ])[0];

  // Token resolution: swap raw color for V3 token reference when matched
  if (tokens && widget.settings) {
    for (const key of Object.keys(widget.settings)) {
      if (key.endsWith('_color') || key === 'background_color' || key === 'title_color' || key === 'text_color') {
        const v = widget.settings[key];
        if (typeof v === 'string') {
          const resolved = resolveColorToken(v, tokens, { cssVars });
          if (resolved) {
            widget.settings[`__${key}_token`] = resolved.v3_id;
            // Keep the raw value as fallback
            widget.settings[key] = v;
          }
        }
      }
    }
    // Font-family resolution
    const ff = snap.styles['font-family'];
    if (ff) {
      const role = resolveFontRole(ff, tokens);
      if (role) widget.settings['__typography_role'] = role.v3_id;
    }
  }

  return {
    type: widget.type,
    source_selector: widget.source_selector,
    source_tag: widget.source_tag,
    content: widget.content,
    settings: widget.settings,
  };
}

function distributeSbs(children: ComputedStyleSnapshot[]): ComputedStyleSnapshot[][] {
  // Split into [media, text] based on tag heuristics
  const media = children.filter((c) => /img|picture|video|svg/.test(c.tag));
  const text = children.filter((c) => !/img|picture|video|svg/.test(c.tag));
  return [media, text];
}

function detectGridColumns(
  childCount: number,
  styles: Record<string, string>,
): number {
  const gridCols = styles['grid-template-columns'];
  if (gridCols) {
    const repeatMatch = gridCols.match(/repeat\(\s*(\d+)\s*,/);
    if (repeatMatch) return parseInt(repeatMatch[1], 10);
    return gridCols.trim().split(/\s+/).length || 1;
  }
  // Heuristic: 6 children → 3 cols, 4 → 2, else 1
  if (childCount >= 6) return 3;
  if (childCount >= 4) return 2;
  return 1;
}

/**
 * Print interactive Section-Picker table (used when --interactive).
 * Returns the list of approved section_ids.
 */
export function printPickerTable(
  sections: SectionInfo[],
): void {
  console.log(`\n[section-picker] Detected ${sections.length} sections:\n`);
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const tag = `[${i + 1}]`.padEnd(5);
    const id = (s.section_id ?? 'unnamed').padEnd(20);
    const yRange = `${s.y_range[0]}-${s.y_range[1]}`.padEnd(15);
    const sel = s.selector.padEnd(40);
    console.log(`${tag}${id} ${yRange} ${sel}`);
  }
  console.log(
    '\n[A] Approve all  [S] Skip all  [C] Custom toggle  [Q] Quit',
  );
}

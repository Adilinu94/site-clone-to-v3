import type { ExtractionResult, SectionInfo } from '../../src/extractor/types.js';

export function makeSection(
  id: string,
  overrides: Partial<SectionInfo> = {},
): SectionInfo {
  return {
    section_id: id,
    selector: `[data-section="${id}"]`,
    y_range: [0, 600],
    layout: 'stack',
    child_count: 3,
    tag: 'section',
    ...overrides,
  };
}

export function makeExtractionResult(
  sections: SectionInfo[],
  overrides: Partial<ExtractionResult> = {},
): ExtractionResult {
  return {
    url: 'https://example.com',
    hostname: 'example.com',
    extracted_at: '2026-06-16T18:00:00.000Z',
    viewports: [
      { config: { label: 'desktop', width: 1440, height: 900 } },
    ],
    fontsIntercepted: [],
    cssVariables: {},
    sections,
    animations: {
      has_keyframes: false,
      keyframe_names: [],
      has_gsap: false,
      has_scrolltrigger: false,
      has_framer_motion: false,
      has_lenis: false,
    },
    images: [],
    svgs: [],
    favicons: [],
    ...overrides,
  };
}

export function makeExtractionResultJson(
  sections: SectionInfo[],
  overrides: Partial<ExtractionResult> = {},
): string {
  return JSON.stringify(makeExtractionResult(sections, overrides));
}

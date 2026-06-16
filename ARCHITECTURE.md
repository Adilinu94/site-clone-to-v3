# Architecture

> Module map, data flow, and design decisions for site-clone-to-v3.

## High-Level Flow

```
URL + WP Target
       │
       ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  EXTRACT     │───▶│  CLASSIFY    │───▶│  BUILD       │
│  (Playwright)│    │  (Section    │    │  (Novamira   │
│              │    │   picker)    │    │   MCP)       │
└──────────────┘    └──────────────┘    └──────────────┘
                                              │
                                              ▼
                                       ┌──────────────┐
                                       │  QA          │
                                       │  (pixel-diff │
                                       │  + auto-fix) │
                                       └──────────────┘
```

Every step persists its output to disk so the pipeline can resume from any phase.

## Module Map

```
src/
├── cli/                    # Command-line interface
│   ├── clone-v3.ts         #   Main entry, Commander setup, all sub-commands
│   ├── wizard.ts           #   Interactive 9-step wizard
│   ├── prompts.ts          #   Inquirer prompt builders
│   ├── state-manager.ts    #   state.json schema + resume
│   ├── pipeline-runner.ts  #   runPipeline() wrapper with progress + reviews
│   ├── diff-only.ts        #   --diff-only mode
│   ├── dry-run.ts          #   --dry-run mode
│   ├── incremental.ts      #   --incremental mode
│   ├── update-checker.ts   #   npm registry version check
│   └── changelog-generator.ts  #   CHANGELOG.md from git history
│
├── extractor/              # Phase 2: Playwright extraction
│   ├── playwright-extractor.ts   #   Main extraction logic
│   ├── font-discovery.ts         #   Detect @font-face + Google Fonts
│   ├── asset-collector.ts        #   Collect images/SVGs/favicons from DOM
│   └── types.ts                  #   ExtractionResult, DesignTokens, etc.
│
├── classifier/             # Phase 3: Section picker + widget mapping
│   ├── section-picker.ts         #   Pick sections from extraction
│   ├── style-classifier.ts       #   Classify element styles
│   ├── widget-mapper.ts          #   Map DOM elements to V3 widgets
│   └── token-resolver.ts         #   Resolve CSS tokens → design tokens
│
├── analyzer/               # Phase 2.5: Design token analysis
│   ├── design-token-extractor.ts #   Extract tokens from CSS
│   └── responsive-settings.ts    #   Generate tablet/mobile variants
│
├── builder/                # Phase 5/6: V3 + V4 page builders
│   ├── v3-page-builder.ts        #   V3 widget tree
│   ├── v4-page-builder.ts        #   V4 atomic tree
│   ├── design-system-sync.ts     #   Push tokens to WP Kit
│   └── fonts-plugin-adapter.ts   #   Custom fonts via Fonts Plugin
│
├── qa/                     # Phase 8: Visual QA + auto-fix
│   ├── visual-capture.ts         #   Playwright screenshot capture
│   ├── visual-diff.ts            #   pixelmatch + SSIM comparison
│   ├── strictness.ts             #   3 strictness profiles + target checks
│   ├── ssim.ts                   #   SSIM calculation + classification
│   ├── issue-detector.ts         #   8 issue types + region analysis
│   ├── auto-fix.ts               #   Auto-fix iteration loop
│   ├── acceptance.ts             #   Pass/fail threshold + summary
│   └── html-report.ts            #   Self-contained HTML report
│
├── animation/              # Phase 7: Animation injection
│   ├── animation-injector.ts     #   Generate WPCode snippets
│   ├── keyframe-extractor.ts     #   Extract @keyframes from CSS
│   └── wpcode-adapter.ts         #   WPCode plugin adapter
│
├── mcp/                    # Phase 5A: Novamira MCP adapter
│   ├── mcp-adapter.ts            #   JSON-RPC 2.0 + session handshake
│   ├── token-sync.ts             #   Design system token sync (cached)
│   └── retry.ts                  #   Exponential backoff + circuit breaker
│
├── analysis/               # Pipeline orchestration
│   ├── pipeline.ts               #   runPipeline() with skip-stages
│   └── token-mapping.ts          #   Token → V3 global ID mapping
│
├── scraper/                # Generic HTML scrapers
│   └── html-scraper.ts           #   Cheerio-based static scraping
│
├── lib/                    # Shared utilities
│   ├── paths.ts                  #   Research dir layout
│   ├── v3-id.ts                  #   Centralized v3Id() generator
│   ├── fetch-with-retry.ts       #   HTTP client
│   ├── env.ts                    #   Environment detection
│   └── log.ts                    #   pino-based logging
│
└── index.ts                # Public API re-exports
```

## Data Flow

### 1. Extract

**Input:** `url: string`, `viewports: number[]`, `auth?: SourceAuth`
**Output:** `extraction-result.json` containing:
- `html: string` — full rendered DOM
- `screenshots: Record<viewport, string>` — paths to PNG files
- `computedStyles: Record<selector, CSSStyleDeclaration>`
- `animations: AnimationPlan[]` — @keyframes + transitions
- `designTokens: DesignTokens` — colors, typography, spacing
- `assets: DiscoveredAsset[]` — images, fonts, SVGs, favicons
- `sections: Section[]` — detected page sections

Playwright runs:
1. Navigate to URL (with auth headers if provided)
2. **SPA hydration:** wait for `networkidle` + scroll to bottom to trigger lazy loads
3. **Lazy-scroll:** for 5 viewport-heights, waiting 500ms between scrolls
4. **Computed styles:** `window.getComputedStyle` for every visible element
5. **Font detection:** parse `<link>` + `@font-face` rules
6. **Screenshot:** viewport + full-page

### 2. Classify

**Input:** `extraction-result.json`
**Output:** `classification.json` containing per-section specs:
```ts
{
  sectionId: string;
  type: 'hero' | 'features' | 'footer' | ...;
  widgetTree: V3WidgetNode[];
  styles: V3Style[];
  designTokens: { colorIds: string[]; fontIds: string[]; ... };
  hash: string;        // for diff/incremental
}
```

The section picker presents detected sections in a multi-select prompt. Default: pick all.

### 3. Build

**Input:** `classification.json` + `design-tokens.json` + WP target
**Output:** V3 page + V3/V4 kit + custom fonts + WPCode snippets

The MCP adapter executes 4 ability groups:
1. **`setup-v4-foundation`** (session-live, no cache) — creates page, section, global variables
2. **`export-design-system`** (5min cache) — reads token state
3. **`adrians-create-global-color/typography`** (with token mapping) — pushes tokens
4. **`adrians-batch-build-page`** — writes widget tree
5. **`wpcode_set_snippet`** — injects animations

Token IDs are computed via MD5-hash of the token content → stable across rebuilds.

### 4. QA

**Input:** `extraction-result.json` screenshots + live WP page screenshot
**Output:** `auto-fix-report.json` + `qa-report.html`

Algorithm:
1. Capture live screenshot at same viewports
2. Compute pixelmatch + SSIM vs original
3. If match < target, classify issues (8 types: layout, color, font, image-broken, blank-region, size-different, alignment, text-overflow)
4. Apply pluggable fixers (4 types: color-mismatch, font-mismatch, layout-shift, image-broken)
5. Re-capture, re-diff, repeat (max 5 rounds)
6. Generate HTML report with all iterations

## State Management

`state.json` is the central resume point:

```ts
interface CloneState {
  schema: 1;
  url: string;
  target: string;
  options: WizardOptions;
  phases: {
    extract?: { completedAt: string; resultPath: string };
    classify?: { completedAt: string; resultPath: string; approvedSections: string[] };
    assets?: { completedAt: string; manifestPath: string };
    tokens?: { completedAt: string; syncedTokenIds: string[] };
    build?: { completedAt: string; pageId: number; v4PageId?: number };
    qa?: { completedAt: string; matchPercent: number; reportPath: string };
    'design-system'?: { completedAt: string };
    animations?: { completedAt: string; snippetIds: string[] };
  };
  lastUpdated: string;
}
```

`reconcile()` reads state + classifies which phase to resume from.

## Strictness Profiles

| Profile | Pixel-Match Target | SSIM Target | Max Rounds | Max Fixes/Round | Severities | Use Case |
|---|---|---|---|---|---|---|
| `draft` | 70% | 0.7 | 1 | 3 | high | Quick prototype |
| `balanced` | 85% | 0.85 | 2 | 5 | high + medium | Production clone (default) |
| `pixel-perfect` | 95% | 0.95 | 3 | 20 | all | Marketing site, brand-critical |

## MCP Adapter

The Novamira MCP exposes ~73 abilities. The adapter:
1. Opens a session via `mcp-session-open`
2. Caches ability list for 1 hour
3. Translates adapter calls (`{ ability_name, parameters }`) → JSON-RPC 2.0
4. Retries with exponential backoff on 5xx / network errors
5. Surfaces 4xx errors directly (no retry, they indicate a bug)

See `src/mcp/mcp-adapter.ts` for the full implementation.

## Design Decisions

### Why Playwright over Puppeteer?

Playwright has better auto-waiting, multi-page support, and the `evaluate()` API is more reliable for computed-style extraction. Puppeteer's `page.evaluate()` is the closest competitor but Playwright's TypeScript types are cleaner.

### Why a wizard over a config file?

Most clones are one-offs. Forcing the user to write a YAML config discourages iteration. The wizard captures options in a 9-step flow and saves to `state.json` for resume + non-interactive replay.

### Why centralize `v3Id()`?

Style-IDs and global-variable-IDs must follow a strict format (`[a-z][a-z0-9_]*`, no `-`) and be stable across rebuilds for the diff/incremental modes. Putting generation in one place ensures all IDs are consistent.

### Why JSON specs on disk?

The pipeline has 4 phases that take 30+ minutes total. Persisting intermediate specs lets us:
- Resume from any phase
- Diff between runs
- Debug a single phase without re-running the previous ones
- Cache partial results across clones of the same URL

## Performance

- **Playwright extraction:** 2-5 seconds per viewport for a typical landing page
- **Style classification:** 1-3 seconds for 50 sections
- **MCP build:** 10-30 seconds for 20 sections (depends on widget count)
- **QA capture + diff:** 5-10 seconds per round
- **End-to-end:** 30-90 seconds for a typical 10-section clone

## Security Considerations

- **Source auth** is read from a local file, never sent to a third party
- **No telemetry** — the only network call is the optional update check (cached 24h)
- **Files written are scoped** to the research directory
- **WP target credentials** are read from environment variables or the local targets file

## Future Work

- Concurrent extractions for multi-page clones
- Style transfer learning (clone one site, apply to another)
- Cloud-based build (run MCP on a hosted WP instance)
- Visual regression test suite (run on every PR)

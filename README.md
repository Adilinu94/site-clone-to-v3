# site-clone-to-v3

> **Clone any live website to Elementor V3 — pixel-accurate, on any WordPress with the Novamira plugin.**

[![Status](https://img.shields.io/badge/status-beta-yellow)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()
[![Node](https://img.shields.io/badge/node-%E2%89%A518-green)]()
[![Version](https://img.shields.io/badge/version-0.2.0-blue)]()
[![Tests](https://img.shields.io/badge/tests-910%20passing-brightgreen)]()

---

## What it does

Give it a URL (Framer, Webflow, plain HTML, WordPress with any builder, etc.) and a target WordPress with the [Novamira plugin](https://github.com/Adilinu94/novamira-adrianv2) — and you get back an **Elementor V3 page** that visually matches the original:

- **V3 Section / Column / Widget tree** (`_elementor_data` post meta)
- **V3 Global Colors + Custom Typography** (Elementor Kit)
- **Custom Fonts** via the Fonts Plugin — taxonomy `ogf_custom_fonts`
- **GSAP / CSS animations** injected as WPCode snippets
- **Pixel-diff QA** with auto-fix loop and 3 strictness profiles

Interactive wizard asks what to build and which sections to include. Works on every WordPress where the Novamira plugin is active.

## Quick Start

```bash
# Install
git clone https://github.com/Adilinu94/site-clone-to-v3
cd site-clone-to-v3
npm install
npx playwright install chromium

# Configure a WP target (one-time, saves to ~/.config/clone-v3/targets.json)
npx clone-v3 add-target

# Clone a site (interactive wizard)
npx clone-v3 https://stripe.com

# Or fully non-interactive (CI/CD)
npx clone-v3 clone https://stripe.com \
  --target solar-local \
  --viewports 1440,768,390 \
  --animations auto \
  --fonts auto \
  --strictness balanced \
  --auto-pick-sections \
  --no-wizard
```

## Commands

| Command | Description |
|---|---|
| `clone-v3 clone [url]` | Full pipeline: extract → classify → build → QA |
| `clone-v3 extract <url>` | Playwright extraction only (no build) |
| `clone-v3 extract-tokens [url]` | Extract design tokens from existing research dir |
| `clone-v3 build <research-dir>` | Build V3 page from existing extraction |
| `clone-v3 apply-kit` | Apply design tokens to a WP target (no page) |
| `clone-v3 diff [url]` | Compare extraction against previous V3 build |
| `clone-v3 add-target` | Add a WP target profile (interactive) |

## Build Modes

```bash
# Dry-run: generate V3 + V4 + animation specs, no MCP calls
npx clone-v3 clone https://example.com --dry-run

# Diff-only: compare against existing V3 page, report changes
npx clone-v3 clone https://example.com --diff-only

# Incremental: rebuild only changed sections
npx clone-v3 clone https://example.com --incremental
```

## Resume & State

Every run saves a `state.json` in the research directory. Resume from any point:

```bash
npx clone-v3 clone https://example.com --resume ./research/example.com/state.json
```

The wizard detects which phases completed and asks to skip them.

## Output Structure

```
research/example.com/
├── state.json                  # Wizard state, resume info
├── extraction-result.json      # Raw Playwright extraction
├── classification.json         # Section picker output
├── assets/                     # Downloaded images, fonts, SVGs
├── design-tokens.json          # Colors, typography, spacing
├── dryrun-page-v3.json         # V3 widget tree (dry-run)
├── dryrun-page-v4.json         # V4 atomic tree (dry-run)
├── auto-fix-report.json        # Auto-fix iterations
├── previous-sections.json      # Baseline for diff/incremental
└── pages/                      # Final V3 pages
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full module map, data flow, and design decisions.

Short version:

1. **Extract** — Playwright headless Chromium captures DOM, screenshots, computed styles, animations, fonts
2. **Classify** — Section-picker wizard → V3 widget tree per section (JSON spec)
3. **Build** — Novamira MCP writes V3 page + kit items + Fonts-Plugin custom fonts + WPCode animations
4. **QA** — Pixel-diff with configurable strictness, auto-fix loop

## Documentation

- [docs/V2-ARCHITECTURE.md](docs/V2-ARCHITECTURE.md) — **V2 module map, 12-phase data flow, V3 vs V4 schema**
- [ARCHITECTURE.md](ARCHITECTURE.md) — V1 architecture (kept for historical reference)
- [EXAMPLES.md](EXAMPLES.md) — common workflows and recipes
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — common errors and fixes
- [FAQ.md](FAQ.md) — frequently asked questions
- [CHANGELOG.md](CHANGELOG.md) — version history
- [HANDOFF.md](HANDOFF.md) — detailed implementation log per phase

## V2 Module Map (v0.2.0)

```
src/
├── scraper/          # Phase 1: Playwright crawler (SPA-hydration, lazy-scroll)
├── extractor/        # Phase 4: computed-styles + pseudo-state + custom-property + animation-property + background-image + font-loading
├── classifier/       # Phase 5: pro-detector + widget-mapper (18 V3 + 14 Pro) + widget-degradation + widget-validator
├── recon/            # Phase 3: mutation-observer + animation-events + state-capture + recon-runner (in-page IIFE + Playwright-bridge)
├── builder/          # Phase 7: v3-section + v3-multi-column + v3-builder (Multi-Column + Inner-Sections + Responsive)
├── analyzer/         # Phase 6: oklch-converter (sRGB↔Oklch) + token-extractor + token-resolver + theme-detector
├── qa/               # Phase 8: 28 issue-types (8 V1 + 20 Phase 8) + batched-fix (max 4 types/round) + render-capture (60s timeout + 2 retries + mock fallback)
├── orchestrator/     # Phase 9: manager-workflow (per-section loop) + phase-orchestrator (retry) + run-report (24 fields)
├── mcp/              # Phase 10: mcp-adapter + phase10-session (capability-exchange + reconnect) + phase10-indirection (9 op-kinds + idempotency) + phase10-call-orchestrator (circuit-breaker + batch)
└── cli/              # Phase 11: clone + dry-run + phase11-cli-flags (5 validation rules) + phase11-pipeline (6 stages) + phase11-e2e-mock (offline deterministisch)
```

## Status

**Beta — v0.2.0.** V2-Plan komplett durchgearbeitet (Phasen 0-11). **910/910 Tests grün, 0 TS-Errors.**

What's working (v0.2.0):
- **Phase 3 (Recon):** MutationObserver + WAAPI + CSS-Transition-Listener ersetzt V1's 250ms-Polling — schnelle Transitions (<100ms) werden erfasst, langsame Sites blockieren nicht mehr
- **Phase 4 (Extractor):** 80 curated computed-style-props + pseudo-state-capture (:hover/:focus/:active) + custom-property-extractor (auto-detect :root/:host) + animation-property-extractor + background-image-parser (parens-respektierend) + font-loading-state (document.fonts API)
- **Phase 5 (Classifier):** 14 Pro-Widgets (slider/accordion/tabs/counter/testimonial-carousel/price-table/animated-headline/progress-bar/forms/posts/share-buttons/gallery/image-box/icon-box) + Pro-Detection mit 6 Signal-Quellen + 7 Heuristik-Quellen + 3-stufige Degradation + Validator mit severity (error/warning/info)
- **Phase 6 (Analyzer):** sRGB↔Oklch Voll-Pipeline (W3C/css-color-4) + oklch-Token-Extraction + Token-Resolver mit Source-Traceability (override>css-variable>extracted>fallback) + Theme-Detection (data-attr>class>media-query>light-default)
- **Phase 7 (Builder):** V3-Multi-Column (1-6 columns + ratios + gap) + Inner-Sections + Responsive-Overrides + 5 SectionStructureTypes (full-width/boxed/content/multi-column/inner-section) + V1-Build preserved für Pipeline-Konsumenten
- **Phase 8 (QA):** 28 Issue-Types (8 V1 + 20 Phase 8) + Batched-Auto-Fix (max 4 types/round, max rounds cap) + Render-Capture mit 60s-Timeout + 2-Retries + Exponential-Backoff + Mock-Fallback für WP-Down
- **Phase 9 (Orchestrator):** Per-Section Loop mit 5 reconcile-state-kinds + 6 PHASE_IDs mit retry-loop + 24-Feld RunReport
- **Phase 10 (MCP):** Capability-Exchange + Reconnect (exponential-backoff + jitter) + 9 BuilderOperationKinds mit Idempotency-Keys (sha256 für idempotent, timestamp+random für non-idempotent) + Circuit-Breaker (closed/open/half-open) + Batch-Scheduler (maxConcurrentPages)
- **Phase 11 (CLI):** 5 Validation-Regeln für CLI-Flags + 6-Stage-Pipeline-Orchestrator + E2E-Mock-Layer (deterministisch für CI/offline)

What's still in progress:
- Live E2E gegen test4.nick-webdesign.de (Phase 12, braucht WP-MCP-Credentials + Playwright)
- Performance optimization for very large pages (>50 sections)
- npm publish v0.2.0

## V1 → V2 Migration

V1-Stand (commit `9bd78ab`) hatte **534 Tests / 5 Module-Pakete (scraper/extractor/classifier/builder/analyzer + qa + mcp)**. V2-Stand (commit `e4c0f47`) hat **910 Tests / 9 Modul-Erweiterungen**:
- V1's `extractor/computed-styles.ts` (60 props) → Phase 4 (80 props + 5 Sub-Module)
- V1's `classifier/widget-mapper.ts` (18 V3 widgets) → Phase 5 (+14 Pro widgets + detector + degradation + validator)
- V1's `analyzer/design-token-extractor.ts` (RGB only) → Phase 6 (+oklch-converter + resolver + theme-detector)
- V1's `qa/issue-detector.ts` (8 types) → Phase 8 (+20 types + batched-fix + render-capture)
- V1's `orchestrator/manager.ts` (monolithisch) → Phase 9 (3 Module + per-section-loop + 24-field report)
- V1's `mcp/mcp-adapter.ts` (einzelne Datei) → Phase 10 (+session + indirection + call-orchestrator)
- NEU: `src/recon/` (Phase 3 — komplett neues Modul, ersetzt V1's 250ms-polling)
- NEU: `src/cli/phase11-*` (Phase 11 — komplett neue CLI-Pipeline-Module)

Honesty-Discipline: Alle 11 V2-Commits mit `git show --stat <hash>` verifiziert + `git status -sb` clean.

## License

MIT — see [LICENSE](LICENSE).

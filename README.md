# site-clone-to-v3

> **Clone any live website to Elementor V3 — pixel-accurate, on any WordPress with the Novamira plugin.**

[![Status](https://img.shields.io/badge/status-alpha-orange)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()
[![Node](https://img.shields.io/badge/node-%E2%89%A518-green)]()
[![Tests](https://img.shields.io/badge/tests-526%20passing-brightgreen)]()

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

- [ARCHITECTURE.md](ARCHITECTURE.md) — module map, data flow, design decisions
- [EXAMPLES.md](EXAMPLES.md) — common workflows and recipes
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — common errors and fixes
- [FAQ.md](FAQ.md) — frequently asked questions
- [CHANGELOG.md](CHANGELOG.md) — version history
- [HANDOFF.md](HANDOFF.md) — detailed implementation log per phase

## Status

**Alpha — v0.1.0.** 13-phase plan mostly complete. 526/526 unit tests passing. 80% coverage on `src/`.

What's working:
- Playwright extraction (SPA hydration, lazy-scroll, computed styles, @keyframes, design tokens)
- Style classifier + widget mapper + token resolver + responsive settings + section picker
- Asset downloader (images, fonts, SVGs, favicons, OG images) + manifest builder
- MCP adapter (session handshake, retry, indirection, V4 schema support)
- Design system sync + V3/V4 builders + visual acceptance
- Animation injector + WPCode snippet planner
- Visual QA: strictness profiles, SSIM, issue detection (8 types), auto-fix loop, HTML reports
- Interactive wizard (9 steps) + state-manager + resume + step-by-step pipeline
- Build modes: dry-run, diff-only, incremental
- Update checker + changelog generator

What's still in progress:
- Live E2E against multiple WP targets (requires running Novamira plugin)
- 1-2 of the strictness profiles may need tuning with real screenshots
- Performance optimization for very large pages (>50 sections)

## License

MIT — see [LICENSE](LICENSE).

# site-clone-to-v3

> **Clone any live website to Elementor V3 — pixel-accurate, on any WordPress with the Novamira plugin.**

[![Status](https://img.shields.io/badge/status-alpha-orange)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()
[![Node](https://img.shields.io/badge/node-%E2%89%A518-green)]()

---

## What it does

Give it a URL (Framer, Webflow, HTML, WordPress with any builder, etc.) + a target WordPress with the Novamira plugin — and you get back an **Elementor V3 page** that visually matches the original, including:

- **V3 Section/Column/Widget tree** (`_elementor_data` post meta)
- **V3 Global Colors + Custom Typography** (Elementor Kit)
- **Custom Fonts** via the Fonts Plugin (https://docs.fontsplugin.com/) — Taxonomy `ogf_custom_fonts`
- **GSAP / CSS animations** injected as WPCode snippets
- **Pixel-diff QA** with auto-fix loop (configurable strictness)

Interactive 9-step wizard asks what to build and which sections to include. Works on every WordPress where the Novamira plugin is active.

## Quick Start

```bash
# Not yet published — Phase 0 in progress
git clone https://github.com/Adilinu94/site-clone-to-v3
cd site-clone-to-v3
npm install
npx playwright install chromium

# Configure a WP target
npx clone-v3 --add-target

# Run a clone
npx clone-v3 https://stripe.com --target solar.local --strictness balanced
```

## Status

**Alpha — Phase 0.1 in progress.** See the [Bauplan](../Umbau/BAUPLAN-SITE-CLONE-TO-V3.md) (lives in the parent `Umbau/` repo) for the full 13-phase plan, architecture, and decisions.

Current test count: not yet started.

## Architecture

3 stages:

1. **Extract** — Playwright headless Chromium captures DOM, screenshots, computed styles, animations, fonts
2. **Classify** — Section-picker wizard → V3 widget tree per section (JSON spec)
3. **Build** — Novamira MCP writes V3 page + kit items + Fonts-Plugin custom fonts + WPCode animations

See `docs/` for details (added as the project grows).

## License

MIT — see [LICENSE](LICENSE).

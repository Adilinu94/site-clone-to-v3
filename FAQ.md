# FAQ

> Frequently asked questions about site-clone-to-v3.

## General

### What does it do?

It clones a live website (any URL — Framer, Webflow, plain HTML, WordPress, etc.) into an Elementor V3 page on your WordPress. The cloned page uses your Elementor Kit, custom fonts, and animations, and can be edited like any other Elementor page.

### Why Elementor V3 specifically?

V3 is the production-stable version of Elementor that's widely deployed. V4 (atomic widgets) is still in beta. The pipeline can output V4 specs (`dryrun-page-v4.json`) for forward-compatibility, but the build target is V3.

### Does it work with my WordPress?

Yes, as long as the [Novamira plugin](https://github.com/Adilinu94/novamira-adrianv2) is installed and active. The plugin exposes the MCP abilities that the build phase uses.

### Is it free?

The MIT-licensed code is free. Your WordPress hosting and the time spent on clones are not. There is no SaaS component.

## Comparison

### How is this different from other site cloner tools?

- **Pixel-accurate via real Chromium rendering** — not just a DOM dump
- **Idempotent** — re-running the same clone produces the same V3 page (stable IDs)
- **Resumable** — pause and resume from any phase
- **Strictness profiles + auto-fix** — automated QA with feedback loop
- **Design system sync** — pushes colors, typography, spacing to Elementor's Kit (reusable across pages)

### How is this different from the Framer → Elementor pipeline?

The Framer pipeline (`framer-v4-pipeline-v2-main`) is for **your own Framer projects** — you have the source XML, you can read the design tokens directly. `site-clone-to-v3` is for **any public website** — it has to reverse-engineer the design via DOM scraping + computed styles.

### Could I use this to clone my competitor's site?

Technically yes, ethically no. Be aware of:
- **Copyright** — cloned content may be copyrighted
- **Trademark** — logos, brand colors may be trademarked
- **Terms of service** — some sites prohibit scraping

Use it for inspiration, design analysis, or cloning your **own** sites across domains.

## Technical

### How does the design system sync work?

The pipeline extracts CSS custom properties + computed styles into `design-tokens.json`. It then calls the MCP ability `adrians-create-global-color` (or `typography`) with:
- A stable ID (MD5 hash of the token content)
- The token value
- The token name (human-readable)

Elementor stores these in `_elementor_global_settings` and assigns a numeric ID. The MD5-hash in our token map matches the numeric ID, so re-running the same clone updates the same token (idempotent).

### Why are some sections auto-approved in the picker?

Sections with high confidence scores (clearly-hero, clearly-pricing, etc.) are marked with `[auto]` in the picker. You can still deselect them.

### Can I customize the V3 widget mapping?

The widget mapper has a list of CSS-selector → V3-widget rules. To customize, edit `src/classifier/widget-mapper.ts` and add a rule. Or open an issue with the source URL + desired output.

### Why not output V4 directly?

V4 is still in beta (`4.1.0-beta1` on test4.nick-webdesign.de). The V4 specs are generated as a side-effect (in `dryrun-page-v4.json`) for forward-compatibility, but the build targets V3 for now.

### What happens to my existing Elementor content?

Nothing. The clone creates a **new page** (or updates a specified page ID). Existing pages, posts, and other content are untouched.

## Workflow

### Can I run it from CI/CD?

Yes:

```bash
npx clone-v3 clone https://example.com \
  --target my-wp \
  --viewports 1440 \
  --animations none \
  --fonts system \
  --strictness draft \
  --auto-pick-sections \
  --no-wizard \
  --format json \
  --no-color
```

### Can I run it on a schedule?

Yes, with cron:

```bash
# /etc/cron.daily/clone-staging
0 3 * * * cd /opt/clone-v3 && npx clone-v3 clone https://staging.example.com --target my-wp --no-wizard --resume
```

### Can multiple clones run in parallel?

Yes, but use **different research directories**:

```bash
# Clone A
npx clone-v3 clone https://site-a.com --target my-wp --output research/site-a

# Clone B (parallel)
npx clone-v3 clone https://site-b.com --target my-wp --output research/site-b
```

### How do I undo a clone?

The state file records the page ID. You can:
1. Delete the page in WP Admin
2. Or call `wp post delete <id> --force` via WP-CLI

The plugin does not currently offer a rollback ability.

## Limits

### What's the largest site I can clone?

Tested up to ~80 sections. Beyond that:
- Extraction time grows linearly (~50ms per section)
- Build time grows linearly (~200ms per section)
- Memory usage is bounded (~50MB peak)

### Can I clone a single-page app with code-splitting?

Yes. The extractor waits for `networkidle` + scrolls to trigger lazy-loaded sections. If sections are loaded only on user interaction (click, scroll-to-anchor), they won't be captured.

### Can I clone a site that requires login?

Yes, with `--source-auth`. Save cookies or basic-auth credentials to `~/.config/clone-v3/source-auth.json` and reference by name.

### Can I clone a WordPress site to another WordPress?

Yes, but be aware:
- The Elementor version on the target must be ≥3.0
- If the source is also Elementor, the clone will be very accurate (Elementor widgets map 1:1)
- If the source is a different page builder, the accuracy depends on the CSS-to-widget mapping rules

## Support

### Where do I report bugs?

[GitHub Issues](https://github.com/Adilinu94/site-clone-to-v3/issues)

### Where do I ask questions?

[GitHub Discussions](https://github.com/Adilinu94/site-clone-to-v3/discussions)

### Is there a Discord/Slack?

Not yet. Open an issue if you'd like one.

## Contributing

### Can I contribute?

Yes. Open a PR with:
- A clear description
- Tests for new behavior
- Updated docs

### What's the tech stack?

- **TypeScript** (strict mode, ESM)
- **Commander** (CLI)
- **Inquirer** (interactive prompts)
- **Playwright** (headless Chromium)
- **Cheerio** (static HTML parsing)
- **Pixelmatch** + **SSIM.js** (image diffing)
- **Vitest** (testing)
- **Novamira MCP** (WordPress build)

See [ARCHITECTURE.md](ARCHITECTURE.md) for details.

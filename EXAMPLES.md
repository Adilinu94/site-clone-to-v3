# Examples

> Common workflows and recipes for site-clone-to-v3.

## Basic Clone

```bash
npx clone-v3 clone https://example.com --target my-wp
```

The wizard will ask 9 questions: URL confirmation, target, viewports, animations, fonts, strictness, section picker, and plan summary.

## Non-Interactive Clone (CI/CD)

```bash
npx clone-v3 clone https://example.com \
  --target my-wp \
  --viewports 1440,768,390 \
  --animations auto \
  --fonts auto \
  --strictness balanced \
  --auto-pick-sections \
  --no-wizard
```

## Pre-Build a Spec Without MCP Calls (Dry-Run)

```bash
npx clone-v3 clone https://example.com --target my-wp --dry-run
```

This produces:
- `research/example.com/dryrun-page-v3.json`
- `research/example.com/dryrun-page-v4.json`
- `research/example.com/dryrun-build-summary.json`
- `research/example.com/dryrun-animations/*.json`

No WP changes. Useful for code review or design comparison.

## Compare Against Existing Build (Diff-Only)

```bash
npx clone-v3 clone https://example.com --target my-wp --diff-only
```

Reports which sections are **added**, **modified**, **removed**, or **unchanged** vs the previous build. Exits without writing anything.

## Rebuild Only Changed Sections (Incremental)

```bash
npx clone-v3 clone https://example.com --target my-wp --incremental
```

Reads `previous-sections.json` and the new extraction, computes a per-section hash diff, and only rebuilds changed sections. Requires a prior `--diff-only` or `--save-snapshots` run.

## Resume from Saved State

```bash
npx clone-v3 clone https://example.com --resume ./research/example.com/state.json
```

Skips phases that completed in the saved state. The wizard prompts to confirm the resume target.

## Multi-Source Auth (Cookie / Basic Auth)

Create `~/.config/clone-v3/source-auth.json`:

```json
{
  "staging": {
    "cookies": [
      { "name": "session", "value": "abc123", "domain": ".staging.example.com" }
    ]
  },
  "private-site": {
    "headers": {
      "Authorization": "Basic dXNlcjpwYXNz"
    }
  }
}
```

Use with `--source-auth staging`:

```bash
npx clone-v3 clone https://staging.example.com --source-auth staging --target my-wp
```

## Configure a New WP Target

```bash
npx clone-v3 add-target
```

The wizard asks for:
- Target name (e.g. `solar-local`)
- Base URL (e.g. `https://solar.local`)
- MCP adapter URL (e.g. `https://solar.local/wp-json/novamira-adrianv2/v1/mcp`)
- Auth token (read from environment variable or paste directly)

Saved to `~/.config/clone-v3/targets.json`.

## Extract Without Building

```bash
# Just run Playwright extraction, save to research/ dir
npx clone-v3 extract https://example.com

# Reuse a previous extraction
npx clone-v3 extract-tokens --from ./research/example.com
```

## Build from Existing Extraction

```bash
npx clone-v3 build ./research/example.com --target my-wp --strictness pixel-perfect
```

## Apply Design Tokens Without Building a Page

```bash
npx clone-v3 apply-kit --tokens ./research/example.com/design-tokens.json --target my-wp
```

Use `--merge` to only add new tokens (don't overwrite existing).

## Run QA on a Built Page

```bash
npx clone-v3 diff https://example.com --target my-wp
```

Compares the new extraction against the V3 page that was built from a previous run. Outputs:
- Per-section: `added | modified | removed | unchanged`
- Aggregate match % per viewport
- HTML report at `research/example.com/qa-report.html`

## Save Extraction as New Baseline

```bash
npx clone-v3 diff https://example.com --target my-wp --save-snapshots
```

Writes `previous-sections.json` for use with future `--incremental` runs.

## Custom Viewports

```bash
npx clone-v3 clone https://example.com --viewports 1920,1440,1024,768,390
```

Default is `1440,768,390` (desktop, tablet, mobile).

## Animation Strategy

| Value | Effect |
|---|---|
| `none` | No animations injected |
| `css` | Use only CSS keyframes (no JS) |
| `gsap` | Use GSAP for entrance/scroll animations |
| `auto` | Pick the best strategy per section (default) |

```bash
npx clone-v3 clone https://example.com --animations gsap
```

## Font Strategy

| Value | Effect |
|---|---|
| `auto` | Detect fonts from source, upload via Fonts Plugin (default) |
| `system` | Use system font stack, no upload |
| `all` | Upload every detected font (including system fonts) |

```bash
npx clone-v3 clone https://example.com --fonts system
```

## JSON Output for Scripts

```bash
npx clone-v3 clone https://example.com --format json --no-color
```

Machine-readable output for piping into other tools.

## Debug a Stuck Pipeline

```bash
# Set the global timeout to 10 minutes
npx clone-v3 clone https://example.com --timeout 600

# Or set the env var
CLONE_V3_TIMEOUT=600 npx clone-v3 clone https://example.com
```

# Troubleshooting

> Common errors and fixes for site-clone-to-v3.

## Installation Issues

### `Cannot find module '@playwright/test'` after `npm install`

Playwright browsers are not auto-installed. Run:

```bash
npx playwright install chromium
```

### `EACCES: permission denied` on Linux/macOS

Don't use `sudo` with npm. Either:
- Use [nvm](https://github.com/nvm-sh/nvm) to install Node as a user
- Or set npm's prefix: `npm config set prefix ~/.local`

### `gyp ERR! find Python` on Windows

Playwright's `node-gyp` build needs Visual Studio Build Tools. Either:
- Install [windows-build-tools](https://github.com/felixrieseberg/windows-build-tools)
- Or skip native deps: `npm install --ignore-scripts`

## Extraction Issues

### `Error: net::ERR_ABORTED` or `net::ERR_CONNECTION_REFUSED`

The source URL is unreachable. Check:
- Is the URL correct?
- Is the site behind auth? Use `--source-auth`.
- Is the site using a self-signed cert? Add `NODE_TLS_REJECT_UNAUTHORIZED=0` (dev only).

### `TimeoutError: page.goto: Timeout 30000ms exceeded`

The site is slow. Increase the timeout:

```bash
npx clone-v3 extract https://example.com --timeout 120
```

### `ElementHandle is detached` errors

The site uses heavy JavaScript that mutates the DOM. The extractor already handles SPA hydration + lazy-scroll, but some apps may need longer. Try:

```bash
# Increase wait time
PLAYWRIGHT_BROWSERS_PATH=0 npx clone-v3 extract https://example.com --timeout 180
```

### `Cannot read property 'getComputedStyle' of null`

The extractor ran before the page was ready. This is usually a timing issue. Re-run with the default settings — the extractor waits for `networkidle` and scrolls.

## Build Issues

### `MCP error: 401 Unauthorized`

The auth token is missing or wrong. Check `~/.config/clone-v3/targets.json`:

```json
{
  "my-wp": {
    "url": "https://example.com",
    "mcp": "https://example.com/wp-json/novamira-adrianv2/v1/mcp",
    "token": "abc123..."  // <-- check this
  }
}
```

### `MCP error: 404 Not Found — ability 'foo'`

The Novamira plugin doesn't have the ability. Update the plugin:

```bash
cd /path/to/novamira-adrianv2
git pull
php composer.phar install --no-dev
```

Then run `npx clone-v3 extract-tokens` to refresh the cached ability list.

### `MCP error: 500 — invariant I violated`

A style binding points to a non-existent style. This is a build bug. Open an issue with the full error and the `dryrun-page-v3.json` file.

### `WPCode snippet rejected: invalid PHP`

The animation injector generated malformed PHP. Check `research/example.com/dryrun-animations/*.json` for the snippet, then file an issue with the snippet content.

## QA Issues

### `pixel-perfect: match 99% but SSIM 0.4`

The page looks correct visually but the structural similarity is low. This usually means the font substitution didn't apply — the system is rendering with a fallback font. Check:
- Are the custom fonts uploaded? Look in WP Admin → Fonts → Custom Fonts
- Is the Fonts Plugin active?

### `Auto-fix loop hit max rounds (5) without reaching target`

The fixers couldn't close the gap. Common causes:
- Missing tokens (auto-fix can't create new ones, only modify existing)
- Image differences (PNG vs WebP, lossy compression)
- Different rendering engines (target uses Chromium, source might use Safari/Firefox)

Solutions:
- Lower strictness to `balanced`
- Disable the broken fixer (TODO: not yet implemented)
- File an issue with the `auto-fix-report.json`

### `region match failed: blank-region`

The cloned page has a blank section where the source has content. This is usually a missing asset (failed download). Check `research/example.com/assets/` — were all images downloaded?

## Resume Issues

### `state.json: missing required field 'phases'`

The state file is from an older schema version. Either:
- Delete the state file and start fresh
- Or upgrade the schema (TODO: add migration script)

### `Resume target phase 'qa' is not eligible`

The phase you resumed from has unmet dependencies. The wizard will offer to re-run the missing phases.

## General

### `npx clone-v3: command not found`

The `bin` path is not on `$PATH`. Use `npx clone-v3` (with npx) instead of `clone-v3`.

Or install globally:

```bash
npm install -g site-clone-to-v3
```

### `EISDIR: illegal operation on a directory`

The `--output` path points to an existing directory, but a file was expected. Either:
- Use a different name
- Or remove the directory first

### The wizard is asking questions I already answered

The `state.json` was deleted or corrupted. Re-run from scratch or use `--no-wizard` with all flags.

## Performance Issues

### `Extraction takes 5+ minutes`

Either:
- The site is very large (50+ sections)
- The site has heavy JS that takes long to hydrate
- Your network is slow

Solutions:
- Use `--viewports 1440` (single viewport) for fast iteration
- Use `--no-color --no-wizard` to reduce overhead
- Set `CLONE_V3_TIMEOUT=600` for long-running builds

### `MCP build is slow (30+ seconds for 20 sections)`

The Novamira plugin has a lot of validation overhead. This is normal for the first build. Subsequent builds (with `--incremental`) are much faster.

## Getting Help

1. Check the [FAQ](FAQ.md) for common questions
2. Search [existing issues](https://github.com/Adilinu94/site-clone-to-v3/issues)
3. Open a new issue with:
   - The full command that failed
   - The `state.json` (if it exists)
   - The `extraction-result.json` (if it exists)
   - The error output
4. Or open a [discussion](https://github.com/Adilinu94/site-clone-to-v3/discussions)

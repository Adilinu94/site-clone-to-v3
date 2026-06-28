#!/usr/bin/env node
/**
 * scripts/visual-diff.mjs
 * Visual diff between two URLs (V3 original vs V4 converted).
 *
 * Usage:
 *   node scripts/visual-diff.mjs \
 *     --v3-url "https://example.com/" \
 *     --v4-url "https://example.com/v4-page/" \
 *     --viewports "desktop,mobile" \
 *     --full-page true \
 *     --output diff-output/
 *
 * Outputs:
 *   diff-output/<viewport>-v3.png
 *   diff-output/<viewport>-v4.png
 *   diff-output/<viewport>-diff.png
 *   diff-output/report.html       (self-contained, opens in browser)
 *   stdout: JSON summary { results: [...] }
 *
 * Exit codes:
 *   0  all viewports >= 85% match
 *   1  one or more viewports < 85% match (visual regression)
 *   2  configuration / runtime error
 */

import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

// ── CLI args ──────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    "v3-url":    { type: "string" },
    "v4-url":    { type: "string" },
    viewports:   { type: "string", default: "desktop,mobile" },
    "full-page": { type: "string", default: "true" },
    output:      { type: "string", default: "diff-output" },
    threshold:   { type: "string", default: "0.1" },   // pixelmatch threshold 0–1
    "pass-pct":  { type: "string", default: "85" },    // % match required to pass
  },
  strict: true,
});

const V3_URL   = args["v3-url"];
const V4_URL   = args["v4-url"];
const FULL_PAGE = args["full-page"] !== "false";
const OUT_DIR  = args.output;
const THRESHOLD = parseFloat(args.threshold);
const PASS_PCT  = parseFloat(args["pass-pct"]);

if (!V3_URL || !V4_URL) {
  console.error("ERROR: --v3-url and --v4-url are required");
  process.exit(2);
}

// ── Viewport presets ──────────────────────────────────────────────────────────

const VIEWPORT_PRESETS = {
  desktop: { width: 1440, height: 900 },
  tablet:  { width: 768,  height: 1024 },
  mobile:  { width: 390,  height: 844 },
};

const requestedViewports = args.viewports
  .split(",")
  .map((v) => v.trim().toLowerCase())
  .filter((v) => VIEWPORT_PRESETS[v]);

if (requestedViewports.length === 0) {
  console.error("ERROR: No valid viewports. Valid: desktop, tablet, mobile");
  process.exit(2);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Screenshot helper ─────────────────────────────────────────────────────────

async function capture(page, url, vp, outPath) {
  await page.setViewportSize(vp);

  // Attempt load — networkidle can timeout on heavy pages
  const loadOk = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);

  if (!loadOk) {
    await page.waitForTimeout(8000);
  }

  // Wait until body has content (not a blank/error page)
  await page.waitForFunction(
    () => document.body && document.body.innerHTML.length > 5000,
    { timeout: 20_000 }
  ).catch(() => {});

  // Scroll to trigger lazy-load images, then back to top
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));

  // Final settle time for CSS animations
  await page.waitForTimeout(2500);

  await page.screenshot({ path: outPath, fullPage: FULL_PAGE });
}

// ── Pixel diff helper ─────────────────────────────────────────────────────────

function diff(v3Path, v4Path, diffPath) {
  const img1 = PNG.sync.read(fs.readFileSync(v3Path));
  const img2 = PNG.sync.read(fs.readFileSync(v4Path));

  // Normalise dimensions (crop to min width/height)
  const width  = Math.min(img1.width,  img2.width);
  const height = Math.min(img1.height, img2.height);

  // Ensure both images have the same buffer size for pixelmatch
  const crop = (png, w, h) => {
    if (png.width === w && png.height === h) return png.data;
    const out = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const srcOff = y * png.width * 4;
      const dstOff = y * w * 4;
      png.data.copy(out, dstOff, srcOff, srcOff + w * 4);
    }
    return out;
  };

  const d1 = crop(img1, width, height);
  const d2 = crop(img2, width, height);
  const out = new PNG({ width, height });

  const numDiff = pixelmatch(d1, d2, out.data, width, height, { threshold: THRESHOLD });
  fs.writeFileSync(diffPath, PNG.sync.write(out));

  const total    = width * height;
  const matchPct = (((total - numDiff) / total) * 100).toFixed(2);
  return { numDiff, total, matchPct: parseFloat(matchPct) };
}

// ── HTML report helper ────────────────────────────────────────────────────────

function toDataUri(filePath) {
  const data = fs.readFileSync(filePath).toString("base64");
  return `data:image/png;base64,${data}`;
}

function buildReport(results, viewports) {
  const rows = results
    .map(
      (r) =>
        `<tr>
          <td>${r.label}</td>
          <td style="color:${r.matchPct>=PASS_PCT?'green':'red'};font-weight:bold">${r.matchPct}%</td>
          <td>${r.numDiff.toLocaleString()} / ${r.total.toLocaleString()}</td>
          <td>${r.matchPct >= PASS_PCT ? "✅ PASS" : "⚠️ DIFF"}</td>
        </tr>`
    )
    .join("");

  const sections = viewports
    .map((label) => {
      const v3  = toDataUri(path.join(OUT_DIR, `${label}-v3.png`));
      const v4  = toDataUri(path.join(OUT_DIR, `${label}-v4.png`));
      const dif = toDataUri(path.join(OUT_DIR, `${label}-diff.png`));
      return `
        <h2>${label}</h2>
        <div class="grid">
          <div><h3>V3 Original</h3><img src="${v3}"></div>
          <div><h3>V4 Converted</h3><img src="${v4}"></div>
          <div><h3>Pixel Diff (red = changed)</h3><img src="${dif}"></div>
        </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Visual Diff Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui,sans-serif; max-width: 1600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
  h1 { border-bottom: 2px solid #333; padding-bottom: 8px; }
  table { border-collapse: collapse; width: 100%; background: white; border-radius: 8px; overflow: hidden; }
  th,td { border: 1px solid #ddd; padding: 10px 14px; text-align: left; }
  th { background: #333; color: white; }
  .grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-bottom: 40px; }
  .grid div { background: white; border-radius: 8px; padding: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.1); }
  .grid img { width: 100%; border: 1px solid #eee; border-radius: 4px; }
  h3 { margin: 0 0 8px; font-size: 0.85rem; color: #555; }
  .meta { background: white; border-radius: 8px; padding: 14px 18px; margin: 16px 0; font-size: 0.9rem; color: #444; }
  .meta code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
</style>
</head>
<body>
<h1>Visual Diff Report — V3 vs V4</h1>
<div class="meta">
  <strong>V3:</strong> <code>${V3_URL}</code><br>
  <strong>V4:</strong> <code>${V4_URL}</code><br>
  <strong>Generated:</strong> ${new Date().toISOString()}
  &nbsp;|&nbsp; <strong>Full-page:</strong> ${FULL_PAGE}
  &nbsp;|&nbsp; <strong>Threshold:</strong> ${THRESHOLD}
  &nbsp;|&nbsp; <strong>Pass &gt;=:</strong> ${PASS_PCT}%
</div>
<table>
  <tr><th>Viewport</th><th>Match %</th><th>Diff Pixels</th><th>Status</th></tr>
  ${rows}
</table>
${sections}
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const page    = await browser.newPage();

const results = [];

for (const label of requestedViewports) {
  const vp      = VIEWPORT_PRESETS[label];
  const v3Path  = path.join(OUT_DIR, `${label}-v3.png`);
  const v4Path  = path.join(OUT_DIR, `${label}-v4.png`);
  const difPath = path.join(OUT_DIR, `${label}-diff.png`);

  process.stderr.write(`[${label}] Capturing V3...`);
  await capture(page, V3_URL, vp, v3Path);
  process.stderr.write(` V4...`);
  await capture(page, V4_URL, vp, v4Path);
  process.stderr.write(` diffing...\n`);

  const { numDiff, total, matchPct } = diff(v3Path, v4Path, difPath);
  const passed = matchPct >= PASS_PCT;
  process.stderr.write(`  → ${matchPct}% match ${passed ? "✅" : "⚠️"}\n`);
  results.push({ label, matchPct, numDiff, total, passed });
}

await browser.close();

// Write HTML report
const reportPath = path.join(OUT_DIR, "report.html");
fs.writeFileSync(reportPath, buildReport(results, requestedViewports));

// stdout: JSON (for GH Actions step summary / CI parsing)
const summary = { v3_url: V3_URL, v4_url: V4_URL, full_page: FULL_PAGE, results, reportPath };
console.log(JSON.stringify(summary, null, 2));

// Exit code
const allPassed = results.every((r) => r.passed);
process.exit(allPassed ? 0 : 1);

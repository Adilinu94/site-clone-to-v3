/**
 * Font-Downloader — Sprint 4B.
 *
 * Plan §4 Task 2:
 * - Lade .woff2 (Priorität), .woff (Fallback) herunter
 * - Behalte Original-Filename (für `@font-face src: url(...)`)
 * - Speichere in `assets/fonts/`
 * - NICHT zu WP hochladen hier — passiert in Stage 5.1 (Fonts-Plugin-Import)
 *
 * The FontIntercept structure already carries family/weight/style (from
 * font-discovery.ts which parsed Google Fonts query params). We extract
 * the original filename from the URL path, sanitize it for the filesystem,
 * and write to disk.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { Buffer } from 'node:buffer';
import { request as undiciRequest } from 'undici';
import pLimit from 'p-limit';
import type { FontIntercept } from '../extractor/types.js';

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB cap (fonts are small)

/** Font manifest entry. */
export interface FontManifestEntry {
  local_path: string;
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  filesize: number;
  downloaded_at: string;
  /** Original filename extracted from the URL. */
  original_name: string;
  /** Format extension (woff2, woff, ttf, otf). */
  format: 'woff2' | 'woff' | 'truetype' | 'opentype';
}

/** Result of `downloadFonts`. */
export interface DownloadFontsResult {
  manifest: Record<string, FontManifestEntry>;
  errors: Array<{ url: string; reason: string }>;
}

/** Options for `downloadFonts`. */
export interface DownloadFontsOptions {
  /** Source hostname (used for organizing). */
  hostname: string;
  /** Output root (e.g. "research/stripe.com/assets"). */
  outputRoot: string;
  /** Concurrency (default 4). */
  concurrency?: number;
  /** Only download these formats (default: woff2, woff). */
  allowedFormats?: Array<'woff2' | 'woff' | 'truetype' | 'opentype'>;
  /** HTTP headers to add to every request. */
  headers?: Record<string, string>;
}

/**
 * Extract a filesystem-safe filename from a font URL.
 * For Google Fonts CSS (which points to a stylesheet, not the actual font),
 * the filename will be the stylesheet name. For woff2/woff URLs from gstatic,
 * the filename is preserved.
 */
export function extractFontFilename(url: string): string {
  try {
    const u = new URL(url);
    const pathname = u.pathname;
    const last = basename(pathname);
    if (last && last.includes('.')) {
      return sanitizeFilename(last);
    }
    // No file in path (e.g. gstatic.com/s/inter/v12/) — derive from path
    const parts = pathname.split('/').filter(Boolean);
    let slug: string;
    if (parts.length === 0) {
      slug = 'font-' + hashString(url).slice(0, 8);
    } else {
      slug = parts.join('-').replace(/\./g, '-');
    }
    return sanitizeFilename(slug + '.woff2');
  } catch {
    return sanitizeFilename('font-' + hashString(url).slice(0, 8) + '.woff2');
  }
}

/** Remove/replace chars that are unsafe in filenames. */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 200) || 'font';
}

/** Stable hash for fallback names. */
function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

/** Map FontIntercept type to format extension. */
function formatFromType(type: FontIntercept['type']): 'woff2' | 'woff' | 'truetype' | 'opentype' | null {
  switch (type) {
    case 'woff2': return 'woff2';
    case 'woff': return 'woff';
    case 'truetype': return 'truetype';
    case 'opentype': return 'opentype';
    default: return null;
  }
}

/** Skip Google Fonts CSS responses (they're stylesheets, not fonts). */
export function isFontFileUrl(url: string, type: FontIntercept['type']): boolean {
  if (type === 'google-fonts-css') return false;
  if (type === 'unknown') {
    // Be conservative — only allow if extension is recognizable
    return /\.(woff2?|ttf|otf)(\?|$)/i.test(url);
  }
  return true;
}

/** Fetch with timeout, size cap. */
async function fetchBuffer(
  url: string,
  options: { timeoutMs: number; maxBytes: number; headers?: Record<string, string> },
): Promise<Buffer> {
  const res = await undiciRequest(url, {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; CloneV3/0.0.0; +https://github.com/Adilinu94/site-clone-to-v3)',
      'Accept': 'font/woff2,font/woff,font/ttf,font/otf,*/*;q=0.8',
      ...options.headers,
    },
    bodyTimeout: options.timeoutMs,
    headersTimeout: options.timeoutMs,
  });

  if (res.statusCode >= 400) {
    await res.body.text();
    throw new Error(`HTTP ${res.statusCode} for ${url}`);
  }
  const contentLength = Number(res.headers['content-length'] ?? '0');
  if (contentLength > options.maxBytes) {
    await res.body.text();
    throw new Error(`File too large (${contentLength} > ${options.maxBytes})`);
  }

  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of res.body) {
    const buf = chunk as Buffer;
    received += buf.length;
    if (received > options.maxBytes) {
      throw new Error(`File exceeded ${options.maxBytes} bytes`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

/** Build a FontManifestEntry from intercept + local filename. */
function buildFontEntry(
  intercept: FontIntercept,
  body: Buffer,
  subdir: string,
  filename: string,
): FontManifestEntry {
  const format = formatFromType(intercept.type) ?? 'woff2';
  return {
    local_path: join(subdir, filename).replace(/\\/g, '/'),
    family: intercept.family ?? 'Unknown',
    weight: intercept.weight ?? 400,
    style: intercept.style ?? 'normal',
    filesize: body.length,
    downloaded_at: new Date().toISOString(),
    original_name: filename,
    format,
  };
}

/**
 * Download all fonts in parallel and write to disk.
 * Skips Google Fonts CSS responses (those are stylesheets, not actual font files).
 */
export async function downloadFonts(
  intercepts: FontIntercept[],
  options: DownloadFontsOptions,
): Promise<DownloadFontsResult> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const limit = pLimit(concurrency);

  const allowed = new Set(options.allowedFormats ?? ['woff2', 'woff']);
  const subdir = 'fonts';
  const targetDir = resolve(options.outputRoot, subdir);
  await mkdir(targetDir, { recursive: true });

  const manifest: Record<string, FontManifestEntry> = {};
  const errors: Array<{ url: string; reason: string }> = [];

  const tasks = intercepts.map((intercept) =>
    limit(async () => {
      if (!isFontFileUrl(intercept.url, intercept.type)) {
        errors.push({ url: intercept.url, reason: 'not_a_font_file' });
        return;
      }
      const format = formatFromType(intercept.type);
      if (!format || !allowed.has(format)) {
        errors.push({ url: intercept.url, reason: `format_not_allowed:${intercept.type}` });
        return;
      }
      try {
        const body = await fetchBuffer(intercept.url, {
          timeoutMs: DEFAULT_TIMEOUT_MS,
          maxBytes: MAX_FILE_SIZE_BYTES,
          headers: options.headers,
        });
        const filename = extractFontFilename(intercept.url);
        const localAbsPath = join(targetDir, filename);
        await writeFile(localAbsPath, body);
        manifest[intercept.url] = buildFontEntry(intercept, body, subdir, filename);
      } catch (e) {
        errors.push({
          url: intercept.url,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  await Promise.all(tasks);
  return { manifest, errors };
}

/**
 * Image-Downloader — Sprint 4A.
 *
 * Plan §4 Task 1:
 * - Parallel downloads (4 simultaneously via p-limit)
 * - sharp für Format-Validation + Metadata
 * - `nanoid(8).extension` als Filename
 * - Skips data:-URLs (inline-base64) und blob:-URLs
 * - Falls back to original filename if nanoid is configured away
 *
 * Output: writes <outputDir>/<sub>/<filename>.<ext>
 * Manifest-Entry: { local_path, mime, width, height, filesize, downloaded_at }
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join, parse, resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { request as undiciRequest } from 'undici';
import sharp from 'sharp';
import pLimit from 'p-limit';
import { customAlphabet } from 'nanoid';

const nanoid8 = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB safety cap

const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif', '.bmp', '.tiff',
]);

/** Image asset manifest entry. */
export interface ImageManifestEntry {
  local_path: string;
  mime: string;
  width?: number;
  height?: number;
  filesize: number;
  downloaded_at: string;
  /** Optional: source alt text for accessibility preservation. */
  alt?: string;
  /** Optional: original filename for reference. */
  original_name?: string;
}

/** Single image download input. */
export interface ImageDownload {
  url: string;
  /** Optional alt text. */
  alt?: string;
}

/** Options for `downloadImages`. */
export interface DownloadImagesOptions {
  /** Source hostname (e.g. "stripe.com") — used for fallback-filename derivation. */
  hostname: string;
  /** Sub-directory inside the assets tree (e.g. "images", "backgrounds"). */
  subdir: string;
  /** Output root (e.g. "research/stripe.com/assets"). */
  outputRoot: string;
  /** Concurrency (default 4). */
  concurrency?: number;
  /** Override filename generation (for deterministic output). */
  filenameFor?: (url: string, ext: string) => string;
  /** HTTP headers to add to every request. */
  headers?: Record<string, string>;
}

/**
 * Normalize URL: strip hash, decode known tracking params.
 * Doesn't change the host or path.
 */
export function normalizeImageUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    // strip common tracking params
    for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid']) {
      u.searchParams.delete(p);
    }
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Pick the file extension. Prefers URL path, falls back to MIME type.
 */
export function extensionForUrlOrMime(url: string, mime?: string): string {
  const fromUrl = extname(new URL(url).pathname).toLowerCase();
  if (fromUrl && IMAGE_EXTENSIONS.has(fromUrl)) return fromUrl;
  if (mime) {
    if (mime === 'image/png') return '.png';
    if (mime === 'image/jpeg' || mime === 'image/jpg') return '.jpg';
    if (mime === 'image/webp') return '.webp';
    if (mime === 'image/gif') return '.gif';
    if (mime === 'image/svg+xml') return '.svg';
    if (mime === 'image/avif') return '.avif';
    if (mime === 'image/bmp') return '.bmp';
    if (mime === 'image/tiff') return '.tiff';
  }
  return '.bin';
}

/** Generate a stable-but-unique filename like `abc12345.png`. */
export function generateImageFilename(url: string, mime: string | undefined): string {
  const ext = extensionForUrlOrMime(url, mime);
  return `${nanoid8()}${ext}`;
}

/** Generate an alt-tag-derived safe filename (for fallback / debugging). */
export function originalImageFilename(url: string): string {
  try {
    const p = parse(new URL(url).pathname);
    return p.base || 'image';
  } catch {
    return 'image';
  }
}

/** Skip inline URLs (data:, blob:). */
export function isSkippableImageUrl(url: string): boolean {
  return (
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('javascript:') ||
    url === '' ||
    url === 'about:blank'
  );
}

/**
 * Download a single URL with redirects and size cap.
 * Returns the body as a Buffer plus the final content-type.
 */
async function fetchWithRedirects(
  url: string,
  options: { timeoutMs: number; maxBytes: number; headers?: Record<string, string> },
): Promise<{ body: Buffer; contentType: string; finalUrl: string }> {
  let currentUrl = url;
  let redirectCount = 0;

  while (true) {
    const res = await undiciRequest(currentUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; CloneV3/0.0.0; +https://github.com/Adilinu94/site-clone-to-v3)',
        'Accept': 'image/*,*/*;q=0.8',
        ...options.headers,
      },
      maxRedirections: 0, // undici v6 removed support — we handle redirects manually above
      bodyTimeout: options.timeoutMs,
      headersTimeout: options.timeoutMs,
    });

    if (res.statusCode >= 300 && res.statusCode < 400) {
      const rawLoc = res.headers.location;
      const loc = Array.isArray(rawLoc) ? rawLoc[0] : rawLoc;
      if (!loc) throw new Error(`Redirect ${res.statusCode} without Location header`);
      redirectCount++;
      if (redirectCount > MAX_REDIRECTS) {
        throw new Error(`Too many redirects (>${MAX_REDIRECTS})`);
      }
      currentUrl = new URL(loc, currentUrl).toString();
      // consume + close body to free socket
      await res.body.text();
      continue;
    }

    if (res.statusCode >= 400) {
      await res.body.text();
      throw new Error(`HTTP ${res.statusCode} for ${currentUrl}`);
    }

    const rawCt = res.headers['content-type'];
    const contentType = String(Array.isArray(rawCt) ? rawCt[0] : rawCt ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
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
        throw new Error(`File exceeded ${options.maxBytes} bytes during transfer`);
      }
      chunks.push(buf);
    }
    return { body: Buffer.concat(chunks), contentType, finalUrl: currentUrl };
  }
}

/** Probe an image buffer with sharp to get dimensions. Returns undefined for non-image formats. */
export async function probeImageMetadata(
  body: Buffer,
  ext: string,
): Promise<{ width?: number; height?: number }> {
  if (ext === '.svg' || ext === '.svgz') return {};
  try {
    const meta = await sharp(body).metadata();
    return { width: meta.width, height: meta.height };
  } catch {
    return {};
  }
}

/**
 * Download all images in parallel and write to disk.
 * Returns a URL → manifest-entry map (only successful downloads).
 *
 * Failures are recorded in the returned `errors` array but do not throw.
 */
export async function downloadImages(
  images: ImageDownload[],
  options: DownloadImagesOptions,
): Promise<{
  manifest: Record<string, ImageManifestEntry>;
  errors: Array<{ url: string; reason: string }>;
}> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const limit = pLimit(concurrency);

  const targetDir = resolve(options.outputRoot, options.subdir);
  await mkdir(targetDir, { recursive: true });

  const manifest: Record<string, ImageManifestEntry> = {};
  const errors: Array<{ url: string; reason: string }> = [];

  const tasks = images.map((img) =>
    limit(async () => {
      const url = normalizeImageUrl(img.url);
      if (isSkippableImageUrl(url)) {
        errors.push({ url: img.url, reason: 'skippable_url' });
        return;
      }
      try {
        const { body, contentType, finalUrl } = await fetchWithRedirects(url, {
          timeoutMs: DEFAULT_TIMEOUT_MS,
          maxBytes: MAX_FILE_SIZE_BYTES,
          headers: options.headers,
        });

        const ext = extensionForUrlOrMime(finalUrl, contentType || undefined);
        const filename = options.filenameFor
          ? options.filenameFor(finalUrl, ext)
          : generateImageFilename(finalUrl, contentType || undefined);

        const meta = await probeImageMetadata(body, ext);

        const localAbsPath = join(targetDir, filename);
        await mkdir(dirname(localAbsPath), { recursive: true });
        await writeFile(localAbsPath, body);

        const entry: ImageManifestEntry = {
          local_path: join(options.subdir, filename).replace(/\\/g, '/'),
          mime: contentType || 'application/octet-stream',
          filesize: body.length,
          downloaded_at: new Date().toISOString(),
        };
        if (meta.width !== undefined) entry.width = meta.width;
        if (meta.height !== undefined) entry.height = meta.height;
        if (img.alt) entry.alt = img.alt;
        const orig = originalImageFilename(finalUrl);
        if (orig && orig !== 'image') entry.original_name = orig;

        manifest[img.url] = entry;
      } catch (e) {
        errors.push({
          url: img.url,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  await Promise.all(tasks);
  return { manifest, errors };
}

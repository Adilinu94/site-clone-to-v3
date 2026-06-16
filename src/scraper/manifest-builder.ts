/**
 * Asset-Manifest-Builder — Sprint 4E.
 *
 * Plan §4 Task 5:
 * Aggregates results from image-downloader, font-downloader,
 * svg-downloader, favicon-og-downloader into a single `manifest.json`
 * with this structure:
 *   {
 *     hostname, extracted_at,
 *     images: { url → entry },
 *     fonts:  { url → entry },
 *     svgs:   { url-or-key → entry },
 *     favicons: { url → entry },
 *     errors:  { kind → [{url, reason}] },
 *   }
 *
 * The manifest is the single source-of-truth that downstream phases
 * (Phase 5: V3 Design-System-Sync) consume to upload assets to WP.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  ImageManifestEntry,
  DownloadImagesOptions,
} from './image-downloader.js';
import type {
  FontManifestEntry,
  DownloadFontsOptions,
} from './font-downloader.js';
import type {
  SvgManifestEntry,
  DownloadSvgsOptions,
} from './svg-downloader.js';
import type {
  FaviconManifestEntry,
  DownloadFaviconsOptions,
} from './favicon-og-downloader.js';

/** Top-level manifest. */
export interface AssetManifest {
  hostname: string;
  url: string;
  extracted_at: string;
  /** Total counts (for quick overview). */
  counts: {
    images: number;
    fonts: number;
    svgs: number;
    favicons: number;
    errors: number;
  };
  images: Record<string, ImageManifestEntry>;
  fonts: Record<string, FontManifestEntry>;
  svgs: Record<string, SvgManifestEntry>;
  favicons: Record<string, FaviconManifestEntry>;
  errors: {
    images: Array<{ url: string; reason: string }>;
    fonts: Array<{ url: string; reason: string }>;
    svgs: Array<{ key: string; reason: string }>;
    favicons: Array<{ url: string; reason: string }>;
  };
}

export interface BuildManifestInput {
  hostname: string;
  url: string;
  images?: {
    manifest: Record<string, ImageManifestEntry>;
    errors: Array<{ url: string; reason: string }>;
  };
  fonts?: {
    manifest: Record<string, FontManifestEntry>;
    errors: Array<{ url: string; reason: string }>;
  };
  svgs?: {
    manifest: Record<string, SvgManifestEntry>;
    errors: Array<{ key: string; reason: string }>;
  };
  favicons?: {
    manifest: Record<string, FaviconManifestEntry>;
    errors: Array<{ url: string; reason: string }>;
  };
}

/** Build the manifest object (pure, no I/O). */
export function buildAssetManifest(input: BuildManifestInput): AssetManifest {
  const imgs = input.images ?? { manifest: {}, errors: [] };
  const fnts = input.fonts ?? { manifest: {}, errors: [] };
  const svgs = input.svgs ?? { manifest: {}, errors: [] };
  const favs = input.favicons ?? { manifest: {}, errors: [] };
  return {
    hostname: input.hostname,
    url: input.url,
    extracted_at: new Date().toISOString(),
    counts: {
      images: Object.keys(imgs.manifest).length,
      fonts: Object.keys(fnts.manifest).length,
      svgs: Object.keys(svgs.manifest).length,
      favicons: Object.keys(favs.manifest).length,
      errors:
        imgs.errors.length + fnts.errors.length + svgs.errors.length + favs.errors.length,
    },
    images: imgs.manifest,
    fonts: fnts.manifest,
    svgs: svgs.manifest,
    favicons: favs.manifest,
    errors: {
      images: imgs.errors,
      fonts: fnts.errors,
      svgs: svgs.errors,
      favicons: favs.errors,
    },
  };
}

/** Write manifest to <outputDir>/manifest.json. */
export async function writeManifest(
  manifest: AssetManifest,
  outputDir: string,
): Promise<string> {
  const abs = resolve(outputDir, 'manifest.json');
  await mkdir(outputDir, { recursive: true });
  await writeFile(abs, JSON.stringify(manifest, null, 2), 'utf-8');
  return abs;
}

/** Build and write in one step. Returns the absolute manifest path. */
export async function buildAndWriteManifest(
  input: BuildManifestInput,
  outputDir: string,
): Promise<{ manifest: AssetManifest; path: string }> {
  const manifest = buildAssetManifest(input);
  const path = await writeManifest(manifest, outputDir);
  return { manifest, path };
}

/** Pretty-print a summary line (for CLI). */
export function summarizeManifest(m: AssetManifest): string {
  const parts: string[] = [];
  parts.push(`[${m.hostname}] ${m.extracted_at}`);
  parts.push(`  images:   ${m.counts.images}`);
  parts.push(`  fonts:    ${m.counts.fonts}`);
  parts.push(`  svgs:     ${m.counts.svgs}`);
  parts.push(`  favicons: ${m.counts.favicons}`);
  if (m.counts.errors > 0) parts.push(`  errors:   ${m.counts.errors}`);
  return parts.join('\n');
}

/** Re-export the per-kind option types for callers. */
export type ImageOptions = DownloadImagesOptions;
export type FontOptions = DownloadFontsOptions;
export type SvgOptions = DownloadSvgsOptions;
export type FaviconOptions = DownloadFaviconsOptions;

/** Helper: convenience path constant. */
export const ASSETS_SUBDIRS = ['images', 'fonts', 'svgs', 'seo'] as const;
export type AssetsSubdir = (typeof ASSETS_SUBDIRS)[number];

/** Validate a subdir name (defense-in-depth). */
export function isValidSubdir(name: string): name is AssetsSubdir {
  return (ASSETS_SUBDIRS as readonly string[]).includes(name);
}

/** Compute the assets root for a given research directory. */
export function assetsRootFor(researchDir: string): string {
  return join(researchDir, 'assets');
}

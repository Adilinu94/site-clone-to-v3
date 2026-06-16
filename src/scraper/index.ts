/**
 * Public API for the Asset-Downloader module (Phase 4).
 */

export {
  downloadImages,
  generateImageFilename,
  originalImageFilename,
  normalizeImageUrl,
  extensionForUrlOrMime,
  isSkippableImageUrl,
  probeImageMetadata,
  type ImageDownload,
  type ImageManifestEntry,
  type DownloadImagesOptions,
} from './image-downloader.js';

export {
  downloadFonts,
  extractFontFilename,
  sanitizeFilename,
  isFontFileUrl,
  type FontManifestEntry,
  type DownloadFontsOptions,
  type DownloadFontsResult,
} from './font-downloader.js';

export {
  downloadSvgs,
  hashSvg,
  generateSvgFilename,
  looksLikeSvg,
  stripXmlDecl,
  type SvgSource,
  type SvgManifestEntry,
  type DownloadSvgsOptions,
  type DownloadSvgsResult,
} from './svg-downloader.js';

export {
  downloadFavicons,
  normalizeFaviconKind,
  type FaviconSource,
  type FaviconManifestEntry,
  type DownloadFaviconsOptions,
  type DownloadFaviconsResult,
} from './favicon-og-downloader.js';

export {
  buildAssetManifest,
  writeManifest,
  buildAndWriteManifest,
  summarizeManifest,
  assetsRootFor,
  isValidSubdir,
  ASSETS_SUBDIRS,
  type AssetManifest,
  type BuildManifestInput,
  type ImageOptions,
  type FontOptions,
  type SvgOptions,
  type FaviconOptions,
  type AssetsSubdir,
} from './manifest-builder.js';

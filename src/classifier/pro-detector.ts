/**
 * Pro-Detector — V2 Phase 5
 * Detects whether Elementor Pro is available on the target WordPress install.
 * Combines three independent signals for higher confidence:
 *   1. Script markers (Elementor Pro bundles /elementor-pro/assets/js/...)
 *   2. CSS / DOM class patterns (elementor-widget-pro-* prefix)
 *   3. Admin bar / meta markers (elementor-pro-version global, generator meta)
 *
 * Spec: BAUPLAN-V3-PIXEL-PERFEKT.md §9 (Pro-Detection)
 */

export type ProSignal =
  | 'script-marker'
  | 'css-class'
  | 'admin-bar'
  | 'generator-meta'
  | 'rest-endpoint'
  | 'custom-element';

/** A single detection signal with its raw evidence. */
export interface ProSignalRecord {
  signal: ProSignal;
  /** True if the signal indicates Pro is available, false if explicitly absent. */
  detected: boolean;
  /** Raw evidence (URL, className, metaValue, etc.). */
  evidence: string;
}

/** Input shape for detectElementorPro — kept dependency-free for unit testing. */
export interface ProDetectionInput {
  /** <script src> URLs present on the page. */
  scriptSrcs?: readonly string[];
  /** Inline <script> bodies (window globals are also searched). */
  scriptBodies?: readonly string[];
  /** DOM class names (across all elements). */
  classNames?: readonly string[];
  /** Window globals exposed on the page. */
  windowGlobals?: Readonly<Record<string, unknown>>;
  /** HTML <meta name="generator"> values. */
  generatorMeta?: readonly string[];
  /** Known Elementor REST endpoints reachable (true = 200, false = non-200). */
  restEndpoints?: Readonly<Record<string, boolean>>;
  /** Custom element tags (e.g. `eicon-...` widgets). */
  customElements?: readonly string[];
}

/** Aggregate result of pro-detection. */
export interface ProDetectionResult {
  /** True if any signal indicates Pro is available. */
  hasPro: boolean;
  /** Confidence 0..1 based on signal count + weight. */
  confidence: number;
  /** Raw signals evaluated. */
  signals: ProSignalRecord[];
}

/** Weights per signal (script + generator + REST endpoint are strongest). */
const SIGNAL_WEIGHTS: Readonly<Record<ProSignal, number>> = {
  'script-marker': 0.45,
  'css-class': 0.2,
  'admin-bar': 0.2,
  'generator-meta': 0.35,
  'rest-endpoint': 0.4,
  'custom-element': 0.15,
};

/** Check whether a script src URL points to an Elementor Pro asset. */
export function isProScriptSrc(src: string): boolean {
  if (!src) return false;
  return /elementor-pro(\/|\.min)?\.js/i.test(src) || /elementor-pro\/assets\//i.test(src);
}

/** Check whether an inline script body references a Pro-only marker. */
export function isProScriptBody(body: string): boolean {
  if (!body) return false;
  return (
    /elementorProVersion/i.test(body) ||
    /"pro":\s*true/i.test(body) ||
    /elementor_pro_version/i.test(body)
  );
}

/** Check whether a DOM class name belongs to a known Pro widget. */
export function isProClassName(className: string): boolean {
  if (!className) return false;
  return /(^|\s)(elementor-widget-pro-|elementor-pro-)/i.test(className);
}

/** Check whether a window global indicates Pro availability. */
export function isProWindowGlobal(globalName: string, value: unknown): boolean {
  if (/^elementorPro/i.test(globalName)) return true;
  if (globalName === 'ElementorProConfig' && value) return true;
  if (globalName === 'elementor_pro_version' && typeof value === 'string' && value.length > 0) return true;
  return false;
}

/** Check whether a meta generator tag contains Elementor Pro. */
export function isProGeneratorMeta(meta: string): boolean {
  if (!meta) return false;
  return /elementor\s+pro/i.test(meta);
}

/** Check whether a REST endpoint is a known Pro-only namespace. */
export function isProRestEndpoint(path: string): boolean {
  if (!path) return false;
  return /\/elementor-pro\/v1\//i.test(path);
}

/** Check whether a custom element tag belongs to a known Pro-only widget. */
export function isProCustomElement(tag: string): boolean {
  if (!tag) return false;
  return /^elementor-pro-/i.test(tag);
}

/** Evaluate all available signals and return an aggregate detection result. */
export function detectElementorPro(input: ProDetectionInput): ProDetectionResult {
  const signals: ProSignalRecord[] = [];

  for (const src of input.scriptSrcs ?? []) {
    if (isProScriptSrc(src)) {
      signals.push({ signal: 'script-marker', detected: true, evidence: src });
    }
  }
  for (const body of input.scriptBodies ?? []) {
    if (isProScriptBody(body)) {
      signals.push({ signal: 'admin-bar', detected: true, evidence: trimEvidence(body) });
    }
  }
  for (const cls of input.classNames ?? []) {
    if (isProClassName(cls)) {
      signals.push({ signal: 'css-class', detected: true, evidence: cls });
    }
  }
  for (const [name, value] of Object.entries(input.windowGlobals ?? {})) {
    if (isProWindowGlobal(name, value)) {
      signals.push({ signal: 'admin-bar', detected: true, evidence: name });
    }
  }
  for (const meta of input.generatorMeta ?? []) {
    if (isProGeneratorMeta(meta)) {
      signals.push({ signal: 'generator-meta', detected: true, evidence: meta });
    }
  }
  for (const [path, ok] of Object.entries(input.restEndpoints ?? {})) {
    if (ok && isProRestEndpoint(path)) {
      signals.push({ signal: 'rest-endpoint', detected: true, evidence: path });
    } else if (!ok && isProRestEndpoint(path)) {
      signals.push({ signal: 'rest-endpoint', detected: false, evidence: path });
    }
  }
  for (const tag of input.customElements ?? []) {
    if (isProCustomElement(tag)) {
      signals.push({ signal: 'custom-element', detected: true, evidence: tag });
    }
  }

  const positiveSignals = signals.filter((s) => s.detected);
  const negativeSignals = signals.filter((s) => !s.detected);

  // If we have at least one explicit negative signal AND no positive, return hasPro=false.
  if (positiveSignals.length === 0 && negativeSignals.length > 0) {
    return { hasPro: false, confidence: 0.7, signals };
  }

  const totalWeight = positiveSignals.reduce(
    (acc, s) => acc + (SIGNAL_WEIGHTS[s.signal] ?? 0.1),
    0,
  );
  const confidence = Math.min(1, totalWeight);
  return {
    hasPro: positiveSignals.length > 0,
    confidence,
    signals,
  };
}

function trimEvidence(body: string): string {
  const trimmed = body.replace(/\s+/g, ' ').trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}
/**
 * recon/recon-runner.ts
 *
 * Bridges the State-Capture modules (mutation-observer, animation-events,
 * state-capture) to Playwright's `page.evaluate()` interface.
 *
 * The browser-side script is built via buildReconScript() and emits a
 * JSON-serialized ReconResult that parseReconResult() consumes.
 */

import type {
  ReconOptions,
  ReconResult,
} from './types.js';

export interface PageLike {
  evaluate<R, Arg>(
    pageFunction: (arg: Arg) => R | Promise<R>,
    arg: Arg,
  ): Promise<R>;
}

function escapeForScript(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Build a self-contained browser-side script that, when evaluated,
 * installs all recon listeners and returns a JSON-stringified ReconResult.
 */
export function buildReconScript(options: ReconOptions): string {
  const target = escapeForScript(options.targetSelector ?? 'body');
  const maxEvents = options.maxEvents ?? 500;
  const watchedAttrs = JSON.stringify(options.watchedAttributes ?? []);
  const windowMs = options.windowMs ?? 5000;

  return `(function(){
    var w = window;
    var events = [];
    var maxEvents = ${maxEvents};
    var snapshotStart = w.performance ? w.performance.now() : Date.now();

    function push(ev){
      events.push(ev);
      if (events.length > maxEvents) {
        events.splice(0, events.length - maxEvents);
      }
    }

    function captureMutation(record){
      var t = record.target;
      var sel = (t && t.tagName ? t.tagName.toLowerCase() : 'unknown') +
        (t && t.id ? '#' + t.id : '') +
        (t && t.className && typeof t.className === 'string' ? '.' + t.className.split(' ')[0] : '');
      push({
        type: 'mutation',
        selector: sel,
        mutationType: record.type,
        attributeName: record.attributeName || undefined,
        oldValue: record.oldValue,
        addedNodeCount: (record.addedNodes || []).length,
        removedNodeCount: (record.removedNodes || []).length,
        timestamp: (w.performance ? w.performance.now() : Date.now()) - snapshotStart,
      });
    }

    function captureAnim(ev){
      var t = ev.target;
      var sel = (t && t.tagName ? t.tagName.toLowerCase() : 'unknown') +
        (t && t.id ? '#' + t.id : '');
      push({
        type: 'animation',
        selector: sel,
        animationType: ev.type,
        animationName: ev.animationName || '',
        propertyName: ev.propertyName,
        elapsedTime: ev.elapsedTime || 0,
        timestamp: (w.performance ? w.performance.now() : Date.now()) - snapshotStart,
      });
    }

    var root = document.querySelector("${target}") || document.body;

    var obsConfig = {
      attributes: true,
      childList: true,
      subtree: true,
      attributeOldValue: true,
    };
    var watched = ${watchedAttrs};
    if (watched.length > 0) obsConfig.attributeFilter = watched;

    var mo = new MutationObserver(captureMutation);
    mo.observe(root, obsConfig);

    ['animationstart','animationend','animationiteration','transitionrun','transitionend','transitioncancel']
      .forEach(function(t){ root.addEventListener(t, captureAnim); });

    return new Promise(function(resolve){
      setTimeout(function(){
        mo.disconnect();
        var result = {
          events: events,
          durationMs: (w.performance ? w.performance.now() : Date.now()) - snapshotStart,
          error: null,
        };
        resolve(JSON.stringify(result));
      }, ${windowMs});
    });
  })()`;
}

/**
 * Parse a JSON-stringified ReconResult emitted by buildReconScript().
 * Returns a safe empty result on parse failure.
 */
export function parseReconResult(json: string): ReconResult {
  try {
    const parsed = JSON.parse(json) as Partial<ReconResult>;
    return {
      events: Array.isArray(parsed.events) ? parsed.events : [],
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
      baselines: Array.isArray(parsed.baselines) ? parsed.baselines : [],
      durationMs: typeof parsed.durationMs === 'number' ? parsed.durationMs : 0,
      error: parsed.error ? String(parsed.error) : null,
    };
  } catch (err) {
    return {
      events: [],
      snapshots: [],
      baselines: [],
      durationMs: 0,
      error: `parseReconResult: ${(err as Error).message}`,
    };
  }
}

/**
 * Install the recon listener on a Playwright page (or mock).
 * - The mock-page variant receives the script as a string argument and
 *   evaluates it via `eval`.
 * - On evaluate() failure, returns a result with `error` populated.
 */
export async function installReconListener(
  page: PageLike,
  options: ReconOptions,
): Promise<ReconResult> {
  const script = buildReconScript(options);
  try {
    const json = await page.evaluate<string, string>(
      (arg: string) => {
        // eslint-disable-next-line no-eval
        return eval(arg) as unknown as string;
      },
      script,
    );
    return parseReconResult(typeof json === 'string' ? json : JSON.stringify(json));
  } catch (err) {
    return {
      events: [],
      snapshots: [],
      baselines: [],
      durationMs: 0,
      error: `installReconListener: ${(err as Error).message}`,
    };
  }
}
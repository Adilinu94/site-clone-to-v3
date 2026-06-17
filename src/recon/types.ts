/**
 * recon/types.ts — Type definitions for the State-Capture pipeline
 * (Phase 3 in UMBAUPLAN-V3-PIXEL-PERFEKT.md §6).
 *
 * Replaces the V1 polling-based snapshot with event-driven captures
 * (MutationObserver + Web-Animation-API + CSS-Transition events).
 */

export type CaptureTrigger =
  | 'attribute'
  | 'attribute-batch'
  | 'child-list'
  | 'animation-start'
  | 'animation-end'
  | 'transition-run'
  | 'transition-end'
  | 'time-based';

export type ReconEvent =
  | {
      type: 'mutation';
      selector: string;
      mutationType: 'attributes' | 'childList' | 'characterData';
      attributeName?: string;
      oldValue?: string;
      addedNodeCount: number;
      removedNodeCount: number;
      timestamp: number;
    }
  | {
      type: 'animation';
      selector: string;
      animationType:
        | 'animationstart'
        | 'animationend'
        | 'animationiteration'
        | 'transitionrun'
        | 'transitionend'
        | 'transitioncancel';
      animationName: string;
      propertyName?: string;
      elapsedTime: number;
      timestamp: number;
    };

export interface StateSnapshot {
  selector: string;
  trigger: CaptureTrigger;
  timestamp: number;
  /** Attributes BEFORE the event (when known) */
  attributesBefore?: Record<string, string>;
  /** Attributes AFTER the event */
  attributesAfter?: Record<string, string>;
  /** Computed-style diff (only entries that changed) */
  propertyDiff?: Record<string, { before: string; after: string }>;
  /** Animation name when trigger is animation-* */
  animationName?: string;
  /** Animation duration when trigger is animation-end (ms) */
  durationMs?: number;
  /** Number of nodes added (child-list trigger only) */
  addedNodeCount?: number;
  /** Number of nodes removed (child-list trigger only) */
  removedNodeCount?: number;
}

export interface StyleBaseline {
  selector: string;
  styles: Record<string, string>;
  collectedAt: number;
}

export interface ReconResult {
  events: ReconEvent[];
  snapshots: StateSnapshot[];
  baselines: StyleBaseline[];
  /** Wall-clock duration of the capture window */
  durationMs: number;
  /** Non-null if capture failed */
  error: string | null;
}

export interface ReconOptions {
  /** CSS selector for the root element to observe (default: body) */
  targetSelector?: string;
  /** Maximum number of events captured before FIFO-trim (default: 500) */
  maxEvents?: number;
  /** Attribute names to watch (default: all). Empty array = all. */
  watchedAttributes?: string[];
  /** Capture window duration in ms (default: 5000) */
  windowMs?: number;
  /** Polling-check interval as fallback (default: 1000) */
  fallbackPollMs?: number;
  /** Viewports to capture (default: ['desktop']) */
  viewports?: Array<'desktop' | 'tablet' | 'mobile'>;
}
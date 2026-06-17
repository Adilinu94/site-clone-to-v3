/**
 * recon/index.ts — Barrel export for the State-Capture pipeline.
 */

export type {
  ReconEvent,
  StateSnapshot,
  StyleBaseline,
  ReconResult,
  ReconOptions,
  CaptureTrigger,
} from './types.js';

export type {
  MockElement,
  MockEvent,
  MutationRecord,
  MockWindow,
} from './mock-types.js';

export {
  installMutationObserver,
  collectObservedMutations,
  type MutationObserverConfig,
  type MutationObserverHandle,
} from './mutation-observer.js';

export {
  installAnimationListener,
  collectAnimationEvents,
  type AnimationListenerConfig,
  type CapturedAnimationEvent,
  type AnimationEventType,
} from './animation-events.js';

export {
  buildStateSnapshots,
  collectBaselineStyles,
  type BuildSnapshotInput,
} from './state-capture.js';

export {
  buildReconScript,
  parseReconResult,
  installReconListener,
  type PageLike,
} from './recon-runner.js';
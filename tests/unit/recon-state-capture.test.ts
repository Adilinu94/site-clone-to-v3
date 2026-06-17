import { describe, it, expect, beforeEach } from 'vitest';
import {
  collectObservedMutations,
  installMutationObserver,
  collectAnimationEvents,
  installAnimationListener,
  type MockWindow,
} from '../../src/recon/index.js';
import { buildStateSnapshots, collectBaselineStyles } from '../../src/recon/index.js';
import { createMockWindow } from '../helpers/mock-window.js';

describe('recon/state-capture', () => {
  let mockWindow: MockWindow;

  beforeEach(() => {
    mockWindow = createMockWindow();
  });

  it('builds empty snapshot when nothing changed', () => {
    const snapshots = buildStateSnapshots({
      window: mockWindow,
      mutations: [],
      animationEvents: [],
      baselineStyles: collectBaselineStyles(mockWindow, ['.fade-in']),
    });
    expect(snapshots).toHaveLength(0);
  });

  it('creates a snapshot when an attribute changes', () => {
    installMutationObserver(mockWindow, {
      targetSelector: '.fade-in',
      watchedAttributes: ['class'],
    });
    const el = mockWindow.document.querySelector('.fade-in')!;
    el.setAttribute('class', 'fade-in visible');

    const mutations = collectObservedMutations(mockWindow);
    const snapshots = buildStateSnapshots({
      window: mockWindow,
      mutations,
      animationEvents: [],
      baselineStyles: collectBaselineStyles(mockWindow, ['.fade-in']),
    });

    expect(snapshots.length).toBeGreaterThan(0);
    const snap = snapshots[0]!;
    expect(snap.selector).toBe('.fade-in');
    expect(snap.trigger).toBe('attribute');
    expect(snap.attributesBefore?.['class']).toBe('fade-in');
    expect(snap.attributesAfter?.['class']).toBe('fade-in visible');
  });

  it('captures animation-driven state transitions', () => {
    let time = 1000;
    mockWindow.performance = { now: () => time };
    installAnimationListener(mockWindow, { targetSelector: '.hero' });
    const el = mockWindow.document.querySelector('.hero')!;
    el.dispatchEvent({ type: 'animationstart', animationName: 'fadeIn', elapsedTime: 0 });
    time = 2200;
    el.dispatchEvent({ type: 'animationend', animationName: 'fadeIn', elapsedTime: 1.2 });

    const events = collectAnimationEvents(mockWindow);
    const snapshots = buildStateSnapshots({
      window: mockWindow,
      mutations: [],
      animationEvents: events,
      baselineStyles: collectBaselineStyles(mockWindow, ['.hero']),
    });

    const startSnap = snapshots.find((s) => s.trigger === 'animation-start');
    const endSnap = snapshots.find((s) => s.trigger === 'animation-end');
    expect(startSnap).toBeTruthy();
    expect(startSnap?.animationName).toBe('fadeIn');
    expect(endSnap?.durationMs).toBe(1200);
  });

  it('computes property diff from baseline styles', () => {
    // Capture baseline BEFORE the mutation
    const baseline = collectBaselineStyles(mockWindow, ['.box']);
    expect(baseline[0]?.styles['opacity']).toBe('1');

    installMutationObserver(mockWindow, { targetSelector: '.box' });
    const el = mockWindow.document.querySelector('.box')!;
    el._computedStyles['opacity'] = '0';
    el.setAttribute('class', 'active');

    const mutations = collectObservedMutations(mockWindow);
    const snapshots = buildStateSnapshots({
      window: mockWindow,
      mutations,
      animationEvents: [],
      baselineStyles: baseline,
    });

    const snap = snapshots[0]!;
    expect(snap.propertyDiff?.['opacity']).toEqual({
      before: '1',
      after: '0',
    });
  });

  it('groups multiple consecutive mutations into one snapshot', () => {
    installMutationObserver(mockWindow, { targetSelector: '.grp' });
    const el = mockWindow.document.querySelector('.grp')!;
    el.setAttribute('class', 'a');
    el.setAttribute('data-x', '1');
    el.setAttribute('data-y', '2');

    const mutations = collectObservedMutations(mockWindow);
    const snapshots = buildStateSnapshots({
      window: mockWindow,
      mutations,
      animationEvents: [],
      baselineStyles: collectBaselineStyles(mockWindow, ['.grp']),
    });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.trigger).toBe('attribute-batch');
  });

  it('returns baseline styles snapshot for all requested selectors', () => {
    const baseline = collectBaselineStyles(mockWindow, ['.fade-in', '.hero', '#section']);
    expect(baseline).toHaveLength(3);
    expect(baseline[0]?.styles['opacity']).toBeDefined();
  });
});
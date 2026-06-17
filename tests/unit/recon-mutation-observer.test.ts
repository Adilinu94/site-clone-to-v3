import { describe, it, expect, beforeEach } from 'vitest';
import {
  installMutationObserver,
  collectObservedMutations,
  type MockWindow,
} from '../../src/recon/index.js';
import { createMockWindow } from '../helpers/mock-window.js';

describe('recon/mutation-observer', () => {
  let mockWindow: MockWindow;

  beforeEach(() => {
    mockWindow = createMockWindow();
  });

  it('installs and tracks attribute mutations', () => {
    installMutationObserver(mockWindow, { targetSelector: 'body' });
    const target = mockWindow.document.querySelector('body')!;

    target.setAttribute('class', 'hero-active');
    target.setAttribute('data-state', 'visible');

    const mutations = collectObservedMutations(mockWindow);
    expect(mutations).toHaveLength(2);
    expect(mutations[0]?.type).toBe('attributes');
    expect(mutations[0]?.attributeName).toBe('class');
    expect(mutations[1]?.attributeName).toBe('data-state');
  });

  it('tracks childList mutations (added/removed nodes)', () => {
    installMutationObserver(mockWindow, { targetSelector: 'body' });
    const target = mockWindow.document.querySelector('body')!;

    const newDiv = mockWindow.document.createElement('div');
    newDiv.id = 'dyn';
    target.appendChild(newDiv);

    const mutations = collectObservedMutations(mockWindow);
    expect(mutations).toHaveLength(1);
    expect(mutations[0]?.type).toBe('childList');
    expect(mutations[0]?.addedNodes?.[0]?.id).toBe('dyn');
  });

  it('filters mutations by watched-attributes list', () => {
    installMutationObserver(mockWindow, {
      targetSelector: 'body',
      watchedAttributes: ['class'],
    });
    const target = mockWindow.document.querySelector('body')!;

    target.setAttribute('class', 'x');
    target.setAttribute('data-foo', 'y');
    target.setAttribute('id', 'z');

    const mutations = collectObservedMutations(mockWindow);
    expect(mutations).toHaveLength(1);
    expect(mutations[0]?.attributeName).toBe('class');
  });

  it('respects observer-config options', () => {
    const obs = installMutationObserver(mockWindow, {
      targetSelector: 'body',
      attributes: false,
      childList: true,
      subtree: true,
    });

    expect(obs.config.attributes).toBe(false);
    expect(obs.config.childList).toBe(true);
    expect(obs.config.subtree).toBe(true);

    const target = mockWindow.document.querySelector('body')!;
    target.appendChild(mockWindow.document.createElement('span'));
    const mutations = collectObservedMutations(mockWindow);
    expect(mutations).toHaveLength(1);
    expect(mutations[0]?.type).toBe('childList');
  });

  it('captures oldValue when configured', () => {
    installMutationObserver(mockWindow, {
      targetSelector: 'body',
      watchedAttributes: ['class'],
      captureOldValue: true,
    });
    const target = mockWindow.document.querySelector('body')!;
    target.setAttribute('class', 'new');
    const mutations = collectObservedMutations(mockWindow);
    expect(mutations[0]?.oldValue).toBe('hero');
  });

  it('multiple observers can co-exist on the same window', () => {
    const a = installMutationObserver(mockWindow, { targetSelector: 'body', id: 'A' });
    const b = installMutationObserver(mockWindow, {
      targetSelector: 'body',
      id: 'B',
    });
    expect(a.id).not.toBe(b.id);
    mockWindow.document.querySelector('body')!.setAttribute('class', 'x');
    const mutations = collectObservedMutations(mockWindow);
    // Both observers receive the same single mutation; the registry holds 2 records
    expect(mutations).toHaveLength(2);
    expect(mutations[0]?.type).toBe('attributes');
    expect(mutations[1]?.type).toBe('attributes');
  });
});
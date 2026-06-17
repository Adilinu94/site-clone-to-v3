/**
 * Minimal mock window + DOM for recon tests.
 *
 * Provides:
 *   - window.MutationObserver constructor that queues records
 *   - Element.setAttribute / appendChild that fires mutation events
 *   - Element.dispatchEvent with type + payload
 *   - Element.getComputedStyle returning a small map
 *   - Element.getAnimations() returning stub array (overridable)
 */

export interface MockElement {
  tagName: string;
  id: string;
  className: string;
  children: MockElement[];
  attributes: Record<string, string>;
  _computedStyles: Record<string, string>;
  _getAnimationsResult?: Array<{ animationName: string; playState: string; currentTime: number }>;
  parentNode?: MockElement;
  querySelector(sel: string): MockElement | null;
  appendChild(child: MockElement): MockElement;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  dispatchEvent(event: { type: string; [key: string]: unknown }): void;
  addEventListener(type: string, listener: (event: MockEvent) => void): void;
  getComputedStyle(): Record<string, string>;
  getAnimations(): Array<{ animationName: string; playState: string; currentTime: number }>;
  fireMutation(record: Omit<MutationRecord, 'target'>): void;
}

export interface MockEvent {
  type: string;
  target: MockElement;
  [key: string]: unknown;
}

export interface MutationRecord {
  type: 'attributes' | 'childList' | 'characterData';
  target: MockElement;
  attributeName?: string;
  oldValue?: string;
  addedNodes?: MockElement[];
  removedNodes?: MockElement[];
}

interface ObserverEntry {
  callback: (records: MutationRecord[]) => void;
  config: MutationObserverInit;
}

export interface MockWindow {
  document: {
    body: MockElement;
    querySelector(sel: string): MockElement | null;
    createElement(tag: string): MockElement;
  };
  MutationObserver: new (
    callback: (records: MutationRecord[]) => void,
  ) => { observe(target: MockElement, config: MutationObserverInit): void; disconnect(): void };
  performance: { now(): number };
  __mutationRegistry: Map<string, MutationRecord[]>;
  __animationRegistry: Map<string, Array<Record<string, unknown>>>;
  __allElements: MockElement[];
}

const DEFAULT_STYLES: Record<string, string> = {
  opacity: '1',
  transform: 'none',
  color: 'rgb(0, 0, 0)',
  'background-color': 'rgb(255, 255, 255)',
  display: 'block',
  position: 'static',
  visibility: 'visible',
};

function matchesConfig(
  record: Omit<MutationRecord, 'target'>,
  config: MutationObserverInit,
): boolean {
  if (record.type === 'attributes' && config.attributes === false) return false;
  if (record.type === 'childList' && config.childList === false) return false;
  if (
    config.attributeFilter &&
    record.attributeName &&
    !config.attributeFilter.includes(record.attributeName)
  ) {
    return false;
  }
  return true;
}

function createMockElement(
  tag: string,
  id: string,
  className: string,
  win: MockWindow,
): MockElement {
  const listeners = new Map<string, Array<(event: MockEvent) => void>>();

  const element: MockElement = {
    tagName: tag.toUpperCase(),
    id,
    className,
    children: [],
    attributes: id ? { id } : className ? { class: className } : {},
    _computedStyles: { ...DEFAULT_STYLES },
    parentNode: undefined,
    querySelector(sel: string) {
      return findBySelector(win.__allElements, sel);
    },
    appendChild(child: MockElement) {
      child.parentNode = element;
      this.children.push(child);
      win.__allElements.push(child);
      this.fireMutation({
        type: 'childList',
        addedNodes: [child],
        removedNodes: [],
      });
      return child;
    },
    setAttribute(name: string, value: string) {
      const oldValue = this.attributes[name];
      this.attributes[name] = value;
      this.fireMutation({
        type: 'attributes',
        attributeName: name,
        oldValue,
      });
    },
    getAttribute(name: string) {
      return this.attributes[name] ?? null;
    },
    dispatchEvent(event) {
      const eventListeners = listeners.get(event.type) ?? [];
      for (const listener of eventListeners) {
        listener({ ...event, target: this } as MockEvent);
      }
    },
    addEventListener(type: string, listener: (event: MockEvent) => void) {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    getComputedStyle() {
      return { ...this._computedStyles };
    },
    getAnimations() {
      return this._getAnimationsResult ?? [];
    },
    fireMutation(record: Omit<MutationRecord, 'target'>) {
      const wObs = (win as unknown as { __observers?: ObserverEntry[] }).__observers ?? [];
      const fullRecord = { ...record, target: element } as MutationRecord;
      for (const observer of wObs) {
        if (matchesConfig(record, observer.config)) {
          // Route the record through the observer's callback (same as
          // real DOM MutationObserver behavior). The callback is
          // responsible for storing the record (see installMutationObserver).
          observer.callback([fullRecord]);
        }
      }
    },
  };
  return element;
}

function findBySelector(elements: MockElement[], sel: string): MockElement | null {
  if (sel.startsWith('#')) {
    const id = sel.slice(1);
    return elements.find((e) => e.id === id) ?? null;
  }
  if (sel.startsWith('.')) {
    const cls = sel.slice(1);
    return elements.find((e) => e.className.split(/\s+/).includes(cls)) ?? null;
  }
  return elements.find((e) => e.tagName.toLowerCase() === sel.toLowerCase()) ?? null;
}

export function createMockWindow(): MockWindow {
  const mutationRegistry = new Map<string, MutationRecord[]>();
  const animationRegistry = new Map<string, Array<Record<string, unknown>>>();
  const allElements: MockElement[] = [];

  const win: MockWindow = {
    document: {
      body: undefined as unknown as MockElement,
      querySelector: (sel: string) => findBySelector(allElements, sel),
      createElement: (tag: string) => createMockElement(tag, '', '', win),
    },
    MutationObserver: undefined as unknown as MockWindow['MutationObserver'],
    performance: { now: () => Date.now() },
    __mutationRegistry: mutationRegistry,
    __animationRegistry: animationRegistry,
    __allElements: allElements,
  };

  const body = createMockElement('body', '', 'hero', win);
  const section = createMockElement('section', 'section', '', win);
  const fadeIn = createMockElement('div', '', 'fade-in', win);
  const hero = createMockElement('div', '', 'hero', win);
  const slide = createMockElement('div', '', 'slide', win);
  const hoverTarget = createMockElement('div', '', 'hover-target', win);
  const waapiTarget = createMockElement('div', '', 'waapi-target', win);
  const box = createMockElement('div', '', 'box', win);
  const grp = createMockElement('div', '', 'grp', win);
  const watched = createMockElement('div', '', 'watched', win);
  const unwatched = createMockElement('div', '', 'unwatched', win);
  const x = createMockElement('div', '', 'x', win);

  allElements.push(body, section, fadeIn, hero, slide, hoverTarget, waapiTarget, box, grp, watched, unwatched, x);
  body.children.push(section, fadeIn, hero, slide, hoverTarget, waapiTarget, box, grp, watched, unwatched, x);
  for (const child of body.children) child.parentNode = body;

  // Make box's baseline styles different from defaults to test propertyDiff
  box._computedStyles['opacity'] = '1';

  win.document.body = body;

  // Clear any mutations that fired during initial DOM construction
  mutationRegistry.set('__pending__', []);

  // MutationObserver constructor
  win.MutationObserver = function (
    callback: (records: MutationRecord[]) => void,
  ) {
    const observers = (win as unknown as { __observers?: ObserverEntry[] }).__observers ?? [];
    const entry: ObserverEntry = {
      callback,
      config: { attributes: true, childList: true, subtree: true },
    };
    observers.push(entry);
    (win as unknown as { __observers: ObserverEntry[] }).__observers = observers;
    return {
      observe(_target: MockElement, config: MutationObserverInit) {
        entry.config = { ...entry.config, ...config };
      },
      disconnect() {
        const list = (win as unknown as { __observers: ObserverEntry[] }).__observers ?? [];
        const idx = list.indexOf(entry);
        if (idx >= 0) list.splice(idx, 1);
      },
    };
  } as unknown as MockWindow['MutationObserver'];

  return win;
}
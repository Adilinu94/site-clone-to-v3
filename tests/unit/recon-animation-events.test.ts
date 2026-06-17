import { describe, it, expect, beforeEach } from 'vitest';
import {
  installAnimationListener,
  collectAnimationEvents,
  type MockWindow,
} from '../../src/recon/index.js';
import { createMockWindow } from '../helpers/mock-window.js';

describe('recon/animation-events', () => {
  let mockWindow: MockWindow;

  beforeEach(() => {
    mockWindow = createMockWindow();
  });

  it('captures animationstart events with timing', () => {
    installAnimationListener(mockWindow, { targetSelector: '.fade-in' });
    const el = mockWindow.document.querySelector('.fade-in')!;
    el.dispatchEvent({ type: 'animationstart', animationName: 'fadeIn', elapsedTime: 0 });

    const events = collectAnimationEvents(mockWindow);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('animationstart');
    expect(events[0]?.animationName).toBe('fadeIn');
    expect(typeof events[0]?.timestamp).toBe('number');
  });

  it('captures animationend with final elapsedTime', () => {
    installAnimationListener(mockWindow, { targetSelector: '.slide' });
    const el = mockWindow.document.querySelector('.slide')!;
    el.dispatchEvent({ type: 'animationstart', animationName: 'slideIn', elapsedTime: 0 });
    el.dispatchEvent({ type: 'animationend', animationName: 'slideIn', elapsedTime: 1.2 });

    const events = collectAnimationEvents(mockWindow);
    expect(events.find((e) => e.type === 'animationend')?.elapsedTime).toBe(1.2);
  });

  it('captures transitionrun / transitionend for CSS-transitions', () => {
    installAnimationListener(mockWindow, { targetSelector: '.hover-target' });
    const el = mockWindow.document.querySelector('.hover-target')!;
    el.dispatchEvent({
      type: 'transitionrun',
      propertyName: 'opacity',
      elapsedTime: 0,
    });
    el.dispatchEvent({
      type: 'transitionend',
      propertyName: 'opacity',
      elapsedTime: 0.4,
    });

    const events = collectAnimationEvents(mockWindow);
    expect(events.find((e) => e.type === 'transitionrun')).toBeTruthy();
    expect(events.find((e) => e.type === 'transitionend')?.propertyName).toBe('opacity');
  });

  it('caps events at maxEvents (FIFO trim)', () => {
    installAnimationListener(mockWindow, { targetSelector: '.x', maxEvents: 3 });
    const el = mockWindow.document.querySelector('.x')!;
    for (let i = 0; i < 10; i++) {
      el.dispatchEvent({ type: 'animationstart', animationName: `a${i}`, elapsedTime: 0 });
    }
    const events = collectAnimationEvents(mockWindow);
    expect(events).toHaveLength(3);
    expect(events[0]?.animationName).toBe('a7');
    expect(events[2]?.animationName).toBe('a9');
  });

  it('ignores events from non-watched targets', () => {
    installAnimationListener(mockWindow, { targetSelector: '.watched' });
    const unwatched = mockWindow.document.querySelector('.unwatched')!;
    unwatched.dispatchEvent({
      type: 'animationstart',
      animationName: 'x',
      elapsedTime: 0,
    });
    const events = collectAnimationEvents(mockWindow);
    expect(events).toHaveLength(0);
  });

  it('captures Web-Animation-API events via getAnimations()', () => {
    installAnimationListener(mockWindow, { targetSelector: '.waapi-target' });
    const el = mockWindow.document.querySelector('.waapi-target')!;
    el._getAnimationsResult = [
      { animationName: 'waapi1', playState: 'running', currentTime: 500 },
    ];
    el.dispatchEvent({ type: 'animationstart', animationName: 'waapi1', elapsedTime: 0 });
    const events = collectAnimationEvents(mockWindow);
    expect(events).toHaveLength(1);
    expect(events[0]?.animationName).toBe('waapi1');
  });
});
import { describe, expect, it } from 'vitest';
import { installBrowserZoomGuard } from './browserZoomGuard';

const dispatchWheel = (target: EventTarget, modifiers: KeyboardEventInit = {}) => {
  const event = new WheelEvent('wheel', { ...modifiers, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

const dispatchKeydown = (target: EventTarget, key: string, modifiers: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { ...modifiers, key, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

describe('installBrowserZoomGuard', () => {
  it('blocks Ctrl/Cmd + wheel zoom gestures', () => {
    const target = new EventTarget();
    const cleanup = installBrowserZoomGuard(target as Window);

    expect(dispatchWheel(target, { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(dispatchWheel(target, { metaKey: true }).defaultPrevented).toBe(true);

    cleanup();
  });

  it('blocks Ctrl/Cmd zoom shortcuts while preserving unrelated keys', () => {
    const target = new EventTarget();
    const cleanup = installBrowserZoomGuard(target as Window);

    for (const key of ['+', '=', '-', '_', '0']) {
      expect(dispatchKeydown(target, key, { ctrlKey: true }).defaultPrevented).toBe(true);
      expect(dispatchKeydown(target, key, { metaKey: true }).defaultPrevented).toBe(true);
    }

    expect(dispatchKeydown(target, 'a', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(dispatchKeydown(target, 'a', { metaKey: true }).defaultPrevented).toBe(false);
    expect(dispatchKeydown(target, '+').defaultPrevented).toBe(false);

    cleanup();
  });

  it('preserves normal wheel events', () => {
    const target = new EventTarget();
    const cleanup = installBrowserZoomGuard(target as Window);

    expect(dispatchWheel(target).defaultPrevented).toBe(false);

    cleanup();
  });

  it('removes all zoom guards during cleanup', () => {
    const target = new EventTarget();
    const cleanup = installBrowserZoomGuard(target as Window);

    cleanup();

    expect(dispatchWheel(target, { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(dispatchWheel(target, { metaKey: true }).defaultPrevented).toBe(false);
    expect(dispatchKeydown(target, '0', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(dispatchKeydown(target, '+', { metaKey: true }).defaultPrevented).toBe(false);
  });
});

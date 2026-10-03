import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProjectPickerRefresh } from './project-picker-refresh';

let sequence = 0;
const frames = new Map<number, FrameRequestCallback>();
const frame = () => {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(0));
};
beforeEach(() => {
  sequence = 0;
  frames.clear();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++sequence, callback);
    return sequence;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
});
afterEach(() => vi.restoreAllMocks());

describe('project picker background refresh', () => {
  it('waits until presentation has had a frame before refreshing', () => {
    const refresh = vi.fn();
    const scheduler = createProjectPickerRefresh(refresh);
    scheduler.schedule();
    expect(refresh).not.toHaveBeenCalled();
    frame();
    expect(refresh).not.toHaveBeenCalled();
    frame();
    expect(refresh).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    scheduler.cancel();
    expect(frames.size).toBe(0);
  });
  it.each([0, 1])('cancels a hidden or disposed picker after %s frames', (elapsed) => {
    const refresh = vi.fn();
    const scheduler = createProjectPickerRefresh(refresh);
    scheduler.schedule();
    for (let i = 0; i < elapsed; i++) frame();
    scheduler.cancel();
    frame();
    frame();
    expect(refresh).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });
  it('replaces pending work when the menu rapidly closes and reopens', () => {
    const refresh = vi.fn();
    const scheduler = createProjectPickerRefresh(refresh);
    scheduler.schedule();
    frame();
    scheduler.schedule();
    expect(frames.size).toBe(1);
    frame();
    expect(refresh).not.toHaveBeenCalled();
    frame();
    expect(refresh).toHaveBeenCalledOnce();
  });
});

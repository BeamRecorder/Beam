import { effectScope, ref } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useScreenshotLayerReorder } from './useScreenshotLayerReorder';
let frames: FrameRequestCallback[];
beforeEach(() => {
  frames = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
const pointer = (type: string, x: number, y: number) => {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    button: { value: 0 },
    clientX: { value: x },
    clientY: { value: y },
  });
  return event as PointerEvent;
};
const setup = () => {
  const list = document.createElement('div');
  list.innerHTML =
    '<div data-layer-id="e"></div><div data-composition-group="pair"><div data-group-drop="pair"></div><div data-layer-id="b"></div><div data-layer-id="a"></div></div><div data-layer-id="root"></div>';
  const rect = (node: Element, left: number, top: number, height: number) =>
    vi
      .spyOn(node, 'getBoundingClientRect')
      .mockReturnValue({ left, right: 260, top, bottom: top + height, height } as DOMRect);
  rect(list, 0, 0, 300);
  rect(list.querySelector('[data-layer-id="e"]')!, 0, 0, 44);
  rect(list.querySelector('[data-composition-group]')!, 0, 48, 134);
  rect(list.querySelector('[data-group-drop]')!, 0, 48, 36);
  rect(list.querySelector('[data-layer-id="b"]')!, 24, 88, 44);
  rect(list.querySelector('[data-layer-id="a"]')!, 24, 136, 44);
  rect(list.querySelector('[data-layer-id="root"]')!, 0, 184, 44);
  let captured = false;
  Object.assign(list, {
    setPointerCapture: vi.fn(() => {
      captured = true;
    }),
    hasPointerCapture: vi.fn(() => captured),
    releasePointerCapture: vi.fn(() => {
      captured = false;
    }),
  });
  const scope = effectScope(),
    canDrop = vi.fn(() => true),
    commit = vi.fn(),
    reorder = vi.fn();
  const state = scope.run(() =>
    useScreenshotLayerReorder(ref(list), () => ['e', 'b', 'a', 'root'], reorder, { canDrop, commit }),
  )!;
  const move = (x: number, y: number) => {
    window.dispatchEvent(pointer('pointermove', x, y));
    frames.at(-1)!(performance.now());
  };
  const end = (x: number, y: number) => window.dispatchEvent(pointer('pointerup', x, y));
  return { state, scope, canDrop, commit, reorder, move, end };
};
it('shows a group-header target or an exact insertion marker and commits one group move', () => {
  const f = setup();
  f.state.begin(pointer('pointerdown', 50, 20), 'e');
  f.move(50, 60);
  expect(f.state.dropGroupId.value).toBe('pair');
  f.move(60, 130);
  expect(f.state.dropGroupId.value).toBeNull();
  expect(f.state.dropTarget.value).toMatchObject({ anchorId: 'b', side: 'after', frontIndex: 1 });
  f.end(60, 130);
  expect(f.commit).toHaveBeenCalledExactlyOnceWith('e', 'pair', 1);
  expect(f.reorder).not.toHaveBeenCalled();
  expect(f.state.dropTarget.value).toBeNull();
  const click = new MouseEvent('click', { cancelable: true });
  expect(f.state.consumeClick(click, 'e')).toBe(true);
  expect(click.defaultPrevented).toBe(true);
  f.scope.stop();
});
it('detaches by dragging horizontally into the unindented strip, keeping the existing canvas geometry', () => {
  const f = setup();
  f.state.begin(pointer('pointerdown', 60, 100), 'b');
  f.move(10, 100);
  expect(f.state.dragging.value).toBe('b');
  expect(f.state.dropTarget.value?.groupId).toBeNull();
  f.end(10, 100);
  expect(f.commit).toHaveBeenCalledExactlyOnceWith('b', null, 1);
  f.scope.stop();
});
it('rechecks locks and outside drops on release and ignores returning to the same group slot', () => {
  const f = setup();
  f.state.begin(pointer('pointerdown', 60, 100), 'b');
  f.move(60, 140);
  f.end(60, 140);
  expect(f.commit).not.toHaveBeenCalled();
  f.state.begin(pointer('pointerdown', 50, 20), 'e');
  f.move(60, 130);
  f.canDrop.mockReturnValue(false);
  f.end(60, 130);
  expect(f.commit).not.toHaveBeenCalled();
  f.canDrop.mockReturnValue(true);
  f.state.begin(pointer('pointerdown', 50, 20), 'e');
  f.move(60, 130);
  f.end(300, 130);
  expect(f.commit).not.toHaveBeenCalled();
  f.scope.stop();
});
it('cancels group targets with Escape without leaving a marker or writing document history', () => {
  const f = setup();
  f.state.begin(pointer('pointerdown', 50, 20), 'e');
  f.move(60, 60);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
  expect(f.state.dropTarget.value).toBeNull();
  expect(f.state.dragging.value).toBeNull();
  expect(f.commit).not.toHaveBeenCalled();
  f.scope.stop();
});

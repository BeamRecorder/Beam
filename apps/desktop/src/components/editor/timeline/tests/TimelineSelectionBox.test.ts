import { h, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TimelineSelectionBox from '../TimelineSelectionBox.vue';
import type { TimelineSelectionIds } from '../composables/timeline-tracks-types';

type RectSpec = { left: number; top: number; width: number; height: number };
type NodeSpec = RectSpec & { kind: 'clip' | 'zoom'; id: string; className: string };
type PointerInit = Partial<
  Pick<PointerEvent, 'button' | 'pointerId' | 'clientX' | 'clientY' | 'shiftKey' | 'ctrlKey' | 'metaKey'>
>;

const rootRect: RectSpec = { left: 100, top: 200, width: 400, height: 200 };
const nodes: NodeSpec[] = [
  { kind: 'clip', id: 'clip-a', className: 'clip-a', left: 130, top: 220, width: 50, height: 30 },
  { kind: 'clip', id: 'clip-b', className: 'clip-b', left: 290, top: 170, width: 60, height: 35 },
  { kind: 'zoom', id: 'zoom-a', className: 'zoom-a', left: 220, top: 250, width: 40, height: 25 },
  { kind: 'clip', id: 'outside', className: 'outside', left: 470, top: 300, width: 40, height: 30 },
];

const toDomRect = ({ left, top, width, height }: RectSpec): DOMRect =>
  ({
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  }) as DOMRect;

const pointerEvent = (
  type: string,
  {
    button = 2,
    pointerId = 1,
    clientX = 0,
    clientY = 0,
    shiftKey = false,
    ctrlKey = false,
    metaKey = false,
  }: PointerInit = {},
) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: button },
    pointerId: { value: pointerId },
    clientX: { value: clientX },
    clientY: { value: clientY },
    shiftKey: { value: shiftKey },
    ctrlKey: { value: ctrlKey },
    metaKey: { value: metaKey },
  });
  return event as PointerEvent;
};

const contextMenuEvent = (button: number) => new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button });

let rafId = 0;
const pendingFrames = new Map<number, FrameRequestCallback>();
const mountedWrappers: VueWrapper[] = [];

beforeEach(() => {
  rafId = 0;
  pendingFrames.clear();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      const id = ++rafId;
      pendingFrames.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => {
      pendingFrames.delete(id);
    }),
  );
});

afterEach(() => {
  mountedWrappers.forEach((wrapper) => wrapper.unmount());
  mountedWrappers.length = 0;
  pendingFrames.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const flushFrame = () => {
  const callbacks = [...pendingFrames.values()];
  pendingFrames.clear();
  callbacks.forEach((callback) => callback(0));
};

const mountSelectionBox = (
  selection: TimelineSelectionIds = { clipIds: [], zoomIds: [] },
  targetSpecs: NodeSpec[] = nodes,
) => {
  const wrapper = mount(TimelineSelectionBox, {
    attachTo: document.body,
    props: { selection },
    slots: {
      default: () =>
        targetSpecs.map((target) =>
          h(
            'div',
            {
              class: target.className,
              ...(target.kind === 'clip'
                ? { 'data-timeline-clip-id': target.id }
                : { 'data-timeline-zoom-id': target.id }),
            },
            h('span', { class: `${target.className}-trim-handle` }, 'trim'),
          ),
        ),
    },
  });
  mountedWrappers.push(wrapper);
  const root = wrapper.element as HTMLElement;
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(toDomRect(rootRect));
  targetSpecs.forEach((target) => {
    vi.spyOn(wrapper.get(`.${target.className}`).element as HTMLElement, 'getBoundingClientRect').mockReturnValue(
      toDomRect(target),
    );
  });
  return { wrapper, root };
};

describe('TimelineSelectionBox', () => {
  it('selects mixed targets with reverse coordinates and emits only changed ids', async () => {
    const { wrapper } = mountSelectionBox();
    const trimChild = wrapper.get('.clip-a-trim-handle');
    const down = pointerEvent('pointerdown', { pointerId: 7, clientX: 360, clientY: 300 });
    trimChild.element.dispatchEvent(down);

    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 99, clientX: 110, clientY: 190 }));
    flushFrame();
    expect(wrapper.emitted('start')).toBeUndefined();
    expect(wrapper.emitted('select')).toBeUndefined();

    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, clientX: 110, clientY: 190 }));
    flushFrame();
    await nextTick();

    expect(wrapper.emitted('start')).toEqual([[]]);
    expect(wrapper.emitted('select')).toEqual([[{ clipIds: ['clip-a', 'clip-b'], zoomIds: ['zoom-a'] }]]);
    const box = wrapper.get<HTMLElement>('.timeline-selection-box');
    expect(box.element.style.transform).toBe('translate3d(10px, -10px, 0)');
    expect(box.element.style.width).toBe('250px');
    expect(box.element.style.height).toBe('110px');

    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, clientX: 120, clientY: 200 }));
    flushFrame();
    await nextTick();
    expect(wrapper.emitted('select')).toHaveLength(1);

    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 99, clientX: 120, clientY: 200 }));
    expect(wrapper.find('.timeline-selection-box').exists()).toBe(true);
    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 7, clientX: 120, clientY: 200 }));
    await nextTick();
    expect(wrapper.emitted('select')).toHaveLength(1);
    expect(wrapper.find('.timeline-selection-box').exists()).toBe(false);
  });

  it.each(['shiftKey', 'ctrlKey', 'metaKey'] as const)(
    'adds the hit targets to the initial selection for %s',
    (modifier) => {
      const initial = { clipIds: ['kept-clip'], zoomIds: ['kept-zoom'] };
      const { wrapper } = mountSelectionBox(initial);
      const down = pointerEvent('pointerdown', {
        pointerId: 2,
        clientX: 110,
        clientY: 210,
        [modifier]: true,
      });
      wrapper.get('.clip-a-trim-handle').element.dispatchEvent(down);
      window.dispatchEvent(pointerEvent('pointermove', { pointerId: 2, clientX: 280, clientY: 280 }));
      flushFrame();
      window.dispatchEvent(pointerEvent('pointerup', { pointerId: 2, clientX: 280, clientY: 280 }));

      expect(wrapper.emitted('select')).toEqual([
        [{ clipIds: ['kept-clip', 'clip-a'], zoomIds: ['kept-zoom', 'zoom-a'] }],
      ]);
      expect(initial).toEqual({ clipIds: ['kept-clip'], zoomIds: ['kept-zoom'] });
    },
  );

  it('emits an empty replacement when a drag misses every target', async () => {
    const initial = { clipIds: ['clip-a'], zoomIds: ['zoom-a'] };
    const { wrapper, root } = mountSelectionBox(initial);
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 3, clientX: 390, clientY: 380 }));
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 3, clientX: 350, clientY: 350 }));
    flushFrame();
    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 3, clientX: 350, clientY: 350 }));
    await nextTick();

    expect(wrapper.emitted('select')).toEqual([[{ clipIds: [], zoomIds: [] }]]);
    expect(wrapper.find('.timeline-selection-box').exists()).toBe(false);
  });

  it('ignores zero-sized timeline targets while collecting the selection set', async () => {
    const initial = { clipIds: ['stale-clip'], zoomIds: [] };
    const zeroSizedTarget: NodeSpec = {
      kind: 'clip',
      id: 'zero-sized',
      className: 'zero-sized',
      left: 130,
      top: 220,
      width: 0,
      height: 30,
    };
    const { wrapper, root } = mountSelectionBox(initial, [zeroSizedTarget]);
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 12, clientX: 120, clientY: 210 }));
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 12, clientX: 220, clientY: 310 }));
    flushFrame();
    await nextTick();

    expect(wrapper.emitted('select')).toEqual([[{ clipIds: [], zoomIds: [] }]]);
    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 12, clientX: 220, clientY: 310 }));
  });

  it('starts at exactly four pixels and restores the initial selection on pointercancel', async () => {
    const initial = { clipIds: ['kept-clip'], zoomIds: [] };
    const { wrapper, root } = mountSelectionBox(initial);
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 4, clientX: 150, clientY: 250 }));
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 4, clientX: 153, clientY: 250 }));
    flushFrame();
    expect(wrapper.emitted('start')).toBeUndefined();
    expect(wrapper.emitted('select')).toBeUndefined();
    expect(wrapper.find('.timeline-selection-box').exists()).toBe(false);

    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 4, clientX: 154, clientY: 250 }));
    flushFrame();
    await nextTick();
    expect(wrapper.emitted('start')).toEqual([[]]);
    expect(wrapper.get<HTMLElement>('.timeline-selection-box').element.style.width).toBe('4px');
    expect(wrapper.emitted('select')).toEqual([[{ clipIds: [], zoomIds: [] }]]);

    window.dispatchEvent(pointerEvent('pointercancel', { pointerId: 404 }));
    expect(wrapper.find('.timeline-selection-box').exists()).toBe(true);
    window.dispatchEvent(pointerEvent('pointercancel', { pointerId: 4 }));
    await nextTick();
    expect(wrapper.emitted('select')).toEqual([[{ clipIds: [], zoomIds: [] }], [initial]]);
    expect(wrapper.find('.timeline-selection-box').exists()).toBe(false);
  });

  it('cancels a dragged selection with Escape and prevents the browser default', async () => {
    const initial = { clipIds: ['kept-clip'], zoomIds: ['kept-zoom'] };
    const { wrapper, root } = mountSelectionBox(initial);
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 5, clientX: 150, clientY: 250 }));
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 5, clientX: 190, clientY: 290 }));
    flushFrame();
    await nextTick();
    expect(wrapper.find('.timeline-selection-box').exists()).toBe(true);

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    window.dispatchEvent(escape);
    await nextTick();
    expect(escape.defaultPrevented).toBe(true);
    expect(wrapper.emitted('select')).toHaveLength(2);
    expect(wrapper.emitted('select')?.at(-1)).toEqual([initial]);
    expect(wrapper.find('.timeline-selection-box').exists()).toBe(false);
  });

  it('scales pointer and target coordinates from the visual timeline width', async () => {
    const { wrapper, root } = mountSelectionBox();
    Object.defineProperty(root, 'offsetWidth', { configurable: true, value: 800 });
    const target = wrapper.get('.clip-a-trim-handle');
    target.element.dispatchEvent(pointerEvent('pointerdown', { pointerId: 6, clientX: 140, clientY: 240 }));
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 6, clientX: 190, clientY: 290 }));
    flushFrame();
    await nextTick();

    expect(wrapper.emitted('select')).toEqual([[{ clipIds: ['clip-a'], zoomIds: [] }]]);
    const box = wrapper.get<HTMLElement>('.timeline-selection-box');
    expect(box.element.style.transform).toBe('translate3d(80px, 80px, 0)');
    expect(box.element.style.width).toBe('100px');
    expect(box.element.style.height).toBe('100px');

    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 6, clientX: 190, clientY: 290 }));
  });

  it('captures right pointerdown on trim children while allowing left pointerdown through', () => {
    const { wrapper } = mountSelectionBox();
    const trimChild = wrapper.get('.clip-a-trim-handle').element;
    const childPointerDown = vi.fn();
    trimChild.addEventListener('pointerdown', childPointerDown);

    trimChild.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 8, clientX: 140, clientY: 230 }));
    expect(childPointerDown).toHaveBeenCalledOnce();
    expect(wrapper.emitted('start')).toBeUndefined();

    trimChild.dispatchEvent(pointerEvent('pointerdown', { button: 2, pointerId: 9, clientX: 140, clientY: 230 }));
    expect(childPointerDown).toHaveBeenCalledOnce();
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 9, clientX: 150, clientY: 240 }));
    flushFrame();
    expect(wrapper.emitted('start')).toEqual([[]]);
    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 9, clientX: 150, clientY: 240 }));
  });

  it('replays a right click while suppressing native gestures and allowing keyboard context menus', () => {
    const { wrapper } = mountSelectionBox();
    const target = wrapper.get('.clip-a-trim-handle').element;
    const contextMenus: MouseEvent[] = [];
    target.addEventListener('contextmenu', (event) => contextMenus.push(event as MouseEvent));

    const before = contextMenuEvent(2);
    target.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(false);
    expect(contextMenus).toHaveLength(1);

    target.dispatchEvent(pointerEvent('pointerdown', { pointerId: 10, clientX: 140, clientY: 230 }));
    const during = contextMenuEvent(2);
    target.dispatchEvent(during);
    expect(during.defaultPrevented).toBe(true);
    expect(contextMenus).toHaveLength(1);

    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 10, clientX: 140, clientY: 230 }));
    expect(contextMenus).toHaveLength(2);
    expect(contextMenus[1]?.button).toBe(2);

    const after = contextMenuEvent(2);
    target.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(true);
    expect(contextMenus).toHaveLength(2);

    const keyboardShortcut = new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true });
    target.dispatchEvent(keyboardShortcut);
    const keyboard = contextMenuEvent(2);
    target.dispatchEvent(keyboard);
    expect(keyboard.defaultPrevented).toBe(false);
    expect(contextMenus).toHaveLength(3);

    const shiftF10 = new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true });
    target.dispatchEvent(shiftF10);
    const keyboardF10 = contextMenuEvent(2);
    target.dispatchEvent(keyboardF10);
    expect(keyboardF10.defaultPrevented).toBe(false);
    expect(contextMenus).toHaveLength(4);

    const outside = contextMenuEvent(2);
    document.body.dispatchEvent(outside);
    expect(outside.defaultPrevented).toBe(false);
  });

  it('suppresses context menus after pointercancel and removes global listeners on unmount', () => {
    const { wrapper } = mountSelectionBox();
    const target = wrapper.get('.clip-a-trim-handle').element;
    const contextMenus: MouseEvent[] = [];
    target.addEventListener('contextmenu', (event) => contextMenus.push(event as MouseEvent));

    target.dispatchEvent(pointerEvent('pointerdown', { pointerId: 11, clientX: 140, clientY: 230 }));
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 11, clientX: 190, clientY: 280 }));
    flushFrame();
    window.dispatchEvent(pointerEvent('pointercancel', { pointerId: 11 }));

    const afterCancel = contextMenuEvent(2);
    target.dispatchEvent(afterCancel);
    expect(afterCancel.defaultPrevented).toBe(true);
    expect(contextMenus).toHaveLength(0);

    wrapper.unmount();
    const outside = document.createElement('div');
    document.body.append(outside);
    const afterUnmount = contextMenuEvent(2);
    outside.dispatchEvent(afterUnmount);
    expect(afterUnmount.defaultPrevented).toBe(false);
    outside.remove();
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 11, clientX: 200, clientY: 290 }));
    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 11, clientX: 200, clientY: 290 }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    window.dispatchEvent(new Event('blur'));
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it.each(['blur', 'resize'] as const)('cancels the active selection on window %s', async (eventName) => {
    const initial = { clipIds: ['stale-clip'], zoomIds: [] };
    const { wrapper, root } = mountSelectionBox(initial);
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 13, clientX: 390, clientY: 380 }));
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 13, clientX: 350, clientY: 350 }));
    flushFrame();
    await nextTick();
    expect(wrapper.emitted('select')).toEqual([[{ clipIds: [], zoomIds: [] }]]);

    window.dispatchEvent(new Event(eventName));
    await nextTick();
    expect(wrapper.emitted('select')).toEqual([[{ clipIds: [], zoomIds: [] }], [initial]]);
    expect(wrapper.find('.timeline-selection-box').exists()).toBe(false);
  });
});

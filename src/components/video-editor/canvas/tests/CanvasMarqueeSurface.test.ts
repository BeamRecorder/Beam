import { h, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CanvasMarqueeSurface from '../CanvasMarqueeSurface.vue';
import type { CanvasMarqueeTarget } from '../canvas-marquee-types';

type PointerInit = Partial<
  Pick<PointerEvent, 'button' | 'pointerId' | 'clientX' | 'clientY' | 'shiftKey' | 'ctrlKey' | 'metaKey'>
>;
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
const targets: CanvasMarqueeTarget[] = [
  { id: 'backdrop', x: 0, y: 0, width: 400, height: 200, backdrop: true },
  { id: 'shape', x: 20, y: 20, width: 60, height: 50 },
  { id: 'image', x: 200, y: 100, width: 80, height: 60 },
];
let wrapper: VueWrapper | undefined;
let pendingFrame: FrameRequestCallback | null = null;

const mountSurface = (selection: string[] = [], disabled = false) => {
  wrapper = mount(CanvasMarqueeSurface, {
    attachTo: document.body,
    props: { targets, selection, disabled },
    slots: { default: () => h('canvas') },
  });
  vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue({
    left: 100,
    top: 200,
    width: 400,
    height: 200,
  } as DOMRect);
  return wrapper;
};
const drag = async (root: Element, from: [number, number], to: [number, number], init: PointerInit = {}) => {
  root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 7, clientX: from[0], clientY: from[1], ...init }));
  window.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, clientX: to[0], clientY: to[1] }));
  pendingFrame?.(0);
  pendingFrame = null;
  await nextTick();
  window.dispatchEvent(pointerEvent('pointerup', { pointerId: 7, clientX: to[0], clientY: to[1] }));
};

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pendingFrame = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    pendingFrame = null;
  });
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  pendingFrame = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CanvasMarqueeSurface', () => {
  it('selects foreground targets with a right-button drag without always selecting the backdrop', async () => {
    const mounted = mountSurface();
    await drag(mounted.element, [105, 205], [190, 290]);

    expect(mounted.emitted('select')).toEqual([[{ ids: ['shape'], primaryId: 'shape', additive: false }]]);
    expect(mounted.find('.canvas-marquee-box').exists()).toBe(false);
  });

  it.each(['shiftKey', 'ctrlKey', 'metaKey'] as const)('adds hits to the existing selection with %s', async (key) => {
    const mounted = mountSurface(['shape']);
    await drag(mounted.element, [290, 290], [390, 390], { [key]: true });

    expect(mounted.emitted('select')).toEqual([[{ ids: ['shape', 'image'], primaryId: 'image', additive: true }]]);
  });

  it('ignores the gesture while disabled', async () => {
    const mounted = mountSurface([], true);
    await drag(mounted.element, [105, 205], [190, 290]);

    expect(mounted.emitted('select')).toBeUndefined();
  });

  it('shows outlines for every member of a multi-selection when requested', async () => {
    const mounted = mountSurface(['shape', 'image']);
    await mounted.setProps({ showSelectionOutlines: true });

    expect(mounted.findAll('.canvas-marquee-selection')).toHaveLength(2);
  });
});

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
    props: { targets: () => targets, selection, disabled },
    slots: {
      default: () => [h('canvas'), h('div', { class: 'webcam-selection' })],
    },
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
  root.dispatchEvent(
    pointerEvent('pointerdown', {
      pointerId: 7,
      clientX: from[0],
      clientY: from[1],
      ...init,
    }),
  );
  window.dispatchEvent(
    pointerEvent('pointermove', {
      pointerId: 7,
      clientX: to[0],
      clientY: to[1],
    }),
  );
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
  it('does not evaluate selection geometry during idle renders or disabled playback', async () => {
    const mounted = mountSurface();
    const geometry = vi.fn(() => targets);
    await mounted.setProps({ targets: geometry, selection: ['shape'], showSelectionOutlines: true });
    await mounted.setProps({ disabled: true, showSelectionOutlines: false, selection: ['shape', 'image'] });
    await drag(mounted.element, [100, 200], [400, 380]);
    expect(geometry).not.toHaveBeenCalled();
    expect(mounted.emitted('select')).toBeUndefined();
  });
  it('captures current geometry once per marquee gesture and retains it while dragging', async () => {
    const mounted = mountSurface();
    const geometry = vi.fn(() => targets);
    await mounted.setProps({ targets: geometry });
    mounted.element.dispatchEvent(pointerEvent('pointerdown', { pointerId: 7, clientX: 100, clientY: 200 }));
    geometry.mockReturnValue([]);
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, clientX: 220, clientY: 290 }));
    pendingFrame?.(0);
    await nextTick();
    expect(geometry).toHaveBeenCalledOnce();
    expect(mounted.emitted('select')?.at(-1)).toEqual([{ ids: ['shape'], primaryId: 'shape', additive: false }]);
    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 7, clientX: 220, clientY: 290 }));
    await mounted.setProps({ selection: ['shape'] });
    await drag(mounted.element, [100, 200], [220, 290]);
    expect(geometry).toHaveBeenCalledTimes(2);
    expect(mounted.emitted('select')?.at(-1)).toEqual([{ ids: [], primaryId: null, additive: false }]);
  });
  it('evaluates live geometry for multiple selection outlines and stops when hidden', async () => {
    const mounted = mountSurface(['shape', 'image']);
    const geometry = vi.fn(() => targets);
    await mounted.setProps({ targets: geometry, showSelectionOutlines: true });
    expect(geometry).toHaveBeenCalledOnce();
    expect(mounted.findAll('.canvas-marquee-selection')).toHaveLength(2);
    await mounted.setProps({ showSelectionOutlines: false });
    expect(mounted.findAll('.canvas-marquee-selection')).toHaveLength(0);
    expect(geometry).toHaveBeenCalledOnce();
  });
  it('selects foreground targets with a right-button drag without always selecting the backdrop', async () => {
    const mounted = mountSurface();
    await drag(mounted.element, [105, 205], [190, 290]);

    expect(mounted.emitted('select')).toEqual([[{ ids: ['shape'], primaryId: 'shape', additive: false }]]);
    expect(mounted.find('.canvas-marquee-box').exists()).toBe(false);
  });

  it('includes the backdrop when a select-all drag substantially covers it', async () => {
    const mounted = mountSurface();
    await drag(mounted.element, [105, 205], [495, 395]);

    expect(mounted.emitted('select')).toEqual([
      [
        {
          ids: ['backdrop', 'shape', 'image'],
          primaryId: 'image',
          additive: false,
        },
      ],
    ]);
  });

  it.each(['shiftKey', 'ctrlKey', 'metaKey'] as const)('adds hits to the existing selection with %s', async (key) => {
    const mounted = mountSurface(['shape']);
    await drag(mounted.element, [290, 290], [390, 390], { [key]: true });

    expect(mounted.emitted('select')).toEqual([[{ ids: ['shape', 'image'], primaryId: 'image', additive: true }]]);
  });

  it('keeps the current selection when a right-drag starts from its selection handle', async () => {
    const mounted = mountSurface(['shape']);

    await drag(mounted.get('.webcam-selection').element, [290, 290], [390, 390]);

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
  it('replays a stationary right-click context menu once and permits keyboard context menus afterward', () => {
    const mounted = mountSurface();
    const menu = vi.fn();
    mounted.element.addEventListener('contextmenu', menu);
    mounted.element.dispatchEvent(pointerEvent('pointerdown', { pointerId: 7, clientX: 120, clientY: 220 }));
    const original = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    mounted.element.dispatchEvent(original);
    expect(original.defaultPrevented).toBe(true);
    expect(menu).not.toHaveBeenCalled();
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, clientX: 121, clientY: 221 }));
    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 7, clientX: 121, clientY: 221 }));
    expect(menu).toHaveBeenCalledOnce();
    mounted.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    mounted.element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    expect(menu).toHaveBeenCalledTimes(2);
  });
  it.each(['Escape', 'pointercancel', 'blur', 'resize'])(
    'restores the initial selection when cancelled by %s',
    async (kind) => {
      const mounted = mountSurface(['image']);
      mounted.element.dispatchEvent(pointerEvent('pointerdown', { pointerId: 7, clientX: 100, clientY: 200 }));
      window.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, clientX: 220, clientY: 290 }));
      pendingFrame?.(0);
      await nextTick();
      window.dispatchEvent(
        kind === 'Escape'
          ? new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
          : kind === 'pointercancel'
            ? pointerEvent(kind, { pointerId: 7 })
            : new Event(kind),
      );
      await nextTick();
      expect(mounted.emitted('select')?.at(-1)).toEqual([{ ids: ['image'], primaryId: 'image', additive: false }]);
      expect(mounted.find('.canvas-marquee-box').exists()).toBe(false);
    },
  );
  it('ignores unrelated pointers and keys and releases a pending gesture on unmount', async () => {
    const mounted = mountSurface();
    mounted.element.dispatchEvent(pointerEvent('pointerdown', { button: 0 }));
    expect(pendingFrame).toBeNull();
    mounted.element.dispatchEvent(pointerEvent('pointerdown', { pointerId: 7, clientX: 100, clientY: 200 }));
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 8, clientX: 400, clientY: 400 }));
    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 8 }));
    window.dispatchEvent(pointerEvent('pointercancel', { pointerId: 8 }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(mounted.emitted('select')).toBeUndefined();
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, clientX: 400, clientY: 400 }));
    expect(pendingFrame).not.toBeNull();
    mounted.unmount();
    wrapper = undefined;
    expect(pendingFrame).toBeNull();
  });
  it('selects rotated bounds and excludes targets with no area using the latest surface scale', async () => {
    const mounted = mountSurface();
    await mounted.setProps({
      targets: () => [
        { id: 'rotated', x: 50, y: 30, width: 60, height: 20, rotation: 90 },
        { id: 'empty', x: 50, y: 30, width: 0, height: 20 },
      ],
    });
    Object.defineProperty(mounted.element, 'clientWidth', { value: 800 });
    Object.defineProperty(mounted.element, 'clientHeight', { value: 400 });
    await drag(mounted.element, [133, 208], [147, 214]);
    expect(mounted.emitted('select')?.at(-1)).toEqual([{ ids: ['rotated'], primaryId: 'rotated', additive: false }]);
  });
});

describe('optional left-button marquee',()=>{
  it('selects multiple foreground layers by dragging from empty canvas space',async()=>{
    const surface=mountSurface();await surface.setProps({canStartLeft:()=>true});
    await drag(surface.get('canvas').element,[110,210],[385,365],{button:0});
    expect((surface.emitted('select')!.at(-1)![0] as {ids:string[]}).ids).toEqual(['backdrop','shape','image']);
    expect(surface.find('.canvas-marquee-box').exists()).toBe(false);
  });
  it('retains normal element dragging when the left gesture predicate refuses it',async()=>{
    const surface=mountSurface(['shape']);await surface.setProps({canStartLeft:()=>false});
    await drag(surface.get('canvas').element,[110,210],[385,365],{button:0});expect(surface.emitted('select')).toBeUndefined();
  });
  it('clears empty-space clicks without replaying a right-click context menu',async()=>{
    const surface=mountSurface(['shape']);await surface.setProps({canStartLeft:()=>true});const context=vi.fn();surface.element.addEventListener('contextmenu',context);
    await drag(surface.get('canvas').element,[110,210],[110,210],{button:0});
    expect(surface.emitted('select')).toEqual([[{ids:[],primaryId:null,additive:false}]]);expect(context).not.toHaveBeenCalled();
  });
  it('keeps an additive selection on an empty left click',async()=>{
    const surface=mountSurface(['shape']);await surface.setProps({canStartLeft:()=>true});await drag(surface.get('canvas').element,[110,210],[110,210],{button:0,shiftKey:true});expect(surface.emitted('select')).toBeUndefined();
  });
});

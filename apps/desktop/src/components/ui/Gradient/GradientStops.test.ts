import { triggerPointer } from '../../../../../../tests/support/pointer';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GradientStops from './GradientStops.vue';
import { propertyInteractionActive, resetPropertyInteractions } from '~/composables/property-interaction';
import { holdPopoverInteractionKey } from '~/ui/popover/popover-interaction-types';
enableAutoUnmount(afterEach);
const stops = [
  { id: 'a', position: 0.2, color: '#112233', alpha: 1 },
  { id: 'b', position: 0.8, color: '#abcdef', alpha: 1 },
];
let scheduled = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
beforeEach(() => {
  resetPropertyInteractions();
  scheduled = new Map();
  nextFrame = 0;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      scheduled.set(++nextFrame, callback);
      return nextFrame;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => scheduled.delete(id)),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const frame = () => {
  for (const [id, callback] of [...scheduled]) {
    scheduled.delete(id);
    callback(0);
  }
};
function setup(overrides = {}, provide = {}) {
  const wrapper = mount(GradientStops, {
    props: { stops, selectedId: 'a', canAdd: true, ...overrides },
    attachTo: document.body,
    global: { provide },
  });
  let width = 200;
  vi.spyOn(wrapper.get('.gradient-track').element, 'getBoundingClientRect').mockImplementation(
    () => ({ left: 10, width }) as DOMRect,
  );
  return {
    wrapper,
    setWidth: (value: number) => {
      width = value;
    },
    bar: wrapper.get('.gradient-track-bar'),
    handle: wrapper.get('[role="slider"]'),
  };
}
async function pointer(type: string, options: PointerEventInit = {}) {
  const event = new PointerEvent(type, {
    pointerId: 1,
    isPrimary: true,
    clientX: 110,
    ...options,
    ...(Number.isNaN(options.clientX) ? { clientX: 0 } : {}),
  });
  if (Number.isNaN(options.clientX)) Object.defineProperty(event, 'clientX', { value: NaN });
  window.dispatchEvent(event);
  await nextTick();
}
describe('gradient stops rail', () => {
  it('adds interpolated positions and ignores secondary/non-primary presses and zero-width tracks', async () => {
    const { wrapper, bar, setWidth } = setup();
    await triggerPointer(bar, 'pointerdown', { clientX: 110 });
    await triggerPointer(bar, 'pointerdown', { clientX: -30 });
    await triggerPointer(bar, 'pointerdown', { clientX: 400 });
    expect(wrapper.emitted('add')).toEqual([[0.5], [0], [1]]);
    await triggerPointer(bar, 'pointerdown', { button: 2 });
    await triggerPointer(bar, 'pointerdown', { isPrimary: false });
    const invalid = new PointerEvent('pointerdown', { button: 0, isPrimary: true, bubbles: true });
    Object.defineProperty(invalid, 'clientX', { value: NaN });
    bar.element.dispatchEvent(invalid);
    setWidth(0);
    await triggerPointer(bar, 'pointerdown');
    await wrapper.setProps({ canAdd: false });
    await triggerPointer(bar, 'pointerdown');
    expect(wrapper.emitted('add')).toHaveLength(3);
  });
  it('batches movement in one frame and flushes the release point before ending the transaction', async () => {
    const release = vi.fn();
    const hold = vi.fn(() => release);
    const { wrapper, handle } = setup({}, { [holdPopoverInteractionKey as symbol]: hold });
    await triggerPointer(handle, 'pointerdown', { pointerId: 1, clientX: 50 });
    expect(propertyInteractionActive.value).toBe(true);
    expect(hold).toHaveBeenCalledOnce();
    await pointer('pointermove', { clientX: 80 });
    await pointer('pointermove', { clientX: 140 });
    expect(wrapper.emitted('move')).toBeUndefined();
    expect(scheduled.size).toBe(1);
    frame();
    expect(wrapper.emitted('move')).toEqual([['a', 0.65]]);
    await pointer('pointerup', { clientX: 180 });
    expect(wrapper.emitted('move')?.at(-1)).toEqual(['a', 0.85]);
    expect(propertyInteractionActive.value).toBe(false);
    expect(release).toHaveBeenCalledOnce();
    expect(scheduled.size).toBe(0);
  });
  it('ignores other pointers, secondary starts and invalid geometry during a drag', async () => {
    const { wrapper, handle, setWidth } = setup();
    await triggerPointer(handle, 'pointerdown', { button: 2 });
    await triggerPointer(handle, 'pointerdown', { isPrimary: false });
    expect(propertyInteractionActive.value).toBe(false);
    await triggerPointer(handle, 'pointerdown', { pointerId: 1, clientX: 50 });
    await triggerPointer(handle, 'pointerdown', { pointerId: 2 });
    await pointer('pointermove', { pointerId: 2 });
    await pointer('pointerup', { pointerId: 2 });
    await pointer('pointercancel', { pointerId: 2 });
    await pointer('pointermove', { clientX: NaN });
    setWidth(0);
    await pointer('pointermove');
    expect(wrapper.emitted('move')).toBeUndefined();
    expect(propertyInteractionActive.value).toBe(true);
    setWidth(200);
    await pointer('pointerup', { clientX: 999 });
    expect(wrapper.emitted('move')).toEqual([['a', 1]]);
  });
  it('keeps the grab offset and does not move a point when clicked near its edge', async () => {
    const { wrapper, handle } = setup();
    await triggerPointer(handle, 'pointerdown', { pointerId: 1, clientX: 57 });
    await pointer('pointerup', { clientX: 57 });
    expect(wrapper.emitted('move')).toEqual([['a', 0.2]]);
    await triggerPointer(handle, 'pointerdown', { pointerId: 1, clientX: 57 });
    await pointer('pointerup', { clientX: 77 });
    expect(wrapper.emitted('move')?.at(-1)?.[1]).toBeCloseTo(0.3);
  });
  it('refuses a drag on a zero-width track', async () => {
    const { handle, setWidth } = setup();
    setWidth(0);
    await triggerPointer(handle, 'pointerdown', { pointerId: 1, clientX: 50 });
    expect(propertyInteractionActive.value).toBe(false);
  });
  it.each(['pointercancel', 'blur', 'Escape'])(
    'restores the start position on %s and cancels pending work',
    async (event) => {
      const { wrapper, handle } = setup();
      await triggerPointer(handle, 'pointerdown', { pointerId: 1, clientX: 50 });
      await pointer('pointermove');
      frame();
      await pointer('pointermove', { clientX: 160 });
      if (event === 'Escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      else if (event === 'blur') window.dispatchEvent(new Event('blur'));
      else await pointer(event);
      await nextTick();
      expect(wrapper.emitted('move')?.at(-1)).toEqual(['a', 0.2]);
      expect(propertyInteractionActive.value).toBe(false);
      expect(scheduled.size).toBe(0);
    },
  );
  it('does not cancel for another key and disposes when disabled, deleted or unmounted', async () => {
    const first = setup();
    await triggerPointer(first.handle, 'pointerdown', { pointerId: 1, clientX: 50 });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(propertyInteractionActive.value).toBe(true);
    await first.wrapper.setProps({ disabled: true });
    expect(propertyInteractionActive.value).toBe(false);
    const second = setup();
    await triggerPointer(second.handle, 'pointerdown', { pointerId: 1, clientX: 50 });
    await second.wrapper.setProps({ stops: [stops[1]!] });
    expect(propertyInteractionActive.value).toBe(false);
    const third = setup();
    await triggerPointer(third.handle, 'pointerdown', { pointerId: 1, clientX: 50 });
    await pointer('pointermove');
    third.wrapper.unmount();
    expect(propertyInteractionActive.value).toBe(false);
    expect(scheduled.size).toBe(0);
    await pointer('pointerup');
    expect(third.wrapper.emitted('move')).toBeUndefined();
  });
  it.each([
    ['ArrowLeft', false, 0.19],
    ['ArrowDown', false, 0.19],
    ['ArrowUp', false, 0.21],
    ['ArrowRight', true, 0.3],
    ['Home', false, 0],
    ['End', false, 1],
  ])('moves with %s while retaining stop identity', async (key, shiftKey, value) => {
    const { wrapper, handle } = setup();
    await handle.trigger('keydown', { key, shiftKey });
    expect(wrapper.emitted('select')).toEqual([['a']]);
    expect(wrapper.emitted('move')?.[0]?.[1]).toBeCloseTo(value as number);
  });
  it.each(['Delete', 'Backspace'])('requests removal with %s', async (key) => {
    const { wrapper, handle } = setup();
    await handle.trigger('keydown', { key });
    expect(wrapper.emitted('remove')).toEqual([['a']]);
  });
  it('ignores unrelated keys and all changes when disabled, and selects with click', async () => {
    const { wrapper, handle, bar } = setup();
    await handle.trigger('keydown', { key: 'Tab' });
    await handle.trigger('click');
    expect(wrapper.emitted('move')).toBeUndefined();
    expect(wrapper.emitted('select')).toEqual([['a']]);
    await wrapper.setProps({ disabled: true });
    await handle.trigger('keydown', { key: 'End' });
    await triggerPointer(bar, 'pointerdown');
    await triggerPointer(handle, 'pointerdown', { pointerId: 1, clientX: 50 });
    expect(wrapper.emitted('move')).toBeUndefined();
    expect(wrapper.emitted('add')).toBeUndefined();
    expect(propertyInteractionActive.value).toBe(false);
  });
});

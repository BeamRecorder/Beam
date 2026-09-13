import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReorderGroup from './ReorderGroup.vue';

type AnimationRecord = {
  itemId: string | null;
  keyframes: Keyframe[];
  options: number | KeyframeAnimationOptions | undefined;
  cancel: ReturnType<typeof vi.fn>;
  animation: Animation;
};

const rectAt = (top: number, left = 0, width = 100, height = 20): DOMRect =>
  ({
    x: left,
    y: top,
    top,
    left,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  }) as DOMRect;

describe('ReorderGroup', () => {
  let rectReads: string[];
  let events: string[];
  let animations: AnimationRecord[];
  let matchMedia: ReturnType<typeof vi.fn>;
  let originalAnimate: PropertyDescriptor | undefined;
  let originalMatchMedia: PropertyDescriptor | undefined;

  beforeEach(() => {
    rectReads = [];
    events = [];
    animations = [];
    originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    matchMedia = vi.fn(() => ({ matches: false }) as unknown as MediaQueryList);
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMedia });

    const animate = function (
      this: HTMLElement,
      keyframes: Keyframe[] | PropertyIndexedKeyframes,
      options?: number | KeyframeAnimationOptions,
    ) {
      const cancel = vi.fn(() => events.push(`cancel:${itemIdFor(this)}`));
      const animation = { cancel, onfinish: null } as unknown as Animation;
      animations.push({ itemId: itemIdFor(this), keyframes: keyframes as Keyframe[], options, cancel, animation });
      return animation;
    };
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const itemId = itemIdFor(this);
      if (!itemId) return rectAt(0);
      rectReads.push(itemId);
      events.push(`rect:${itemId}`);
      const siblings = Array.from(this.parentElement?.children ?? []);
      return rectAt(siblings.indexOf(this) * 20);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
    else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
    else Reflect.deleteProperty(window, 'matchMedia');
  });

  const mountGroup = (
    initialOrder: string[] = ['a', 'b', 'c'],
    itemAttribute = 'data-track-id',
    includeItemAttribute = true,
  ) => {
    const order = ref([...initialOrder]);
    const label = ref('initial');
    const Harness = defineComponent({
      setup: () => () =>
        h(
          ReorderGroup,
          {
            order: order.value,
            ...(itemAttribute === 'data-track-id' ? {} : { itemAttribute }),
          },
          {
            default: () =>
              order.value.map((id) =>
                h('div', { key: id, ...(includeItemAttribute ? { [itemAttribute]: id } : {}) }, `${id}:${label.value}`),
              ),
          },
        ),
    });
    return { wrapper: mount(Harness), order, label };
  };

  it('measures only actual order changes and animates moved retained children', async () => {
    const { wrapper, order, label } = mountGroup();
    expect(animations).toHaveLength(0);

    const initialReadCount = rectReads.length;
    label.value = 'edited property';
    await nextTick();
    order.value = [...order.value];
    await nextTick();
    expect(rectReads).toHaveLength(initialReadCount);
    expect(animations).toHaveLength(0);

    order.value = ['b', 'd', 'a'];
    await nextTick();

    expect(rectReads).toHaveLength(initialReadCount + 5);
    expect(animations.map(({ itemId }) => itemId).sort()).toEqual(['a', 'b']);
    for (const animation of animations) {
      expect(animation.options).toMatchObject({ duration: 220 });
      expect(animation.keyframes[0]?.transform).toMatch(/^translate3d\(/);
      expect(animation.keyframes[1]?.transform).toBe('translate3d(0, 0, 0)');
    }
    expect(animations.find(({ itemId }) => itemId === 'a')?.keyframes[0]?.transform).toContain('-40px');
    expect(animations.find(({ itemId }) => itemId === 'b')?.keyframes[0]?.transform).toContain('20px');
    wrapper.unmount();
  });

  it('uses the configured item attribute instead of the default track id', async () => {
    const { wrapper, order } = mountGroup(['one', 'two'], 'data-layer-id');
    order.value = ['two', 'one'];
    await nextTick();

    expect(animations.map(({ itemId }) => itemId).sort()).toEqual(['one', 'two']);
    expect(wrapper.find('[data-layer-id="one"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('handles children without the configured identity attribute', async () => {
    const { wrapper, order } = mountGroup(['one', 'two'], 'data-layer-id', false);
    order.value = ['two', 'one'];
    await nextTick();

    expect(wrapper.text()).toContain('one:initial');
    expect(wrapper.text()).toContain('two:initial');
    wrapper.unmount();
  });

  it('skips measuring and animation when reduced motion is preferred', async () => {
    const { wrapper, order } = mountGroup();
    matchMedia.mockReturnValue({ matches: true });

    order.value = ['b', 'a', 'c'];
    await nextTick();

    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(rectReads).toHaveLength(0);
    expect(animations).toHaveLength(0);
    wrapper.unmount();
  });

  it('cancels interrupted animations after measuring and cancels remaining animations on unmount', async () => {
    const { wrapper, order } = mountGroup();
    order.value = ['b', 'a', 'c'];
    await nextTick();
    const firstMove = animations.slice();
    expect(firstMove).toHaveLength(2);

    rectReads = [];
    events = [];
    order.value = ['b', 'c', 'a'];
    await nextTick();

    expect(firstMove.every(({ cancel }) => cancel.mock.calls.length === 1)).toBe(true);
    const firstCancelEvent = events.findIndex((event) => event.startsWith('cancel:'));
    expect(events.slice(0, firstCancelEvent)).toEqual(['rect:b', 'rect:a', 'rect:c']);

    const secondMove = animations.slice(firstMove.length);
    expect(secondMove.map(({ itemId }) => itemId).sort()).toEqual(['a', 'c']);
    wrapper.unmount();
    expect(secondMove.every(({ cancel }) => cancel.mock.calls.length === 1)).toBe(true);
  });

  it('accounts for scaled and zero-size DOMRects when deriving FLIP offsets', async () => {
    const { wrapper, order } = mountGroup(['a', 'b']);
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
      const itemId = itemIdFor(this);
      if (!itemId) return rectAt(0);
      const index = Array.from(this.parentElement?.children ?? []).indexOf(this);
      return itemId === 'a' ? rectAt(index * 20, index * 20, 0, 0) : rectAt(index * 20, index * 20);
    });
    const a = wrapper.get('[data-track-id="a"]').element;
    const b = wrapper.get('[data-track-id="b"]').element;
    Object.defineProperty(a, 'offsetWidth', { configurable: true, value: 100 });
    Object.defineProperty(a, 'offsetHeight', { configurable: true, value: 50 });
    Object.defineProperty(b, 'offsetWidth', { configurable: true, value: 50 });
    Object.defineProperty(b, 'offsetHeight', { configurable: true, value: 10 });

    order.value = ['b', 'a'];
    await nextTick();

    expect(animations.find(({ itemId }) => itemId === 'a')?.keyframes[0]?.transform).toBe(
      'translate3d(-20px, -20px, 0)',
    );
    expect(animations.find(({ itemId }) => itemId === 'b')?.keyframes[0]?.transform).toBe('translate3d(10px, 10px, 0)');
    wrapper.unmount();
  });

  it('ignores finish callbacks from interrupted moves and removes only the current finished animation', async () => {
    const { wrapper, order } = mountGroup(['a', 'b']);
    order.value = ['b', 'a'];
    await nextTick();
    const interrupted = animations.slice();
    order.value = ['a', 'b'];
    await nextTick();
    const current = animations.slice(interrupted.length);
    const oldA = interrupted.find(({ itemId }) => itemId === 'a')!;
    const currentA = current.find(({ itemId }) => itemId === 'a')!;
    const currentB = current.find(({ itemId }) => itemId === 'b')!;

    expect(oldA.cancel).toHaveBeenCalledOnce();
    oldA.animation.onfinish?.({} as AnimationPlaybackEvent);
    currentA.animation.onfinish?.({} as AnimationPlaybackEvent);
    wrapper.unmount();

    expect(currentA.cancel).not.toHaveBeenCalled();
    expect(currentB.cancel).toHaveBeenCalledOnce();
  });
});

function itemIdFor(element: HTMLElement): string | null {
  return element.getAttribute('data-track-id') ?? element.getAttribute('data-layer-id');
}

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as VueUseModule from '@vueuse/core';
import MarqueeText from './MarqueeText.vue';

const interaction = vi.hoisted(() => ({
  hovered: null as ReturnType<typeof ref<boolean>> | null,
  focused: null as ReturnType<typeof ref<boolean>> | null,
  motion: null as ReturnType<typeof ref<'reduce' | 'no-preference'>> | null,
  trigger: null as HTMLElement | null,
}));
vi.mock('@vueuse/core', async (original) => ({
  ...(await original<typeof VueUseModule>()),
  useElementHover: (target: { value: HTMLElement | null }) => {
    interaction.trigger = target.value;
    return interaction.hovered;
  },
  useFocusWithin: () => ({ focused: interaction.focused }),
  usePreferredReducedMotion: () => interaction.motion,
}));
const observers: ResizeObserverCallback[] = [];
class ResizeObserverMock {
  constructor(callback: ResizeObserverCallback) {
    observers.push(callback);
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
enableAutoUnmount(afterEach);
beforeEach(() => {
  observers.length = 0;
  interaction.hovered = ref(false);
  interaction.focused = ref(false);
  interaction.motion = ref('no-preference');
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});
afterEach(() => vi.unstubAllGlobals());
const resize = async () => {
  for (const observer of observers) observer([], {} as ResizeObserver);
  await nextTick();
};
const prepare = async (labelWidth = 240) => {
  const wrapper = mount(MarqueeText, { slots: { default: 'Tùy chọn ghi hình màn hình rất dài' } });
  Object.defineProperties(wrapper.element, {
    clientWidth: { configurable: true, value: 100 },
    scrollWidth: { configurable: true, value: labelWidth },
  });
  Object.defineProperty(wrapper.get('.marquee-label').element, 'scrollWidth', {
    configurable: true,
    value: labelWidth,
  });
  await resize();
  return wrapper;
};
describe('shared scrolling labels', () => {
  it('keeps the full localized text and fades only the overflowing right edge', async () => {
    const wrapper = await prepare();
    expect(wrapper.text()).toBe('Tùy chọn ghi hình màn hình rất dài');
    expect(wrapper.classes()).toContain('is-overflowing');
    expect(wrapper.element.style.getPropertyValue('--marquee-distance')).toBe('140px');
    expect(wrapper.element.style.maskImage).toBe('var(--marquee-right-edge)');
    expect(wrapper.classes()).not.toContain('is-active');
  });
  it('activates for pointer and keyboard interaction and respects disabled and reduced motion', async () => {
    const wrapper = await prepare();
    interaction.hovered!.value = true;
    await nextTick();
    expect(wrapper.classes()).toContain('is-active');
    interaction.hovered!.value = false;
    interaction.focused!.value = true;
    await nextTick();
    expect(wrapper.classes()).toContain('is-active');
    await wrapper.setProps({ disabled: true });
    expect(wrapper.classes()).not.toContain('is-active');
    await wrapper.setProps({ disabled: false });
    interaction.motion!.value = 'reduce';
    await nextTick();
    expect(wrapper.classes()).not.toContain('is-active');
  });
  it('keeps short text still, removes stale overflow on resize, and allows centered controls', async () => {
    const wrapper = await prepare(60);
    expect(wrapper.classes()).not.toContain('is-overflowing');
    expect(wrapper.element.style.maskImage).toBe('');
    await wrapper.setProps({ align: 'center', labelClass: 'action-label' });
    expect(wrapper.classes()).toContain('centered');
    expect(wrapper.find('.action-label').exists()).toBe(true);
    Object.defineProperty(wrapper.get('.marquee-label').element, 'scrollWidth', { value: 300 });
    await resize();
    expect(wrapper.element.style.getPropertyValue('--marquee-distance')).toBe('200px');
    Object.defineProperty(wrapper.get('.marquee-label').element, 'scrollWidth', { value: 60 });
    await resize();
    expect(wrapper.classes()).not.toContain('is-overflowing');
    wrapper.unmount();
    await expect(resize()).resolves.toBeUndefined();
  });
  it.each([
    [30, 'var(--marquee-both-edges)'],
    [140, 'var(--marquee-left-edge)'],
  ])('tracks native horizontal scrolling at %s px', async (left, mask) => {
    const wrapper = await prepare();
    wrapper.element.scrollLeft = Number(left);
    await resize();
    expect(wrapper.element.style.maskImage).toBe(mask);
  });
  it('does not accelerate long labels by capping their travel duration', async () => {
    const wrapper = await prepare(660);
    expect(wrapper.element.style.getPropertyValue('--marquee-duration')).toBe('20s');
  });
  it('binds hover and focus to the owning control when supplied', () => {
    const trigger = document.createElement('button');
    mount(MarqueeText, { props: { trigger }, slots: { default: 'Settings' } });
    expect(interaction.trigger).toBe(trigger);
  });
});

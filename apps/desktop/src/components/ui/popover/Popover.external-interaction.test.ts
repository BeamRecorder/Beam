import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, inject } from 'vue';
import Popover from './Popover.vue';
import { holdPopoverInteractionKey, type HoldPopoverInteraction } from './popover-interaction-types';

enableAutoUnmount(afterEach);
afterEach(() => vi.useRealTimers());
const host = (interaction: 'click' | 'hover-focus-click' = 'click') => {
  let hold: HoldPopoverInteraction | undefined;
  const Content = defineComponent({
    setup() {
      hold = inject(holdPopoverInteractionKey);
      return () => h('span', 'Native picker');
    },
  });
  const wrapper = mount(Popover, {
    attachTo: document.body,
    props: { interaction, closeDelay: 20 },
    slots: { trigger: () => h('button', 'Open'), default: () => h(Content) },
  });
  return { wrapper, hold: () => hold!() };
};

describe('popover native interaction holds', () => {
  it('counts overlapping holds and makes release idempotent before restoring outside dismissal', async () => {
    const f = host();
    await f.wrapper.get('.popover-trigger').trigger('click');
    const releaseFirst = f.hold();
    const releaseSecond = f.hold();
    releaseFirst();
    releaseFirst();
    window.dispatchEvent(new Event('blur'));
    await flushPromises();
    expect(f.wrapper.vm.isOpen).toBe(true);
    releaseSecond();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flushPromises();
    expect(f.wrapper.vm.isOpen).toBe(false);
  });

  it('cancels a queued hover dismissal and suppresses hover, focus and Escape dismissal during selection', async () => {
    vi.useFakeTimers();
    const f = host('hover-focus-click');
    const trigger = f.wrapper.get('.popover-trigger');
    await trigger.trigger('mouseenter');
    await trigger.trigger('mouseleave');
    const release = f.hold();
    await trigger.trigger('mouseleave');
    await trigger.trigger('focusout');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(100);
    await f.wrapper.vm.$nextTick();
    expect(f.wrapper.vm.isOpen).toBe(true);
    release();
    await trigger.trigger('focusout');
    vi.advanceTimersByTime(20);
    await f.wrapper.vm.$nextTick();
    expect(f.wrapper.vm.isOpen).toBe(false);
  });

  it('still allows explicit dismissal or disabling while a native operation is held', async () => {
    const f = host();
    await f.wrapper.get('.popover-trigger').trigger('click');
    const release = f.hold();
    await f.wrapper.setProps({ disabled: true });
    expect(f.wrapper.vm.isOpen).toBe(false);
    release();
    release();
  });
});

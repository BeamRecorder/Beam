import { defineComponent, h, nextTick, ref } from 'vue';
import { mount, enableAutoUnmount } from '@vue/test-utils';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import Tooltip from './Tooltip.vue';
import Popover from '../popover/Popover.vue';
import { usePopoverTriggerSuppression } from './usePopoverTriggerSuppression';

enableAutoUnmount(afterEach);
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const create = (outside = false, delay = 0, controlled = false) =>
  mount(
    defineComponent({
      components: { Tooltip, Popover },
      setup: () => ({ delay, controlled }),
      template: outside
        ? `<Tooltip content="Trigger hint" :delay="delay" :open="controlled ? true : undefined" interactive><Popover><template #trigger><button>More</button></template><Tooltip content="Content hint"><button class="inside">Inside</button></Tooltip></Popover></Tooltip>`
        : `<Popover><template #trigger><Tooltip content="Trigger hint" :delay="delay" :open="controlled ? true : undefined" interactive><button>More</button></Tooltip></template><Tooltip content="Content hint"><button class="inside">Inside</button></Tooltip></Popover>`,
    }),
    { attachTo: document.body },
  );
const settle = async () => {
  await nextTick();
  await Promise.resolve();
  await nextTick();
};
const hint = () =>
  [...document.querySelectorAll('[role="tooltip"]')].find((element) => element.textContent?.includes('Trigger hint'));

it.each([false, true])(
  'removes the trigger tooltip immediately and blocks hover/focus while open, outer tooltip: %s',
  async (outside) => {
    const wrapper = create(outside),
      trigger = wrapper.findAllComponents(Tooltip)[0]!;
    await trigger.get('.tooltip-wrapper').trigger('mouseenter');
    await settle();
    expect(hint()).toBeDefined();
    await wrapper.get('.popover-trigger button').trigger('click');
    await settle();
    expect(hint()).toBeUndefined();
    await trigger.get('.tooltip-wrapper').trigger('mouseleave');
    await trigger.get('.tooltip-wrapper').trigger('mouseenter');
    await trigger.get('.tooltip-wrapper').trigger('focusin');
    vi.advanceTimersByTime(500);
    await settle();
    expect(hint()).toBeUndefined();
    wrapper.findComponent(Popover).vm.close();
    await settle();
    await trigger.get('.tooltip-wrapper').trigger('mouseenter');
    await settle();
    expect(hint()).toBeDefined();
  },
);
it('cancels a delayed tooltip before it can appear over an open popover', async () => {
  const wrapper = create(false, 200),
    trigger = wrapper.findAllComponents(Tooltip)[0]!;
  await trigger.get('.tooltip-wrapper').trigger('mouseenter');
  await wrapper.get('.popover-trigger button').trigger('click');
  await settle();
  vi.advanceTimersByTime(500);
  await settle();
  expect(hint()).toBeUndefined();
});
it('retains independent tooltips inside the popover content', async () => {
  const wrapper = create();
  await wrapper.get('.popover-trigger button').trigger('click');
  await settle();
  const contentHint = [...document.querySelectorAll('.tooltip-wrapper')].find((element) =>
    element.querySelector('.inside'),
  )!;
  contentHint.dispatchEvent(new MouseEvent('mouseenter'));
  await settle();
  expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('Content hint');
});
it('suppresses interactive and controlled hints and restores the controlled state after closing', async () => {
  const wrapper = create(false, 0, true);
  await settle();
  expect(hint()).toBeDefined();
  wrapper.findComponent(Popover).vm.toggle();
  await settle();
  expect(hint()).toBeUndefined();
  wrapper.findComponent(Popover).vm.close();
  await settle();
  expect(hint()).toBeDefined();
  wrapper.unmount();
  vi.advanceTimersByTime(500);
  await settle();
  expect(hint()).toBeUndefined();
});
it('disconnects the local observer when a dynamic trigger wrapper is removed', async () => {
  const element = ref<HTMLElement | null>(null);
  let suppression!: ReturnType<typeof usePopoverTriggerSuppression>;
  const wrapper = mount(
    defineComponent({
      setup() {
        suppression = usePopoverTriggerSuppression(element);
        return () => h('div', { class: 'popover-trigger', 'data-popover-open': 'true' });
      },
    }),
  );
  element.value = wrapper.element as HTMLElement;
  await settle();
  expect(suppression.suppressed.value).toBe(true);
  element.value = null;
  await settle();
  expect(suppression.isSuppressed()).toBe(false);
  expect(suppression.suppressed.value).toBe(false);
});

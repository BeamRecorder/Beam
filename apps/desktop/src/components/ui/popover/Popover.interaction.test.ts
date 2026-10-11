import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, inject, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Popover from './Popover.vue';
import { holdPopoverInteractionKey, popoverVisibilityKey } from './popover-interaction-types';

enableAutoUnmount(afterEach);
afterEach(() => vi.useRealTimers());

describe('popover trigger and nested interaction ownership', () => {
  it('opens on primary press, ignores its subsequent mouse click and supports keyboard clicks', async () => {
    const wrapper = mount(Popover, {
      props: { triggerOn: 'pointerdown' },
      slots: { trigger: '<button>Open</button>', default: 'Options' },
      global: { stubs: { teleport: true } },
    });
    const trigger = wrapper.get('.popover-trigger');
    const press = new MouseEvent('pointerdown', { button: 0, cancelable: true });
    trigger.element.dispatchEvent(press);
    await flushPromises();
    expect(press.defaultPrevented).toBe(true);
    expect(wrapper.vm.isOpen).toBe(true);
    trigger.element.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }));
    await flushPromises();
    expect(wrapper.emitted('toggle')).toEqual([[true]]);
    await trigger.trigger('click');
    expect(wrapper.vm.isOpen).toBe(false);
    await trigger.trigger('click');
    expect(wrapper.vm.isOpen).toBe(true);
  });

  it.each([{ button: 2 }, { button: 0, ctrlKey: true }])('ignores a context-menu press %j', async (event) => {
    const wrapper = mount(Popover, {
      props: { triggerOn: 'pointerdown' },
      slots: { trigger: '<button>Open</button>', default: 'Options' },
    });
    wrapper.get('.popover-trigger').element.dispatchEvent(new MouseEvent('pointerdown', event));
    await flushPromises();
    expect(wrapper.vm.isOpen).toBe(false);
    expect(wrapper.emitted('toggle')).toBeUndefined();
  });

  it.each([false, true])('holds all ancestor menus during an external interaction (ancestor: %s)', async (ancestor) => {
    vi.useFakeTimers();
    const releaseAncestor = vi.fn();
    const holdAncestor = vi.fn(() => releaseAncestor);
    const ExternalControl = defineComponent({
      setup() {
        const hold = inject(holdPopoverInteractionKey)!;
        let release: (() => void) | undefined;
        return () => [
          h('button', { class: 'hold', onClick: () => (release = hold()) }, 'Open native control'),
          h(
            'button',
            {
              class: 'release',
              onClick: () => {
                release?.();
                release?.();
              },
            },
            'Finish',
          ),
        ];
      },
    });
    const Menus = defineComponent({
      components: { Popover, ExternalControl },
      template: `<Popover interaction="hover-focus-click" :close-delay="25" keep-mounted>
        <template #trigger><button>Parent</button></template>
        <Popover interaction="hover-focus-click" :close-delay="25" keep-mounted>
          <template #trigger><button>Child</button></template><ExternalControl />
        </Popover>
      </Popover>`,
    });
    const wrapper = mount(Menus, {
      attachTo: document.body,
      global: {
        stubs: { teleport: true },
        provide: ancestor ? { [holdPopoverInteractionKey as symbol]: holdAncestor } : {},
      },
    });
    await wrapper.get('.popover-trigger').trigger('mouseenter');
    const menus = wrapper.findAllComponents(Popover);
    await menus[1]!.get('.popover-trigger').trigger('mouseenter');
    await menus[0]!.get('.popover-trigger').trigger('mouseleave');
    await wrapper.get('.hold').trigger('click');
    for (const menu of menus) {
      await menu.get('.popover-trigger').trigger('mouseleave');
      await menu.get('.popover-trigger').trigger('focusout');
    }
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    window.dispatchEvent(new Event('blur'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    vi.advanceTimersByTime(50);
    await flushPromises();
    expect(menus.map((menu) => menu.vm.isOpen)).toEqual([true, true]);
    await wrapper.get('.release').trigger('click');
    if (ancestor) {
      expect(holdAncestor).toHaveBeenCalledOnce();
      expect(releaseAncestor).toHaveBeenCalledOnce();
    }
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flushPromises();
    expect(menus.map((menu) => menu.vm.isOpen)).toEqual([false, false]);
    await menus[0]!.get('.popover-trigger').trigger('mouseenter');
    expect(menus.map((menu) => menu.vm.isOpen)).toEqual([true, false]);
  });

  it('closes retained content when its containing surface hides and does not reopen it implicitly', async () => {
    const visible = ref(true);
    const wrapper = mount(Popover, {
      props: { keepMounted: true },
      slots: { trigger: '<button>Open</button>', default: 'Options' },
      global: { stubs: { teleport: true }, provide: { [popoverVisibilityKey as symbol]: visible } },
    });
    await wrapper.get('.popover-trigger').trigger('click');
    expect(wrapper.vm.isOpen).toBe(true);
    visible.value = false;
    await flushPromises();
    expect(wrapper.vm.isOpen).toBe(false);
    expect(wrapper.get('.popover-content').attributes('inert')).toBeDefined();
    visible.value = true;
    await flushPromises();
    expect(wrapper.vm.isOpen).toBe(false);
    await wrapper.get('.popover-trigger').trigger('click');
    expect(wrapper.vm.isOpen).toBe(true);
  });
});

import { flushPromises, mount, enableAutoUnmount } from '@vue/test-utils';
import { defineComponent, h, onMounted, onUnmounted } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Popover from './Popover.vue';

enableAutoUnmount(afterEach);
describe('retained popover content', () => {
  it('mounts only on first open and retains its child instance through subsequent closes', async () => {
    const mounted = vi.fn();
    const unmounted = vi.fn();
    const Child = defineComponent({
      setup() {
        onMounted(mounted);
        onUnmounted(unmounted);
        return () => 'Child';
      },
    });
    const wrapper = mount(Popover, {
      attachTo: document.body,
      props: { keepMounted: true, motion: 'lift' },
      slots: { trigger: '<button>Open</button>', default: () => h(Child) },
      global: { stubs: { teleport: false } },
    });
    expect(mounted).not.toHaveBeenCalled();
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(mounted).toHaveBeenCalledOnce();
    wrapper.vm.close();
    await flushPromises();
    expect(document.querySelector<HTMLElement>('.popover-content')?.style.display).toBe('none');
    expect(unmounted).not.toHaveBeenCalled();
    await wrapper.get('button').trigger('click');
    expect(mounted).toHaveBeenCalledOnce();
    wrapper.unmount();
    expect(unmounted).toHaveBeenCalledOnce();
  });
  it('continues unmounting ordinary menus on close', async () => {
    const wrapper = mount(Popover, {
      slots: { trigger: '<button>Open</button>', default: '<p>Content</p>' },
      global: { stubs: { teleport: true } },
    });
    await wrapper.get('button').trigger('click');
    wrapper.vm.close();
    await flushPromises();
    expect(wrapper.find('.popover-content').exists()).toBe(false);
  });
  it('provides live open state to retained content and supports disabling while closed', async () => {
    const wrapper = mount(Popover, {
      props: { keepMounted: true },
      slots: {
        trigger: '<button>Open</button>',
        default: '<template #default="{ isOpen }"><p>{{ isOpen }}</p></template>',
      },
      global: { stubs: { teleport: true } },
    });
    await wrapper.get('button').trigger('click');
    expect(wrapper.get('p').text()).toBe('true');
    await wrapper.setProps({ disabled: true });
    expect(wrapper.get('p').text()).toBe('false');
    await wrapper.get('button').trigger('click');
    expect(wrapper.get('p').text()).toBe('false');
  });
});

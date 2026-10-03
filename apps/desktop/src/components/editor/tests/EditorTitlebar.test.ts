import { flushPromises, mount, enableAutoUnmount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, ref } from 'vue';
import EditorTitlebar from '../EditorTitlebar.vue';
import Popover from '~/ui/popover/Popover.vue';

enableAutoUnmount(afterEach);
const mountTitlebar = () =>
  mount(EditorTitlebar, {
    attachTo: document.body,
    slots: {
      center: defineComponent({
        components: { Popover },
        template: `<Popover keep-mounted><template #trigger><button class="open-picker">Projects</button></template>
        <Popover><template #trigger><button class="open-child">Actions</button></template><p>Actions</p></Popover>
      </Popover>`,
      }),
    },
  });

describe('editor titlebar outside dismissal', () => {
  it('enables clicks on the native drag zone while a picker is open, restoring dragging on dismissal', async () => {
    const wrapper = mountTitlebar();
    expect(wrapper.classes()).not.toContain('is-dismissible');
    await wrapper.get('.open-picker').trigger('click');
    expect(wrapper.classes()).toContain('is-dismissible');
    wrapper.get('.titlebar-drag-region').element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await flushPromises();
    expect(wrapper.classes()).not.toContain('is-dismissible');
    expect(wrapper.getComponent(Popover).vm.isOpen).toBe(false);
  });
  it('keeps the zone interactive until every nested popup is closed', async () => {
    const wrapper = mountTitlebar();
    await wrapper.get('.open-picker').trigger('click');
    document.querySelector<HTMLButtonElement>('.open-child')!.click();
    await flushPromises();
    const popovers = wrapper.findAllComponents(Popover);
    popovers[1]!.vm.close();
    await flushPromises();
    expect(wrapper.classes()).toContain('is-dismissible');
    popovers[0]!.vm.close();
    await flushPromises();
    expect(wrapper.classes()).not.toContain('is-dismissible');
  });
  it('clears the titlebar interaction lease when an open popup unmounts', async () => {
    const visible = ref(true);
    const wrapper = mount(EditorTitlebar, {
      attachTo: document.body,
      slots: {
        center: defineComponent({
          components: { Popover },
          template: `<Popover v-if="visible"><template #trigger><button>Open</button></template><p>Body</p></Popover>`,
          setup: () => ({ visible }),
        }),
      },
    });
    await wrapper.get('button').trigger('click');
    visible.value = false;
    await flushPromises();
    expect(wrapper.classes()).not.toContain('is-dismissible');
  });

  it('closes teleported descendant menus when a retained parent closes through its API', async () => {
    const wrapper = mountTitlebar();
    await wrapper.get('.open-picker').trigger('click');
    document.querySelector<HTMLButtonElement>('.open-child')!.click();
    await flushPromises();
    const popovers = wrapper.findAllComponents(Popover);
    expect(popovers[1]!.vm.isOpen).toBe(true);
    popovers[0]!.vm.close();
    await flushPromises();
    expect(popovers[1]!.vm.isOpen).toBe(false);
    expect(wrapper.classes()).not.toContain('is-dismissible');
  });
});

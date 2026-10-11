import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vitest';
import { defineComponent } from 'vue';
import Dialog from './Dialog.vue';
import Popover from '../popover/Popover.vue';
import { popoverLayerKey } from '../popover/popover-layer-types';

enableAutoUnmount(afterEach);
const DialogWithMenus = defineComponent({
  components: { Dialog, Popover },
  template: `<Dialog :is-open="true" title="Export">
    <Popover><template #trigger><button class="open-menu">Open menu</button></template>
      <Popover><template #trigger><button class="open-child">Open child</button></template><button>Choice</button></Popover>
    </Popover>
  </Dialog>`,
});

it('retains the ordinary layer for a standalone popover', async () => {
  const wrapper = mount(Popover, {
    slots: { trigger: '<button>Open</button>', default: 'Options' },
    global: { stubs: { teleport: true } },
  });
  await wrapper.get('.popover-trigger').trigger('click');
  await flushPromises();
  expect(wrapper.get<HTMLElement>('.popover-content').element.style.zIndex).toBe('10000');
});
it('places teleported menus above their dialog and nested menus above their parent', async () => {
  const wrapper = mount(DialogWithMenus, { global: { stubs: { teleport: true } } });
  await wrapper.get('.open-menu').trigger('click');
  await flushPromises();
  const layer = Number(wrapper.get<HTMLElement>('.dialog-overlay').element.style.zIndex);
  expect(Number(wrapper.get<HTMLElement>('.popover-content').element.style.zIndex)).toBeGreaterThan(layer);
  await wrapper.get('.open-child').trigger('click');
  await flushPromises();
  expect(wrapper.findAll<HTMLElement>('.popover-content').map((menu) => Number(menu.element.style.zIndex))).toEqual([
    20001, 20002,
  ]);
});
it('keeps dialogs and their menus above an already elevated parent surface', async () => {
  const wrapper = mount(DialogWithMenus, {
    global: { stubs: { teleport: true }, provide: { [popoverLayerKey as symbol]: 30000 } },
  });
  await wrapper.get('.open-menu').trigger('click');
  await flushPromises();
  expect(wrapper.get<HTMLElement>('.dialog-overlay').element.style.zIndex).toBe('30000');
  expect(wrapper.get<HTMLElement>('.popover-content').element.style.zIndex).toBe('30001');
});

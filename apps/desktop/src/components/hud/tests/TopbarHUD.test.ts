import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../api/capture', () => ({
  capture: {
    getUpdateState: vi.fn().mockResolvedValue({ status: 'unsupported', currentVersion: '0.1.0' }),
    onUpdateState: vi.fn().mockReturnValue(() => undefined),
  },
}));
import TopbarHUD from '../TopbarHUD.vue';
import { defineComponent, ref } from 'vue';
import Popover from '~/ui/popover/Popover.vue';
enableAutoUnmount(afterEach);

describe('TopbarHUD', () => {
  it('keeps contextual icons static when its title changes', async () => {
    const wrapper = mount(TopbarHUD, { props: { symbol: 'folder' } });
    const icon = wrapper.get('.brand-symbol svg').element;
    await wrapper.setProps({ title: 'Loading' });
    expect(wrapper.get('.brand-symbol svg').element).toBe(icon);
    expect(wrapper.find('.beam-mascot').exists()).toBe(false);
    await wrapper.setProps({ symbol: 'settings' });
    expect(wrapper.get('.brand-symbol svg').classes()).toContain('lucide-settings');
    wrapper.unmount();
  });
  it('keeps Beam branding and moves capture modes out of the titlebar', () => {
    const wrapper = mount(TopbarHUD);
    expect(wrapper.get('.brand-symbol img').attributes('src')).toContain('/brand/BeamIcon.webp');
    expect(wrapper.find('.beam-mascot').exists()).toBe(false);
    expect(wrapper.get('[aria-label="Beam"]').attributes('type')).toBe('button');
    expect(wrapper.get('.topbar-title').text()).toBe('Beam');
    expect(wrapper.find('[role="group"]').exists()).toBe(false);
  });
  it('opens the separate settings, project windows', async () => {
    const wrapper = mount(TopbarHUD);
    await wrapper.get('[aria-label="Preferences"]').trigger('click');
    await wrapper.get('[aria-label="Open a project"]').trigger('click');
    expect(wrapper.emitted('open-settings')).toEqual([[]]);
    expect(wrapper.emitted('open-projects')).toEqual([[]]);
    expect(wrapper.find('[aria-label="Mascot Lab"]').exists()).toBe(false);
  });
  it('disables panel actions during loading while leaving close available', async () => {
    const wrapper = mount(TopbarHUD, {
      props: { disabled: true, title: 'Loading' },
    });
    expect(wrapper.get('[aria-label="Preferences"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[aria-label="Preferences"]').trigger('click');
    expect(wrapper.emitted('open-settings')).toBeUndefined();
    await wrapper.get('[aria-label="Close"]').trigger('click');
    expect(wrapper.emitted('close')).toEqual([[]]);
    expect(wrapper.get('.topbar-title').text()).toBe('Loading');
  });
  it('hides optional actions and delegates minimize to Electron', async () => {
    const wrapper = mount(TopbarHUD, {
      props: { showSettings: false, showProjects: false },
    });
    expect(wrapper.find('[aria-label="Preferences"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Open a project"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Mascot Lab"]').exists()).toBe(false);
    await wrapper.get('[aria-label="Minimize"]').trigger('click');
    expect(wrapper.emitted('minimize')).toEqual([[]]);
  });
  it('offers a Close-only Beam titlebar for Projects', async () => {
    const wrapper = mount(TopbarHUD, {
      props: { showSettings: false, showProjects: false, showMinimize: false },
    });
    expect(wrapper.findAll('.window-actions button')).toHaveLength(1);
    expect(wrapper.find('[aria-label="Minimize"]').exists()).toBe(false);
    await wrapper.get('[aria-label="Close"]').trigger('click');
    expect(wrapper.emitted('close')).toEqual([[]]);
    wrapper.unmount();
  });
});

describe('HUD topbar outside dismissal', () => {
  const create = () =>
    mount(TopbarHUD, {
      props: { showSettings: false },
      attachTo: document.body,
      slots: {
        issues: defineComponent({
          components: { Popover },
          template: `<Popover keep-mounted><template #trigger><button class="open-parent">Open</button></template>
          <Popover><template #trigger><button class="open-child">Actions</button></template><p>Child</p></Popover>
        </Popover>`,
        }),
      },
    });
  it('allows an outside press in the native drag area and restores dragging after dismissal', async () => {
    const wrapper = create();
    expect(wrapper.classes()).not.toContain('is-dismissible');
    await wrapper.get('.open-parent').trigger('click');
    expect(wrapper.classes()).toContain('is-dismissible');
    await wrapper.get('.topbar-identity').trigger('pointerdown');
    await flushPromises();
    expect(wrapper.classes()).not.toContain('is-dismissible');
    expect(wrapper.getComponent(Popover).vm.isOpen).toBe(false);
  });
  it('keeps the topbar clickable until all nested panels are closed', async () => {
    const wrapper = create();
    await wrapper.get('.open-parent').trigger('click');
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
  it('restores the drag area when an open popover is removed', async () => {
    const visible = ref(true);
    const wrapper = mount(TopbarHUD, {
      props: { showSettings: false },
      attachTo: document.body,
      slots: {
        issues: defineComponent({
          components: { Popover },
          setup: () => ({ visible }),
          template:
            '<Popover v-if="visible"><template #trigger><button class="open-parent">Open</button></template><p>Body</p></Popover>',
        }),
      },
    });
    await wrapper.get('.open-parent').trigger('click');
    expect(wrapper.classes()).toContain('is-dismissible');
    visible.value = false;
    await flushPromises();
    expect(wrapper.classes()).not.toContain('is-dismissible');
  });
});

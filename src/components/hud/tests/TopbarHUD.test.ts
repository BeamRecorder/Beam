import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../api/capture', () => ({
  capture: {
    getUpdateState: vi.fn().mockResolvedValue({ status: 'unsupported', currentVersion: '0.1.0' }),
    onUpdateState: vi.fn().mockReturnValue(() => undefined),
  },
}));
import TopbarHUD from '../TopbarHUD.vue';

describe('TopbarHUD', () => {
  it('shows the shared failure pose and clears it when the recorder recovers', async () => {
    const wrapper = mount(TopbarHUD, { props: { failed: true } });
    expect(wrapper.get('.beam-mascot').attributes('data-phase')).toBe('failed');
    await wrapper.setProps({ failed: false });
    expect(wrapper.get('.beam-mascot').attributes('data-phase')).toBe('idle');
    wrapper.unmount();
  });
  it('keeps Beam branding and moves capture modes out of the titlebar', () => {
    const wrapper = mount(TopbarHUD);
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('[data-beamy-dock] svg').exists()).toBe(true);
    expect(wrapper.get('[aria-label="Animate Beamy"]').attributes('type')).toBe('button');
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
    const wrapper = mount(TopbarHUD, { props: { disabled: true, title: 'Loading' } });
    expect(wrapper.get('[aria-label="Preferences"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[aria-label="Preferences"]').trigger('click');
    expect(wrapper.emitted('open-settings')).toBeUndefined();
    await wrapper.get('[aria-label="Close"]').trigger('click');
    expect(wrapper.emitted('close')).toEqual([[]]);
    expect(wrapper.get('.topbar-title').text()).toBe('Loading');
  });
  it('hides optional actions and delegates minimize to Electron', async () => {
    const wrapper = mount(TopbarHUD, { props: { showSettings: false, showProjects: false } });
    expect(wrapper.find('[aria-label="Preferences"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Open a project"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Mascot Lab"]').exists()).toBe(false);
    await wrapper.get('[aria-label="Minimize"]').trigger('click');
    expect(wrapper.emitted('minimize')).toEqual([[]]);
  });
});

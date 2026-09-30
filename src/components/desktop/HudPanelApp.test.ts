import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const capture = vi.hoisted(() => ({
  platform: 'linux',
  notifyHudPanelReady: vi.fn(),
  requestHudProject: vi.fn(),
  close: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));
import HudPanelApp from './HudPanelApp.vue';
const settings = { name: 'HudSettingsWindow', emits: ['ready'], template: '<div />' };
const projects = { name: 'ProjectPicker', emits: ['open-project', 'back'], template: '<div />' };
const mascot = { name: 'MascotLab', props: ['embedded'], template: '<div class="mascot-lab" />' };
const create = async (panel: string) => {
  window.history.replaceState({}, '', `?panel=${panel}`);
  const wrapper = mount(HudPanelApp, {
    global: { stubs: { HudSettingsWindow: settings, ProjectPicker: projects, MascotLab: mascot, ToastProvider: true } },
  });
  await flushPromises();
  return wrapper;
};
beforeEach(() => {
  vi.clearAllMocks();
  capture.platform = 'linux';
  capture.requestHudProject.mockResolvedValue(true);
});
describe('independent HUD panel renderer', () => {
  it('mounts the embedded lab with its own native title and readiness signal', async () => {
    const wrapper = await create('mascot');
    expect(document.title).toBe('Beam Mascot Lab');
    expect(wrapper.get('.panel-titlebar').text()).toBe('Mascot Lab');
    expect(wrapper.getComponent(mascot).props('embedded')).toBe('');
    expect(capture.notifyHudPanelReady).toHaveBeenCalledOnce();
    expect(wrapper.findComponent(settings).exists()).toBe(false);
    expect(wrapper.findComponent(projects).exists()).toBe(false);
    expect(capture.requestHudProject).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('does not announce readiness for an unknown panel role', async () => {
    const wrapper = await create('unknown');
    expect(capture.notifyHudPanelReady).not.toHaveBeenCalled();
    expect(wrapper.findComponent(mascot).exists()).toBe(false);
    wrapper.unmount();
  });
  it('announces Settings readiness only after its settings component mounts', async () => {
    const wrapper = await create('settings');
    expect(document.title).toBe('Beam Settings');
    expect(capture.notifyHudPanelReady).not.toHaveBeenCalled();
    wrapper.getComponent(settings).vm.$emit('ready');
    expect(capture.notifyHudPanelReady).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
  it('announces Projects readiness and delegates a selection through the narrow API', async () => {
    const wrapper = await create('projects');
    expect(document.title).toBe('Beam Projects');
    expect(capture.notifyHudPanelReady).toHaveBeenCalledOnce();
    wrapper.getComponent(projects).vm.$emit('open-project', { id: 'project-id', mode: 'screenshot' });
    await flushPromises();
    expect(capture.requestHudProject).toHaveBeenCalledWith({ id: 'project-id', mode: 'screenshot' });
    wrapper.getComponent(projects).vm.$emit('back');
    expect(capture.close).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
  it('preserves legacy Studio projects and shows request failures before allowing a retry', async () => {
    capture.platform = 'darwin';
    const wrapper = await create('projects');
    expect(wrapper.get('main').classes()).toContain('mac');
    capture.requestHudProject.mockRejectedValueOnce(new Error('Recorder busy'));
    wrapper.getComponent(projects).vm.$emit('open-project', { id: 'legacy-id' });
    await flushPromises();
    expect(capture.requestHudProject).toHaveBeenCalledWith({ id: 'legacy-id', mode: 'studio' });
    expect(wrapper.get('[role="alert"]').text()).toBe('Recorder busy');
    capture.requestHudProject.mockRejectedValueOnce('Selection unavailable');
    wrapper.getComponent(projects).vm.$emit('open-project', { id: 'legacy-id' });
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Selection unavailable');
    wrapper.getComponent(projects).vm.$emit('open-project', { id: 'legacy-id' });
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const capture = vi.hoisted(() => ({
  platform: 'linux',
  notifyHudPanelReady: vi.fn(),
  notifyHudPanelPrepared: vi.fn(),
  visibility: null as ((value: boolean) => void) | null,
  unsubscribe: vi.fn(),
  onHudPanelVisibility: vi.fn(),
  requestHudProject: vi.fn(),
  close: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));
import HudPanelApp from './HudPanelApp.vue';
import type { HudPanel } from '~/api/types/hud-panel';
const settings = {
  name: 'HudSettingsWindow',
  emits: ['ready'],
  template: '<div />',
};
const projects = {
  name: 'ProjectPicker',
  emits: ['open-project'],
  template: '<div />',
};
const mascot = { name: 'MascotLab', props: ['embedded'], template: '<div />' };
const create = async (panel: string, visible = true) => {
  window.history.replaceState({}, '', `?panel=${panel}`);
  const wrapper = mount(HudPanelApp, {
    props: {
      panel: panel === 'unknown' ? null : (panel as HudPanel),
      content: panel === 'settings' ? settings : panel === 'projects' ? projects : panel === 'mascot' ? mascot : null,
    },
    global: {
      stubs: {
        HudSettingsWindow: settings,
        ProjectPicker: projects,
        ToastProvider: true,
      },
    },
  });
  if (visible) capture.visibility?.(true);
  await flushPromises();
  return wrapper;
};
beforeEach(() => {
  vi.clearAllMocks();
  capture.platform = 'linux';
  capture.onHudPanelVisibility.mockImplementation((listener) => {
    capture.visibility = listener;
    return capture.unsubscribe;
  });
  capture.requestHudProject.mockResolvedValue(true);
});
describe('independent HUD panel renderer', () => {
  it('presents the embedded Mascot Lab with its own title and readiness', async () => {
    const wrapper = await create('mascot');
    expect(document.title).toBe('Beam Mascot Lab');
    expect(wrapper.getComponent(mascot).props('embedded')).toBe(true);
    expect(capture.notifyHudPanelReady).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
  it('does not announce readiness for an unknown panel role', async () => {
    const wrapper = await create('unknown');
    expect(capture.notifyHudPanelReady).not.toHaveBeenCalled();
    expect(wrapper.findComponent(projects).exists()).toBe(false);
    wrapper.unmount();
  });
  it('announces Settings readiness only after its settings component mounts', async () => {
    const wrapper = await create('settings');
    expect(document.title).toBe('Beam Settings');
    expect(wrapper.get('.panel-titlebar .topbar-title').text()).toBe('Preferences');
    expect(wrapper.get('.panel-titlebar svg').classes()).toContain('lucide-settings');
    expect(wrapper.get('.panel-titlebar svg').attributes('width')).toBe('16');
    expect(wrapper.find('.panel-titlebar .beam-mascot').exists()).toBe(false);
    expect(wrapper.find('.panel-titlebar button').exists()).toBe(false);
    expect(wrapper.find('.hud-topbar').exists()).toBe(false);
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
    expect(capture.requestHudProject).toHaveBeenCalledWith({
      id: 'project-id',
      mode: 'screenshot',
    });
    expect(wrapper.find('.panel-titlebar').exists()).toBe(false);
    expect(wrapper.get('.hud-topbar .topbar-title').text()).toBe('Beam');
    expect(wrapper.get('.hud-topbar .brand-symbol svg').classes()).toContain('lucide-folder-open');
    expect(wrapper.get('.hud-topbar .brand-symbol svg').attributes('width')).toBe('16');
    expect(wrapper.find('.hud-topbar .beam-mascot').exists()).toBe(false);
    expect(wrapper.findAll('.window-actions button')).toHaveLength(1);
    await wrapper.get('.window-actions [aria-label="Close"]').trigger('click');
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
    expect(capture.requestHudProject).toHaveBeenCalledWith({
      id: 'legacy-id',
      mode: 'studio',
    });
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

it('prepares only the shell and mounts fresh feature content on each presentation', async () => {
  const wrapper = await create('projects', false);
  expect(capture.notifyHudPanelPrepared).toHaveBeenCalledOnce();
  expect(capture.notifyHudPanelReady).not.toHaveBeenCalled();
  expect(wrapper.findComponent(projects).exists()).toBe(false);
  capture.visibility?.(true);
  await flushPromises();
  const first = wrapper.getComponent(projects).vm;
  expect(capture.notifyHudPanelReady).toHaveBeenCalledOnce();
  capture.visibility?.(false);
  await flushPromises();
  expect(wrapper.findComponent(projects).exists()).toBe(false);
  capture.visibility?.(true);
  await flushPromises();
  expect(wrapper.getComponent(projects).vm).not.toBe(first);
  expect(capture.notifyHudPanelReady).toHaveBeenCalledTimes(2);
  wrapper.unmount();
  expect(capture.unsubscribe).toHaveBeenCalledOnce();
});
it('clears a selection error when hidden and does not expose stale errors on reopening', async () => {
  const wrapper = await create('projects');
  capture.requestHudProject.mockRejectedValueOnce(new Error('busy'));
  wrapper.getComponent(projects).vm.$emit('open-project', { id: 'image', mode: 'screenshot' });
  await flushPromises();
  expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  capture.visibility?.(false);
  await flushPromises();
  expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  wrapper.unmount();
});
it('keeps hidden Settings unmounted until visibility and waits for explicit content readiness', async () => {
  const wrapper = await create('settings', false);
  expect(capture.notifyHudPanelPrepared).toHaveBeenCalledOnce();
  expect(wrapper.findComponent(settings).exists()).toBe(false);
  capture.visibility?.(true);
  await flushPromises();
  expect(capture.notifyHudPanelReady).not.toHaveBeenCalled();
  wrapper.getComponent(settings).vm.$emit('ready');
  expect(capture.notifyHudPanelReady).toHaveBeenCalledOnce();
  wrapper.unmount();
});

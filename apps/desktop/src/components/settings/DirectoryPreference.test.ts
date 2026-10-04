import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrentLocale } from '~/i18n';
import type { DirectorySnapshot } from '~/api/types/storage-directories';
const bridge = vi.hoisted(() => ({
  getDirectories: vi.fn(),
  chooseDirectory: vi.fn(),
  selectDirectory: vi.fn(),
  onPreferencesChanged: vi.fn(() => vi.fn()),
}));
vi.mock('~/api/capture', () => ({ capture: bridge }));
import DirectoryPreference from './DirectoryPreference.vue';
import StoragePreferences from './StoragePreferences.vue';
import Select from '~/ui/select/Select.vue';
import Button from '~/ui/button/Button.vue';
enableAutoUnmount(afterEach);
const initial: DirectorySnapshot = {
  projects: { directory: null, recent: ['/external'] },
  exports: { directory: null, lastDirectory: '/last', recent: ['/last', '/fixed'] },
  defaultProjectsDirectory: '/default',
  defaultExportDirectory: '/videos',
};
beforeEach(() => {
  vi.clearAllMocks();
  bridge.getDirectories.mockReset().mockResolvedValue(initial);
  bridge.chooseDirectory.mockReset().mockResolvedValue(null);
  bridge.selectDirectory.mockReset().mockResolvedValue(initial);
});
afterEach(async () => {
  await setCurrentLocale('en');
});
describe('directory settings control', () => {
  it('uses the neutral searchable shared Select with remembered roots and categorized storage explanation', async () => {
    const wrapper = mount(DirectoryPreference, { props: { kind: 'projects' } });
    await flushPromises();
    const select = wrapper.getComponent(Select);
    expect(select.props('appearance')).toBe('neutral');
    expect(select.props('variant')).toBe('search');
    expect(select.props('options')).toEqual([
      { value: 'automatic', label: 'Default location' },
      { value: '/external', label: '/external' },
    ]);
    expect(wrapper.text()).toContain('projects/studio');
    expect(wrapper.text()).toContain('projects/instant');
    expect(wrapper.text()).toContain('projects/screenshot');
    expect(wrapper.get('.directory-path').attributes('title')).toBe('/default');
    await wrapper.getComponent(Button).get('button').trigger('click');
    expect(bridge.chooseDirectory).toHaveBeenCalledWith('projects');
    select.vm.$emit('update:modelValue', '/external');
    await flushPromises();
    expect(bridge.selectDirectory).toHaveBeenLastCalledWith({ kind: 'projects', directory: '/external' });
    select.vm.$emit('update:modelValue', 7);
    await flushPromises();
    expect(bridge.selectDirectory).toHaveBeenCalledOnce();
  });
  it('shows the last export folder and switches recent or automatic destinations', async () => {
    const wrapper = mount(DirectoryPreference, { props: { kind: 'exports', compact: true } });
    await flushPromises();
    expect(wrapper.find('.directory-description').exists()).toBe(false);
    expect(wrapper.get('.directory-path').text()).toBe('/last');
    const select = wrapper.getComponent(Select);
    expect(select.props('modelValue')).toBe('automatic');
    expect(select.props('options')![0]!).toEqual({ value: 'automatic', label: 'Last used folder' });
    select.vm.$emit('update:modelValue', '/fixed');
    await flushPromises();
    expect(bridge.selectDirectory).toHaveBeenLastCalledWith({ kind: 'exports', directory: '/fixed' });
    select.vm.$emit('update:modelValue', 'automatic');
    await flushPromises();
    expect(bridge.selectDirectory).toHaveBeenLastCalledWith({ kind: 'exports', directory: null });
    await wrapper.setProps({ disabled: true });
    expect(select.props('disabled')).toBe(true);
  });
  it('shows a fixed folder independently of the last directory and exposes its complete path', async () => {
    bridge.getDirectories.mockResolvedValue({ ...initial, exports: { ...initial.exports, directory: '/fixed' } });
    const wrapper = mount(DirectoryPreference, { props: { kind: 'exports' } });
    await flushPromises();
    expect(wrapper.getComponent(Select).props('modelValue')).toBe('/fixed');
    expect(wrapper.get('.directory-path').text()).toBe('/fixed');
  });
  it('uses the real OS export default before any export has completed', async () => {
    bridge.getDirectories.mockResolvedValue({
      ...initial,
      exports: { directory: null, lastDirectory: null, recent: [] },
    });
    const wrapper = mount(DirectoryPreference, { props: { kind: 'exports' } });
    await flushPromises();
    expect(wrapper.get('.directory-path').text()).toBe('/videos');
  });
  it('disables controls during loading and offers retry for a load error', async () => {
    bridge.getDirectories.mockRejectedValueOnce(new Error('Unavailable'));
    const wrapper = mount(DirectoryPreference, { props: { kind: 'projects' } });
    expect(wrapper.getComponent(Select).props('disabled')).toBe(true);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Unavailable');
    expect(wrapper.find('.directory-path').exists()).toBe(false);
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.getComponent(Select).props('disabled')).toBe(false);
  });
  it('shows a save error while preserving the saved folder and does not show a reload button', async () => {
    bridge.chooseDirectory.mockRejectedValueOnce(new Error('Denied'));
    const wrapper = mount(DirectoryPreference, { props: { kind: 'projects' } });
    await flushPromises();
    await wrapper.getComponent(Button).get('button').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Denied');
    expect(wrapper.get('[role="alert"]').find('button').exists()).toBe(false);
    expect(wrapper.get('.directory-path').text()).toBe('/default');
  });
  it('updates its translated choices without replacing actual folder paths', async () => {
    const wrapper = mount(DirectoryPreference, { props: { kind: 'exports' } });
    await flushPromises();
    await setCurrentLocale('fr');
    expect(wrapper.getComponent(Select).props('options')![0]!.label).toBe('Dernier dossier utilisé');
    expect(wrapper.text()).toContain('Dossier d’export');
    expect(wrapper.get('.directory-path').text()).toBe('/last');
  });
  it('composes both independent settings in the shared Recorder/editor section', async () => {
    const wrapper = mount(StoragePreferences);
    await flushPromises();
    expect(wrapper.findAllComponents(DirectoryPreference).map((control) => control.props('kind'))).toEqual([
      'projects',
      'exports',
    ]);
  });
});

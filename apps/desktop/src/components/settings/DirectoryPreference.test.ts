import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrentLocale } from '~/i18n';
import type { DirectorySnapshot } from '~/api/types/storage-directories';
import DirectoryPreference from './DirectoryPreference.vue';
import StoragePreferences from './StoragePreferences.vue';
import Select from '~/ui/select/Select.vue';
import Button from '~/ui/button/Button.vue';
const bridge = vi.hoisted(() => ({
  getDirectories: vi.fn(),
  chooseDirectory: vi.fn(),
  selectDirectory: vi.fn(),
  onPreferencesChanged: vi.fn(() => vi.fn()),
}));
vi.mock('~/api/capture', () => ({ capture: bridge }));
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
  it('keeps recent folders selectable with their path and one browse action in the export dialog', async () => {
    const wrapper = mount(DirectoryPreference, { props: { kind: 'exports', compact: true } });
    await flushPromises();
    expect(wrapper.find('input[readonly]').exists()).toBe(false);
    expect(wrapper.get('.select-trigger').text()).toBe('/last');
    expect(wrapper.getComponent(Select).props('options')).toContainEqual({ value: '/fixed', label: '/fixed' });
    expect(wrapper.findAllComponents(Button)).toHaveLength(1);
    expect(wrapper.getComponent(Button).get('button').attributes('aria-label')).toBe('Choose a folder');
  });
  it('updates the displayed path after the export dialog chooser succeeds', async () => {
    const path = '/home/albi/Téléchargements';
    bridge.chooseDirectory.mockResolvedValue({
      ...initial,
      exports: { ...initial.exports, directory: path, recent: [path] },
    });
    const wrapper = mount(DirectoryPreference, { props: { kind: 'exports', compact: true } });
    await flushPromises();
    await wrapper.getComponent(Button).get('button').trigger('click');
    await flushPromises();
    expect(bridge.chooseDirectory).toHaveBeenCalledWith('exports');
    expect(wrapper.get('.select-trigger').text()).toBe(path);
  });
  it('blocks the export dialog chooser while unavailable and retains the path on cancel', async () => {
    const wrapper = mount(DirectoryPreference, { props: { kind: 'exports', compact: true, disabled: true } });
    await flushPromises();
    expect(wrapper.getComponent(Button).get('button').attributes('disabled')).toBeDefined();
    await wrapper.getComponent(Button).get('button').trigger('click');
    expect(bridge.chooseDirectory).not.toHaveBeenCalled();
    await wrapper.setProps({ disabled: false });
    await wrapper.getComponent(Button).get('button').trigger('click');
    await flushPromises();
    expect(wrapper.get('.select-trigger').text()).toBe('/last');
  });
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
    const wrapper = mount(DirectoryPreference, { props: { kind: 'exports' } });
    await flushPromises();
    expect(wrapper.find('.directory-description').exists()).toBe(true);
    expect(wrapper.get('.select-trigger').text()).toBe('/last');
    expect(wrapper.find('.directory-path').exists()).toBe(false);
    const select = wrapper.getComponent(Select);
    expect(select.props('modelValue')).toBe('automatic');
    expect(select.props('options')).toEqual([
      { value: 'automatic', label: '/last', description: 'Last used folder' },
      { value: '/fixed', label: '/fixed' },
    ]);
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
    expect(wrapper.get('.select-trigger').text()).toBe('/fixed');
    expect(wrapper.get('.select-trigger').attributes('title')).toBe('/fixed');
  });
  it('uses the real OS export default before any export has completed', async () => {
    bridge.getDirectories.mockResolvedValue({
      ...initial,
      exports: { directory: null, lastDirectory: null, recent: [] },
    });
    const wrapper = mount(DirectoryPreference, { props: { kind: 'exports' } });
    await flushPromises();
    expect(wrapper.get('.select-trigger').text()).toBe('/videos');
    expect(wrapper.getComponent(Select).props('disabled')).toBe(false);
  });
  it('opens an empty export history with an explanation and the current OS path', async () => {
    bridge.getDirectories.mockResolvedValue({
      ...initial,
      exports: { directory: null, lastDirectory: null, recent: [] },
      defaultExportDirectory: '/home/albi/Téléchargements',
    });
    const wrapper = mount(DirectoryPreference, {
      props: { kind: 'exports' },
      global: { stubs: { teleport: true } },
    });
    await flushPromises();
    expect(wrapper.get('.select-trigger').text()).toBe('/home/albi/Téléchargements');
    await wrapper.get('.select-trigger').trigger('click');
    await flushPromises();
    expect(wrapper.get('.select-trigger').attributes('aria-expanded')).toBe('true');
    expect(wrapper.get('[role="listbox"] [role="status"]').text()).toBe(
      'Choose a folder to see your recent folders here.',
    );
  });
  it('fills an empty history after browsing and shows the chosen path in the trigger', async () => {
    bridge.getDirectories.mockResolvedValue({
      ...initial,
      exports: { directory: null, lastDirectory: null, recent: [] },
    });
    const folder = '/home/albi/Téléchargements';
    bridge.chooseDirectory.mockResolvedValue({
      ...initial,
      exports: { directory: folder, lastDirectory: null, recent: [folder] },
    });
    const wrapper = mount(DirectoryPreference, { props: { kind: 'exports' } });
    await flushPromises();
    await wrapper.getComponent(Button).get('button').trigger('click');
    await flushPromises();
    expect(bridge.chooseDirectory).toHaveBeenCalledWith('exports');
    expect(wrapper.get('.select-trigger').text()).toBe(folder);
    expect(wrapper.getComponent(Select).props('options')).toContainEqual({ value: folder, label: folder });
  });
  it('preserves the current path and empty history when browsing is canceled', async () => {
    bridge.getDirectories.mockResolvedValue({
      ...initial,
      exports: { directory: null, lastDirectory: '/last', recent: [] },
    });
    const wrapper = mount(DirectoryPreference, { props: { kind: 'exports' } });
    await flushPromises();
    await wrapper.getComponent(Button).get('button').trigger('click');
    await flushPromises();
    expect(wrapper.get('.select-trigger').text()).toBe('/last');
    expect(wrapper.getComponent(Select).props('options')).toEqual([]);
  });
  it('merges a fixed destination matching the automatic path without changing the saved preference', async () => {
    bridge.getDirectories.mockResolvedValue({ ...initial, exports: { ...initial.exports, directory: '/last' } });
    const wrapper = mount(DirectoryPreference, { props: { kind: 'exports' } });
    await flushPromises();
    const select = wrapper.getComponent(Select);
    expect(select.props('options')).toEqual([
      { value: 'automatic', label: '/last', description: 'Last used folder' },
      { value: '/fixed', label: '/fixed' },
    ]);
    expect(select.props('modelValue')).toBe('automatic');
    expect(wrapper.get('.select-trigger').attributes('title')).toBe('/last');
    expect(bridge.selectDirectory).not.toHaveBeenCalled();
    expect(bridge.chooseDirectory).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    'keeps one Downloads row after browsing Images and returning to Downloads (compact: %s)',
    async (compact) => {
      const downloads = '/home/albi/Téléchargements';
      const images = '/home/albi/Images';
      const recent = [images, downloads];
      const current = { ...initial, exports: { directory: null, lastDirectory: downloads, recent } };
      bridge.getDirectories.mockResolvedValue(current);
      bridge.chooseDirectory.mockResolvedValue({ ...current, exports: { ...current.exports, directory: images } });
      const wrapper = mount(DirectoryPreference, { props: { kind: 'exports', compact } });
      await flushPromises();
      await wrapper.getComponent(Button).get('button').trigger('click');
      await flushPromises();
      const select = wrapper.getComponent(Select);
      expect(wrapper.get('.select-trigger').text()).toBe(images);
      expect(select.props('options')).toEqual([
        { value: 'automatic', label: downloads, description: 'Last used folder' },
        { value: images, label: images },
      ]);
      bridge.selectDirectory.mockResolvedValue(current);
      select.vm.$emit('update:modelValue', 'automatic');
      await flushPromises();
      expect(bridge.selectDirectory).toHaveBeenLastCalledWith({ kind: 'exports', directory: null });
      expect(wrapper.get('.select-trigger').text()).toBe(downloads);
      expect(select.props('options')!.filter((option) => option.label === downloads)).toHaveLength(1);
      expect(select.props('options')).toContainEqual({ value: images, label: images });
    },
  );
  it('merges a fixed OS default folder before the first completed export', async () => {
    bridge.getDirectories.mockResolvedValue({
      ...initial,
      exports: { directory: '/videos', lastDirectory: null, recent: ['/videos', '/fixed'] },
    });
    const wrapper = mount(DirectoryPreference, { props: { kind: 'exports' } });
    await flushPromises();
    const select = wrapper.getComponent(Select);
    expect(select.props('modelValue')).toBe('automatic');
    expect(select.props('options')).toEqual([
      { value: 'automatic', label: '/videos', description: 'Last used folder' },
      { value: '/fixed', label: '/fixed' },
    ]);
    expect(wrapper.get('.select-trigger').text()).toBe('/videos');
    bridge.selectDirectory.mockResolvedValue({ ...initial, exports: { ...initial.exports, directory: '/fixed' } });
    select.vm.$emit('update:modelValue', '/fixed');
    await flushPromises();
    expect(wrapper.get('.select-trigger').text()).toBe('/fixed');
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
    expect(wrapper.getComponent(Select).props('options')![0]!).toEqual({
      value: 'automatic',
      label: '/last',
      description: 'Dernier dossier utilisé',
    });
    expect(wrapper.text()).toContain('Dossier d’export');
    expect(wrapper.get('.select-trigger').text()).toBe('/last');
    expect(wrapper.find('.directory-path').exists()).toBe(false);
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

import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrentLocale } from '~/i18n';
import { usePreferencesStore } from '~/stores/preferences';
import { hydrateActionBindings } from '~/shortcuts/action-bindings';
const capture = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  onPreferencesChanged: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));
import ShortcutPreferences from '../settings/ShortcutPreferences.vue';
const settings = () => ({
  schemaVersion: 3,
  theme: 'dark',
  recordingBar: { visibility: 'always' },
  devices: {},
  shortcuts: {},
  backgroundPresets: { colors: [], gradients: [] },
  extras: {},
});
const ShortcutInput = {
  props: ['modelValue', 'error', 'disabled', 'kind', 'customized'],
  emits: ['update:modelValue', 'reset'],
  template: '<div class="binding"><span>{{ modelValue }}</span><small v-if="error">{{ error }}</small></div>',
};
const Input = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<div><slot name="prefix" /><input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /></div>',
};
const Select = {
  props: ['modelValue', 'options'],
  emits: ['update:modelValue'],
  template:
    '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :value="option.value">{{ option.label }}</option></select>',
};
const ConfirmDialog = {
  props: ['isOpen', 'title', 'description', 'confirmLabel', 'cancelLabel', 'busy'],
  emits: ['close', 'confirm'],
  template: `<div v-if="isOpen" class="reassignment" role="dialog">
    <h3>{{ title }}</h3><p>{{ description }}</p><slot />
    <button class="cancel" :disabled="busy" @click="$emit('close')">{{ cancelLabel }}</button>
    <button class="confirm" :disabled="busy" @click="$emit('confirm')">{{ confirmLabel }}</button>
  </div>`,
};
const create = async (focusedSetting?: string) => {
  const wrapper = mount(ShortcutPreferences, {
    props: { focusedSetting },
    global: { stubs: { ShortcutInput, Input, Select, ConfirmDialog } },
  });
  await flushPromises();
  return wrapper;
};
const row = (wrapper: Awaited<ReturnType<typeof create>>, id: string) =>
  wrapper.get(`[data-setting="${id}"]`).getComponent(ShortcutInput);
beforeEach(async () => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  await setCurrentLocale('en');
  capture.getPreferences.mockResolvedValue(settings());
  capture.onPreferencesChanged.mockReturnValue(vi.fn());
  capture.updatePreferences.mockImplementation(async (patch) => ({
    ...settings(),
    shortcuts: { ...usePreferencesStore().settings?.shortcuts, ...patch.shortcuts },
  }));
});
afterEach(() => hydrateActionBindings({}));
describe('searchable application shortcuts', () => {
  it('starts with editing actions and one control per action, without a reset/clear toolbar', async () => {
    const w = await create();
    expect(w.get('select').element.value).toBe('editing');
    expect(w.findAll('.shortcut-row').length).toBeGreaterThan(8);
    expect(row(w, 'editor.selectAll').props('modelValue')).toBe('CommandOrControl+A');
    expect(w.findAll('button')).toHaveLength(0);
    w.unmount();
  });
  it('searches across all categories and displays an empty result state', async () => {
    const w = await create();
    await w.get('input').setValue('Quick Snip');
    expect(w.findAll('.shortcut-row')).toHaveLength(4);
    expect(row(w, 'quickSnip.toggle').props('modelValue')).toBe('Alt+Shift+S');
    expect(w.get('.shortcut-section h3').text()).toBe('Recording · Quick Snip');
    await w.get('input').setValue('zzzzzz');
    expect(w.get('[role="status"]').text()).toContain('No');
    w.unmount();
  });
  it('opens the category of a focused property or gesture and responds to new focus requests', async () => {
    const w = await create('gesture.constrain');
    expect(w.get('select').element.value).toBe('gestures');
    expect(row(w, 'gesture.constrain').props('kind')).toBe('modifier');
    await w.setProps({ focusedSetting: 'setting:CaptionClipPanel.fontSize' });
    expect(w.get('select').element.value).toBe('properties');
    expect(row(w, 'setting:CaptionClipPanel.fontSize').props('kind')).toBe('keyboard');
    w.unmount();
  });
  it('saves only the chosen binding, persists an explicit clear and restores its default', async () => {
    const w = await create();
    const field = row(w, 'editor.selectAll');
    field.vm.$emit('update:modelValue', 'Ctrl+K');
    await flushPromises();
    expect(capture.updatePreferences).toHaveBeenLastCalledWith({
      shortcuts: { 'editor.selectAll': { keys: 'Ctrl+K', scope: 'application', category: 'editing' } },
    });
    expect(field.props('customized')).toBe(true);
    field.vm.$emit('update:modelValue', '');
    await flushPromises();
    expect(field.props('modelValue')).toBe('');
    field.vm.$emit('reset');
    await flushPromises();
    expect(field.props('modelValue')).toBe('CommandOrControl+A');
    field.vm.$emit('update:modelValue', 'CommandOrControl+A');
    await flushPromises();
    expect(capture.updatePreferences).toHaveBeenCalledTimes(3);
    w.unmount();
  });
  it('asks before replacing a shortcut and leaves both assignments unchanged when cancelled', async () => {
    const w = await create();
    const field = row(w, 'editor.selectAll');
    for (const keys of ['Ctrl+C', 'Ctrl+Y', 'Alt+Shift+R']) {
      field.vm.$emit('update:modelValue', keys);
      await flushPromises();
      expect(w.get('[role="dialog"]').text()).toContain('Reassign shortcut?');
      expect(w.get('[role="dialog"]').text()).toContain(keys);
      expect(field.props('modelValue')).toBe('CommandOrControl+A');
      expect(capture.updatePreferences).not.toHaveBeenCalled();
      await w.get('.cancel').trigger('click');
    }
    expect(capture.updatePreferences).not.toHaveBeenCalled();
    field.vm.$emit('update:modelValue', 'Ctrl+K');
    await flushPromises();
    expect(field.props('error')).toBeUndefined();
    w.unmount();
  });
  it('permits deliberate shared drag modifiers and empty global shortcuts', async () => {
    const w = await create('gesture.constrain');
    row(w, 'gesture.constrain').vm.$emit('update:modelValue', 'Alt');
    await flushPromises();
    expect(capture.updatePreferences).toHaveBeenCalledOnce();
    await w.setProps({ focusedSetting: 'quickSnip.toggle' });
    row(w, 'quickSnip.toggle').vm.$emit('update:modelValue', '');
    await flushPromises();
    expect(capture.updatePreferences).toHaveBeenLastCalledWith({
      shortcuts: { 'quickSnip.toggle': { keys: '', scope: 'global', category: 'recording' } },
    });
    w.unmount();
  });
  it('blocks concurrent writes and keeps the previous binding on failure', async () => {
    let reject!: (reason: unknown) => void;
    capture.updatePreferences.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    const w = await create();
    row(w, 'editor.selectAll').vm.$emit('update:modelValue', 'Ctrl+K');
    await flushPromises();
    expect(row(w, 'editor.selectAll').props('disabled')).toBe(true);
    row(w, 'editor.copy').vm.$emit('update:modelValue', 'Ctrl+J');
    await flushPromises();
    expect(capture.updatePreferences).toHaveBeenCalledOnce();
    reject(new Error('Cannot save'));
    await flushPromises();
    expect(row(w, 'editor.selectAll').props('modelValue')).toBe('CommandOrControl+A');
    expect(row(w, 'editor.selectAll').props('error')).toBe('Cannot save');
    expect(row(w, 'editor.selectAll').props('disabled')).toBe(false);
    w.unmount();
  });
  it('reports initial loading failures and reuses already hydrated settings', async () => {
    capture.getPreferences.mockRejectedValueOnce(new Error('Cannot load'));
    const w = await create();
    expect(w.get('[role="alert"]').text()).toContain('Cannot load');
    expect(row(w, 'editor.copy').props('disabled')).toBe(true);
    w.unmount();
    usePreferencesStore().settings = settings() as never;
    const next = await create();
    expect(capture.getPreferences).toHaveBeenCalledOnce();
    expect(row(next, 'editor.copy').props('disabled')).toBe(false);
    next.unmount();
  });
  it('localizes the categories, actions and instructions', async () => {
    await setCurrentLocale('fr');
    const w = await create('gesture.constrain');
    expect(w.text()).toContain('Déplacer en ligne droite');
    expect(w.text()).not.toContain('ActionShortcuts.');
    expect(w.get('select').text()).toContain('Souris et modificateurs');
    w.unmount();
  });
});

it('places search before the category control and separates Quick Snip from Recorder controls', async () => {
  const w = await create('quickSnip.toggle');
  expect(
    w.get('.shortcut-filters input').element.compareDocumentPosition(w.get('.shortcut-filters select').element) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(w.findAll('.shortcut-section h3').map((heading) => heading.text())).toEqual([
    'Quick Snip',
    'Recorder controls',
    'Capture mode',
    'Capture source',
  ]);
  const quickSnip = w.findAll('.shortcut-section')[0]!;
  expect(quickSnip.findAll('.shortcut-row').map((item) => item.attributes('data-setting'))).toEqual([
    'quickSnip.toggle',
    'quickSnip.recordScreen',
    'quickSnip.recordRegion',
    'quickSnip.recordWindow',
  ]);
  expect(quickSnip.find('[data-setting="hud.playPause"]').exists()).toBe(false);
  w.unmount();
});

it.each(['Screen', 'Region', 'Window'])(
  'saves the direct Quick Snip %s action as a global shortcut',
  async (target) => {
    const id = `quickSnip.record${target}`;
    const w = await create(id);
    expect(row(w, id).props('modelValue')).toBe('');
    row(w, id).vm.$emit('update:modelValue', 'Alt+Shift+1');
    await flushPromises();
    expect(capture.updatePreferences).toHaveBeenLastCalledWith({
      shortcuts: { [id]: { keys: 'Alt+Shift+1', scope: 'global', category: 'recording' } },
    });
    w.unmount();
  },
);

it('searches a subcategory across the main categories', async () => {
  const w = await create();
  await w.get('input').setValue('Clipboard');
  expect(w.findAll('.shortcut-row')).toHaveLength(5);
  expect(w.get('.shortcut-section h3').text()).toBe('Editing · Clipboard');
  expect(row(w, 'editor.paste').props('modelValue')).toBe('CommandOrControl+V');
  w.unmount();
});

describe('confirmed shortcut reassignment', () => {
  it('names the affected actions and clears the old binding in the same preference update', async () => {
    const w = await create();
    row(w, 'editor.selectAll').vm.$emit('update:modelValue', 'Ctrl+C');
    await flushPromises();
    expect(w.get('[role="dialog"]').text()).toContain('Copy selection');
    expect(w.get('[role="dialog"]').text()).toContain('Select all');
    expect(capture.updatePreferences).not.toHaveBeenCalled();
    await w.get('.confirm').trigger('click');
    await flushPromises();
    expect(capture.updatePreferences).toHaveBeenCalledExactlyOnceWith({
      shortcuts: {
        'editor.selectAll': { keys: 'Ctrl+C', scope: 'application', category: 'editing' },
        'editor.copy': { keys: '', scope: 'application', category: 'editing' },
      },
    });
    expect(row(w, 'editor.selectAll').props('modelValue')).toBe('Ctrl+C');
    expect(row(w, 'editor.copy').props('modelValue')).toBe('');
    expect(row(w, 'editor.undo').props('modelValue')).toBe('CommandOrControl+Z');
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    w.unmount();
  });
  it('handles global shortcuts and default aliases through the same confirmation', async () => {
    const w = await create();
    row(w, 'editor.selectAll').vm.$emit('update:modelValue', 'Ctrl+Y');
    await flushPromises();
    expect(w.get('[role="dialog"]').text()).toContain('Redo');
    await w.get('.confirm').trigger('click');
    await flushPromises();
    expect(row(w, 'editor.redo').props('modelValue')).toBe('');
    row(w, 'editor.selectAll').vm.$emit('update:modelValue', 'Alt+Shift+R');
    await flushPromises();
    await w.get('.confirm').trigger('click');
    await flushPromises();
    expect(capture.updatePreferences).toHaveBeenLastCalledWith({
      shortcuts: {
        'editor.selectAll': { keys: 'Alt+Shift+R', scope: 'application', category: 'editing' },
        'hud.startStopRecording': { keys: '', scope: 'global', category: 'recording' },
      },
    });
    w.unmount();
  });
  it('asks for confirmation when restoring a default already used by another action', async () => {
    const w = await create();
    row(w, 'editor.copy').vm.$emit('update:modelValue', 'Ctrl+A');
    await flushPromises();
    await w.get('.confirm').trigger('click');
    await flushPromises();
    row(w, 'editor.selectAll').vm.$emit('reset');
    await flushPromises();
    expect(w.get('[role="dialog"]').text()).toContain('Copy selection');
    expect(capture.updatePreferences).toHaveBeenCalledTimes(1);
    await w.get('.confirm').trigger('click');
    await flushPromises();
    expect(row(w, 'editor.selectAll').props('modelValue')).toBe('CommandOrControl+A');
    expect(row(w, 'editor.copy').props('modelValue')).toBe('');
    w.unmount();
  });
  it('keeps the confirmation open after a save failure and supports retry', async () => {
    capture.updatePreferences.mockRejectedValueOnce(new Error('Cannot reassign'));
    const w = await create();
    row(w, 'editor.selectAll').vm.$emit('update:modelValue', 'Ctrl+C');
    await flushPromises();
    await w.get('.confirm').trigger('click');
    await flushPromises();
    expect(w.get('[role="dialog"] [role="alert"]').text()).toBe('Cannot reassign');
    expect(row(w, 'editor.selectAll').props('modelValue')).toBe('CommandOrControl+A');
    expect(row(w, 'editor.copy').props('modelValue')).toBe('CommandOrControl+C');
    await w.get('.confirm').trigger('click');
    await flushPromises();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(row(w, 'editor.selectAll').props('modelValue')).toBe('Ctrl+C');
    w.unmount();
  });
  it('blocks repeated confirmation and other edits while saving', async () => {
    let resolve!: (value: unknown) => void;
    capture.updatePreferences.mockImplementationOnce(() => new Promise((done) => (resolve = done)));
    const w = await create();
    row(w, 'editor.selectAll').vm.$emit('update:modelValue', 'Ctrl+C');
    await flushPromises();
    row(w, 'editor.undo').vm.$emit('update:modelValue', 'Ctrl+K');
    w.getComponent(ConfirmDialog).vm.$emit('confirm');
    await flushPromises();
    expect(w.getComponent(ConfirmDialog).props('busy')).toBe(true);
    w.getComponent(ConfirmDialog).vm.$emit('confirm');
    await flushPromises();
    expect(capture.updatePreferences).toHaveBeenCalledTimes(1);
    resolve({
      ...settings(),
      shortcuts: {
        'editor.selectAll': { keys: 'Ctrl+C', scope: 'application', category: 'editing' },
        'editor.copy': { keys: '', scope: 'application', category: 'editing' },
      },
    });
    await flushPromises();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    w.getComponent(ConfirmDialog).vm.$emit('confirm');
    await flushPromises();
    expect(capture.updatePreferences).toHaveBeenCalledTimes(1);
    w.unmount();
  });
  it('asks again if another action takes the shortcut before confirmation', async () => {
    const w = await create();
    row(w, 'editor.selectAll').vm.$emit('update:modelValue', 'Ctrl+C');
    await flushPromises();
    const store = usePreferencesStore();
    store.settings!.shortcuts['editor.undo'] = { keys: 'Ctrl+C', scope: 'application', category: 'editing' };
    await w.get('.confirm').trigger('click');
    await flushPromises();
    expect(capture.updatePreferences).not.toHaveBeenCalled();
    expect(w.get('[role="dialog"]').text()).toContain('Undo');
    expect(w.get('[role="dialog"]').text()).toContain('Copy selection');
    await w.get('.confirm').trigger('click');
    await flushPromises();
    expect(row(w, 'editor.undo').props('modelValue')).toBe('');
    expect(row(w, 'editor.copy').props('modelValue')).toBe('');
    w.unmount();
  });
  it('preserves a former conflicting action if its shortcut changes while the dialog is open', async () => {
    const w = await create();
    row(w, 'editor.selectAll').vm.$emit('update:modelValue', 'Ctrl+C');
    await flushPromises();
    usePreferencesStore().settings!.shortcuts['editor.copy'] = {
      keys: 'Ctrl+K',
      scope: 'application',
      category: 'editing',
    };
    await w.get('.confirm').trigger('click');
    await flushPromises();
    expect(row(w, 'editor.copy').props('modelValue')).toBe('Ctrl+K');
    expect(capture.updatePreferences).toHaveBeenLastCalledWith({
      shortcuts: { 'editor.selectAll': { keys: 'Ctrl+C', scope: 'application', category: 'editing' } },
    });
    w.unmount();
  });
  it('translates the confirmation and buttons in French', async () => {
    await setCurrentLocale('fr');
    const w = await create();
    row(w, 'editor.selectAll').vm.$emit('update:modelValue', 'Ctrl+C');
    await flushPromises();
    expect(w.get('[role="dialog"]').text()).toContain('Réattribuer ce raccourci');
    expect(w.get('.confirm').text()).toBe('Réattribuer');
    expect(w.get('.cancel').text()).toBe('Annuler');
    expect(w.text()).not.toContain('ActionShortcuts.');
    w.unmount();
  });
});

it('changes shortcut categories directly and keeps their search icon visible', async () => {
  const w = await create();
  await w.get('select').setValue('tools');
  expect(w.find('[data-setting="insert:text"]').exists()).toBe(true);
  expect(w.find('[data-setting="editor.selectAll"]').exists()).toBe(false);
  expect(w.find('svg').exists()).toBe(true);
  w.unmount();
});

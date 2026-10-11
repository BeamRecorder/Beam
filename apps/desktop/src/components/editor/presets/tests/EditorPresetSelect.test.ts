import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { describe, expect, it } from 'vitest';
import EditorPresetSelect from '../EditorPresetSelect.vue';
import { previewDocument } from './preset-preview-fixtures';

const Select = defineComponent({
  name: 'Select',
  props: ['options', 'modelValue', 'disabled', 'optionHeight', 'size', 'label'],
  emits: ['update:modelValue', 'toggle'],
  template:
    '<div><slot name="icon" /><slot name="preview" /><div v-for="option in options" :key="option.value"><slot name="option" :option="option" /></div></div>',
});
const Preview = defineComponent({
  name: 'EditorPresetPreview',
  props: ['settings', 'kind', 'source'],
  template: '<span class="preview-stub" />',
});
const mountSelect = (props = {}) =>
  mount(EditorPresetSelect, {
    props: { document: previewDocument(), ...props },
    global: { stubs: { Select, EditorPresetPreview: Preview } },
  });

describe('shared preset selector', () => {
  it('previews both the selected preset and every menu option without applying anything', () => {
    const wrapper = mountSelect({ kind: 'screenshot', source: 'project-media://capture.png' });
    expect(wrapper.findAllComponents(Preview)).toHaveLength(3);
    for (const preview of wrapper.findAllComponents(Preview))
      expect(preview.props()).toMatchObject({ kind: 'screenshot', source: 'project-media://capture.png' });
    expect(wrapper.findAllComponents(Preview)[2]!.props('settings')).toEqual(previewDocument().presets[1]!.settings);
    expect(wrapper.emitted('select')).toBeUndefined();
    wrapper.unmount();
  });
  it('updates the selected preview when preset selection or saved settings change', async () => {
    const wrapper = mountSelect();
    const document = previewDocument();
    document.activePresetId = 'red';
    await wrapper.setProps({ document });
    expect(wrapper.findComponent(Preview).props('settings')).toEqual(document.presets[1]!.settings);
    expect(wrapper.getComponent(Select).props('modelValue')).toBe('red');
    wrapper.unmount();
  });
  it('keeps compact thumbnails and rows inside the HUD menu and forwards toggle and commit', async () => {
    const wrapper = mountSelect({ compact: true, label: 'Preset' });
    const select = wrapper.getComponent(Select);
    expect(select.props()).toMatchObject({ size: 'compact', optionHeight: 54, label: 'Preset' });
    expect(wrapper.findAll('.compact-preview')).toHaveLength(2);
    select.vm.$emit('toggle', true);
    select.vm.$emit('update:modelValue', 'red');
    expect(wrapper.emitted('toggle')).toEqual([[true]]);
    expect(wrapper.emitted('select')).toEqual([['red']]);
    wrapper.unmount();
  });
  it('shows an empty disabled selector for missing presets and disables supplied documents on request', async () => {
    const wrapper = mountSelect({ document: null });
    const select = wrapper.getComponent(Select);
    expect(select.props()).toMatchObject({
      disabled: true,
      options: [],
      modelValue: null,
      size: 'sm',
      label: 'Select editor preset',
    });
    expect(wrapper.findComponent(Preview).exists()).toBe(false);
    await wrapper.setProps({ document: previewDocument(), disabled: true });
    expect(select.props('disabled')).toBe(true);
    wrapper.unmount();
  });
  it('omits the selected thumbnail for an unknown active id and forwards an optional icon', () => {
    const document = previewDocument();
    document.activePresetId = 'missing';
    const wrapper = mount(EditorPresetSelect, {
      props: { document },
      slots: { icon: '<span class="preset-icon" />' },
      global: { stubs: { Select, EditorPresetPreview: Preview } },
    });
    expect(wrapper.find('.trigger-preview').exists()).toBe(false);
    expect(wrapper.find('.preset-icon').exists()).toBe(true);
    wrapper.unmount();
  });
});

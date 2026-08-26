import { mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref, watch } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorPresetDocument } from '~/api/types/editor-preset';
import EditorPresetControls from '../EditorPresetControls.vue';

const ButtonStub = {
  inheritAttrs: false,
  props: { disabled: Boolean, tooltip: { type: String, default: '' } },
  emits: ['click'],
  template:
    '<button v-bind="$attrs" :disabled="disabled" :aria-label="$attrs[\'aria-label\'] || tooltip" @click="$emit(\'click\', $event)"><slot /></button>',
};
const SelectStub = {
  inheritAttrs: false,
  props: { modelValue: { type: [String, Number], default: null }, options: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  template:
    '<select v-bind="$attrs" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select>',
};
const TextInputDialogStub = defineComponent({
  name: 'TextInputDialog',
  props: {
    isOpen: Boolean,
    title: { type: String, default: '' },
    initialValue: { type: String, default: '' },
    confirmLabel: { type: String, default: 'Save' },
    validate: { type: Function, default: undefined },
  },
  emits: ['close', 'confirm'],
  setup(props, { emit }) {
    const value = ref(props.initialValue);
    watch(
      () => props.initialValue,
      (nextValue) => {
        value.value = nextValue;
      },
    );
    return {
      value,
      confirm: () => emit('confirm', value.value.trim()),
    };
  },
  template: `
    <div v-if="isOpen" class="text-input-dialog-stub" role="dialog" :data-title="title">
      <input class="name-input" v-model="value" />
      <button class="dialog-cancel" type="button" @click="$emit('close')">Cancel</button>
      <button class="dialog-confirm" type="button" @click="confirm">{{ confirmLabel }}</button>
    </div>
  `,
});
const ConfirmDialogStub = defineComponent({
  name: 'ConfirmDialog',
  props: {
    isOpen: Boolean,
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    confirmLabel: { type: String, default: 'Confirm' },
    cancelLabel: { type: String, default: 'Cancel' },
    destructive: Boolean,
    busy: Boolean,
  },
  emits: ['close', 'confirm'],
  template: `
    <div v-if="isOpen" class="confirm-dialog-stub" role="dialog" :data-title="title">
      <p class="confirm-description">{{ description }}</p>
      <button class="confirm-cancel" type="button" :disabled="busy" @click="$emit('close')">{{ cancelLabel }}</button>
      <button class="confirm-confirm" type="button" :disabled="busy" @click="$emit('confirm')">{{ confirmLabel }}</button>
    </div>
  `,
});

const presetDocument = (activePresetId = 'default'): EditorPresetDocument => ({
  schemaVersion: 1,
  activePresetId,
  presets: [
    {
      id: 'default',
      name: 'Default',
      protected: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
      settings: {
        editor: { schemaVersion: 1 },
        devices: {},
        export: { format: 'mp4' },
        quickSnip: { automaticZoom: true },
      },
    },
    {
      id: 'named',
      name: 'Named',
      protected: false,
      updatedAt: '2026-01-01T00:00:00.000Z',
      settings: {
        editor: { schemaVersion: 1 },
        devices: {},
        export: { format: 'webm' },
        quickSnip: { automaticZoom: false },
      },
    },
  ],
});

const mountControls = (presetDoc = presetDocument(), dirty = false) =>
  (() => {
    const wrapper = mount(EditorPresetControls, {
      attachTo: document.body,
      props: { document: presetDoc, dirty },
      global: {
        stubs: {
          Button: ButtonStub,
          Select: SelectStub,
          TextInputDialog: TextInputDialogStub,
          ConfirmDialog: ConfirmDialogStub,
        },
      },
    });
    mountedWrappers.push(wrapper);
    return wrapper;
  })();

const mountedWrappers: Array<{ unmount: () => void }> = [];

const action = (name: string, root: ParentNode = document.body) =>
  root.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
});

describe('EditorPresetControls', () => {
  it('keeps the preset selector stable and groups actions by hierarchy', async () => {
    const wrapper = mountControls(presetDocument('named'), true);

    expect(wrapper.find('.dirty-dot').exists()).toBe(true);
    expect(wrapper.findAll('button')).toHaveLength(1);
    const trigger = wrapper.get('button[aria-label="Editor preset"]');
    for (const name of ['Add preset', 'Rename preset', 'Delete preset', 'Save preset']) {
      expect(action(name)).toBeNull();
    }

    await trigger.trigger('click');
    await nextTick();

    const popover = document.body.querySelector<HTMLElement>('.preset-popover');
    expect(popover).not.toBeNull();
    const header = popover?.querySelector('header');
    expect(header?.querySelector('button[aria-label="Add preset"]')).not.toBeNull();
    const select = popover?.querySelector<HTMLSelectElement>('select[aria-label="Select editor preset"]');
    expect(select).not.toBeNull();
    select!.value = 'named';
    select!.dispatchEvent(new Event('change'));
    await nextTick();
    expect(wrapper.emitted('select')).toEqual([['named']]);

    const footer = popover?.querySelector('footer');
    expect(footer).not.toBeNull();
    const footerGroups = [...(footer?.children ?? [])];
    expect(footerGroups).toHaveLength(2);
    expect(action('Rename preset', footerGroups[0]!)).not.toBeNull();
    expect(action('Delete preset', footerGroups[0]!)).not.toBeNull();
    expect(action('Save preset', footer!)).not.toBeNull();
    expect(action('Save preset', footer!)?.disabled).toBe(false);

    action('Save preset', footer!)?.click();
    expect(wrapper.emitted('save')).toHaveLength(1);
  });

  it('opens New and Rename dialogs, trims confirmed names, and supports cancel', async () => {
    const wrapper = mountControls(presetDocument('named'), false);
    await wrapper.get('button[aria-label="Editor preset"]').trigger('click');
    await nextTick();

    const popover = document.body.querySelector<HTMLElement>('.preset-popover')!;
    action('Add preset', popover)?.click();
    await nextTick();
    expect(document.body.querySelector('.preset-popover')).toBeNull();
    const nameDialog = wrapper.findComponent(TextInputDialogStub);
    expect(nameDialog.props('title')).toBe('New preset');
    let dialog = document.body.querySelector<HTMLElement>('.text-input-dialog-stub');
    const input = dialog?.querySelector<HTMLInputElement>('.name-input');
    expect(input?.value).toBe('');
    input!.value = '  New Name  ';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    dialog?.querySelector<HTMLButtonElement>('.dialog-confirm')?.click();
    await nextTick();
    expect(wrapper.emitted('add')).toEqual([['New Name']]);
    expect(document.body.querySelector('.text-input-dialog-stub')).toBeNull();

    await wrapper.get('button[aria-label="Editor preset"]').trigger('click');
    await nextTick();
    const reopenedPopover = document.body.querySelector<HTMLElement>('.preset-popover')!;
    action('Rename preset', reopenedPopover)?.click();
    await nextTick();
    expect(document.body.querySelector('.preset-popover')).toBeNull();
    dialog = document.body.querySelector<HTMLElement>('.text-input-dialog-stub');
    expect(nameDialog.props('title')).toBe('Rename preset');
    expect(dialog?.querySelector<HTMLInputElement>('.name-input')?.value).toBe('Named');
    dialog?.querySelector<HTMLButtonElement>('.dialog-cancel')?.click();
    await nextTick();
    expect(wrapper.emitted('rename')).toBeUndefined();
    expect(document.body.querySelector('.text-input-dialog-stub')).toBeNull();
  });

  it('closes the popover before opening the delete confirmation and only emits after confirmation', async () => {
    const wrapper = mountControls(presetDocument('named'), false);
    await wrapper.get('button[aria-label="Editor preset"]').trigger('click');
    await nextTick();

    const popover = document.body.querySelector<HTMLElement>('.preset-popover')!;
    action('Delete preset', popover)?.click();
    await nextTick();

    expect(document.body.querySelector('.preset-popover')).toBeNull();
    expect(document.body.querySelector('.confirm-dialog-stub')).not.toBeNull();
    expect(wrapper.emitted('delete')).toBeUndefined();

    document.body.querySelector<HTMLButtonElement>('.confirm-cancel')?.click();
    await nextTick();
    expect(wrapper.emitted('delete')).toBeUndefined();
    expect(document.body.querySelector('.confirm-dialog-stub')).toBeNull();

    await wrapper.get('button[aria-label="Editor preset"]').trigger('click');
    await nextTick();
    action('Delete preset', document.body.querySelector<HTMLElement>('.preset-popover')!)?.click();
    await nextTick();
    document.body.querySelector<HTMLButtonElement>('.confirm-confirm')?.click();
    await nextTick();

    expect(wrapper.emitted('delete')).toHaveLength(1);
    expect(document.body.querySelector('.confirm-dialog-stub')).toBeNull();
  });

  it('validates empty and duplicate names in the name dialog without using window.prompt', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockImplementation(() => {
      throw new Error('Editor preset dialogs must not use window.prompt.');
    });
    const wrapper = mountControls(presetDocument('named'), false);
    await wrapper.get('button[aria-label="Editor preset"]').trigger('click');
    await nextTick();
    const popover = document.body.querySelector<HTMLElement>('.preset-popover')!;
    action('Add preset', popover)?.click();
    await nextTick();

    const dialog = wrapper.findComponent(TextInputDialogStub);
    const validate = dialog.props('validate') as (value: string) => string | null;
    expect(validate('Named')).toContain('already exists');
    expect(validate('Fresh preset')).toBeNull();
    const input = document.body.querySelector<HTMLInputElement>('.name-input')!;
    input.value = '   ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.body.querySelector<HTMLButtonElement>('.dialog-confirm')?.click();
    await nextTick();
    expect(wrapper.emitted('add')).toBeUndefined();
    expect(document.body.querySelector('.text-input-dialog-stub')).not.toBeNull();
    expect(prompt).not.toHaveBeenCalled();
    prompt.mockRestore();
  });

  it('disables rename and delete for Default while keeping them available for named presets', async () => {
    const wrapper = mountControls(presetDocument(), true);
    await wrapper.get('button[aria-label="Editor preset"]').trigger('click');
    await nextTick();

    const popover = document.body.querySelector<HTMLElement>('.preset-popover')!;
    expect(action('Rename preset', popover)?.disabled).toBe(true);
    expect(action('Delete preset', popover)?.disabled).toBe(true);
    action('Delete preset', popover)?.click();
    await nextTick();
    expect(document.body.querySelector('.confirm-dialog-stub')).toBeNull();
    expect(wrapper.emitted('delete')).toBeUndefined();

    await wrapper.setProps({ document: presetDocument('named'), dirty: false });
    await nextTick();

    expect(wrapper.find('.dirty-dot').exists()).toBe(false);
    expect(action('Rename preset', popover)?.disabled).toBe(false);
    expect(action('Delete preset', popover)?.disabled).toBe(false);
    expect(action('Save preset', popover)?.disabled).toBe(true);
  });
});

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, enableAutoUnmount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h, ref } from 'vue';
import ElementAssets from '../ElementAssets.vue';
import ShapePicker from '../ShapePicker.vue';
import ArrowPicker from '../ArrowPicker.vue';
import Button from '~/ui/button/Button.vue';
import { useElementAssets } from '../useElementAssets';
import { provideElementEditor } from '../useElementEditor';
import { usePreferencesStore } from '~/stores/preferences';
import { useToastStore } from '~/ui/toast/toastStore';
import { shape } from '@beam/runtime/composition/shape/tests/gpu-shape.fixtures';
import { saveElementAsset, ELEMENT_ASSETS_KEY } from '@beam/engine/shared/element-assets';
import type { ShapeClip } from '@beam/engine/shared/composition-types';

const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock('~/api/capture', () => ({
  capture: { getPreferences: api.get, updatePreferences: api.update, onPreferencesChanged: () => () => {} },
}));
enableAutoUnmount(afterEach);
beforeEach(() => {
  setActivePinia(createPinia());
  api.get.mockReset();
  api.update.mockReset();
  api.get.mockResolvedValue({ schemaVersion: 3, shortcuts: {}, extras: {} });
  api.update.mockImplementation(async (patch) => ({ schemaVersion: 3, shortcuts: {}, extras: patch.extras }));
});
const asset = () =>
  saveElementAsset(shape({ name: 'Custom bubble', preset: 'speech-bubble' }), { width: 1920, height: 1080 });
const create = (selected = true, family: 'shape' | 'arrow' = 'arrow') => {
  const source = shape({
    name: family === 'shape' ? 'Custom bubble' : 'Custom arrow',
    family,
    preset: family === 'shape' ? 'speech-bubble' : 'arrow',
  });
  const clips = ref<ShapeClip[]>([source]),
    id = ref<string | null>(selected ? source.id : null),
    disabled = ref(false),
    insert = vi.fn();
  let editor!: ReturnType<typeof provideElementEditor>;
  const wrapper = mount(
    defineComponent({
      setup() {
        editor = provideElementEditor({
          layers: () => clips.value,
          selectedId: () => id.value,
          select: (next) => {
            id.value = next;
          },
          insert,
          update: () => {},
          remove: () => {},
          timing: () => ({ startMs: 5000, durationMs: 1000 }),
          canvasSize: () => ({ width: 1080, height: 1920 }),
        });
        return () =>
          family === 'shape'
            ? h(ShapePicker, { modelValue: 'speech-bubble', disabled: disabled.value })
            : h(ArrowPicker, { disabled: disabled.value });
      },
    }),
    {
      attachTo: document.body,
      global: {
        stubs: {
          ShapeTimelinePreview: {
            name: 'ShapeTimelinePreview',
            props: ['clip', 'canvas', 'presentation'],
            template: '<span class="saved-artwork-preview" />',
          },
        },
      },
    },
  );
  return { wrapper, source, editor, disabled, insert };
};
const open = async (wrapper: ReturnType<typeof create>['wrapper']) => {
  await wrapper.get('button').trigger('click');
  await flushPromises();
  document.querySelector<HTMLButtonElement>('button[aria-label="Saved elements"]')!.click();
  await flushPromises();
};
const save = async () => {
  document.querySelector<HTMLButtonElement>('button[aria-label="Save selected element"]')!.click();
  await flushPromises();
};

it('shares persisted assets across projects, serializes changes and synchronizes external preferences', async () => {
  const store = useElementAssets(),
    first = asset(),
    second = asset();
  await Promise.all([store.add(first), store.add(second)]);
  expect(store.assets).toHaveLength(2);
  await store.remove(first.id);
  expect(store.assets.map((item) => item.id)).toEqual([second.id]);
  usePreferencesStore().settings!.extras[ELEMENT_ASSETS_KEY] = [first];
  expect(store.assets[0]!.id).toBe(first.id);
  api.get.mockResolvedValue({ schemaVersion: 3, shortcuts: {}, extras: { [ELEMENT_ASSETS_KEY]: [first] } });
  setActivePinia(createPinia());
  const next = useElementAssets();
  await next.load();
  expect(next.assets).toEqual([first]);
});
it('rejects invalid assets and preserves persisted data when a write fails', async () => {
  const store = useElementAssets(),
    first = asset();
  await expect(store.add({ ...first, name: '' })).rejects.toThrow();
  api.update.mockRejectedValueOnce(new Error('Disk full'));
  await expect(store.add(first)).rejects.toThrow('Disk full');
  expect(store.assets).toEqual([]);
  await store.add(first);
  expect(store.assets).toHaveLength(1);
  expect(store.busy).toBe(false);
});
it.each(['shape', 'arrow'] as const)(
  'keeps the %s library entirely inside the picker with only add and direct delete',
  async (family) => {
    const { wrapper, source } = create(true, family);
    expect(wrapper.findComponent(ElementAssets).exists()).toBe(false);
    expect(document.querySelector('.asset-library')).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(document.querySelector('button[aria-label="Saved elements"]')).not.toBeNull();
    expect(document.querySelector('.asset-library')).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
    document.querySelector<HTMLButtonElement>('button[aria-label="Saved elements"]')!.click();
    await flushPromises();
    await save();
    expect(useElementAssets().assets[0]!.name).toBe(source.name);
    const preview = wrapper.findComponent({ name: 'ShapeTimelinePreview' });
    expect(preview.props('clip')).toMatchObject({ family, preset: source.preset, fillColor: source.fillColor });
    expect(preview.props('canvas')).toEqual({ width: 1080, height: 1920 });
    expect(preview.props('presentation')).toBe('thumbnail');
    expect(document.querySelector('.asset-row .menu-button')).toBeNull();
    document.querySelector<HTMLButtonElement>('.asset-row button[aria-label^="Remove saved element"]')!.click();
    await flushPromises();
    expect(useElementAssets().assets).toEqual([]);
    expect(source.name).toBe(family === 'shape' ? 'Custom bubble' : 'Custom arrow');
  },
);
it('filters each library by family and inserts a new copy while closing both popovers', async () => {
  const first = create();
  await open(first.wrapper);
  await save();
  await useElementAssets().add(asset());
  expect([...document.querySelectorAll('.asset-row')].map((row) => row.textContent?.trim())).toEqual(['Custom arrow']);
  await first.wrapper.get('button').trigger('click');
  await flushPromises();
  const second = create(false);
  await open(second.wrapper);
  document.querySelector<HTMLButtonElement>('.asset-row button')!.click();
  await flushPromises();
  expect(second.insert).toHaveBeenCalledOnce();
  expect(second.insert.mock.calls[0]![0]).toMatchObject({ name: 'Custom arrow', timelineStartMs: 5000 });
  expect(second.insert.mock.calls[0]![0].id).not.toBe(first.source.id);
  expect(document.querySelector('.asset-library')).toBeNull();
  expect(document.querySelector('.arrow-picker')).toBeNull();
});
it('disables add without a matching selection and captures an active text draft', async () => {
  const empty = create(false);
  await open(empty.wrapper);
  expect(document.querySelector<HTMLButtonElement>('button[aria-label="Save selected element"]')!.disabled).toBe(true);
  empty.wrapper
    .findComponent(ElementAssets)
    .findAllComponents(Button)
    .find((button) => button.vm.$attrs['aria-label'] === 'Save selected element')!
    .vm.$emit('click');
  await flushPromises();
  expect(api.update).not.toHaveBeenCalled();
  await empty.wrapper.get('button').trigger('click');
  await flushPromises();
  const next = create();
  next.editor.beginText(next.source.id);
  next.editor.updateText('Edited caption');
  await open(next.wrapper);
  await save();
  expect(useElementAssets().assets[0]!.style.text?.content).toBe('Edited caption');
  next.disabled.value = true;
  await flushPromises();
});
it('reports load/write errors and retains the library on failure', async () => {
  api.get.mockRejectedValueOnce(new Error('Offline storage'));
  const { wrapper } = create();
  await open(wrapper);
  expect(useToastStore().toasts.at(-1)?.message).toContain('Offline storage');
  api.update.mockRejectedValueOnce(new Error('Read only'));
  await save();
  expect(useToastStore().toasts.at(-1)?.message).toContain('Read only');
  expect(useElementAssets().assets).toEqual([]);
  api.update.mockRejectedValueOnce('Storage unavailable');
  await save();
  expect(useToastStore().toasts.at(-1)?.message).toBeTruthy();
});

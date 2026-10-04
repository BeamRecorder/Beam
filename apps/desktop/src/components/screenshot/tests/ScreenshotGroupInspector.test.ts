import { mount } from '@vue/test-utils';
import { afterEach, it, expect } from 'vitest';
import { ref, shallowRef } from 'vue';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotGroupInspectorProps } from '../screenshot-group-inspector-types';
import { createStillDocument } from '@beam/engine/screenshot/still-document';
import { createStillCommands } from '@beam/engine/screenshot/still-commands';
import { DEFAULT_SHAPE_LAYER_STYLE } from '@beam/engine/shared/shape-layer-style';
import ScreenshotGroupInspector from '../ScreenshotGroupInspector.vue';
import TransformControls from '../../editor/properties/shared/TransformControls.vue';
import MediaOrientationControls from '../../editor/properties/shared/MediaOrientationControls.vue';

const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));
function setup() {
  let doc = createStillDocument('group', 'image.png', 1920, 1080);
  const registry = createStillCommands();
  for (const id of ['a', 'b'])
    doc = registry.execute(doc, {
      type: 'still.layer.add',
      payload: {
        ...doc.state.image,
        ...DEFAULT_SHAPE_LAYER_STYLE,
        id,
        assetId: '',
        kind: 'shape',
        transform: { x: id === 'a' ? 0.1 : 0.3, y: 0.2, width: 0.1, height: 0.1 },
      },
    });
  const state = shallowRef<ScreenshotState | null>(doc.state),
    selectedIds = ref(['a', 'b']),
    busy = ref(false),
    cropping = ref(false);
  const editor = { state, selectedIds, busy, cropping } as unknown as ScreenshotGroupInspectorProps['editor'];
  const wrapper = mount(ScreenshotGroupInspector, {
    props: { editor, bounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 } },
    global: {
      stubs: {
        RafRevealTransition: { template: '<slot />' },
        TransformControls: true,
        MediaOrientationControls: true,
      },
    },
  });
  wrappers.push(wrapper);
  return { wrapper, state, selectedIds, busy, cropping };
}
it('opens the neutral Placement accordion and forwards shared placement and rotation changes', async () => {
  const { wrapper, state } = setup();
  expect(wrapper.get('.accordion-inspector').classes()).toContain('is-open');
  expect(wrapper.get('[data-screenshot-group-inspector]').attributes('disabled')).toBeUndefined();
  wrapper.getComponent(TransformControls).vm.$emit('update:modelValue', { x: 0.2, y: 0.4, width: 0.6, height: 0.2 });
  expect(state.value!.shapes[0]!.transform.width).toBeCloseTo(0.2);
  await wrapper.setProps({ bounds: { x: 0.2, y: 0.4, width: 0.6, height: 0.2 } });
  expect(wrapper.getComponent(MediaOrientationControls).props('showMirroring')).toBe(false);
  wrapper.getComponent(MediaOrientationControls).vm.$emit('update:rotation', 90);
  expect(state.value!.shapes.map((layer) => layer.rotation)).toEqual([90, 90]);
  await wrapper.get('.accordion-trigger').trigger('click');
  expect(wrapper.get('.accordion-inspector').classes()).not.toContain('is-open');
});
it('disables controls for busy, cropping and locked members', async () => {
  const { wrapper, state, busy, cropping } = setup();
  busy.value = true;
  await wrapper.vm.$nextTick();
  expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined();
  busy.value = false;
  cropping.value = true;
  await wrapper.vm.$nextTick();
  expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined();
  cropping.value = false;
  state.value = {
    ...state.value!,
    composition: state.value!.composition!.map((layer) => (layer.id === 'b' ? { ...layer, locked: true } : layer)),
  };
  await wrapper.vm.$nextTick();
  expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined();
});
it('retains a disabled section while bounds or the document are unavailable', async () => {
  const { wrapper, state } = setup();
  await wrapper.setProps({ bounds: null });
  expect(wrapper.findComponent(TransformControls).exists()).toBe(false);
  expect(wrapper.findComponent(MediaOrientationControls).exists()).toBe(false);
  state.value = null;
  await wrapper.setProps({ bounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 } });
  expect(wrapper.findComponent(TransformControls).exists()).toBe(false);
});

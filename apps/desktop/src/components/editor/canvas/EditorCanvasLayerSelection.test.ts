import { enableAutoUnmount, mount } from '@vue/test-utils';
import { ref } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import type { TransformClip } from './editor-canvas-types';
import type { useLayerTransformAndCrop } from './composables/useLayerTransformAndCrop';
import EditorCanvasLayerSelection from './EditorCanvasLayerSelection.vue';
import CanvasLayerSelection from './CanvasLayerSelection.vue';
enableAutoUnmount(afterEach);
const interaction = () => ({
  transformHandleStyle: ref({ left: '12px' }),
  transformSelectionViewportStyle: ref({ width: '100px' }),
  transformResizeCorners: ref(['top-left', 'bottom-right']),
  transformHandlePositions: ref(undefined),
  transformPerspectiveCorners: ref(null),
  moveTransformDrag: vi.fn(),
  endTransformDrag: vi.fn(),
  beginTransformDrag: vi.fn(),
});
const create = (kind = 'image', patch = {}) => {
  const state = interaction();
  return {
    state,
    wrapper: mount(EditorCanvasLayerSelection, {
      props: {
        clip: { id: 'clip', kind, rotation: 32.75, caption: { type: 'text' }, ...patch } as TransformClip,
        editingId: null,
        rotateLabel: 'Rotate layer',
        interaction: state as unknown as ReturnType<typeof useLayerTransformAndCrop>,
      },
      global: { stubs: { CanvasLayerSelection: true } },
    }),
  };
};
it.each(['image', 'video', 'screen', 'webcam', 'caption', 'shape'])(
  'exposes the precise %s rotation handle and transformed outline',
  (kind) => {
    const { wrapper } = create(kind);
    const selection = wrapper.getComponent(CanvasLayerSelection);
    expect(selection.props('rotatable')).toBe(true);
    expect(selection.props('rotation')).toBe(32.75);
    expect(selection.props('handleStyle')).toEqual({ left: '12px', transform: 'rotate(32.75deg)' });
  },
);
it('keeps unrotated legacy media readable and disables unsupported effect rotation', () => {
  const legacy = create('image', { rotation: undefined });
  expect(legacy.wrapper.getComponent(CanvasLayerSelection).props('rotation')).toBe(0);
  const effect = create('blur');
  expect(effect.wrapper.getComponent(CanvasLayerSelection).props('rotatable')).toBe(false);
});
it('preserves projected corners and suppresses planar rotation under perspective', async () => {
  const { wrapper, state } = create();
  state.transformPerspectiveCorners.value = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ] as unknown as null;
  await wrapper.vm.$nextTick();
  expect(wrapper.getComponent(CanvasLayerSelection).props('rotatable')).toBe(false);
  expect(wrapper.getComponent(CanvasLayerSelection).props('handleStyle')).toEqual({ left: '12px' });
});
it('hides handles during crop, manual zoom, inline text editing and cursor-following captions', async () => {
  const { wrapper } = create();
  for (const prop of ['cropping', 'manualZoom'] as const) {
    await wrapper.setProps({ [prop]: true });
    expect(wrapper.findComponent(CanvasLayerSelection).exists()).toBe(false);
    await wrapper.setProps({ [prop]: false });
  }
  await wrapper.setProps({ editingId: 'clip' });
  expect(wrapper.findComponent(CanvasLayerSelection).exists()).toBe(false);
  await wrapper.setProps({
    editingId: null,
    clip: { id: 'clip', kind: 'caption', caption: { type: 'keyboard', followCursor: true } } as TransformClip,
  });
  expect(wrapper.findComponent(CanvasLayerSelection).exists()).toBe(false);
  await wrapper.setProps({ clip: null });
  expect(wrapper.findComponent(CanvasLayerSelection).exists()).toBe(false);
});
it('relays rotation preview and commit separately and retains resize gesture routing', () => {
  const { wrapper, state } = create();
  const selection = wrapper.getComponent(CanvasLayerSelection);
  const event = { pointerId: 1 } as PointerEvent;
  selection.vm.$emit('rotate', 14.5);
  selection.vm.$emit('rotate-end', 14.5);
  selection.vm.$emit('pointer-down', event);
  expect(wrapper.emitted('rotate')).toEqual([[14.5]]);
  expect(wrapper.emitted('rotate-end')).toEqual([[14.5]]);
  expect(wrapper.emitted('pointer-down')).toEqual([[event]]);
  selection.vm.$emit('resize-start', 'top-left', event);
  expect(state.beginTransformDrag).toHaveBeenCalledWith(event, 'resize', 'top-left');
  for (const name of ['pointer-move', 'resize-move']) selection.vm.$emit(name, event);
  expect(state.moveTransformDrag).toHaveBeenCalledTimes(2);
  for (const name of ['pointer-up', 'resize-end']) selection.vm.$emit(name, event);
  expect(state.endTransformDrag).toHaveBeenCalledTimes(2);
});

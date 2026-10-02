import { mount, enableAutoUnmount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ElementClipControls from '../ElementClipControls.vue';
import { provideElementEditor } from '../useElementEditor';
import { normalizeShapeLayerStyle } from '@beam/engine/shared/shape-layer-style';
import type { ShapeClip } from '@beam/engine/shared/composition-types';
import type { ElementEditorContext } from '../element-editor-types';
vi.mock('~/api/capture', () => ({ capture: {} }));
enableAutoUnmount(afterEach);
const shape: ShapeClip = {
  ...normalizeShapeLayerStyle({ family: 'shape' }),
  kind: 'shape',
  id: 'shape',
  assetId: '',
  name: 'Shape',
  transform: { x: 0, y: 0, width: 1, height: 1 },
  enabled: true,
  order: 0,
  timelineStartMs: 0,
  timelineDurationMs: 1000,
  sourceInMs: 0,
  sourceDurationMs: 1000,
  playbackRate: 1,
};
const fixture = (showProperties = true, selected = true) => {
  let editor!: ElementEditorContext;
  const wrapper = mount(
    defineComponent({
      setup() {
        editor = provideElementEditor({
          layers: () => [shape],
          selectedId: () => (selected ? 'shape' : null),
          select: () => {},
          insert: () => {},
          update: () => {},
          remove: () => {},
          timing: () => ({ startMs: 0, durationMs: 1000 }),
          canInteract: () => true,
        });
        return () => h(ElementClipControls, { showProperties });
      },
    }),
    { global: { stubs: { ShapeLayerPropertiesPanel: true, DrawingControls: true } } },
  );
  return { wrapper, editor };
};
describe('Clip annotation controls', () => {
  it('shows selected shape properties with no Add buttons', () => {
    const f = fixture();
    expect(f.wrapper.findComponent({ name: 'ShapeLayerPropertiesPanel' }).props('clip')).toMatchObject({ id: 'shape' });
    expect(f.wrapper.find('.element-tools').exists()).toBe(false);
  });
  it('keeps studio properties single and handles empty or missing editor contexts', () => {
    const f = fixture(false);
    expect(f.wrapper.findComponent({ name: 'ShapeLayerPropertiesPanel' }).exists()).toBe(false);
    const empty = fixture(true, false);
    expect(empty.wrapper.findComponent({ name: 'ShapeLayerPropertiesPanel' }).exists()).toBe(false);
    const missing = mount(ElementClipControls);
    expect(missing.find('section').exists()).toBe(false);
  });
  it('edits drawing settings while drawing and finishes from Clip', async () => {
    const f = fixture();
    f.editor.drawingMode.value = true;
    await f.wrapper.vm.$nextTick();
    const drawing = f.wrapper.findComponent({ name: 'DrawingControls' });
    expect(drawing.exists()).toBe(true);
    drawing.vm.$emit('update:modelValue', { color: '#ffffff', strokeWidth: 7, smoothing: 20 });
    await f.wrapper.vm.$nextTick();
    expect(f.editor.drawingSettings.value).toMatchObject({ color: '#ffffff', strokeWidth: 7 });
    await f.wrapper.get('button').trigger('click');
    expect(f.editor.drawingMode.value).toBe(false);
  });
});

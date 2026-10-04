import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { shape } from '@beam/runtime/composition/shape/tests/gpu-shape.fixtures';
import { arrowVector } from '@beam/engine/shared/shape-vector-presets';
import { vectorFromSvg } from '@beam/engine/shared/shape-vector-svg';
import type { ShapeClip } from '@beam/engine/shared/composition-types';
import type { ElementEditorContext } from '../../../elements/element-editor-types';
import { provideElementEditor } from '../../../elements/useElementEditor';
import ShapeGeometryControls from '../ShapeGeometryControls.vue';
import ArrowPicker from '../../../elements/ArrowPicker.vue';
import ShapePicker from '../../../elements/ShapePicker.vue';
import DrawingControls from '../../../elements/DrawingControls.vue';
import Button from '~/ui/button/Button.vue';
import Input from '~/ui/input/Input.vue';
import Select from '~/ui/select/Select.vue';
vi.mock('~/api/capture', () => ({
  capture: { getPreferences: vi.fn(), updatePreferences: vi.fn(), onPreferencesChanged: vi.fn() },
}));
const wrappers: VueWrapper[] = [];
const stubs = {
  Input: {
    props: ['modelValue', 'size'],
    emits: ['update:modelValue'],
    template: '<div><slot name="prefix"/><input/><slot name="suffix"/></div>',
  },
  Select: { props: ['modelValue', 'options', 'label'], emits: ['update:modelValue'], template: '<div/>' },
  ShapePicker: true,
  ArrowPicker: true,
  DrawingControls: true,
  Switch: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<button class="switch" @click="$emit(\'update:modelValue\',!modelValue)"/>',
  },
  Button: { props: ['disabled'], template: '<button :disabled="disabled"><slot/></button>' },
};
const mountControls = (patch: Partial<ShapeClip> = {}) => {
  const layers = ref([shape(patch)]);
  let editor!: ElementEditorContext;
  const Host = defineComponent({
    setup() {
      editor = provideElementEditor({
        layers: () => layers.value,
        selectedId: () => layers.value[0]!.id,
        select: () => {},
        insert: () => {},
        remove: () => {},
        timing: () => ({ startMs: 0, durationMs: 1000 }),
        canvasSize: () => ({ width: 1600, height: 1000 }),
        update: (id, patch) => {
          layers.value = layers.value.map((c) => (c.id === id ? { ...c, ...patch } : c));
        },
      });
      return () => h(ShapeGeometryControls, { clip: layers.value[0]!, onUpdate: editor.update });
    },
  });
  const wrapper = mount(Host, { global: { stubs } });
  wrappers.push(wrapper);
  return { wrapper, editor, layers, controls: wrapper.findComponent(ShapeGeometryControls) };
};
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()));
describe('geometry and node inspector', () => {
  it('replaces catalog geometry and exits node editing when selecting another shape', async () => {
    const s = mountControls({ vector: vectorFromSvg('M0 0L1 0L1 1Z') });
    s.editor.beginVector();
    await nextTick();
    s.wrapper.findComponent(ShapePicker).vm.$emit('update:modelValue', 'heart');
    await nextTick();
    expect(s.layers.value[0]!.preset).toBe('heart');
    expect(s.layers.value[0]!.vector).toBeNull();
    expect(s.editor.vectorEditing.value).toBeNull();
  });
  it.each(['curved', 'double', 'elbow'] as const)('selects %s arrows as editable paths', async (preset) => {
    const s = mountControls({ family: 'arrow', preset: 'arrow' });
    s.wrapper.findComponent(ArrowPicker).vm.$emit('update:modelValue', preset);
    await nextTick();
    expect(s.layers.value[0]!.vector?.arrowPreset).toBe(preset);
    expect(s.layers.value[0]!.family).toBe('arrow');
  });
  it('keeps solid arrow dimensions editable and rejects invalid values', async () => {
    const s = mountControls({ family: 'arrow', preset: 'arrow', vector: arrowVector('solid') });
    for (const [key, label, max] of [
      ['arrowThickness', 'Arrow thickness', 80],
      ['arrowHeadSize', 'Arrowhead size', 70],
    ] as const) {
      const input = s.wrapper.findAllComponents(Input).find((c) => c.attributes('aria-label') === label)!;
      input.vm.$emit('update:modelValue', 30);
      await nextTick();
      expect(s.layers.value[0]![key]).toBe(30);
      for (const invalid of ['', NaN, -1, max + 1]) input.vm.$emit('update:modelValue', invalid);
      await nextTick();
      expect(s.layers.value[0]![key]).toBe(30);
    }
  });
  it('edits stroke and marker size, and rejects malformed marker choices', async () => {
    const s = mountControls({ family: 'arrow', preset: 'arrow', vector: arrowVector('line') });
    for (const label of ['Stroke width', 'Tip size']) {
      const field = s.wrapper.findAllComponents(Input).find((c) => c.attributes('aria-label') === label)!;
      field.vm.$emit('update:modelValue', 24);
      await nextTick();
      for (const invalid of ['', NaN, 0, 121]) field.vm.$emit('update:modelValue', invalid);
    }
    for (const [index, key] of [
      ['Start tip', 'startMarker'],
      ['End tip', 'endMarker'],
    ] as const) {
      const field = s.wrapper.findAllComponents(Select).find((c) => c.props('label') === index)!;
      field.vm.$emit('update:modelValue', 'circle');
      await nextTick();
      expect(s.layers.value[0]!.vector![key]).toBe('circle');
      field.vm.$emit('update:modelValue', 'bad');
    }
    expect(s.layers.value[0]!.vector).toMatchObject({
      strokeWidth: 24,
      markerSize: 24,
      startMarker: 'circle',
      endMarker: 'circle',
    });
  });
  it('keeps creation actions and text out of the path inspector', () => {
    const s = mountControls({ family: 'arrow', preset: 'arrow' });
    expect(s.wrapper.text()).not.toContain('Draw an arrow');
    expect(s.wrapper.text()).not.toContain('Draw with anchors');
    expect(s.wrapper.text()).not.toContain('Add text');
  });
  it('edits corner and smooth nodes, inserts after selection, deletes and closes contours', async () => {
    const s = mountControls({ vector: vectorFromSvg('M0 0L1 1') });
    await s.wrapper
      .findAll('button')
      .find((b) => b.text() === 'Edit points')!
      .trigger('click');
    await s.wrapper.get('[aria-label="Smooth point"]').trigger('click');
    expect(s.layers.value[0]!.vector!.contours[0]!.nodes[0]!.mode).toBe('smooth');
    await s.wrapper.get('[aria-label="Corner point"]').trigger('click');
    expect(s.layers.value[0]!.vector!.contours[0]!.nodes[0]!.in).toBeUndefined();
    await s.wrapper.get('[aria-label="Insert point after selection"]').trigger('click');
    expect(s.layers.value[0]!.vector!.contours[0]!.nodes).toHaveLength(3);
    expect(s.editor.selectedNode.value?.node).toBe(1);
    await s.wrapper.get('[aria-label="Remove point"]').trigger('click');
    expect(s.layers.value[0]!.vector!.contours[0]!.nodes).toHaveLength(2);
    await s.wrapper.get('.switch').trigger('click');
    expect(s.layers.value[0]!.vector!.contours[0]!.closed).toBe(true);
    await s.wrapper
      .findAll('button')
      .find((b) => b.text() === 'Finish editing points')!
      .trigger('click');
    expect(s.editor.vectorEditing.value).toBeNull();
  });
  it('disables inserting after the final open anchor and removing the last two points', async () => {
    const s = mountControls({ vector: arrowVector('line') });
    s.editor.beginVector();
    s.editor.selectedNode.value = { contour: 0, node: 1 };
    await nextTick();
    expect(s.wrapper.get('[aria-label="Insert point after selection"]').attributes('disabled')).toBeDefined();
    expect(s.wrapper.get('[aria-label="Remove point"]').attributes('disabled')).toBeDefined();
  });
  it('exposes legacy drawing settings separately from the fill', async () => {
    const drawing = {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      strokeWidth: 8,
      smoothing: 65,
    };
    const s = mountControls({ family: 'drawing', preset: 'freehand', drawing });
    expect(s.wrapper.findComponent(DrawingControls).props('hideColor')).toBe(true);
    s.wrapper
      .findComponent(DrawingControls)
      .vm.$emit('update:modelValue', { strokeWidth: 12, smoothing: 30, color: '#abcdef' });
    await nextTick();
    expect(s.layers.value[0]!.drawing).toMatchObject({ strokeWidth: 12, smoothing: 30 });
    expect(s.wrapper.text()).not.toContain('Add text');
  });
});

describe('geometry boundaries', () => {
  it('edits bounded rounded corners without producing invalid document values', async () => {
    const s = mountControls({ preset: 'rounded-rectangle' });
    const input = s.wrapper.findAllComponents(Input).find((c) => c.attributes('aria-label') === 'Corner radius')!;
    input.vm.$emit('update:modelValue', 25);
    await nextTick();
    expect(s.layers.value[0]!.cornerRadius).toBe(25);
    for (const invalid of ['', NaN, -1, 51]) input.vm.$emit('update:modelValue', invalid);
    expect(s.layers.value[0]!.cornerRadius).toBe(25);
  });
  it('preserves legacy solid arrows when changing their original width controls', async () => {
    const s = mountControls({ family: 'arrow', preset: 'arrow' });
    const input = s.wrapper.findAllComponents(Input).find((c) => c.attributes('aria-label') === 'Arrow thickness')!;
    input.vm.$emit('update:modelValue', 24);
    await nextTick();
    expect(s.layers.value[0]!.arrowThickness).toBe(24);
    expect(s.layers.value[0]!.vector).toBeUndefined();
  });
  it('retains independent closed contours and safely ignores unavailable node actions', async () => {
    const s = mountControls({ vector: vectorFromSvg('M0 0L1 0L1 1ZM.2 .2L.4 .4') });
    s.editor.beginVector();
    await nextTick();
    const original = s.layers.value[0]!.vector;
    await s.wrapper.get('.switch').trigger('click');
    expect(s.layers.value[0]!.vector!.contours[1]).toEqual(original!.contours[1]);
    s.editor.selectedNode.value = null;
    await nextTick();
    for (const label of ['Smooth point', 'Corner point', 'Insert point after selection', 'Remove point']) {
      const control = s.wrapper.findAllComponents(Button).find((c) => c.attributes('aria-label') === label);
      control?.vm.$emit('click');
    }
    expect(s.layers.value[0]!.vector!.contours[0]!.nodes).toHaveLength(3);
  });
});

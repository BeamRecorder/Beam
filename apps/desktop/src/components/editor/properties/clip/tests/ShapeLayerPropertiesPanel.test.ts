import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ShapeLayerPropertiesPanel from '../ShapeLayerPropertiesPanel.vue';
import ShapeGeometryControls from '../ShapeGeometryControls.vue';
import ElementTextControls from '../../../elements/ElementTextControls.vue';
import TransformControls from '../../shared/TransformControls.vue';
import MediaOrientationControls from '../../shared/MediaOrientationControls.vue';
import { shape } from '@beam/runtime/composition/shape/tests/gpu-shape.fixtures';
import { createElementText } from '@beam/engine/shared/element-text';
import ColorFillPresetControls from '../../ColorFillPresetControls.vue';
import Input from '~/ui/input/Input.vue';
vi.mock('~/api/capture', () => ({
  capture: { getPreferences: vi.fn(), updatePreferences: vi.fn(), onPreferencesChanged: vi.fn() },
}));
const wrappers: VueWrapper[] = [];
const stubs = {
  ColorFillPresetControls: {
    props: ['modelValue', 'label'],
    emits: ['update:modelValue'],
    template: '<div class="fill" />',
  },
  ColorPicker: {
    props: { modelValue: String, label: String, showLabel: Boolean },
    emits: ['update:modelValue'],
    template: '<div class="color" />',
  },
  Switch: {
    props: ['modelValue', 'ariaLabel', 'size'],
    emits: ['update:modelValue'],
    template: '<button class="toggle" :aria-label="ariaLabel" @click="$emit(\'update:modelValue\', !modelValue)" />',
  },
  Input: {
    props: ['modelValue', 'ariaLabel', 'size'],
    emits: ['update:modelValue'],
    template: '<div :aria-label="ariaLabel"><slot name="prefix"/><input/><slot name="suffix"/></div>',
  },
  ShadowDirectionGroup: true,
  ShapeGeometryControls: true,
  ElementTextControls: true,
  TransformControls: true,
  MediaOrientationControls: true,
};
const mountPanel = (patch = {}) => {
  const wrapper = mount(ShapeLayerPropertiesPanel, {
    props: { clip: shape(patch), canvasSize: { width: 1600, height: 1000 } },
    global: { stubs },
  });
  wrappers.push(wrapper);
  return wrapper;
};
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()));
describe('shared shape inspector', () => {
  it('groups all appearance controls in flat inspector accordions with toggles inside', () => {
    const wrapper = mountPanel({ fillEnabled: true, opacityEnabled: true, shadowEnabled: true });
    expect(wrapper.findAll('.accordion-inspector')).toHaveLength(6);
    expect(wrapper.find('[data-element-section="placement"]').exists()).toBe(true);
    expect(wrapper.find('[data-element-section="geometry"]').exists()).toBe(true);
    expect(wrapper.find('[data-element-section="fill"] .property-toggle').exists()).toBe(true);
    expect(wrapper.find('[data-element-section="opacity"] .property-toggle').exists()).toBe(true);
    expect(wrapper.find('[data-element-section="shadow"] .property-toggle').exists()).toBe(true);
    expect(wrapper.findComponent(ElementTextControls).exists()).toBe(true);
    expect(wrapper.findComponent(ShapeGeometryControls).exists()).toBe(true);
  });
  it('keeps named border controls in a separate disclosure, independent of fill', async () => {
    const wrapper = mountPanel({ fillEnabled: false, borderColor: '#123456', borderWidth: 4 });
    const border = wrapper.get('[data-element-section="border"]');
    const trigger = border.get('.accordion-trigger');
    expect(trigger.text()).toBe('Border');
    expect(trigger.attributes('aria-expanded')).toBe('false');
    await trigger.trigger('click');
    expect(trigger.attributes('aria-expanded')).toBe('true');
    const color = border.getComponent(stubs.ColorPicker);
    expect(color.props()).toMatchObject({ modelValue: '#123456', label: 'Border color', showLabel: true });
    expect(border.getComponent(Input).props('modelValue')).toBe(4);
    expect(wrapper.get('[data-element-section="fill"]').find('.color').exists()).toBe(false);
    color.vm.$emit('update:modelValue', '#abcdef');
    expect(wrapper.emitted('update')).toEqual([[{ borderColor: '#abcdef' }]]);
  });
  it('offers full canvas placement with one rotation row and emits transform updates', () => {
    const wrapper = mountPanel(),
      placement = wrapper.findComponent(TransformControls);
    expect(placement.props('canvasSize')).toEqual({ width: 1600, height: 1000 });
    const transform = { x: 0.2, y: 0.3, width: 0.4, height: 0.5 };
    placement.vm.$emit('update:modelValue', transform);
    expect(wrapper.emitted('update')).toContainEqual([{ transform }]);
    wrapper.findComponent(MediaOrientationControls).vm.$emit('update:rotation', 32.75);
    expect(wrapper.emitted('update')).toContainEqual([{ rotation: 32.75 }]);
    expect(wrapper.findAll('.rotation-row')).toHaveLength(1);
  });
  it('forwards geometry, fill and existing native text changes independently', () => {
    const wrapper = mountPanel({ text: createElementText('Label'), fillEnabled: true });
    wrapper.findComponent(ShapeGeometryControls).vm.$emit('update', { preset: 'heart', vector: null });
    const text = createElementText('Updated');
    wrapper.findComponent(ElementTextControls).vm.$emit('update', text);
    wrapper.findComponent(ColorFillPresetControls).vm.$emit('update:modelValue', { kind: 'color', color: '#123456' });
    expect(wrapper.emitted('update')).toContainEqual([{ preset: 'heart', vector: null }]);
    expect(wrapper.emitted('update')).toContainEqual([{ text }]);
    expect(wrapper.emitted('update')).toContainEqual([
      { fill: { kind: 'color', color: '#123456' }, fillColor: '#123456' },
    ]);
  });
  it('keeps text elements in their native text inspector without geometric fill sections', () => {
    const wrapper = mountPanel({ family: 'text', preset: 'text', text: createElementText('Beam') });
    expect(wrapper.findComponent(ElementTextControls).exists()).toBe(true);
    expect(wrapper.findComponent(ShapeGeometryControls).exists()).toBe(false);
    expect(wrapper.find('[data-element-section="fill"]').exists()).toBe(false);
    expect(wrapper.find('[data-element-section="border"]').exists()).toBe(false);
  });
  it.each(['fillEnabled', 'opacityEnabled', 'shadowEnabled'] as const)(
    'toggles %s in its accordion body',
    async (key) => {
      const wrapper = mountPanel({ [key]: true });
      const label = { fillEnabled: 'Fill color', opacityEnabled: 'Item opacity', shadowEnabled: 'Shadow' }[key];
      await wrapper.get(`.toggle[aria-label="${label}"]`).trigger('click');
      expect(wrapper.emitted('update')).toContainEqual([{ [key]: false }]);
    },
  );
  it.each([
    ['Border width', 'borderWidth', 40],
    ['Item opacity', 'opacity', 100],
    ['Background blur', 'backdropBlur', 100],
    ['Shadow Blur', 'shadowBlur', 96],
  ] as const)('edits compact %s values and rejects invalid numbers', (label, key, max) => {
    const wrapper = mountPanel({ opacityEnabled: true, shadowEnabled: true });
    const field = wrapper.findAllComponents(Input).find((c) => c.attributes('aria-label') === label)!;
    field.vm.$emit('update:modelValue', 12.25);
    expect(wrapper.emitted('update')).toContainEqual([{ [key]: 12.25 }]);
    for (const value of ['', NaN, -1, max + 1, 'bad']) field.vm.$emit('update:modelValue', value);
    expect(wrapper.emitted('update')).toHaveLength(1);
  });
  it('reveals enabled appearance controls without duplicate drawing fill pickers', async () => {
    const wrapper = mountPanel({ fillEnabled: false, opacityEnabled: false, shadowEnabled: false });
    expect(wrapper.find('.fill').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Background blur"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Shadow Blur"]').exists()).toBe(false);
    await wrapper.setProps({
      clip: shape({
        family: 'drawing',
        preset: 'freehand',
        fillEnabled: true,
        drawing: {
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
          strokeWidth: 8,
          smoothing: 65,
        },
        opacityEnabled: true,
        shadowEnabled: true,
      }),
    });
    expect(wrapper.findAll('.fill')).toHaveLength(1);
    expect(wrapper.find('[aria-label="Background blur"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Shadow Blur"]').exists()).toBe(true);
  });
});

describe('inspector drafts and disclosures', () => {
  it('retains controls when toggling every disclosure and forwards colors, gradients and shadow direction', async () => {
    const wrapper = mountPanel({ fillEnabled: true, opacityEnabled: true, shadowEnabled: true });
    for (const trigger of wrapper.findAll('.accordion-trigger')) {
      await trigger.trigger('click');
      await trigger.trigger('click');
    }
    for (const color of wrapper.findAllComponents(stubs.ColorPicker)) color.vm.$emit('update:modelValue', '#112233');
    wrapper.findComponent({ name: 'ShadowDirectionGroup' }).vm.$emit('update:modelValue', 'all');
    const fill = {
      kind: 'gradient' as const,
      gradient: {
        type: 'linear' as const,
        angle: 90,
        stops: [
          { id: 'a', position: 0, color: '#112233', alpha: 1 },
          { id: 'b', position: 1, color: '#abcdef', alpha: 1 },
        ],
      },
    };
    wrapper.findComponent(ColorFillPresetControls).vm.$emit('update:modelValue', fill);
    expect(wrapper.emitted('update')).toContainEqual([{ borderColor: '#112233' }]);
    expect(wrapper.emitted('update')).toContainEqual([{ shadowColor: '#112233' }]);
    expect(wrapper.emitted('update')).toContainEqual([{ shadowDirection: 'all' }]);
    expect(wrapper.emitted('update')).toContainEqual([{ fill }]);
  });
  it('forwards edits from native text and renders no pixel size controls without canvas metadata', () => {
    const wrapper = mount(ShapeLayerPropertiesPanel, {
      props: { clip: shape({ family: 'text', preset: 'text', text: createElementText('Beam') }) },
      global: { stubs },
    });
    wrappers.push(wrapper);
    expect(wrapper.findComponent(TransformControls).exists()).toBe(false);
    const text = createElementText('Label');
    wrapper.findComponent(ElementTextControls).vm.$emit('update', text);
    expect(wrapper.emitted('update')).toContainEqual([{ text }]);
  });
});

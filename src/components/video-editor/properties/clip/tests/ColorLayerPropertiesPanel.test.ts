import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColorClip } from '~/media/shared/composition-types';
import ColorLayerPropertiesPanel from '../ColorLayerPropertiesPanel.vue';

const { capture } = vi.hoisted(() => ({
  capture: {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
    onPreferencesChanged: vi.fn(),
  },
}));

vi.mock('../../../../../api/capture', () => ({ capture }));

const Button = {
  inheritAttrs: false,
  props: ['variant', 'size', 'block', 'icon'],
  emits: ['click'],
  template:
    '<button v-bind="$attrs" :class="[\'btn\', $attrs.class]" :data-variant="variant" @click="$emit(\'click\')"><slot /></button>',
};
const Popover = {
  template: '<div class="popover-stub"><slot name="trigger" :isOpen="false" /></div>',
};
const BackgroundPresetComposer = {
  template: '<div class="composer-stub" />',
};

const radialGradient = {
  type: 'radial' as const,
  angle: 45,
  stops: [
    { id: 'inner', position: 0, color: '#000000', alpha: 1 },
    { id: 'outer', position: 1, color: '#ffffff', alpha: 0.5 },
  ],
};

const linearGradient = {
  type: 'linear' as const,
  angle: 135,
  stops: [
    { id: 'start', position: 0, color: '#111827', alpha: 1 },
    { id: 'end', position: 1, color: '#ffffff', alpha: 1 },
  ],
};

const colorClip = (fill: ColorClip['fill'] = { kind: 'color', color: '#111827' }): ColorClip => ({
  id: 'color-clip',
  kind: 'color',
  name: 'Color layer',
  timelineStartMs: 0,
  timelineDurationMs: 3_000,
  sourceInMs: 0,
  sourceDurationMs: 3_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  trackId: 'track-color',
  assetId: '',
  transform: { x: 0, y: 0, width: 1, height: 1 },
  fill,
});

const preferences = (gradients: (typeof radialGradient)[] = []) => ({
  schemaVersion: 3,
  theme: 'dark',
  recordingBar: { visibility: 'always' },
  devices: {},
  shortcuts: {},
  backgroundPresets: { colors: [], gradients },
  extras: {},
});

const mountPanel = async (clip: ColorClip) => {
  const wrapper = mount(ColorLayerPropertiesPanel, {
    props: { clip },
    global: { stubs: { Button, Popover, BackgroundPresetComposer } },
  });
  await flushPromises();
  return wrapper;
};

beforeEach(() => {
  vi.clearAllMocks();
  capture.getPreferences.mockResolvedValue(preferences());
  capture.updatePreferences.mockResolvedValue(preferences());
  capture.onPreferencesChanged.mockReturnValue(vi.fn());
});

describe('ColorLayerPropertiesPanel', () => {
  it('offers the shared Color and Gradient button group and marks a solid preset active', async () => {
    const wrapper = await mountPanel(colorClip());
    const modes = wrapper.findAll('.kind-group .btn');

    expect(modes).toHaveLength(2);
    expect(modes.map((mode) => mode.text())).toEqual(['Color', 'Gradient']);
    expect(modes[0]?.attributes('data-variant')).toBe('primary');
    expect(modes[1]?.attributes('data-variant')).toBe('ghost');
    expect(wrapper.find('.preset-tile.active').attributes('aria-label')).toBe('#111827');

    await modes[1]!.trigger('click');
    expect(wrapper.findAll('.kind-group .btn')[1]?.attributes('data-variant')).toBe('primary');
    expect(wrapper.findAll('.preset-tile').length).toBeGreaterThan(1);
    wrapper.unmount();
  });

  it('emits a color fill when a shared solid preset is selected', async () => {
    const wrapper = await mountPanel(colorClip());
    const white = wrapper.findAll('.preset-tile').find((tile) => tile.attributes('aria-label') === '#ffffff');

    expect(white).toBeDefined();
    await white!.trigger('click');

    expect(wrapper.emitted('update')?.at(-1)).toEqual([{ kind: 'color', color: '#ffffff' }]);
    wrapper.unmount();
  });

  it('renders and applies a saved radial gradient preset', async () => {
    capture.getPreferences.mockResolvedValue(preferences([radialGradient]));
    const wrapper = await mountPanel(colorClip({ kind: 'gradient', gradient: linearGradient }));
    const radial = wrapper
      .findAll('.preset-tile')
      .find((tile) => tile.attributes('style')?.includes('radial-gradient(circle'));

    expect(radial).toBeDefined();
    expect(radial!.attributes('style')).toContain('rgba(0, 0, 0, 1)');
    expect(radial!.attributes('style')).toContain('rgba(255, 255, 255, 0.5)');

    await radial!.trigger('click');
    expect(wrapper.emitted('update')?.at(-1)?.[0]).toEqual({ kind: 'gradient', gradient: radialGradient });
    wrapper.unmount();
  });
});

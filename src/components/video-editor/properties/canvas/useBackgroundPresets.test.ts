import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, reactive, type ComponentPublicInstance } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreferenceSettings } from '../../../../api/types/capture-api';
import { useBackgroundPresets } from './useBackgroundPresets';

const { capture } = vi.hoisted(() => ({
  capture: { getPreferences: vi.fn(), updatePreferences: vi.fn(), onPreferencesChanged: vi.fn() },
}));

vi.mock('../../../../api/capture', () => ({ capture }));

const preferences = (overrides: Record<string, unknown> = {}): PreferenceSettings => ({
  schemaVersion: 3,
  theme: 'light',
  recordingBar: { visibility: 'always' },
  recordingInteractions: { enabled: false, noticeDismissed: false },
  devices: {},
  shortcuts: {},
  backgroundPresets: {
    colors: ['#abcdef'],
    gradients: [
      {
        type: 'radial',
        angle: 30,
        stops: [
          { id: 'a', position: 0, color: '#000000', alpha: 1 },
          { id: 'b', position: 1, color: '#ffffff', alpha: 1 },
        ],
      },
    ],
  },
  extras: { backgroundPresetOverrides: overrides },
});
const selected = vi.fn();
type Presets = ReturnType<typeof useBackgroundPresets>;
type Exposed = ComponentPublicInstance & { presets: Presets };

const mountPresets = async () => {
  const Harness = defineComponent({ setup: () => ({ presets: useBackgroundPresets(selected) }), template: '<div />' });
  const wrapper = mount(Harness) as unknown as { vm: Exposed; unmount: () => void };
  await flushPromises();
  return wrapper;
};

beforeEach(() => {
  vi.clearAllMocks();
  capture.getPreferences.mockResolvedValue(preferences());
  capture.updatePreferences.mockImplementation(async () => preferences());
  capture.onPreferencesChanged.mockReturnValue(vi.fn());
});

afterEach(() => undefined);

describe('background presets', () => {
  it('hydrates saved presets, applies valid built-in overrides, and unsubscribes on disposal', async () => {
    const unsubscribe = vi.fn();
    capture.getPreferences.mockResolvedValue(
      preferences({
        'color:#111827': '#123456',
        'gradient:violet': {
          type: 'radial',
          angle: 20,
          stops: [
            { id: 'x', position: 0, color: '#000000', alpha: 1 },
            { id: 'y', position: 1, color: '#ffffff', alpha: 1 },
          ],
        },
      }),
    );
    capture.onPreferencesChanged.mockReturnValue(unsubscribe);
    const wrapper = await mountPresets();
    expect(wrapper.vm.presets.colorPresets.value[0]).toMatchObject({ color: '#123456' });
    expect(wrapper.vm.presets.colorPresets.value.at(-1)).toMatchObject({ color: '#abcdef', kind: 'color' });
    expect(wrapper.vm.presets.gradientPresets.value[0]).toMatchObject({ gradient: { type: 'radial', angle: 20 } });
    wrapper.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('edits a built-in color live, selects the changed value, and persists its override', async () => {
    const wrapper = await mountPresets();
    const violet = wrapper.vm.presets.colorPresets.value[0];
    wrapper.vm.presets.editColor(violet);
    wrapper.vm.presets.updateLiveColor('#AABBCC');
    expect(wrapper.vm.presets.editingPresetId.value).toBe(violet.id);
    expect(selected).toHaveBeenLastCalledWith(expect.objectContaining({ id: violet.id, color: '#aabbcc' }));
    await wrapper.vm.presets.saveColor('#AABBCC');
    expect(capture.updatePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundPresets: expect.objectContaining({ colors: ['#abcdef'] }),
        extras: expect.objectContaining({
          backgroundPresetOverrides: expect.objectContaining({ [violet.id]: '#aabbcc' }),
        }),
      }),
    );
    expect(wrapper.vm.presets.showCustomEditor.value).toBe(false);
  });

  it('renames and persists an edited custom color without adding a duplicate', async () => {
    const wrapper = await mountPresets();
    const custom = wrapper.vm.presets.colorPresets.value.at(-1)!;
    wrapper.vm.presets.editColor(custom);
    wrapper.vm.presets.updateLiveColor('#FEDCBA');
    expect(wrapper.vm.presets.editingPresetId.value).toBe('color:custom:#fedcba');
    await wrapper.vm.presets.saveColor('#FEDCBA');
    expect(capture.updatePreferences).toHaveBeenLastCalledWith(
      expect.objectContaining({ backgroundPresets: expect.objectContaining({ colors: ['#fedcba'] }) }),
    );
    expect(selected).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'color:custom:#fedcba' }));
  });

  it('updates and persists custom gradients by index, while cloning the caller value', async () => {
    const wrapper = await mountPresets();
    const custom = wrapper.vm.presets.gradientPresets.value.at(-1)!;
    const gradient = {
      type: 'linear' as const,
      angle: 450,
      stops: [
        { id: 'start', position: 0, color: '#111111', alpha: 1 },
        { id: 'end', position: 1, color: '#222222', alpha: 1 },
      ],
    };
    wrapper.vm.presets.editGradient(custom);
    wrapper.vm.presets.updateLiveGradient(gradient);
    gradient.stops[0].color = '#ffffff';
    expect(wrapper.vm.presets.customGradientValue.value.stops[0].color).toBe('#111111');
    await wrapper.vm.presets.saveGradient({ type: 'linear', angle: 90, stops: gradient.stops });
    expect(capture.updatePreferences).toHaveBeenLastCalledWith(
      expect.objectContaining({
        backgroundPresets: expect.objectContaining({ gradients: [expect.objectContaining({ angle: 90 })] }),
      }),
    );
  });

  it('keeps reactive editor defaults cloneable while adding and resyncing custom presets', async () => {
    const colorLayerStyle = reactive({
      opacityEnabled: true,
      opacity: 62,
      cornerRadius: 'md',
      shadowSize: 'lg',
      shadowBlur: 24,
      shadowMode: 'adaptive',
      shadowColor: '#123456',
      shadowDirection: 'bottom-right',
      backdropBlurEnabled: true,
      backdropBlur: 36,
    });
    const loaded = reactive({
      ...preferences(),
      extras: reactive({
        backgroundPresetOverrides: reactive({}),
        editorDefaults: reactive({ colorLayer: reactive({ style: colorLayerStyle }) }),
      }),
    });
    capture.getPreferences.mockResolvedValue(loaded);
    capture.updatePreferences.mockImplementation(async (patch) => reactive({ ...preferences(), ...patch }));
    const wrapper = await mountPresets();
    const initialColorIds = wrapper.vm.presets.colorPresets.value.map((item) => item.id);
    const initialGradientIds = wrapper.vm.presets.gradientPresets.value.map((item) => item.id);
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

    try {
      wrapper.vm.presets.beginAdd('color');
      const color = wrapper.vm.presets.customColorValue.value;
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
      await wrapper.vm.presets.saveColor(color);

      const colorPayload = capture.updatePreferences.mock.calls[0]?.[0];
      expect(colorPayload).toBeDefined();
      expect(() => structuredClone(colorPayload)).not.toThrow();
      expect(colorPayload).toEqual(JSON.parse(JSON.stringify(colorPayload)));
      expect(colorPayload.backgroundPresets.colors).toEqual(['#abcdef', '#000000']);
      expect(wrapper.vm.presets.colorPresets.value.map((item) => item.id)).toEqual(
        expect.arrayContaining(initialColorIds),
      );
      expect(wrapper.vm.presets.colorPresets.value).toContainEqual(
        expect.objectContaining({ id: 'color:custom:#000000', color: '#000000' }),
      );

      wrapper.vm.presets.beginAdd('gradient');
      const generatedGradient = wrapper.vm.presets.customGradientValue.value;
      expect(generatedGradient.stops).toHaveLength(2);
      expect(
        generatedGradient.stops.every((stop) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stop.id),
        ),
      ).toBe(true);
      await wrapper.vm.presets.saveGradient(generatedGradient);

      const gradientPayload = capture.updatePreferences.mock.calls[1]?.[0];
      expect(gradientPayload).toBeDefined();
      expect(() => structuredClone(gradientPayload)).not.toThrow();
      expect(gradientPayload).toEqual(JSON.parse(JSON.stringify(gradientPayload)));
      expect(gradientPayload.backgroundPresets.gradients).toHaveLength(2);
      expect(wrapper.vm.presets.gradientPresets.value.map((item) => item.id)).toEqual(
        expect.arrayContaining(initialGradientIds),
      );
      expect(wrapper.vm.presets.gradientPresets.value.map((item) => item.id)).toContain('gradient:custom:1');
      expect(wrapper.vm.presets.gradientPresets.value).toHaveLength(initialGradientIds.length + 1);
      expect(gradientPayload.extras.editorDefaults.colorLayer.style).toEqual({
        opacityEnabled: true,
        opacity: 62,
        cornerRadius: 'md',
        shadowSize: 'lg',
        shadowBlur: 24,
        shadowMode: 'adaptive',
        shadowColor: '#123456',
        shadowDirection: 'bottom-right',
        backdropBlurEnabled: true,
        backdropBlur: 36,
      });
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('toggles editors closed, creates a new value when no preset is being edited, and ignores failed hydration', async () => {
    capture.getPreferences.mockRejectedValueOnce(new Error('offline'));
    const wrapper = await mountPresets();
    wrapper.vm.presets.toggleColor({ id: 'color:custom:#000000', color: '#000000' });
    expect(wrapper.vm.presets.isEditing('color:custom:#000000')).toBe(true);
    wrapper.vm.presets.toggleColor({ id: 'color:custom:#000000', color: '#000000' });
    expect(wrapper.vm.presets.showCustomEditor.value).toBe(false);
    wrapper.vm.presets.updateLiveGradient({ type: 'linear', angle: 0, stops: [] });
    expect(selected).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'gradient:custom' }));
  });
});

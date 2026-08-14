import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, type ComponentPublicInstance } from 'vue';
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
  alwaysOnTop: true,
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

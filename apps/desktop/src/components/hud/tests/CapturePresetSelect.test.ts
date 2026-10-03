import { defineComponent } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresetKind } from '@beam/engine/capture/capture-mode';
import type { EditorPresetDocument, EditorPresetSettings } from '~/api/types/editor-preset';

const capture = vi.hoisted(() => ({
  getEditorPresets: vi.fn(),
  selectEditorPreset: vi.fn(),
  onEditorPresetsChanged: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));

import CapturePresetSelect from '../CapturePresetSelect.vue';

const subscriptions: Array<{
  kind: PresetKind | undefined;
  listener: (document: EditorPresetDocument) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
}> = [];

const settings = (): EditorPresetSettings => ({
  editor: { schemaVersion: 1 },
  devices: {},
  export: { format: 'png' },
  quickSnip: { automaticZoom: false },
});

const documentFixture = (kind: PresetKind, suffix = ''): EditorPresetDocument => {
  const presetId = `${kind}-preset${suffix}`;
  return {
    schemaVersion: 1,
    activePresetId: presetId,
    presets: [
      {
        id: presetId,
        name: `${kind === 'screenshot' ? 'Screenshot' : 'Video'} preset${suffix}`,
        protected: true,
        updatedAt: '2026-01-01T00:00:00.000Z',
        settings: settings(),
      },
    ],
  };
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const SelectStub = defineComponent({
  name: 'Select',
  props: { modelValue: [String, Number], options: Array, disabled: Boolean },
  emits: ['update:modelValue'],
  template:
    '<button data-testid="choose-numeric-preset" :disabled="disabled" @click="$emit(\'update:modelValue\', 23)">Choose</button>',
});

const mountSelector = (kind: PresetKind = 'screenshot') =>
  mount(CapturePresetSelect, {
    props: { kind },
    global: { stubs: { Select: SelectStub } },
  });

describe('CapturePresetSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscriptions.splice(0);
    capture.getEditorPresets.mockImplementation((kind: PresetKind = 'video') => Promise.resolve(documentFixture(kind)));
    capture.selectEditorPreset.mockImplementation((id: string, kind: PresetKind = 'video') =>
      Promise.resolve(documentFixture(kind, `-${id}`)),
    );
    capture.onEditorPresetsChanged.mockImplementation(
      (listener: (document: EditorPresetDocument) => void, kind?: PresetKind) => {
        const subscription = { kind, listener, unsubscribe: vi.fn() };
        subscriptions.push(subscription);
        return subscription.unsubscribe;
      },
    );
  });

  it('uses the screenshot icon for still presets and the Studio icon for video presets', async () => {
    const wrapper = mountSelector('screenshot');
    expect(wrapper.find('.capture-mode-icon[data-mode="screenshot"]').exists()).toBe(true);
    await wrapper.setProps({ kind: 'video' });
    expect(wrapper.find('.capture-mode-icon[data-mode="studio"]').exists()).toBe(true);
    expect(wrapper.find('.capture-mode-icon[data-mode="screenshot"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('loads the selected kind and converts numeric select values to preset ids', async () => {
    const wrapper = mountSelector('screenshot');
    await flushPromises();

    expect(capture.getEditorPresets).toHaveBeenCalledWith('screenshot');
    expect(subscriptions[0]?.kind).toBe('screenshot');
    expect(wrapper.findComponent(SelectStub).props('options')).toEqual([
      { label: 'Screenshot preset', value: 'screenshot-preset' },
    ]);

    await wrapper.get('[data-testid="choose-numeric-preset"]').trigger('click');
    await flushPromises();

    expect(capture.selectEditorPreset).toHaveBeenCalledWith('23', 'screenshot');
    expect(wrapper.findComponent(SelectStub).props('modelValue')).toBe('screenshot-preset-23');
    wrapper.unmount();
    expect(subscriptions[0]?.unsubscribe).toHaveBeenCalledOnce();
  });
  it('uses a themed compact menu in the HUD and forwards its interaction state', async () => {
    const wrapper = mount(CapturePresetSelect, {
      props: { kind: 'video', compact: true },
    });
    await flushPromises();
    expect(wrapper.get('.select-trigger').attributes('aria-label')).toBe('Preset');
    expect(wrapper.get('.select-trigger').classes()).toContain('select-compact');
    expect(wrapper.find('.capture-mode-icon[data-mode="studio"]').exists()).toBe(true);
    await wrapper.get('.select-trigger').trigger('click');
    expect(wrapper.emitted('toggle')).toEqual([[true]]);
    await wrapper.setProps({ disabled: true });
    expect(wrapper.get('.select-trigger').attributes('disabled')).toBeDefined();
    expect(wrapper.emitted('toggle')).toEqual([[true], [false]]);
    wrapper.unmount();
  });

  it('unsubscribes on kind changes, ignores stale loads, and cleans up the active subscription', async () => {
    const videoLoad = deferred<EditorPresetDocument>();
    capture.getEditorPresets.mockImplementation((kind: PresetKind = 'video') =>
      kind === 'video' ? videoLoad.promise : Promise.resolve(documentFixture('screenshot')),
    );
    const wrapper = mountSelector('video');
    const videoSubscription = subscriptions[0]!;

    await wrapper.setProps({ kind: 'screenshot' });
    await flushPromises();
    const screenshotSubscription = subscriptions[1]!;
    expect(videoSubscription.unsubscribe).toHaveBeenCalledOnce();
    expect(capture.getEditorPresets).toHaveBeenNthCalledWith(1, 'video');
    expect(capture.getEditorPresets).toHaveBeenNthCalledWith(2, 'screenshot');
    expect(wrapper.findComponent(SelectStub).props('options')).toEqual([
      { label: 'Screenshot preset', value: 'screenshot-preset' },
    ]);

    videoSubscription.listener(documentFixture('video', '-stale-event'));
    videoLoad.resolve(documentFixture('video', '-stale-load'));
    await flushPromises();
    expect(wrapper.findComponent(SelectStub).props('options')).toEqual([
      { label: 'Screenshot preset', value: 'screenshot-preset' },
    ]);

    wrapper.unmount();
    expect(screenshotSubscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it('shows loading failures and clears them when the preset kind changes', async () => {
    capture.getEditorPresets.mockRejectedValueOnce(new Error('Screenshot presets unavailable'));
    const wrapper = mountSelector('screenshot');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Error: Screenshot presets unavailable');

    capture.getEditorPresets.mockResolvedValueOnce(documentFixture('video'));
    await wrapper.setProps({ kind: 'video' });
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.findComponent(SelectStub).props('options')).toEqual([
      { label: 'Video preset', value: 'video-preset' },
    ]);
    wrapper.unmount();
  });
});

describe('compact preset errors', () => {
  it('reports load failures to the toolbar without growing the compact field', async () => {
    capture.getEditorPresets.mockRejectedValueOnce(new Error('Preset load failed'));
    const wrapper = mount(CapturePresetSelect, {
      props: { kind: 'video', compact: true },
      global: { stubs: { Select: SelectStub } },
    });
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.emitted('error')).toContainEqual(['Error: Preset load failed']);
    wrapper.unmount();
    expect(wrapper.emitted('error')?.at(-1)).toEqual(['']);
  });
  it('reports selection failures and clears them when a later selection succeeds', async () => {
    capture.getEditorPresets.mockResolvedValueOnce(documentFixture('video'));
    capture.onEditorPresetsChanged.mockReturnValueOnce(() => {});
    capture.selectEditorPreset
      .mockRejectedValueOnce(new Error('Cannot save preset'))
      .mockResolvedValueOnce(documentFixture('video', '-retry'));
    const wrapper = mount(CapturePresetSelect, {
      props: { kind: 'video', compact: true },
      global: { stubs: { Select: SelectStub } },
    });
    await flushPromises();
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('error')).toContainEqual(['Error: Cannot save preset']);
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('error')?.at(-1)).toEqual(['']);
    wrapper.unmount();
  });
  it('ignores late failed loads after the selector was disposed', async () => {
    const load = deferred<EditorPresetDocument>();
    capture.getEditorPresets.mockReturnValueOnce(load.promise);
    capture.onEditorPresetsChanged.mockReturnValueOnce(() => {});
    const wrapper = mount(CapturePresetSelect, {
      props: { kind: 'video', compact: true },
      global: { stubs: { Select: SelectStub } },
    });
    wrapper.unmount();
    load.reject(new Error('Late failure'));
    await flushPromises();
    expect(wrapper.emitted('error')).toEqual([['']]);
  });
});

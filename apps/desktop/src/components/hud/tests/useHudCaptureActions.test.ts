import { computed, nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useHudCaptureActions } from '../useHudCaptureActions';
import type { HudCaptureActionsOptions } from '../hud-state-types';

const fixture = (platform = 'darwin') => {
  const busy = ref(false);
  const options: HudCaptureActionsOptions = {
    platform,
    developmentSources: false,
    blocked: computed(() => busy.value),
    activeTab: ref('screen'),
    selectedScreenId: ref(null),
    selectedSourceId: ref(null),
    resetRegion: vi.fn(),
    selectRegion: vi.fn().mockResolvedValue(true),
    selectSource: vi.fn().mockImplementation(async (kind) => ({
      kind,
      id: 'native:selected',
      development: false,
      source: {
        id: 'native:selected',
        kind,
        name: 'Selected',
        app: '',
        detail: '',
        aspect: 1.6,
      },
    })),
    previewSelection: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
  };
  return { options, busy, actions: useHudCaptureActions(options) };
};

describe('HUD capture actions', () => {
  it.each(['screen', 'window'] as const)('starts only after the native %s chooser confirms', async (kind) => {
    const { options, actions } = fixture();
    await actions.chooseCapture(kind);
    expect(options.selectSource).toHaveBeenCalledWith(kind);
    expect(kind === 'screen' ? options.selectedScreenId.value : options.selectedSourceId.value).toBe('native:selected');
    expect(options.start).toHaveBeenCalledOnce();
    expect(actions.choosingSource.value).toBe(false);
  });
  it('honors a source kind changed inside the shared chooser', async () => {
    const { options, actions } = fixture();
    vi.mocked(options.selectSource).mockResolvedValue({
      kind: 'window',
      id: 'sck:window:99',
      development: false,
      source: {
        id: 'sck:window:99',
        kind: 'window',
        name: 'Selected',
        app: '',
        detail: '',
        aspect: 1.6,
      },
    });
    await actions.chooseCapture('screen');
    expect(options.activeTab.value).toBe('window');
    expect(actions.captureTarget.value).toBe('window');
    expect(options.selectedSourceId.value).toBe('sck:window:99');
  });
  it('leaves cancellation idle without changing the selected ID', async () => {
    const { options, actions } = fixture();
    vi.mocked(options.selectSource).mockResolvedValue(null);
    await actions.chooseCapture('window');
    expect(options.start).not.toHaveBeenCalled();
    expect(options.selectedSourceId.value).toBeNull();
  });
  it.each(['screen', 'window'] as const)(
    'keeps Linux %s capture in the Portal without custom selection',
    async (kind) => {
      const { options, actions } = fixture('linux');
      await actions.chooseCapture(kind);
      expect(options.start).toHaveBeenCalledOnce();
      expect(options.selectSource).not.toHaveBeenCalled();
    },
  );
  it.each(['linux', 'darwin', 'win32'])(
    'uses the same chooser with development data on %s without recording fake IDs',
    async (platform) => {
      const { options, actions } = fixture(platform);
      options.developmentSources = true;
      vi.mocked(options.selectSource).mockResolvedValue({
        kind: 'window',
        id: 'demo-window-1',
        development: true,
        source: {
          id: 'demo-window-1',
          kind: 'window',
          name: 'Selected',
          app: '',
          detail: '',
          aspect: 1.6,
        },
      });
      await actions.chooseCapture('window');
      expect(options.selectSource).toHaveBeenCalledWith('window');
      expect(options.previewSelection).toHaveBeenCalledOnce();
      expect(options.start).not.toHaveBeenCalled();
      expect(options.selectedSourceId.value).toBeNull();
    },
  );
  it('preserves crop selection and starts only after region confirmation', async () => {
    const { options, actions } = fixture();
    await actions.chooseCapture('region');
    expect(options.resetRegion).not.toHaveBeenCalled();
    expect(options.start).toHaveBeenCalledOnce();
    vi.mocked(options.selectRegion).mockResolvedValue(false);
    await actions.chooseCapture('region');
    expect(options.start).toHaveBeenCalledOnce();
  });
  it('blocks duplicate actions during pending selection and when capture is unavailable', async () => {
    const { options, actions, busy } = fixture();
    busy.value = true;
    await actions.chooseCapture('window');
    expect(options.selectSource).not.toHaveBeenCalled();
    busy.value = false;
    let finish!: (result: null) => void;
    vi.mocked(options.selectSource).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = actions.chooseCapture('window');
    await nextTick();
    await actions.chooseCapture('screen');
    expect(options.selectSource).toHaveBeenCalledOnce();
    finish(null);
    await first;
  });
  it.each(['selectSource', 'start', 'previewSelection'] as const)(
    'releases pending state after %s fails',
    async (method) => {
      const { options, actions } = fixture();
      if (method === 'previewSelection')
        vi.mocked(options.selectSource).mockResolvedValue({
          kind: 'window',
          id: 'demo-window-1',
          development: true,
          source: {
            id: 'demo-window-1',
            kind: 'window',
            name: 'Selected',
            app: '',
            detail: '',
            aspect: 1.6,
          },
        });
      vi.mocked(options[method]).mockRejectedValueOnce(new Error('Failed'));
      await expect(actions.chooseCapture('window')).rejects.toThrow('Failed');
      expect(actions.choosingSource.value).toBe(false);
    },
  );
});

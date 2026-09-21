import { mount, type VueWrapper } from '@vue/test-utils';
import { computed, defineComponent, nextTick, reactive, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CapturePreview, CaptureSource } from '~/api/types/capture-api';
import type { HudProps, HudWindowOptions, PreviewKind } from '../hud-state-types';
import type { ScreenRegion, ScreenRegionBounds } from '~/api/types/screen-region';

vi.mock('../../../api/capture', async () => ({ capture: (await import('./capture.mock')).captureMock }));

import { captureMock as capture } from './capture.mock';
import { useHudWindow } from '../useHudWindow';

const bounds: ScreenRegionBounds = { x: 4, y: 8, width: 1920, height: 1080 };
const preview = (displayBounds: ScreenRegionBounds | null = bounds): CapturePreview => ({
  id: 'display:1',
  name: 'Display',
  thumbnail: '',
  appIcon: null,
  displayId: 'display:1',
  displayBounds: displayBounds ?? undefined,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
};

describe('useHudWindow', () => {
  let wrapper: VueWrapper | undefined;

  const mountWindow = (
    initial: {
      embedded?: boolean;
      preparingEditor?: boolean;
      activeTab?: PreviewKind;
      selectedScreenId?: string | null;
      screenPreview?: CapturePreview | null;
    } = {},
  ) => {
    const props = reactive<HudProps>({
      embedded: initial.embedded ?? false,
      showTopbar: true,
      preparingEditor: initial.preparingEditor ?? false,
      editorLoadingProgress: { stage: 'openingWindow', value: 10 },
    });
    const activeTab = ref<PreviewKind>(initial.activeTab ?? 'screen');
    const isBusy = ref(false);
    const isRecording = ref(false);
    const errorMessage = ref('existing error');
    const selectedScreenId = ref<string | null>(
      initial.selectedScreenId === undefined ? 'display:1' : initial.selectedScreenId,
    );
    const selectedScreenPreview = ref<CapturePreview | null>(
      initial.screenPreview === undefined ? preview() : initial.screenPreview,
    );
    const selectedScreen = computed<CaptureSource | null>(() =>
      selectedScreenId.value
        ? {
            id: selectedScreenId.value,
            kind: 'display',
            label: 'Display',
            isDefault: true,
            displayId: selectedScreenId.value,
          }
        : null,
    );
    const showSettings = ref(false);
    const showProjectPicker = ref(false);
    const loadPreviews = vi.fn().mockResolvedValue(undefined);
    const refreshInteraction = vi.fn().mockResolvedValue(undefined);
    const options: HudWindowOptions = {
      props,
      activeTab,
      isBusy,
      isRecording,
      errorMessage,
      selectedScreen,
      selectedScreenId,
      selectedScreenPreview: computed(() => selectedScreenPreview.value),
      showSettings,
      showProjectPicker,
      loadPreviews,
      refreshInteraction,
    };
    let api!: ReturnType<typeof useHudWindow>;
    wrapper = mount(
      defineComponent({
        setup() {
          api = useHudWindow(options);
          return () => null;
        },
      }),
    );
    return {
      api,
      props,
      activeTab,
      isBusy,
      isRecording,
      errorMessage,
      selectedScreenId,
      selectedScreenPreview,
      showSettings,
      showProjectPicker,
      loadPreviews,
      refreshInteraction,
    };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    capture.platform = 'darwin';
    capture.getDisplayBounds.mockReset().mockResolvedValue(bounds);
    capture.selectScreenRegion.mockReset().mockResolvedValue(null);
    capture.updatePreferences.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.useRealTimers();
  });

  it('starts at the 352 by 512 native size and resizes for settings, project picker, tabs, and dropdowns', async () => {
    const hud = mountWindow();

    expect(capture.setSize).toHaveBeenLastCalledWith(352, 512);
    expect(hud.api.hudHeight.value).toBe(480);

    hud.showSettings.value = true;
    await nextTick();
    expect(capture.setSize).toHaveBeenLastCalledWith(352, 552);
    expect(hud.api.hudHeight.value).toBe(520);
    expect(hud.refreshInteraction).toHaveBeenCalledOnce();

    hud.showSettings.value = false;
    await nextTick();
    await vi.advanceTimersByTimeAsync(200);
    expect(capture.setSize).toHaveBeenLastCalledWith(352, 512);

    hud.showProjectPicker.value = true;
    await nextTick();
    expect(capture.setSize).toHaveBeenLastCalledWith(352, 552);
    expect(hud.api.hudHeight.value).toBe(520);
    hud.showProjectPicker.value = false;
    await nextTick();
    await vi.advanceTimersByTimeAsync(200);
    expect(capture.setSize).toHaveBeenLastCalledWith(352, 512);

    hud.api.handleDropdownToggle(true);
    expect(capture.setSize).toHaveBeenLastCalledWith(352, 672);
    hud.api.handleDropdownToggle(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(capture.setSize).toHaveBeenLastCalledWith(352, 512);
    hud.api.handleDropdownToggle(false);
    expect(hud.api.activeDropdowns.value).toBe(0);

    hud.activeTab.value = 'window';
    await nextTick();
    expect(hud.api.hudHeight.value).toBe(500);
    expect(hud.loadPreviews).toHaveBeenCalledWith('window');
    expect(capture.setSize).toHaveBeenLastCalledWith(352, 532);
    hud.api.handleDropdownToggle(true);
    expect(capture.setSize).toHaveBeenLastCalledWith(352, 692);
    hud.api.handleDropdownToggle(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(capture.setSize).toHaveBeenLastCalledWith(352, 532);
  });

  it.each([
    ['preparing editor', 'preparing'] as const,
    ['settings', 'settings'] as const,
    ['project picker', 'project'] as const,
    ['window tab', 'window'] as const,
    ['screen tab', 'screen'] as const,
  ])('revalidates a delayed shrink against the current %s state', async (_label, view) => {
    const hud = mountWindow();
    hud.api.handleDropdownToggle(true);
    const previousCalls = capture.setSize.mock.calls.length;

    if (view === 'preparing') {
      hud.props.preparingEditor = true;
      await nextTick();
      expect(capture.setInteractive).toHaveBeenCalledWith(true);
    } else if (view === 'settings') {
      hud.showSettings.value = true;
      await nextTick();
    } else if (view === 'project') {
      hud.showProjectPicker.value = true;
      await nextTick();
    } else if (view === 'window') {
      hud.activeTab.value = 'window';
      await nextTick();
      hud.api.handleDropdownToggle(false);
    } else {
      hud.api.handleDropdownToggle(false);
    }

    const expectedHeight = view === 'settings' || view === 'project' ? 552 : view === 'window' ? 532 : 512;
    await vi.advanceTimersByTimeAsync(200);
    expect(capture.setSize.mock.calls.length).toBeGreaterThan(previousCalls);
    expect(capture.setSize).toHaveBeenLastCalledWith(352, expectedHeight);
  });

  it('skips stale delayed shrinks after a dropdown reopens or the tab changes', async () => {
    const hud = mountWindow();
    hud.api.handleDropdownToggle(true);
    hud.api.handleDropdownToggle(false);
    hud.api.handleDropdownToggle(true);
    const callsAfterReopen = capture.setSize.mock.calls.length;
    await vi.advanceTimersByTimeAsync(200);
    expect(capture.setSize.mock.calls.length).toBe(callsAfterReopen);
    expect(capture.setSize).toHaveBeenLastCalledWith(352, 672);

    hud.api.handleDropdownToggle(false);
    hud.activeTab.value = 'window';
    await nextTick();
    const callsAfterTabChange = capture.setSize.mock.calls.length;
    await vi.advanceTimersByTimeAsync(200);
    expect(capture.setSize.mock.calls.length).toBe(callsAfterTabChange);
    expect(capture.setSize).toHaveBeenLastCalledWith(352, 532);

    hud.api.handleDropdownToggle(true);
    hud.api.handleDropdownToggle(false);
    hud.api.handleDropdownToggle(true);
    const callsAfterWindowDropdownReopens = capture.setSize.mock.calls.length;
    await vi.advanceTimersByTimeAsync(200);
    expect(capture.setSize.mock.calls.length).toBe(callsAfterWindowDropdownReopens);
    expect(capture.setSize).toHaveBeenLastCalledWith(352, 692);
  });

  it('keeps embedded HUDs out of native window sizing and region selection', async () => {
    const hud = mountWindow({ embedded: true, preparingEditor: true });

    expect(capture.setSize).not.toHaveBeenCalled();
    expect(capture.setInteractive).not.toHaveBeenCalled();
    await hud.api.selectScreenRegion();
    hud.api.updateWindowSize();

    expect(capture.selectScreenRegion).not.toHaveBeenCalled();
    expect(capture.hideScreenRegionOverlay).not.toHaveBeenCalled();
    expect(capture.setSize).not.toHaveBeenCalled();
  });

  it('ignores region requests while busy, recording, already leaving, or without display bounds', async () => {
    const hud = mountWindow();

    hud.isBusy.value = true;
    await hud.api.selectScreenRegion();
    hud.isBusy.value = false;
    hud.isRecording.value = true;
    await hud.api.selectScreenRegion();
    hud.isRecording.value = false;
    hud.api.isRegionSelectionLeaving.value = true;
    await hud.api.selectScreenRegion();
    hud.api.isRegionSelectionLeaving.value = false;
    hud.selectedScreenPreview.value = null;
    await hud.api.selectScreenRegion();

    expect(capture.getDisplayBounds).not.toHaveBeenCalled();
    expect(capture.selectScreenRegion).not.toHaveBeenCalled();
    expect(capture.setWindowVisible).not.toHaveBeenCalled();
  });

  it.each([
    [
      'busy',
      (hud: ReturnType<typeof mountWindow>): void => {
        hud.isBusy.value = true;
      },
    ] as const,
    [
      'recording',
      (hud: ReturnType<typeof mountWindow>): void => {
        hud.isRecording.value = true;
      },
    ] as const,
    [
      'already leaving',
      (hud: ReturnType<typeof mountWindow>): void => {
        hud.api.isRegionSelectionLeaving.value = true;
      },
    ] as const,
    [
      'bounds removed',
      (hud: ReturnType<typeof mountWindow>): void => {
        hud.selectedScreenPreview.value = null;
      },
    ] as const,
  ])('abandons a region request if %s changes while native bounds load', async (_label, changeDuringLookup) => {
    const pendingBounds = deferred<ScreenRegionBounds | null>();
    capture.getDisplayBounds.mockReturnValue(pendingBounds.promise);
    const hud = mountWindow();

    const selection = hud.api.selectScreenRegion();
    await flushMicrotasks();
    changeDuringLookup(hud);
    pendingBounds.resolve(_label === 'bounds removed' ? null : bounds);
    await flushMicrotasks();
    await selection;

    expect(capture.selectScreenRegion).not.toHaveBeenCalled();
    expect(capture.setWindowVisible).not.toHaveBeenCalled();
  });

  it('accepts native Linux portal selection without display bounds', async () => {
    capture.platform = 'linux';
    capture.selectScreenRegion.mockResolvedValueOnce(null);
    const hud = mountWindow({ screenPreview: null });

    const selection = hud.api.selectScreenRegion();
    await vi.advanceTimersByTimeAsync(180);
    await selection;

    expect(capture.getDisplayBounds).not.toHaveBeenCalled();
    expect(capture.selectScreenRegion).toHaveBeenCalledWith({ region: null });
    expect(capture.setWindowVisible).toHaveBeenCalledWith(true);
    expect(capture.setWindowVisible).not.toHaveBeenCalledWith(false);
    expect(capture.setInteractive).toHaveBeenCalledWith(true);
  });

  it('ignores stale display-bound results and clears current bounds after a lookup error', async () => {
    const first = deferred<ScreenRegionBounds | null>();
    const second = deferred<ScreenRegionBounds | null>();
    const third = deferred<ScreenRegionBounds | null>();
    const fourth = deferred<ScreenRegionBounds | null>();
    const fifth = deferred<ScreenRegionBounds | null>();
    capture.getDisplayBounds
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise)
      .mockReturnValueOnce(fourth.promise)
      .mockReturnValueOnce(fifth.promise);
    const hud = mountWindow({ selectedScreenId: null, screenPreview: null });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    hud.selectedScreenId.value = 'display:first';
    await nextTick();
    hud.selectedScreenId.value = 'display:second';
    await nextTick();
    first.resolve({ ...bounds, x: 100 });
    await flushMicrotasks();
    expect(hud.api.selectedScreenBounds.value).toBeNull();
    second.resolve({ ...bounds, x: 200 });
    await flushMicrotasks();
    expect(hud.api.selectedScreenBounds.value).toEqual({ ...bounds, x: 200 });

    hud.selectedScreenId.value = 'display:third';
    await nextTick();
    third.reject(new Error('display bounds failed'));
    await flushMicrotasks();
    expect(hud.api.selectedScreenBounds.value).toBeNull();
    expect(consoleError).toHaveBeenCalledWith('Failed to resolve selected screen bounds:', expect.any(Error));

    hud.selectedScreenId.value = 'display:fourth';
    await nextTick();
    hud.selectedScreenId.value = 'display:fifth';
    await nextTick();
    fourth.reject(new Error('stale display bounds failed'));
    await flushMicrotasks();
    expect(hud.api.selectedScreenBounds.value).toBeNull();
    fifth.resolve({ ...bounds, x: 500 });
    await flushMicrotasks();
    expect(hud.api.selectedScreenBounds.value).toEqual({ ...bounds, x: 500 });
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  it('stores crop selections, clears a full-screen selection, and replaces animation timers', async () => {
    const regions: ScreenRegion[] = [
      { x: 0.1, y: 0, width: 0.9, height: 1 },
      { x: 0, y: 0.1, width: 1, height: 0.9 },
      { x: 0, y: 0, width: 0.5, height: 1 },
      { x: 0, y: 0, width: 1, height: 0.5 },
      { x: 0, y: 0, width: 1, height: 1 },
    ];
    for (const region of regions) {
      capture.selectScreenRegion.mockResolvedValueOnce({ bounds, region });
    }
    const hud = mountWindow();

    for (const [index, region] of regions.entries()) {
      const previousRegion = hud.api.selectedScreenRegion.value ?? hud.api.savedScreenRegion.value;
      const selection = hud.api.selectScreenRegion();
      await vi.advanceTimersByTimeAsync(180);
      await selection;

      expect(capture.selectScreenRegion).toHaveBeenLastCalledWith({
        bounds: { ...bounds },
        region: previousRegion ? { ...previousRegion } : null,
      });
      if (index < regions.length - 1) {
        expect(hud.api.selectedScreenRegion.value).toEqual(region);
        expect(hud.api.selectedScreenOverlay.value).toEqual({ bounds: { ...bounds }, region });
        expect(hud.api.savedScreenRegion.value).toEqual(region);
      }
    }

    expect(hud.api.selectedScreenRegion.value).toBeNull();
    expect(hud.api.selectedScreenOverlay.value).toBeNull();
    expect(hud.api.savedScreenRegion.value).toBeNull();
    expect(capture.updatePreferences).toHaveBeenLastCalledWith({ extras: { screenRegion: null } });
    expect(capture.setWindowVisible).toHaveBeenCalledWith(false);
    expect(capture.setWindowVisible).toHaveBeenLastCalledWith(true);
    expect(hud.api.isRegionConfirmationAnimating.value).toBe(true);

    await vi.advanceTimersByTimeAsync(700);
    expect(hud.api.isRegionConfirmationAnimating.value).toBe(false);
    expect(hud.api.isRegionSelectionEntering.value).toBe(false);
  });

  it('keeps a saved crop as the next starting point and clears only the visible crop on tab change', async () => {
    const region = { x: 0.2, y: 0.1, width: 0.4, height: 0.5 };
    capture.selectScreenRegion.mockResolvedValueOnce({ bounds, region }).mockResolvedValueOnce(null);
    const hud = mountWindow();

    const firstSelection = hud.api.selectScreenRegion();
    await vi.advanceTimersByTimeAsync(180);
    await firstSelection;
    hud.activeTab.value = 'window';
    await nextTick();
    expect(hud.api.selectedScreenRegion.value).toBeNull();
    expect(hud.api.selectedScreenOverlay.value).toBeNull();
    expect(hud.api.savedScreenRegion.value).toEqual(region);

    hud.activeTab.value = 'screen';
    await nextTick();
    const secondSelection = hud.api.selectScreenRegion();
    await vi.advanceTimersByTimeAsync(180);
    await secondSelection;
    expect(capture.selectScreenRegion).toHaveBeenLastCalledWith({ bounds: { ...bounds }, region: { ...region } });
    expect(hud.api.savedScreenRegion.value).toEqual(region);
    expect(hud.loadPreviews).toHaveBeenCalledWith('screen');
  });

  it('restores the HUD after a dismissed selection or selection error, and clears active timers on unmount', async () => {
    capture.selectScreenRegion
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('portal failed'))
      .mockRejectedValueOnce('unknown portal error');
    const hud = mountWindow();

    const dismissed = hud.api.selectScreenRegion();
    await vi.advanceTimersByTimeAsync(180);
    await dismissed;
    expect(hud.api.isRegionSelectionLeaving.value).toBe(false);
    expect(hud.api.isRegionSelectionEntering.value).toBe(true);
    expect(capture.hideScreenRegionOverlay).toHaveBeenCalled();
    expect(capture.setWindowVisible).toHaveBeenLastCalledWith(true);
    expect(capture.setInteractive).toHaveBeenLastCalledWith(true);

    const failed = hud.api.selectScreenRegion();
    await vi.advanceTimersByTimeAsync(180);
    await failed;
    expect(hud.errorMessage.value).toBe('portal failed');
    expect(hud.api.isRegionSelectionEntering.value).toBe(true);

    const stringFailure = hud.api.selectScreenRegion();
    await vi.advanceTimersByTimeAsync(180);
    await stringFailure;
    expect(hud.errorMessage.value).toBe('unknown portal error');
    expect(hud.api.isRegionConfirmationAnimating.value).toBe(false);
    expect(hud.api.isRegionSelectionEntering.value).toBe(true);

    wrapper?.unmount();
    wrapper = undefined;
    expect(vi.getTimerCount()).toBe(0);
  });
});

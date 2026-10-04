import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { capture } from '~/api/capture';
import type { ScreenRegion, ScreenRegionBounds, ScreenRegionOverlayOptions } from '~/api/types/screen-region';
import type { HudWindowOptions } from './hud-state-types';

const HUD_WIDTH = 640;
const HUD_HEIGHT = 236;

export function useHudWindow(options: HudWindowOptions) {
  const {
    props,
    activeTab,
    isBusy,
    isRecording,
    errorMessage,
    selectedScreen,
    selectedScreenId,
    selectedScreenPreview,
    loadPreviews,
  } = options;
  const desktopPlatform = capture.platform;
  const selectedScreenRegion = ref<ScreenRegion | null>(null);
  const selectedScreenOverlay = ref<ScreenRegionOverlayOptions | null>(null);
  const nativeScreenBounds = ref<ScreenRegionBounds | null>(null);
  const savedScreenRegion = ref<ScreenRegion | null>(null);
  const isRegionSelectionLeaving = ref(false);
  const isRegionSelectionEntering = ref(false);
  const isRegionConfirmationAnimating = ref(false);
  let regionSelectionEnterTimeout: ReturnType<typeof setTimeout> | null = null;
  let regionConfirmationTimeout: ReturnType<typeof setTimeout> | null = null;
  const selectedScreenBounds = computed(
    () => nativeScreenBounds.value ?? selectedScreenPreview.value?.displayBounds ?? null,
  );
  let screenBoundsRequest = 0;
  const refreshSelectedScreenBounds = async (): Promise<ScreenRegionBounds | null> => {
    const request = ++screenBoundsRequest;
    const displayId = selectedScreen.value?.displayId;
    if (!displayId) {
      nativeScreenBounds.value = null;
      return null;
    }
    try {
      const bounds = await capture.getDisplayBounds(displayId);
      if (request !== screenBoundsRequest) return null;
      nativeScreenBounds.value = bounds;
      return bounds;
    } catch (error) {
      if (request === screenBoundsRequest) nativeScreenBounds.value = null;
      console.error('Failed to resolve selected screen bounds:', error);
      return null;
    }
  };
  const wait = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration));
  const snapshotScreenBounds = (bounds: ScreenRegionBounds): ScreenRegionBounds => ({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  });

  const selectScreenRegion = async () => {
    if (props.embedded) return false;
    const linuxPortalSelection = desktopPlatform === 'linux';
    if (
      isBusy.value ||
      isRecording.value ||
      isRegionSelectionLeaving.value ||
      (!linuxPortalSelection && !selectedScreenBounds.value)
    )
      return false;
    const resolvedBounds = linuxPortalSelection
      ? null
      : ((await refreshSelectedScreenBounds()) ?? selectedScreenBounds.value);
    if (
      (!linuxPortalSelection && !resolvedBounds) ||
      isBusy.value ||
      isRecording.value ||
      isRegionSelectionLeaving.value
    )
      return false;
    // Values read from Vue refs/computed values can be reactive proxies. Electron
    // IPC cannot structured-clone those proxies, so always send a plain snapshot.
    const bounds = resolvedBounds ? snapshotScreenBounds(resolvedBounds) : null;
    errorMessage.value = '';
    isRegionSelectionLeaving.value = true;
    await wait(180);
    capture.setWindowVisible(false);
    try {
      // The saved region is only a starting point for the next selection. It
      // must not activate crop mode just because the HUD was opened.
      const currentRegion = selectedScreenRegion.value ?? savedScreenRegion.value;
      const selection = await capture.selectScreenRegion({
        ...(bounds ? { bounds } : {}),
        region: currentRegion ? { ...currentRegion } : null,
        ...(options.regionRecording ? { recording: options.regionRecording() } : {}),
        ...(options.captureMode ? { captureMode: options.captureMode() } : {}),
      });
      if (!selection) return false;
      if (selection.recording) options.applyRegionRecording?.(selection.recording);
      const region = selection.region;
      const selectionBounds = snapshotScreenBounds(selection.bounds);
      const isFullScreen = region.x === 0 && region.y === 0 && region.width === 1 && region.height === 1;
      if (isFullScreen) {
        selectedScreenRegion.value = null;
        selectedScreenOverlay.value = null;
        savedScreenRegion.value = null;
        void capture.updatePreferences({ extras: { screenRegion: null } });
      } else {
        const plainRegion = { ...region };
        selectedScreenRegion.value = plainRegion;
        selectedScreenOverlay.value = {
          bounds: selectionBounds,
          region: plainRegion,
        };
        savedScreenRegion.value = plainRegion;
        void capture.updatePreferences({
          extras: { screenRegion: plainRegion },
        });
      }
      isRegionConfirmationAnimating.value = true;
      if (regionConfirmationTimeout) clearTimeout(regionConfirmationTimeout);
      regionConfirmationTimeout = setTimeout(() => {
        isRegionConfirmationAnimating.value = false;
        regionConfirmationTimeout = null;
      }, 700);
      return true;
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error);
      return false;
    } finally {
      isRegionSelectionLeaving.value = false;
      isRegionSelectionEntering.value = true;
      capture.hideScreenRegionOverlay();
      capture.setWindowVisible(true);
      // Showing the HUD resets its native hit-test state. Force it interactive
      // until the renderer's next pointer move refines the transparent areas.
      capture.setInteractive(true);
      if (regionSelectionEnterTimeout) clearTimeout(regionSelectionEnterTimeout);
      regionSelectionEnterTimeout = setTimeout(() => {
        isRegionSelectionEntering.value = false;
        regionSelectionEnterTimeout = null;
      }, 280);
    }
  };

  const activeDropdowns = ref(0);
  let sized = false;
  const updateWindowSize = () => {
    if (props.embedded || sized) return;
    capture.setSize(HUD_WIDTH + 32, HUD_HEIGHT + 32);
    sized = true;
  };
  const hudHeight = computed(() => HUD_HEIGHT);
  const resetRegion = () => {
    selectedScreenRegion.value = null;
    selectedScreenOverlay.value = null;
  };

  const handleDropdownToggle = (isOpen: boolean) => {
    if (isOpen) {
      activeDropdowns.value++;
    } else {
      activeDropdowns.value = Math.max(0, activeDropdowns.value - 1);
    }
    updateWindowSize();
  };

  // Both preview catalogs are cached. Switching tabs only changes presentation;
  // a failed initial request may be retried without replacing a valid cache.
  watch(activeTab, () => {
    capture.hideScreenRegionOverlay();
    if (activeTab.value !== 'screen') {
      selectedScreenRegion.value = null;
      selectedScreenOverlay.value = null;
    }
    updateWindowSize();
    if (!isBusy.value) void loadPreviews(activeTab.value);
  });

  watch(
    () => props.preparingEditor,
    (preparing) => {
      updateWindowSize();
      if (!props.embedded && preparing) {
        // The HUD is normally click-through until the renderer sees a pointer
        // over a control. During editor loading the card changes underneath a
        // stationary pointer, so no mousemove may arrive for the Close button.
        // Make the temporary loading card interactive immediately.
        capture.setInteractive(true);
      }
    },
    { immediate: true },
  );

  watch(selectedScreenId, () => {
    selectedScreenRegion.value = null;
    selectedScreenOverlay.value = null;
    nativeScreenBounds.value = null;
    capture.hideScreenRegionOverlay();
    void refreshSelectedScreenBounds();
  });

  onBeforeUnmount(() => {
    screenBoundsRequest++;
    if (!props.embedded) capture.hideScreenRegionOverlay();
    if (regionSelectionEnterTimeout) clearTimeout(regionSelectionEnterTimeout);
    if (regionConfirmationTimeout) clearTimeout(regionConfirmationTimeout);
  });
  return {
    resetRegion,
    selectedScreenRegion,
    selectedScreenOverlay,
    savedScreenRegion,
    selectedScreenBounds,
    isRegionSelectionLeaving,
    isRegionSelectionEntering,
    isRegionConfirmationAnimating,
    activeDropdowns,
    updateWindowSize,
    hudHeight,
    handleDropdownToggle,
    selectScreenRegion,
  };
}

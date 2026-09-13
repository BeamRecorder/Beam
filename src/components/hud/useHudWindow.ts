import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { capture } from '~/api/capture';
import type { ScreenRegion, ScreenRegionBounds, ScreenRegionOverlayOptions } from '~/api/types/screen-region';
import type { HudWindowOptions } from './hud-state-types';

const HUD_WIDTH = 320;

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
    showSettings,
    showProjectPicker,
    loadPreviews,
    refreshInteraction,
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
    if (props.embedded) return;
    const linuxPortalSelection = desktopPlatform === 'linux';
    if (
      isBusy.value ||
      isRecording.value ||
      isRegionSelectionLeaving.value ||
      (!linuxPortalSelection && !selectedScreenBounds.value)
    )
      return;
    const resolvedBounds = linuxPortalSelection
      ? null
      : ((await refreshSelectedScreenBounds()) ?? selectedScreenBounds.value);
    if (
      (!linuxPortalSelection && !resolvedBounds) ||
      isBusy.value ||
      isRecording.value ||
      isRegionSelectionLeaving.value
    )
      return;
    // Values read from Vue refs/computed values can be reactive proxies. Electron
    // IPC cannot structured-clone those proxies, so always send a plain snapshot.
    const bounds = resolvedBounds ? snapshotScreenBounds(resolvedBounds) : null;
    errorMessage.value = '';
    isRegionSelectionLeaving.value = true;
    await wait(180);
    if (!linuxPortalSelection) capture.setWindowVisible(false);
    try {
      // The saved region is only a starting point for the next selection. It
      // must not activate crop mode just because the HUD was opened.
      const currentRegion = selectedScreenRegion.value ?? savedScreenRegion.value;
      const selection = await capture.selectScreenRegion({
        ...(bounds ? { bounds } : {}),
        region: currentRegion ? { ...currentRegion } : null,
      });
      if (!selection) return;
      const region = selection.region;
      const selectionBounds = snapshotScreenBounds(selection.bounds);
      const isFullScreen = region.x <= 0.01 && region.y <= 0.01 && region.width >= 0.98 && region.height >= 0.98;
      if (isFullScreen) {
        selectedScreenRegion.value = null;
        selectedScreenOverlay.value = null;
        savedScreenRegion.value = null;
        void capture.updatePreferences({ extras: { screenRegion: null } });
      } else {
        const plainRegion = { ...region };
        selectedScreenRegion.value = plainRegion;
        selectedScreenOverlay.value = { bounds: selectionBounds, region: plainRegion };
        savedScreenRegion.value = plainRegion;
        void capture.updatePreferences({ extras: { screenRegion: plainRegion } });
      }
      isRegionConfirmationAnimating.value = true;
      if (regionConfirmationTimeout) clearTimeout(regionConfirmationTimeout);
      regionConfirmationTimeout = setTimeout(() => {
        isRegionConfirmationAnimating.value = false;
        regionConfirmationTimeout = null;
      }, 700);
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error);
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
  // Start without an assumed size so the first HUD render also reserves the
  // outer margin required for its border and shadow.
  let lastHeight = 0;
  let lastWidth = 0;

  const updateWindowSize = () => {
    if (props.embedded) return;
    const isDropdownOpen = activeDropdowns.value > 0;
    let targetHeight = 480;
    if (props.preparingEditor) {
      targetHeight = 480;
    } else if (showSettings.value) {
      targetHeight = 520;
    } else if (showProjectPicker.value) {
      targetHeight = 520;
    } else {
      if (activeTab.value === 'window') {
        targetHeight = isDropdownOpen ? 660 : 500;
      } else {
        targetHeight = isDropdownOpen ? 640 : 480;
      }
    }

    // Popovers are teleported and viewport-bounded; resizing the HUD horizontally
    // makes the card jump to the right without creating usable space.
    const targetWidth = HUD_WIDTH;

    if (targetHeight > lastHeight || targetWidth > lastWidth) {
      // Grow the Electron window instantly so transitions are not clipped
      capture.setSize(targetWidth + 32, targetHeight + 32);
    } else if (targetHeight < lastHeight || targetWidth < lastWidth) {
      // Wait for the card's CSS transition (200ms) to complete before shrinking
      const snapshotDropdownOpen = activeDropdowns.value > 0;
      const snapshotHeight = targetHeight;
      const snapshotWidth = targetWidth;
      setTimeout(() => {
        const currentDropdownOpen = activeDropdowns.value > 0;
        let currentTargetHeight = 480;
        if (props.preparingEditor) {
          currentTargetHeight = 480;
        } else if (showSettings.value) {
          currentTargetHeight = 520;
        } else if (showProjectPicker.value) {
          currentTargetHeight = 520;
        } else {
          if (activeTab.value === 'window') {
            currentTargetHeight = currentDropdownOpen ? 660 : 500;
          } else {
            currentTargetHeight = currentDropdownOpen ? 640 : 480;
          }
        }
        const currentTargetWidth = HUD_WIDTH;

        // Only apply if the situation hasn't changed (don't override a subsequent open)
        if (
          currentDropdownOpen === snapshotDropdownOpen &&
          currentTargetHeight === snapshotHeight &&
          currentTargetWidth === snapshotWidth
        ) {
          capture.setSize(snapshotWidth + 32, snapshotHeight + 32);
        }
      }, 200);
    }
    lastHeight = targetHeight;
    lastWidth = targetWidth;
  };

  const hudHeight = computed(() => {
    if (props.preparingEditor) return 480;
    if (showSettings.value || showProjectPicker.value) {
      return 520;
    }
    return activeTab.value === 'window' ? 500 : 480;
  });

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
    void loadPreviews(activeTab.value);
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

  // Watch settings view toggle to update window size
  watch(showSettings, (isOpen) => {
    updateWindowSize();
    if (isOpen) void refreshInteraction();
  });

  watch(showProjectPicker, () => {
    updateWindowSize();
  });

  onBeforeUnmount(() => {
    screenBoundsRequest++;
    if (!props.embedded) capture.hideScreenRegionOverlay();
    if (regionSelectionEnterTimeout) clearTimeout(regionSelectionEnterTimeout);
    if (regionConfirmationTimeout) clearTimeout(regionConfirmationTimeout);
  });
  return {
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

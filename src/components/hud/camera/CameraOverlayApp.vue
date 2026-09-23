<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { capture } from '../../../api/capture';
import { useThemeStore } from '../../../stores/theme';
import CameraPreviewOverlay from './CameraPreviewOverlay.vue';
const theme = useThemeStore();
const cameraId = ref('off');
const isRecording = ref(false);
const isHovered = ref(false);
let unsubscribe: (() => void) | null = null;
let unsubscribeHover: (() => void) | null = null;
let disposed = false;
let polling = false;
let statusTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  void capture
    .getCameraOverlayState()
    .then((state) => {
      if (!disposed && state) cameraId.value = state.cameraId;
    })
    .catch(() => undefined);
  capture.notifyCameraOverlayReady();
  unsubscribe = capture.onCameraOverlayState((configuration) => {
    cameraId.value = configuration.cameraId;
  });
  unsubscribeHover = capture.onCameraOverlayHover((hovered) => {
    isHovered.value = hovered;
  });
  statusTimer = setInterval(() => {
    if (polling) return;
    polling = true;
    void capture
      .status()
      .then((status) => {
        if (!disposed) isRecording.value = status.state === 'recording';
      })
      .catch(() => undefined)
      .finally(() => {
        polling = false;
      });
  }, 500);
});
onBeforeUnmount(() => {
  disposed = true;
  unsubscribe?.();
  unsubscribeHover?.();
  if (statusTimer) clearInterval(statusTimer);
});
</script>

<template>
  <CameraPreviewOverlay
    :camera-id="cameraId"
    :is-recording="isRecording"
    :is-hovered="isHovered"
    :theme="theme.theme"
    window-overlay
  />
</template>

<style scoped>
:global(html),
:global(body) {
  margin: 0;
  overflow: hidden;
  background: transparent;
}
</style>

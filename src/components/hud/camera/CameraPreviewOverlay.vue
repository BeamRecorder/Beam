<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, type WatchStopHandle } from 'vue';
import { Video } from '@lucide/vue';
import { cameraVideoConstraints } from '../../../api/camera-recorder';
import { waitForFirstCameraFrame } from '../../../api/camera-frame-ready';
import { useTranslate } from '~/i18n/useTranslate';
import { capture } from '../../../api/capture';

const { t } = useTranslate('CameraPreviewOverlay');

const props = withDefaults(
  defineProps<{
    cameraId: string;
    isRecording?: boolean;
    isHovered?: boolean;
    theme?: 'light' | 'dark' | 'system';
    windowOverlay?: boolean;
  }>(),
  { isRecording: false, isHovered: false, theme: 'light' },
);

const videoRef = ref<HTMLVideoElement | null>(null);
const cameraStream = ref<MediaStream | null>(null);
const streamError = ref<string | null>(null);
const isLoading = ref(false);
let cameraRequest = 0;
let cameraLoadQueue = Promise.resolve();
let stopCameraWatch: WatchStopHandle | null = null;
let frameWaitAbort: AbortController | null = null;
let readyCameraId: string | null = null;

const stopCameraStream = () => {
  videoRef.value?.pause();
  if (videoRef.value) videoRef.value.srcObject = null;
  cameraStream.value?.getTracks().forEach((track) => track.stop());
  cameraStream.value = null;
  readyCameraId = null;
};

const loadCamera = async (cameraId: string, request: number) => {
  if (request !== cameraRequest) return;
  stopCameraStream();
  if (!cameraId || cameraId === 'off') {
    isLoading.value = false;
    return;
  }
  try {
    streamError.value = null;
    isLoading.value = true;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: cameraVideoConstraints(cameraId),
    });
    if (request !== cameraRequest) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    cameraStream.value = stream;
    const video = videoRef.value;
    if (!video) throw new Error('The camera preview is unavailable.');
    video.srcObject = stream;
    frameWaitAbort = new AbortController();
    const firstFrame = waitForFirstCameraFrame(video, { signal: frameWaitAbort.signal });
    try {
      await Promise.all([video.play(), firstFrame]);
    } catch (error) {
      frameWaitAbort.abort();
      await firstFrame.catch(() => undefined);
      throw error;
    }
    readyCameraId = cameraId;
  } catch (error) {
    if (request === cameraRequest) {
      stopCameraStream();
      streamError.value = error instanceof Error ? error.message : t('unableToStartCamera');
      capture.configureCameraOverlay({ cameraId: 'off' });
    }
  } finally {
    if (request === cameraRequest) {
      frameWaitAbort = null;
      isLoading.value = false;
    }
  }
};

const scheduleCameraLoad = (cameraId: string) => {
  const request = ++cameraRequest;
  frameWaitAbort?.abort();
  // Some camera drivers are exclusive. Wait for an obsolete request to settle
  // and release its stream before asking Chromium for the next device.
  cameraLoadQueue = cameraLoadQueue.then(() => loadCamera(cameraId, request));
};

const readyStream = async (sourceId: string) => {
  await cameraLoadQueue;
  if (readyCameraId !== sourceId || !cameraStream.value)
    throw Object.assign(new Error(streamError.value || 'The selected camera is not ready.'), {
      name: 'NotReadableError',
    });
  return cameraStream.value;
};

defineExpose({ readyStream });

onMounted(() => {
  stopCameraWatch = watch(() => props.cameraId, scheduleCameraLoad, { immediate: true });
});

onBeforeUnmount(() => {
  cameraRequest += 1;
  frameWaitAbort?.abort();
  stopCameraWatch?.();
  stopCameraStream();
});
</script>

<template>
  <main
    v-show="cameraId !== 'off'"
    class="camera-overlay-container"
    :data-theme="theme"
    :class="{ 'is-recording': isRecording, 'is-hovered': isHovered }"
  >
    <video ref="videoRef" autoplay muted playsinline class="camera-overlay-video" />
    <div v-if="isLoading" class="camera-overlay-skeleton" :aria-label="t('loadingCameraPreview')"><div /></div>
    <div v-else-if="streamError" class="camera-overlay-error"><Video :size="24" /></div>
  </main>
</template>

<style scoped>
.camera-overlay-container {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #000;
  cursor: grab;
  border-radius: 12px;
  isolation: isolate;
  -webkit-app-region: drag;
}
.camera-overlay-video {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  border-radius: 12px;
}
.camera-overlay-skeleton {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  background: var(--color-bg-surface);
}
.camera-overlay-skeleton div {
  width: 42%;
  height: 100%;
  background: linear-gradient(90deg, transparent, var(--color-bg-surface-hover), transparent);
  animation: camera-skeleton 1.1s ease-in-out infinite;
}
.camera-overlay-error {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  background: var(--color-bg-surface);
}
@keyframes camera-skeleton {
  from {
    transform: translateX(-130%);
  }
  to {
    transform: translateX(340%);
  }
}
</style>

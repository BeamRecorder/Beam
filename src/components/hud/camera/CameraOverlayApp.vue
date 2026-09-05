<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { capture } from '../../../api/capture';
import { BrowserCameraRecorder } from '../../../api/camera-recorder';
import type { CameraRecordingCommand, CameraRecordingCommandResult } from '../../../api/types/camera-recording';
import { useThemeStore } from '../../../stores/theme';
import CameraPreviewOverlay from './CameraPreviewOverlay.vue';

const theme = useThemeStore();
const cameraId = ref('off');
const isRecording = ref(false);
const isHovered = ref(false);
const cameraPreview = ref<{ readyStream(sourceId: string): Promise<MediaStream> } | null>(null);
let unsubscribe: (() => void) | null = null;
let unsubscribeHover: (() => void) | null = null;
let unsubscribeRecording: (() => void) | null = null;
let statusTimer: number | null = null;
let recorder: BrowserCameraRecorder | null = null;
let activeRecordingId: string | null = null;
let activeSessionId: string | null = null;
let recordingQueue = Promise.resolve();

const queueRecordingOperation = (operation: () => Promise<void>) => {
  const pending = recordingQueue.then(operation);
  recordingQueue = pending.catch(() => undefined);
};

const matchingRecorder = (recordingId: string) => {
  if (!recorder || activeRecordingId !== recordingId) throw new Error('The camera recording is no longer active.');
  return recorder;
};

const handleRecordingCommand = async ({ recordingId, control }: CameraRecordingCommand) => {
  if (control.action === 'prepare') {
    if (recorder) {
      if (activeSessionId) throw new Error('Another camera recording is already active.');
      await recorder.stop(0);
      recorder = null;
      activeRecordingId = null;
    }
    cameraId.value = control.sourceId;
    await nextTick();
    const stream = await cameraPreview.value?.readyStream(control.sourceId);
    if (!stream) throw Object.assign(new Error('The camera preview is not ready.'), { name: 'NotReadableError' });
    recorder = BrowserCameraRecorder.fromReadyStream(control.sourceId, stream);
    activeRecordingId = recordingId;
    const preparedRecorder = recorder;
    recorder.onFatal((reason) => {
      queueRecordingOperation(async () => {
        if (recorder !== preparedRecorder) return;
        try {
          if (activeSessionId) await preparedRecorder.fail(activeSessionId, reason.message);
          else await preparedRecorder.stop(0);
        } finally {
          recorder = null;
          activeRecordingId = null;
          activeSessionId = null;
          capture.configureCameraOverlay({ cameraId: 'off' });
          capture.reportCameraRecordingFailure({ recordingId, message: reason.message });
        }
      });
    });
    return { recordingId, sourceId: recorder.sourceId, format: recorder.format };
  }
  const current = matchingRecorder(control.recordingId);
  if (control.action === 'start') {
    activeSessionId = control.sessionId;
    const timelineStartedAt = performance.now() - control.startNs / 1_000_000;
    await current.start(control.sessionId, control.appearance, control.placement, timelineStartedAt, control.startNs);
  } else if (control.action === 'pause') await current.pause(control.endNs);
  else if (control.action === 'resume') await current.resume(control.sessionId, control.startNs);
  else if (control.action === 'stop') {
    try {
      await current.stop(control.endNs);
    } catch (error) {
      if (activeSessionId) await current.fail(activeSessionId, error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      recorder = null;
      activeRecordingId = null;
      activeSessionId = null;
    }
  } else {
    try {
      await current.fail(control.sessionId, control.reason);
    } finally {
      recorder = null;
      activeRecordingId = null;
      activeSessionId = null;
    }
  }
};

const executeRecordingCommand = async (command: CameraRecordingCommand) => {
  let result: CameraRecordingCommandResult;
  try {
    const value = await handleRecordingCommand(command);
    result = { commandId: command.commandId, ok: true, value };
  } catch (error) {
    result = {
      commandId: command.commandId,
      ok: false,
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
  capture.completeCameraOverlayRecordingCommand(result);
};

const refreshRecordingState = async () => {
  try {
    const session = await capture.status();
    isRecording.value = ['recording', 'degraded', 'paused'].includes(session.state);
  } catch {
    isRecording.value = false;
  }
};

onMounted(async () => {
  unsubscribe = capture.onCameraOverlayState((next) => {
    cameraId.value = next.cameraId;
  });
  unsubscribeHover = capture.onCameraOverlayHover((hovered) => {
    isHovered.value = hovered;
  });
  unsubscribeRecording = capture.onCameraOverlayRecordingCommand((command) => {
    queueRecordingOperation(() => executeRecordingCommand(command));
  });
  capture.notifyCameraOverlayReady();
  const saved = await capture.getCameraOverlayState();
  if (saved) cameraId.value = saved.cameraId;
  await refreshRecordingState();
  statusTimer = window.setInterval(() => {
    void refreshRecordingState();
  }, 500);
});

onBeforeUnmount(() => {
  unsubscribe?.();
  unsubscribeHover?.();
  unsubscribeRecording?.();
  if (recorder) {
    if (activeSessionId) void recorder.fail(activeSessionId, 'The camera overlay was closed.');
    else void recorder.stop(0);
  }
  if (statusTimer !== null) window.clearInterval(statusTimer);
});
</script>

<template>
  <CameraPreviewOverlay
    ref="cameraPreview"
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

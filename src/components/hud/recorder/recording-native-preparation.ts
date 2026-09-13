import { capture } from '~/api/capture';
import type { RecordingConfiguration } from './recording-types';

export class CaptureSelectionCancelled extends Error {
  constructor() {
    super('Capture selection cancelled.');
  }
}

export async function prepareNativeRecording(configuration: RecordingConfiguration) {
  const session = await capture.prepareRecording({
    projectId: configuration.projectId,
    screenKind: configuration.screenKind,
    screenId: configuration.screenId,
    cameraId: null,
    microphoneId: null,
    systemAudio: configuration.systemAudio,
    cursor: configuration.cursor !== false,
    recordInteractions: configuration.recordInteractions === true,
    targetFps: configuration.targetFps,
    region: configuration.region,
    outputRoot: configuration.outputRoot,
    excludedWindowHandles: configuration.excludedWindowHandles,
  });
  // Cancellation is a successful IPC outcome; it never relies on Electron's error-message formatting.
  if (session === null) throw new CaptureSelectionCancelled();
  return session;
}

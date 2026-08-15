import {
  BrowserCameraRecorder,
  isCameraUnavailableError,
  listBrowserCameras,
  type CameraAppearance,
  type CameraPlacement,
} from '../../../api/camera-recorder';
import { BrowserMicrophoneRecorder, listBrowserMicrophones } from '../../../api/microphone-recorder';
import { BrowserSystemAudioRecorder } from '../../../api/system-audio-recorder';
import type { RecordingConfiguration } from './recording-types';

const inactiveCamera = 'off';
const inactiveMicrophone = 'no-audio';

type Recorder = BrowserCameraRecorder | BrowserMicrophoneRecorder | BrowserSystemAudioRecorder;

export interface DeviceToggleContext {
  getConfiguration(): RecordingConfiguration | null;
  setConfigurationCameraId(id: string): void;
  setConfigurationMicrophoneId(id: string): void;
  getSessionId(): string | null;
  getSessionTimelineStartedAt(): number;
  getCamera(): BrowserCameraRecorder | null;
  setCamera(recorder: BrowserCameraRecorder | null): void;
  getMicrophone(): BrowserMicrophoneRecorder | null;
  setMicrophone(recorder: BrowserMicrophoneRecorder | null): void;
  getSystemAudio(): BrowserSystemAudioRecorder | null;
  setSystemAudio(recorder: BrowserSystemAudioRecorder | null): void;
  setCameraEnabled(enabled: boolean): void;
  setMicrophoneEnabled(enabled: boolean): void;
  setSystemAudioEnabled(enabled: boolean): void;
  setError(message: string): void;
  cameraMetadata(): Promise<{ appearance?: CameraAppearance; placement?: CameraPlacement }>;
}

export function useDeviceToggles(ctx: DeviceToggleContext) {
  const stopRecorder = async (recorder: Recorder | null) => {
    await recorder?.stop().catch(() => undefined);
  };

  const resolveCameraSourceId = async () => {
    const configuration = ctx.getConfiguration();
    if (!configuration) return null;
    if (configuration.cameraId !== inactiveCamera) return configuration.cameraId;
    const sources = await listBrowserCameras();
    return (
      sources.find((source) => source.isDefault && source.id !== 'camera:chromium:')?.id ??
      sources.find((source) => source.id !== 'camera:chromium:')?.id ??
      null
    );
  };

  const resolveMicrophoneSourceId = async () => {
    const configuration = ctx.getConfiguration();
    if (!configuration) return null;
    if (configuration.microphoneId !== inactiveMicrophone) return configuration.microphoneId;
    const sources = await listBrowserMicrophones();
    return (
      sources.find((source) => source.isDefault && source.id !== 'microphone:chromium:')?.id ??
      sources.find((source) => source.id !== 'microphone:chromium:')?.id ??
      null
    );
  };

  const setToggleError = (reason: unknown) => {
    ctx.setError(reason instanceof Error ? reason.message : String(reason));
  };

  const toggleCamera = async () => {
    const configuration = ctx.getConfiguration();
    const sessionId = ctx.getSessionId();
    if (!configuration || !sessionId) return;
    if (ctx.getCamera()) {
      await stopRecorder(ctx.getCamera());
      ctx.setCamera(null);
      ctx.setCameraEnabled(false);
      return;
    }
    try {
      const sourceId = await resolveCameraSourceId();
      if (!sourceId) throw new Error('No camera is available.');
      const { appearance, placement } = await ctx.cameraMetadata();
      const nextCamera = await BrowserCameraRecorder.request(sourceId);
      try {
        await nextCamera.start(sessionId, appearance, placement, ctx.getSessionTimelineStartedAt());
      } catch (reason) {
        await stopRecorder(nextCamera);
        throw reason;
      }
      ctx.setCamera(nextCamera);
      ctx.setConfigurationCameraId(sourceId);
      ctx.setCameraEnabled(true);
    } catch (reason) {
      if (isCameraUnavailableError(reason)) {
        ctx.setConfigurationCameraId(inactiveCamera);
        ctx.setError('Camera is unavailable.');
      } else setToggleError(reason);
    }
  };

  const toggleMicrophone = async () => {
    const configuration = ctx.getConfiguration();
    const sessionId = ctx.getSessionId();
    if (!configuration || !sessionId) return;
    if (ctx.getMicrophone()) {
      await stopRecorder(ctx.getMicrophone());
      ctx.setMicrophone(null);
      ctx.setMicrophoneEnabled(false);
      return;
    }
    try {
      const sourceId = await resolveMicrophoneSourceId();
      if (!sourceId) throw new Error('No microphone is available.');
      const nextMicrophone = await BrowserMicrophoneRecorder.request(sourceId);
      try {
        await nextMicrophone.start(sessionId);
      } catch (reason) {
        await stopRecorder(nextMicrophone);
        throw reason;
      }
      ctx.setMicrophone(nextMicrophone);
      ctx.setConfigurationMicrophoneId(sourceId);
      ctx.setMicrophoneEnabled(true);
    } catch (reason) {
      setToggleError(reason);
    }
  };

  const toggleSystemAudio = async () => {
    const sessionId = ctx.getSessionId();
    if (!sessionId) return;
    if (ctx.getSystemAudio()) {
      await stopRecorder(ctx.getSystemAudio());
      ctx.setSystemAudio(null);
      ctx.setSystemAudioEnabled(false);
      return;
    }
    try {
      const nextSystemAudio = await BrowserSystemAudioRecorder.request();
      try {
        await nextSystemAudio.start(sessionId);
      } catch (reason) {
        await stopRecorder(nextSystemAudio);
        throw reason;
      }
      ctx.setSystemAudio(nextSystemAudio);
      ctx.setSystemAudioEnabled(true);
    } catch (reason) {
      setToggleError(reason);
    }
  };

  return { toggleCamera, toggleMicrophone, toggleSystemAudio };
}

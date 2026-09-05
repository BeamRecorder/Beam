import type { CaptureSource } from './types/capture-api';
import { waitForFirstCameraFrame } from './camera-frame-ready';
import type {
  CameraAppearance,
  CameraFormat,
  CameraPlacement,
  CameraRecordingControl,
  CameraRecordingControlResult,
  CameraRecordingFailure,
} from './types/camera-recording';

export type { CameraAppearance, CameraFormat, CameraPlacement } from './types/camera-recording';

const MIME_TYPE = 'video/webm;codecs=vp8';
const CAMERA_PREFIX = 'camera:chromium:';

type CameraSegmentApi = {
  beginCameraSegment(payload: {
    sessionId: string;
    sourceId: string;
    format: CameraFormat & { appearance?: CameraAppearance; placement?: CameraPlacement };
    startNs: number;
  }): Promise<{ jobId: string }>;
  writeCameraSegment(payload: { jobId: string; sequence: number; data: Uint8Array }): Promise<void>;
  finalizeCameraSegment(payload: { jobId: string; endNs: number; metrics: Record<string, number> }): Promise<void>;
  failCamera(payload: { sessionId: string; reason: string }): Promise<void>;
  controlCameraOverlayRecording(control: CameraRecordingControl): Promise<CameraRecordingControlResult>;
  onCameraRecordingFailure(listener: (failure: CameraRecordingFailure) => void): () => void;
};

function api(): CameraSegmentApi {
  if (!window.capture) throw new Error('Camera recording is unavailable outside Electron.');
  return window.capture;
}

function deviceId(sourceId: string) {
  if (!sourceId.startsWith(CAMERA_PREFIX) || sourceId.length === CAMERA_PREFIX.length)
    throw new Error('The selected camera is invalid.');
  return sourceId.slice(CAMERA_PREFIX.length);
}

export function cameraVideoConstraints(sourceId: string): MediaTrackConstraints {
  return { deviceId: { exact: deviceId(sourceId) } };
}

export function isCameraUnavailableError(error: unknown) {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    ['NotFoundError', 'NotReadableError', 'OverconstrainedError'].includes(name) ||
    ['notfounderror', 'notreadableerror', 'overconstrainederror'].some((entry) => message.includes(entry)) ||
    message.includes('could not start video source') ||
    message.includes('hardware resources') ||
    message.includes('0xc00d3704') ||
    message.includes('ressources')
  );
}

function positive(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && value! > 0 ? Math.round(value!) : fallback;
}

async function waitForCameraStream(stream: MediaStream) {
  const video = document.createElement('video');
  const abort = new AbortController();
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  const firstFrame = waitForFirstCameraFrame(video, { signal: abort.signal });
  try {
    await Promise.all([video.play(), firstFrame]);
  } catch (error) {
    abort.abort();
    await firstFrame.catch(() => undefined);
    throw error;
  } finally {
    video.pause();
    video.srcObject = null;
  }
}

export async function listBrowserCameras(): Promise<CaptureSource[]> {
  if (!navigator.mediaDevices?.enumerateDevices)
    throw new Error('Camera discovery is unavailable in this Chromium build.');
  let devices = await navigator.mediaDevices.enumerateDevices();
  const videoInputs = devices.filter((device) => device.kind === 'videoinput');
  return videoInputs.map((device, index) => ({
    id: `${CAMERA_PREFIX}${device.deviceId}`,
    kind: 'camera' as const,
    label: device.label || `Camera ${index + 1}`,
    isDefault: index === 0,
  }));
}

export class BrowserCameraRecorder {
  private recorder: MediaRecorder | null = null;
  private jobId: string | null = null;
  private sequence = 0;
  private segmentStartNs = 0;
  private timelineStartedAt = 0;
  private frameCount = 0;
  private video: HTMLVideoElement | null = null;
  private pendingWrites: Promise<void>[] = [];
  private writeTail: Promise<void> = Promise.resolve();
  private fatalHandler: ((error: Error) => void) | null = null;
  private stopped = false;
  private appearance: CameraAppearance | undefined;
  private placement: CameraPlacement | undefined;
  readonly sourceId: string;
  readonly format: CameraFormat;
  private readonly stream: MediaStream;
  private readonly track: MediaStreamTrack;
  private readonly ownsStream: boolean;
  private readonly trackEndedHandler = () =>
    this.reportFatal(new Error('The selected camera was disconnected or stopped.'));
  private readonly beforeUnloadHandler = () => this.release();

  private constructor(
    stream: MediaStream,
    sourceId: string,
    track: MediaStreamTrack,
    format: CameraFormat,
    ownsStream: boolean,
  ) {
    this.stream = stream;
    this.sourceId = sourceId;
    this.track = track;
    this.format = format;
    this.ownsStream = ownsStream;
    this.track.addEventListener('ended', this.trackEndedHandler, { once: true });
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.beforeUnloadHandler, { once: true });
    }
  }

  static async request(sourceId: string) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable in this Chromium build.');
    if (!MediaRecorder.isTypeSupported(MIME_TYPE))
      throw new Error('This Chromium build cannot record VP8 WebM camera video.');
    // Require the chosen device, but leave its format unconstrained. Windows
    // Media Foundation can reject otherwise valid resolution/fps preferences.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: cameraVideoConstraints(sourceId),
    });
    if (!stream.getVideoTracks()[0]) {
      stream.getTracks().forEach((entry) => entry.stop());
      throw new Error('The selected camera did not provide a video track.');
    }
    try {
      await waitForCameraStream(stream);
    } catch (error) {
      stream.getTracks().forEach((entry) => entry.stop());
      throw error;
    }
    return BrowserCameraRecorder.fromReadyStream(sourceId, stream, true);
  }

  static fromReadyStream(sourceId: string, stream: MediaStream, ownsStream = false) {
    if (!MediaRecorder.isTypeSupported(MIME_TYPE))
      throw new Error('This Chromium build cannot record VP8 WebM camera video.');
    deviceId(sourceId);
    const track = stream.getVideoTracks()[0];
    if (!track) {
      if (ownsStream) stream.getTracks().forEach((entry) => entry.stop());
      throw new Error('The selected camera did not provide a video track.');
    }
    const settings = track.getSettings();
    return new BrowserCameraRecorder(
      stream,
      sourceId,
      track,
      {
        codec: 'vp8',
        width: positive(settings.width, 1920),
        height: positive(settings.height, 1080),
        nominalFps: positive(settings.frameRate, 30),
      },
      ownsStream,
    );
  }

  onFatal(handler: (error: Error) => void) {
    this.fatalHandler = handler;
  }

  async start(
    sessionId: string,
    appearance?: CameraAppearance,
    placement?: CameraPlacement,
    timelineStartedAt = performance.now(),
    startNs?: number,
  ) {
    this.appearance = appearance;
    this.placement = placement;
    this.timelineStartedAt = timelineStartedAt;
    this.startFrameCounter();
    await this.startSegment(sessionId, startNs ?? this.nowNs());
  }

  async pause(endNs = this.nowNs()) {
    await this.finishSegment(endNs);
  }

  async resume(sessionId: string, startNs = this.nowNs()) {
    await this.startSegment(sessionId, startNs);
  }

  async stop(endNs = this.nowNs()) {
    try {
      if (this.recorder) await this.finishSegment(endNs);
    } finally {
      this.release();
    }
  }

  async fail(sessionId: string, reason: string) {
    try {
      try {
        if (this.recorder) await this.finishSegment(this.nowNs());
      } catch {
        /* The explicit failure reason is persisted below. */
      }
      await api().failCamera({ sessionId, reason });
    } finally {
      this.release();
    }
  }

  private async startSegment(sessionId: string, startNs: number) {
    if (this.stopped) throw new Error('Camera recording has already stopped.');
    if (this.recorder) throw new Error('Camera segment is already recording.');
    const opened = await api().beginCameraSegment({
      sessionId,
      sourceId: this.sourceId,
      format: {
        ...this.format,
        ...(this.appearance ? { appearance: this.appearance } : {}),
        ...(this.placement ? { placement: this.placement } : {}),
      },
      startNs,
    });
    this.jobId = opened.jobId;
    this.sequence = 0;
    this.segmentStartNs = startNs;
    this.frameCount = 0;
    this.pendingWrites = [];
    this.writeTail = Promise.resolve();
    const recorder = new MediaRecorder(this.stream, { mimeType: MIME_TYPE, videoBitsPerSecond: 8_000_000 });
    recorder.addEventListener('dataavailable', (event) => {
      if (!event.data.size || !this.jobId) return;
      const sequence = this.sequence++;
      const write = this.writeTail.then(async () => {
        const buffer = await event.data.arrayBuffer();
        await api().writeCameraSegment({ jobId: this.jobId!, sequence, data: new Uint8Array(buffer) });
      });
      this.writeTail = write;
      this.pendingWrites.push(write);
      void write.catch((error: unknown) => this.reportFatal(asError(error)));
    });
    recorder.addEventListener(
      'error',
      () => this.reportFatal(new Error('Chromium failed while encoding camera video.')),
      { once: true },
    );
    this.recorder = recorder;
    recorder.start(1000);
  }

  private async finishSegment(endNs: number) {
    const recorder = this.recorder;
    const jobId = this.jobId;
    if (!recorder || !jobId) return;
    await new Promise<void>((resolve, reject) => {
      recorder.addEventListener('stop', () => resolve(), { once: true });
      recorder.addEventListener('error', () => reject(new Error('Chromium failed while finalizing camera video.')), {
        once: true,
      });
      recorder.stop();
    });
    await Promise.all(this.pendingWrites);
    await api().finalizeCameraSegment({
      jobId,
      endNs: Math.max(endNs, this.segmentStartNs),
      metrics: { framesAcquired: this.frameCount, framesReceived: this.frameCount },
    });
    this.frameCount = 0;
    this.recorder = null;
    this.jobId = null;
  }

  private nowNs() {
    return Math.max(0, Math.round((performance.now() - this.timelineStartedAt) * 1_000_000));
  }

  private startFrameCounter() {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = this.stream;
    this.video = video;
    const count = () => {
      if (!this.stopped)
        video.requestVideoFrameCallback(() => {
          this.frameCount += 1;
          count();
        });
    };
    void video
      .play()
      .then(count)
      .catch(() => undefined);
  }

  private reportFatal(error: Error) {
    if (this.stopped) return;
    this.fatalHandler?.(error);
  }

  private release() {
    this.stopped = true;
    this.track.removeEventListener('ended', this.trackEndedHandler);
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    this.video?.pause();
    if (this.video) this.video.srcObject = null;
    this.video = null;
    if (this.ownsStream) this.stream.getTracks().forEach((entry) => entry.stop());
  }
}

export interface CameraRecorderHandle {
  readonly sourceId: string;
  readonly format: CameraFormat;
  onFatal(handler: (error: Error) => void): void;
  start(
    sessionId: string,
    appearance?: CameraAppearance,
    placement?: CameraPlacement,
    timelineStartedAt?: number,
  ): Promise<void>;
  pause(endNs?: number): Promise<void>;
  resume(sessionId: string): Promise<void>;
  stop(endNs?: number): Promise<void>;
  fail(sessionId: string, reason: string): Promise<void>;
}

export class CameraOverlayRecorder implements CameraRecorderHandle {
  private fatalHandler: ((error: Error) => void) | null = null;
  private removeFailureListener: (() => void) | null = null;
  private controlQueue = Promise.resolve();
  private timelineStartedAt = performance.now();
  private stopped = false;
  readonly recordingId: string;
  readonly sourceId: string;
  readonly format: CameraFormat;

  private constructor(recordingId: string, sourceId: string, format: CameraFormat) {
    this.recordingId = recordingId;
    this.sourceId = sourceId;
    this.format = format;
    this.removeFailureListener = api().onCameraRecordingFailure((failure) => {
      if (this.stopped || failure.recordingId !== this.recordingId) return;
      const handler = this.fatalHandler;
      this.release();
      handler?.(new Error(failure.message));
    });
  }

  static async request(sourceId: string) {
    const prepared = await api().controlCameraOverlayRecording({ action: 'prepare', sourceId });
    if (!prepared) throw new Error('The camera overlay returned an invalid preparation result.');
    return new CameraOverlayRecorder(prepared.recordingId, prepared.sourceId, prepared.format);
  }

  onFatal(handler: (error: Error) => void) {
    this.fatalHandler = handler;
  }

  async start(
    sessionId: string,
    appearance?: CameraAppearance,
    placement?: CameraPlacement,
    timelineStartedAt = performance.now(),
  ) {
    this.timelineStartedAt = timelineStartedAt;
    await this.control({
      action: 'start',
      recordingId: this.recordingId,
      sessionId,
      startNs: this.nowNs(),
      appearance,
      placement,
    });
  }

  async pause(endNs = this.nowNs()) {
    await this.control({ action: 'pause', recordingId: this.recordingId, endNs });
  }

  async resume(sessionId: string) {
    await this.control({ action: 'resume', recordingId: this.recordingId, sessionId, startNs: this.nowNs() });
  }

  async stop(endNs = this.nowNs()) {
    if (this.stopped) return;
    try {
      await this.control({ action: 'stop', recordingId: this.recordingId, endNs });
    } finally {
      this.release();
    }
  }

  async fail(sessionId: string, reason: string) {
    if (this.stopped) return;
    try {
      await this.control({ action: 'fail', recordingId: this.recordingId, sessionId, reason });
    } finally {
      this.release();
    }
  }

  private async control(control: CameraRecordingControl) {
    if (this.stopped) throw new Error('Camera recording has already stopped.');
    const operation = this.controlQueue.then(() => api().controlCameraOverlayRecording(control));
    this.controlQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    await operation;
  }

  private nowNs() {
    return Math.max(0, Math.round((performance.now() - this.timelineStartedAt) * 1_000_000));
  }

  private release() {
    this.stopped = true;
    this.removeFailureListener?.();
    this.removeFailureListener = null;
    this.fatalHandler = null;
  }
}

function asError(value: unknown) {
  return value instanceof Error ? value : new Error(String(value));
}

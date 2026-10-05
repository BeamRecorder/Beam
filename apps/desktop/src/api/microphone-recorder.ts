import { MediaSegmentWriter } from './media-segment-writer';
import { stopBrowserMediaRecorder, withMediaDeadline } from './media-recorder-finalization';
import type {
  CaptureSource,
  MicrophoneFailure,
  MicrophoneSegmentFinish,
  MicrophoneSegmentStart,
} from './types/capture-api';
import { enumerateBrowserMediaDevices } from './browser-media-devices';
import {
  MICROPHONE_PREFIX,
  MIME_TYPE,
  microphoneDeviceId,
  normalizedMicrophoneSetting,
} from './browser-microphone-source';

type MicrophoneFormat = MicrophoneSegmentStart['format'];
type MicrophoneApi = {
  beginMicrophoneSegment(payload: MicrophoneSegmentStart): Promise<{ jobId: string }>;
  writeMicrophoneSegment(payload: { jobId: string; sequence: number; data: Uint8Array }): Promise<void>;
  finalizeMicrophoneSegment(payload: MicrophoneSegmentFinish): Promise<void>;
  failMicrophone(payload: MicrophoneFailure): Promise<void>;
};

function api(): MicrophoneApi {
  if (!window.capture) throw new Error('Microphone recording is unavailable outside Electron.');
  return window.capture;
}

export { microphoneDeviceId, normalizedMicrophoneSetting } from './browser-microphone-source';

export async function listBrowserMicrophones(): Promise<CaptureSource[]> {
  const devices = await enumerateBrowserMediaDevices();
  const audioInputs = devices.filter((device) => device.kind === 'audioinput');
  return audioInputs.map((device, index) => ({
    id: `${MICROPHONE_PREFIX}${device.deviceId}`,
    kind: 'microphone' as const,
    label: device.label || `Microphone ${index + 1}`,
    isDefault: index === 0,
  }));
}

export class BrowserMicrophoneRecorder {
  private recorder: MediaRecorder | null = null;
  private jobId: string | null = null;
  private segmentStartNs = 0;
  private timelineStartedAt = 0;
  private writer: MediaSegmentWriter | null = null;
  private fatalReported = false;
  private fatalHandler: ((error: Error) => void) | null = null;
  private stopped = false;
  private released = false;
  readonly sourceId: string;
  readonly format: MicrophoneFormat;
  private readonly stream: MediaStream;
  private readonly track: MediaStreamTrack;
  private readonly audioContext: AudioContext;
  private readonly gain: GainNode;

  private constructor(
    stream: MediaStream,
    sourceId: string,
    track: MediaStreamTrack,
    format: MicrophoneFormat,
    audioContext: AudioContext,
    gain: GainNode,
  ) {
    this.stream = stream;
    this.sourceId = sourceId;
    this.track = track;
    this.format = format;
    this.audioContext = audioContext;
    this.gain = gain;
    this.track.addEventListener(
      'ended',
      () => this.reportFatal(new Error('The selected microphone was disconnected or stopped.')),
      { once: true },
    );
    this.track.addEventListener('mute', () => this.fadeTo(0), {
      passive: true,
    });
    this.track.addEventListener('unmute', () => this.fadeTo(1), {
      passive: true,
    });
  }

  static async request(sourceId: string) {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error('Microphone access is unavailable in this Chromium build.');
    if (!MediaRecorder.isTypeSupported(MIME_TYPE))
      throw new Error('This Chromium build cannot record Opus WebM microphone audio.');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: microphoneDeviceId(sourceId) },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
    const track = stream.getAudioTracks()[0];
    if (!track) {
      stream.getTracks().forEach((entry) => entry.stop());
      throw new Error('The selected microphone did not provide an audio track.');
    }
    const settings = track.getSettings();
    const audioContext = new AudioContext();
    try {
      const source = audioContext.createMediaStreamSource(stream);
      const gain = audioContext.createGain();
      const destination = audioContext.createMediaStreamDestination();
      gain.gain.value = track.muted ? 0 : 1;
      source.connect(gain).connect(destination);
      await audioContext.resume();
      return new BrowserMicrophoneRecorder(
        destination.stream,
        sourceId,
        track,
        {
          codec: 'opus',
          sampleRate: normalizedMicrophoneSetting(settings.sampleRate),
          channels: normalizedMicrophoneSetting(settings.channelCount),
        },
        audioContext,
        gain,
      );
    } catch (error) {
      stream.getTracks().forEach((entry) => entry.stop());
      await audioContext.close().catch(() => undefined);
      throw error;
    }
  }

  onFatal(handler: (error: Error) => void) {
    this.fatalHandler = handler;
  }

  async start(sessionId: string) {
    this.timelineStartedAt = performance.now();
    await this.startSegment(sessionId, 0);
  }

  async pause(endNs = this.nowNs()) {
    await this.finishSegment(endNs);
  }

  async resume(sessionId: string) {
    await this.startSegment(sessionId, this.nowNs());
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
      if (this.recorder) await this.finishSegment(this.nowNs());
    } catch {
      /* The explicit failure is persisted below. */
    }
    try {
      await withMediaDeadline(
        api().failMicrophone({
          sessionId,
          sourceId: this.sourceId,
          format: this.format,
          reason,
        }),
        'Recording failure reporting',
      );
    } finally {
      this.release();
    }
  }

  private async startSegment(sessionId: string, startNs: number) {
    if (this.stopped) throw new Error('Microphone recording has already stopped.');
    if (this.recorder) throw new Error('Microphone segment is already recording.');
    const opened = await api().beginMicrophoneSegment({
      sessionId,
      sourceId: this.sourceId,
      format: this.format,
      startNs,
    });
    this.jobId = opened.jobId;
    this.segmentStartNs = startNs;
    const jobId = opened.jobId;
    const writer = new MediaSegmentWriter({
      write: (data, sequence) => api().writeMicrophoneSegment({ jobId, sequence, data }),
      onError: (error) => this.reportFatal(error),
    });
    this.writer = writer;
    const recorder = new MediaRecorder(this.stream, {
      mimeType: MIME_TYPE,
      audioBitsPerSecond: 128_000,
    });
    recorder.addEventListener('dataavailable', (event) => writer.enqueue(event.data));
    recorder.addEventListener(
      'error',
      () => this.reportFatal(new Error('Chromium failed while encoding microphone audio.')),
      { once: true },
    );
    this.recorder = recorder;
    recorder.start(1000);
  }

  private async finishSegment(endNs: number) {
    const recorder = this.recorder;
    const jobId = this.jobId;
    if (!recorder || !jobId) return;
    await stopBrowserMediaRecorder(recorder, 'Microphone encoder finalization');
    await this.writer?.flush();
    await withMediaDeadline(
      api().finalizeMicrophoneSegment({
        jobId,
        endNs: Math.max(endNs, this.segmentStartNs),
        metrics: {},
      }),
      'Microphone segment finalization',
    );
    this.recorder = null;
    this.jobId = null;
    this.writer?.abort();
    this.writer = null;
  }

  private nowNs() {
    return Math.max(0, Math.round((performance.now() - this.timelineStartedAt) * 1_000_000));
  }

  private fadeTo(value: number) {
    const now = this.audioContext.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(value, now + 0.015);
  }

  private reportFatal(error: Error) {
    if (this.stopped || this.fatalReported) return;
    this.fatalReported = true;
    this.fatalHandler?.(error);
  }

  private release() {
    if (this.released) return;
    this.released = true;
    this.stopped = true;
    this.writer?.abort();
    if (this.recorder && this.recorder.state !== 'inactive') {
      // Finalization can fail without Chromium emitting its stop event.
      try {
        this.recorder.stop();
      } catch {
        /* Tracks are released below. */
      }
    }
    this.recorder = null;
    this.jobId = null;
    this.stream.getTracks().forEach((entry) => entry.stop());
    if (this.audioContext.state !== 'closed') void this.audioContext.close().catch(() => undefined);
  }
}

export async function recordMicrophoneFailure(sessionId: string, sourceId: string, reason: string) {
  await api().failMicrophone({ sessionId, sourceId, reason });
}

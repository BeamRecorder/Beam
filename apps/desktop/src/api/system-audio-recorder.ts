import { MediaSegmentWriter } from './media-segment-writer';
import { stopBrowserMediaRecorder, withMediaDeadline } from './media-recorder-finalization';
import type { CaptureSource, MediaSegmentChunk } from './types/capture-api';

const MIME_TYPE = 'audio/webm;codecs=opus';
const SOURCE_ID = 'system-audio:chromium:desktop-loopback';

type SystemAudioFormat = {
  codec: 'opus';
  sampleRate: number;
  channels: number;
};
type SystemAudioApi = {
  beginSystemAudioSegment(payload: {
    sessionId: string;
    sourceId: string;
    format: SystemAudioFormat;
    startNs: number;
  }): Promise<{ jobId: string }>;
  writeSystemAudioSegment(payload: MediaSegmentChunk): Promise<void>;
  finalizeSystemAudioSegment(payload: { jobId: string; endNs: number; metrics: Record<string, number> }): Promise<void>;
  failSystemAudio(payload: {
    sessionId: string;
    sourceId: string;
    reason: string;
    format?: SystemAudioFormat;
  }): Promise<void>;
};

function api(): SystemAudioApi {
  if (!window.capture) throw new Error('System audio recording is unavailable outside Electron.');
  return window.capture;
}

export function normalizedSystemAudioSetting(value: number | undefined) {
  return Number.isFinite(value) && value! >= 0 ? Math.round(value!) : 0;
}

export function systemAudioSource(): CaptureSource {
  return {
    id: SOURCE_ID,
    kind: 'system-audio',
    label: 'System audio',
    isDefault: true,
  };
}

export class BrowserSystemAudioRecorder {
  private recorder: MediaRecorder | null = null;
  private jobId: string | null = null;
  private startedAt = 0;
  private segmentStartNs = 0;
  private writer: MediaSegmentWriter | null = null;
  private fatalReported = false;
  private fatalHandler: ((error: Error) => void) | null = null;
  private stopped = false;
  readonly sourceId = SOURCE_ID;
  readonly format: SystemAudioFormat;
  private readonly stream: MediaStream;

  private constructor(stream: MediaStream, track: MediaStreamTrack, format: SystemAudioFormat) {
    this.stream = stream;
    this.format = format;
    track.addEventListener('ended', () => this.reportFatal(new Error('System audio sharing was stopped.')), {
      once: true,
    });
  }

  static async request() {
    if (!navigator.mediaDevices?.getDisplayMedia)
      throw new Error('System audio capture is unavailable in this Chromium build.');
    if (!MediaRecorder.isTypeSupported(MIME_TYPE))
      throw new Error('This Chromium build cannot record Opus WebM system audio.');
    const display = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true,
    });
    const track = display.getAudioTracks()[0];
    display.getVideoTracks().forEach((entry) => entry.stop());
    if (!track) {
      display.getTracks().forEach((entry) => entry.stop());
      throw new Error('The selected desktop source did not provide system audio.');
    }
    const settings = track.getSettings();
    return new BrowserSystemAudioRecorder(new MediaStream([track]), track, {
      codec: 'opus',
      sampleRate: normalizedSystemAudioSetting(settings.sampleRate),
      channels: normalizedSystemAudioSetting(settings.channelCount),
    });
  }

  onFatal(handler: (error: Error) => void) {
    this.fatalHandler = handler;
  }
  async start(sessionId: string) {
    this.startedAt = performance.now();
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
      /* The terminal error below remains authoritative. */
    }
    try {
      await withMediaDeadline(
        api().failSystemAudio({
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
    if (this.stopped) throw new Error('System audio recording has already stopped.');
    if (this.recorder) throw new Error('System audio segment is already recording.');
    const opened = await api().beginSystemAudioSegment({
      sessionId,
      sourceId: this.sourceId,
      format: this.format,
      startNs,
    });
    this.jobId = opened.jobId;
    this.segmentStartNs = startNs;
    const jobId = opened.jobId;
    const writer = new MediaSegmentWriter({
      write: (data, sequence) => api().writeSystemAudioSegment({ jobId, sequence, data }),
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
      () => this.reportFatal(new Error('Chromium failed while encoding system audio.')),
      { once: true },
    );
    this.recorder = recorder;
    recorder.start(1000);
  }

  private async finishSegment(endNs: number) {
    const recorder = this.recorder;
    const jobId = this.jobId;
    if (!recorder || !jobId) return;
    await stopBrowserMediaRecorder(recorder, 'SystemAudio encoder finalization');
    await this.writer?.flush();
    await withMediaDeadline(
      api().finalizeSystemAudioSegment({
        jobId,
        endNs: Math.max(endNs, this.segmentStartNs),
        metrics: {},
      }),
      'SystemAudio segment finalization',
    );
    this.recorder = null;
    this.jobId = null;
    this.writer?.abort();
    this.writer = null;
  }

  private nowNs() {
    return Math.max(0, Math.round((performance.now() - this.startedAt) * 1_000_000));
  }
  private reportFatal(error: Error) {
    if (this.stopped || this.fatalReported) return;
    this.fatalReported = true;
    this.fatalHandler?.(error);
  }
  private release() {
    if (this.stopped) return;
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
  }
}

export async function recordSystemAudioFailure(sessionId: string, reason: string) {
  await api().failSystemAudio({ sessionId, sourceId: SOURCE_ID, reason });
}

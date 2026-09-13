import type { MediaAsset } from '~/media/shared/composition-types';
import { capture } from './capture';
import { MIME_TYPE, requestBrowserMicrophoneSource, type BrowserMicrophoneSource } from './browser-microphone-source';

export class ProjectVoiceoverRecorder {
  private readonly source: BrowserMicrophoneSource;
  private recorder: MediaRecorder | null = null;
  private recordingId: string | null = null;
  private sequence = 0;
  private writeTail: Promise<void> = Promise.resolve();
  private discarding = false;
  private stopped = false;
  private fatalHandler: ((error: Error) => void) | null = null;
  private fatalReported = false;

  private constructor(source: BrowserMicrophoneSource) {
    this.source = source;
    source.track.addEventListener(
      'ended',
      () => this.reportFatal(new Error('The selected microphone was disconnected or stopped.')),
      { once: true },
    );
    source.track.addEventListener('mute', () => source.fadeTo(0), { passive: true });
    source.track.addEventListener('unmute', () => source.fadeTo(1), { passive: true });
  }

  static async request(sourceId: string) {
    return new ProjectVoiceoverRecorder(await requestBrowserMicrophoneSource(sourceId));
  }

  get sourceId() {
    return this.source.sourceId;
  }

  sampleWaveform(sampleCount?: number) {
    return this.source.sampleWaveform(sampleCount);
  }

  onFatal(handler: (error: Error) => void) {
    this.fatalHandler = handler;
  }

  async start(projectId: string) {
    if (this.stopped || this.recorder) throw new Error('Voice-over recording cannot be started.');
    const opened = await capture.beginProjectVoiceover({
      projectId,
      sourceId: this.source.sourceId,
      format: this.source.format,
    });
    this.recordingId = opened.recordingId;
    this.sequence = 0;
    this.writeTail = Promise.resolve();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(this.source.stream, { mimeType: MIME_TYPE, audioBitsPerSecond: 128_000 });
    } catch (error) {
      await capture.abortProjectVoiceover(opened.recordingId).catch(() => undefined);
      this.recordingId = null;
      throw error;
    }
    recorder.addEventListener('dataavailable', (event) => {
      if (!event.data.size || !this.recordingId || this.discarding) return;
      const sequence = this.sequence++;
      const write = this.writeTail.then(async () => {
        const data = new Uint8Array(await event.data.arrayBuffer());
        await capture.writeProjectVoiceoverChunk({ recordingId: this.recordingId!, sequence, data });
      });
      this.writeTail = write;
      void write.catch((error: unknown) => this.reportFatal(asError(error)));
    });
    recorder.addEventListener('error', () => this.reportFatal(new Error('Voice-over encoding failed.')), {
      once: true,
    });
    this.recorder = recorder;
    try {
      recorder.start(250);
    } catch (error) {
      this.recorder = null;
      await capture.abortProjectVoiceover(opened.recordingId).catch(() => undefined);
      this.recordingId = null;
      throw error;
    }
  }

  pause() {
    if (this.recorder?.state !== 'recording') return;
    this.recorder.pause();
  }

  resume() {
    if (this.recorder?.state !== 'paused') return;
    this.recorder.resume();
  }

  async stop(name?: string): Promise<MediaAsset> {
    const recorder = this.recorder;
    const recordingId = this.recordingId;
    if (!recorder || !recordingId) throw new Error('Voice-over recording is not active.');
    try {
      await stopMediaRecorder(recorder);
      await this.writeTail;
      return await capture.finalizeProjectVoiceover({ recordingId, name });
    } catch (error) {
      await capture.abortProjectVoiceover(recordingId).catch(() => undefined);
      throw error;
    } finally {
      this.recorder = null;
      this.recordingId = null;
      this.stopped = true;
      this.source.release();
    }
  }

  async discard() {
    if (this.stopped) return;
    this.discarding = true;
    const recordingId = this.recordingId;
    if (this.recorder && this.recorder.state !== 'inactive')
      await stopMediaRecorder(this.recorder).catch(() => undefined);
    await Promise.allSettled([this.writeTail]);
    if (recordingId) await capture.abortProjectVoiceover(recordingId).catch(() => undefined);
    this.recorder = null;
    this.recordingId = null;
    this.stopped = true;
    this.source.release();
  }

  releasePreview() {
    if (this.recorder || this.stopped) return;
    this.stopped = true;
    this.source.release();
  }

  private reportFatal(error: Error) {
    if (this.stopped || this.fatalReported) return;
    this.fatalReported = true;
    this.fatalHandler?.(error);
  }
}

function stopMediaRecorder(recorder: MediaRecorder) {
  if (recorder.state === 'inactive') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    recorder.addEventListener('stop', () => resolve(), { once: true });
    recorder.addEventListener('error', () => reject(new Error('Voice-over finalization failed.')), { once: true });
    recorder.stop();
  });
}

function asError(value: unknown) {
  return value instanceof Error ? value : new Error(String(value));
}

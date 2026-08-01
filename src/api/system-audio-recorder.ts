import type { CaptureSource, MediaSegmentChunk } from './types/capture-api'

const MIME_TYPE = 'audio/webm;codecs=opus'
const SOURCE_ID = 'system-audio:chromium:desktop-loopback'

type SystemAudioFormat = { codec: 'opus'; sampleRate: number; channels: number }
type SystemAudioApi = {
  beginSystemAudioSegment(payload: { sessionId: string; sourceId: string; format: SystemAudioFormat; startNs: number }): Promise<{ jobId: string }>
  writeSystemAudioSegment(payload: MediaSegmentChunk): Promise<void>
  finalizeSystemAudioSegment(payload: { jobId: string; endNs: number; metrics: Record<string, number> }): Promise<void>
  failSystemAudio(payload: { sessionId: string; sourceId: string; reason: string; format?: SystemAudioFormat }): Promise<void>
}

function api(): SystemAudioApi {
  if (!window.capture) throw new Error('System audio recording is unavailable outside Electron.')
  return window.capture
}

export function normalizedSystemAudioSetting(value: number | undefined) {
  return Number.isFinite(value) && value! >= 0 ? Math.round(value!) : 0
}

export function systemAudioSource(): CaptureSource {
  return { id: SOURCE_ID, kind: 'system-audio', label: 'System audio', isDefault: true }
}

export class BrowserSystemAudioRecorder {
  private recorder: MediaRecorder | null = null
  private jobId: string | null = null
  private sequence = 0
  private startedAt = 0
  private segmentStartNs = 0
  private writes: Promise<void>[] = []
  private writeTail: Promise<void> = Promise.resolve()
  private fatalHandler: ((error: Error) => void) | null = null
  private stopped = false
  readonly sourceId = SOURCE_ID
  readonly format: SystemAudioFormat
  private readonly stream: MediaStream

  private constructor(stream: MediaStream, track: MediaStreamTrack, format: SystemAudioFormat) {
    this.stream = stream
    this.format = format
    track.addEventListener('ended', () => this.reportFatal(new Error('System audio sharing was stopped.')), { once: true })
  }

  static async request() {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('System audio capture is unavailable in this Chromium build.')
    if (!MediaRecorder.isTypeSupported(MIME_TYPE)) throw new Error('This Chromium build cannot record Opus WebM system audio.')
    const display = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
    const track = display.getAudioTracks()[0]
    display.getVideoTracks().forEach((entry) => entry.stop())
    if (!track) { display.getTracks().forEach((entry) => entry.stop()); throw new Error('The selected desktop source did not provide system audio.') }
    const settings = track.getSettings()
    return new BrowserSystemAudioRecorder(new MediaStream([track]), track, { codec: 'opus', sampleRate: normalizedSystemAudioSetting(settings.sampleRate), channels: normalizedSystemAudioSetting(settings.channelCount) })
  }

  onFatal(handler: (error: Error) => void) { this.fatalHandler = handler }
  async start(sessionId: string) { this.startedAt = performance.now(); await this.startSegment(sessionId, 0) }
  async pause() { await this.finishSegment(this.nowNs()) }
  async resume(sessionId: string) { await this.startSegment(sessionId, this.nowNs()) }
  async stop() { if (this.recorder) await this.finishSegment(this.nowNs()); this.release() }
  async fail(sessionId: string, reason: string) {
    try { if (this.recorder) await this.finishSegment(this.nowNs()) } catch { /* The terminal error below remains authoritative. */ }
    await api().failSystemAudio({ sessionId, sourceId: this.sourceId, format: this.format, reason })
    this.release()
  }

  private async startSegment(sessionId: string, startNs: number) {
    if (this.stopped) throw new Error('System audio recording has already stopped.')
    if (this.recorder) throw new Error('System audio segment is already recording.')
    const opened = await api().beginSystemAudioSegment({ sessionId, sourceId: this.sourceId, format: this.format, startNs })
    this.jobId = opened.jobId; this.sequence = 0; this.segmentStartNs = startNs; this.writes = []; this.writeTail = Promise.resolve()
    const recorder = new MediaRecorder(this.stream, { mimeType: MIME_TYPE, audioBitsPerSecond: 128_000 })
    recorder.addEventListener('dataavailable', (event) => this.queueChunk(event.data))
    recorder.addEventListener('error', () => this.reportFatal(new Error('Chromium failed while encoding system audio.')), { once: true })
    this.recorder = recorder
    recorder.start(1000)
  }

  private queueChunk(chunk: Blob) {
    if (!chunk.size || !this.jobId) return
    const sequence = this.sequence++
    const write = this.writeTail.then(async () => api().writeSystemAudioSegment({ jobId: this.jobId!, sequence, data: new Uint8Array(await chunk.arrayBuffer()) }))
    this.writeTail = write; this.writes.push(write)
    void write.catch((error: unknown) => this.reportFatal(error instanceof Error ? error : new Error(String(error))))
  }

  private async finishSegment(endNs: number) {
    const recorder = this.recorder; const jobId = this.jobId
    if (!recorder || !jobId) return
    await new Promise<void>((resolve, reject) => { recorder.addEventListener('stop', () => resolve(), { once: true }); recorder.addEventListener('error', () => reject(new Error('Chromium failed while finalizing system audio.')), { once: true }); recorder.stop() })
    await Promise.all(this.writes)
    await api().finalizeSystemAudioSegment({ jobId, endNs: Math.max(endNs, this.segmentStartNs), metrics: {} })
    this.recorder = null; this.jobId = null
  }

  private nowNs() { return Math.max(0, Math.round((performance.now() - this.startedAt) * 1_000_000)) }
  private reportFatal(error: Error) { if (!this.stopped) this.fatalHandler?.(error) }
  private release() { this.stopped = true; this.stream.getTracks().forEach((entry) => entry.stop()) }
}

export async function recordSystemAudioFailure(sessionId: string, reason: string) {
  await api().failSystemAudio({ sessionId, sourceId: SOURCE_ID, reason })
}

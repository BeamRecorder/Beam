import type { CaptureSource, MicrophoneFailure, MicrophoneSegmentFinish, MicrophoneSegmentStart } from './types/capture-api'

const MIME_TYPE = 'audio/webm;codecs=opus'
const MICROPHONE_PREFIX = 'microphone:chromium:'

type MicrophoneFormat = MicrophoneSegmentStart['format']
type MicrophoneApi = {
  beginMicrophoneSegment(payload: MicrophoneSegmentStart): Promise<{ jobId: string }>
  writeMicrophoneSegment(payload: { jobId: string; sequence: number; data: Uint8Array }): Promise<void>
  finalizeMicrophoneSegment(payload: MicrophoneSegmentFinish): Promise<void>
  failMicrophone(payload: MicrophoneFailure): Promise<void>
}

function api(): MicrophoneApi {
  if (!window.capture) throw new Error('Microphone recording is unavailable outside Electron.')
  return window.capture
}

export function microphoneDeviceId(sourceId: string) {
  if (!sourceId.startsWith(MICROPHONE_PREFIX) || sourceId.length === MICROPHONE_PREFIX.length) throw new Error('The selected microphone is invalid.')
  return sourceId.slice(MICROPHONE_PREFIX.length)
}

export function normalizedMicrophoneSetting(value: number | undefined) {
  return Number.isFinite(value) && value! >= 0 ? Math.round(value!) : 0
}

export async function listBrowserMicrophones(): Promise<CaptureSource[]> {
  if (!navigator.mediaDevices?.enumerateDevices) throw new Error('Microphone discovery is unavailable in this Chromium build.')
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((device) => device.kind === 'audioinput').map((device, index) => ({
    id: `${MICROPHONE_PREFIX}${device.deviceId}`,
    kind: 'microphone' as const,
    label: device.label || `Microphone ${index + 1}`,
    isDefault: index === 0,
  }))
}

export class BrowserMicrophoneRecorder {
  private recorder: MediaRecorder | null = null
  private jobId: string | null = null
  private sequence = 0
  private segmentStartNs = 0
  private timelineStartedAt = 0
  private pendingWrites: Promise<void>[] = []
  private writeTail: Promise<void> = Promise.resolve()
  private fatalHandler: ((error: Error) => void) | null = null
  private stopped = false
  readonly sourceId: string
  readonly format: MicrophoneFormat
  private readonly stream: MediaStream
  private readonly track: MediaStreamTrack
  private readonly audioContext: AudioContext
  private readonly gain: GainNode

  private constructor(stream: MediaStream, sourceId: string, track: MediaStreamTrack, format: MicrophoneFormat, audioContext: AudioContext, gain: GainNode) {
    this.stream = stream
    this.sourceId = sourceId
    this.track = track
    this.format = format
    this.audioContext = audioContext
    this.gain = gain
    this.track.addEventListener('ended', () => this.reportFatal(new Error('The selected microphone was disconnected or stopped.')), { once: true })
    this.track.addEventListener('mute', () => this.fadeTo(0), { passive: true })
    this.track.addEventListener('unmute', () => this.fadeTo(1), { passive: true })
  }

  static async request(sourceId: string) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access is unavailable in this Chromium build.')
    if (!MediaRecorder.isTypeSupported(MIME_TYPE)) throw new Error('This Chromium build cannot record Opus WebM microphone audio.')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: microphoneDeviceId(sourceId) }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false })
    const track = stream.getAudioTracks()[0]
    if (!track) { stream.getTracks().forEach((entry) => entry.stop()); throw new Error('The selected microphone did not provide an audio track.') }
    const settings = track.getSettings()
    const audioContext = new AudioContext()
    try {
      const source = audioContext.createMediaStreamSource(stream)
      const gain = audioContext.createGain()
      const destination = audioContext.createMediaStreamDestination()
      gain.gain.value = track.muted ? 0 : 1
      source.connect(gain).connect(destination)
      await audioContext.resume()
      return new BrowserMicrophoneRecorder(destination.stream, sourceId, track, { codec: 'opus', sampleRate: normalizedMicrophoneSetting(settings.sampleRate), channels: normalizedMicrophoneSetting(settings.channelCount) }, audioContext, gain)
    } catch (error) {
      stream.getTracks().forEach((entry) => entry.stop())
      await audioContext.close().catch(() => undefined)
      throw error
    }
  }

  onFatal(handler: (error: Error) => void) { this.fatalHandler = handler }

  async start(sessionId: string) {
    this.timelineStartedAt = performance.now()
    await this.startSegment(sessionId, 0)
  }

  async pause() { await this.finishSegment(this.nowNs()) }

  async resume(sessionId: string) { await this.startSegment(sessionId, this.nowNs()) }

  async stop() {
    if (this.recorder) await this.finishSegment(this.nowNs())
    this.release()
  }

  async fail(sessionId: string, reason: string) {
    try { if (this.recorder) await this.finishSegment(this.nowNs()) } catch { /* The explicit failure is persisted below. */ }
    await api().failMicrophone({ sessionId, sourceId: this.sourceId, format: this.format, reason })
    this.release()
  }

  private async startSegment(sessionId: string, startNs: number) {
    if (this.stopped) throw new Error('Microphone recording has already stopped.')
    if (this.recorder) throw new Error('Microphone segment is already recording.')
    const opened = await api().beginMicrophoneSegment({ sessionId, sourceId: this.sourceId, format: this.format, startNs })
    this.jobId = opened.jobId
    this.sequence = 0
    this.segmentStartNs = startNs
    this.pendingWrites = []
    this.writeTail = Promise.resolve()
    const recorder = new MediaRecorder(this.stream, { mimeType: MIME_TYPE, audioBitsPerSecond: 128_000 })
    recorder.addEventListener('dataavailable', (event) => {
      if (!event.data.size || !this.jobId) return
      const sequence = this.sequence++
      const write = this.writeTail.then(async () => {
        const buffer = await event.data.arrayBuffer()
        await api().writeMicrophoneSegment({ jobId: this.jobId!, sequence, data: new Uint8Array(buffer) })
      })
      this.writeTail = write
      this.pendingWrites.push(write)
      void write.catch((error: unknown) => this.reportFatal(asError(error)))
    })
    recorder.addEventListener('error', () => this.reportFatal(new Error('Chromium failed while encoding microphone audio.')), { once: true })
    this.recorder = recorder
    recorder.start(1000)
  }

  private async finishSegment(endNs: number) {
    const recorder = this.recorder
    const jobId = this.jobId
    if (!recorder || !jobId) return
    await new Promise<void>((resolve, reject) => {
      recorder.addEventListener('stop', () => resolve(), { once: true })
      recorder.addEventListener('error', () => reject(new Error('Chromium failed while finalizing microphone audio.')), { once: true })
      recorder.stop()
    })
    await Promise.all(this.pendingWrites)
    await api().finalizeMicrophoneSegment({ jobId, endNs: Math.max(endNs, this.segmentStartNs), metrics: {} })
    this.recorder = null
    this.jobId = null
  }

  private nowNs() { return Math.max(0, Math.round((performance.now() - this.timelineStartedAt) * 1_000_000)) }

  private fadeTo(value: number) {
    const now = this.audioContext.currentTime
    this.gain.gain.cancelScheduledValues(now)
    this.gain.gain.setValueAtTime(this.gain.gain.value, now)
    this.gain.gain.linearRampToValueAtTime(value, now + 0.015)
  }

  private reportFatal(error: Error) {
    if (!this.stopped) this.fatalHandler?.(error)
  }

  private release() {
    this.stopped = true
    this.stream.getTracks().forEach((entry) => entry.stop())
    this.track.stop()
    void this.audioContext.close()
  }
}

export async function recordMicrophoneFailure(sessionId: string, sourceId: string, reason: string) {
  await api().failMicrophone({ sessionId, sourceId, reason })
}

function asError(value: unknown) { return value instanceof Error ? value : new Error(String(value)) }

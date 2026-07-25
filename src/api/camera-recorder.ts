import type { CaptureSource } from './types/capture-api'

const MIME_TYPE = 'video/webm;codecs=vp8'
const CAMERA_PREFIX = 'camera:chromium:'

export type CameraPlacement = { x: number; y: number; width: number; height: number }
type CameraFormat = { codec: 'vp8'; width: number; height: number; nominalFps: number }
export type CameraAppearance = { shadowSize: 'none' | 'sm' | 'md' | 'lg'; cornerRadius: 'none' | 'sm' | 'md' | 'lg' | 'full' }
type CameraSegmentApi = {
  beginCameraSegment(payload: { sessionId: string; sourceId: string; format: CameraFormat & { appearance?: CameraAppearance; placement?: CameraPlacement }; startNs: number }): Promise<{ jobId: string }>
  writeCameraSegment(payload: { jobId: string; sequence: number; data: Uint8Array }): Promise<void>
  finalizeCameraSegment(payload: { jobId: string; endNs: number; metrics: Record<string, number> }): Promise<void>
  failCamera(payload: { sessionId: string; reason: string }): Promise<void>
}

function api(): CameraSegmentApi {
  if (!window.capture) throw new Error('Camera recording is unavailable outside Electron.')
  return window.capture
}

function deviceId(sourceId: string) {
  if (!sourceId.startsWith(CAMERA_PREFIX) || sourceId.length === CAMERA_PREFIX.length) throw new Error('The selected camera is invalid.')
  return sourceId.slice(CAMERA_PREFIX.length)
}

function positive(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && value! > 0 ? Math.round(value!) : fallback
}

export async function listBrowserCameras(): Promise<CaptureSource[]> {
  if (!navigator.mediaDevices?.enumerateDevices) throw new Error('Camera discovery is unavailable in this Chromium build.')
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((device) => device.kind === 'videoinput').map((device, index) => ({
    id: `${CAMERA_PREFIX}${device.deviceId}`,
    kind: 'camera' as const,
    label: device.label || `Camera ${index + 1}`,
    isDefault: index === 0,
  }))
}

export class BrowserCameraRecorder {
  private recorder: MediaRecorder | null = null
  private jobId: string | null = null
  private sequence = 0
  private segmentStartNs = 0
  private timelineStartedAt = 0
  private frameCount = 0
  private video: HTMLVideoElement | null = null
  private pendingWrites: Promise<void>[] = []
  private writeTail: Promise<void> = Promise.resolve()
  private fatalHandler: ((error: Error) => void) | null = null
  private stopped = false
  private appearance: CameraAppearance | undefined
  private placement: CameraPlacement | undefined
  readonly sourceId: string
  readonly format: CameraFormat
  private readonly stream: MediaStream
  private readonly track: MediaStreamTrack

  private constructor(stream: MediaStream, sourceId: string, track: MediaStreamTrack, format: CameraFormat) {
    this.stream = stream
    this.sourceId = sourceId
    this.track = track
    this.format = format
    this.track.addEventListener('ended', () => this.reportFatal(new Error('The selected camera was disconnected or stopped.')), { once: true })
  }

  static async request(sourceId: string) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable in this Chromium build.')
    if (!MediaRecorder.isTypeSupported(MIME_TYPE)) throw new Error('This Chromium build cannot record VP8 WebM camera video.')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: deviceId(sourceId) }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } } })
    const track = stream.getVideoTracks()[0]
    if (!track) { stream.getTracks().forEach((entry) => entry.stop()); throw new Error('The selected camera did not provide a video track.') }
    const settings = track.getSettings()
    return new BrowserCameraRecorder(stream, sourceId, track, { codec: 'vp8', width: positive(settings.width, 1920), height: positive(settings.height, 1080), nominalFps: positive(settings.frameRate, 30) })
  }

  onFatal(handler: (error: Error) => void) { this.fatalHandler = handler }

  async start(sessionId: string, appearance?: CameraAppearance, placement?: CameraPlacement, timelineStartedAt = performance.now()) {
    this.appearance = appearance
    this.placement = placement
    this.timelineStartedAt = timelineStartedAt
    this.startFrameCounter()
    await this.startSegment(sessionId, 0)
  }

  async pause() { await this.finishSegment(this.nowNs()) }

  async resume(sessionId: string) { await this.startSegment(sessionId, this.nowNs()) }

  async stop() {
    if (this.recorder) await this.finishSegment(this.nowNs())
    this.release()
  }

  async fail(sessionId: string, reason: string) {
    try { if (this.recorder) await this.finishSegment(this.nowNs()) } catch { /* The explicit failure reason is persisted below. */ }
    await api().failCamera({ sessionId, reason })
    this.release()
  }

  private async startSegment(sessionId: string, startNs: number) {
    if (this.stopped) throw new Error('Camera recording has already stopped.')
    if (this.recorder) throw new Error('Camera segment is already recording.')
    const opened = await api().beginCameraSegment({ sessionId, sourceId: this.sourceId, format: { ...this.format, ...(this.appearance ? { appearance: this.appearance } : {}), ...(this.placement ? { placement: this.placement } : {}) }, startNs })
    this.jobId = opened.jobId
    this.sequence = 0
    this.segmentStartNs = startNs
    this.frameCount = 0
    this.pendingWrites = []
    this.writeTail = Promise.resolve()
    const recorder = new MediaRecorder(this.stream, { mimeType: MIME_TYPE, videoBitsPerSecond: 8_000_000 })
    recorder.addEventListener('dataavailable', (event) => {
      if (!event.data.size || !this.jobId) return
      const sequence = this.sequence++
      const write = this.writeTail.then(async () => {
        const buffer = await event.data.arrayBuffer()
        await api().writeCameraSegment({ jobId: this.jobId!, sequence, data: new Uint8Array(buffer) })
      })
      this.writeTail = write
      this.pendingWrites.push(write)
      void write.catch((error: unknown) => this.reportFatal(asError(error)))
    })
    recorder.addEventListener('error', () => this.reportFatal(new Error('Chromium failed while encoding camera video.')), { once: true })
    this.recorder = recorder
    recorder.start(1000)
  }

  private async finishSegment(endNs: number) {
    const recorder = this.recorder
    const jobId = this.jobId
    if (!recorder || !jobId) return
    await new Promise<void>((resolve, reject) => {
      recorder.addEventListener('stop', () => resolve(), { once: true })
      recorder.addEventListener('error', () => reject(new Error('Chromium failed while finalizing camera video.')), { once: true })
      recorder.stop()
    })
    await Promise.all(this.pendingWrites)
    await api().finalizeCameraSegment({ jobId, endNs: Math.max(endNs, this.segmentStartNs), metrics: { framesAcquired: this.frameCount, framesReceived: this.frameCount } })
    this.frameCount = 0
    this.recorder = null
    this.jobId = null
  }

  private nowNs() { return Math.max(0, Math.round((performance.now() - this.timelineStartedAt) * 1_000_000)) }

  private startFrameCounter() {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = this.stream
    this.video = video
    const count = () => { if (!this.stopped) video.requestVideoFrameCallback(() => { this.frameCount += 1; count() }) }
    void video.play().then(count).catch(() => undefined)
  }

  private reportFatal(error: Error) {
    if (this.stopped) return
    this.fatalHandler?.(error)
  }

  private release() {
    this.stopped = true
    this.video?.pause()
    if (this.video) this.video.srcObject = null
    this.video = null
    this.stream.getTracks().forEach((entry) => entry.stop())
  }
}

function asError(value: unknown) { return value instanceof Error ? value : new Error(String(value)) }

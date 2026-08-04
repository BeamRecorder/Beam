import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserCameraRecorder, listBrowserCameras } from '../camera-recorder'

type Listener = (...args: unknown[]) => void

class FakeMediaRecorder {
  static supported = true
  static instances: FakeMediaRecorder[] = []
  static isTypeSupported = vi.fn(() => FakeMediaRecorder.supported)
  private readonly listeners = new Map<string, Listener[]>()
  readonly stream: MediaStream
  readonly options: MediaRecorderOptions
  start = vi.fn()
  stop = vi.fn(() => this.emit('stop'))
  constructor(stream: MediaStream, options: MediaRecorderOptions) {
    this.stream = stream
    this.options = options
    FakeMediaRecorder.instances.push(this)
  }
  addEventListener(type: string, listener: Listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]) }
  emit(type: string, event: unknown = {}) { this.listeners.get(type)?.forEach((listener) => listener(event)) }
}

const createTrack = (settings: MediaTrackSettings = {}) => {
  const listeners = new Map<string, Listener[]>()
  return {
    addEventListener: vi.fn((type: string, listener: Listener) => listeners.set(type, [...(listeners.get(type) ?? []), listener])),
    getSettings: vi.fn(() => settings),
    stop: vi.fn(),
    emit: (type: string) => listeners.get(type)?.forEach((listener) => listener()),
  }
}

const originalMediaDevices = navigator.mediaDevices
const originalMediaRecorder = globalThis.MediaRecorder
const capture = {
  beginCameraSegment: vi.fn(), writeCameraSegment: vi.fn(), finalizeCameraSegment: vi.fn(), failCamera: vi.fn(),
}

beforeEach(() => {
  FakeMediaRecorder.instances = []
  FakeMediaRecorder.supported = true
  vi.clearAllMocks()
  Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: FakeMediaRecorder })
  Object.defineProperty(window, 'capture', { configurable: true, value: capture })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { enumerateDevices: vi.fn(), getUserMedia: vi.fn() } })
  capture.beginCameraSegment.mockResolvedValue({ jobId: 'job-1' })
  capture.writeCameraSegment.mockResolvedValue(undefined)
  capture.finalizeCameraSegment.mockResolvedValue(undefined)
  capture.failCamera.mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', { configurable: true, value: vi.fn() })
})

afterEach(() => {
  Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: originalMediaRecorder })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: originalMediaDevices })
  delete window.capture
  vi.restoreAllMocks()
})

describe('browser camera discovery', () => {
  it('lists only video inputs, with deterministic fallback labels and default', async () => {
    vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValue([
      { kind: 'audioinput', deviceId: 'mic', label: 'Mic' },
      { kind: 'videoinput', deviceId: 'first', label: '' },
      { kind: 'videoinput', deviceId: 'second', label: 'USB camera' },
    ] as MediaDeviceInfo[])
    await expect(listBrowserCameras()).resolves.toEqual([
      { id: 'camera:chromium:first', kind: 'camera', label: 'Camera 1', isDefault: true },
      { id: 'camera:chromium:second', kind: 'camera', label: 'USB camera', isDefault: false },
    ])
  })

  it('rejects discovery when Chromium exposes no media-device API', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    await expect(listBrowserCameras()).rejects.toThrow('Camera discovery is unavailable')
  })
})

describe('BrowserCameraRecorder', () => {
  it.each(['', 'camera:chromium:', 'camera:wrong:device', 'microphone:chromium:camera'])('rejects malformed camera source ids: %s', async (sourceId) => {
    await expect(BrowserCameraRecorder.request(sourceId)).rejects.toThrow('selected camera is invalid')
  })

  it('rejects unavailable access and unsupported VP8 before requesting a stream', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    await expect(BrowserCameraRecorder.request('camera:chromium:one')).rejects.toThrow('Camera access is unavailable')
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } })
    FakeMediaRecorder.supported = false
    await expect(BrowserCameraRecorder.request('camera:chromium:one')).rejects.toThrow('cannot record VP8')
  })

  it('stops every acquired track when the selected device has no video track', async () => {
    const audio = createTrack()
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({ getVideoTracks: () => [], getTracks: () => [audio] } as unknown as MediaStream)
    await expect(BrowserCameraRecorder.request('camera:chromium:one')).rejects.toThrow('did not provide a video track')
    expect(audio.stop).toHaveBeenCalledOnce()
  })

  it('uses positive rounded negotiated settings and starts a persisted segment', async () => {
    const track = createTrack({ width: 1279.5, height: -1, frameRate: Number.NaN })
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(stream)
    const recorder = await BrowserCameraRecorder.request('camera:chromium:device-7')
    await recorder.start('session', { shadowSize: 'md', cornerRadius: 'lg' }, { x: 1, y: 2, width: 3, height: 4 }, 50)
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false, video: expect.objectContaining({ deviceId: { ideal: 'device-7' } }) }))
    expect(capture.beginCameraSegment).toHaveBeenCalledWith({ sessionId: 'session', sourceId: 'camera:chromium:device-7', format: expect.objectContaining({ width: 1280, height: 1080, nominalFps: 30, appearance: { shadowSize: 'md', cornerRadius: 'lg' } }), startNs: 0 })
    expect(FakeMediaRecorder.instances[0].start).toHaveBeenCalledWith(1000)
  })

  it('serializes chunks and finalizes using a non-negative monotonically bounded end time', async () => {
    const track = createTrack()
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({ getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream)
    const recorder = await BrowserCameraRecorder.request('camera:chromium:one')
    await recorder.start('session', undefined, undefined, performance.now() + 1_000)
    const nativeRecorder = FakeMediaRecorder.instances[0]
    nativeRecorder.emit('dataavailable', { data: { size: 5, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } })
    nativeRecorder.emit('dataavailable', { data: { size: 0, arrayBuffer: async () => new ArrayBuffer(0) } })
    await recorder.stop(123_000_000)
    expect(capture.writeCameraSegment).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-1', sequence: 0, data: expect.any(Uint8Array) }))
    expect(capture.finalizeCameraSegment).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-1', endNs: 123_000_000, metrics: { framesAcquired: 0, framesReceived: 0 } }))
    expect(track.stop).toHaveBeenCalledOnce()
  })

  it('starts a new segment after pause and keeps segment sequence numbers isolated', async () => {
    const track = createTrack()
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({ getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream)
    capture.beginCameraSegment.mockResolvedValueOnce({ jobId: 'one' }).mockResolvedValueOnce({ jobId: 'two' })
    const recorder = await BrowserCameraRecorder.request('camera:chromium:one')
    await recorder.start('session')
    await recorder.pause()
    await recorder.resume('session')
    expect(capture.beginCameraSegment).toHaveBeenNthCalledWith(2, expect.objectContaining({ sessionId: 'session', startNs: expect.any(Number) }))
    await expect(recorder.start('session')).rejects.toThrow('already recording')
  })

  it('reports device and encoder failures once, but ignores them after release', async () => {
    const track = createTrack()
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({ getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream)
    const recorder = await BrowserCameraRecorder.request('camera:chromium:one')
    const fatal = vi.fn()
    recorder.onFatal(fatal)
    await recorder.start('session')
    track.emit('ended')
    FakeMediaRecorder.instances[0].emit('error')
    expect(fatal).toHaveBeenCalledTimes(2)
    await recorder.stop()
    track.emit('ended')
    expect(fatal).toHaveBeenCalledTimes(2)
  })

  it('persists explicit failure even when segment finalization fails', async () => {
    const track = createTrack()
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({ getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream)
    const recorder = await BrowserCameraRecorder.request('camera:chromium:one')
    await recorder.start('session')
    FakeMediaRecorder.instances[0].stop.mockImplementationOnce(() => FakeMediaRecorder.instances[0].emit('error'))
    await recorder.fail('session', 'lost permission')
    expect(capture.failCamera).toHaveBeenCalledWith({ sessionId: 'session', reason: 'lost permission' })
    expect(track.stop).toHaveBeenCalledOnce()
    await expect(recorder.resume('session')).rejects.toThrow('already stopped')
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserMicrophoneRecorder, recordMicrophoneFailure } from '../microphone-recorder'

class FakeTrack extends EventTarget {
  muted = false
  stopped = false

  getSettings() {
    return { sampleRate: 44_100, channelCount: 2 }
  }

  stop() {
    this.stopped = true
  }
}

class FakeStream {
  private readonly track: FakeTrack

  constructor(track: FakeTrack) {
    this.track = track
  }

  getAudioTracks() {
    return [this.track]
  }

  getTracks() {
    return [this.track]
  }
}

class FakeMediaRecorder extends EventTarget {
  static instances: FakeMediaRecorder[] = []
  static supported = true
  state = 'inactive'

  readonly stream: MediaStream
  readonly options: MediaRecorderOptions

  constructor(stream: MediaStream, options: MediaRecorderOptions) {
    super()
    this.stream = stream
    this.options = options
    FakeMediaRecorder.instances.push(this)
  }

  static isTypeSupported() {
    return FakeMediaRecorder.supported
  }

  start() {
    this.state = 'recording'
  }

  stop() {
    this.state = 'inactive'
    this.dispatchEvent(new Event('stop'))
  }

  data(data = new Uint8Array([1, 2, 3])) {
    const event = new Event('dataavailable') as Event & { data: Blob }
    event.data = {
      size: data.byteLength,
      arrayBuffer: () => Promise.resolve(data.buffer),
    } as unknown as Blob
    this.dispatchEvent(event)
  }

  error() {
    this.dispatchEvent(new Event('error'))
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  static failGraph = false
  state: AudioContextState = 'running'
  currentTime = 2
  readonly gain = {
    gain: {
      value: 1,
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn((destination: unknown) => destination),
  }
  readonly destinationStream = new FakeStream(new FakeTrack())

  constructor() {
    FakeAudioContext.instances.push(this)
  }

  createMediaStreamSource = vi.fn(() => {
    if (FakeAudioContext.failGraph) throw new Error('graph failed')
    return { connect: vi.fn((destination: unknown) => destination) }
  })
  createGain = vi.fn(() => this.gain)
  createMediaStreamDestination = vi.fn(() => ({ stream: this.destinationStream }))
  resume = vi.fn(async () => undefined)
  close = vi.fn(async () => {
    this.state = 'closed'
  })
}

const capture = {
  beginMicrophoneSegment: vi.fn().mockResolvedValue({ jobId: 'mic-job-1' }),
  writeMicrophoneSegment: vi.fn().mockResolvedValue(undefined),
  finalizeMicrophoneSegment: vi.fn().mockResolvedValue(undefined),
  failMicrophone: vi.fn().mockResolvedValue(undefined),
}

const getUserMedia = vi.fn()
let track!: FakeTrack
let stream!: FakeStream
let previousMediaDevices: MediaDevices | undefined
let previousCapture: typeof window.capture

beforeEach(() => {
  vi.clearAllMocks()
  FakeMediaRecorder.instances = []
  FakeMediaRecorder.supported = true
  FakeAudioContext.instances = []
  FakeAudioContext.failGraph = false
  track = new FakeTrack()
  stream = new FakeStream(track)
  getUserMedia.mockResolvedValue(stream)
  previousMediaDevices = navigator.mediaDevices
  previousCapture = window.capture
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  })
  window.capture = capture as unknown as typeof window.capture
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  vi.stubGlobal('AudioContext', FakeAudioContext)
})

afterEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: previousMediaDevices })
  window.capture = previousCapture
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('BrowserMicrophoneRecorder', () => {
  it('requests a processed stream, writes data, and finalizes a segment', async () => {
    track.muted = true
    const now = vi.spyOn(performance, 'now').mockReturnValue(12)
    const recorder = await BrowserMicrophoneRecorder.request('microphone:chromium:usb')
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        deviceId: { exact: 'usb' },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    })
    expect(recorder.format).toEqual({ codec: 'opus', sampleRate: 44_100, channels: 2 })
    expect(FakeAudioContext.instances[0].gain.gain.value).toBe(0)

    const fatal = vi.fn()
    recorder.onFatal(fatal)
    await recorder.start('session-1')
    const mediaRecorder = FakeMediaRecorder.instances[0]
    mediaRecorder.data(new Uint8Array([4, 5]))
    await recorder.stop()

    expect(capture.beginMicrophoneSegment).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', sourceId: 'microphone:chromium:usb', startNs: 0 }),
    )
    expect(capture.writeMicrophoneSegment).toHaveBeenCalledWith({
      jobId: 'mic-job-1',
      sequence: 0,
      data: new Uint8Array([4, 5]),
    })
    expect(capture.finalizeMicrophoneSegment).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'mic-job-1', endNs: 0, metrics: {} }),
    )
    expect(FakeAudioContext.instances[0].destinationStream.getTracks()[0].stopped).toBe(true)
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalled()
    expect(now).toHaveBeenCalled()
    expect(fatal).not.toHaveBeenCalled()
  })

  it('pauses and resumes as separate native segments', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(100)
    const recorder = await BrowserMicrophoneRecorder.request('microphone:chromium:default')
    await recorder.start('session-2')
    await recorder.pause()
    await recorder.resume('session-2')
    await recorder.stop()

    expect(capture.beginMicrophoneSegment).toHaveBeenCalledTimes(2)
    expect(capture.finalizeMicrophoneSegment).toHaveBeenCalledTimes(2)
    expect(FakeMediaRecorder.instances).toHaveLength(2)
    expect(() => FakeMediaRecorder.instances[0].start()).not.toThrow()
    await expect(recorder.start('session-2')).rejects.toThrow('already stopped')
  })

  it('fades on track mute events and reports recorder or track failures', async () => {
    const recorder = await BrowserMicrophoneRecorder.request('microphone:chromium:default')
    const fatal = vi.fn()
    recorder.onFatal(fatal)
    await recorder.start('session-3')
    const audio = FakeAudioContext.instances[0]
    track.dispatchEvent(new Event('mute'))
    track.dispatchEvent(new Event('unmute'))
    expect(audio.gain.gain.cancelScheduledValues).toHaveBeenCalledTimes(2)
    expect(audio.gain.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(1, 0, 2.015)
    expect(audio.gain.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(2, 1, 2.015)

    FakeMediaRecorder.instances[0].error()
    expect(fatal).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('encoding') }))
    track.dispatchEvent(new Event('ended'))
    expect(fatal).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('disconnected') }))
    await recorder.stop()
  })

  it('persists explicit failures and cleans up even when segment finalization fails', async () => {
    const recorder = await BrowserMicrophoneRecorder.request('microphone:chromium:default')
    await recorder.start('session-4')
    capture.finalizeMicrophoneSegment.mockRejectedValueOnce(new Error('disk full'))
    await recorder.fail('session-4', 'encoder failed')
    expect(capture.failMicrophone).toHaveBeenCalledWith({
      sessionId: 'session-4',
      sourceId: 'microphone:chromium:default',
      format: { codec: 'opus', sampleRate: 44_100, channels: 2 },
      reason: 'encoder failed',
    })
    expect(FakeAudioContext.instances[0].destinationStream.getTracks()[0].stopped).toBe(true)
    await expect(recorder.stop()).resolves.toBeUndefined()
  })

  it('rejects unsupported setup and releases tracks after audio graph failures', async () => {
    FakeMediaRecorder.supported = false
    await expect(BrowserMicrophoneRecorder.request('microphone:chromium:default')).rejects.toThrow('cannot record Opus')

    FakeMediaRecorder.supported = true
    getUserMedia.mockResolvedValueOnce({ getAudioTracks: () => [], getTracks: () => [track] })
    await expect(BrowserMicrophoneRecorder.request('microphone:chromium:default')).rejects.toThrow(
      'did not provide an audio track',
    )
    expect(track.stopped).toBe(true)

    getUserMedia.mockResolvedValueOnce(stream)
    FakeAudioContext.failGraph = true
    await expect(BrowserMicrophoneRecorder.request('microphone:chromium:default')).rejects.toThrow('graph failed')
    expect(track.stopped).toBe(true)
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalled()
  })

  it('records a failure through the preload API without constructing a recorder', async () => {
    await recordMicrophoneFailure('session-5', 'microphone:chromium:default', 'permission denied')
    expect(capture.failMicrophone).toHaveBeenCalledWith({
      sessionId: 'session-5',
      sourceId: 'microphone:chromium:default',
      reason: 'permission denied',
    })
  })

  it('reports non-Error chunk failures as Error instances', async () => {
    const recorder = await BrowserMicrophoneRecorder.request('microphone:chromium:default')
    const fatal = vi.fn()
    recorder.onFatal(fatal)
    await recorder.start('session-6')
    capture.writeMicrophoneSegment.mockRejectedValueOnce('write failed')

    FakeMediaRecorder.instances[0].data(new Uint8Array([9]))
    await recorder.fail('session-6', 'capture failed')

    expect(fatal).toHaveBeenCalledWith(expect.objectContaining({ message: 'write failed' }))
    expect(capture.failMicrophone).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-6',
        reason: 'capture failed',
      }),
    )
  })
})

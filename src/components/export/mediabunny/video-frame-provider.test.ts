import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoFrameProvider } from './video-frame-provider'

const runtime = vi.hoisted(() => ({
  track: null as { canDecode: () => Promise<boolean>; getDecoderConfig: () => Promise<unknown> } | null,
  iterator: null as AsyncIterator<unknown> | null,
  inputs: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>,
  sinks: [] as Array<{ samplesAtTimestamps: ReturnType<typeof vi.fn> }>,
}))

vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class BlobSource { constructor(...args: unknown[]) { void args } },
  Input: class Input {
    dispose = vi.fn()
    constructor(...args: unknown[]) { void args; runtime.inputs.push(this) }
    getPrimaryVideoTrack = vi.fn(async () => runtime.track)
  },
  VideoSampleSink: class VideoSampleSink {
    samplesAtTimestamps = vi.fn(() => runtime.iterator)
    constructor(...args: unknown[]) { void args; runtime.sinks.push(this) }
  },
}))

const response = () => new Response(new Blob(['video']), { status: 200 })

beforeEach(() => {
  runtime.track = { canDecode: vi.fn(async () => true), getDecoderConfig: vi.fn(async () => ({ codec: 'vp9' })) }
  runtime.iterator = null
  runtime.inputs.length = 0
  runtime.sinks.length = 0
  vi.stubGlobal('VideoDecoder', { isConfigSupported: vi.fn(async () => ({ supported: true })) })
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('VideoFrameProvider', () => {
  it('creates a decoder, reads frames in order, closes samples and disposes input', async () => {
    const frame1 = { id: 1 }
    const frame2 = { id: 2 }
    const frame3 = { id: 3 }
    const samples = [
      { toVideoFrame: vi.fn(() => frame1), close: vi.fn() },
      { toVideoFrame: vi.fn(() => frame2), close: vi.fn() },
      { toVideoFrame: vi.fn(() => frame3), close: vi.fn() },
    ]
    let index = 0
    const iterator = {
      next: vi.fn(async () => index < samples.length ? { done: false, value: samples[index++] } : { done: true, value: undefined }),
      [Symbol.asyncIterator]() { return this },
    }
    runtime.iterator = iterator
    const provider = await VideoFrameProvider.create('video.mp4', [0, 1, 2])
    expect(provider).not.toBeNull()
    expect(await provider!.frameAt(0)).toBe(frame1)
    expect(await provider!.frameAt(2)).toBe(frame3)
    expect(samples[0]!.close).toHaveBeenCalledOnce()
    expect(samples[1]!.close).toHaveBeenCalledOnce()
    expect(samples[2]!.close).toHaveBeenCalledOnce()
    expect(await provider!.frameAt(5)).toBeNull()
    provider!.dispose()
    expect(runtime.inputs[0]!.dispose).toHaveBeenCalledOnce()
  })

  it('returns null and disposes input when a track or decoder is unavailable', async () => {
    runtime.track = null
    expect(await VideoFrameProvider.create('missing-track.mp4', [0])).toBeNull()
    expect(runtime.inputs[0]!.dispose).toHaveBeenCalledOnce()

    runtime.inputs.length = 0
    runtime.track = { canDecode: vi.fn(async () => false), getDecoderConfig: vi.fn(async () => null) }
    expect(await VideoFrameProvider.create('undecodable.mp4', [0])).toBeNull()
    expect(runtime.inputs[0]!.dispose).toHaveBeenCalledOnce()

    runtime.inputs.length = 0
    runtime.track = { canDecode: vi.fn(async () => true), getDecoderConfig: vi.fn(async () => null) }
    expect(await VideoFrameProvider.create('unsupported.mp4', [0])).toBeNull()
    expect(runtime.inputs[0]!.dispose).toHaveBeenCalledOnce()
  })

  it('rejects unreadable sources and unsupported decoder configurations', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }))
    await expect(VideoFrameProvider.create('private.mp4', [0])).rejects.toThrow()

    vi.stubGlobal('VideoDecoder', { isConfigSupported: vi.fn(async () => ({ supported: false })) })
    expect(await VideoFrameProvider.create('unsupported-codec.mp4', [0])).toBeNull()
    expect(runtime.inputs[0]!.dispose).toHaveBeenCalledOnce()

    vi.stubGlobal('VideoDecoder', undefined)
    expect(await VideoFrameProvider.create('no-decoder.mp4', [0])).toBeNull()
    expect(runtime.inputs[1]!.dispose).toHaveBeenCalledOnce()
  })
})

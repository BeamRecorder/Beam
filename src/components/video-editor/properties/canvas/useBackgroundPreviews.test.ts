import { defineComponent, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBackgroundPreviews } from './useBackgroundPreviews'
import type { BackgroundMedia } from '../../composables/backgroundCatalog'

const workerState = vi.hoisted(() => {
  const instances: Array<{
    onmessage?: (event: MessageEvent) => void
    postMessage: ReturnType<typeof vi.fn>
    terminate: ReturnType<typeof vi.fn>
  }> = []
  class FakeWorker {
    onmessage?: (event: MessageEvent) => void
    postMessage = vi.fn()
    terminate = vi.fn()
    constructor() {
      instances.push(this)
    }
  }
  return { FakeWorker, instances }
})

vi.mock('./background-preview.worker?worker&inline', () => ({ default: workerState.FakeWorker }))

const image = (id: string): BackgroundMedia => ({
  id,
  name: id,
  path: `/media/${id}.png`,
  extension: 'png',
  kind: 'image',
})
const video = (id: string): BackgroundMedia => ({
  id,
  name: id,
  path: `/media/${id}.mp4`,
  extension: 'mp4',
  kind: 'video',
})

describe('useBackgroundPreviews', () => {
  let api: ReturnType<typeof useBackgroundPreviews>
  let wrapper: ReturnType<typeof mount>
  const createObjectURL = vi.fn<(blob: Blob | MediaSource) => string>()
  const revokeObjectURL = vi.fn<(url: string) => void>()

  beforeEach(() => {
    vi.clearAllMocks()
    workerState.instances.length = 0
    createObjectURL.mockImplementation(() => `blob:${createObjectURL.mock.calls.length}`)
    revokeObjectURL.mockImplementation(() => undefined)
    vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL)
    const Harness = defineComponent({
      setup() {
        api = useBackgroundPreviews()
        return () => null
      },
    })
    wrapper = mount(Harness)
  })

  afterEach(() => {
    wrapper.unmount()
    vi.restoreAllMocks()
  })

  it('requests image previews, handles worker messages, deduplicates and evicts cached entries', () => {
    const worker = workerState.instances[0]!
    api.request(image('first'))
    api.request(image('first'))
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'request', id: 'first', source: '/media/first.png' })

    worker.onmessage?.({ data: { type: 'ready', id: 'first', preview: new Blob(['one']) } } as MessageEvent)
    expect(api.previews.first).toContain('blob:')
    api.request(image('first'))
    expect(worker.postMessage).toHaveBeenCalledTimes(1)

    worker.onmessage?.({ data: { type: 'ready', id: 'first', preview: new Blob(['replacement']) } } as MessageEvent)
    expect(revokeObjectURL).toHaveBeenCalled()
    worker.onmessage?.({ data: { type: 'ready', id: 'ignored' } } as MessageEvent)

    worker.onmessage?.({ data: { type: 'error', id: 'broken' } } as MessageEvent)
    expect(api.failed.broken).toBe(true)
    api.request(image('broken'))
    expect(worker.postMessage).toHaveBeenCalledTimes(1)

    for (let index = 0; index < 180; index += 1) {
      worker.onmessage?.({
        data: { type: 'ready', id: `cached-${index}`, preview: new Blob([String(index)]) },
      } as MessageEvent)
    }
    expect(Object.keys(api.previews)).toHaveLength(180)
    expect(api.previews.first).toBeUndefined()
  })

  it('creates video previews from the middle frame and marks failed videos', async () => {
    const realCreateElement = document.createElement.bind(document)
    const fakeVideo = realCreateElement('video')
    let currentTime = 0
    Object.defineProperty(fakeVideo, 'duration', { configurable: true, value: 10 })
    Object.defineProperty(fakeVideo, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: (value: number) => {
        currentTime = value
        fakeVideo.dispatchEvent(new Event('seeked'))
      },
    })
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      if (tagName.toLowerCase() === 'video') return fakeVideo
      return realCreateElement(tagName, options)
    }) as typeof document.createElement)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['frame'])))

    api.request(video('movie'))
    fakeVideo.dispatchEvent(new Event('loadedmetadata'))
    await flushPromises()
    expect(api.previews.movie).toContain('blob:')
    expect(currentTime).toBe(5)

    const failingVideo = realCreateElement('video')
    vi.mocked(document.createElement).mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      if (tagName.toLowerCase() === 'video') return failingVideo
      return realCreateElement(tagName, options)
    }) as typeof document.createElement)
    api.request(video('broken-video'))
    failingVideo.dispatchEvent(new Event('error'))
    await nextTick()
    await flushPromises()
    expect(api.failed['broken-video']).toBe(true)
  })

  it('cleans previews and terminates its worker when unmounted', async () => {
    const worker = workerState.instances[0]!
    api.request(image('cleanup'))
    worker.onmessage?.({ data: { type: 'ready', id: 'cleanup', preview: new Blob(['cleanup']) } } as MessageEvent)
    expect(api.previews.cleanup).toBeDefined()
    wrapper.unmount()
    await nextTick()
    expect(revokeObjectURL).toHaveBeenCalled()
    expect(worker.terminate).toHaveBeenCalled()
  })
})

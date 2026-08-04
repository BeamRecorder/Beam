import { defineComponent, nextTick, ref, type Ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useThumbnails } from './useThumbnails'

const workerState = vi.hoisted(() => {
  const instances: Array<{
    onmessage?: (event: MessageEvent) => void
    onerror?: () => void
    postMessage: ReturnType<typeof vi.fn>
    terminate: ReturnType<typeof vi.fn>
  }> = []
  class FakeWorker {
    onmessage?: (event: MessageEvent) => void
    onerror?: () => void
    postMessage = vi.fn()
    terminate = vi.fn()
    constructor() { instances.push(this) }
  }
  return { FakeWorker, instances }
})

vi.mock('./thumbnail.worker?worker&inline', () => ({ default: workerState.FakeWorker }))

describe('useThumbnails', () => {
  let source: Ref<string | null>
  let api: ReturnType<typeof useThumbnails>
  let wrapper: ReturnType<typeof mount>
  let projectMediaUrl: ReturnType<typeof vi.fn>
  const createObjectURL = vi.fn((_blob: Blob | MediaSource): string => 'blob:initial')
  const revokeObjectURL = vi.fn((_url: string): void => undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    workerState.instances.length = 0
    source = ref<string | null>(null) as Ref<string | null>
    projectMediaUrl = vi.fn().mockResolvedValue('safe://video.mp4')
    createObjectURL.mockImplementation(() => `blob:${createObjectURL.mock.calls.length}`)
    revokeObjectURL.mockImplementation(() => undefined)
    vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL)
    Object.defineProperty(window, 'capture', { configurable: true, value: { projectMediaUrl } })
    const Harness = defineComponent({
      setup() {
        api = useThumbnails(source)
        return () => null
      },
    })
    wrapper = mount(Harness)
  })

  afterEach(() => {
    wrapper.unmount()
    delete (window as Window & { capture?: unknown }).capture
    vi.restoreAllMocks()
  })

  const ready = (generation: number, time: number, blob = new Blob([String(time)])) => {
    workerState.instances[0]?.onmessage?.({ data: { type: 'ready', generation, time, blob } } as MessageEvent)
  }

  it('queues visible frames, extracts missing thumbnails, updates state and evicts old cache entries', async () => {
    source.value = 'video.mp4'
    await nextTick()
    api.requestVisibleFrames([1, 2, 1])
    await flushPromises()

    const worker = workerState.instances[0]!
    expect(projectMediaUrl).toHaveBeenCalledWith('video.mp4')
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'request-frames', generation: 2, source: 'safe://video.mp4', visibleTimes: [1, 2],
    })

    worker.onmessage?.({ data: { type: 'batch-started', generation: 2 } } as MessageEvent)
    expect(api.isExtracting.value).toBe(true)
    ready(2, 1)
    expect(api.thumbnails[1]).toContain('blob:')
    ready(2, 1, new Blob(['replacement']))
    expect(revokeObjectURL).toHaveBeenCalled()
    worker.onmessage?.({ data: { type: 'batch-finished', generation: 2 } } as MessageEvent)
    expect(api.isExtracting.value).toBe(false)

    api.requestVisibleFrames([1])
    await flushPromises()
    expect(worker.postMessage).toHaveBeenCalledTimes(1)

    for (let time = 2; time <= 181; time += 1) ready(2, time)
    expect(api.thumbnails[1]).toBeUndefined()
    expect(Object.keys(api.thumbnails)).toHaveLength(180)

    worker.onmessage?.({ data: { type: 'error', generation: 2, message: 'failed' } } as MessageEvent)
    expect(api.isExtracting.value).toBe(false)
    worker.onerror?.()
  })

  it('ignores stale generations and handles missing safe URLs and URL failures', async () => {
    source.value = 'video.mp4'
    await nextTick()
    api.requestVisibleFrames([4])
    await flushPromises()
    const worker = workerState.instances[0]!
    ready(999, 4)
    expect(api.thumbnails[4]).toBeUndefined()

    api.clearCache()
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'clear', generation: 3 })
    projectMediaUrl.mockResolvedValueOnce(null)
    api.requestVisibleFrames([5])
    await flushPromises()
    expect(api.isExtracting.value).toBe(false)

    api.clearCache()
    projectMediaUrl.mockRejectedValueOnce(new Error('permission denied'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    api.requestVisibleFrames([6])
    await flushPromises()
    expect(api.isExtracting.value).toBe(false)
    expect(error).toHaveBeenCalled()
  })

  it('returns early for empty sources and clears cached object URLs on source changes and unmount', async () => {
    api.requestVisibleFrames([1])
    await flushPromises()
    expect(workerState.instances).toHaveLength(0)

    source.value = 'video.mp4'
    await nextTick()
    api.requestVisibleFrames([1])
    await flushPromises()
    ready(2, 1)
    expect(api.thumbnails[1]).toBeDefined()
    source.value = null
    await nextTick()
    expect(api.thumbnails[1]).toBeUndefined()
    expect(revokeObjectURL).toHaveBeenCalled()
  })
})

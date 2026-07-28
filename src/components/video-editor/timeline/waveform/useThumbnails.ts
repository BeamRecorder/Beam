import { onUnmounted, reactive, ref, watch, type Ref } from 'vue'
import ThumbnailWorker from './thumbnail.worker?worker&inline'
import type { ThumbnailWorkerResponse } from './thumbnail-protocol'

const CACHE_LIMIT = 180

export function useThumbnails(videoSrcRef: Ref<string | null>) {
  const thumbnails = reactive<Record<number, string>>({})
  const isExtracting = ref(false)
  const cacheOrder: number[] = []
  const pendingTimes = new Set<number>()
  let worker: Worker | null = null
  let generation = 0
  let requestQueued = false
  let retryTimer: number | null = null
  let retryCount = 0
  let lastVisibleTimes: number[] = []

  const clearCache = () => {
    generation += 1
    worker?.postMessage({ type: 'clear', generation })
    for (const [time, url] of Object.entries(thumbnails)) {
      URL.revokeObjectURL(url)
      delete thumbnails[Number(time)]
    }
    cacheOrder.length = 0
    pendingTimes.clear()
    requestQueued = false
    retryCount = 0
    if (retryTimer !== null) window.clearTimeout(retryTimer)
    retryTimer = null
    isExtracting.value = false
  }

  const cacheThumbnail = (time: number, blob: Blob) => {
    const existing = thumbnails[time]
    if (existing) {
      URL.revokeObjectURL(existing)
      const existingIndex = cacheOrder.indexOf(time)
      if (existingIndex >= 0) cacheOrder.splice(existingIndex, 1)
    }
    thumbnails[time] = URL.createObjectURL(blob)
    cacheOrder.push(time)
    while (cacheOrder.length > CACHE_LIMIT) {
      const expired = cacheOrder.shift()
      if (expired === undefined) break
      URL.revokeObjectURL(thumbnails[expired])
      delete thumbnails[expired]
    }
  }

  const receiveWorkerMessage = (message: ThumbnailWorkerResponse) => {
    if (message.generation !== generation) return
    if (message.type === 'batch-started') {
      isExtracting.value = true
      return
    }
    if (message.type === 'batch-finished') {
      isExtracting.value = false
      retryCount = 0
      return
    }
    if (message.type === 'error') {
      isExtracting.value = false
      retryMissingFrames(message.message)
      return
    }
    cacheThumbnail(message.time, message.blob)
  }

  const initWorker = () => {
    if (worker) return
    worker = new ThumbnailWorker()
    worker.onmessage = (event: MessageEvent<ThumbnailWorkerResponse>) => {
      receiveWorkerMessage(event.data)
    }
    worker.onerror = () => {
      isExtracting.value = false
      retryMissingFrames('Thumbnail worker crashed.')
    }
  }

  const retryMissingFrames = (reason: string) => {
    if (retryCount >= 2 || lastVisibleTimes.length === 0) {
      console.error('Unable to extract timeline thumbnails.', reason)
      return
    }
    retryCount += 1
    worker?.terminate()
    worker = null
    if (retryTimer !== null) window.clearTimeout(retryTimer)
    retryTimer = window.setTimeout(() => {
      retryTimer = null
      requestVisibleFrames(lastVisibleTimes)
    }, 200 * retryCount)
  }

  const requestVisibleFrames = (visibleTimes: number[]) => {
    visibleTimes.forEach((time) => pendingTimes.add(time))
    if (requestQueued) return
    requestQueued = true
    queueMicrotask(() => {
      requestQueued = false
      const times = [...pendingTimes]
      pendingTimes.clear()
      void requestMissingFrames(times)
    })
  }

  const requestMissingFrames = async (visibleTimes: number[]) => {
    lastVisibleTimes = visibleTimes
    const source = videoSrcRef.value
    if (!source || visibleTimes.length === 0) return
    const missingTimes = visibleTimes.filter((time) => !thumbnails[time])
    if (missingTimes.length === 0) return
    initWorker()
    generation += 1
    const requestGeneration = generation
    isExtracting.value = true
    let workerSource: string | null | undefined
    try {
      workerSource = await window.capture?.projectMediaUrl(source)
    } catch (error) {
      if (requestGeneration === generation) {
        isExtracting.value = false
        retryMissingFrames(error instanceof Error ? error.message : 'Unable to create a safe media URL for timeline thumbnails.')
      }
      return
    }
    if (requestGeneration !== generation) return
    if (!workerSource) {
      isExtracting.value = false
      retryMissingFrames('Unable to create a safe media URL for timeline thumbnails.')
      return
    }
    worker?.postMessage({
      type: 'request-frames',
      generation: requestGeneration,
      source: workerSource,
      visibleTimes: missingTimes,
    })
  }

  watch(videoSrcRef, clearCache)

  onUnmounted(() => {
    clearCache()
    worker?.terminate()
  })

  return { thumbnails, isExtracting, requestVisibleFrames, clearCache }
}

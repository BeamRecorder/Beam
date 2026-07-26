import { onUnmounted, reactive, ref, watch, type Ref } from 'vue'
import ThumbnailWorker from './thumbnail.worker?worker&inline'
import type { ThumbnailWorkerResponse } from './thumbnail-protocol'

const CACHE_LIMIT = 180

export function useThumbnails(videoSrcRef: Ref<string | null>) {
  const thumbnails = reactive<Record<number, string>>({})
  const isExtracting = ref(false)
  const cacheOrder: number[] = []
  let worker: Worker | null = null
  let generation = 0

  const clearCache = () => {
    generation += 1
    worker?.postMessage({ type: 'clear', generation })
    for (const [time, url] of Object.entries(thumbnails)) {
      URL.revokeObjectURL(url)
      delete thumbnails[Number(time)]
    }
    cacheOrder.length = 0
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
    if (message.type === 'batch-finished' || message.type === 'error') {
      isExtracting.value = false
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
    }
  }

  const requestVisibleFrames = (visibleTimes: number[]) => {
    void requestMissingFrames(visibleTimes)
  }

  const requestMissingFrames = async (visibleTimes: number[]) => {
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
        console.error('Unable to create a safe media URL for timeline thumbnails.', error)
      }
      return
    }
    if (requestGeneration !== generation) return
    if (!workerSource) {
      isExtracting.value = false
      console.error('Unable to create a safe media URL for timeline thumbnails.')
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

import { computed, ref } from 'vue'
import { exportWithMediabunny } from './mediabunny/exporter'
import type { ExportProgress, ExportRequest, ExportResult } from './export-types'

const progress = ref<ExportProgress | null>(null)
const error = ref<string | null>(null)
const result = ref<ExportResult | null>(null)
const controller = ref<AbortController | null>(null)
const isExporting = computed(() => controller.value !== null)

export function useExportJob() {
  const start = async (request: ExportRequest) => {
    if (controller.value) return
    error.value = null; result.value = null; progress.value = { stage: 'preparing', stageLabel: 'Preparing export...', completed: 0, total: 1, currentTimeMs: 0, totalTimeMs: Math.round(request.snapshot.duration * 1000) }
    const next = new AbortController(); controller.value = next
    try {
      result.value = await exportWithMediabunny(request, (value) => { progress.value = value }, next.signal)
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) error.value = reason instanceof Error ? reason.message : 'L’export a échoué.'
    } finally {
      controller.value = null
      progress.value = null
    }
  }
  const cancel = () => controller.value?.abort()
  return { progress, error, result, isExporting, start, cancel }
}

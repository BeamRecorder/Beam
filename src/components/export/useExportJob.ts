import { computed, ref } from 'vue'
import { exportWithMediabunny } from './mediabunny/exporter'
import type { ExportProgress, ExportRequest, ExportResult } from './export-types'

export function useExportJob() {
  const progress = ref<ExportProgress | null>(null)
  const error = ref<string | null>(null)
  const result = ref<ExportResult | null>(null)
  const controller = ref<AbortController | null>(null)
  const isExporting = computed(() => controller.value !== null)
  const start = async (request: ExportRequest) => {
    if (controller.value) return
    error.value = null; result.value = null; progress.value = { stage: 'preparing', completed: 0, total: 1 }
    const next = new AbortController(); controller.value = next
    try {
      result.value = await exportWithMediabunny(request, (value) => { progress.value = value }, next.signal)
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) error.value = reason instanceof Error ? reason.message : 'L’export a échoué.'
    } finally {
      controller.value = null
    }
  }
  const cancel = () => controller.value?.abort()
  return { progress, error, result, isExporting, start, cancel }
}

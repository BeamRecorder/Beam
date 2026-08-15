import { computed, ref } from 'vue';
import { exportWithMediabunny } from './mediabunny/exporter';
import type { ExportProgress, ExportRequest, ExportResult } from './export-types';
import { tNamespace } from '../../i18n';

const $t = tNamespace('exporter');

const progress = ref<ExportProgress | null>(null);
const error = ref<string | null>(null);
const errorContext = ref<unknown>(null);
const result = ref<ExportResult | null>(null);
const controller = ref<AbortController | null>(null);
const isExporting = computed(() => controller.value !== null);

export function useExportJob() {
  const start = async (request: ExportRequest) => {
    if (controller.value) return;
    error.value = null;
    errorContext.value = null;
    result.value = null;
    progress.value = {
      stage: 'validating_assets',
      stageLabel: $t('preparingExport'),
      overallProgress: 0,
      completedImages: 0,
      totalImages: Math.max(1, Math.ceil(request.snapshot.duration * request.snapshot.render.fps)),
      audioProgress: request.snapshot.composition.clips.some((clip) => clip.kind === 'audio' && clip.enabled)
        ? 0
        : null,
      currentTimeMs: 0,
      totalTimeMs: Math.round(request.snapshot.duration * 1000),
    };
    const next = new AbortController();
    controller.value = next;
    try {
      result.value = await exportWithMediabunny(
        request,
        (value) => {
          progress.value = value;
        },
        next.signal,
      );
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
        errorContext.value = reason;
        error.value = reason instanceof Error ? reason.message : $t('exportFailed');
      }
    } finally {
      controller.value = null;
      progress.value = null;
    }
  };
  const cancel = () => controller.value?.abort();
  return { progress, error, errorContext, result, isExporting, start, cancel };
}

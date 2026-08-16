import { computed, ref } from 'vue';
import { exportWithMediabunny } from './mediabunny/exporter';
import type { ExportProgress, ExportRequest, ExportResult } from './export-types';
import type { ExportDiagnostics } from './export-diagnostics-types';
import { tNamespace } from '../../i18n';

const $t = tNamespace('exporter');

const progress = ref<ExportProgress | null>(null);
const error = ref<string | null>(null);
const errorContext = ref<unknown>(null);
const result = ref<ExportResult | null>(null);
const diagnostics = ref<ExportDiagnostics | null>(null);
const controller = ref<AbortController | null>(null);
const isChoosingDestination = ref(false);
const isExporting = computed(() => controller.value !== null && !isChoosingDestination.value);

export function useExportJob() {
  const start = async (request: ExportRequest) => {
    if (controller.value || isChoosingDestination.value) return;
    error.value = null;
    errorContext.value = null;
    result.value = null;
    diagnostics.value = null;
    progress.value = null;
    const next = new AbortController();
    isChoosingDestination.value = true;
    controller.value = next;
    try {
      result.value = await exportWithMediabunny(
        request,
        (value) => {
          progress.value = value;
          if (value.diagnostics && diagnostics.value) diagnostics.value.runtime = value.diagnostics;
        },
        next.signal,
        (initial) => {
          diagnostics.value = initial;
          progress.value = {
            stage: 'validating_assets',
            stageLabel: $t('preparingExport'),
            overallProgress: 0,
            completedImages: 0,
            totalImages: Math.max(1, Math.ceil(request.snapshot.duration * request.snapshot.render.fps)),
            audioProgress:
              request.includeAudio !== false &&
              request.snapshot.composition.clips.some(
                (clip) => clip.kind === 'audio' && clip.enabled && clip.timelineDurationMs > 0,
              )
                ? 0
                : null,
            currentTimeMs: 0,
            totalTimeMs: Math.round(request.snapshot.duration * 1000),
          };
          isChoosingDestination.value = false;
        },
      );
      diagnostics.value = result.value.diagnostics;
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
        errorContext.value = reason;
        error.value = reason instanceof Error ? reason.message : $t('exportFailed');
      }
    } finally {
      isChoosingDestination.value = false;
      controller.value = null;
      progress.value = null;
    }
  };
  const cancel = () => controller.value?.abort();
  return { progress, error, errorContext, result, diagnostics, isChoosingDestination, isExporting, start, cancel };
}

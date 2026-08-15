import { computed, ref, watch, type Ref } from 'vue';
import type { ProjectEditorData } from '../../../api/types/capture-api';
import type { ZoomElement } from '../zoom/zoom-types';
import { buildAutomaticZoomElements, ZOOM_ALGORITHM_VERSION } from '../zoom/zoom-suggestions';

export function useProjectZoom(options: {
  editorData: Ref<ProjectEditorData | null | undefined>;
  durationMs: Ref<number>;
  activeTab: Ref<string>;
}) {
  const { editorData, durationMs, activeTab } = options;
  const zoomElements = ref<ZoomElement[]>([]);
  const generatedSessions = ref<ProjectEditorData['zoom']['generatedSessions']>([]);
  const selectedZoomId = ref<string | null>(null);
  const selectedZoom = computed(
    () => zoomElements.value.find((element) => element.id === selectedZoomId.value) ?? null,
  );
  const canGenerateZooms = computed(() => Boolean(editorData.value?.cursor.available && editorData.value.sessionId));
  const hasAutomaticZooms = computed(() => zoomElements.value.some((element) => element.mode === 'auto'));

  const addZoomAtTime = (startMs: number) => {
    if (!Number.isFinite(startMs)) return;
    const clampedStartMs = Math.max(0, Math.min(durationMs.value, Math.round(startMs)));
    if (clampedStartMs >= durationMs.value) return;
    const zoom: ZoomElement = {
      id: crypto.randomUUID(),
      sessionId: editorData.value?.sessionId ?? 'manual',
      startMs: clampedStartMs,
      endMs: Math.min(durationMs.value, clampedStartMs + 1_200),
      depth: 2,
      mode: 'manual',
      focus: { cx: 0.5, cy: 0.5 },
    };
    zoomElements.value.push(zoom);
    selectedZoomId.value = zoom.id;
    activeTab.value = 'zoom';
  };

  const generateZooms = (selectPanel = false) => {
    const data = editorData.value;
    if (!data?.cursor.available) return;
    const generationDurationMs = Math.min(durationMs.value, data.manifest.durationNs / 1_000_000);
    if (generationDurationMs <= 0) return;
    const generated = buildAutomaticZoomElements({
      telemetry: data.cursor.telemetry,
      sessionId: data.sessionId,
      durationMs: generationDurationMs,
      reserved: zoomElements.value.filter((element) => element.mode === 'manual'),
    });
    zoomElements.value = [
      ...zoomElements.value.filter((element) => element.sessionId !== data.sessionId || element.mode !== 'auto'),
      ...generated,
    ];
    generatedSessions.value = [
      ...generatedSessions.value.filter((record) => record.sessionId !== data.sessionId),
      { sessionId: data.sessionId, algorithmVersion: ZOOM_ALGORITHM_VERSION, generatedAt: new Date().toISOString() },
    ];
    selectedZoomId.value = generated[0]?.id ?? null;
    if (selectPanel) activeTab.value = 'zoom';
  };

  const ensureAutomaticZooms = () => {
    const sessionId = editorData.value?.sessionId;
    if (
      !sessionId ||
      generatedSessions.value.some(
        (record) => record.sessionId === sessionId && record.algorithmVersion >= ZOOM_ALGORITHM_VERSION,
      )
    )
      return;
    generateZooms(false);
  };
  watch(
    [() => editorData.value?.sessionId, () => editorData.value?.cursor.available, durationMs],
    () => ensureAutomaticZooms(),
    { flush: 'post' },
  );
  const updateZoom = (next: ZoomElement) => {
    if (next.startMs < 0 || next.endMs <= next.startMs) return;
    zoomElements.value = zoomElements.value.map((element) => (element.id === next.id ? next : element));
  };
  const previewZoomEdge = (id: string, edge: 'start' | 'end', timeMs: number) => {
    zoomElements.value = zoomElements.value.map((element) => {
      if (element.id !== id) return element;
      return edge === 'start'
        ? { ...element, startMs: Math.max(0, Math.min(element.endMs - 200, Math.round(timeMs))) }
        : { ...element, endMs: Math.max(element.startMs + 200, Math.round(timeMs)) };
    });
  };
  const trimZoomEdge = (id: string, edge: 'start' | 'end', timeMs: number) => previewZoomEdge(id, edge, timeMs);
  const previewZoom = updateZoom;
  const deleteSelectedZoom = () => {
    if (!selectedZoomId.value) return;
    zoomElements.value = zoomElements.value.filter((element) => element.id !== selectedZoomId.value);
    selectedZoomId.value = null;
  };
  const previewMoveZoom = (id: string, startMs: number, endMs: number) => {
    zoomElements.value = zoomElements.value.map((element) =>
      element.id === id ? { ...element, startMs, endMs } : element,
    );
  };
  const moveZoom = previewMoveZoom;

  return {
    zoomElements,
    generatedSessions,
    selectedZoomId,
    selectedZoom,
    canGenerateZooms,
    hasAutomaticZooms,
    addZoomAtTime,
    generateZooms,
    ensureAutomaticZooms,
    updateZoom,
    previewZoomEdge,
    trimZoomEdge,
    previewMoveZoom,
    moveZoom,
    previewZoom,
    deleteSelectedZoom,
  };
}

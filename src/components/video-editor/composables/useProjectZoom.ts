import { computed, ref, watch, type Ref } from 'vue';
import type { ProjectEditorData } from '../../../api/types/capture-api';
import {
  DEFAULT_ZOOM_DURATION_MS,
  DEFAULT_ZOOM_MOTION_BLUR,
  DEFAULT_ZOOM_PROJECTION,
  DEFAULT_ZOOM_TILT_INTENSITY,
  DEFAULT_ZOOM_TILT_HORIZONTAL,
  DEFAULT_ZOOM_TILT_VERTICAL,
  DEFAULT_ZOOM_TILT_PRESET,
  normalizeZoomMotionBlur,
  type ZoomElement,
  type ZoomMotionBlurSettings,
} from '../zoom/zoom-types';
import { buildAutomaticZoomElements, ZOOM_ALGORITHM_VERSION } from '../zoom/zoom-suggestions';
import { pasteZoomAt } from '../zoom/zoom-paste';
import { fitZoomPlacement } from '../zoom/zoom-placement';
import type { EditorPreferenceDefaults } from './editor-default-types';

export function useProjectZoom(options: {
  editorData: Ref<ProjectEditorData | null | undefined>;
  durationMs: Ref<number>;
  activeTab: Ref<string>;
  editorDefaults: Ref<EditorPreferenceDefaults>;
}) {
  const { editorData, durationMs, activeTab } = options;
  const zoomElements = ref<ZoomElement[]>([]);
  const generatedSessions = ref<ProjectEditorData['zoom']['generatedSessions']>([]);
  const zoomMotionBlur = ref<ZoomMotionBlurSettings>({ ...DEFAULT_ZOOM_MOTION_BLUR });
  const selectedZoomId = ref<string | null>(null);
  const selectedZoom = computed(
    () => zoomElements.value.find((element) => element.id === selectedZoomId.value) ?? null,
  );
  const canGenerateZooms = computed(() => Boolean(editorData.value?.cursor.available && editorData.value.sessionId));
  const hasAutomaticZooms = computed(() => zoomElements.value.some((element) => element.mode === 'auto'));

  const addZoomAtTime = (request: number | { startMs: number; durationMs: number }) => {
    const requestedStartMs = typeof request === 'number' ? request : request.startMs;
    if (!Number.isFinite(requestedStartMs)) return;
    if (requestedStartMs >= durationMs.value) return;
    const defaults = options.editorDefaults.value.zoom;
    const preferredDurationMs =
      typeof request === 'number'
        ? Math.max(200, defaults?.durationMs ?? DEFAULT_ZOOM_DURATION_MS)
        : Math.max(200, request.durationMs);
    const placement = fitZoomPlacement({
      anchorMs: Math.max(0, requestedStartMs) + preferredDurationMs / 2,
      preferredDurationMs,
      timelineDurationMs: durationMs.value,
      occupied: zoomElements.value,
    });
    if (!placement) return;
    const zoom: ZoomElement = {
      id: crypto.randomUUID(),
      sessionId: editorData.value?.sessionId ?? 'manual',
      startMs: placement.startMs,
      endMs: placement.endMs,
      depth: defaults?.depth ?? 2,
      mode: defaults?.mode ?? 'manual',
      projection: defaults?.projection ?? DEFAULT_ZOOM_PROJECTION,
      tiltIntensity: defaults?.tiltIntensity ?? DEFAULT_ZOOM_TILT_INTENSITY,
      tiltHorizontal: defaults?.tiltHorizontal ?? DEFAULT_ZOOM_TILT_HORIZONTAL,
      tiltVertical: defaults?.tiltVertical ?? DEFAULT_ZOOM_TILT_VERTICAL,
      tiltPreset: defaults?.tiltPreset ?? DEFAULT_ZOOM_TILT_PRESET,
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
    deleteZoomById(selectedZoomId.value);
  };
  const deleteZoomById = (id: string) => {
    zoomElements.value = zoomElements.value.filter((element) => element.id !== id);
    if (selectedZoomId.value === id) {
      selectedZoomId.value = null;
    }
  };
  const previewMoveZoom = (id: string, startMs: number, endMs: number) => {
    zoomElements.value = zoomElements.value.map((element) =>
      element.id === id ? { ...element, startMs, endMs } : element,
    );
  };
  const moveZoom = previewMoveZoom;
  const updateZoomMotionBlur = (value: ZoomMotionBlurSettings) => {
    zoomMotionBlur.value = normalizeZoomMotionBlur(value);
  };
  const pasteZoomAtTime = (copiedZoom: ZoomElement, startMs: number) => {
    const pasted = pasteZoomAt(zoomElements.value, copiedZoom, startMs, durationMs.value);
    zoomElements.value = pasted.elements;
    selectedZoomId.value = pasted.zoomId;
    activeTab.value = 'zoom';
    return zoomElements.value.find((zoom) => zoom.id === pasted.zoomId)!;
  };

  return {
    zoomElements,
    generatedSessions,
    zoomMotionBlur,
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
    updateZoomMotionBlur,
    pasteZoomAtTime,
    previewZoom,
    deleteSelectedZoom,
    deleteZoomById,
  };
}

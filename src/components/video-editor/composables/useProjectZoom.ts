import { ref, computed, watch, type Ref } from "vue";
import { capture } from "../../../api/capture";
import type { CaptureProject, ProjectEditorData } from "../../../api/types/capture-api";
import type { ZoomElement } from "../zoom/zoom-types";
import {
  buildAutomaticZoomElements,
  ZOOM_ALGORITHM_VERSION,
} from "../zoom/zoom-suggestions";

export function useProjectZoom(options: {
  project: Ref<CaptureProject | null | undefined>;
  editorData: Ref<ProjectEditorData | null | undefined>;
  durationMs: Ref<number>;
  activeTab: Ref<string>;
}) {
  const { project, editorData, durationMs, activeTab } = options;

  const zoomElements = ref<ZoomElement[]>([]);
  const generatedSessions = ref<ProjectEditorData["zoom"]["generatedSessions"]>(
    [],
  );
  const selectedZoomId = ref<string | null>(null);

  const selectedZoom = computed(
    () =>
      zoomElements.value.find((element) => element.id === selectedZoomId.value) ??
      null,
  );

  const canGenerateZooms = computed(() =>
    Boolean(
      project.value &&
      editorData.value?.cursor.available &&
      editorData.value.sessionId,
    ),
  );

  const hasAutomaticZooms = computed(() =>
    zoomElements.value.some((element) => element.mode === "auto"),
  );

  watch(
    () => editorData.value,
    (data) => {
      zoomElements.value = data?.zoom.elements ?? [];
      generatedSessions.value = data?.zoom.generatedSessions ?? [];
      selectedZoomId.value = null;
    },
    { immediate: true },
  );

  const saveZoomState = async () => {
    if (!project.value) return;
    const zoom = await capture.saveProjectZoomState(project.value.id, {
      elements: JSON.parse(JSON.stringify(zoomElements.value)),
      generatedSessions: JSON.parse(JSON.stringify(generatedSessions.value)),
    });
    zoomElements.value = zoom.elements;
    generatedSessions.value = zoom.generatedSessions;
  };

  const addZoomAtTime = async (startMs: number) => {
    if (!project.value) return;
    if (!Number.isFinite(startMs)) return;
    const clampedStartMs = Math.max(0, Math.min(durationMs.value, Math.round(startMs)));
    if (clampedStartMs >= durationMs.value) return;
    const newZoom: ZoomElement = {
      id: crypto.randomUUID(),
      sessionId: editorData.value?.sessionId ?? "manual",
      startMs: clampedStartMs,
      endMs: Math.min(durationMs.value, clampedStartMs + 1200),
      depth: 2,
      mode: "manual",
      focus: { cx: 0.5, cy: 0.5 },
    };
    zoomElements.value.push(newZoom);
    await saveZoomState();
    selectedZoomId.value = newZoom.id;
    activeTab.value = "zoom";
  };

  const generateZooms = async (automatic = false) => {
    const data = editorData.value;
    if (!data || !project.value || !data.cursor.available) return;
    const sessionDurationMs = data.manifest.durationNs / 1_000_000;
    const generated = buildAutomaticZoomElements({
      telemetry: data.cursor.telemetry,
      sessionId: data.sessionId,
      durationMs: sessionDurationMs,
      reserved: zoomElements.value.filter((element) => element.mode === "manual"),
    });
    zoomElements.value = [
      ...zoomElements.value.filter(
        (element) =>
          element.sessionId !== data.sessionId || element.mode !== "auto",
      ),
      ...generated,
    ];
    generatedSessions.value = [
      ...generatedSessions.value.filter(
        (record) => record.sessionId !== data.sessionId,
      ),
      {
        sessionId: data.sessionId,
        algorithmVersion: ZOOM_ALGORITHM_VERSION,
        generatedAt: new Date().toISOString(),
      },
    ];
    selectedZoomId.value = generated[0]?.id ?? null;
    await saveZoomState();
    if (automatic) activeTab.value = "zoom";
  };

  watch(
    () => editorData.value?.sessionId,
    (sessionId) => {
      if (
        !sessionId ||
        !editorData.value ||
        generatedSessions.value.some(
          (record) =>
            record.sessionId === sessionId &&
            record.algorithmVersion >= ZOOM_ALGORITHM_VERSION,
        )
      )
        return;
      void generateZooms(true).catch((error) =>
        console.error("Failed to generate zooms:", error),
      );
    },
    { immediate: true },
  );

  const updateZoom = (next: ZoomElement) => {
    if (next.startMs < 0 || next.endMs <= next.startMs) return;
    zoomElements.value = zoomElements.value.map((element) =>
      element.id === next.id ? next : element,
    );
    void saveZoomState().catch((error) =>
      console.error("Failed to save zoom:", error),
    );
  };

  const previewZoomEdge = (
    id: string,
    edge: "start" | "end",
    timeMs: number,
  ) => {
    zoomElements.value = zoomElements.value.map((element) => {
      if (element.id !== id) return element;
      if (edge === "start") {
        const clamped = Math.max(0, Math.min(element.endMs - 200, Math.round(timeMs)));
        return { ...element, startMs: clamped };
      } else {
        const clamped = Math.max(element.startMs + 200, Math.round(timeMs));
        return { ...element, endMs: clamped };
      }
    });
  };

  const trimZoomEdge = async (
    id: string,
    edge: "start" | "end",
    timeMs: number,
  ) => {
    previewZoomEdge(id, edge, timeMs);
    await saveZoomState();
  };

  const previewZoom = (next: ZoomElement) => {
    if (next.startMs < 0 || next.endMs <= next.startMs) return;
    zoomElements.value = zoomElements.value.map((element) =>
      element.id === next.id ? next : element,
    );
  };

  const deleteSelectedZoom = () => {
    if (!selectedZoomId.value) return;
    zoomElements.value = zoomElements.value.filter(
      (element) => element.id !== selectedZoomId.value,
    );
    selectedZoomId.value = null;
    void saveZoomState().catch((error) =>
      console.error("Failed to delete zoom:", error),
    );
  };

  const previewMoveZoom = (id: string, startMs: number, endMs: number) => {
    zoomElements.value = zoomElements.value.map((element) =>
      element.id === id ? { ...element, startMs, endMs } : element,
    );
  };

  const moveZoom = async (id: string, startMs: number, endMs: number) => {
    previewMoveZoom(id, startMs, endMs);
    await saveZoomState();
  };

  return {
    zoomElements,
    generatedSessions,
    selectedZoomId,
    selectedZoom,
    canGenerateZooms,
    hasAutomaticZooms,
    saveZoomState,
    addZoomAtTime,
    generateZooms,
    updateZoom,
    previewZoomEdge,
    trimZoomEdge,
    previewMoveZoom,
    moveZoom,
    previewZoom,
    deleteSelectedZoom,
  };
}

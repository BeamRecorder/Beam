import { computed, onMounted, onUnmounted, ref } from "vue";
import type { ClipComposition } from "../composition/composition-types";
import type { ZoomElement } from "../zoom/zoom-types";
import type { OutputCanvasSettings } from "../canvas/output-canvas";
import type { BackgroundValue } from "./backgroundCatalog";

export type HistoryActionType = "undo" | "redo";
export interface HistoryAction { type: HistoryActionType; timestamp: number }
export interface EditorStateSnapshot {
  composition: ClipComposition;
  zoomElements: ZoomElement[];
  outputCanvas: OutputCanvasSettings;
  selectedBackground: BackgroundValue | null;
  backgroundBlurPercent: number;
}
export const MAX_HISTORY_DEPTH = 20;
const cloneSnapshot = (snapshot: EditorStateSnapshot): EditorStateSnapshot => structuredClone(snapshot);

export function useEditorUndoRedo(options: {
  onRestoreSnapshot: (snapshot: EditorStateSnapshot) => void;
  initialHistory?: { undo: EditorStateSnapshot[]; redo: EditorStateSnapshot[] };
  onHistoryChange?: (history: { undo: EditorStateSnapshot[]; redo: EditorStateSnapshot[] }) => void;
}) {
  const undoStack = ref((options.initialHistory?.undo ?? []).slice(-MAX_HISTORY_DEPTH).map(cloneSnapshot));
  const redoStack = ref((options.initialHistory?.redo ?? []).slice(-MAX_HISTORY_DEPTH).map(cloneSnapshot));
  const lastAction = ref<HistoryAction | null>(null);
  let isRestoring = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const canUndo = computed(() => undoStack.value.length > 1);
  const canRedo = computed(() => redoStack.value.length > 0);
  const notifyHistoryChange = () => options.onHistoryChange?.({ undo: undoStack.value.map(cloneSnapshot), redo: redoStack.value.map(cloneSnapshot) });
  const cancelPending = () => { if (debounceTimer) clearTimeout(debounceTimer); debounceTimer = null; };

  const recordSnapshot = (snapshot: EditorStateSnapshot, debounceMs = 0) => {
    if (isRestoring) return;
    const execute = () => {
      const cloned = cloneSnapshot(snapshot);
      const current = undoStack.value.at(-1);
      if (current && JSON.stringify(current) === JSON.stringify(cloned)) return;
      undoStack.value.push(cloned);
      if (undoStack.value.length > MAX_HISTORY_DEPTH) undoStack.value.shift();
      redoStack.value = [];
      notifyHistoryChange();
    };
    cancelPending();
    if (debounceMs > 0) debounceTimer = setTimeout(() => { debounceTimer = null; execute(); }, debounceMs);
    else execute();
  };
  const undo = () => {
    if (!canUndo.value) return;
    cancelPending();
    isRestoring = true;
    const current = undoStack.value.pop();
    if (current) redoStack.value.push(current);
    const previous = undoStack.value.at(-1);
    if (previous) options.onRestoreSnapshot(cloneSnapshot(previous));
    isRestoring = false;
    notifyHistoryChange();
    lastAction.value = { type: "undo", timestamp: Date.now() };
  };
  const redo = () => {
    if (!canRedo.value) return;
    cancelPending();
    isRestoring = true;
    const next = redoStack.value.pop();
    if (next) {
      const cloned = cloneSnapshot(next);
      undoStack.value.push(cloned);
      options.onRestoreSnapshot(cloned);
    }
    isRestoring = false;
    notifyHistoryChange();
    lastAction.value = { type: "redo", timestamp: Date.now() };
  };
  const replaceHistory = (history: { undo: EditorStateSnapshot[]; redo: EditorStateSnapshot[] }) => {
    undoStack.value = history.undo.slice(-MAX_HISTORY_DEPTH).map(cloneSnapshot);
    redoStack.value = history.redo.slice(-MAX_HISTORY_DEPTH).map(cloneSnapshot);
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    const active = document.activeElement;
    const tag = active?.tagName.toLowerCase();
    if (["input", "textarea", "select"].includes(tag ?? "") || active?.getAttribute("contenteditable") === "true") return;
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    else if (event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
  };
  onMounted(() => window.addEventListener("keydown", handleKeyDown));
  onUnmounted(() => { window.removeEventListener("keydown", handleKeyDown); cancelPending(); });
  return { undoStack, redoStack, canUndo, canRedo, lastAction, recordSnapshot, undo, redo, replaceHistory };
}

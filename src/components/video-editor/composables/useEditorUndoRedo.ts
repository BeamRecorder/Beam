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
const MAX_HISTORY_DEPTH = 50;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function useEditorUndoRedo(options: { onRestoreSnapshot: (snapshot: EditorStateSnapshot) => void | Promise<void> }) {
  const undoStack = ref<EditorStateSnapshot[]>([]);
  const redoStack = ref<EditorStateSnapshot[]>([]);
  const lastAction = ref<HistoryAction | null>(null);
  let restoring = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const canUndo = computed(() => undoStack.value.length > 1);
  const canRedo = computed(() => redoStack.value.length > 0);
  const cancel = () => { if (timer) clearTimeout(timer); timer = null; };
  const recordSnapshot = (snapshot: EditorStateSnapshot, debounceMs = 0) => {
    if (restoring) return;
    const record = () => {
      const next = clone(snapshot);
      const current = undoStack.value.at(-1);
      if (current && JSON.stringify(current) === JSON.stringify(next)) return;
      undoStack.value.push(next);
      if (undoStack.value.length > MAX_HISTORY_DEPTH) undoStack.value.shift();
      redoStack.value = [];
    };
    cancel();
    if (debounceMs > 0) timer = setTimeout(() => { timer = null; record(); }, debounceMs);
    else record();
  };
  const undo = async () => {
    if (!canUndo.value) return;
    cancel();
    restoring = true;
    const current = undoStack.value.pop();
    if (current) redoStack.value.push(current);
    const previous = undoStack.value.at(-1);
    if (previous) await options.onRestoreSnapshot(clone(previous));
    restoring = false;
    lastAction.value = { type: "undo", timestamp: Date.now() };
  };
  const redo = async () => {
    if (!canRedo.value) return;
    cancel();
    restoring = true;
    const next = redoStack.value.pop();
    if (next) { const restored = clone(next); undoStack.value.push(restored); await options.onRestoreSnapshot(restored); }
    restoring = false;
    lastAction.value = { type: "redo", timestamp: Date.now() };
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    const active = document.activeElement;
    if (active) {
      const tag = active.tagName.toLowerCase();
      if (["input", "textarea", "select"].includes(tag) || active.getAttribute("contenteditable") === "true") return;
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === "z") { event.preventDefault(); void (event.shiftKey ? redo() : undo()); }
    else if (event.key.toLowerCase() === "y") { event.preventDefault(); void redo(); }
  };
  onMounted(() => window.addEventListener("keydown", handleKeyDown));
  onUnmounted(() => { window.removeEventListener("keydown", handleKeyDown); cancel(); });
  return { undoStack, redoStack, canUndo, canRedo, lastAction, recordSnapshot, undo, redo };
}

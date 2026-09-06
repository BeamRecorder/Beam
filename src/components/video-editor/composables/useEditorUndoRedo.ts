import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { ClipComposition } from '~/media/shared/composition-types';
import type { ZoomAutoFollowSettings, ZoomElement, ZoomMotionBlurSettings } from '../zoom/zoom-types';
import type { OutputCanvasSettings } from '../canvas/output-canvas';
import type { BackgroundValue } from './backgroundCatalog';

export type HistoryActionType = 'undo' | 'redo';
export interface HistoryAction {
  type: HistoryActionType;
  timestamp: number;
}
export interface EditorStateSnapshot {
  composition: ClipComposition;
  zoomElements: ZoomElement[];
  zoomMotionBlur?: ZoomMotionBlurSettings;
  zoomAutoFollow?: ZoomAutoFollowSettings;
  outputCanvas: OutputCanvasSettings;
  selectedBackground: BackgroundValue | null;
  backgroundBlurPercent: number;
}
const MAX_HISTORY_DEPTH = 50;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
type SnapshotSource = EditorStateSnapshot | (() => EditorStateSnapshot);

export function useEditorUndoRedo(options: {
  onRestoreSnapshot: (snapshot: EditorStateSnapshot) => void | Promise<void>;
}) {
  const undoStack = ref<EditorStateSnapshot[]>([]);
  const redoStack = ref<EditorStateSnapshot[]>([]);
  const lastAction = ref<HistoryAction | null>(null);
  let restoring = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingSnapshot: SnapshotSource | null = null;

  const canUndo = computed(() => undoStack.value.length > 1);
  const canRedo = computed(() => redoStack.value.length > 0);
  const resolveSnapshot = (source: SnapshotSource) => (typeof source === 'function' ? source() : source);

  const recordImmediate = (snapshot: EditorStateSnapshot) => {
    if (restoring) return;
    const next = clone(snapshot);
    const current = undoStack.value.at(-1);
    if (current && JSON.stringify(current) === JSON.stringify(next)) return;
    undoStack.value.push(next);
    if (undoStack.value.length > MAX_HISTORY_DEPTH) undoStack.value.shift();
    redoStack.value = [];
  };

  const flushPending = () => {
    if (timer && pendingSnapshot) {
      clearTimeout(timer);
      timer = null;
      const snapshot = resolveSnapshot(pendingSnapshot);
      pendingSnapshot = null;
      recordImmediate(snapshot);
    }
  };

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingSnapshot = null;
  };

  const recordSnapshot = (snapshot: SnapshotSource, debounceMs = 0) => {
    if (restoring) return;
    if (debounceMs > 0) {
      pendingSnapshot = snapshot;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const pending = pendingSnapshot;
        pendingSnapshot = null;
        if (pending) recordImmediate(resolveSnapshot(pending));
      }, debounceMs);
    } else {
      cancel();
      recordImmediate(resolveSnapshot(snapshot));
    }
  };

  const commitNow = (snapshot: EditorStateSnapshot) => {
    cancel();
    recordImmediate(snapshot);
  };

  const undo = async () => {
    flushPending();
    if (!canUndo.value) return;
    cancel();
    restoring = true;
    try {
      const current = undoStack.value.pop();
      if (current) redoStack.value.push(current);
      const previous = undoStack.value.at(-1);
      if (previous) await options.onRestoreSnapshot(clone(previous));
      lastAction.value = { type: 'undo', timestamp: Date.now() };
    } finally {
      restoring = false;
    }
  };

  const redo = async () => {
    flushPending();
    if (!canRedo.value) return;
    cancel();
    restoring = true;
    try {
      const next = redoStack.value.pop();
      if (next) {
        const restored = clone(next);
        undoStack.value.push(restored);
        await options.onRestoreSnapshot(restored);
      }
      lastAction.value = { type: 'redo', timestamp: Date.now() };
    } finally {
      restoring = false;
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const active = document.activeElement;
    if (active) {
      const tag = active.tagName.toLowerCase();
      const editingInput = tag === 'input' && (active as HTMLInputElement).type !== 'range';
      if (editingInput || ['textarea', 'select'].includes(tag) || active.getAttribute('contenteditable') === 'true')
        return;
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault();
      void (event.shiftKey ? redo() : undo());
    } else if (event.key.toLowerCase() === 'y') {
      event.preventDefault();
      void redo();
    }
  };

  onMounted(() => window.addEventListener('keydown', handleKeyDown));
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown);
    cancel();
  });

  return { undoStack, redoStack, canUndo, canRedo, lastAction, recordSnapshot, commitNow, undo, redo };
}

import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import type { SnapshotHistory } from '~/media/shared/editor-history-types';
import type { EditorHistoryOptions, EditorStateSnapshot, HistoryAction, SnapshotSource } from './editor-history-types';
export type { EditorStateSnapshot, HistoryAction, HistoryActionType } from './editor-history-types';

export const MAX_HISTORY_DEPTH = 50;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function useEditorUndoRedo<T extends object = EditorStateSnapshot>(options: EditorHistoryOptions<T>) {
  const undoStack = shallowRef<T[]>([]);
  const redoStack = shallowRef<T[]>([]);
  const lastAction = ref<HistoryAction | null>(null);
  const restoring = ref(false);
  const pending = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingSnapshot: SnapshotSource<T> | null = null;
  const available = () => !restoring.value && !options.disabled?.();
  const canUndo = computed(() => available() && (undoStack.value.length > 1 || pending.value));
  const canRedo = computed(() => available() && redoStack.value.length > 0);
  const resolveSnapshot = (source: SnapshotSource<T>) => (typeof source === 'function' ? source() : source);

  const recordImmediate = (snapshot: T) => {
    if (restoring.value) return;
    const next = clone(snapshot);
    if (same(undoStack.value.at(-1), next)) return;
    undoStack.value = [...undoStack.value, next].slice(-MAX_HISTORY_DEPTH);
    redoStack.value = [];
  };
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingSnapshot = null;
    pending.value = false;
  };
  const flushPending = () => {
    const source = pendingSnapshot;
    cancel();
    if (source) recordImmediate(resolveSnapshot(source));
  };
  const recordSnapshot = (snapshot: SnapshotSource<T>, debounceMs = 0) => {
    if (restoring.value) return;
    cancel();
    if (debounceMs > 0) {
      pendingSnapshot = snapshot;
      pending.value = true;
      timer = setTimeout(flushPending, debounceMs);
    } else recordImmediate(resolveSnapshot(snapshot));
  };
  const commitNow = (snapshot: T) => recordSnapshot(snapshot);
  const initialize = (snapshot: T, history?: SnapshotHistory<T>) => {
    cancel();
    const valid =
      history?.version === 1 &&
      Array.isArray(history.undo) &&
      Array.isArray(history.redo) &&
      history.undo.length > 0 &&
      history.undo.length + history.redo.length <= MAX_HISTORY_DEPTH &&
      same(history.undo.at(-1), snapshot);
    undoStack.value = valid ? clone(history.undo) : [clone(snapshot)];
    redoStack.value = valid ? clone(history.redo) : [];
    lastAction.value = null;
  };
  const serialize = (): SnapshotHistory<T> => {
    flushPending();
    return clone({ version: 1, undo: undoStack.value, redo: redoStack.value });
  };
  const restore = async (type: 'undo' | 'redo') => {
    if (!available()) return;
    flushPending();
    const undo = undoStack.value,
      redo = redoStack.value;
    const snapshot = type === 'undo' ? undo.at(-2) : redo.at(-1);
    if (!snapshot) return;
    restoring.value = true;
    try {
      await options.onRestoreSnapshot(clone(snapshot));
      undoStack.value = type === 'undo' ? undo.slice(0, -1) : [...undo, clone(snapshot)];
      redoStack.value = type === 'undo' ? [...redo, undo[undo.length - 1]!] : redo.slice(0, -1);
      lastAction.value = { type, timestamp: Date.now() };
    } finally {
      restoring.value = false;
    }
  };
  const undo = () => restore('undo');
  const redo = () => restore('redo');
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.altKey || !available()) return;
    const active = document.activeElement;
    if (
      active?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="dialog"]') ||
      document.querySelector('[role="dialog"][aria-modal="true"]')
    )
      return;
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key !== 'z' && key !== 'y') return;
    event.preventDefault();
    void (key === 'y' || event.shiftKey ? redo() : undo());
  };
  onMounted(() => window.addEventListener('keydown', handleKeyDown));
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown);
    cancel();
  });
  return {
    undoStack,
    redoStack,
    canUndo,
    canRedo,
    lastAction,
    restoring,
    initialize,
    serialize,
    recordSnapshot,
    commitNow,
    undo,
    redo,
  };
}

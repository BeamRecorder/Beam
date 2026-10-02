import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import type { SnapshotHistory } from '@beam/engine/shared/editor-history-types';
import type {
  EditorHistoryOptions,
  EditorStateSnapshot,
  SnapshotSource,
  SnapshotOwnership,
} from './editor-history-types';
export type { EditorStateSnapshot, HistoryAction, HistoryActionType } from './editor-history-types';

import { createSnapshotHistory } from '@beam/engine/history/snapshot-history';
export { MAX_HISTORY_DEPTH } from '@beam/engine/history/snapshot-history';

export function useEditorUndoRedo<T extends object = EditorStateSnapshot>(options: EditorHistoryOptions<T>) {
  const history = createSnapshotHistory(options);
  const state = shallowRef(history.state);
  const unsubscribe = history.subscribe(() => {
    state.value = history.state;
  });
  const undoStack = computed(() => state.value.undo);
  const redoStack = computed(() => state.value.redo);
  const lastAction = computed(() => state.value.lastAction);
  const restoring = computed(() => state.value.restoring);
  const pending = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingSnapshot: SnapshotSource<T> | null = null;
  const available = () => !restoring.value && !options.disabled?.();
  const canUndo = computed(() => available() && (undoStack.value.length > 1 || pending.value));
  const canRedo = computed(() => available() && redoStack.value.length > 0);
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingSnapshot = null;
    pending.value = false;
  };
  const flushPending = () => {
    const source = pendingSnapshot;
    cancel();
    if (source) history.record(typeof source === 'function' ? source() : source);
  };
  const recordSnapshot = (snapshot: SnapshotSource<T>, debounceMs = 0) => {
    if (restoring.value) return;
    cancel();
    if (debounceMs > 0) {
      pendingSnapshot = snapshot;
      pending.value = true;
      timer = setTimeout(flushPending, debounceMs);
    } else history.record(typeof snapshot === 'function' ? snapshot() : snapshot);
  };
  const commitNow = (snapshot: T) => recordSnapshot(snapshot);
  const initialize = (snapshot: T, saved?: SnapshotHistory<T>, ownership: SnapshotOwnership = 'copy') => {
    cancel();
    history.initialize(snapshot, saved, ownership);
  };
  const serialize = () => {
    flushPending();
    return history.serialize();
  };
  const undo = () => {
    if (!available()) return Promise.resolve();
    flushPending();
    return history.undo();
  };
  const redo = () => {
    if (!available()) return Promise.resolve();
    flushPending();
    return history.redo();
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.altKey || !available()) return;
    const active = document.activeElement;
    if (
      active?.closest(
        'input:not([type="range"]), textarea, select, [contenteditable="true"], [role="textbox"], [role="dialog"]',
      ) ||
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
    unsubscribe();
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

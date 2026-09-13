import { computed, onMounted, onScopeDispose, ref, type Ref } from 'vue';
import { capture } from '~/api/capture';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { CursorPackDescriptor } from '~/api/types/cursor-pack';
import { orderedCursorPacks } from '../properties/cursor/cursor-packs';
import { createScreenshotCursor, screenshotCursorTransform, transformScreenshotCursor } from './screenshot-cursors';
import type { NormalizedTransform } from '~/media/shared/composition-types';
import { initializeScreenshotComposition, insertScreenshotLayer } from './screenshot-layers';
import type { ScreenshotCursorUpdate } from './screenshot-layer-types';

export function useScreenshotCursors(
  state: Ref<ScreenshotState | null>,
  selectedId: Ref<string | null>,
  select: (id: string) => void,
  fail: (error: unknown) => void,
) {
  const imported = ref<CursorPackDescriptor[]>([]);
  const ready = ref(false);
  const packs = computed(() => orderedCursorPacks(imported.value));
  const selected = computed(() => state.value?.cursors?.find((cursor) => cursor.id === selectedId.value));
  let disposed = false;
  let libraryRequest = 0;
  let unsubscribe: (() => void) | undefined;
  const refresh = async () => {
    const request = ++libraryRequest;
    try {
      const next = await capture.listCursorPacks();
      if (!disposed && request === libraryRequest) {
        imported.value = next;
        ready.value = true;
      }
    } catch (error) {
      if (!disposed && request === libraryRequest) {
        ready.value = true;
        fail(error);
      }
    }
  };
  onMounted(() => {
    void refresh();
    unsubscribe = capture.onCursorPacksChanged(() => void refresh());
  });
  onScopeDispose(() => {
    disposed = true;
    unsubscribe?.();
  });
  return {
    packs,
    ready,
    selected,
    registerPack: (pack: CursorPackDescriptor) => {
      libraryRequest++;
      ready.value = true;
      imported.value = [...imported.value.filter((item) => item.id !== pack.id), pack];
    },
    transform: (next: NormalizedTransform) => {
      const cursor = selected.value;
      const asset = packs.value
        .find((pack) => pack.id === cursor?.selection.packId)
        ?.cursors.find((asset) => asset.id === cursor?.selection.cursorId);
      if (cursor && asset && state.value)
        transformScreenshotCursor(cursor, screenshotCursorTransform(cursor, state.value.canvas, asset), next);
    },
    add: (name: string) => {
      if (!state.value) return;
      initializeScreenshotComposition(state.value);
      const cursor = createScreenshotCursor(crypto.randomUUID(), name, packs.value[0]!);
      state.value.cursors!.push(cursor);
      insertScreenshotLayer(state.value, cursor.id);
      select(cursor.id);
    },
    update: (patch: ScreenshotCursorUpdate) => {
      const cursor = selected.value;
      if (!cursor) return;
      const { selection, ...style } = patch;
      Object.assign(cursor, style);
      if (selection) {
        const pack = packs.value.find((pack) => pack.id === selection.packId);
        if (pack)
          cursor.selection = { packId: pack.id, mode: 'fixed', cursorId: selection.cursorId ?? pack.defaultCursorId };
      }
    },
  };
}

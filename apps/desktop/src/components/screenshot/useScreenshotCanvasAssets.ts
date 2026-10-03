import { onBeforeUnmount, shallowRef, watch } from 'vue';
import { loadScreenshotAssets } from './screenshot-render';
import { createScreenshotImageLoader } from '@beam/runtime/screenshot/screenshot-image-loader';
import type { ScreenshotRenderAssets } from '@beam/runtime/screenshot/screenshot-types';
import type { ScreenshotCanvasProps } from './screenshot-canvas-contract-types';
import { injectScreenshotStartup } from './loading/screenshot-startup-context';

/** Asset reloads depend on resource identities, not placement, text or unrelated library changes. */
export function useScreenshotCanvasAssets(
  props: ScreenshotCanvasProps,
  paint: () => void,
  fail: (reason: unknown) => void,
) {
  const assets = shallowRef<ScreenshotRenderAssets | null>(null);
  const loadImage = createScreenshotImageLoader();
  const startup = injectScreenshotStartup();
  let generation = 0,
    loaded = 0;
  watch(
    () => {
      const state = props.state;
      const cursors = state.cursors?.filter((cursor) => cursor.enabled) ?? [];
      return JSON.stringify([
        props.source,
        state.canvas.showBackground && state.background?.kind === 'image' ? state.background.path : null,
        state.canvas.showBackground && state.background?.kind === 'video' ? 'video' : null,
        Boolean(state.canvas.watermark?.enabled && state.canvas.watermark.showLogo),
        state.shapes
          .filter((shape) => shape.enabled && shape.text?.style.fontAssetId)
          .map((shape) => [shape.text?.style.fontAssetId, shape.text?.style.fontFamily]),
        (state.images ?? []).filter((image) => image.enabled).map((image) => [image.id, image.source]),
        cursors.length
          ? [
              cursors.map((cursor) => [cursor.id, cursor.selection, cursor.color]),
              props.cursorPacks,
              props.cursorPacksReady,
              state.canvas.width,
              state.canvas.height,
            ]
          : null,
      ]);
    },
    async () => {
      const current = ++generation;
      if (
        props.cursorPacksReady === false &&
        props.state.cursors?.some(
          (cursor) => cursor.enabled && !props.cursorPacks?.some((pack) => pack.id === cursor.selection.packId),
        )
      )
        return;
      const started = performance.now();
      try {
        const next = await loadScreenshotAssets(
          props.source,
          props.state,
          props.cursorPacks,
          loadImage,
          (stage, ms) => {
            if (current === generation) startup?.record(stage, ms);
          },
        );
        if (current !== generation) return;
        startup?.record('assets', performance.now() - started);
        assets.value = next;
        loaded = current;
        paint();
      } catch (reason) {
        if (current === generation) fail(reason);
      }
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    generation++;
  });
  return { assets, isReady: () => loaded === generation };
}

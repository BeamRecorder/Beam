import { ref } from 'vue';
import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotRenderAssets } from '@beam/runtime/screenshot/screenshot-types';
import { paintWithAsyncLayerEffects, cancelAsyncLayerEffects } from '@beam/runtime/gradient/async-layer-effects';
import { screenshotHasCpuEffects } from '@beam/runtime/screenshot/screenshot-cpu-effects';
import { drawScreenshot } from '@beam/runtime/screenshot/screenshot-render';
import type { ScreenshotCpuPreviewCallbacks } from './screenshot-cpu-preview-types';

export function createScreenshotCpuPreview(callbacks: ScreenshotCpuPreviewCallbacks) {
  const pending = ref(false);
  let revision = 0,
    context: Canvas2DContext | undefined;
  const dispose = () => {
    ++revision;
    pending.value = false;
    if (context) cancelAsyncLayerEffects(context);
    context = undefined;
  };
  const paint = (
    ctx: Canvas2DContext,
    state: ScreenshotState,
    assets: ScreenshotRenderAssets,
    width: number,
    height: number,
    editingId?: string,
  ) => {
    dispose();
    context = ctx;
    if (!screenshotHasCpuEffects(state)) return false;
    pending.value = true;
    const current = revision,
      snapshot = JSON.parse(JSON.stringify(state)) as ScreenshotState;
    void paintWithAsyncLayerEffects(ctx, (target) => drawScreenshot(target, snapshot, assets, width, height, editingId))
      .then(() => {
        if (current === revision) {
          pending.value = false;
          callbacks.ready();
        }
      })
      .catch((reason: unknown) => {
        if (current !== revision) return;
        pending.value = false;
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) callbacks.error(reason);
      });
    return true;
  };
  return { paint, dispose, pending };
}

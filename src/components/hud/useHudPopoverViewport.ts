import { onBeforeUnmount, provide, ref } from 'vue';
import { capture } from '~/api/capture';
import {
  popoverViewportKey,
  popoverAnchorConstraintKey,
  type PopoverViewport,
} from '~/ui/popover/popover-viewport-types';

const BASE_HEIGHT = 268;
const SHADOW_MARGIN = 16;

export function useHudPopoverViewport(embedded: boolean) {
  const isLinux = capture.platform === 'linux';
  const error = ref('');
  const requests = new Map<string, number>();
  let queue = Promise.resolve();
  let disposed = false;
  let lastHeight = BASE_HEIGHT;
  const update: PopoverViewport = (id, bottom) => {
    if (embedded || isLinux || disposed) return Promise.resolve();
    if (bottom === null) requests.delete(id);
    else requests.set(id, bottom + SHADOW_MARGIN);
    queue = queue.then(async () => {
      const height = Math.ceil(Math.max(BASE_HEIGHT, ...requests.values()));
      if (height === lastHeight) return;
      try {
        await capture.resizeHudPopover(height);
        lastHeight = height;
        error.value = '';
      } catch (reason) {
        error.value = reason instanceof Error ? reason.message : String(reason);
      }
    });
    return queue;
  };
  provide(popoverViewportKey, update);
  provide(popoverAnchorConstraintKey, isLinux);
  onBeforeUnmount(() => {
    disposed = true;
    requests.clear();
    if (!embedded && !isLinux) void updateSizeAfterTeardown();
  });
  async function updateSizeAfterTeardown() {
    try {
      await queue;
      if (lastHeight !== BASE_HEIGHT) await capture.resizeHudPopover(BASE_HEIGHT);
    } catch (error) {
      console.error('Failed to restore HUD popover bounds:', error);
    }
  }
  return { update, error };
}

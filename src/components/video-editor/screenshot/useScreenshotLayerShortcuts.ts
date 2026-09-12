import { onMounted, onScopeDispose } from 'vue';
import type { ScreenshotLayer } from './screenshot-layer-types';

export function useScreenshotLayerShortcuts(
  selected: () => ScreenshotLayer | undefined,
  disabled: () => boolean,
  remove: (id: string) => void,
) {
  const keydown = (event: KeyboardEvent) => {
    if (
      !['Delete', 'Backspace'].includes(event.key) ||
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      disabled()
    )
      return;
    const target = event.target instanceof Element ? event.target : null;
    if (
      target?.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], .popover-content',
      ) ||
      document.querySelector('[role="dialog"][aria-modal="true"]')
    )
      return;
    const layer = selected();
    if (!layer || layer.locked || (!layer.removable && ['image', 'background', 'watermark'].includes(layer.kind)))
      return;
    event.preventDefault();
    remove(layer.id);
  };
  onMounted(() => window.addEventListener('keydown', keydown));
  onScopeDispose(() => window.removeEventListener('keydown', keydown));
}

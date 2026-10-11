import { onBeforeUnmount, ref } from 'vue';
import { capture } from '~/api/capture';

export function useHudPreviewVisibility(embedded: boolean) {
  const visible = ref(false);
  // Chromium reports hidden windows as visible when backgroundThrottling is off.
  // The native window is the authority; recording streams have separate owners.
  if (!embedded) {
    onBeforeUnmount(capture.onWindowVisibility((value) => (visible.value = value)));
  }
  return visible;
}

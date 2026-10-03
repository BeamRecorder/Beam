import { computed, type Ref } from 'vue';
import type { ScreenshotState, ScreenshotZoomLayer } from '@beam/engine/screenshot/screenshot-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import { createManualZoom } from '@beam/engine/zoom/manual-zoom';
import { insertScreenshotLayer } from '@beam/engine/screenshot/screenshot-layers';

export function useScreenshotZooms(
  state: Ref<ScreenshotState | null>,
  selectedId: Ref<string | null>,
  select: (id: string) => void,
  canEdit: () => boolean,
) {
  const selected = computed(() => {
    const zoom = state.value?.zooms?.find((zoom) => zoom.id === selectedId.value);
    if (!zoom) return null;
    return { ...zoom, locked: state.value?.composition?.find((layer) => layer.id === zoom.id)?.locked ?? false };
  });
  const add = (name: string) => {
    if (!state.value || !canEdit()) return;
    const zoom: ScreenshotZoomLayer = {
      ...createManualZoom(crypto.randomUUID(), 0, 1),
      kind: 'zoom',
      name,
      mode: 'manual',
      enabled: true,
    };
    (state.value.zooms ??= []).push(zoom);
    insertScreenshotLayer(state.value, zoom.id);
    select(zoom.id);
  };
  const update = (zoom: ZoomElement) => {
    if (
      !state.value ||
      !canEdit() ||
      !state.value.zooms?.some((current) => current.id === zoom.id) ||
      state.value.composition?.some((layer) => layer.id === zoom.id && layer.locked)
    )
      return;
    state.value.zooms = state.value.zooms?.map((current) =>
      current.id === zoom.id ? { ...current, ...zoom, kind: 'zoom', mode: 'manual', startMs: 0, endMs: 1 } : current,
    );
  };
  return { selected, add, update };
}

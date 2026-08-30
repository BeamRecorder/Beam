import { ref, type Ref } from 'vue';
import type { ClipComposition } from '~/media/shared/composition-types';
import type { ZoomElement } from '../zoom/zoom-types';
import type {
  TimelineItemKind,
  TimelineItemSelectionRequest,
  TrackClipSelection,
  TrackZoomSelection,
} from '../timeline/composables/timeline-tracks-types';

interface SelectionAnchor {
  kind: TimelineItemKind;
  id: string;
}

export function useMixedTimelineSelection(options: {
  composition: Ref<ClipComposition>;
  zoomElements: Ref<ZoomElement[]>;
  selectedClipId: Ref<string | null>;
  selectedClipIds: Ref<string[]>;
  selectedZoomId: Ref<string | null>;
  selectedZoomIds: Ref<string[]>;
  activeTab: Ref<string>;
  openPropertiesPanel: () => void;
}) {
  const anchor = ref<SelectionAnchor | null>(null);

  const setSelection = (clipIds: string[], zoomIds: string[], primary: SelectionAnchor | null) => {
    options.selectedClipIds.value = [...new Set(clipIds)];
    options.selectedZoomIds.value = [...new Set(zoomIds)];
    options.selectedClipId.value =
      primary?.kind === 'clip' && options.selectedClipIds.value.includes(primary.id)
        ? primary.id
        : (options.selectedClipIds.value[0] ?? null);
    options.selectedZoomId.value =
      primary?.kind === 'zoom' && options.selectedZoomIds.value.includes(primary.id)
        ? primary.id
        : (options.selectedZoomIds.value[0] ?? null);
    if (primary) options.activeTab.value = primary.kind === 'clip' ? 'clip' : 'zoom';
  };

  const orderedItems = () =>
    [
      ...options.composition.value.clips.map((clip) => ({
        kind: 'clip' as const,
        id: clip.id,
        startMs: clip.timelineStartMs,
      })),
      ...options.zoomElements.value.map((zoom) => ({ kind: 'zoom' as const, id: zoom.id, startMs: zoom.startMs })),
    ].sort(
      (left, right) =>
        left.startMs - right.startMs || left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id),
    );

  const selectItem = (request: TimelineItemSelectionRequest) => {
    options.openPropertiesPanel();
    const item = { kind: request.kind, id: request.id };
    if (request.intent === 'replace') {
      setSelection(request.kind === 'clip' ? [request.id] : [], request.kind === 'zoom' ? [request.id] : [], item);
      anchor.value = item;
      return;
    }
    if (request.intent === 'toggle') {
      const clipIds = [...options.selectedClipIds.value];
      const zoomIds = [...options.selectedZoomIds.value];
      const ids = request.kind === 'clip' ? clipIds : zoomIds;
      const index = ids.indexOf(request.id);
      if (index >= 0) ids.splice(index, 1);
      else ids.push(request.id);
      setSelection(clipIds, zoomIds, index >= 0 ? null : item);
      anchor.value = item;
      return;
    }
    const items = orderedItems();
    const anchorItem = anchor.value
      ? items.find((candidate) => candidate.kind === anchor.value!.kind && candidate.id === anchor.value!.id)
      : null;
    const targetItem = items.find((candidate) => candidate.kind === request.kind && candidate.id === request.id);
    if (!anchorItem || !targetItem) {
      setSelection(request.kind === 'clip' ? [request.id] : [], request.kind === 'zoom' ? [request.id] : [], item);
      anchor.value = item;
      return;
    }
    const minimum = Math.min(anchorItem.startMs, targetItem.startMs);
    const maximum = Math.max(anchorItem.startMs, targetItem.startMs);
    const range = items.filter((candidate) => candidate.startMs >= minimum && candidate.startMs <= maximum);
    setSelection(
      range.filter((candidate) => candidate.kind === 'clip').map((candidate) => candidate.id),
      range.filter((candidate) => candidate.kind === 'zoom').map((candidate) => candidate.id),
      item,
    );
  };

  const selectAll = () => {
    options.openPropertiesPanel();
    const items = orderedItems();
    const primary = items[0] ?? null;
    setSelection(
      items.filter((item) => item.kind === 'clip').map((item) => item.id),
      items.filter((item) => item.kind === 'zoom').map((item) => item.id),
      primary,
    );
    anchor.value = primary;
  };

  const selectClipTrack = (selection: TrackClipSelection) => {
    options.openPropertiesPanel();
    const clipIds = selection.additive ? [...options.selectedClipIds.value, ...selection.clipIds] : selection.clipIds;
    const zoomIds = selection.additive ? options.selectedZoomIds.value : [];
    const primary = selection.primaryClipId ? { kind: 'clip' as const, id: selection.primaryClipId } : null;
    setSelection(clipIds, zoomIds, primary);
    anchor.value = primary;
  };

  const selectZoomTrack = (selection: TrackZoomSelection) => {
    options.openPropertiesPanel();
    const clipIds = selection.additive ? options.selectedClipIds.value : [];
    const zoomIds = selection.additive ? [...options.selectedZoomIds.value, ...selection.zoomIds] : selection.zoomIds;
    const primary = selection.primaryZoomId ? { kind: 'zoom' as const, id: selection.primaryZoomId } : null;
    setSelection(clipIds, zoomIds, primary);
    anchor.value = primary;
  };

  const clearAll = () => {
    setSelection([], [], null);
    anchor.value = null;
  };

  return { selectItem, selectAll, selectClipTrack, selectZoomTrack, clearAll };
}

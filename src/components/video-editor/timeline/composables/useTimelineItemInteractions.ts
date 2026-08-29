import { computed, type ComputedRef } from 'vue';
import type { Clip } from '~/media/shared/composition-types';
import type { ZoomElement } from '../../zoom/zoom-types';
import type {
  TimelineItemKind,
  TimelineSelectionIntent,
  TimelineTracksEmits,
  TimelineTracksProps,
} from './timeline-tracks-types';

interface TimelineItemInteractionsOptions {
  props: TimelineTracksProps;
  emit: TimelineTracksEmits;
  beginClipMove: (event: PointerEvent, clip: Clip) => void;
  beginZoomMove: (event: PointerEvent, zoom: ZoomElement) => void;
}

export interface TimelineItemInteractions {
  selectedClipIdSet: ComputedRef<Set<string>>;
  selectedZoomIdSet: ComputedRef<Set<string>>;
  selectItem: (kind: TimelineItemKind, id: string, event: MouseEvent) => void;
  startClipMove: (event: PointerEvent, clip: Clip) => void;
  startZoomMove: (event: PointerEvent, zoom: ZoomElement) => void;
}

const selectionIntent = (event: MouseEvent): TimelineSelectionIntent =>
  event.shiftKey ? 'range' : event.ctrlKey || event.metaKey ? 'toggle' : 'replace';

export function useTimelineItemInteractions(options: TimelineItemInteractionsOptions): TimelineItemInteractions {
  const selectedClipIdSet = computed(
    () =>
      new Set(
        options.props.selectedClipIds?.length
          ? options.props.selectedClipIds
          : options.props.selectedClipId
            ? [options.props.selectedClipId]
            : [],
      ),
  );
  const selectedZoomIdSet = computed(
    () =>
      new Set(
        options.props.selectedZoomIds?.length
          ? options.props.selectedZoomIds
          : options.props.selectedZoomId
            ? [options.props.selectedZoomId]
            : [],
      ),
  );
  const selectItem = (kind: TimelineItemKind, id: string, event: MouseEvent) =>
    options.emit('select:item', { kind, id, intent: selectionIntent(event) });
  const startClipMove = (event: PointerEvent, clip: Clip) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!selectedClipIdSet.value.has(clip.id)) {
      options.emit('select:item', { kind: 'clip', id: clip.id, intent: 'replace' });
    }
    options.beginClipMove(event, clip);
  };
  const startZoomMove = (event: PointerEvent, zoom: ZoomElement) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!selectedZoomIdSet.value.has(zoom.id)) {
      options.emit('select:item', { kind: 'zoom', id: zoom.id, intent: 'replace' });
    }
    options.beginZoomMove(event, zoom);
  };

  return { selectedClipIdSet, selectedZoomIdSet, selectItem, startClipMove, startZoomMove };
}

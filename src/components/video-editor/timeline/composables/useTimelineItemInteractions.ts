import { recordingMoveSelection } from '../../composition/recording-sidecars';
import { selectionHasLocks } from '../../composition/timeline-locks';
import { computed, onBeforeUnmount, type ComputedRef } from 'vue';
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
  let suppressClick = false;
  let stopTracking = () => {};
  const trackDrag = (start: PointerEvent) => {
    stopTracking();
    suppressClick = false;
    const move = (event: PointerEvent) => {
      if (
        event.pointerId === start.pointerId &&
        Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) >= 4
      )
        suppressClick = true;
    };
    const end = (event: PointerEvent) => {
      if (event.pointerId !== start.pointerId) return;
      if (event.type === 'pointerup') move(event);
      else suppressClick = false;
      stopTracking();
    };
    stopTracking = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  onBeforeUnmount(() => stopTracking());
  const selectItem = (kind: TimelineItemKind, id: string, event: MouseEvent) => {
    if (suppressClick) {
      suppressClick = false;
      if (event.detail !== 0) return;
    }
    options.emit('select:item', { kind, id, intent: selectionIntent(event) });
  };
  const startClipMove = (event: PointerEvent, clip: Clip) => {
    suppressClick = false;
    if (event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    trackDrag(event);
    if (!selectedClipIdSet.value.has(clip.id)) {
      options.emit('select:item', { kind: 'clip', id: clip.id, intent: 'replace' });
    }
    if (
      selectionHasLocks(
        options.props.composition,
        options.props.zoomElements,
        recordingMoveSelection(options.props.composition, options.props.zoomElements, {
          clipIds: selectedClipIdSet.value.has(clip.id) ? [...selectedClipIdSet.value] : [clip.id],
          zoomIds: selectedClipIdSet.value.has(clip.id) ? [...selectedZoomIdSet.value] : [],
        }),
      )
    )
      return;
    options.beginClipMove(event, clip);
  };
  const startZoomMove = (event: PointerEvent, zoom: ZoomElement) => {
    suppressClick = false;
    if (event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    trackDrag(event);
    if (!selectedZoomIdSet.value.has(zoom.id)) {
      options.emit('select:item', { kind: 'zoom', id: zoom.id, intent: 'replace' });
    }
    if (
      selectionHasLocks(
        options.props.composition,
        options.props.zoomElements,
        recordingMoveSelection(options.props.composition, options.props.zoomElements, {
          clipIds: selectedZoomIdSet.value.has(zoom.id) ? [...selectedClipIdSet.value] : [],
          zoomIds: selectedZoomIdSet.value.has(zoom.id) ? [...selectedZoomIdSet.value] : [zoom.id],
        }),
      )
    )
      return;
    options.beginZoomMove(event, zoom);
  };

  return { selectedClipIdSet, selectedZoomIdSet, selectItem, startClipMove, startZoomMove };
}

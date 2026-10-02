import type { ComputedRef } from 'vue';
import type { Clip } from '@beam/engine/shared/composition-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import type { TimelineItemKind, TimelineTracksEmits, TimelineTracksProps } from './timeline-tracks-types';

export interface TimelineItemInteractionsOptions {
  props: TimelineTracksProps;
  emit: TimelineTracksEmits;
  beginClipMove: (event: PointerEvent, clip: Clip) => void;
  beginZoomMove: (event: PointerEvent, zoom: ZoomElement) => void;
}

export interface TimelineItemInteractions {
  selectedClipIdSet: ComputedRef<Set<string>>;
  selectedZoomIdSet: ComputedRef<Set<string>>;
  selectedClipList: ComputedRef<string[]>;
  selectedZoomList: ComputedRef<string[]>;
  selectItem: (kind: TimelineItemKind, id: string, event: MouseEvent) => void;
  startClipMove: (event: PointerEvent, clip: Clip) => void;
  startZoomMove: (event: PointerEvent, zoom: ZoomElement) => void;
}

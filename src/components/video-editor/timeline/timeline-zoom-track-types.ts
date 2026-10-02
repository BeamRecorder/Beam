import type { ZoomElement } from '../zoom/zoom-types';
import type { TimelinePasteHighlight } from './composables/timeline-clipboard-types';
import type { TimelineViewportMetrics } from './composables/timeline-virtualization-types';

export interface TimelineZoomTrackProps {
  zoomElements: ZoomElement[];
  selectedZoomIdSet: Set<string>;
  recentPaste?: TimelinePasteHighlight | null;
  hoverZoomTimeMs: number | null;
  hoverZoomDurationMs: number;
  layoutDurationMs: number;
  rulerLayoutWidth: number;
  viewport: TimelineViewportMetrics;
  percentageStyle: (startMs: number, durationMs: number) => Record<string, string>;
  displayedZoom: (zoom: ZoomElement) => ZoomElement;
  trimStateFor: (id: string) => { edge: 'start' | 'end'; durationMs: number; atLimit?: boolean } | null;
  zoomScale: (depth: number) => number;
  openTrackContextMenu: (event: MouseEvent, kind: 'zoom') => void;
  hoverAt: (event: MouseEvent, kind: 'zoom') => void;
  leaveTrack: (kind: 'zoom') => void;
  addAt: (event: MouseEvent, kind: 'zoom') => void;
  selectItem: (kind: 'zoom', id: string, event: MouseEvent) => void;
  openZoomContextMenu: (event: MouseEvent, zoom: ZoomElement) => void;
  startZoomMove: (event: PointerEvent, zoom: ZoomElement) => void;
  beginZoomTrim: (event: PointerEvent, zoom: ZoomElement, edge: 'start' | 'end') => void;
}

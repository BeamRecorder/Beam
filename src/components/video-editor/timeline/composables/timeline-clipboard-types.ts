import type { Clip, MediaAsset } from '~/media/shared/composition-types';
import type { ZoomElement } from '../../zoom/zoom-types';

export type TimelineItemCategory = 'visual' | 'audio' | 'caption' | 'zoom';

export type TimelineClipboardEntryDescriptor =
  | { kind: 'item'; name: string }
  | { kind: 'caption'; text: string }
  | { kind: 'zoom'; number: number };

export type TimelineClipboardDescriptor =
  | TimelineClipboardEntryDescriptor
  | { kind: 'selection'; items: TimelineClipboardEntryDescriptor[] };

export type TimelineClipboardEntry =
  | {
      type: 'clip';
      category: Exclude<TimelineItemCategory, 'zoom'>;
      clip: Clip;
      asset: MediaAsset | null;
      descriptor: Extract<TimelineClipboardDescriptor, { kind: 'item' | 'caption' }>;
    }
  | {
      type: 'zoom';
      category: 'zoom';
      zoom: ZoomElement;
      descriptor: Extract<TimelineClipboardDescriptor, { kind: 'zoom' }>;
    };

export type TimelineClipboardItem =
  | (TimelineClipboardEntry & { scopeId: string })
  | {
      type: 'selection';
      scopeId: string;
      entries: TimelineClipboardEntry[];
      anchorTimeMs: number;
      primaryIndex: number;
      descriptor: Extract<TimelineClipboardDescriptor, { kind: 'selection' }>;
    };

export interface TimelinePasteTarget {
  category: TimelineItemCategory;
  trackId?: string | null;
  placement?: 'track' | 'new-layer';
}

export interface TimelinePasteRequest {
  item: TimelineClipboardItem;
  timeMs: number;
  target?: TimelinePasteTarget | null;
}

export interface TimelinePasteHighlight {
  type: TimelineClipboardEntry['type'];
  id: string;
  timestamp: number;
}

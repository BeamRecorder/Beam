import type { Clip, MediaAsset } from '~/media/shared/composition-types';
import type { ZoomElement } from '../../zoom/zoom-types';

export type TimelineItemCategory = 'visual' | 'audio' | 'caption' | 'zoom';

export type TimelineClipboardDescriptor =
  | { kind: 'item'; name: string }
  | { kind: 'caption'; text: string }
  | { kind: 'zoom'; number: number };

export type TimelineClipboardItem =
  | {
      type: 'clip';
      scopeId: string;
      category: Exclude<TimelineItemCategory, 'zoom'>;
      clip: Clip;
      asset: MediaAsset | null;
      descriptor: Exclude<TimelineClipboardDescriptor, { kind: 'zoom' }>;
    }
  | {
      type: 'zoom';
      scopeId: string;
      category: 'zoom';
      zoom: ZoomElement;
      descriptor: Extract<TimelineClipboardDescriptor, { kind: 'zoom' }>;
    };

export interface TimelinePasteTarget {
  category: TimelineItemCategory;
  trackId?: string | null;
}

export interface TimelinePasteRequest {
  item: TimelineClipboardItem;
  timeMs: number;
  target?: TimelinePasteTarget | null;
}

export interface TimelinePasteHighlight {
  type: TimelineClipboardItem['type'];
  id: string;
  timestamp: number;
}

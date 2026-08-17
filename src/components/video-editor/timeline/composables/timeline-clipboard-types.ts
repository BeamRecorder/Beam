import type { Clip, MediaAsset } from '~/media/shared/composition-types';
import type { ZoomElement } from '../../zoom/zoom-types';

export type TimelineItemCategory = 'visual' | 'audio' | 'caption' | 'zoom';

export type TimelineClipboardItem =
  | {
      type: 'clip';
      scopeId: string;
      category: Exclude<TimelineItemCategory, 'zoom'>;
      clip: Clip;
      asset: MediaAsset | null;
    }
  | { type: 'zoom'; scopeId: string; category: 'zoom'; zoom: ZoomElement };

export interface TimelinePasteTarget {
  category: TimelineItemCategory;
  trackId?: string | null;
}

export interface TimelinePasteRequest {
  item: TimelineClipboardItem;
  timeMs: number;
  target?: TimelinePasteTarget | null;
}
